/**
 * Szene der Wiedergabe: der echte Renderer des Spiels (GameScene) ohne Eingabe. Statt Tastatur und
 * Zeiger treibt der Abspieler (ReplayPlayer) die Sim mit den aufgezeichneten Eingaben; die Szene
 * macht aus den Ereignissen der Ticks wie im Spiel Effekte.
 */
import { GameScene, type SceneHost } from '../scenes/GameScene';
import { TICK_RATE } from '../core/config';
import { themeFor } from '../core/sector';
import type { Sim } from '../core/sim/sim';
import type { SimEvent } from '../core/sim/types';
import type { LoadedImage } from '../assets/sprites';
import type { ReplayPlayer } from './player';

const STEP_MS = 1000 / TICK_RATE;

export class ReplayScene extends GameScene {
  private player: ReplayPlayer | null = null;
  /** Sektor, für den die Kulisse aufgebaut ist */
  private shownSector = 0;

  constructor(images: LoadedImage[], host: SceneHost) {
    super(images, host, false);
  }

  /** Abspieler anhängen (null = nichts zeigen) */
  setPlayer(p: ReplayPlayer | null) {
    this.player = p;
    this.sim = p ? (p.sim as Sim) : null;
    this.shownSector = 0;
    if (p) this.rebuild();
  }

  /** Ereignisse eines Ticks wie im Spiel verarbeiten (vom Abspieler gerufen) */
  feed(ev: SimEvent[]) {
    if (!this.player) return;
    this.sim = this.player.sim as Sim;
    this.handleEvents(ev);
  }

  /** Nach einem Sprung: Effekte verwerfen, Kulisse des Sektors aufbauen */
  rebuild() {
    const p = this.player;
    if (!p || !this.sys.isActive()) return;
    this.sim = p.sim as Sim;
    this.clearFx();
    this.cameras.main.setScroll(0, 0);
    this.syncSector(false);
  }

  private syncSector(announce: boolean) {
    const sim = this.sim;
    if (!sim || sim.sector === this.shownSector) return;
    if (announce && this.shownSector) this.clearFx();
    this.shownSector = sim.sector;
    this.setupSectorVisuals(sim.sector);
    if (announce) this.banner(`SEKTOR ${sim.sector}`, themeFor(sim.sector).name);
  }

  protected advance(dt: number): number {
    const p = this.player;
    if (!p) return 0;
    const n = p.advance(dt);
    this.sim = p.sim as Sim;
    // am Ende der Partie laufen die Effekte weiter (Explosion des Schiffs)
    this.paused = p.paused || p.seeking || p.inShop;
    // neuer Sektor nach dem Händler (oder beim ersten Bild)
    this.syncSector(n > 0);
    if (this.paused) return 0;
    if (p.ended) return dt / STEP_MS;
    // Effekte laufen mit dem Tempo mit, aber höchstens dreifach (sonst verpuffen Explosionen ungesehen)
    return (dt / STEP_MS) * Math.min(3, Math.max(0.5, p.speed));
  }
}
