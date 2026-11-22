// Seeded PRNG (mulberry32). Für alles Spielrelevante, nie Math.random in src/core.
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** gleichverteilt in [0, 1) */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** ganzzahlig in [0, n) */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** gewichtete Auswahl */
  weighted<T>(items: readonly { w: number; v: T }[]): T {
    let sum = 0;
    for (const it of items) sum += it.w;
    let r = this.next() * sum;
    for (const it of items) {
      r -= it.w;
      if (r < 0) return it.v;
    }
    return items[items.length - 1].v;
  }
}
