// Anbindung an die geteilte Bestenliste des OGANESSON-Servers (server/).
// Online nur, wenn die Seite per http(s) geladen wurde und api/health antwortet. Bei file://
// oder Fehlern bleibt alles still lokal: keine Fehlermeldungen, Funktionen liefern null/leer.
// API-Pfade sind relativ zur Seite, damit der Server auch unter einem Unterpfad laufen kann.
import { APP_VERSION } from '../version';
import type { Replay } from '../core/sim/types';

export interface RunTicket {
  runId: string;
  seed: number;
  token: string;
}

export interface SubmitResult {
  ok: boolean;
  /** Eintrags-Nummer (zum Hervorheben in der Liste) */
  id?: number;
  /** Platz in der Bestenliste (nur bei ok) */
  rank?: number;
  /** vom Server nachgerechnete Punkte (nur bei ok) */
  score?: number;
  /** Meldung für die Anzeige (deutsch) */
  error?: string;
}

export interface ScoreEntry {
  id: number;
  /** Spielversion der Partie */
  version: string;
  /** Sim-Version (fortlaufende Nummer der Spiellogik, 0 = unbekannt) */
  sim: number;
  name: string;
  score: number;
  sector: number;
  /** YYYY-MM-DD */
  date: string;
  /** Partie lässt sich auf der Wiedergabeseite (replay#<id>) ansehen */
  replay: boolean;
}

interface Health {
  ok?: boolean;
  game?: string;
  version?: unknown;
  commit?: unknown;
}

const apiUrl = (path: string) => new URL(`api/${path}`, location.href).toString();

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 6000);
  try {
    const res = await fetch(apiUrl(path), { method, headers: init.headers, body: init.body, signal: ctrl.signal, cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!res.ok) throw new ApiError(res.status, json?.message ?? `Serverfehler (${res.status})`);
    if (json === null) throw new ApiError(res.status, 'Ungültige Antwort vom Server.');
    return json;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'Server nicht erreichbar.');
  } finally {
    clearTimeout(timer);
  }
}

let onlineCheck: Promise<boolean> | null = null;
let health: Health | null = null;

/**
 * Bis zu drei Versuche mit großzügigem Zeitlimit (beim Spielstart ist der Main-Thread oft
 * beschäftigt). Eine echte HTTP-Antwort ohne OGANESSON-Server heißt sofort offline.
 */
async function probe(): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      const h = await request<Health>('GET', 'health', { timeoutMs: 8000 });
      health = h;
      return h.ok === true && h.game === 'oganesson';
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) return false;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** Ist die geteilte Bestenliste verfügbar? (einmal geprüft, dann gemerkt) */
export function isOnline(): Promise<boolean> {
  if (!onlineCheck) {
    const http = typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:');
    onlineCheck = http ? probe() : Promise.resolve(false);
  }
  return onlineCheck;
}

/** Neuer Spielstart beim Server (Seed vom Server!); null = offline/Fehler → lokal spielen */
export async function startRun(): Promise<RunTicket | null> {
  if (!(await isOnline())) return null;
  try {
    const r = await request<RunTicket>('POST', 'runs', { timeoutMs: 5000 });
    return typeof r.token === 'string' && Number.isInteger(r.seed) ? r : null;
  } catch {
    return null;
  }
}

/** JSON mit gzip packen, falls der Browser CompressionStream kann; sonst null */
async function gzipJson(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

/**
 * Ergebnis eintragen. Der Server rechnet das Replay nach und übernimmt nur seine eigenen Werte;
 * zurück kommen Platz und nachgerechnete Punkte. Replays sind einige 100 KB groß und werden
 * gzip-komprimiert gesendet, wenn der Browser das kann.
 */
export async function submitScore(token: string, name: string, replay: Replay, version = APP_VERSION): Promise<SubmitResult> {
  if (!(await isOnline())) return { ok: false, error: 'Keine Verbindung zur Bestenliste.' };
  const text = JSON.stringify({ token, name, replay, version });
  const send = (body: BodyInit, gz: boolean) =>
    request<{ id: number; rank: number; score: number }>('POST', 'scores', {
      body,
      headers: { 'Content-Type': 'application/json', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) },
      timeoutMs: 60_000,
    });
  try {
    const gz = text.length > 16_384 ? await gzipJson(text) : null;
    let r;
    try {
      r = await send(gz ?? text, gz !== null);
    } catch (err) {
      // Proxy versteht keinen gepackten Upload: einmal ungepackt versuchen
      if (gz && err instanceof ApiError && (err.status === 415 || (err.status === 400 && /Komprimierung/.test(err.message)))) r = await send(text, false);
      else throw err;
    }
    return { ok: true, id: r.id, rank: r.rank, score: r.score };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler.' };
  }
}

export interface Board {
  scores: ScoreEntry[];
  /** gezeigte Version (null = alle Versionen) */
  version: string | null;
  /** true = für die eigene Version gibt es noch keine Einträge, gezeigt wird die Vorgängerversion */
  fallback: boolean;
  all: boolean;
}

/**
 * Bestenliste (beste zuerst). Standard: nur Partien der eigenen Spielversion, ohne Einträge die
 * Vorgängerversion; `all` = alle Versionen. Leer bei offline/Fehler.
 */
export async function fetchScores(limit = 20, all = false): Promise<Board> {
  const empty: Board = { scores: [], version: null, fallback: false, all };
  if (!(await isOnline())) return empty;
  try {
    const n = Math.max(1, Math.min(100, Math.floor(limit)));
    const q = all ? `scores?limit=${n}&all=1` : `scores?limit=${n}&version=${encodeURIComponent(APP_VERSION)}`;
    const r = await request<{ scores: ScoreEntry[]; version?: string | null; fallback?: boolean; all?: boolean }>('GET', q);
    return {
      scores: r.scores.map((s) => ({ id: s.id, version: s.version, sim: s.sim ?? 0, name: s.name, score: s.score, sector: s.sector, date: s.date, replay: s.replay === true })),
      version: r.version ?? null,
      fallback: !!r.fallback,
      all: r.all ?? all,
    };
  } catch {
    return empty;
  }
}

/** Version des Spiels auf dem Server (z. B. "0.2.0"), null bei offline/unbekannt */
export async function serverVersion(): Promise<string | null> {
  if (!(await isOnline())) return null;
  try {
    const h = await request<Health>('GET', 'health', { timeoutMs: 4000 });
    health = h;
  } catch {
    /* letzte bekannte Antwort nehmen */
  }
  return typeof health?.version === 'string' ? health.version : null;
}
