import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Konfiguration ausschließlich über Umgebungsvariablen.

const here = dirname(fileURLToPath(import.meta.url));

function num(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`Umgebungsvariable ${name} ist keine Zahl: ${raw}`);
  return v;
}

function secret(): string {
  const s = process.env.SECRET;
  if (s && s.length >= 16) return s;
  if (s) throw new Error('SECRET muss mindestens 16 Zeichen lang sein');
  console.warn('[oganesson] Kein SECRET gesetzt: zufälliger Schlüssel, laufende Spiele werden nach einem Neustart ungültig.');
  return randomBytes(32).toString('hex');
}

export const config = {
  port: num('PORT', 8080),
  host: process.env.HOST || '0.0.0.0',
  secret: secret(),
  /** Leer = Admin-Endpunkte abgeschaltet */
  adminToken: process.env.ADMIN_TOKEN || '',
  dbPath: process.env.DB_PATH || resolve(here, '../../data/oganesson.db'),
  /** Gebaute Single-File-Version des Spiels; daneben liegt third-party-licenses.txt */
  gameFile: process.env.GAME_FILE || resolve(here, '../../dist/oganesson.html'),
  /** Gebaute Wiedergabeseite (/replay), liegt neben der Spiel-Datei */
  replayFile: process.env.REPLAY_FILE || resolve(dirname(process.env.GAME_FILE || resolve(here, '../../dist/oganesson.html')), 'replay.html'),
  /** Icons und Vorschaubilder (assets/public), werden unter / ausgeliefert */
  publicDir: process.env.PUBLIC_DIR || resolve(here, '../../assets/public'),
  /** Öffentliche Adresse des Spiels ohne / am Ende, z. B. https://example.com/gigabash (für die Link-Vorschau) */
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  /**
   * Größte Anfrage in Bytes, nach dem Entpacken (gzip-Upload ist erlaubt). Ein Replay kostet
   * ~25 KB JSON pro Spielminute (Bot-Partien), Touch-Steuerung eher mehr; 30 min ≈ 0,7–1,5 MB.
   */
  maxBody: num('MAX_BODY', 4_000_000),
  /** X-Forwarded-For auswerten (nur hinter einem vertrauenswürdigen Reverse-Proxy einschalten) */
  trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
  /**
   * Zeit-Plausibilität: Spielzeit ≤ Echtzeit × TIME_FACTOR × 1,02 + TIME_TOLERANCE.
   * Das Spiel läuft immer mit 1×; nur Tests setzen einen großen Faktor.
   */
  timeFactor: num('TIME_FACTOR', 1),
  /** Toleranz der Zeit-Plausibilität in Sekunden */
  timeTolerance: num('TIME_TOLERANCE', 10),
  /** Wie lange ein Spielstart gültig bleibt (Sekunden) */
  runMaxAge: num('RUN_MAX_AGE', 72 * 3600),
  /** Faktor für alle Rate-Limits (0 = aus, 2 = doppelt so großzügig) */
  rateScale: num('RATE_SCALE', 1),
  /** Worker-Threads für die Nachsimulation */
  verifyWorkers: Math.max(1, Math.round(num('VERIFY_WORKERS', 1))),
  /** Obergrenze einer Nachsimulation in Sekunden (eine 10-min-Partie rechnet ~0,1 s) */
  verifyTimeout: num('VERIFY_TIMEOUT', 30),
  /** Höchstzahl wartender Nachsimulationen; darüber antwortet der Server mit 503 */
  verifyQueue: Math.max(1, Math.round(num('VERIFY_QUEUE', 20))),
  /** Telemetrie (anonyme Replays aller Einsendungen) speichern: 0 = aus */
  telemetry: process.env.TELEMETRY !== '0',
};
