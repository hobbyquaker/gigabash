import { Worker } from 'node:worker_threads';
import type { ReplayResult } from '../../src/core/sim/replay';
import type { Replay } from '../../src/core/sim/types';
import type { VerifyJob, VerifyReply } from './verify-worker';

// Kleiner Pool aus Worker-Threads für die Nachsimulation. Aufträge warten in einer begrenzten
// Warteschlange; jeder Auftrag hat ein Zeitlimit, danach wird sein Worker beendet und ersetzt.

export class QueueFullError extends Error {}

interface Pending {
  id: number;
  replay: Replay;
  version: string;
  resolve: (r: VerifyReply) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: Worker;
  job: Pending | null;
  timer: NodeJS.Timeout | null;
}

export interface VerifierOptions {
  workerFile: URL;
  workers: number;
  timeoutMs: number;
  maxQueue: number;
}

export class Verifier {
  private slots: Slot[] = [];
  private queue: Pending[] = [];
  private nextId = 1;
  private closed = false;

  constructor(private opts: VerifierOptions) {
    for (let i = 0; i < opts.workers; i++) this.slots.push(this.spawn());
  }

  /** wartende + laufende Aufträge */
  get pending() {
    return this.queue.length + this.slots.filter((s) => s.job).length;
  }

  /** Replay nachrechnen; wirft QueueFullError bei voller Warteschlange */
  run(replay: Replay, version: string): Promise<VerifyReply> {
    if (this.closed) return Promise.reject(new Error('Prüfung beendet'));
    if (this.queue.length >= this.opts.maxQueue) return Promise.reject(new QueueFullError('Warteschlange voll'));
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, replay, version, resolve, reject });
      this.pump();
    });
  }

  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(this.opts.workerFile), job: null, timer: null };
    slot.worker.on('message', (m: VerifyReply) => {
      const job = slot.job;
      if (!job || m.id !== job.id) return;
      this.finish(slot);
      job.resolve(m);
      this.pump();
    });
    const broken = (err: Error) => {
      const job = slot.job;
      this.finish(slot);
      this.replace(slot);
      job?.reject(err);
      this.pump();
    };
    slot.worker.on('error', broken);
    slot.worker.on('exit', (code) => {
      if (!this.closed && this.slots.includes(slot)) broken(new Error(`Worker beendet (${code})`));
    });
    return slot;
  }

  private finish(slot: Slot) {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
    slot.job = null;
  }

  /** Worker austauschen (nach Zeitüberschreitung oder Absturz) */
  private replace(slot: Slot) {
    const i = this.slots.indexOf(slot);
    if (i < 0) return;
    this.slots.splice(i, 1);
    void slot.worker.terminate();
    if (!this.closed) this.slots.push(this.spawn());
  }

  private pump() {
    for (const slot of this.slots) {
      if (slot.job || !this.queue.length) continue;
      const job = this.queue.shift()!;
      slot.job = job;
      slot.timer = setTimeout(() => {
        this.finish(slot);
        this.replace(slot);
        const result: ReplayResult = { score: 0, sector: 0, kills: 0, ticks: 0, credits: 0, valid: false, error: 'Zeitlimit der Nachsimulation überschritten' };
        job.resolve({ id: job.id, result, ms: this.opts.timeoutMs });
        this.pump();
      }, this.opts.timeoutMs);
      const msg: VerifyJob = { id: job.id, replay: job.replay, version: job.version };
      slot.worker.postMessage(msg);
    }
  }

  async close() {
    this.closed = true;
    for (const p of this.queue.splice(0)) p.reject(new Error('Server wird beendet'));
    await Promise.all(this.slots.map(async (s) => {
      s.job?.reject(new Error('Server wird beendet'));
      this.finish(s);
      await s.worker.terminate();
    }));
  }
}
