/**
 * Ablauf eines Replays auf einem Sim-Kern: Eingaben (lauflängenkodiert) und Shop-Aktionen zu ihrem
 * Tick einspielen – dieselbe Reihenfolge wie `simulateReplay` (src/core/sim/replay.ts), aber Schritt
 * für Schritt, damit Wiedergabe, Vorrechen-Worker und Test denselben Code nutzen.
 *
 * Die Zeitachse der Wiedergabe ist der Sim-Tick. Der Händler verbraucht keine Ticks: alle Käufe eines
 * Besuchs tragen denselben Tick und enden mit `launch`.
 */
import type { Command, Replay, SimEvent } from '../core/sim/types';
import { SKILL_BY_ID, SLOT_NAMES, STAT_BY_ID, WEAPON_BY_ID, MAX_WEAPON_LVL } from '../core/data/shop';
import { createSim, type CoreSim } from './cores';
import { hydrate } from './snapshot';

export type ReplayData = Replay;

/** Ein Kauf (oder Verkauf) beim Händler, für Anzeige und Kennzahlen */
export interface Purchase {
  /** Art der Aktion */
  t: Command['t'];
  /** Anzeigetext, z. B. „Seitenkanone (Flügel links)“ */
  label: string;
  /** Kennung für die Statistik (Waffe, Schiffswert, Skill), sonst leer */
  id: string;
  /** bezahlte Credits (negativ = Erlös eines Verkaufs) */
  cost: number;
}

const name = (rec: Record<string, { name: string } | undefined>, id: string) => rec[id]?.name ?? id;

/** Anzeigetext eines Kommandos; `lvl` = Stufe der Waffe nach dem Ausbau */
export function describe(cmd: Command, lvl = 0): { label: string; id: string } {
  const slot = (s: string) => (SLOT_NAMES as Record<string, string>)[s] ?? s;
  switch (cmd.t) {
    case 'stat':
      return { label: name(STAT_BY_ID, cmd.id), id: cmd.id };
    case 'weapon':
      return { label: `${name(WEAPON_BY_ID, cmd.w)} (${slot(cmd.slot)})`, id: cmd.w };
    case 'upgrade':
      return { label: `Ausbau ${slot(cmd.slot)}${lvl ? (lvl >= MAX_WEAPON_LVL ? ' → Evolution' : ` → Stufe ${lvl}`) : ''}`, id: '' };
    case 'sell':
      return { label: `Verkauf ${slot(cmd.slot)}`, id: '' };
    case 'skill':
      return { label: `Skill: ${name(SKILL_BY_ID, cmd.id)}`, id: cmd.id };
    case 'repair':
      return { label: 'Reparatur', id: '' };
    case 'bomb':
      return { label: 'Smartbombe', id: '' };
    case 'launch':
      return { label: 'Start', id: '' };
  }
}

/** Gesamtlänge der Eingaben in Ticks (= Länge der Partie) */
export function inputTicks(inputs: number[]): number {
  let n = 0;
  for (let i = 0; i < inputs.length; i += 4) n += inputs[i];
  return n;
}

export class ReplayRun {
  sim: CoreSim;
  /** Länge der Partie in Ticks */
  readonly total: number;
  /** Index der nächsten Shop-Aktion */
  private ai = 0;
  /** Lauf der Eingaben, in dem der aktuelle Tick liegt, und dessen Ende (exklusiv) */
  private ri = 0;
  private runEnd = 0;
  /** Beginn jedes Laufs in Ticks (zum Springen) */
  private starts: Int32Array;
  ended = false;
  /** Tick des Händlerbesuchs, dessen Käufe applyShop schon ausgeführt hat */
  private shopTick = -1;
  /** Fehler beim Abspielen (Aktion abgelehnt): die Aufzeichnung passt nicht zum Kern */
  error: string | null = null;

  constructor(readonly version: string, readonly replay: ReplayData) {
    const inp = replay.inputs;
    this.starts = new Int32Array(inp.length / 4);
    let t = 0;
    for (let i = 0; i < inp.length; i += 4) {
      this.starts[i / 4] = t;
      t += inp[i];
    }
    this.total = t;
    this.sim = createSim(version, replay.seed);
    this.locate();
  }

  get tick() {
    return this.sim.tick;
  }

  /** Eingabe- und Aktionszeiger auf den aktuellen Sim-Tick stellen (nach Neustart oder Schlüsselbild) */
  private locate() {
    const tick = this.sim.tick;
    const a = this.replay.actions;
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (a[m].tick < tick) lo = m + 1;
      else hi = m;
    }
    this.ai = lo;
    lo = 0;
    hi = this.starts.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (this.starts[m] <= tick) lo = m;
      else hi = m - 1;
    }
    this.ri = Math.max(0, lo);
    this.runEnd = this.starts.length ? this.starts[this.ri] + this.replay.inputs[this.ri * 4] : 0;
    this.ended = false;
    this.error = null;
    this.shopTick = -1;
  }

  /** Von vorn beginnen, optional ab einem Schlüsselbild (Zustand direkt nach einem Tick, vor dessen Shop-Aktionen) */
  restart(snapshot?: unknown) {
    this.sim = createSim(this.version, this.replay.seed);
    if (snapshot !== undefined) hydrate(this.sim, snapshot);
    this.locate();
  }

  /** Steht die Sim im Händler und sind die Käufe dieses Besuchs noch nicht ausgeführt (applyShop)? */
  get atShop(): boolean {
    return !this.ended && this.sim.phase === 'shop' && this.shopTick !== this.sim.tick &&
      this.ai < this.replay.actions.length && this.replay.actions[this.ai].tick === this.sim.tick;
  }

  /**
   * Käufe des Händlerbesuchs ausführen – alles bis vor den Start (`launch`), damit die Wiedergabe
   * sie einblenden kann, solange das Schiff noch im Händler steht. Liefert die Käufe mit Preis.
   */
  applyShop(): Purchase[] {
    const out: Purchase[] = [];
    const a = this.replay.actions;
    const sim = this.sim;
    this.shopTick = sim.tick;
    while (this.ai < a.length && a[this.ai].tick === sim.tick && a[this.ai].t !== 'launch') {
      const { tick: _t, ...cmd } = a[this.ai];
      const before = sim.credits;
      if (!sim.command(cmd as Command)) {
        this.fail(`Aktion ${this.ai} (${cmd.t}) abgelehnt`);
        break;
      }
      this.ai++;
      const c = cmd as Command;
      const lvl = c.t === 'upgrade' ? (sim.loadout.slots as Record<string, { lvl: number } | null>)[c.slot]?.lvl ?? 0 : 0;
      out.push({ t: c.t, ...describe(c, lvl), cost: before - sim.credits });
    }
    return out;
  }

  private fail(msg: string) {
    this.error = msg;
    this.ended = true;
  }

  /**
   * Einen Tick rechnen (vorher fällige Shop-Aktionen anwenden). Liefert die Ereignisse des Ticks oder
   * null, wenn die Partie zu Ende ist.
   */
  step(): SimEvent[] | null {
    if (this.ended) return null;
    const sim = this.sim;
    const a = this.replay.actions;
    while (this.ai < a.length && a[this.ai].tick === sim.tick) {
      const { tick: _t, ...cmd } = a[this.ai];
      if (!sim.command(cmd as Command)) {
        this.fail(`Aktion ${this.ai} (${cmd.t}) abgelehnt`);
        return null;
      }
      this.ai++;
    }
    // Ende: zerstört, im Händler aufgehört oder Eingaben aufgebraucht
    if (sim.phase === 'over' || sim.phase === 'shop' || sim.tick >= this.total) {
      this.ended = true;
      return null;
    }
    while (sim.tick >= this.runEnd) {
      this.ri++;
      this.runEnd += this.replay.inputs[this.ri * 4];
    }
    const i = this.ri * 4;
    const inp = this.replay.inputs;
    sim.step({ mx: inp[i + 1], my: inp[i + 2], bomb: (inp[i + 3] & 1) === 1 });
    return sim.drain();
  }
}
