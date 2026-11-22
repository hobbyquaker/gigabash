// Gruppen von Spielversionen mit identischem Sim-Kern (Fingerabdruck aus scripts/build-server.mjs).
// Partien solcher Versionen sind unter gleichen Bedingungen gespielt und stehen gemeinsam in der Bestenliste.
declare const __SIM_HASHES__: Record<string, string>;

const HASHES: Record<string, string> = typeof __SIM_HASHES__ === 'undefined' ? {} : __SIM_HASHES__;

/** SemVer-Vergleich "a.b.c" */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Schlüssel der Gruppe (unbekannte Versionen bilden eine eigene Gruppe) */
export function simKey(version: string): string {
  return HASHES[version] ? `h:${HASHES[version]}` : `v:${version}`;
}

/** Alle bekannten Versionen derselben Gruppe, aufsteigend; `extra` = weitere Versionen (z. B. aus der DB) */
export function simGroup(version: string, extra: string[] = []): string[] {
  const k = simKey(version);
  const all = new Set([...Object.keys(HASHES), ...extra, version]);
  return [...all].filter((v) => simKey(v) === k).sort(cmpVersion);
}

/** Anzeige „0.6.0–1.0.0“ bzw. „1.0.0“ */
export function groupLabel(group: string[]): string {
  return group.length > 1 ? `${group[0]}–${group[group.length - 1]}` : group[0] ?? '';
}

/**
 * Sim-Version: fortlaufende Nummer je unterschiedlichem Sim-Kern, sortiert nach der ältesten
 * Spielversion des Kerns (0.2.0 = Sim 1, 0.3.0 = Sim 2, …). Unbekannte Versionen: 0.
 */
export function simNumber(version: string): number {
  const first = new Map<string, string>();
  for (const v of Object.keys(HASHES)) {
    const h = HASHES[v];
    const f = first.get(h);
    if (!f || cmpVersion(v, f) < 0) first.set(h, v);
  }
  const order = [...first.entries()].sort((a, b) => cmpVersion(a[1], b[1])).map(([h]) => h);
  const i = HASHES[version] ? order.indexOf(HASHES[version]) : -1;
  return i + 1;
}
