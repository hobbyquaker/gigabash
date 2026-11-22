/**
 * Partie mit dem Kern ihrer Version komplett durchrechnen: Schlüsselbilder in festen Abständen und
 * Kennzahlen. Kern des Vorrechen-Workers (worker.ts), ohne Worker-Umgebung – auch im Node-Test genutzt.
 */
import { Analyzer, type GameStats } from './analysis';
import { ReplayRun, type ReplayData } from './run';
import { takeSnapshot } from './snapshot';

/** Zeitscheibe (ms), danach kurz an die Ereignisschleife abgeben */
const SLICE_MS = 50;

/**
 * Partie durchrechnen. `onSnapshot` bekommt den Zustand direkt nach jedem Tick, der ein Vielfaches
 * von `every` ist (vor den Shop-Aktionen dieses Ticks); `pause` wird zwischen den Zeitscheiben
 * aufgerufen und bricht mit `false` ab.
 */
export async function precompute(
  version: string, replay: ReplayData, every: number, sample: number,
  onSnapshot: (tick: number, data: unknown) => void,
  pause?: (tick: number, an: Analyzer) => Promise<boolean>,
): Promise<{ ticks: number; stats: GameStats } | null> {
  const run = new ReplayRun(version, replay);
  const an = new Analyzer(run.sim, sample);
  for (;;) {
    const t0 = performance.now();
    do {
      if (run.atShop) {
        const before = run.sim.credits;
        an.onShop(before, run.applyShop());
      }
      const wasShop = run.sim.phase === 'shop';
      const ev = run.step();
      if (!ev) break;
      if (wasShop) an.onLaunch();
      an.onTick(ev);
      if (run.sim.tick % every === 0) onSnapshot(run.sim.tick, takeSnapshot(run.sim));
    } while (!pause || performance.now() - t0 < SLICE_MS);
    if (run.ended) break;
    if (pause && !(await pause(run.sim.tick, an))) return null;
  }
  if (run.error) throw new Error(run.error);
  return { ticks: run.sim.tick, stats: an.finish() };
}
