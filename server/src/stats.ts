import { gunzipSync } from 'node:zlib';
import type { Store } from './db';
import { TICK_RATE } from '../../src/core/config';

// Gesamtstatistik für die Wiedergabeseite (GET /api/stats): nur Summen über die Bestenlisten-Einträge
// und ihre Replays – keine Namen, keine Uhrzeiten, keine einzelnen Partien.

export interface StatsReport {
  /** Bestenlisten-Einträge gesamt, davon mit Aufzeichnung */
  games: number;
  withReplay: number;
  /** Spielzeit in Sekunden: Summe, längste Partie, Mittel */
  playSeconds: number;
  longestSeconds: number;
  kills: number;
  bestScore: number;
  bestSector: number;
  /** je Spielversion (neueste zuerst) */
  versions: { version: string; games: number; playSeconds: number; bestScore: number; bestSector: number; avgSector: number }[];
  /** wie viele Partien in welchem Sektor endeten */
  sectors: { sector: number; n: number }[];
  /** Partien je Tag (YYYY-MM-DD, Europe/Berlin) */
  days: { date: string; n: number }[];
  /** Käufe beim Händler aus den Replays: Zahl der Käufe und der Partien, in denen es gekauft wurde */
  weapons: BuyCount[];
  shipStats: BuyCount[];
  skills: BuyCount[];
  /** übrige Händler-Aktionen */
  upgrades: number;
  repairs: number;
  bombs: number;
  sells: number;
}

export interface BuyCount {
  id: string;
  n: number;
  games: number;
}

/** Käufe einer Partie (aus den Replay-Aktionen); unveränderlich, daher je Eintrag gemerkt */
interface Buys {
  weapons: Record<string, number>;
  stats: Record<string, number>;
  skills: Record<string, number>;
  upgrades: number;
  repairs: number;
  bombs: number;
  sells: number;
}

const buyCache = new Map<number, Buys>();

function buysOf(blob: Uint8Array): Buys {
  const b: Buys = { weapons: Object.create(null), stats: Object.create(null), skills: Object.create(null), upgrades: 0, repairs: 0, bombs: 0, sells: 0 };
  const replay = JSON.parse(gunzipSync(blob).toString('utf8')) as { actions?: { t: string; id?: string; w?: string }[] };
  const inc = (rec: Record<string, number>, k: unknown) => {
    if (typeof k === 'string' && k.length <= 24) rec[k] = (rec[k] ?? 0) + 1;
  };
  for (const a of replay.actions ?? []) {
    if (a.t === 'weapon') inc(b.weapons, a.w);
    else if (a.t === 'stat') inc(b.stats, a.id);
    else if (a.t === 'skill') inc(b.skills, a.id);
    else if (a.t === 'upgrade') b.upgrades++;
    else if (a.t === 'repair') b.repairs++;
    else if (a.t === 'bomb') b.bombs++;
    else if (a.t === 'sell') b.sells++;
  }
  return b;
}

const cmpVersion = (a: string, b: string) => {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

export function buildStats(store: Store, dayOf: (ms: number) => string): StatsReport {
  const rows = store.statRows();
  const live = new Set<number>();
  const versions = new Map<string, { games: number; ticks: number; bestScore: number; bestSector: number; sectors: number }>();
  const sectors = new Map<number, number>();
  const days = new Map<string, number>();
  const sum = { weapons: new Map<string, BuyCount>(), stats: new Map<string, BuyCount>(), skills: new Map<string, BuyCount>() };
  const r: StatsReport = {
    games: rows.length, withReplay: 0, playSeconds: 0, longestSeconds: 0, kills: 0, bestScore: 0, bestSector: 0,
    versions: [], sectors: [], days: [], weapons: [], shipStats: [], skills: [], upgrades: 0, repairs: 0, bombs: 0, sells: 0,
  };
  let ticks = 0;
  let longest = 0;
  for (const s of rows) {
    live.add(s.id);
    ticks += s.ticks;
    longest = Math.max(longest, s.ticks);
    r.kills += s.kills;
    r.bestScore = Math.max(r.bestScore, s.score);
    r.bestSector = Math.max(r.bestSector, s.sector);
    const v = versions.get(s.version) ?? { games: 0, ticks: 0, bestScore: 0, bestSector: 0, sectors: 0 };
    v.games++;
    v.ticks += s.ticks;
    v.bestScore = Math.max(v.bestScore, s.score);
    v.bestSector = Math.max(v.bestSector, s.sector);
    v.sectors += s.sector;
    versions.set(s.version, v);
    sectors.set(s.sector, (sectors.get(s.sector) ?? 0) + 1);
    const day = dayOf(s.createdAt);
    days.set(day, (days.get(day) ?? 0) + 1);
    if (!s.hasReplay) continue;
    let b = buyCache.get(s.id);
    if (!b) {
      const blob = store.replayBlob(s.id);
      if (!blob) continue;
      try {
        b = buysOf(blob);
      } catch {
        continue; // beschädigte Aufzeichnung: zählt nur als Partie
      }
      buyCache.set(s.id, b);
    }
    r.withReplay++;
    for (const [kind, rec] of [['weapons', b.weapons], ['stats', b.stats], ['skills', b.skills]] as const) {
      for (const id of Object.keys(rec)) {
        const c = sum[kind].get(id) ?? { id, n: 0, games: 0 };
        c.n += rec[id];
        c.games++;
        sum[kind].set(id, c);
      }
    }
    r.upgrades += b.upgrades;
    r.repairs += b.repairs;
    r.bombs += b.bombs;
    r.sells += b.sells;
  }
  // gelöschte Einträge aus dem Merkzettel werfen
  for (const id of buyCache.keys()) if (!live.has(id)) buyCache.delete(id);
  const top = (m: Map<string, BuyCount>) => [...m.values()].sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  r.playSeconds = Math.round(ticks / TICK_RATE);
  r.longestSeconds = Math.round(longest / TICK_RATE);
  r.versions = [...versions.entries()]
    .sort((a, b) => cmpVersion(b[0], a[0]))
    .map(([version, v]) => ({
      version, games: v.games, playSeconds: Math.round(v.ticks / TICK_RATE), bestScore: v.bestScore, bestSector: v.bestSector,
      avgSector: Math.round((10 * v.sectors) / v.games) / 10,
    }));
  r.sectors = [...sectors.entries()].sort((a, b) => a[0] - b[0]).map(([sector, n]) => ({ sector, n }));
  r.days = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, n]) => ({ date, n }));
  r.weapons = top(sum.weapons);
  r.shipStats = top(sum.stats);
  r.skills = top(sum.skills);
  return r;
}
