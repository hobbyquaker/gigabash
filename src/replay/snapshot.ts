/**
 * Schlüsselbilder (Snapshots) des Sim-Zustands für die Wiedergabe.
 *
 * Die Sim ist deterministisch: aus Seed, Eingaben und Shop-Aktionen ergibt sich jeder Zustand – aber
 * nur durch Vorrechnen vom Anfang. Zum Scrubben braucht es Zwischenstände, aus denen sich die Sim
 * exakt wiederherstellen lässt (Zufallsstände, Wellen-Zeitplan, Abklingzeiten, Geschosse …).
 *
 * Statt je Kern-Version eigene Serialisierer zu schreiben, läuft ein generischer Durchlauf über den
 * Objektgraphen der Sim:
 *  - `takeSnapshot` kopiert alle eigenen Datenfelder (keine Funktionen, keine Getter) in reine Daten,
 *    die `structuredClone`-fähig sind (Worker → Hauptthread). Geteilte Referenzen (z. B. `boss`, der
 *    auch in `enemies` steht) bleiben über ein Memo erhalten.
 *  - `hydrate` mischt einen Snapshot in eine frische Sim derselben Version: Klasseninstanzen (Sim,
 *    Rng) behalten Prototyp und Methoden, nur ihre Datenfelder werden überschrieben; Listen und Maps
 *    werden ersetzt.
 *
 * Nicht übernommen werden das Eingabe- und Aktionsprotokoll der Sim (`log`, `actions` – im Replay
 * ohnehin bekannt, sie würden jedes Schlüsselbild mit der Partie wachsen lassen) und `events`.
 * tests/replay.test.ts prüft für jede Version: aus einem Schlüsselbild weitergerechnet == durchgerechnet.
 */

/** Felder der Sim selbst, die kein Teil des Zustands sind */
const SKIP_TOP = new Set(['log', 'actions', 'events']);

/** Zustand der Sim als reine Daten (structuredClone-fähig) */
export function takeSnapshot(sim: object): unknown {
  const memo = new Map<object, unknown>();
  const walk = (v: unknown, top: boolean): unknown => {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    const seen = memo.get(v);
    if (seen !== undefined) return seen;
    if (ArrayBuffer.isView(v)) {
      const c = (v as unknown as { slice(): unknown }).slice();
      memo.set(v, c);
      return c;
    }
    if (Array.isArray(v)) {
      const a: unknown[] = [];
      memo.set(v, a);
      for (const x of v) a.push(walk(x, false));
      return a;
    }
    if (v instanceof Map) {
      const m = new Map<unknown, unknown>();
      memo.set(v, m);
      for (const [k, x] of v) m.set(walk(k, false), walk(x, false));
      return m;
    }
    if (v instanceof Set) {
      const s = new Set<unknown>();
      memo.set(v, s);
      for (const x of v) s.add(walk(x, false));
      return s;
    }
    const o: Record<string, unknown> = {};
    memo.set(v, o);
    for (const k of Object.keys(v)) {
      if (top && SKIP_TOP.has(k)) continue;
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (!d || !('value' in d)) continue; // Getter/Setter
      const x = d.value;
      if (typeof x === 'function') continue;
      o[k] = walk(x, false);
    }
    return o;
  };
  return walk(sim, true);
}

/**
 * Snapshot in eine frische Sim derselben Version (gleicher Seed) mischen. Danach rechnet `target`
 * exakt so weiter wie die Sim, von der der Snapshot stammt.
 */
export function hydrate(target: object, snap: unknown): void {
  const memo = new Map<object, unknown>();
  const mergeable = (x: unknown) =>
    !!x && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Map) && !(x instanceof Set) && !ArrayBuffer.isView(x);
  const resolve = (s: unknown, existing: unknown): unknown => {
    if (s === null || typeof s !== 'object') return s;
    const seen = memo.get(s);
    if (seen !== undefined) return seen;
    if (ArrayBuffer.isView(s)) {
      const c = (s as unknown as { slice(): unknown }).slice();
      memo.set(s, c);
      return c;
    }
    if (Array.isArray(s)) {
      const a: unknown[] = [];
      memo.set(s, a);
      for (const x of s) a.push(resolve(x, undefined));
      return a;
    }
    if (s instanceof Map) {
      const m = new Map<unknown, unknown>();
      memo.set(s, m);
      for (const [k, x] of s) m.set(resolve(k, undefined), resolve(x, undefined));
      return m;
    }
    if (s instanceof Set) {
      const set = new Set<unknown>();
      memo.set(s, set);
      for (const x of s) set.add(resolve(x, undefined));
      return set;
    }
    // Objekt: vorhandene Instanz im Ziel (Klasse mit Methoden) behalten und befüllen, sonst neu
    const o = mergeable(existing) ? (existing as object) : {};
    memo.set(s, o);
    merge(o, s as Record<string, unknown>);
    return o;
  };
  const merge = (t: object, s: Record<string, unknown>) => {
    const tr = t as Record<string, unknown>;
    // Schlüssel, die es im Snapshot nicht gibt (z. B. ein Eintrag weniger in einer Tabelle), entfernen
    for (const k of Object.keys(t)) {
      if (k in s || (t === target && SKIP_TOP.has(k))) continue;
      const d = Object.getOwnPropertyDescriptor(t, k);
      if (d && 'value' in d && typeof d.value !== 'function') delete tr[k];
    }
    for (const k of Object.keys(s)) {
      const d = Object.getOwnPropertyDescriptor(t, k);
      if (d && !('value' in d)) continue; // Getter im Ziel bleiben
      tr[k] = resolve(s[k], tr[k]);
    }
  };
  merge(target, snap as Record<string, unknown>);
}

/**
 * Kanonische Textform eines Snapshots (für Vergleiche in Tests). Zahlen bleiben in voller Genauigkeit,
 * Maps/Sets werden ausgeschrieben, geteilte Referenzen expandiert.
 */
export function canonical(snap: unknown): string {
  const out: string[] = [];
  const stack = new Set<object>();
  const walk = (v: unknown) => {
    if (v === undefined) return out.push('u');
    if (v === null) return out.push('n');
    if (typeof v === 'number') return out.push(Object.is(v, -0) ? '-0' : String(v));
    if (typeof v !== 'object') return out.push(JSON.stringify(v));
    if (stack.has(v)) return out.push('~'); // Zyklus
    stack.add(v);
    if (ArrayBuffer.isView(v)) out.push('T[', Array.from(v as unknown as ArrayLike<number>).join(','), ']');
    else if (Array.isArray(v)) {
      out.push('[');
      for (const x of v) {
        walk(x);
        out.push(',');
      }
      out.push(']');
    } else if (v instanceof Map) {
      out.push('M{');
      for (const [k, x] of v) {
        walk(k);
        out.push(':');
        walk(x);
        out.push(',');
      }
      out.push('}');
    } else if (v instanceof Set) {
      out.push('S{');
      for (const x of v) {
        walk(x);
        out.push(',');
      }
      out.push('}');
    } else {
      out.push('{');
      for (const k of Object.keys(v).sort()) {
        out.push(k, ':');
        walk((v as Record<string, unknown>)[k]);
        out.push(',');
      }
      out.push('}');
    }
    stack.delete(v);
  };
  walk(snap);
  return out.join('');
}

/** FNV-1a über die kanonische Form, als Hex */
export function digest(snap: unknown): string {
  const s = canonical(snap);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
