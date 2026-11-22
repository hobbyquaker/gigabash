import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

// Signierter Spielstart: Token = base64url(JSON).base64url(HMAC-SHA256(SECRET, "run." + JSON-Teil))

export interface RunClaim {
  /** Run-ID */
  r: string;
  /** Seed (uint32), vom Server gewürfelt */
  s: number;
  /** Startzeitpunkt (ms seit Epoch, Serverzeit) */
  t: number;
  /** Spielversion des Servers beim Start */
  v: string;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function sign(secret: string, payload: string) {
  return createHmac('sha256', secret).update(`run.${payload}`).digest();
}

export function newRun(secret: string, version: string, now = Date.now()): { claim: RunClaim; token: string } {
  const claim: RunClaim = { r: randomUUID(), s: randomBytes(4).readUInt32BE(0), t: now, v: version };
  const payload = b64(JSON.stringify(claim));
  return { claim, token: `${payload}.${b64(sign(secret, payload))}` };
}

/** Liefert den Inhalt nur bei gültiger Signatur, sonst null */
export function verifyToken(secret: string, token: unknown): RunClaim | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = sign(secret, payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RunClaim;
    if (typeof c.r !== 'string' || !Number.isInteger(c.s) || !Number.isFinite(c.t) || typeof c.v !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}

/** Zeitkonstanter Vergleich (Admin-Token) */
export function safeEqual(a: string, b: string) {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}
