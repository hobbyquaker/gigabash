/**
 * Kennzahlen einer Partie, im Vorrechen-Worker beim Durchrechnen gesammelt: Verlauf von Punkten,
 * Credits und Hülle, Abschüsse und Treffer je Sektor, Käufe je Händlerbesuch und die Marken der
 * Zeitleiste (Sektoren, Endgegner, Händler). Liest nur Felder und Ereignisse, die alle Kern-Versionen
 * kennen; was ältere nicht haben (Streifschüsse, Sperrfeuer), bleibt 0.
 */
import type { SimEvent } from '../core/sim/types';
import type { CoreSim } from './cores';
import type { Purchase } from './run';

export interface Mark {
  tick: number;
  kind: 'sector' | 'boss' | 'shop' | 'phoenix' | 'over';
  /** Sektor, zu dem die Marke gehört */
  sector: number;
  label: string;
}

export interface SectorStats {
  sector: number;
  /** Tick, an dem der Sektor begann */
  start: number;
  /** Tick, an dem der Endgegner erschien / fiel (−1 = nicht erreicht) */
  bossAt: number;
  clearAt: number;
  kills: number;
  /** Treffer am Schiff (Hülle und Schild) und verlorene Hülle */
  hits: number;
  damage: number;
  /** im Sektor geholte Punkte und Credits */
  score: number;
  credits: number;
  grazes: number;
  bombs: number;
  /** ohne Treffer geschafft */
  noHit: boolean;
}

export interface ShopVisit {
  tick: number;
  /** Sektor, nach dem eingekauft wurde */
  sector: number;
  creditsBefore: number;
  spent: number;
  items: Purchase[];
}

export interface GameStats {
  /** Abstand der Verlaufs-Stichproben in Ticks */
  every: number;
  /** Verlauf: Punkte, Credits auf der Hand, Credits gesamt verdient, Hülle in % */
  score: number[];
  credits: number[];
  earned: number[];
  hull: number[];
  sectors: SectorStats[];
  shops: ShopVisit[];
  marks: Mark[];
  end: { score: number; sector: number; kills: number; ticks: number; credits: number; over: boolean };
}

export class Analyzer {
  readonly marks: Mark[] = [];
  private sectors: SectorStats[] = [];
  private shops: ShopVisit[] = [];
  private score: number[] = [0];
  private credits: number[] = [0];
  private earned: number[] = [0];
  private hull: number[] = [100];
  private cur: SectorStats;
  private score0 = 0;
  private credits0 = 0;
  private over = false;

  /** @param every Abstand der Stichproben in Ticks */
  constructor(private sim: CoreSim, readonly every: number) {
    this.cur = this.open(sim.sector, 0);
  }

  private open(sector: number, tick: number): SectorStats {
    const s: SectorStats = { sector, start: tick, bossAt: -1, clearAt: -1, kills: 0, hits: 0, damage: 0, score: 0, credits: 0, grazes: 0, bombs: 0, noHit: false };
    this.sectors.push(s);
    this.marks.push({ tick, kind: 'sector', sector, label: `Sektor ${sector}` });
    this.score0 = this.sim.score;
    this.credits0 = this.sim.totalCredits;
    return s;
  }

  /** nach jedem Tick mit dessen Ereignissen aufrufen */
  onTick(events: SimEvent[]) {
    const sim = this.sim;
    const c = this.cur;
    for (const ev of events) {
      switch (ev.e) {
        case 'kill':
          c.kills++;
          break;
        case 'playerHit':
          c.hits++;
          if (!ev.shield) c.damage += ev.dmg;
          break;
        case 'graze':
          c.grazes++;
          break;
        case 'bomb':
          c.bombs++;
          break;
        case 'bossSpawn':
          c.bossAt = sim.tick;
          this.marks.push({ tick: sim.tick, kind: 'boss', sector: c.sector, label: `Endgegner Sektor ${c.sector}` });
          break;
        case 'bossDown':
          c.clearAt = sim.tick;
          break;
        case 'sectorClear':
          c.noHit = ev.summary.noHit;
          break;
        case 'phoenix':
          this.marks.push({ tick: sim.tick, kind: 'phoenix', sector: c.sector, label: 'Phönix (zweite Chance)' });
          break;
        case 'gameOver':
          this.over = true;
          this.marks.push({ tick: sim.tick, kind: 'over', sector: c.sector, label: 'Schiff zerstört' });
          break;
      }
    }
    c.score = sim.score - this.score0;
    c.credits = sim.totalCredits - this.credits0;
    if (sim.tick % this.every === 0) {
      this.score.push(sim.score);
      this.credits.push(sim.credits);
      this.earned.push(sim.totalCredits);
      this.hull.push(Math.max(0, Math.round((100 * sim.player.hull) / Math.max(1, sim.d.maxHull))));
    }
  }

  /** Händlerbesuch: vor dem Ausführen der Käufe `creditsBefore` merken, danach die Käufe melden */
  onShop(creditsBefore: number, items: Purchase[]) {
    const tick = this.sim.tick;
    this.shops.push({ tick, sector: this.cur.sector, creditsBefore, spent: items.reduce((n, p) => n + p.cost, 0), items });
    this.marks.push({ tick, kind: 'shop', sector: this.cur.sector, label: `Händler nach Sektor ${this.cur.sector}` });
  }

  /** nach dem Start aus dem Händler (Sektor hat gewechselt) */
  onLaunch() {
    if (this.sim.sector !== this.cur.sector) this.cur = this.open(this.sim.sector, this.sim.tick);
  }

  finish(): GameStats {
    const sim = this.sim;
    return {
      every: this.every, score: this.score, credits: this.credits, earned: this.earned, hull: this.hull,
      sectors: this.sectors, shops: this.shops, marks: this.marks,
      end: { score: sim.score, sector: sim.sector, kills: sim.kills, ticks: sim.tick, credits: sim.totalCredits, over: this.over },
    };
  }
}
