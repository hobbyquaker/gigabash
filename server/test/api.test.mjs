// Integrationstest der Bestenlisten-API. Startet den gebauten Server (server/dist/server.mjs) mit
// temporärer Datenbank und einer kleinen Test-HTML, spielt echte Bot-Partien mit dem Seed vom
// Server und reicht sie (auch manipuliert) ein.
// Aufruf: npm run test:server (baut vorher den Server)

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const { playBot, playBotFrozen030, playBotFrozen100, simulateReplay, APP_VERSION } = await import(pathToFileURL(join(here, '../dist/test-play.mjs')).href);
const ADMIN = 'test-admin-token';
const SECRET = 'test-secret-0123456789';
const TEST_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>Oganesson</title></head><body><script>1</script></body></html>';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), 'oganesson-test-'));
writeFileSync(join(tmp, 'oganesson.html'), TEST_HTML);
writeFileSync(join(tmp, 'third-party-licenses.txt'), 'Oganesson – Lizenzen\nPhaser 3 – MIT\n');
writeFileSync(join(tmp, 'replay.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Oganesson GigaBash · Replays</title></head><body><script>2</script></body></html>');
// Icons/Vorschaubilder (Inhalt egal, nur Auslieferung und Typ werden geprüft)
mkdirSync(join(tmp, 'public'));
writeFileSync(join(tmp, 'public', 'og-image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
writeFileSync(join(tmp, 'public', 'apple-touch-icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

let failed = 0;
let passed = 0;
function check(label, cond, extra = '') {
  if (cond) passed++;
  else failed++;
  console.log(`${cond ? 'OK  ' : 'FEHL'} ${label}${extra ? `  (${extra})` : ''}`);
}

/** Server mit eigener Datenbank starten; env überschreibt die Vorgaben */
async function startServer(name, env = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [join(here, '../dist/server.mjs')], {
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', SECRET, ADMIN_TOKEN: ADMIN,
      DB_PATH: join(tmp, `${name}.db`), GAME_FILE: join(tmp, 'oganesson.html'), TRUST_PROXY: '1', ...env,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/api/health')).ok) return { child, base, log: () => out };
    } catch {
      /* noch nicht da */
    }
    await sleep(100);
  }
  child.kill('SIGKILL');
  throw new Error(`Server ${name} startet nicht:\n${out}`);
}

async function stopServer(s) {
  const gone = new Promise((r) => s.child.once('exit', (code, sig) => r({ code, sig })));
  s.child.kill('SIGTERM');
  return Promise.race([gone, sleep(10000).then(() => ({ code: 'timeout' }))]);
}

let ipCounter = 1;
const freshIp = () => `10.0.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

async function api(base, method, path, body, { ip = freshIp(), headers = {}, raw } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'X-Forwarded-For': ip, ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* kein JSON */
  }
  return { status: res.status, json, text, headers: res.headers };
}

const clone = (o) => JSON.parse(JSON.stringify(o));

const srv = await startServer('main', {
  TIME_FACTOR: '100000', PUBLIC_DIR: join(tmp, 'public'), PUBLIC_URL: 'https://example.de/gigabash/',
  IMPRESSUM_NAME: 'Erika Muster', IMPRESSUM_ADDRESS: 'Weg 1|12345 Ort', IMPRESSUM_EMAIL: 'erika@example.de',
});
const B = srv.base;
try {
  // ---------------------------------------------------------------- Auslieferung
  const h = await api(B, 'GET', '/api/health');
  check('health', h.status === 200 && h.json.ok === true && h.json.game === 'oganesson' && h.json.version === APP_VERSION && typeof h.json.commit === 'string', h.text);

  const page = await fetch(B + '/', { headers: { 'Accept-Encoding': 'gzip' } });
  const pageBody = await page.text();
  const csp = page.headers.get('content-security-policy') ?? '';
  check('Spiel unter / mit CSP connect-src self', page.status === 200 && pageBody.includes('<title>Oganesson</title>') && csp.includes("connect-src 'self'"));
  check('Sicherheits-Header', page.headers.get('x-content-type-options') === 'nosniff' && page.headers.get('x-frame-options') === 'SAMEORIGIN');
  const raw = await new Promise((resolve) => {
    import('node:http').then(({ get }) => get(B + '/', { headers: { 'Accept-Encoding': 'gzip' } }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ enc: r.headers['content-encoding'], body: Buffer.concat(chunks), etag: r.headers.etag }));
    }));
  });
  const unz = raw.enc === 'gzip' ? gunzipSync(raw.body).toString() : '';
  check('Spiel gzip-komprimiert', unz.startsWith('<!doctype html><html><head><meta charset="utf-8"><title>Oganesson</title>') && unz.endsWith('<body><script>1</script></body></html>'));

  // ---------------------------------------------------------------- Link-Vorschau, Icons, Impressum
  const ogAt = pageBody.indexOf('<meta property="og:image" content="https://example.de/gigabash/og-image.png?v=');
  check('og:image absolut mit Unterpfad, direkt nach <title> (< 8 KB)', ogAt > 0 && ogAt < 8192 && ogAt > pageBody.indexOf('</title>'));
  check('apple-touch-icon und Manifest relativ', /<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon\.png\?v=/.test(pageBody) && pageBody.includes('href="manifest.webmanifest?v='));
  const icon = await fetch(B + '/apple-touch-icon.png?v=1');
  check('Icon als PNG mit Cache', icon.status === 200 && icon.headers.get('content-type') === 'image/png' && /max-age=86400/.test(icon.headers.get('cache-control') ?? ''));
  const man = await fetch(B + '/manifest.webmanifest');
  const manJson = await man.json().catch(() => null);
  check('Manifest', man.status === 200 && manJson?.start_url === './' && manJson?.scope === './' && manJson?.orientation === 'portrait');
  const imp = await fetch(B + '/impressum');
  const impText = await imp.text();
  check('Impressum mit Angaben aus der Umgebung', imp.status === 200 && impText.includes('Erika Muster') && impText.includes('Weg 1<br>12345 Ort') && impText.includes('data-d="example.de"') && !impText.includes('erika@example.de'));
  check('Impressum noindex + eigene CSP', imp.headers.get('x-robots-tag') === 'noindex' && (imp.headers.get('content-security-policy') ?? '').startsWith("default-src 'none'"));
  check('/datenschutz = Impressum-Seite', (await fetch(B + '/datenschutz')).status === 200);
  const slash = await fetch(B + '/impressum/', { redirect: 'manual' });
  check('/impressum/ → relative Weiterleitung', slash.status === 301 && slash.headers.get('location') === '../impressum');
  const cached = await fetch(B + '/', { headers: { 'If-None-Match': raw.etag } });
  check('ETag → 304', cached.status === 304);
  const lic = await fetch(B + '/third-party-licenses.txt');
  check('Lizenzdatei', lic.status === 200 && (await lic.text()).includes('Phaser'));
  check('unbekannter Pfad → 404', (await fetch(B + '/../etc/passwd')).status === 404);
  check('unbekannter API-Pfad → 404', (await api(B, 'GET', '/api/gibtsnicht')).status === 404);

  // ---------------------------------------------------------------- gültige Einsendung
  const run = (await api(B, 'POST', '/api/runs')).json;
  check('Spielstart', typeof run?.runId === 'string' && Number.isInteger(run.seed) && run.seed >= 0 && typeof run.token === 'string', JSON.stringify(run));
  const t0 = performance.now();
  const game = playBot(run.seed, 25);
  console.log(`     Bot-Partie Seed ${run.seed}: ${game.stats.score} Punkte, Sektor ${game.stats.sector}, ${(game.stats.ticks / 3600).toFixed(1)} min, Replay ${(JSON.stringify(game.replay).length / 1024).toFixed(0)} KB [${(performance.now() - t0).toFixed(0)} ms]`);
  // Client lügt bei den Werten: der Server muss sie ignorieren
  const sub = await api(B, 'POST', '/api/scores', {
    token: run.token, name: 'Testpilot', replay: game.replay, version: APP_VERSION, score: 999_999_999, sector: 99, kills: 9999,
  });
  check('gültige Einsendung angenommen', sub.status === 201 && sub.json.ok === true && sub.json.rank === 1, sub.text);
  check('falscher Score ignoriert, Werte vom Server', sub.json?.score === game.stats.score && sub.json?.sector === game.stats.sector &&
    sub.json?.kills === game.stats.kills && sub.json?.ticks === game.stats.ticks, `${sub.json?.score} vs ${game.stats.score}`);

  const list = await api(B, 'GET', '/api/scores?limit=5');
  const top = list.json?.scores?.[0];
  check('Bestenliste', list.status === 200 && top?.name === 'Testpilot' && top.score === game.stats.score && top.sector === game.stats.sector &&
    /^\d{4}-\d{2}-\d{2}$/.test(top.date) && list.json.total === 1, list.text.slice(0, 200));

  check('Token doppelt → 409', (await api(B, 'POST', '/api/scores', { token: run.token, name: 'Nochmal', replay: game.replay, version: APP_VERSION })).status === 409);

  // ---------------------------------------------------------------- manipulierte Einsendungen
  const [payload, sig] = run.token.split('.');
  const claim = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const forgedPayload = Buffer.from(JSON.stringify({ ...claim, t: claim.t - 3600_000 })).toString('base64url');
  const forged = await api(B, 'POST', '/api/scores', { token: `${forgedPayload}.${sig}`, name: 'Faelscher', replay: game.replay, version: APP_VERSION });
  check('falsche Signatur → 403', forged.status === 403 && forged.json?.error === 'bad_token', forged.text);
  const badSig = await api(B, 'POST', '/api/scores', { token: `${payload}.${Buffer.alloc(32).toString('base64url')}`, name: 'Faelscher', replay: game.replay });
  check('Signatur aus Nullen → 403', badSig.status === 403);

  // Schimpfwort: abgelehnt, Spielstart bleibt einlösbar
  const run2 = (await api(B, 'POST', '/api/runs')).json;
  const game2 = playBot(run2.seed, 3);
  for (const bad of ['F1ck3r', 'Hitler', 'n4z1', 'xX_Fuuuck_Xx', 'Arschloch']) {
    const r = await api(B, 'POST', '/api/scores', { token: run2.token, name: bad, replay: game2.replay, version: APP_VERSION });
    check(`Name „${bad}“ abgelehnt`, r.status === 400 && r.json?.error === 'bad_name', r.text);
  }
  for (const bad of ['', '   ', 'ABCDEFGHIJKLMNOPQ', '<script>', 'a‮b']) {
    const r = await api(B, 'POST', '/api/scores', { token: run2.token, name: bad, replay: game2.replay, version: APP_VERSION });
    check(`Name ${JSON.stringify(bad)} abgelehnt`, r.status === 400, r.text);
  }
  // Version passt nicht
  const ver = await api(B, 'POST', '/api/scores', { token: run2.token, name: 'Pilot', replay: game2.replay, version: '0.0.1' });
  check('andere Spielversion → 409', ver.status === 409 && ver.json?.error === 'version', ver.text);
  // gzip-Upload, Name mit Umlaut und erlaubten Zeichen (Marschall darf trotz „arsch“)
  const gz = await api(B, 'POST', '/api/scores', undefined, {
    raw: gzipSync(JSON.stringify({ token: run2.token, name: 'Marschall Ö-1', replay: game2.replay, version: APP_VERSION })),
    headers: { 'Content-Encoding': 'gzip' },
  });
  check('gzip-Einsendung nach abgelehnten Namen angenommen', gz.status === 201 && gz.json.score === game2.stats.score, gz.text);

  // Replay eines anderen Seeds
  const run3 = (await api(B, 'POST', '/api/runs')).json;
  const wrongSeed = await api(B, 'POST', '/api/scores', { token: run3.token, name: 'Pilot', replay: game2.replay, version: APP_VERSION });
  check('Replay mit fremdem Seed → 422', wrongSeed.status === 422 && wrongSeed.json?.error === 'bad_replay', wrongSeed.text);

  // Aktion mit unbekannter Kennung (Formprüfung)
  const game3 = playBot(run3.seed, 3);
  for (const [label, action] of [
    ['unbekannte Waffe', { t: 'weapon', slot: 'core', w: 'laserkanone' }],
    ['__proto__ als Wert', { t: 'stat', id: '__proto__' }],
    ['unbekannter Typ', { t: 'credits', n: 100000 }],
  ]) {
    const rp = clone(game3.replay);
    rp.actions.unshift({ tick: 0, ...action });
    const r = await api(B, 'POST', '/api/scores', { token: run3.token, name: 'Pilot', replay: rp, version: APP_VERSION });
    check(`Aktion „${label}“ → 422`, r.status === 422 && r.json?.error === 'bad_replay', r.text);
  }
  const badInput = clone(game3.replay);
  badInput.inputs[1] = 500;
  check('Eingabe außerhalb ±100 → 422', (await api(B, 'POST', '/api/scores', { token: run3.token, name: 'Pilot', replay: badInput, version: APP_VERSION })).status === 422);

  // Aktion mit gültiger Form, aber im Flug (Shop-Kauf mitten im Sektor): erst die Nachsimulation merkt es
  const midFlight = clone(game3.replay);
  midFlight.actions.unshift({ tick: 100, t: 'stat', id: 'armor' });
  const mf = await api(B, 'POST', '/api/scores', { token: run3.token, name: 'Pilot', replay: midFlight, version: APP_VERSION });
  check('ungültige Aktion in der Nachsimulation → 422', mf.status === 422 && mf.json?.error === 'implausible' && /Aktion/.test(mf.json?.message), mf.text);
  check('… und Spielstart danach verbraucht', (await api(B, 'POST', '/api/scores', { token: run3.token, name: 'Pilot', replay: game3.replay, version: APP_VERSION })).status === 409);

  // Eingaben verändert (zusätzliche Ticks): Server rechnet seine eigenen Werte, kein Absturz
  const run4 = (await api(B, 'POST', '/api/runs')).json;
  const game4 = playBot(run4.seed, 2);
  const tweaked = clone(game4.replay);
  tweaked.inputs.push(600, 0, 0, 0);
  const tw = await api(B, 'POST', '/api/scores', { token: run4.token, name: 'Tüftler', replay: tweaked, version: APP_VERSION });
  check('verändertes Replay: Server nimmt nur nachgerechnete Werte', tw.status === 201 || tw.status === 422, `${tw.status} ${tw.text.slice(0, 120)}`);

  // Body-Limit
  const huge = await api(B, 'POST', '/api/scores', undefined, { raw: '{"x":"' + 'a'.repeat(4_100_000) + '"}' }).catch(() => ({ status: 'abgebrochen' }));
  check('zu großer Body → 413', huge.status === 413 || huge.status === 'abgebrochen', String(huge.status));
  const bomb = gzipSync(Buffer.alloc(20_000_000, 32));
  const gzBomb = await api(B, 'POST', '/api/scores', undefined, { raw: bomb, headers: { 'Content-Encoding': 'gzip' } }).catch(() => ({ status: 'abgebrochen' }));
  check(`gzip-Bombe (${(bomb.length / 1024).toFixed(0)} KB gepackt) → 413`, gzBomb.status === 413, String(gzBomb.status));
  check('kaputtes JSON → 400', (await api(B, 'POST', '/api/scores', undefined, { raw: '{kaputt' })).status === 400);
  check('falscher Content-Type → 415', (await api(B, 'POST', '/api/scores', undefined, { raw: 'x', headers: { 'Content-Type': 'text/plain' } })).status === 415);

  // ---------------------------------------------------------------- Rate-Limit
  let limited = 0;
  for (let i = 0; i < 15; i++) {
    // erster Eintrag frei erfunden, der letzte (vom Proxy angehängte) zählt
    const r = await api(B, 'POST', '/api/runs', undefined, { ip: `${i}.${i}.${i}.${i}, 10.250.0.1` });
    if (r.status === 429) {
      limited++;
      if (limited === 1) check('Rate-Limit mit Retry-After', Number(r.headers.get('retry-after')) > 0);
    }
  }
  check('Rate-Limit greift (letzter X-Forwarded-For-Eintrag)', limited >= 3, `${limited}× 429`);
  check('andere IP nicht betroffen', (await api(B, 'POST', '/api/runs', undefined, { ip: '10.250.0.2' })).status === 201);

  // ---------------------------------------------------------------- Admin
  const ids = (await api(B, 'GET', '/api/scores')).json.scores.map((s) => s.id);
  const target = sub.json.id;
  check('Löschen ohne Token → 401', (await api(B, 'DELETE', `/api/scores/${target}`)).status === 401);
  check('Löschen mit falschem Token → 401', (await api(B, 'DELETE', `/api/scores/${target}`, undefined, { headers: { Authorization: 'Bearer falsch' } })).status === 401);
  const del = await api(B, 'DELETE', `/api/scores/${target}`, undefined, { headers: { Authorization: `Bearer ${ADMIN}` } });
  check('Löschen mit Admin-Token', del.status === 200 && del.json.ok === true, del.text);
  const after = (await api(B, 'GET', '/api/scores')).json;
  check('Eintrag ist weg', !after.scores.some((s) => s.id === target) && after.total === ids.length - 1);
  check('nochmal löschen → 404', (await api(B, 'DELETE', `/api/scores/${target}`, undefined, { headers: { Authorization: `Bearer ${ADMIN}` } })).status === 404);

  // ---------------------------------------------------------------- Telemetrie
  check('Telemetrie ohne Token → 401', (await api(B, 'GET', '/api/telemetry')).status === 401);
  const tel = await api(B, 'GET', '/api/telemetry', undefined, { headers: { Authorization: `Bearer ${ADMIN}` } });
  const plays = tel.text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  check('Telemetrie: jede verarbeitete Einsendung gespeichert', tel.status === 200 && plays.length === 4, `${plays.length} Partien`);
  check('Telemetrie anonym (kein Name, keine IP, keine Run-ID)', !tel.text.includes('Testpilot') && !tel.text.includes('10.0.') && !tel.text.includes(run.runId));
  check('Telemetrie mit Version, Commit, Replay', plays.every((p) => p.version === APP_VERSION && typeof p.commit === 'string' && Array.isArray(p.replay?.inputs)));
  check('Telemetrie enthält abgelehnte Partie', plays.some((p) => p.status.startsWith('Replay ungültig')));
} finally {
  const exit = await stopServer(srv);
  check('SIGTERM: sauber beendet', exit.code === 0, JSON.stringify(exit));
}

// ---------------------------------------------------------------- Zeit-Plausibilität (Echtzeit, TIME_FACTOR=1)
const strict = await startServer('strict', { TIME_FACTOR: '1' });
try {
  const run = (await api(strict.base, 'POST', '/api/runs')).json;
  const game = playBot(run.seed, 5);
  const r = await api(strict.base, 'POST', '/api/scores', { token: run.token, name: 'Speedrunner', replay: game.replay, version: APP_VERSION });
  check('Spielzeit länger als Echtzeit → 422', r.status === 422 && /länger als möglich/.test(r.json?.message), r.text);
  check('… nicht in der Bestenliste', (await api(strict.base, 'GET', '/api/scores')).json.total === 0);
  // Kurze Partie (≤ Toleranz von 10 s) geht durch
  // Seed mit Punkten in den ersten 6 s suchen (manche Seeds bringen so früh noch keinen Abschuss)
  let run2, short;
  for (let i = 0; i < 10; i++) {
    run2 = (await api(strict.base, 'POST', '/api/runs')).json;
    short = playBot(run2.seed, 0.1);
    if (short.stats.score > 0) break;
  }
  const ok = await api(strict.base, 'POST', '/api/scores', { token: run2.token, name: 'Kurz', replay: short.replay, version: APP_VERSION });
  check('kurze Partie innerhalb der Toleranz', ok.status === 201, ok.text);
  const run3 = (await api(strict.base, 'POST', '/api/runs')).json;
  const idle = await api(strict.base, 'POST', '/api/scores', { token: run3.token, name: 'Leer', replay: { seed: run3.seed, inputs: [60, 0, 0, 0], actions: [] }, version: APP_VERSION });
  check('Partie ohne Punkte → 422', idle.status === 422 && /Ohne Punkte/.test(idle.json?.message), idle.text);
} finally {
  await stopServer(strict);
}

// ---------------------------------------------------------------- Ältere Spielversion (eigener Server)
const fz = await startServer('frozen', { TIME_FACTOR: '100000' });
try {
  // ---------------------------------------------------------------- Ältere Spielversion (eingefrorener Kern)
  {
    const run = (await api(fz.base, 'POST', '/api/runs')).json;
    const game = playBotFrozen030(run.seed, 3);
    const r = await api(fz.base, 'POST', '/api/scores', { token: run.token, name: 'Altspieler', replay: game.replay, version: '0.3.0' });
    check('Partie von v0.3.0 nach Update gültig (eingefrorener Kern)', r.status === 201 && r.json.score === game.stats.score, r.text);
    const run2 = (await api(fz.base, 'POST', '/api/runs')).json;
    const r2 = await api(fz.base, 'POST', '/api/scores', { token: run2.token, name: 'Zukunft', replay: playBot(run2.seed, 0.2).replay, version: '9.9.9' });
    check('unbekannte Spielversion → 409', r2.status === 409 && /neu laden/.test(r2.json?.message), r2.text);
    // Bestenliste je Version: für die aktuelle Version gibt es hier noch nichts → Vorgänger v0.3.0
    const fb = (await api(fz.base, 'GET', `/api/scores?version=${APP_VERSION}`)).json;
    check('Bestenliste: ohne Einträge der eigenen Version → Vorgängerversion', fb.version === '0.3.0' && fb.fallback === true && fb.scores.length === 1 && fb.scores[0].version === '0.3.0', JSON.stringify(fb));
    const run3 = (await api(fz.base, 'POST', '/api/runs')).json;
    let cur;
    for (let i = 0; i < 5; i++) { cur = playBot(run3.seed, 2); if (cur.stats.score > 0) break; }
    const r3 = await api(fz.base, 'POST', '/api/scores', { token: run3.token, name: 'Neuling', replay: cur.replay, version: APP_VERSION });
    check('Eintrag der aktuellen Version: Platz 1 in seiner Version', r3.status === 201 && r3.json.rank === 1 && r3.json.version === APP_VERSION, r3.text);
    const own = (await api(fz.base, 'GET', `/api/scores?version=${APP_VERSION}`)).json;
    check('Bestenliste der eigenen Sim-Gruppe (ohne v0.3.0)', own.versions.includes(APP_VERSION) && own.fallback === false && own.scores.length === 1 && own.scores[0].name === 'Neuling', JSON.stringify(own));
    // Partien älterer Versionen mit identischem Sim-Kern (v0.6.1 = v1.0.0) erscheinen in derselben Liste.
    // Diese Partien spielt der Bot mit dem eingefrorenen Kern v1.0.0 (der aktuelle Kern kennt neue Käufe).
    const run4 = (await api(fz.base, 'POST', '/api/runs')).json;
    let g4;
    for (let i = 0; i < 5; i++) { g4 = playBotFrozen100(run4.seed, 2); if (g4.stats.score > 0) break; }
    const r4 = await api(fz.base, 'POST', '/api/scores', { token: run4.token, name: 'Gleichkern', replay: g4.replay, version: '0.6.1' });
    check('Eintrag v0.6.1 (gleicher Kern wie v1.0.0) angenommen', r4.status === 201, r4.text);
    const run5 = (await api(fz.base, 'POST', '/api/runs')).json;
    let g5;
    for (let i = 0; i < 5; i++) { g5 = playBotFrozen100(run5.seed, 2); if (g5.stats.score > 0) break; }
    const r5 = await api(fz.base, 'POST', '/api/scores', { token: run5.token, name: 'Gleichkern2', replay: g5.replay, version: '1.0.0' });
    check('Eintrag v1.0.0 angenommen', r5.status === 201, r5.text);
    const grp = (await api(fz.base, 'GET', '/api/scores?version=1.0.0')).json;
    check('Bestenliste fasst Versionen mit gleichem Kern zusammen (0.6.1 + 1.0.0)', grp.versions.includes('0.6.1') && grp.versions.includes('1.0.0') && grp.scores.length === 2 && grp.scores.some((e) => e.version === '0.6.1') && /–/.test(grp.version), JSON.stringify(grp));
    const grp2 = (await api(fz.base, 'GET', '/api/scores?version=0.6.1')).json;
    check('… auch von v0.6.1 aus gesehen', grp2.scores.length === 2 && grp2.version === grp.version, JSON.stringify(grp2));
    const own2 = (await api(fz.base, 'GET', `/api/scores?version=${APP_VERSION}`)).json;
    check('aktuelle Version (neuer Kern) bleibt in ihrer eigenen Liste', own2.scores.length === 1 && own2.scores[0].name === 'Neuling' && !own2.versions.includes('0.6.1'), JSON.stringify(own2));
    const allv = (await api(fz.base, 'GET', '/api/scores?all=1')).json;
    check('„Alle Versionen“ zeigt alle Einträge', allv.all === true && allv.total === 4 && allv.scores.length === 4, JSON.stringify(allv));
    const simOf = (v) => allv.scores.find((e) => e.version === v)?.sim;
    check('Sim-Version je Eintrag: 0.3.0 = Sim 2, 0.6.1 und 1.0.0 gleich (Sim 5), aktuelle neu (Sim 8)', simOf('0.3.0') === 2 && simOf('0.6.1') === 5 && simOf('1.0.0') === 5 && simOf(APP_VERSION) === 8, JSON.stringify(allv.scores.map((e) => [e.version, e.sim])));
    const old = (await api(fz.base, 'GET', '/api/scores?version=0.1.0')).json;
    check('ältere Version ohne Vorgänger → leer', old.scores.length === 0 && old.version === null, JSON.stringify(old));
  }

} finally {
  await stopServer(fz);
}

// ---------------------------------------------------------------- Wiedergabe: Migration, Backfill, Liste, Einzelabruf, Statistik
{
  const { DatabaseSync } = await import('node:sqlite');
  // Datenbank im Stand von v0.6.1: scores ohne Replay-Spalte, Replays nur anonym in plays
  const dbFile = join(tmp, 'replay.db');
  const old = new DatabaseSync(dbFile);
  old.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, seed INTEGER NOT NULL, started_at INTEGER NOT NULL, used_at INTEGER);
    CREATE TABLE scores (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, score INTEGER NOT NULL,
      sector INTEGER NOT NULL, kills INTEGER NOT NULL, ticks INTEGER NOT NULL, credits INTEGER NOT NULL, version TEXT NOT NULL,
      commit_id TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX scores_rank ON scores (score DESC, id ASC);
    CREATE TABLE plays (id INTEGER PRIMARY KEY AUTOINCREMENT, version TEXT NOT NULL, commit_id TEXT NOT NULL, seed INTEGER NOT NULL,
      status TEXT NOT NULL, score INTEGER NOT NULL, sector INTEGER NOT NULL, kills INTEGER NOT NULL, ticks INTEGER NOT NULL,
      credits INTEGER NOT NULL, real_ms INTEGER NOT NULL, sim_ms INTEGER NOT NULL, created_at INTEGER NOT NULL, replay BLOB NOT NULL);
  `);
  const day = Date.UTC(2026, 10, 15, 11);
  const addScore = old.prepare('INSERT INTO scores (run_id, name, score, sector, kills, ticks, credits, version, commit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const addPlay = old.prepare('INSERT INTO plays (version, commit_id, seed, status, score, sector, kills, ticks, credits, real_ms, sim_ms, created_at, replay) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)');
  const gz = (o) => gzipSync(JSON.stringify(o));
  // A: echte Partie von v0.3.0 mit genau einer passenden Telemetrie-Partie → bekommt ihr Replay
  const gameA = playBotFrozen030(4711, 3);
  const a = gameA.stats;
  addScore.run('run-a', 'Altspieler', a.score, a.sector, a.kills, a.ticks, a.credits, '0.3.0', 'alt', day);
  addPlay.run('0.3.0', 'alt', 4711, 'ok', a.score, a.sector, a.kills, a.ticks, a.credits, day, gz(gameA.replay));
  // B: zwei passende Partien → mehrdeutig, bleibt ohne
  addScore.run('run-b', 'Doppelt', 5000, 2, 50, 9000, 10, '0.5.2', 'alt', day + 86_400_000);
  for (const seed of [1, 2]) addPlay.run('0.5.2', 'alt', seed, 'ok', 5000, 2, 50, 9000, 10, day, gz({ seed, inputs: [1, 0, 0, 0], actions: [] }));
  // C: von Hand eingetragen, keine Partie
  addScore.run('manuell-test', 'Handarbeit', 999999, 9, 900, 60000, 0, '0.2.0', 'manuell', day + 2 * 86_400_000);
  // D: zwei gleiche Einträge, eine Partie → nicht zuordenbar
  for (const r of ['run-d1', 'run-d2']) addScore.run(r, 'Zwilling', 7000, 3, 70, 12000, 20, '0.5.2', 'alt', day);
  addPlay.run('0.5.2', 'alt', 3, 'ok', 7000, 3, 70, 12000, 20, day, gz({ seed: 3, inputs: [1, 0, 0, 0], actions: [] }));
  // E: passende Partie wurde abgelehnt → zählt nicht
  addScore.run('run-e', 'Abgelehnt', 8000, 3, 80, 13000, 30, '0.5.2', 'alt', day);
  addPlay.run('0.5.2', 'alt', 4, 'Die Spielzeit ist länger als möglich.', 8000, 3, 80, 13000, 30, day, gz({ seed: 4, inputs: [1, 0, 0, 0], actions: [] }));
  old.close();

  let rs = await startServer('replay', { TIME_FACTOR: '100000' });
  try {
    check('Backfill: 1 Eintrag verknüpft, 5 ohne Aufzeichnung (mehrdeutig, von Hand, Zwillinge, abgelehnt)', /Replays nachgetragen: 1, weiter ohne Aufzeichnung: 5/.test(rs.log()), rs.log());
    const l1 = (await api(rs.base, 'GET', '/api/replays')).json;
    const byName = (l) => Object.fromEntries(l.replays.map((r) => [r.name + (r.id === 5 ? '2' : ''), r]));
    const n1 = byName(l1);
    check('Liste nach Migration: alle Einträge, nur der eindeutige mit Replay', l1.total === 6 && l1.replays.length === 6 && n1.Altspieler.hasReplay === true && n1.Altspieler.playable === true &&
      l1.replays.filter((r) => r.hasReplay).length === 1 && n1.Handarbeit.hasReplay === false && n1.Handarbeit.playable === false, JSON.stringify(l1));
    check('Liste: Felder und Platz nach Punkten', l1.replays[0].name === 'Handarbeit' && l1.replays[0].rank === 1 && l1.replays[0].date === '2026-11-17' &&
      JSON.stringify(Object.keys(l1.replays[0]).sort()) === JSON.stringify(['date', 'hasReplay', 'id', 'kills', 'name', 'playable', 'rank', 'score', 'sector', 'ticks', 'version']), JSON.stringify(l1.replays[0]));
    const one = await fetch(rs.base + `/api/replays/${n1.Altspieler.id}`, { headers: { 'Accept-Encoding': 'gzip' } });
    const oneJson = await one.json();
    check('Einzelabruf nach Backfill: Replay der Telemetrie-Partie, gzip', one.status === 200 && one.headers.get('content-encoding') === 'gzip' && oneJson.name === 'Altspieler' && oneJson.version === '0.3.0' &&
      oneJson.playable === true && JSON.stringify(oneJson.replay) === JSON.stringify(gameA.replay) && !('createdAt' in oneJson));
    const none = (await api(rs.base, 'GET', `/api/replays/${n1.Handarbeit.id}`)).json;
    check('Einzelabruf ohne Aufzeichnung: replay null, nicht abspielbar', none.replay === null && none.hasReplay === false && none.playable === false, JSON.stringify(none));
    check('Einzelabruf unbekannt → 404', (await api(rs.base, 'GET', '/api/replays/99999')).status === 404 && (await api(rs.base, 'GET', '/api/replays/abc')).status === 404);
  } finally {
    await stopServer(rs);
  }

  // zweiter Start: nichts mehr zu tun (idempotent), neue Einträge speichern ihr Replay selbst
  rs = await startServer('replay', { TIME_FACTOR: '100000' });
  try {
    check('Backfill beim zweiten Start: nichts Neues', /Replays nachgetragen: 0, weiter ohne Aufzeichnung: 5/.test(rs.log()), rs.log());
    const again = (await api(rs.base, 'GET', '/api/replays')).json;
    check('Backfill idempotent', again.replays.filter((r) => r.hasReplay).length === 1);

    const run = (await api(rs.base, 'POST', '/api/runs')).json;
    let game;
    for (let i = 0; i < 5; i++) { game = playBot(run.seed, 5); if (game.stats.score > 0) break; }
    const sub = await api(rs.base, 'POST', '/api/scores', { token: run.token, name: 'Neuling', replay: game.replay, version: APP_VERSION });
    check('neuer Eintrag', sub.status === 201, sub.text);
    const mine = (await api(rs.base, 'GET', `/api/replays/${sub.json.id}`)).json;
    check('neuer Eintrag speichert sein Replay', mine.hasReplay === true && mine.playable === true && mine.rank === 1 && mine.version === APP_VERSION &&
      JSON.stringify(mine.replay) === JSON.stringify(game.replay) && mine.score === game.stats.score && mine.ticks === game.stats.ticks);
    const sim = simulateReplay(mine.replay);
    check('abgerufenes Replay rechnet auf das Ergebnis des Eintrags', sim.valid && sim.score === mine.score && sim.sector === mine.sector);

    const board = (await api(rs.base, 'GET', '/api/scores?all=1')).json;
    check('Bestenliste meldet je Eintrag, ob es eine Wiedergabe gibt', board.scores.find((e) => e.name === 'Neuling').replay === true && board.scores.find((e) => e.name === 'Handarbeit').replay === false, JSON.stringify(board.scores));

    const byDate = (await api(rs.base, 'GET', '/api/replays?sort=date')).json;
    check('Liste sort=date: neueste zuerst, Platz bleibt der nach Punkten', byDate.sort === 'date' && byDate.replays[0].name === 'Neuling' && byDate.replays.find((r) => r.name === 'Handarbeit').rank === 1, JSON.stringify(byDate.replays.map((r) => [r.name, r.rank, r.date])));
    const bySector = (await api(rs.base, 'GET', '/api/replays?sort=sector&dir=asc')).json;
    const secs = bySector.replays.map((r) => r.sector);
    check('Liste sort=sector&dir=asc', bySector.dir === 'asc' && secs.every((v, i) => i === 0 || secs[i - 1] <= v), secs.join(','));
    const pg = (await api(rs.base, 'GET', '/api/replays?limit=2&offset=1')).json;
    check('Liste limit/offset', pg.replays.length === 2 && pg.offset === 1 && pg.total === 7 && pg.replays[0].rank === 2, JSON.stringify(pg.replays.map((r) => r.rank)));
    const v052 = (await api(rs.base, 'GET', '/api/replays?version=0.5.2')).json;
    check('Liste version=0.5.2: nur diese Version, Platz innerhalb der Version', v052.version === '0.5.2' && v052.all === false && v052.total === 4 && v052.replays.every((r) => r.version === '0.5.2') && v052.replays[0].rank === 1, JSON.stringify(v052));
    const v04 = (await api(rs.base, 'GET', '/api/replays?version=0.4.0')).json;
    check('Liste version ohne Einträge → Vorgängerversion', v04.version === '0.3.0' && v04.fallback === true && v04.replays.length === 1, JSON.stringify(v04));
    const allv = (await api(rs.base, 'GET', '/api/replays?version=all')).json;
    check('Liste version=all mit Versionsübersicht', allv.all === true && allv.total === 7 && allv.current === APP_VERSION && allv.versions[0].version === APP_VERSION &&
      allv.versions.find((v) => v.version === '0.5.2').n === 4, JSON.stringify(allv.versions));

    const st = await api(rs.base, 'GET', '/api/stats');
    const s = st.json;
    const weapons = game.replay.actions.filter((x) => x.t === 'weapon').length + gameA.replay.actions.filter((x) => x.t === 'weapon').length;
    check('Statistik: Summen', st.status === 200 && s.games === 7 && s.withReplay === 2 && s.bestScore === 999999 && s.bestSector === 9 &&
      s.playSeconds === Math.round((a.ticks + 9000 + 60000 + 24000 + 13000 + game.stats.ticks) / 60), JSON.stringify({ ...s, days: undefined }));
    check('Statistik: je Version, Sektoren, Tage', s.versions[0].version === APP_VERSION && s.versions.find((v) => v.version === '0.5.2').games === 4 &&
      s.sectors.reduce((n, x) => n + x.n, 0) === 7 && s.sectors.find((x) => x.sector === 3).n >= 3 && s.days.reduce((n, x) => n + x.n, 0) === 7 &&
      s.days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)), JSON.stringify([s.versions, s.sectors, s.days]));
    check('Statistik: Käufe aus den Replay-Aktionen', weapons > 0 && s.weapons.reduce((n, x) => n + x.n, 0) === weapons && s.weapons.every((w) => w.games >= 1 && w.games <= 2) &&
      s.repairs === [...game.replay.actions, ...gameA.replay.actions].filter((x) => x.t === 'repair').length && s.skills.length > 0, JSON.stringify([weapons, s.weapons, s.shipStats, s.skills]));
    check('Statistik: keine Namen, keine Uhrzeiten, 60 s cachebar', !/Altspieler|Neuling|Handarbeit|createdAt|"name"/.test(st.text) && /max-age=60/.test(st.headers.get('cache-control') ?? ''), st.headers.get('cache-control'));

    const pageRes = await fetch(rs.base + '/replay', { headers: { 'Accept-Encoding': 'gzip' } });
    const pageText = await pageRes.text();
    check('/replay: eigene Seite, noindex, CSP, gzip, ETag', pageRes.status === 200 && pageText.includes('Replays</title>') && /noindex/.test(pageRes.headers.get('x-robots-tag') ?? '') &&
      (pageRes.headers.get('content-security-policy') ?? '').includes("connect-src 'self'") && pageRes.headers.get('content-encoding') === 'gzip' && !!pageRes.headers.get('etag'));
    const cached = await fetch(rs.base + '/replay', { headers: { 'If-None-Match': pageRes.headers.get('etag') } });
    check('/replay: 304 bei gleichem ETag', cached.status === 304);
    const slash = await fetch(rs.base + '/replay/', { redirect: 'manual' });
    check('/replay/ leitet relativ um', slash.status === 301 && slash.headers.get('location') === '../replay', slash.headers.get('location') ?? '');
    check('/replay nur lesend', (await api(rs.base, 'POST', '/replay', {})).status === 405);

    const del = await api(rs.base, 'DELETE', `/api/scores/${sub.json.id}`, undefined, { headers: { Authorization: `Bearer ${ADMIN}` } });
    const gone = await api(rs.base, 'GET', `/api/replays/${sub.json.id}`);
    const st2 = (await api(rs.base, 'GET', '/api/stats')).json;
    check('mit dem Eintrag verschwindet das Replay (auch aus der Statistik)', del.status === 200 && gone.status === 404 && st2.games === 6 && st2.withReplay === 1, JSON.stringify([del.status, gone.status, st2.games]));
  } finally {
    await stopServer(rs);
  }
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
process.exit(failed ? 1 : 0);
