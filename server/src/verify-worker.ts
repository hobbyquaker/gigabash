import { parentPort } from 'node:worker_threads';
import { setPriority } from 'node:os';
import { simulateReplay, type ReplayResult } from '../../src/core/sim/replay';
import type { Replay } from '../../src/core/sim/types';
import { APP_VERSION } from '../../src/version';
import { FROZEN_CORES } from './cores.gen';

// Worker-Thread für die Nachsimulation eines Replays. Lange Partien sollen den Webserver nicht
// blockieren; ein Auftrag pro Nachricht, Antwort mit derselben id.

export interface VerifyJob {
  id: number;
  replay: Replay;
  /** Spielversion der Partie: aktuelle Sim oder ein eingefrorener Kern (server/cores) */
  version: string;
}

export interface VerifyReply {
  id: number;
  result: ReplayResult;
  /** Rechenzeit in ms */
  ms: number;
}

if (!parentPort) throw new Error('verify-worker muss als Worker-Thread laufen');

// Unter Linux wirkt pid 0 auf den aufrufenden Thread: die Nachsimulation bekommt nur CPU-Zeit,
// die der Webserver nicht braucht. Anderswo ohne Wirkung.
try {
  setPriority(0, 10);
} catch {
  /* nicht unterstützt */
}

parentPort.on('message', (job: VerifyJob) => {
  const t0 = performance.now();
  let result: ReplayResult;
  try {
    if (job.version === APP_VERSION) result = simulateReplay(job.replay);
    else {
      const sim = FROZEN_CORES[job.version];
      if (!sim) throw new Error(`kein Kern für v${job.version}`);
      result = sim(job.replay as never);
    }
  } catch (err) {
    result = { score: 0, sector: 0, kills: 0, ticks: 0, credits: 0, valid: false, error: `Simulation abgebrochen: ${(err as Error).message}` };
  }
  const reply: VerifyReply = { id: job.id, result, ms: Math.round(performance.now() - t0) };
  parentPort!.postMessage(reply);
});
