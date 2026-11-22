/**
 * Vorrechen-Worker der Wiedergabe: rechnet eine Partie mit dem Kern ihrer Version komplett durch,
 * schickt in festen Abständen Schlüsselbilder (Snapshots des Sim-Zustands), laufend die Marken der
 * Zeitleiste und am Ende die Kennzahlen an den Hauptthread. Läuft in Zeitscheiben, damit ein „stop“
 * (andere Partie gewählt) zügig greift. Eingebettet als Blob-Worker (?worker&inline).
 */
import type { GameStats, Mark } from './analysis';
import { precompute } from './precompute';
import type { ReplayData } from './run';

export type WorkerIn =
  | { type: 'start'; job: number; version: string; replay: ReplayData; every: number; sample: number }
  | { type: 'stop' };

export type WorkerOut =
  | { type: 'snapshot'; job: number; tick: number; data: unknown }
  | { type: 'progress'; job: number; tick: number; marks: Mark[] }
  | { type: 'done'; job: number; ticks: number; stats: GameStats }
  | { type: 'error'; job: number; message: string };

let current = 0;
const scope = self as unknown as { postMessage(m: WorkerOut): void; addEventListener(t: 'message', f: (ev: MessageEvent<WorkerIn>) => void): void };

async function runJob(msg: Extract<WorkerIn, { type: 'start' }>) {
  const job = msg.job;
  let sent = 0;
  try {
    const r = await precompute(
      msg.version, msg.replay, msg.every, msg.sample,
      (tick, data) => scope.postMessage({ type: 'snapshot', job, tick, data }),
      async (tick, an) => {
        if (current !== job) return false;
        scope.postMessage({ type: 'progress', job, tick, marks: an.marks.slice(sent) });
        sent = an.marks.length;
        await new Promise((res) => setTimeout(res, 0));
        return current === job;
      },
    );
    if (r) scope.postMessage({ type: 'done', job, ticks: r.ticks, stats: r.stats });
  } catch (err) {
    scope.postMessage({ type: 'error', job, message: String(err instanceof Error ? err.message : err) });
  }
}

scope.addEventListener('message', (ev) => {
  const m = ev.data;
  if (m.type === 'stop') {
    current = 0;
    return;
  }
  current = m.job;
  void runJob(m);
});
