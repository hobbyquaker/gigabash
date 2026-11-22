/**
 * Abspieler eines Replays: führt die Sim im Hauptthread mit wählbarem Tempo aus, lässt den Worker die
 * Partie im Hintergrund vorrechnen (Schlüsselbilder alle `every` Ticks, Marken, Kennzahlen) und
 * springt zum Scrubben über das nächstgelegene Schlüsselbild ≤ Ziel, von dem aus ohne Darstellung in
 * Zeitscheiben vorgerechnet wird. Händlerbesuche kosten keine Ticks: die Wiedergabe hält dort kurz an
 * und meldet die Käufe (onShop), bevor es mit dem nächsten Sektor weitergeht.
 */
import { TICK_RATE } from '../core/config';
import type { SimEvent } from '../core/sim/types';
import type { GameStats, Mark } from './analysis';
import { ReplayRun, type Purchase, type ReplayData } from './run';
import { digest, takeSnapshot } from './snapshot';
import type { WorkerIn, WorkerOut } from './worker';
import PrecomputeWorker from './worker?worker&inline';

const STEP_MS = 1000 / TICK_RATE;
/** Sim-Rechenzeit je Frame bei der Wiedergabe (ms); mehr Tempo gibt es nur, wenn die Sim schnell genug ist */
const PLAY_BUDGET_MS = 12;
/** Sim-Rechenzeit je Frame beim Springen (ms) */
const SEEK_BUDGET_MS = 30;

export interface BufferInfo {
  /** bis hierhin hat der Worker gerechnet (Ticks) */
  tick: number;
  done: boolean;
  snapshots: number;
  error: string | null;
}

/** Händlerbesuch, wie ihn die Wiedergabe einblendet */
export interface ShopView {
  sector: number;
  creditsBefore: number;
  creditsAfter: number;
  items: Purchase[];
}

export interface PlayerHooks {
  /** Ereignisse eines gerechneten Ticks (nur bei normaler Wiedergabe, nicht beim Springen) */
  onEvents(events: SimEvent[]): void;
  /** nach einem Sprung: Darstellung aus dem Sim-Zustand neu aufbauen */
  onRebuild(): void;
  /** Händler einblenden (Käufe) bzw. wieder ausblenden (null) */
  onShop(view: ShopView | null): void;
  onBuffer(info: BufferInfo): void;
  onMarks(marks: Mark[]): void;
  onStats(stats: GameStats): void;
  onSeeking(active: boolean): void;
  onEnd(): void;
}

let jobCounter = 1;

export class ReplayPlayer {
  readonly run: ReplayRun;
  speed = 1;
  paused = false;
  stats: GameStats | null = null;
  readonly marks: Mark[] = [];
  /** Abstand der Schlüsselbilder in Ticks */
  readonly every: number;
  private acc = 0;
  /** Rest der Händler-Einblendung in ms (0 = keine) */
  private hold = 0;
  private snapshots: { tick: number; data: unknown }[] = [];
  private worker: Worker | null = null;
  private readonly job = jobCounter++;
  private buffer: BufferInfo = { tick: 0, done: false, snapshots: 0, error: null };
  private seek: number | null = null;
  private endSent = false;

  constructor(version: string, replay: ReplayData, private hooks: PlayerHooks) {
    this.run = new ReplayRun(version, replay);
    const total = this.run.total;
    // Schlüsselbild alle 10 s; bei sehr langen Partien seltener, damit höchstens ~200 im Speicher liegen
    this.every = Math.max(600, Math.ceil(total / 200 / 600) * 600);
    // Verlauf: höchstens ~900 Stichproben
    const sample = Math.max(60, Math.ceil(total / 900 / 60) * 60);
    try {
      const w = new PrecomputeWorker();
      this.worker = w;
      w.onmessage = (ev: MessageEvent<WorkerOut>) => this.onWorker(ev.data);
      w.onerror = (e) => this.setBuffer({ error: `Vorrechnen fehlgeschlagen: ${e.message || 'Worker-Fehler'}`, done: true });
      const msg: WorkerIn = { type: 'start', job: this.job, version, replay, every: this.every, sample };
      w.postMessage(msg);
    } catch (err) {
      this.setBuffer({ error: `Kein Worker: ${String(err)}`, done: true });
    }
  }

  private setBuffer(patch: Partial<BufferInfo>) {
    this.buffer = { ...this.buffer, ...patch };
    this.hooks.onBuffer(this.buffer);
  }

  private onWorker(m: WorkerOut) {
    if (m.job !== this.job) return;
    switch (m.type) {
      case 'snapshot':
        this.snapshots.push({ tick: m.tick, data: m.data });
        this.setBuffer({ tick: m.tick, snapshots: this.snapshots.length });
        break;
      case 'progress':
        if (m.marks.length) {
          this.marks.push(...m.marks);
          this.hooks.onMarks(this.marks);
        }
        this.setBuffer({ tick: m.tick });
        break;
      case 'done':
        this.stats = m.stats;
        this.marks.length = 0;
        this.marks.push(...m.stats.marks);
        this.hooks.onMarks(this.marks);
        this.setBuffer({ tick: m.ticks, done: true });
        this.hooks.onStats(m.stats);
        this.stopWorker();
        break;
      case 'error':
        this.setBuffer({ error: m.message, done: true });
        this.stopWorker();
        break;
    }
  }

  private stopWorker() {
    this.worker?.terminate();
    this.worker = null;
  }

  get sim() {
    return this.run.sim;
  }

  get tick() {
    return this.run.sim.tick;
  }

  /** Länge der Partie in Ticks */
  get total() {
    return this.run.total;
  }

  get bufferInfo() {
    return this.buffer;
  }

  get seeking() {
    return this.seek !== null;
  }

  get ended() {
    return this.run.ended;
  }

  /** wird gerade der Händler eingeblendet? */
  get inShop() {
    return this.hold > 0;
  }

  /** Fingerabdruck des Sim-Zustands (Tests: Zustand nach Sprung == durchgespielt) */
  fingerprint(): string {
    return digest(takeSnapshot(this.run.sim));
  }

  dispose() {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' } as WorkerIn);
      this.stopWorker();
    }
    this.snapshots = [];
  }

  /** Händler-Einblendung überspringen */
  skipShop() {
    if (this.hold > 0) this.hold = 0.001;
  }

  private finish() {
    if (this.endSent) return;
    this.endSent = true;
    this.hooks.onEnd();
  }

  /**
   * Pro Frame aufrufen: Sim um real × Tempo voranbringen (begrenzt durch das Zeitbudget).
   * Liefert die Zahl der gerechneten Ticks.
   */
  advance(realMs: number): number {
    if (this.seek !== null) {
      this.runSeek();
      return 0;
    }
    if (this.paused || this.run.ended) return 0;
    const run = this.run;
    if (this.hold > 0) {
      // Händler steht eingeblendet: bei höherem Tempo kürzer, langsamer als Echtzeit aber nicht
      this.hold -= realMs * Math.max(1, this.speed);
      if (this.hold > 0) return 0;
      this.hold = 0;
      this.hooks.onShop(null);
    }
    this.acc += realMs * this.speed;
    const want = Math.floor(this.acc / STEP_MS);
    if (want <= 0) return 0;
    const t0 = performance.now();
    let k = 0;
    while (k < want) {
      if (run.atShop) {
        const sector = run.sim.sector;
        const before = run.sim.credits;
        const items = run.applyShop();
        this.hold = Math.min(9000, 2200 + 450 * items.length);
        this.acc = 0;
        this.hooks.onShop({ sector, creditsBefore: before, creditsAfter: run.sim.credits, items });
        return k;
      }
      const ev = run.step();
      if (!ev) {
        this.acc = 0;
        this.finish();
        return k;
      }
      this.hooks.onEvents(ev);
      k++;
      if ((k & 3) === 0 && performance.now() - t0 > PLAY_BUDGET_MS) break;
    }
    // zu langsam für das gewünschte Tempo: Rest verwerfen
    this.acc = k < want ? 0 : this.acc - want * STEP_MS;
    return k;
  }

  /**
   * Zu einem Tick springen: nächstgelegenes Schlüsselbild ≤ Ziel laden (oder die laufende Sim
   * weiterrechnen, wenn sie näher liegt) und ohne Darstellung in Zeitscheiben vorrechnen.
   */
  seekTo(target: number) {
    const run = this.run;
    const reach = this.buffer.done && !this.buffer.error ? run.total : Math.max(this.buffer.tick, run.tick);
    target = Math.max(0, Math.min(Math.floor(target), reach, run.total));
    let snap: { tick: number; data: unknown } | null = null;
    for (const s of this.snapshots) if (s.tick <= target && (!snap || s.tick > snap.tick)) snap = s;
    if (this.hold > 0) {
      this.hold = 0;
      this.hooks.onShop(null);
    }
    const near = run.tick <= target && run.tick >= (snap?.tick ?? 0) && !run.ended;
    if (!near) run.restart(snap?.data);
    this.acc = 0;
    this.endSent = false;
    this.seek = target;
    this.hooks.onSeeking(true);
    this.runSeek();
  }

  private runSeek() {
    const target = this.seek!;
    const run = this.run;
    const t0 = performance.now();
    while (run.tick < target) {
      if (!run.step()) break;
      if ((run.tick & 7) === 0 && performance.now() - t0 > SEEK_BUDGET_MS) return;
    }
    this.seek = null;
    this.hooks.onSeeking(false);
    this.hooks.onRebuild();
  }
}
