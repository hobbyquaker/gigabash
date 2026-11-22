// Einfaches Token-Bucket-Rate-Limiting pro IP, nur im Speicher.

interface Bucket {
  tokens: number;
  at: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  /**
   * @param capacity  maximale Anzahl Anfragen am Stück (0 = kein Limit)
   * @param perMinute Nachfüllrate
   */
  constructor(private capacity: number, private perMinute: number) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  /** true = erlaubt; sonst Wartezeit in Sekunden */
  take(key: string, now = Date.now()): true | number {
    if (this.capacity <= 0) return true;
    const rate = this.perMinute / 60_000;
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * rate);
    b.at = now;
    this.buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return Math.ceil((1 - b.tokens) / rate / 1000);
  }

  /** volle Eimer vergessen (Speicher begrenzen) */
  private sweep() {
    const now = Date.now();
    const full = this.capacity / (this.perMinute / 60_000);
    for (const [k, b] of this.buckets) if (now - b.at > full) this.buckets.delete(k);
  }
}
