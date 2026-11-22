import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip, gunzipSync, gzip, gzipSync } from 'node:zlib';
import { config } from './config';
import { Store, type ReplaySort } from './db';
import { buildStats, type StatsReport } from './stats';
import { unplayableReason } from '../../src/replay/version';
import { RateLimiter } from './ratelimit';
import { newRun, safeEqual, verifyToken } from './token';
import { validateName } from './names';
import { checkReplay } from './replay-check';
import { QueueFullError, Verifier } from './verifier';
import { APP_COMMIT, APP_VERSION } from '../../src/version';
import { TICK_RATE as TPS } from '../../src/core/config';
import { FROZEN_CORES } from './cores.gen';
import { cmpVersion, groupLabel, simGroup, simKey, simNumber } from './simgroups';
import { injectHead, manifest } from './preview';
import { LEGAL_CSP, legalInfo, legalPage } from './legal';

// OGANESSON-Server: liefert das Spiel aus und stellt die Bestenlisten-API bereit.
// Nur Node-Bordmittel (node:http, node:sqlite, node:worker_threads), mit esbuild gebündelt.

const gunzipAsync = promisify(gunzip);
const gzipAsync = promisify(gzip);
const log = (m: string) => console.log(`[oganesson] ${m}`);

const store = new Store(config.dbPath);
{
  // Einträge aus der Zeit vor der Replay-Spalte mit ihrer Partie aus der Telemetrie verknüpfen
  const b = store.backfillReplays();
  if (b.filled || b.missing) log(`Replays nachgetragen: ${b.filled}, weiter ohne Aufzeichnung: ${b.missing}`);
}
const scale = config.rateScale;
const limits = {
  runs: new RateLimiter(Math.round(12 * scale), 12 * scale),
  scores: new RateLimiter(Math.round(6 * scale), 6 * scale),
  read: new RateLimiter(Math.round(60 * scale), 120 * scale),
  admin: new RateLimiter(Math.round(10 * scale), 10 * scale),
};
const verifier = new Verifier({
  workerFile: new URL('./verify-worker.mjs', import.meta.url),
  workers: config.verifyWorkers,
  timeoutMs: config.verifyTimeout * 1000,
  maxQueue: config.verifyQueue,
});

// ---------------------------------------------------------------- Hilfen

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public headers: Record<string, string> = {}) {
    super(message);
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
    ...headers,
  });
  res.end(data);
}

/**
 * Client-IP für Rate-Limits. Hinter dem eigenen Reverse-Proxy (TRUST_PROXY=1) zählt der LETZTE
 * Eintrag in X-Forwarded-For: den hängt der Proxy selbst an, alles davor kann der Client frei
 * erfinden und damit das Rate-Limit umgehen.
 */
function clientIp(req: IncomingMessage) {
  if (config.trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const raw = Array.isArray(fwd) ? fwd[fwd.length - 1] : fwd;
    const parts = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.socket.remoteAddress ?? 'unbekannt';
}

function limit(kind: keyof typeof limits, req: IncomingMessage) {
  const r = limits[kind].take(clientIp(req));
  if (r !== true) {
    throw new HttpError(429, 'rate_limited', `Zu viele Anfragen. Bitte in ${r} s erneut versuchen.`, { 'Retry-After': String(r) });
  }
}

const tooLarge = () => new HttpError(413, 'too_large', 'Anfrage ist zu groß.');

/** JSON-Body lesen; `Content-Encoding: gzip` ist erlaubt, das Limit gilt auch für den entpackten Inhalt */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'bad_type', 'Erwartet wird JSON.');
  const enc = String(req.headers['content-encoding'] ?? 'identity').toLowerCase();
  if (enc !== 'identity' && enc !== 'gzip') throw new HttpError(415, 'bad_encoding', 'Nur gzip-Komprimierung wird unterstützt.');
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > config.maxBody) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > config.maxBody) throw tooLarge();
    chunks.push(chunk as Buffer);
  }
  let buf = Buffer.concat(chunks);
  if (enc === 'gzip') {
    try {
      buf = await gunzipAsync(buf, { maxOutputLength: config.maxBody });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' || err instanceof RangeError) throw tooLarge();
      throw new HttpError(400, 'bad_gzip', 'Komprimierung ist beschädigt.');
    }
  }
  try {
    const v = JSON.parse(buf.toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'bad_json', 'Ungültiges JSON.');
  }
}

function requireAdmin(req: IncomingMessage) {
  limit('admin', req);
  const auth = String(req.headers.authorization ?? '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!config.adminToken || !token || !safeEqual(token, config.adminToken)) {
    throw new HttpError(401, 'unauthorized', 'Nicht berechtigt.');
  }
}

/** Datum (Europe/Berlin) als YYYY-MM-DD; Uhrzeit wird nicht veröffentlicht */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const berlinDay = (ms: number) => dayFmt.format(new Date(ms));

// ---------------------------------------------------------------- Auslieferung des Spiels

interface CachedFile {
  raw: Buffer;
  gz: Buffer;
  etag: string;
  mtime: number;
  type: string;
}
const cache = new Map<string, CachedFile>();

const makeFile = (raw: Buffer, type: string, mtime = 0): CachedFile => ({
  raw, gz: gzipSync(raw, { level: 9 }), etag: `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"`, mtime, type,
});

/**
 * Datei lesen und gepackt zwischenspeichern; bei geänderter Datei (neuer Build) neu laden.
 * `transform` verändert den Inhalt vor dem Zwischenspeichern (Vorschau-Tags in die Spiel-Seite).
 */
function loadFile(path: string, type: string, transform?: (s: string) => string): CachedFile | null {
  try {
    const mtime = statSync(path).mtimeMs;
    const c = cache.get(path);
    if (c && c.mtime === mtime) return c;
    let raw = readFileSync(path);
    if (transform) raw = Buffer.from(transform(raw.toString('utf8')), 'utf8');
    const f = { raw, gz: gzipSync(raw, { level: 9 }), etag: `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"`, mtime, type };
    cache.set(path, f);
    return f;
  } catch {
    return null;
  }
}

/** Alles steckt in der Datei; nach außen darf die Seite nur mit dem eigenen Server reden */
const PAGE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; " +
  "frame-ancestors 'self'; base-uri 'self'; form-action 'none'; object-src 'none'";

const loadGame = () => loadFile(config.gameFile, 'text/html; charset=utf-8', (html) => injectHead(html, config.publicUrl));

// Icons, Vorschaubilder und Manifest: einmal beim Start geladen, lange gecacht (Cache-Buster ?v=<Version>)
const MIME: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const statics = new Map<string, CachedFile>();
try {
  for (const f of readdirSync(config.publicDir)) {
    const type = MIME[extname(f).toLowerCase()];
    if (type) statics.set(f, makeFile(readFileSync(join(config.publicDir, f)), type));
  }
} catch {
  console.warn(`[oganesson] Ordner mit Icons fehlt: ${config.publicDir}`);
}
statics.set('manifest.webmanifest', makeFile(Buffer.from(manifest(), 'utf8'), 'application/manifest+json; charset=utf-8'));
const STATIC_CACHE = { 'Cache-Control': 'public, max-age=86400' };

const LEGAL = legalInfo(process.env);
const legalFile = makeFile(Buffer.from(legalPage(LEGAL, APP_VERSION, Math.round(config.runMaxAge / 3600)), 'utf8'), 'text/html; charset=utf-8');

const licensesFile = () => join(dirname(config.gameFile), 'third-party-licenses.txt');

function serveFile(req: IncomingMessage, res: ServerResponse, f: CachedFile, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Content-Type': f.type,
    'Cache-Control': 'no-cache',
    ETag: f.etag,
    Vary: 'Accept-Encoding',
    ...extra,
  };
  if (req.headers['if-none-match'] === f.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  const body = gz ? f.gz : f.raw;
  if (gz) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = String(body.length);
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function notBuilt(res: ServerResponse, what: string) {
  res.writeHead(503, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`${what} fehlt (npm run build).`);
}

// ---------------------------------------------------------------- API

/** Neuer Spielstart: Seed vom Server, signiert, nur einmal einlösbar */
function postRun(req: IncomingMessage, res: ServerResponse) {
  limit('runs', req);
  const now = Date.now();
  const { claim, token } = newRun(config.secret, APP_VERSION, now);
  store.addRun(claim.r, claim.s, claim.t);
  send(res, 201, { runId: claim.r, seed: claim.s, token });
}

/**
 * Ergebnis einreichen: { token, name, replay, version? }. Der Server rechnet das Replay nach und
 * übernimmt nur seine eigenen Werte; vom Client gemeldete Punkte usw. werden ignoriert.
 */
async function postScore(req: IncomingMessage, res: ServerResponse) {
  limit('scores', req);
  const body = await readJson(req);
  const claim = verifyToken(config.secret, body.token);
  if (!claim) throw new HttpError(403, 'bad_token', 'Ungültiger Spielstart.');
  const now = Date.now();
  const realMs = now - claim.t;
  if (realMs > config.runMaxAge * 1000) throw new HttpError(403, 'expired', 'Der Spielstart ist zu lange her.');
  if (realMs < 0) throw new HttpError(403, 'bad_token', 'Ungültiger Startzeitpunkt.');

  // Versionsbindung: Replay mit genau der Simulation nachrechnen, mit der gespielt wurde. Nach einem
  // Update rechnet ein eingefrorener Kern (server/cores) ältere Partien nach – der Highscore bleibt gültig.
  const gameVersion = typeof body.version === 'string' ? body.version : claim.v;
  if (gameVersion !== APP_VERSION && !Object.prototype.hasOwnProperty.call(FROZEN_CORES, gameVersion)) {
    throw new HttpError(409, 'version', `Diese Spielversion (v${gameVersion}) kann der Server nicht mehr nachrechnen. Bitte die Seite neu laden.`);
  }

  // Name zuerst prüfen: ein Tippfehler soll den Spielstart nicht verbrauchen
  const name = validateName(body.name);
  if (!name.ok) throw new HttpError(400, 'bad_name', name.message);

  const shape = checkReplay(body.replay, claim.s);
  if (!shape.ok) throw new HttpError(422, 'bad_replay', shape.reason);

  if (!store.consumeRun(claim.r, now)) throw new HttpError(409, 'run_used', 'Dieses Spiel wurde schon eingetragen.');

  // Zeit-Plausibilität vor der Rechnung: das Spiel läuft immer mit 1× (Shop zählt keine Ticks),
  // also kann es nicht mehr Ticks geben, als seit dem Start echte Zeit vergangen ist
  const maxTicks = Math.floor(((realMs / 1000) * config.timeFactor * 1.02 + config.timeTolerance) * TPS);
  let status = 'ok';
  let result = { score: 0, sector: 0, kills: 0, ticks: shape.inputTicks, credits: 0, valid: false, error: undefined as string | undefined };
  let simMs = 0;
  if (shape.inputTicks > maxTicks) {
    status = 'Die Spielzeit ist länger als möglich.';
  } else {
    try {
      const v = await verifier.run(shape.replay, gameVersion);
      result = { ...v.result, error: v.result.error };
      simMs = v.ms;
      if (!result.valid) status = `Replay ungültig: ${result.error ?? 'unbekannter Fehler'}`;
      else if (result.ticks > maxTicks) status = 'Die Spielzeit ist länger als möglich.';
      else if (result.score <= 0) status = 'Ohne Punkte gibt es keinen Eintrag.';
    } catch (err) {
      // Überlastung oder Neustart: Spielstart freigeben, der Client darf es später erneut versuchen
      store.releaseRun(claim.r);
      if (err instanceof QueueFullError) throw new HttpError(503, 'busy', 'Server ist ausgelastet. Bitte gleich noch einmal versuchen.', { 'Retry-After': '10' });
      throw err;
    }
  }

  // Replay einmal packen: für die Telemetrie und (bei Erfolg) für die Wiedergabe am Bestenlisten-Eintrag
  let packed: Buffer | null = null;
  try {
    packed = await gzipAsync(JSON.stringify(shape.replay));
  } catch (err) {
    console.error('[oganesson] Replay nicht gepackt:', err);
  }

  // Telemetrie: jede Einsendung anonym (ohne Name, IP, Run-ID) speichern, auch abgelehnte
  if (config.telemetry && packed) {
    try {
      store.addPlay({
        version: gameVersion, commit: gameVersion === APP_VERSION ? APP_COMMIT : 'alt', seed: claim.s, status,
        score: result.score, sector: result.sector, kills: result.kills, ticks: result.ticks, credits: result.credits,
        realMs, simMs, replay: packed,
      });
    } catch (err) {
      console.error('[oganesson] Telemetrie nicht gespeichert:', err);
    }
  }

  if (status !== 'ok') {
    log(`Einsendung abgelehnt (Seed ${claim.s}): ${status}`);
    throw new HttpError(422, 'implausible', status);
  }

  const id = store.addScore({
    runId: claim.r, name: name.name, score: result.score, sector: result.sector, kills: result.kills,
    ticks: result.ticks, credits: result.credits, version: gameVersion, commit: gameVersion === APP_VERSION ? APP_COMMIT : 'alt',
    replay: packed,
  });
  // Platz innerhalb der Bestenliste der eigenen Sim-Gruppe (so zeigt sie das Spiel), dazu über alle Versionen
  const pos = store.rankOf(id, simGroup(gameVersion, store.versions()))!;
  const posAll = store.rankOf(id)!;
  log(`Eintrag #${id}: ${result.score} Punkte, Sektor ${result.sector}, ${(result.ticks / TPS / 60).toFixed(1)} min, Platz ${pos.rank}/${pos.total} (${simMs} ms)`);
  send(res, 201, {
    ok: true, id, rank: pos.rank, total: pos.total, version: gameVersion, rankAll: posAll.rank, totalAll: posAll.total,
    score: result.score, sector: result.sector, kills: result.kills, ticks: result.ticks,
  });
}


/**
 * Gezeigte Gruppe für die gewünschte Version: alle Versionen mit demselben Sim-Kern (gleiche
 * Spielbedingungen). Hat die Gruppe noch keine Einträge, die neueste ältere Gruppe mit Einträgen.
 */
function pickGroup(wanted: string): { group: string[]; fallback: boolean } | null {
  const have = store.versions().filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  const own = simGroup(wanted, have);
  if (have.some((v) => own.includes(v))) return { group: own, fallback: false };
  const older = have.filter((v) => cmpVersion(v, wanted) < 0).sort(cmpVersion).pop();
  return older ? { group: simGroup(older, have), fallback: true } : null;
}

/**
 * Bestenliste. `?version=X`: Einträge aller Versionen mit demselben Sim-Kern wie X (Antwort
 * `version` = Anzeige wie „0.6.0–1.0.0“, `versions` = Liste); ohne Einträge die Vorgänger-Gruppe
 * (`fallback: true`). `?all=1` oder ohne `version`: alle Versionen (alte Clients).
 */
function getScores(req: IncomingMessage, res: ServerResponse, url: URL) {
  limit('read', req);
  const raw = url.searchParams.get('limit');
  const n = raw === null ? 20 : Number(raw);
  const lim = Number.isInteger(n) && n >= 1 ? Math.min(n, 100) : 20;
  const wanted = url.searchParams.get('version');
  const all = url.searchParams.get('all') === '1' || !wanted || !/^\d+\.\d+\.\d+$/.test(wanted);
  const pick = all ? null : pickGroup(wanted!);
  const rows = all ? store.top(lim) : pick ? store.top(lim, 0, pick.group) : [];
  const scores = rows.map((r) => ({
    rank: r.rank, id: r.id, name: r.name, score: r.score, sector: r.sector, kills: r.kills, ticks: r.ticks, version: r.version, sim: simNumber(r.version),
    date: berlinDay(r.createdAt), replay: playable(r.version, r.hasReplay),
  }));
  send(res, 200, {
    scores, total: all ? store.count() : pick ? store.count(pick.group) : 0,
    all, version: pick ? groupLabel(pick.group) : null, versions: pick?.group ?? null,
    requested: all ? null : wanted, fallback: !!pick?.fallback,
  });
}

// ---------------------------------------------------------------- Wiedergabe (/replay)

const hasCore = (version: string) => version === APP_VERSION || Object.prototype.hasOwnProperty.call(FROZEN_CORES, version);
/** Lässt sich die Partie auf der Wiedergabeseite abspielen? (Aufzeichnung da, Sim-Kern da, darstellbar) */
const playable = (version: string, hasReplay: boolean) => unplayableReason(version, hasCore(version), hasReplay) === '';

const SORTS: ReplaySort[] = ['score', 'date', 'sector'];

/**
 * Liste der Wiedergabeseite: Bestenlisten-Einträge. `?version=X` (wie die Bestenliste: gibt es für X
 * keine Einträge, die neueste ältere Version) oder `version=all` (Standard), `sort=score|date|sector`,
 * `dir=asc|desc`, `limit` (≤ 100), `offset`. `rank` ist der Platz nach Punkten innerhalb des Filters.
 */
function getReplays(req: IncomingMessage, res: ServerResponse, url: URL) {
  limit('read', req);
  const q = url.searchParams;
  const n = Number(q.get('limit') ?? 50);
  const lim = Number.isInteger(n) && n >= 1 ? Math.min(n, 100) : 50;
  const o = Number(q.get('offset') ?? 0);
  const off = Number.isInteger(o) && o >= 0 ? o : 0;
  const sort = SORTS.includes(q.get('sort') as ReplaySort) ? (q.get('sort') as ReplaySort) : 'score';
  const desc = q.get('dir') !== 'asc';
  const wanted = q.get('version');
  const all = !wanted || !/^\d+\.\d+\.\d+$/.test(wanted);
  // Auswahl nach Sim-Gruppen: Schlüssel = neueste Version der Gruppe, Anzeige z. B. „0.6.0–1.0.0“
  const vc = store.versionCounts().filter((v) => /^\d+\.\d+\.\d+$/.test(v.version));
  const have = vc.map((v) => v.version);
  const byKey = new Map<string, { group: string[]; n: number }>();
  for (const v of [...vc, { version: APP_VERSION, n: 0 }]) {
    const k = simKey(v.version);
    const g = byKey.get(k) ?? { group: simGroup(v.version, have), n: 0 };
    g.n += v.n;
    byKey.set(k, g);
  }
  const counts = [...byKey.values()]
    .filter((g) => g.n > 0)
    .map((g) => ({ version: g.group[g.group.length - 1], label: groupLabel(g.group), n: g.n, group: g.group }))
    .sort((a, b) => cmpVersion(b.version, a.version));
  const pick = all ? null : pickGroup(wanted!);
  const shown = pick ? pick.group[pick.group.length - 1] : null;
  const rows = all || pick ? store.replayList(pick?.group ?? null, sort, desc, lim, off) : [];
  send(res, 200, {
    replays: rows.map((r) => ({
      rank: r.rank, id: r.id, name: r.name, score: r.score, sector: r.sector, kills: r.kills, ticks: r.ticks, version: r.version,
      date: berlinDay(r.createdAt), playable: playable(r.version, r.hasReplay), hasReplay: r.hasReplay,
    })),
    total: all ? store.count() : pick ? store.count(pick.group) : 0, offset: off, sort, dir: desc ? 'desc' : 'asc',
    all, version: all ? null : shown, label: pick ? groupLabel(pick.group) : null, requested: all ? null : wanted, fallback: !!pick?.fallback,
    versions: counts.map(({ version, label, n }) => ({ version, label, n })), current: simGroup(APP_VERSION, have).slice(-1)[0] ?? APP_VERSION,
  });
}

/** Ein Eintrag mit entpacktem Replay (`replay: null` = ohne Aufzeichnung); Antwort gzip, wenn der Client es kann */
async function getReplay(req: IncomingMessage, res: ServerResponse, id: number) {
  limit('read', req);
  const e = store.replayOf(id);
  if (!e) throw new HttpError(404, 'not_found', 'Eintrag nicht gefunden.');
  const r = e.row;
  const pos = store.rankOf(id, simGroup(r.version, store.versions()));
  const head = JSON.stringify({
    rank: pos?.rank ?? 0, id: r.id, name: r.name, score: r.score, sector: r.sector, kills: r.kills, ticks: r.ticks, version: r.version,
    date: berlinDay(r.createdAt), playable: playable(r.version, !!e.replay), hasReplay: !!e.replay,
  });
  // Das Replay ist als JSON gespeichert: unverändert einsetzen statt parsen und neu schreiben
  let replay = 'null';
  if (e.replay) {
    try {
      replay = (await gunzipAsync(e.replay)).toString('utf8');
    } catch {
      throw new HttpError(500, 'internal', 'Aufzeichnung ist beschädigt.');
    }
  }
  let body = Buffer.from(`${head.slice(0, -1)},"replay":${replay}}`, 'utf8');
  const headers: Record<string, string> = { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' };
  if (body.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    body = await gzipAsync(body);
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = String(body.length);
  res.writeHead(200, headers);
  res.end(body);
}

/** Gesamtstatistik (nur Summen, ohne Namen und Uhrzeiten), 60 s zwischengespeichert */
let statsCache: { at: number; report: StatsReport } | null = null;
function getStats(req: IncomingMessage, res: ServerResponse) {
  limit('read', req);
  const now = Date.now();
  if (!statsCache || now - statsCache.at > 60_000) statsCache = { at: now, report: buildStats(store, berlinDay) };
  send(res, 200, statsCache.report, { 'Cache-Control': 'public, max-age=60' });
}

/** Telemetrie als JSONL (nur mit ADMIN_TOKEN): ?since=<id>&limit=<n>, Replay entpackt */
function getTelemetry(req: IncomingMessage, res: ServerResponse, url: URL) {
  requireAdmin(req);
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const lim = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit')) || 1000));
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const p of store.plays(since, lim)) {
    const replay = JSON.parse(gunzipSync(p.replay).toString('utf8'));
    res.write(JSON.stringify({ ...p, date: berlinDay(p.createdAt), replay }) + '\n');
  }
  res.end();
}

// ---------------------------------------------------------------- Routen

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const read = method === 'GET' || method === 'HEAD';

  if (path === '/' || path === '/index.html' || path === '/oganesson.html') {
    if (!read) throw new HttpError(405, 'method', 'Methode nicht erlaubt.');
    const f = loadGame();
    return f ? serveFile(req, res, f, { 'Content-Security-Policy': PAGE_CSP }) : notBuilt(res, 'Spiel-Datei');
  }
  const st = read ? statics.get(path.slice(1)) : undefined;
  if (st) return serveFile(req, res, st, STATIC_CACHE);
  // Impressum & Datenschutz (legal.ts); Links darin sind relativ (Unterpfad hinter dem Proxy)
  if ((path === '/impressum/' || path === '/datenschutz/') && read) {
    res.writeHead(301, { ...SECURITY_HEADERS, Location: `../${path.slice(1, -1)}` });
    return res.end();
  }
  if ((path === '/impressum' || path === '/datenschutz') && read) {
    return serveFile(req, res, legalFile, { 'Content-Security-Policy': LEGAL_CSP, 'X-Robots-Tag': 'noindex' });
  }
  // Wiedergabeseite: eigene Single-File-Seite, nicht für Suchmaschinen; API-Pfade darin sind relativ
  if (path === '/replay/' && read) {
    res.writeHead(301, { ...SECURITY_HEADERS, Location: '../replay' });
    return res.end();
  }
  if (path === '/replay' || path === '/replay.html') {
    if (!read) throw new HttpError(405, 'method', 'Methode nicht erlaubt.');
    const f = loadFile(config.replayFile, 'text/html; charset=utf-8');
    return f ? serveFile(req, res, f, { 'Content-Security-Policy': PAGE_CSP, 'X-Robots-Tag': 'noindex, nofollow' }) : notBuilt(res, 'Wiedergabeseite');
  }
  if (path === '/third-party-licenses.txt' && read) {
    const f = loadFile(licensesFile(), 'text/plain; charset=utf-8');
    return f ? serveFile(req, res, f) : notBuilt(res, 'Lizenzdatei');
  }

  if (path === '/api/health' && method === 'GET') {
    return send(res, 200, { ok: true, game: 'oganesson', version: APP_VERSION, commit: APP_COMMIT });
  }
  if (path === '/api/runs' && method === 'POST') return postRun(req, res);
  if (path === '/api/scores' && method === 'GET') return getScores(req, res, url);
  if (path === '/api/scores' && method === 'POST') return postScore(req, res);
  if (path === '/api/telemetry' && method === 'GET') return getTelemetry(req, res, url);
  if (path === '/api/replays' && method === 'GET') return getReplays(req, res, url);
  if (path === '/api/stats' && method === 'GET') return getStats(req, res);
  const rp = /^\/api\/replays\/(\d{1,12})$/.exec(path);
  if (rp && method === 'GET') return getReplay(req, res, Number(rp[1]));

  const del = /^\/api\/scores\/(\d+)$/.exec(path);
  if (del && method === 'DELETE') {
    requireAdmin(req);
    if (!store.deleteScore(Number(del[1]))) throw new HttpError(404, 'not_found', 'Eintrag nicht gefunden.');
    statsCache = null;
    log(`Eintrag #${del[1]} gelöscht (Admin)`);
    return send(res, 200, { ok: true });
  }

  if (path.startsWith('/api/')) throw new HttpError(404, 'not_found', 'Unbekannter Endpunkt.');
  res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (err instanceof HttpError) {
      // Bei zu großen Bodies die Verbindung schließen statt weiterzulesen
      send(res, err.status, { error: err.code, message: err.message }, err.status === 413 ? { ...err.headers, Connection: 'close' } : err.headers);
      if (err.status === 413) res.once('finish', () => req.destroy());
      return;
    }
    console.error('[oganesson]', err);
    if (!res.headersSent) send(res, 500, { error: 'internal', message: 'Interner Fehler.' });
    else res.end();
  });
});
server.requestTimeout = 60_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

const prune = () => store.pruneRuns(Date.now() - config.runMaxAge * 1000);
prune();
setInterval(prune, 3600_000).unref();

server.listen(config.port, config.host, () => {
  log(`läuft auf http://${config.host}:${config.port} (Version ${APP_VERSION} ${APP_COMMIT}, DB ${config.dbPath})`);
  log(`Nachsimulation: ${config.verifyWorkers} Worker, Zeitlimit ${config.verifyTimeout} s, Warteschlange ${config.verifyQueue}`);
  if (!config.publicUrl) console.warn('[oganesson] PUBLIC_URL nicht gesetzt: keine Open-Graph-Tags für die Link-Vorschau');
  if (!(LEGAL.name && LEGAL.address && LEGAL.email)) console.warn('[oganesson] IMPRESSUM_* nicht vollständig gesetzt');
  if (!loadGame()) console.warn(`[oganesson] Spiel-Datei fehlt: ${config.gameFile}`);
  if (!loadFile(config.replayFile, 'text/html; charset=utf-8')) console.warn(`[oganesson] Wiedergabeseite fehlt: ${config.replayFile}`);
  if (!config.adminToken) console.warn('[oganesson] ADMIN_TOKEN nicht gesetzt: Admin-Endpunkte sind abgeschaltet');
});

let stopping = false;
function shutdown(sig: string) {
  if (stopping) return;
  stopping = true;
  log(`${sig}: fahre herunter`);
  server.close(() => {
    void verifier.close().finally(() => {
      store.close();
      process.exit(0);
    });
  });
  server.closeIdleConnections();
  // laufende Anfragen bekommen etwas Zeit, dann ist Schluss
  setTimeout(() => {
    server.closeAllConnections();
  }, 5000).unref();
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
