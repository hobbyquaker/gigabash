// Deterministische Mathematik für die Spiellogik.
//
// Die Sim muss in jedem Browser (V8, JavaScriptCore/Safari, SpiderMonkey/Firefox) und in Node
// bitgleich rechnen, sonst weicht die Nachrechnung auf dem Server ab und ehrliche Ergebnisse
// werden abgelehnt (passiert mit Safari: Math.pow/sin/atan2/hypot liefern dort in der letzten
// Stelle andere Werte als V8). Nach IEEE 754 exakt gerundet – und damit überall gleich – sind
// nur + − × ÷, Math.sqrt, Math.floor/ceil/round/abs/min/max. Deshalb hier eigene Funktionen,
// die ausschließlich darauf aufbauen. Genauigkeit ~1e-14 – mehr braucht das Spiel nicht.
//
// REGEL: In src/core/** kein Math.sin/cos/tan/atan/atan2/pow/hypot/exp/log und kein `**` –
// stattdessen diese Funktionen (Test: tests/determinism.test.ts prüft das per Quelltextsuche).

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;
const LN2 = 0.6931471805599453;

/** Sinus: Reduktion auf [−π/2, π/2], dann Taylorreihe bis x¹⁹ (Fehler < 1e-15) */
export function dsin(x: number): number {
  if (!isFinite(x)) return NaN;
  let r = x - Math.round(x / TWO_PI) * TWO_PI;
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return (
    r *
    (1 +
      r2 *
        (-1 / 6 +
          r2 *
            (1 / 120 +
              r2 *
                (-1 / 5040 +
                  r2 *
                    (1 / 362880 +
                      r2 *
                        (-1 / 39916800 +
                          r2 * (1 / 6227020800 + r2 * (-1 / 1307674368000 + r2 * (1 / 355687428096000 + r2 * (-1 / 121645100408832000))))))))))
  );
}

/** Kosinus über den Sinus */
export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** Arkustangens: Reduktion auf |x| ≤ 1, zweimal Halbierungsformel, dann Taylorreihe */
export function datan(x: number): number {
  if (x !== x) return NaN;
  if (x > 1) return HALF_PI - datan(1 / x);
  if (x < -1) return -HALF_PI - datan(1 / x);
  // atan(x) = 2·atan(x / (1 + √(1 + x²))) → zweimal angewandt: |t| ≤ tan(π/16) ≈ 0,199
  let t = x / (1 + Math.sqrt(1 + x * x));
  t = t / (1 + Math.sqrt(1 + t * t));
  const t2 = t * t;
  let sum = 0;
  let term = t;
  for (let k = 0; k < 14; k++) {
    sum += term / (2 * k + 1) * (k % 2 === 0 ? 1 : -1);
    term *= t2;
  }
  return 4 * sum;
}

/** atan2 wie Math.atan2 (Winkel des Punktes (x, y)) */
export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

/** Länge des Vektors (x, y) – Math.hypot ist nicht exakt gerundet */
export function dhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Natürlicher Logarithmus für x > 0: x = m·2^e mit m ∈ [1, 2), ln m = 2·artanh((m−1)/(m+1)) */
export function dlog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let e = 0;
  let m = x;
  while (m >= 2) { m /= 2; e++; }
  while (m < 1) { m *= 2; e--; }
  const s = (m - 1) / (m + 1); // ∈ [0, 1/3)
  const s2 = s * s;
  let sum = 0;
  let term = s;
  for (let k = 0; k < 16; k++) {
    sum += term / (2 * k + 1);
    term *= s2;
  }
  return e * LN2 + 2 * sum;
}

/** e^x: x = k·ln2 + r mit |r| ≤ ln2/2, Taylorreihe für e^r, dann ×2^k (exakt) */
export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let sum = 1;
  let term = 1;
  for (let i = 1; i < 22; i++) {
    term = term * r / i;
    sum += term;
  }
  let p = 1;
  if (k > 0) for (let i = 0; i < k; i++) p *= 2;
  else for (let i = 0; i < -k; i++) p /= 2;
  return sum * p;
}

/** x^y für x ≥ 0 (im Spiel nur positive Basen); ganzzahlige kleine Exponenten exakt per Multiplikation */
export function dpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (y === 1) return x;
  if (y === 2) return x * x;
  if (y === 3) return x * x * x;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN;
  return dexp(y * dlog(x));
}
