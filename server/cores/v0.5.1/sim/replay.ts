// Replay nachrechnen: Seed + Eingaben + Shop-Aktionen → Ergebnis. Läuft unverändert in Node (Server, Tests).
import { Sim } from './sim';
import type { Input, Replay, RunStats } from './types';

export interface ReplayResult extends RunStats {
  valid: boolean;
  error?: string;
}

/** Höchstzahl Ticks (Schutz gegen endlose Replays): 3 Stunden */
const MAX_TICKS = 60 * 60 * 180;

export function simulateReplay(r: Replay, onTick?: (sim: Sim) => void): ReplayResult {
  const sim = new Sim(r.seed);
  let ai = 0;
  let ii = 0;
  let left = 0;
  const input: Input = { mx: 0, my: 0, bomb: false };
  const fail = (error: string): ReplayResult => ({ ...stats(sim), valid: false, error });
  for (;;) {
    while (ai < r.actions.length && r.actions[ai].tick === sim.tick) {
      const { tick: _t, ...cmd } = r.actions[ai++];
      if (!sim.command(cmd)) return fail(`Aktion ${ai - 1} ungültig`);
    }
    if (sim.phase === 'over') break;
    if (sim.phase === 'shop') {
      if (ai >= r.actions.length) break; // Partie im Shop beendet
      return fail('Shop ohne Fortsetzung');
    }
    if (left === 0) {
      if (ii >= r.inputs.length) break;
      left = r.inputs[ii];
      input.mx = r.inputs[ii + 1];
      input.my = r.inputs[ii + 2];
      input.bomb = (r.inputs[ii + 3] & 1) === 1;
      ii += 4;
      if (!(left > 0)) return fail('Eingabe ungültig');
    }
    sim.step({ ...input });
    sim.drain();
    left--;
    onTick?.(sim);
    if (sim.tick > MAX_TICKS) return fail('zu lang');
  }
  if (ai < r.actions.length) return fail('Aktionen übrig');
  return { ...stats(sim), valid: true };
}

export function stats(sim: Sim): RunStats {
  return { score: sim.score, sector: sim.sector, kills: sim.kills, ticks: sim.tick, credits: sim.totalCredits };
}
