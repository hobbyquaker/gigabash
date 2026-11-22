// Hilfen für den API-Test: echte Partien in Node spielen und als Replay liefern.
// Wird von `npm run build:server` nach server/dist/test-play.mjs gebündelt.
import { runBot } from '../../tests/bot';
import { simulateReplay, stats } from '../../src/core/sim/replay';
import { APP_VERSION } from '../../src/version';
import type { Replay, RunStats } from '../../src/core/sim/types';
import type { Sim } from '../../src/core/sim/sim';
import { Sim as Sim030 } from '../cores/v0.3.0/sim/sim';
import { stats as stats030 } from '../cores/v0.3.0/sim/replay';
import { Sim as Sim100 } from '../cores/v1.0.0/sim/sim';
import { stats as stats100 } from '../cores/v1.0.0/sim/replay';

export { simulateReplay, APP_VERSION };

/** Bot-Partie mit dem Seed vom Server; maxMin begrenzt die Spielzeit (Minuten) */
export function playBot(seed: number, maxMin = 25): { replay: Replay; stats: RunStats } {
  const sim = runBot(seed, maxMin * 3600);
  return { replay: sim.replay(), stats: stats(sim) };
}

/** Bot-Partie mit dem eingefrorenen Kern v0.3.0 (Test: Highscore bleibt nach einem Update gültig) */
export function playBotFrozen030(seed: number, maxMin = 3): { replay: Replay; stats: RunStats } {
  const sim = runBot(seed, maxMin * 3600, 1, Sim030 as unknown as new (seed: number) => Sim) as unknown as Sim030;
  return { replay: sim.replay() as unknown as Replay, stats: stats030(sim) };
}

/** Bot-Partie mit dem eingefrorenen Kern v1.0.0 (= v0.6.0–1.0.1, Sim 5); Käufe, die der alte Kern nicht kennt, lehnt er ab */
export function playBotFrozen100(seed: number, maxMin = 2): { replay: Replay; stats: RunStats } {
  const sim = runBot(seed, maxMin * 3600, 1, Sim100 as unknown as new (seed: number) => Sim) as unknown as Sim100;
  return { replay: sim.replay() as unknown as Replay, stats: stats100(sim) };
}
