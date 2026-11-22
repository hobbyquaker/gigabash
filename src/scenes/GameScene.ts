// Renderer: zeichnet den Zustand der Sim, setzt Eingaben ab und macht aus Events Effekte und Sound.
// Math.random ist hier erlaubt (nur Optik).
import Phaser from 'phaser';
import { WIDTH, HEIGHT, TICK_RATE } from '../core/config';
import { Sim, ITEM_HOVER, ITEM_WARN } from '../core/sim/sim';
import type { Enemy, Input, SimEvent } from '../core/sim/types';
import { BOSS_RIGS, partMeta, type LoadedImage } from '../assets/sprites';
import { ENGINES, classOf, shipLayout, spriteLvl } from '../assets/shipLayout';
import { CORE_SLOTS, SLOTS, shipClass, type SlotId } from '../core/data/shop';
import { themeFor } from '../core/sector';
import { sfx } from '../audio/sfx';
import { settings } from '../settings';
import { Backdrop } from './Backdrop';

const STEP_MS = 1000 / TICK_RATE;
const FONT = '"Russo One", "Arial Black", sans-serif';
const ADD = Phaser.BlendModes.ADD;
const NORMAL = Phaser.BlendModes.NORMAL;

/** Zeichentiefen (alles unter 0 ist Kulisse) */
/** Radius des Touch-Joysticks in CSS-Pixeln */
const JOY_R = 56;

const D = {
  plate: 4,
  bossFlame: 7.5,
  boss: 8,
  bossPart: 9,
  flame: 9.5,
  enemy: 10,
  part: 11,
  smoke: 13,
  debris: 14,
  itemGlow: 14.5,
  item: 15,
  bullet: 18,
  player: 20,
  fx: 30,
  ebGlow: 33,
  ebullet: 35,
  popup: 40,
};

/** Leuchtfarbe der Lampe je Anbauwaffe */
const LAMP_GLOW: Record<string, string> = {
  side: 'fx_soft', spread: 'glow_green', missile: 'glow_orange', pulse: 'glow_cyan', beam: 'glow_pink',
  laser: 'glow_purple', arc: 'glow_cyan', rear: 'glow_orange', drone: 'glow_cyan',
  rail: 'fx_softblue', flak: 'glow_green', plasma: 'glow_green',
};
/** Mündungsfeuer-Farbe je Waffe */
const MUZZLE_TINT: Record<string, number> = {
  main: 0x7cf7ff, side: 0xffe45c, spread: 0x9bea6a, laser: 0xe9a8ff, rear: 0xf2a93b, drone: 0x7cf7ff, missile: 0xffb040, pulse: 0x7cf7ff, arc: 0xb8fbff, beam: 0xff4fa8,
  rail: 0xc8d0ff, flak: 0xe4ee70, plasma: 0x3bf0a0,
};

/** Farben der Endgegner (Kern-Leuchten, Trümmer) */
const BOSS_TINT = [0xffe45c, 0x7cf7ff, 0xff3d6e, 0xf2a93b];
const BOSS_GLOW = ['fx_soft', 'fx_softblue', 'glow_red', 'glow_orange'];

interface Particle {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  drag: number;
  spin: number;
  /** Deckkraftverlauf: 0 = linear aus, 1 = Puff (schnell da, langsam weg), 2 = erst spät ausblenden */
  curve: number;
}

interface ParticleOpts extends Partial<Omit<Particle, 'img'>> {
  tint?: number;
  rot?: number;
  blend?: Phaser.BlendModes;
  depth?: number;
}

interface Popup {
  t: Phaser.GameObjects.Text;
  life: number;
  max: number;
  vy: number;
}

interface Star {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/** Wrack des Endgegners während der Todessequenz */
interface Wreck {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  t: number;
  v: number;
}

/** Was die Szene von der Oberfläche braucht (im Spiel: UI aus ui.ts, auf der Wiedergabeseite deren Bedienleiste) */
export interface SceneHost {
  togglePause(): void;
  showGameOver(sim: Sim): void;
  updateHud(sim: Sim | null): void;
  banner(title: string, sub?: string): void;
  openShop(sim: Sim): void;
}

/** Sprite-Pool je Textur: pro Frame werden die benutzten Bilder neu vergeben, der Rest versteckt */
class Pool {
  private items: Phaser.GameObjects.Image[] = [];
  private used = 0;
  constructor(private scene: Phaser.Scene, private key: string, private depth: number, private blend = NORMAL) {}
  begin() {
    this.used = 0;
  }
  get(x: number, y: number): Phaser.GameObjects.Image {
    let img = this.items[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, this.key).setScale(0.5).setDepth(this.depth).setBlendMode(this.blend);
      this.items.push(img);
    }
    this.used++;
    img.setVisible(true).setPosition(x, y);
    return img;
  }
  end() {
    for (let i = this.used; i < this.items.length; i++) {
      if (this.items[i].visible) this.items[i].setVisible(false);
    }
  }
}

export class GameScene extends Phaser.Scene {
  sim: Sim | null = null;
  paused = false;
  protected acc = 0;
  private pools = new Map<string, Pool>();
  private particles: Particle[] = [];
  private freeParticles: Phaser.GameObjects.Image[] = [];
  private popups: Popup[] = [];
  private stars: Star[] = [];
  private bg!: Phaser.GameObjects.Image;
  private backdrop!: Backdrop;
  private flashRect!: Phaser.GameObjects.Rectangle;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pendingBomb = false;
  /** Touch/Maus: Anker beim Aufsetzen */
  private drag: { id: number; px: number; py: number; cx: number; cy: number; sx: number; sy: number } | null = null;
  /** Touch-Joystick (wie Wilmster 3D): erscheint unter dem Daumen, wandert beim Weiterziehen mit */
  private stick: { id: number; ox: number; oy: number; vx: number; vy: number } | null = null;
  private shake = 0;
  private overTimer = 0;
  private bgSector = 0;
  private lastShotSound = new Map<string, number>();
  /** Strahllaser und Blitzbögen (pro Bild neu gezeichnet) */
  private fxG!: Phaser.GameObjects.Graphics;
  /** Sperrfeuer, Ziellinien der Scharfschützen, Randpfeile (pro Bild neu gezeichnet) */
  private hazG!: Phaser.GameObjects.Graphics;
  private lastGraze = 0;
  /** Elite-Gegner dieses Bilds (goldener Ring in renderHazards) */
  private eliteRings: Enemy[] = [];
  /** Blitzbögen; `ship` = startet an der Blitzspule (Kettenblitze von Treffern starten am Gegner) */
  private arcs: { pts: number[]; t: number; path?: number[]; forks: number[][]; ship: boolean }[] = [];
  /** Rückstoß je Steckplatz (1 = gerade gefeuert, klingt pro Bild ab) */
  private recoil: Partial<Record<SlotId, number>> = {};
  /** seit dem letzten Bild gefeuert: Mündungsfeuer an den echten Läufen */
  private fired = new Set<SlotId>();
  /** Mündungen dieses Bilds je Steckplatz (Weltkoordinaten) */
  private emitters = new Map<SlotId, [number, number][]>();
  private beamSound = 0;
  /** geglättete Frame-Zeit für effects = 'auto' */
  private frameAvg = STEP_MS;
  private perfLow = false;
  /** Boss: Mündungsfeuer-Zeit, letzte Variante/Position (für die Todessequenz) */
  private bossFire = 0;
  private lastBoss = { v: 0, x: WIDTH / 2, y: 170 };
  private wreck: Wreck | null = null;

  /** @param live false = Wiedergabe: keine Tastatur-/Zeiger-Eingabe, die Sim stellt die abgeleitete Szene */
  constructor(private images: LoadedImage[], protected ui: SceneHost, private live = true) {
    super({ key: 'game' });
  }

  create() {
    if (this.live) document.documentElement.classList.toggle('stick', settings.control === 'stick');
    this.fxG = this.add.graphics().setDepth(D.bullet - 0.2).setBlendMode(ADD);
    this.hazG = this.add.graphics().setDepth(D.ebGlow - 0.5);
    for (const im of this.images) {
      if (!this.textures.exists(im.key)) this.textures.addCanvas(im.key, im.canvas);
    }
    this.bg = this.add.image(WIDTH / 2, HEIGHT / 2, this.bgTexture(1)).setDisplaySize(WIDTH, HEIGHT).setDepth(-10);
    this.backdrop = new Backdrop(this);
    // Sterne: drei Ebenen (Parallaxe)
    for (let i = 0; i < 110; i++) {
      const layer = i < 60 ? 0 : i < 95 ? 1 : 2;
      const img = this.add.image(Math.random() * WIDTH, Math.random() * HEIGHT, 'dot').setDepth(-8 + layer);
      img.setScale([0.35, 0.6, 0.9][layer]).setAlpha([0.35, 0.6, 0.95][layer]);
      if (Math.random() < 0.25) img.setTint(Math.random() < 0.5 ? 0x9fd8ff : 0xffe0b0);
      this.stars.push({ img, speed: [0.35, 0.9, 2.2][layer] });
    }
    this.flashRect = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xffffff, 0).setDepth(100);
    if (!this.live) return;

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === 'INPUT') return;
      if (ev.code === 'Space' || ev.code === 'KeyB') this.requestBomb();
      if (ev.code === 'KeyP' || ev.code === 'Escape') this.ui.togglePause();
    });
    // Leertaste soll nicht scrollen/Knöpfe auslösen
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');

    // Ziehen per DOM-Pointer-Events (Maus und Touch): Phaser meldet Berührungen außerhalb des Canvas
    // nicht zuverlässig, auf langen Handys beginnt das Wischen aber oft in den HUD-Leisten.
    const toGame = (e: PointerEvent) => {
      const r = this.game.canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * WIDTH) / r.width, y: ((e.clientY - r.top) * HEIGHT) / r.height };
    };
    document.addEventListener('pointerdown', (e) => {
      const el = e.target as Element | null;
      const onField =
        el === this.game.canvas ||
        (el instanceof Element && !!el.closest('#frame') && !el.closest('#overlay, #dialog, #tips, button, input, a'));
      if (!onField || (e.pointerType === 'mouse' && e.button !== 0)) return;
      sfx.unlock();
      const sim = this.sim;
      if (!sim || this.paused || sim.phase === 'shop' || sim.phase === 'over') return;
      if (e.pointerType !== 'mouse' && settings.control === 'stick') {
        if (this.stick) return;
        this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, vx: 0, vy: 0 };
        this.showStick(e.clientX, e.clientY, 0, 0);
        return;
      }
      const g = toGame(e);
      this.drag = { id: e.pointerId, px: g.x, py: g.y, cx: g.x, cy: g.y, sx: sim.player.x, sy: sim.player.y };
    }, true);
    document.addEventListener('pointermove', (e) => {
      const st = this.stick;
      if (st && e.pointerId === st.id) {
        let dx = e.clientX - st.ox;
        let dy = e.clientY - st.oy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_R) {
          // Joystick wandert mit, wenn man weiter zieht: Richtungswechsel greift sofort
          const over = len - JOY_R;
          st.ox += (dx / len) * over;
          st.oy += (dy / len) * over;
          dx = (dx / len) * JOY_R;
          dy = (dy / len) * JOY_R;
        }
        st.vx = dx / JOY_R;
        st.vy = dy / JOY_R;
        this.showStick(st.ox, st.oy, dx, dy);
        return;
      }
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const g = toGame(e);
      this.drag.cx = g.x;
      this.drag.cy = g.y;
    }, true);
    const up = (e: PointerEvent) => {
      if (this.drag && this.drag.id === e.pointerId) this.drag = null;
      if (this.stick && this.stick.id === e.pointerId) {
        this.stick = null;
        this.idleStick();
      }
    };
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  }

  /** Hintergrund-Verlauf des Sektor-Themas als kleine Canvas-Textur */
  private bgTexture(sector: number): string {
    const key = `bg_${(sector - 1) % 4}`;
    if (!this.textures.exists(key)) {
      const th = themeFor(sector);
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 256;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, th.bg[0]);
      grad.addColorStop(1, th.bg[1]);
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
      this.textures.addCanvas(key, c);
    }
    return key;
  }

  protected setupSectorVisuals(sector: number) {
    this.bgSector = sector;
    this.bg.setTexture(this.bgTexture(sector)).setDisplaySize(WIDTH, HEIGHT);
    this.backdrop.setup(sector, settings.effects === 'low');
  }

  /** sparsame Effekte: Einstellung „low“ oder „auto“ bei schwacher Bildrate */
  private get lowFx(): boolean {
    return settings.effects === 'low' || (settings.effects === 'auto' && this.perfLow);
  }

  /** Mengenfaktor für Partikel */
  private get fxMul(): number {
    return this.lowFx ? 0.35 : 1;
  }

  /** n Partikel bei voller Effektstufe → passende Anzahl für die aktuelle Stufe (mind. 1, wenn n > 0) */
  private cnt(n: number): number {
    return n <= 0 ? 0 : Math.max(1, Math.round(n * this.fxMul));
  }

  // ───────────────────────────── Spielablauf ─────────────────────────────

  startRun(seed: number) {
    this.stick = null;
    this.drag = null;
    this.idleStick();
    this.sim = new Sim(seed);
    this.acc = 0;
    this.overTimer = 0;
    this.paused = false;
    this.clearFx();
    this.setupSectorVisuals(1);
    this.banner(`SEKTOR 1`, themeFor(1).name);
    sfx.play('launch');
  }

  requestBomb() {
    this.pendingBomb = true;
  }

  protected clearFx() {
    for (const p of this.particles) {
      p.img.setVisible(false);
      this.freeParticles.push(p.img);
    }
    this.particles = [];
    for (const p of this.popups) p.t.destroy();
    this.popups = [];
    if (this.wreck) this.wreck.img.destroy();
    this.wreck = null;
    this.bossFire = 0;
    this.arcs = [];
  }

  /** Joystick-Grafik an Bildschirmposition (clientX/Y) mit Knopf-Auslenkung zeigen */
  private showStick(cx: number, cy: number, dx: number, dy: number) {
    const el = document.getElementById('joy');
    const hud = document.getElementById('hud');
    if (!el || !hud) return;
    const r = hud.getBoundingClientRect();
    el.classList.remove('idle');
    el.classList.add('on');
    el.style.left = `${cx - r.left}px`;
    el.style.top = `${cy - r.top}px`;
    (el.firstElementChild as HTMLElement).style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  /** Joystick zurück in die Ruhestellung unten links (Position per CSS) */
  private idleStick() {
    const el = document.getElementById('joy');
    if (!el) return;
    el.classList.remove('on');
    el.classList.add('idle');
    el.style.left = '';
    el.style.top = '';
    (el.firstElementChild as HTMLElement).style.transform = '';
  }

  private readInput(): Input {
    const sim = this.sim!;
    const p = sim.player;
    let mx = 0;
    let my = 0;
    const k = this.keys;
    if (k.LEFT.isDown || k.A.isDown) mx -= 100;
    if (k.RIGHT.isDown || k.D.isDown) mx += 100;
    if (k.UP.isDown || k.W.isDown) my -= 100;
    if (k.DOWN.isDown || k.S.isDown) my += 100;
    if (mx && my) {
      mx = Math.sign(mx) * 71;
      my = Math.sign(my) * 71;
    }
    if (this.stick && !mx && !my) {
      // kleine Totzone, danach linear bis Vollgas
      const l = Math.hypot(this.stick.vx, this.stick.vy);
      if (l > 0.12) {
        const f = Math.min(1, (l - 0.12) / 0.7) / l;
        mx = Math.round(this.stick.vx * f * 100);
        my = Math.round(this.stick.vy * f * 100);
      }
    }
    if (this.drag && !mx && !my) {
      {
        const sens = settings.sensitivity;
        const tx = this.drag.sx + (this.drag.cx - this.drag.px) * sens;
        const ty = this.drag.sy + (this.drag.cy - this.drag.py) * sens;
        // Ziel außerhalb des Feldes: Anker nachziehen, damit die Gegenrichtung sofort greift
        const cx = Math.max(24, Math.min(WIDTH - 24, tx));
        const cy = Math.max(64, Math.min(HEIGHT - 24, ty));
        this.drag.sx += cx - tx;
        this.drag.sy += cy - ty;
        const sp = sim.d.speed;
        mx = Math.max(-100, Math.min(100, ((cx - p.x) / sp) * 100));
        my = Math.max(-100, Math.min(100, ((cy - p.y) / sp) * 100));
      }
    }
    const bomb = this.pendingBomb;
    this.pendingBomb = false;
    return { mx, my, bomb };
  }

  update(_t: number, delta: number) {
    const dt = Math.min(delta, 100);
    // Bildrate beobachten (effects = 'auto' schaltet mit Hysterese auf sparsam)
    this.frameAvg += (Math.min(delta, 60) - this.frameAvg) * 0.03;
    if (!this.perfLow && this.frameAvg > 24) this.perfLow = true;
    else if (this.perfLow && this.frameAvg < 18) this.perfLow = false;
    const f = this.advance(dt);
    this.updateBackground(f);
    this.updateFx(f);
    const sim = this.sim;
    if (sim) {
      this.renderSim(sim);
      if (f > 0) this.emitAmbient(sim, f);
    }
    // Bildschirmwackeln
    if (this.shake > 0 && settings.shake) {
      const s = this.shake;
      this.cameras.main.setScroll((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.shake = Math.max(0, this.shake - 0.6 * f);
    } else if (this.cameras.main.scrollX || this.cameras.main.scrollY) {
      this.cameras.main.setScroll(0, 0);
      this.shake = 0;
    }
    this.ui.updateHud(sim);
  }

  /**
   * Sim um dt ms voranbringen (Eingabe lesen, Ticks rechnen, Events verarbeiten). Liefert den
   * Zeitfaktor für Effekte in Ticks (0 = Pause). Die Wiedergabe überschreibt das (ReplayScene).
   */
  protected advance(dt: number): number {
    const sim = this.sim;
    if (sim && !this.paused && sim.phase !== 'shop') {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP_MS && n < 5) {
        if (sim.phase === 'over') {
          this.acc = 0;
          break;
        }
        sim.step(this.readInput());
        this.handleEvents(sim.drain());
        this.acc -= STEP_MS;
        n++;
      }
      if (n === 5) this.acc = 0;
      if (sim.phase === 'over') {
        this.overTimer += dt;
        if (this.overTimer > 1800 && this.overTimer - dt <= 1800) this.ui.showGameOver(sim);
      }
    }
    return this.paused ? 0 : dt / STEP_MS;
  }

  private updateBackground(f: number) {
    const boost = this.sim && this.sim.phase === 'intro' ? 3 : 1;
    for (const s of this.stars) {
      s.img.y += s.speed * f * boost;
      if (s.img.y > HEIGHT + 4) {
        s.img.y = -4;
        s.img.x = Math.random() * WIDTH;
      }
    }
    this.backdrop.update(f, boost > 1 ? 2 : 1);
  }

  // ───────────────────────────── Zeichnen ─────────────────────────────

  private pool(key: string, depth: number, blend = NORMAL, name = key): Pool {
    let p = this.pools.get(name);
    if (!p) {
      p = new Pool(this, key, depth, blend);
      this.pools.set(name, p);
    }
    return p;
  }

  /** Bild an einem lokalen Versatz (dx, dy) eines gedrehten Objekts */
  private at(x: number, y: number, rot: number, dx: number, dy: number): [number, number] {
    if (!rot) return [x + dx, y + dy];
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return [x + dx * c - dy * s, y + dx * s + dy * c];
  }

  /** flackernde Triebwerksflamme (zeigt nach oben, Fuß am Anker) */
  private enemyFlame(x: number, y: number, rot: number, dx: number, dy: number, size: number, depth = D.flame) {
    const [fx, fy] = this.at(x, y, rot, dx, dy);
    const img = this.pool('flame_e', depth, ADD, `flame_e@${depth}`).get(fx, fy);
    img.setOrigin(0.5, 0.95).setRotation(rot).setScale(0.5 * size * (0.9 + Math.random() * 0.2), 0.5 * size * (0.75 + Math.random() * 0.45));
  }

  /** Blinklicht (Positionslampe) */
  private blinkLight(x: number, y: number, on: boolean, key: string, size = 0.16) {
    if (!on) return;
    this.pool(key, D.part + 0.5, ADD, `blink_${key}`).get(x, y).setScale(size).setAlpha(0.95);
  }

  private renderSim(sim: Sim) {
    for (const p of this.pools.values()) p.begin();
    const tick = sim.tick;
    const pl = sim.player;

    // Gegner
    for (const e of sim.enemies) {
      if (e.type === 'turret') {
        this.pool('plate', D.plate).get(e.x, e.y).setRotation((e.id % 7) * 0.9);
        if (e.elite) this.eliteGlow(e, tick);
        this.enemyTint(this.pool('e_turret', 9, NORMAL, e.elite ? 'e_turret_elite' : 'e_turret').get(e.x, e.y), e);
        const gun = this.pool('e_turret_gun', D.enemy, NORMAL, e.elite ? 'e_turret_gun_elite' : 'e_turret_gun').get(e.x, e.y);
        gun.setRotation(Math.atan2(pl.y - e.y, pl.x - e.x) - Math.PI / 2);
        this.enemyTint(gun, e);
        continue;
      }
      if (e.type === 'boss') {
        this.renderBoss(sim, e);
        continue;
      }
      let rot = 0;
      if (e.type === 'spinner' || e.type === 'mine') rot = e.spin;
      else if (e.type === 'kamikaze') rot = e.age < 20 ? 0 : Math.atan2(e.vy, e.vx) - Math.PI / 2;
      else if (e.type === 'swarmer') rot = -e.vx * 0.15;
      else if (e.type === 'hunter' || e.type === 'sniper') rot = -e.vx * 0.06;
      else if (e.type === 'frigate') rot = -e.vx * 0.05;
      // Schwärmer: Flügelschlag 0-1-2-1, je Gegner versetzt
      const key = e.type === 'swarmer' ? `e_swarmer_f${[0, 1, 2, 1][Math.floor((tick + e.id * 5) / 4) % 4]}` : e.type === 'sniper' ? 'e_hunter' : `e_${e.type}`;
      if (e.elite) this.eliteGlow(e, tick);
      // Elite und Scharfschütze in eigenen Pools (Tönung bleibt sonst an fremden Bildern hängen)
      const img = this.pool(key, D.enemy, NORMAL, e.type === 'sniper' ? 'sniper' : e.elite ? `${key}_elite` : key).get(e.x, e.y).setRotation(rot);
      if (e.type === 'sniper') {
        img.setScale(0.58);
        this.pool('glow_purple', D.enemy - 0.5, ADD, 'sniperglow').get(e.x, e.y).setScale(0.5 + Math.sin(tick * 0.3) * 0.05).setAlpha(0.8);
      }
      this.enemyTint(img, e);
      this.enemyDetails(e, rot, tick);
    }

    // Items: pulsierender Schein dahinter
    const glowKey: Record<string, string> = { P: 'fx_softblue', crystal: 'glow_mint', repair: 'glow_green', shield: 'glow_purple', bomb: 'fx_soft' };
    for (const it of sim.items) {
      const y = it.y + Math.sin((tick + it.x) * 0.1) * 2;
      const pulse = Math.sin(tick * 0.15 + it.y);
      const gk = glowKey[it.kind] ?? 'fx_glow';
      // kurz bevor es herunterfällt: blinken; beim Fallen: trudeln und verblassen
      const falling = !it.pulled && it.age >= ITEM_HOVER;
      const warn = !it.pulled && !falling && it.age >= ITEM_HOVER - ITEM_WARN;
      const blink = warn ? (Math.floor(it.age / (it.age > ITEM_HOVER - 30 ? 4 : 7)) % 2 === 0 ? 1 : 0.35) : 1;
      const fade = falling ? Math.max(0.35, 1 - (it.age - ITEM_HOVER) / 90) : 1;
      const g = this.pool(gk, D.itemGlow, ADD, `itemglow_${gk}`).get(it.x, y);
      g.setScale(0.42 + pulse * 0.06).setAlpha((0.36 + pulse * 0.14) * (falling ? 0.4 : blink));
      const img = this.pool(`i_${it.kind}`, D.item).get(it.x, y);
      img.setScale(0.5 + pulse * 0.035).setAlpha(blink * fade);
      if (falling) img.setRotation((it.age - ITEM_HOVER) * 0.12 * (it.x % 2 ? 1 : -1));
      else if (it.kind === 'crystal') img.setRotation(Math.sin(tick * 0.08 + it.x) * 0.3);
      else img.setRotation(0);
    }


    // Spielerschüsse
    for (const b of sim.bullets) {
      // Splitter (Splitterkanone/Raketenschwarm): kleines r, Sprite der Mutterwaffe verkleinert, mit Glutpunkt und Drall
      if (b.r === 3 && b.kind !== 'pulse') {
        const a = Math.atan2(b.vy, b.vx);
        this.pool('fx_glow', D.bullet - 0.5, ADD, 'fragglow').get(b.x, b.y)
          .setScale(0.09 + Math.random() * 0.03).setAlpha(0.7).setTint(b.kind === 'spread' ? 0x9bea6a : b.kind === 'flak' ? 0xe4ee70 : 0xffb040);
        this.pool(`b_${b.kind}`, D.bullet, NORMAL, `frag_${b.kind}`).get(b.x, b.y)
          .setScale(0.3, 0.26).setRotation(a + Math.PI / 2 + Math.sin(b.life * 0.9) * 0.4);
        continue;
      }
      if (b.kind === 'plasma') {
        // Plasma-Orb: wabernde Kugel in Sim-Größe mit Schein; „Sonnenkern“ (verschluckt Kugeln) golden
        const sun = !!b.eat;
        const k = (b.r / 26) * 0.5;
        const wob = 1 + Math.sin(tick * 0.25 + b.x) * 0.06;
        this.pool(sun ? 'fx_soft' : 'glow_green', D.bullet - 0.5, ADD, sun ? 'sunglow' : 'orbglow').get(b.x, b.y)
          .setScale(k * (sun ? 2.6 : 2.9) * wob).setAlpha(0.55 * Math.min(1, b.life / 20));
        this.pool(sun ? 'b_plasma_5' : 'b_plasma', D.bullet).get(b.x, b.y)
          .setScale(k * 1.12 * wob).setRotation(tick * 0.05).setAlpha(Math.min(1, b.life / 20));
        continue;
      }
      const img = this.pool(`b_${b.kind}`, D.bullet).get(b.x, b.y);
      if (b.kind === 'rail') {
        // Railgun: Lichtspeer mit Nachleuchten
        img.setRotation(0);
        this.pool('fx_softblue', D.bullet - 0.5, ADD, 'railglow').get(b.x, b.y + 10).setScale(0.16 + b.r * 0.02, 0.5).setAlpha(0.6);
        img.setScale(0.5 * (b.r >= 7 ? 1.5 : 1), 0.5);
        continue;
      }
      // gerade nach oben fliegende Schüsse nicht drehen; Abpraller und Splitter schon
      if ((b.kind === 'main' || b.kind === 'side' || b.kind === 'laser' || b.kind === 'pulse') && Math.abs(b.vx) < 0.5) {
        img.setRotation(0);
        continue;
      }
      img.setRotation(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      if (b.kind === 'missile') {
        // Triebwerksglut der Rakete
        const a = Math.atan2(b.vy, b.vx);
        this.pool('glow_orange', D.bullet - 0.5, ADD, 'missileglow').get(b.x - Math.cos(a) * 11, b.y - Math.sin(a) * 11)
          .setScale(0.16 + Math.random() * 0.06).setAlpha(0.9);
      }
    }

    // Spieler
    this.emitters.clear();
    if (sim.phase !== 'over' && sim.phase !== 'shop') {
      const p = pl;
      const blink = p.invuln > 0 && Math.floor(tick / 3) % 2 === 0;
      const tilt = Math.max(-1, Math.min(1, p.vx / Math.max(1, sim.d.speed)));
      // Triebwerk: Schein + flackernde Flamme (bei Waffenstufe 4–5 größer)
      const big = p.gun >= 4 ? 1.25 : 1;
      // Schiffsklasse (Kreuzer/Schlachtschiff): mehrere Triebwerke, größerer Schild
      const cls = classOf(sim.loadout);
      for (const [ex, ey] of ENGINES[cls]) {
        const glow = this.pool('fx_softblue', D.player - 1.5, ADD, 'engineglow').get(p.x + ex, p.y + ey - 2);
        glow.setScale((0.38 + Math.random() * 0.06) * big).setAlpha(0.55 + Math.random() * 0.25);
        const flame = this.pool('flame', D.player - 1).get(p.x + ex, p.y + ey + Math.random() * 2);
        const fl = 0.5 + (p.gun >= 4 ? 0.12 : 0) + Math.random() * 0.08;
        flame.setScale(0.5 * (1 - Math.abs(tilt) * 0.2) * big, fl).setAlpha(0.9);
      }
      this.renderShip(sim, p.x, p.y, tilt, blink ? 0.35 : 1, tick);
      for (const cslot of CORE_SLOTS) {
        const core = sim.loadout.slots[cslot];
        if (core?.w !== 'drone') continue;
        // Anzahl wie in der Sim (1/1/2/2/3), Grafik je Stufe; der Schwarm (Stufe 5) knistert mit blauem Schein
        const n = sim.shotDamage('drone', core.lvl)[0];
        const lvl = spriteLvl(core.lvl);
        for (let i = 0; i < n; i++) {
          const [dx, dy] = sim.dronePos(i, cslot);
          if (lvl >= 5) {
            this.pool('glow_cyan', D.player + 0.9, ADD, 'droneglow').get(dx, dy)
              .setScale(0.2 + Math.sin(tick * 0.3 + i * 2) * 0.03).setAlpha(0.5 + Math.random() * 0.2);
          }
          this.pool(lvl === 1 ? 'drone' : `drone_${lvl}`, D.player + 1).get(dx, dy).setRotation(tick * 0.08);
        }
      }
      if (p.bubble > 0) {
        const b = this.pool('fx_bubble', D.player + 2).get(p.x, p.y + 4);
        b.setScale((0.5 + Math.sin(tick * 0.2) * 0.02) * shipClass(cls).scale).setAlpha(p.bubble < 90 && Math.floor(tick / 5) % 2 ? 0.3 : 0.9);
      } else if (p.shield > 0.5 && sim.d.shieldMax > 0) {
        const b = this.pool('fx_bubble', D.player + 2).get(p.x, p.y + 4);
        b.setScale(0.48 * shipClass(cls).scale).setAlpha(0.15 + 0.35 * (p.shield / sim.d.shieldMax)).setTint(0x7cf7ff);
      }
      // Zielerfassung: pulsierender roter Ring ums Schiff (ältere Sim-Kerne der Wiedergabe kennen sie nicht)
      if ((sim as { locked?: () => boolean }).locked?.()) {
        this.pool('fx_bubble', D.player + 2, ADD, 'lockring').get(p.x, p.y + 4)
          .setScale((0.62 + Math.sin(tick * 0.35) * 0.04) * shipClass(cls).scale).setAlpha(0.55).setTint(0xff3d6e);
      }
    }

    // Strahllaser und Blitzbögen (nach dem Schiff, damit die Emitter-Positionen aktuell sind)
    this.renderBeams(sim, tick);
    this.renderArcs();

    // Gegnerkugeln: über allem (auch über Explosionen), mit rotem Schein, damit sie immer lesbar bleiben
    // Schwere Kugeln (Schadensstufe 1–3 ab Sektor 5; alte Kerne in der Wiedergabe kennen das Feld nicht): größer, heller Rand, stärkerer Schein
    for (const b of sim.ebullets) {
      const pulse = Math.sin(tick * 0.4 + b.x);
      const h = (b as { heavy?: number }).heavy ?? 0;
      const gk = b.big ? 'glow_orange' : 'glow_red';
      this.pool(gk, D.ebGlow, ADD, `ebglow_${gk}`).get(b.x, b.y)
        .setScale(((b.big ? 0.36 : 0.26) + pulse * 0.03) * (1 + 0.14 * h)).setAlpha(0.4 + 0.05 * h);
      const key = (b.big ? 'eb_big' : 'eb_orb') + (h > 0 ? `_h${Math.min(3, h)}` : '');
      const img = this.pool(key, D.ebullet).get(b.x, b.y);
      img.setScale(0.5 + pulse * 0.04);
    }

    this.renderHazards(sim, tick);

    // Lebensbalken der Fregatte
    for (const e of sim.enemies) {
      if (e.type !== 'frigate' || e.hp >= e.maxHp) continue;
      const w = 90;
      const bar = this.pool('bar', 26).get(e.x, e.y - 52);
      bar.setDisplaySize(w * (e.hp / e.maxHp), 5);
    }
    for (const p of this.pools.values()) p.end();
  }

  /** Triebwerke, Rotoren, Blinklichter und Geschütze der normalen Gegner */
  private enemyDetails(e: Enemy, rot: number, tick: number) {
    const { x, y } = e;
    switch (e.type) {
      case 'hunter':
      case 'sniper':
        this.enemyFlame(x, y, rot, 0, -14, 0.8);
        break;
      case 'kamikaze':
        this.enemyFlame(x, y, rot, 0, -12, e.age < 20 ? 0.6 : 1.1);
        break;
      case 'bomber': {
        this.enemyFlame(x, y, rot, -5, -26, 0.8);
        this.enemyFlame(x, y, rot, 5, -26, 0.8);
        for (const s of [-1, 1]) {
          this.pool('d_rotor', D.part).get(x + s * 23, y).setRotation(tick * 0.45 * s);
        }
        const on = Math.floor((tick + e.id * 7) / 20) % 2 === 0;
        this.blinkLight(x - 36, y - 5, on, 'glow_red');
        this.blinkLight(x + 36, y - 5, !on, 'glow_mint');
        break;
      }
      case 'frigate': {
        this.enemyFlame(x, y, rot, -9, -40, 1.1);
        this.enemyFlame(x, y, rot, 9, -40, 1.1);
        const [rx, ry] = this.at(x, y, rot, 0, -28);
        const radar = this.pool('d_radar', D.part).get(rx, ry);
        radar.setScale(0.5 * Math.cos(tick * 0.06), 0.5).setRotation(rot);
        this.flashTint(radar, e.flash);
        const pl = this.sim!.player;
        for (const s of [-1, 1]) {
          const [gx, gy] = this.at(x, y, rot, s * 41, 6);
          const gun = this.pool('d_gun', D.part).get(gx, gy).setOrigin(0.5, 8 / 26);
          const aim = Math.atan2(pl.y - gy, pl.x - gx) - Math.PI / 2;
          gun.setRotation(Math.max(-1.1, Math.min(1.1, aim)));
          this.flashTint(gun, e.flash);
          const [lx, ly] = this.at(x, y, rot, s * 62, -2);
          this.blinkLight(lx, ly, Math.floor((tick + (s > 0 ? 15 : 0)) / 15) % 2 === 0, s < 0 ? 'glow_red' : 'glow_mint');
        }
        break;
      }
      case 'spinner': {
        // pulsierender Kern
        const k = this.pool('glow_red', D.part, ADD, 'spinglow').get(x, y);
        k.setScale(0.2 + Math.sin(tick * 0.25 + e.id) * 0.05).setAlpha(0.8);
        break;
      }
      case 'mine':
        this.blinkLight(x, y, Math.floor((tick + e.id * 3) / 12) % 2 === 0, 'glow_red', 0.22);
        break;
    }
  }

  /** Endgegner mit Triebwerken, drehbaren Geschützen, Ring/Kern und Lichtern */
  private renderBoss(sim: Sim, e: Enemy) {
    const v = e.p[0] % 4;
    const rig = BOSS_RIGS[v];
    const tick = sim.tick;
    const { x, y } = e;
    this.lastBoss = { v, x, y };
    const ratio = e.hp / Math.max(1, e.maxHp);
    // leichtes Schwanken; unter 33 % zittert der Rumpf
    const wob = ratio < 0.33 ? (Math.random() - 0.5) * 1.6 : 0;
    const bx = x + wob;
    for (const [dx, dy] of rig.engines) this.enemyFlame(bx, y, 0, dx, dy, 1.6 + (sim.boss && sim.bossT === 0 ? 0.6 : 0), D.bossFlame);
    const body = this.pool(`boss_${v}`, D.boss).get(bx, y);
    this.flashTint(body, e.flash);
    // Kern-Leuchten
    const [cx, cy] = rig.core;
    const ph = sim.bossPhase;
    const core = this.pool(BOSS_GLOW[v], D.bossPart + 0.4, ADD, `bosscore${v}`).get(bx + cx, y + cy);
    core.setScale(0.55 + Math.sin(tick * (0.08 + ph * 0.05)) * 0.12 + ph * 0.08).setAlpha(0.55);
    if (rig.ring) {
      const ring = this.pool('boss_ring', D.bossPart).get(bx + cx, y + cy);
      ring.setRotation(tick * (0.012 + ph * 0.012));
      this.flashTint(ring, e.flash);
    }
    // Geschütze zielen auf den Spieler (begrenzter Schwenkbereich), Rückstoß beim Feuern
    const pl = sim.player;
    const recoil = this.bossFire > 0 ? this.bossFire * 0.7 : 0;
    for (const [dx, dy] of rig.guns) {
      const gx = bx + dx;
      const gy = y + dy;
      const aim = Math.max(-0.9, Math.min(0.9, Math.atan2(pl.y - gy, pl.x - gx) - Math.PI / 2));
      const gun = this.pool(`boss_gun_${v}`, D.bossPart).get(gx + Math.sin(aim) * recoil, gy - Math.cos(aim) * recoil);
      gun.setOrigin(0.5, 16 / 44).setRotation(aim);
      if (rig.organic) gun.setScale(0.5 + Math.sin(tick * 0.12 + dx) * 0.04);
      this.flashTint(gun, e.flash);
      if (this.bossFire > 3) {
        const mz = this.pool('fx_muzzle', D.fx, ADD, 'bossmuzzle').get(gx - Math.sin(aim) * 24, gy + Math.cos(aim) * 24);
        mz.setScale(0.4 + Math.random() * 0.2).setTint(BOSS_TINT[v]).setRotation(Math.random());
      }
    }
    // Lichter: mechanisch blinkend, organisch pulsierend
    rig.lights.forEach(([dx, dy], i) => {
      if (rig.organic) {
        const l = this.pool('glow_green', D.bossPart + 0.5, ADD, 'bosslight').get(bx + dx, y + dy);
        l.setScale(0.14 + Math.sin(tick * 0.09 + i) * 0.05).setAlpha(0.7);
      } else {
        this.blinkLight(bx + dx, y + dy, Math.floor((tick + i * 11) / 18) % 2 === 0, i % 2 ? 'glow_mint' : 'glow_red', 0.2);
      }
    });
    // glimmende Schadstellen
    if (ratio < 0.33) {
      for (const [dx, dy] of rig.smoke) {
        const g = this.pool('glow_orange', D.bossPart + 0.6, ADD, 'bossfire').get(bx + dx, y + dy);
        g.setScale(0.22 + Math.random() * 0.12).setAlpha(0.8);
      }
    }
  }

  /** Treffer-Blitz, sonst Elite golden, Scharfschütze rot */
  private enemyTint(img: Phaser.GameObjects.Image, e: Enemy) {
    if (e.flash > 0) img.setTintFill(0xffffff);
    else if (e.elite) img.setTint(0xffd75a, 0xffd75a, 0xffa020, 0xffa020);
    else if (e.type === 'sniper') img.setTint(0xc890ff);
    else img.clearTint();
  }

  /** goldener, pulsierender Schein unter Elite-Gegnern */
  private eliteGlow(e: Enemy, tick: number) {
    const pulse = Math.sin(tick * 0.2 + e.id);
    this.pool('fx_soft', D.enemy - 0.5, ADD, 'eliteglow').get(e.x, e.y)
      .setScale((e.rx / 34) * (1 + pulse * 0.08)).setAlpha(0.6 + pulse * 0.15).setTint(0xffc030);
    this.eliteRings.push(e);
  }

  /**
   * Sperrfeuer (Warnstreifen → Laservorhang), Ziellinien der Scharfschützen und Pfeile am Rand für Gegner,
   * die von der Seite oder von unten einfliegen.
   */
  private renderHazards(sim: Sim, tick: number) {
    const g = this.hazG;
    g.clear();
    // Elite: goldener, gestrichelter Ring, der sich dreht
    for (const e of this.eliteRings) {
      const r = Math.max(e.rx, e.ry) + 9;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a0 = tick * 0.05 + (i * Math.PI * 2) / n;
        g.lineStyle(5, 0x2b1d14, 0.8).beginPath().arc(e.x, e.y, r, a0, a0 + 0.38).strokePath();
        g.lineStyle(3, 0xffd75a, 1).beginPath().arc(e.x, e.y, r, a0, a0 + 0.38).strokePath();
      }
    }
    this.eliteRings.length = 0;
    for (const h of sim.hazards) {
      const col = h.kind === 'col';
      // Streifen als Rechteck: entlang (a0..a1) und quer (c - w .. c + w)
      const rect = (half: number, color: number, alpha: number, gr = g) => {
        gr.fillStyle(color, alpha);
        if (col) gr.fillRect(h.x - half, 0, half * 2, HEIGHT);
        else gr.fillRect(0, h.y - half, WIDTH, half * 2);
      };
      const line = (off: number, color: number, alpha: number, width: number) => {
        g.lineStyle(width, color, alpha);
        if (col) g.lineBetween(h.x + off, 0, h.x + off, HEIGHT);
        else g.lineBetween(0, h.y + off, WIDTH, h.y + off);
      };
      if (h.t < h.warn) {
        const k = h.t / h.warn;
        const blink = Math.floor(h.t / (k > 0.6 ? 3 : 6)) % 2 === 0;
        rect(h.w, 0xff2040, blink ? 0.32 : 0.16);
        line(-h.w, 0xff3d6e, 0.95, 3);
        line(h.w, 0xff3d6e, 0.95, 3);
        // Ladeanzeige: zwei Linien laufen von den Rändern zur Mitte
        line(-h.w * (1 - k), 0xffffff, 0.75, 2);
        line(h.w * (1 - k), 0xffffff, 0.75, 2);
        // Warndreiecke entlang des Streifens
        g.fillStyle(blink ? 0xffe45c : 0xff7a1f, 0.95);
        for (let a = 60 + ((tick * 2) % 120); a < (col ? HEIGHT : WIDTH); a += 120) {
          const [cx, cy] = col ? [h.x, a] : [a, h.y];
          g.fillTriangle(cx, cy - 9, cx - 9, cy + 7, cx + 9, cy + 7);
          g.fillStyle(0x2b1d14, 1).fillRect(cx - 1.2, cy - 4, 2.4, 6).fillRect(cx - 1.2, cy + 3.5, 2.4, 2);
          g.fillStyle(blink ? 0xffe45c : 0xff7a1f, 0.95);
        }
      } else {
        const left = h.warn + h.dur - h.t;
        const fade = Math.min(1, left / 8);
        const fl = 0.85 + Math.random() * 0.3;
        // Schein additiv (fxG), Kern deckend
        rect(h.w * 1.6 * fl, 0xff2040, 0.25 * fade, this.fxG);
        rect(h.w * 1.1 * fl, 0xff3d6e, 0.45 * fade, this.fxG);
        rect(h.w * fl, 0xff2a50, 0.55 * fade);
        rect(h.w * 0.5 * fl, 0xffb0c4, 0.95 * fade);
        rect(h.w * 0.2, 0xffffff, fade);
      }
    }
    // Scharfschütze: rote Ziellinie kurz vor dem Schuss
    const pl = sim.player;
    for (const e of sim.enemies) {
      if (e.type !== 'sniper' || e.y < 0 || e.fireT > 40 || e.burst > 0 || sim.phase === 'over') continue;
      const blink = Math.floor(tick / 3) % 2 === 0;
      g.lineStyle(blink ? 3 : 2, 0xff4060, blink ? 0.95 : 0.6).lineBetween(e.x, e.y + 10, pl.x, pl.y);
      const r = 22 + e.fireT * 0.6;
      g.lineStyle(2.5, 0xff4060, 0.95).strokeCircle(pl.x, pl.y, r);
      g.lineBetween(pl.x - r - 6, pl.y, pl.x - r + 8, pl.y).lineBetween(pl.x + r - 8, pl.y, pl.x + r + 6, pl.y);
      g.lineBetween(pl.x, pl.y - r - 6, pl.x, pl.y - r + 8).lineBetween(pl.x, pl.y + r - 8, pl.x, pl.y + r + 6);
    }
    // Pfeile am Rand: hier kommt gleich etwas herein
    const blink = Math.floor(tick / 5) % 2 === 0;
    for (const e of sim.enemies) {
      let ax = 0;
      let ay = 0;
      let rot = 0;
      // unten über der HUD-Leiste, seitlich am Rand
      if (e.y > HEIGHT + 4 && e.vy < 0) [ax, ay, rot] = [Math.max(20, Math.min(WIDTH - 20, e.x)), HEIGHT - 64, 0];
      else if (e.x < -4 && e.vx > 0 && e.y > 0) [ax, ay, rot] = [18, Math.min(HEIGHT - 64, e.y), Math.PI / 2];
      else if (e.x > WIDTH + 4 && e.vx < 0 && e.y > 0) [ax, ay, rot] = [WIDTH - 18, Math.min(HEIGHT - 64, e.y), -Math.PI / 2];
      else continue;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const sc = blink ? 1.15 : 1;
      const tri = (k: number): number[] => [[0, -16], [-14, 10], [14, 10]].flatMap(([x, y]) => [ax + (x * c - y * s) * sc * k, ay + (x * s + y * c) * sc * k]);
      const o = tri(1.22);
      g.fillStyle(0x2b1d14, 0.95).fillTriangle(o[0], o[1], o[2], o[3], o[4], o[5]);
      const t = tri(1);
      g.fillStyle(blink ? 0xffe45c : 0xff7a1f, 1).fillTriangle(t[0], t[1], t[2], t[3], t[4], t[5]);
    }
  }

  private flashTint(img: Phaser.GameObjects.Image, flash: number) {
    if (flash > 0) img.setTintFill(0xffffff);
    else img.clearTint();
  }

  /**
   * Spielerschiff aus Einzelteilen (Ausleger, Träger, Pods, Rumpf-Aufsatz, Schiff, Bordkanone).
   * Leichtes Kippen beim Seitwärtsflug, Rückstoß beim Feuern, Leuchtpuls der Lampen, Positionslichter am Ausleger.
   * Merkt sich die Mündungen je Steckplatz (this.emitters), an denen Strahl und Blitz ansetzen.
   */
  private renderShip(sim: Sim, px: number, py: number, tilt: number, alpha: number, tick: number) {
    const k = 1 - Math.abs(tilt) * 0.12;
    const rot = tilt * 0.06;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const toWorld = (lx: number, ly: number): [number, number] => [px + lx * cs - ly * sn, py + lx * sn + ly * cs];
    for (const part of shipLayout(sim.loadout, sim.player.gun)) {
      const meta = partMeta(part.key);
      if (!meta) continue;
      const slot = part.slot;
      const lvl = part.lvl ?? 1;
      const w = part.key.split('_')[1];
      const lx = part.x;
      let ly = part.y;
      const r = slot ? this.recoil[slot] ?? 0 : 0;
      // Rückstoß: Pods und Laser rucken nach hinten, die Heckkanone nach vorn
      if (slot) ly += w === 'rear' ? -r * 2.5 : w === 'beam' || w === 'drone' ? 0 : r * (1.2 + Math.min(3, lvl));
      const [wx, wy] = toWorld(lx, ly);
      // animierte Evolutionen: Gatling-Trommel dreht sich, Gewitterspule knistert (Frames `${key}_f${i}`)
      let key = part.key;
      if (key === 'pod_side_5') key += `_f${Math.floor(tick / 2) % 3}`;
      else if (key === 'core_arc_5') key += `_f${Math.floor(tick / 5) % 3}`;
      const img = this.pool(key, D.player + part.z * 0.1).get(wx, wy);
      const ps = part.scale ?? 1;
      const sx = 0.5 * ps * (part.key.startsWith('player') || part.key.startsWith('hullgun') ? 1 - Math.abs(tilt) * 0.14 : k);
      img.setOrigin(meta.ax / meta.w, meta.ay / meta.h).setRotation(rot).setScale(part.flip ? -sx : sx, 0.5 * ps).setAlpha(alpha);
      if (part.key.startsWith('rig')) {
        // Positionslichter: links rot, rechts grün, abwechselnd blinkend
        const on = Math.floor(tick / 24) % 2;
        for (const sd of [-1, 1]) {
          const [gx, gy] = toWorld(sd * meta.lamp[0], ly);
          const lit = (sd < 0) === (on === 0);
          this.pool(sd < 0 ? 'glow_red' : 'glow_green', D.player + 0.3, ADD, `nav_${sd}`).get(gx, gy).setScale(lit ? 0.16 : 0.08).setAlpha((lit ? 0.95 : 0.35) * alpha);
        }
        continue;
      }
      if (!slot) continue;
      const fl = part.flip ? -1 : 1;
      if (meta.tips.length) {
        const tips = meta.tips.map(([tx, ty]) => toWorld(lx + tx * fl, ly + ty));
        this.emitters.set(slot, tips);
        if (this.fired.has(slot) && w !== 'beam' && w !== 'arc') {
          const down = w === 'rear';
          for (const [tx, ty] of tips) {
            this.particle('fx_muzzle', tx, ty + (down ? 4 : -4), { s0: 0.26 + lvl * 0.06, s1: 0.08, max: 4, tint: MUZZLE_TINT[w] ?? 0xffffff, rot: Math.random() });
          }
        }
      }
      // Lampe: ab Stufe 2 Leuchtpuls, beim Schuss hell; Strahl-Emitter glüht im Dauerbetrieb, Blitzspule knistert
      let a = (lvl >= 2 ? 0.2 + 0.15 * Math.sin(tick * 0.12 + part.x * 0.1) : 0) + r * 0.6;
      if (w === 'beam' && sim.beams.length) a = 0.55 + Math.random() * 0.25;
      if (w === 'arc') a = Math.max(a, 0.2 + Math.random() * 0.35 * lvl * 0.5);
      if (a > 0.02) {
        const [gx, gy] = toWorld(lx + meta.lamp[0] * fl, ly + meta.lamp[1]);
        const tex = LAMP_GLOW[w] ?? 'fx_glow';
        this.pool(tex, D.player + 0.3, ADD, `lamp_${tex}`).get(gx, gy).setScale(0.05 + lvl * 0.02 + r * 0.04).setAlpha(Math.min(0.85, a) * alpha);
      }
    }
    // Rückstoß klingt ab
    for (const s of Object.keys(this.recoil) as SlotId[]) this.recoil[s] = (this.recoil[s] ?? 0) * (this.paused ? 1 : 0.7);
    this.fired.clear();
  }

  /** Strahllaser: Dunst, Glühen, flackernder Kern, aufsteigende Energieringe, Stufe 3 mit Doppelhelix; Flares an Emitter und Treffer */
  private renderBeams(sim: Sim, tick: number) {
    const gx = this.fxG;
    gx.clear();
    const BEAM_COL = [0, 0xff4fa8, 0xff3d8c, 0xff2a6e, 0xff2050, 0xff1030];
    const tips: [number, number][] = [];
    for (const slot of SLOTS) if (sim.loadout.slots[slot]?.w === 'beam') tips.push(...(this.emitters.get(slot) ?? []));
    for (const bm of sim.beams) {
      let sx = bm.x;
      let sy = bm.y0;
      for (const [tx, ty] of tips) if (Math.abs(tx - bm.x) < 14) [sx, sy] = [tx, ty];
      const y1 = Math.min(bm.y1, sy - 4);
      const len = sy - y1;
      const fl = 0.88 + Math.random() * 0.24;
      const w = bm.w;
      const col = BEAM_COL[bm.lvl];
      // weicher Schein aus gestaffelten Schichten (wirkt wie ein Verlauf)
      for (let i = 4; i >= 1; i--) {
        const hw = w * (1.1 + i * 0.55) * fl;
        gx.fillStyle(col, 0.075).fillRect(sx - hw, y1, hw * 2, len);
      }
      gx.fillStyle(col, 0.6).fillRect(sx - w * 1.05, y1, w * 2.1, len);
      const cw = w * (0.55 + Math.random() * 0.18);
      gx.fillStyle(0xfff4fa, 0.95).fillRect(sx - cw / 2, y1, cw, len);
      // Energieringe laufen den Strahl hinauf
      const gap = 34;
      for (let y = sy - ((tick * 11) % gap); y > y1; y -= gap) gx.fillStyle(0xffd0ec, 0.28).fillEllipse(sx, y, w * 2.4, 6);
      if (bm.lvl >= 3) {
        for (const ph of [0, Math.PI]) {
          gx.lineStyle(2, 0xffe0f2, 0.6).beginPath();
          gx.moveTo(sx, sy);
          for (let y = sy - 8; y >= y1; y -= 8) gx.lineTo(sx + Math.sin(y * 0.045 + tick * 0.35 + ph) * w * 1.5, y);
          gx.strokePath();
        }
      }
      this.pool('glow_pink', D.bullet, ADD, 'beamflare').get(sx, sy).setScale((0.2 + 0.05 * bm.lvl) * fl).setAlpha(0.95);
      this.pool('fx_glow', D.bullet + 0.1, ADD, 'beamcore').get(sx, sy).setScale((0.07 + 0.02 * bm.lvl) * fl).setAlpha(0.9);
      if (bm.hit && bm.lvl < 3 && y1 > -10) {
        this.pool('glow_pink', D.bullet, ADD, 'beamflare').get(sx, y1).setScale(0.28 + Math.random() * 0.16).setAlpha(0.9);
        this.pool('fx_glow', D.bullet + 0.1, ADD, 'beamcore').get(sx, y1).setScale(0.1 + Math.random() * 0.06).setAlpha(1);
        if (!this.paused && Math.random() < 0.35) this.sparks(sx, y1, 1, Math.PI / 2, 2.6, 0xff4fa8, 0.7);
      }
    }
    if (sim.beams.length && !this.paused) {
      const now = performance.now();
      if (now > this.beamSound) {
        this.beamSound = now + 170;
        sfx.play('beam', sim.beams[0].x);
      }
    }
  }

  /** Blitzbögen: setzen an der Spule an, Zickzack mit Verästelungen (alle 2 Bilder neu), Leuchten an jedem Treffer */
  private renderArcs() {
    const gx = this.fxG;
    if (!this.paused) this.arcs = this.arcs.filter((a) => ++a.t <= 10);
    for (const a of this.arcs) {
      const alpha = 1 - a.t / 11;
      const em = a.ship ? this.emitters.get('core')?.[0] : undefined;
      if (em) [a.pts[0], a.pts[1]] = em;
      if (!a.path || (a.t % 2 === 1 && !this.paused)) {
        a.path = [];
        a.forks = [];
        const pts = a.pts;
        for (let i = 2; i < pts.length; i += 2) {
          const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
          const dx = x1 - x0, dy = y1 - y0;
          const l = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / l, ny = dx / l;
          const steps = Math.max(3, Math.min(9, Math.round(l / 22)));
          const amp = Math.min(16, l * 0.12);
          if (i === 2) a.path.push(x0, y0);
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            const j = (Math.random() - 0.5) * 2 * amp;
            const qx = x0 + dx * t + nx * j, qy = y0 + dy * t + ny * j;
            a.path.push(qx, qy);
            if (Math.random() < 0.28) {
              const fa = Math.atan2(dy, dx) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7);
              const fl = 8 + Math.random() * 14;
              const mx = qx + Math.cos(fa) * fl * 0.5 + (Math.random() - 0.5) * 6;
              const my = qy + Math.sin(fa) * fl * 0.5 + (Math.random() - 0.5) * 6;
              a.forks.push([qx, qy, mx, my, qx + Math.cos(fa) * fl, qy + Math.sin(fa) * fl]);
            }
          }
          a.path.push(x1, y1);
        }
      } else if (em) {
        a.path[0] = em[0];
        a.path[1] = em[1];
      }
      for (const [width, col, al] of [[11, 0x2ec4ff, 0.16], [5, 0x7cf7ff, 0.5], [2, 0xffffff, 1]] as const) {
        gx.lineStyle(width, col, al * alpha).beginPath();
        gx.moveTo(a.path[0], a.path[1]);
        for (let i = 2; i < a.path.length; i += 2) gx.lineTo(a.path[i], a.path[i + 1]);
        gx.strokePath();
        if (width < 11) {
          for (const f of a.forks) {
            gx.lineStyle(width * 0.6, col, al * alpha * 0.8).beginPath();
            gx.moveTo(f[0], f[1]);
            gx.lineTo(f[2], f[3]);
            gx.lineTo(f[4], f[5]);
            gx.strokePath();
          }
        }
      }
      for (let i = 0; i < a.pts.length; i += 2) {
        const big = i === 0 ? 0.22 : 0.3;
        this.pool('glow_cyan', D.bullet, ADD, 'arcglow').get(a.pts[i], a.pts[i + 1]).setScale(big * (0.8 + Math.random() * 0.4)).setAlpha(alpha);
      }
    }
  }

  // ───────────────────────────── Effekte ─────────────────────────────

  private particle(key: string, x: number, y: number, o: ParticleOpts) {
    if (this.particles.length > (this.lowFx ? 140 : 520)) return;
    let img = this.freeParticles.pop();
    if (!img) img = this.add.image(0, 0, key);
    else img.setTexture(key).setVisible(true);
    img.setDepth(o.depth ?? D.fx).setBlendMode(o.blend ?? ADD).setOrigin(0.5);
    if (o.tint !== undefined) img.setTint(o.tint);
    else img.clearTint();
    img.setRotation(o.rot ?? 0);
    const max = o.max ?? 30;
    const p: Particle = {
      img, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, life: max, max, s0: o.s0 ?? 0.5, s1: o.s1 ?? 0, a0: o.a0 ?? 1, drag: o.drag ?? 0.94, spin: o.spin ?? 0, curve: o.curve ?? 0,
    };
    img.setPosition(x, y).setScale(p.s0).setAlpha(p.curve === 1 ? 0 : p.a0);
    this.particles.push(p);
  }

  private updateFx(f: number) {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life -= f;
      if (p.life <= 0) {
        p.img.setVisible(false);
        this.freeParticles.push(p.img);
        continue;
      }
      const d = Math.pow(p.drag, f);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * f;
      p.y += p.vy * f;
      const t = 1 - p.life / p.max;
      const a = p.curve === 1 ? (t < 0.12 ? t / 0.12 : (1 - t) / 0.88) : p.curve === 2 ? (t < 0.7 ? 1 : (1 - t) / 0.3) : 1 - t;
      p.img.setPosition(p.x, p.y).setScale(p.s0 + (p.s1 - p.s0) * t).setAlpha(p.a0 * a);
      if (p.spin) p.img.rotation += p.spin * f;
      keep.push(p);
    }
    this.particles = keep;
    const kp: Popup[] = [];
    for (const p of this.popups) {
      p.life -= f;
      if (p.life <= 0) {
        p.t.destroy();
        continue;
      }
      p.t.y += p.vy * f;
      const t = 1 - p.life / p.max;
      p.t.setAlpha(t > 0.7 ? (1 - t) / 0.3 : 1);
      if (t < 0.12) p.t.setScale(0.6 + (t / 0.12) * 0.5);
      else p.t.setScale(1.1 - Math.min(0.1, (t - 0.12) * 0.5));
      kp.push(p);
    }
    this.popups = kp;
    if (this.flashRect.alpha > 0) this.flashRect.setAlpha(Math.max(0, this.flashRect.alpha - 0.05 * f));
    if (this.bossFire > 0) this.bossFire = Math.max(0, this.bossFire - f);
    if (this.wreck) this.updateWreck(this.wreck, f);
  }

  /** laufende Effekte pro Frame: Raketen-Rauchspur, qualmender Boss, angeschlagene Fregatte/Spieler */
  private emitAmbient(sim: Sim, f: number) {
    const low = this.lowFx;
    const chance = (rate: number) => Math.random() < rate * f * (low ? 0.4 : 1);
    for (const b of sim.bullets) {
      if (b.kind !== 'missile' || !chance(0.75)) continue;
      const a = Math.atan2(b.vy, b.vx);
      this.particle('fx_smoke', b.x - Math.cos(a) * 12, b.y - Math.sin(a) * 12, {
        s0: 0.1, s1: 0.32, max: 24, a0: 0.45, curve: 1, blend: NORMAL, depth: D.smoke, vx: (Math.random() - 0.5) * 0.4, vy: 0.6, rot: Math.random() * 6, drag: 0.96,
      });
    }
    const boss = sim.boss;
    if (boss && boss.hp > 0) {
      const ratio = boss.hp / boss.maxHp;
      const rig = BOSS_RIGS[boss.p[0] % 4];
      const pts = ratio < 0.33 ? rig.smoke : ratio < 0.66 ? rig.smoke.slice(0, 1) : [];
      for (const [dx, dy] of pts) {
        if (!chance(ratio < 0.33 ? 0.4 : 0.15)) continue;
        this.particle('fx_smoke', boss.x + dx + (Math.random() - 0.5) * 6, boss.y + dy, {
          s0: 0.22, s1: 0.75, max: 46, a0: ratio < 0.33 ? 0.55 : 0.35, curve: 1, blend: NORMAL, depth: D.smoke, vx: (Math.random() - 0.5) * 0.5, vy: 1.1, rot: Math.random() * 6, spin: 0.01, drag: 0.985, tint: 0x9a90a0,
        });
      }
      if (ratio < 0.33 && chance(0.12)) {
        const [dx, dy] = rig.smoke[Math.floor(Math.random() * rig.smoke.length)];
        this.sparks(boss.x + dx, boss.y + dy, 3, Math.PI / 2, 1.4, 0xffb040);
      }
    }
    for (const e of sim.enemies) {
      if (e.type === 'frigate' && e.hp < e.maxHp * 0.5 && chance(0.25)) {
        this.particle('fx_smoke', e.x + 24, e.y - 6, { s0: 0.2, s1: 0.6, max: 40, a0: 0.5, curve: 1, blend: NORMAL, depth: D.smoke, vy: 1, rot: Math.random() * 6, drag: 0.98 });
      }
    }
    const p = sim.player;
    if (sim.phase !== 'over' && sim.phase !== 'shop' && p.hull < sim.d.maxHull * 0.3 && chance(0.3)) {
      this.particle('fx_smoke', p.x + (Math.random() - 0.5) * 16, p.y + 20, { s0: 0.12, s1: 0.4, max: 30, a0: 0.45, curve: 1, blend: NORMAL, depth: D.player - 2, vy: 2.2, rot: Math.random() * 6, drag: 0.97 });
    }
  }

  /** gerichtete Funken: Kegel um den Winkel dir (Bogenmaß), Öffnung spread */
  private sparks(x: number, y: number, n: number, dir: number, spread: number, tint = 0xffe45c, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = (3 + Math.random() * 5) * speed;
      this.particle('fx_spark', x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: a + Math.PI / 2, s0: 0.45 + Math.random() * 0.25, s1: 0.1, max: 9 + Math.random() * 8, drag: 0.88, tint: i % 2 ? 0xffffff : tint,
      });
    }
  }

  /** Trümmerstücke (Metall oder Organik), treiben mit der Kulisse nach unten ab */
  private debris(x: number, y: number, n: number, r: number, organic: boolean, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4 * (r > 25 ? 1.5 : 1);
      const key = organic ? 'fx_goo' : `fx_debris_${Math.floor(Math.random() * 3)}`;
      const s = (0.32 + Math.random() * 0.3) * scale;
      this.particle(key, x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.5, s0: s, s1: s * 0.7, max: 20 + Math.random() * 18 * scale, drag: 0.965, spin: (Math.random() - 0.5) * 0.3, rot: Math.random() * 6,
        curve: 2, blend: NORMAL, depth: D.debris,
      });
    }
  }

  private smokePuffs(x: number, y: number, n: number, r: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.5;
      this.particle('fx_smoke', x + Math.cos(a) * d, y + Math.sin(a) * d, {
        vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6 + 0.7, s0: r / 60, s1: r / 22 + Math.random() * 0.3, max: 45 + Math.random() * 30, a0: 0.55, curve: 1, blend: NORMAL, depth: D.smoke, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.02, drag: 0.97,
      });
    }
  }

  private explosion(x: number, y: number, r: number, color = 0xffb040, organic = false) {
    const big = r > 25;
    // Blitz, Feuerball, Schockwelle
    this.particle('fx_glow', x, y, { s0: r / 30, s1: r / 16, max: 8, a0: 0.9 });
    this.particle('fx_soft', x, y, { s0: r / 40, s1: r / 22, max: big ? 20 : 14, a0: 1, tint: organic ? 0xd8ff90 : undefined });
    this.particle('fx_shock', x, y, { s0: 0.1, s1: r / 20, max: big ? 22 : 16, a0: 0.75, tint: color, drag: 1 });
    // Funken und Glut
    this.sparks(x, y, this.cnt(big ? 12 : 6), 0, Math.PI * 2, color, big ? 1.4 : 1);
    const n = this.cnt(big ? 12 : 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1 + Math.random() * 3.5) * (big ? 1.6 : 1);
      this.particle('dot', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s0: 1.2 + Math.random() * 1.4, s1: 0.2, max: 20 + Math.random() * 20, tint: i % 3 === 0 ? 0xffffff : color });
    }
    // Trümmer und Rauch
    this.debris(x, y, this.cnt(big ? 7 : 2), r, organic, big ? 1.3 : 1);
    this.smokePuffs(x, y, this.lowFx && !big ? 0 : this.cnt(big ? 5 : 2), Math.max(r, 16));
    if (big) {
      for (let i = 0; i < this.cnt(5); i++) {
        const a = Math.random() * Math.PI * 2;
        this.particle('fx_soft', x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, { vx: Math.cos(a), vy: Math.sin(a), s0: r / 60, s1: r / 32, max: 18 + i * 4, a0: 0.8, tint: 0xff7a1f });
      }
    }
  }

  // ───────────────────────────── Boss-Todessequenz ─────────────────────────────

  /** Stufe 1: Geschütze fliegen weg, Kettenexplosionen am Rumpf; Stufe 2: Großexplosion; Stufe 3: Rauch und Glut */
  private startWreck(x: number, y: number) {
    if (this.wreck) this.wreck.img.destroy();
    const v = this.lastBoss.v;
    const img = this.add.image(x, y, `boss_${v}`).setScale(0.5).setDepth(D.boss);
    this.wreck = { img, x, y, t: 0, v };
    const rig = BOSS_RIGS[v];
    // abgesprengte Geschütze
    for (const [dx, dy] of rig.guns) {
      const s = Math.sign(dx) || 1;
      this.particle(`boss_gun_${v}`, x + dx, y + dy, {
        vx: s * (2 + Math.random() * 2), vy: -1 - Math.random() * 2, s0: 0.5, s1: 0.4, max: 70, spin: s * 0.12, curve: 2, blend: NORMAL, depth: D.debris, drag: 0.985,
      });
      this.explosion(x + dx, y + dy, 18, 0xffb040, rig.organic);
    }
  }

  private updateWreck(w: Wreck, f: number) {
    const t0 = w.t;
    w.t += f;
    const t = w.t;
    const rig = BOSS_RIGS[w.v];
    const crossed = (at: number) => t0 < at && t >= at;
    if (t < 100) {
      // Stufe 1: zitternd, absackend, weiß aufblitzend, Kettenexplosionen
      w.y += 0.22 * f;
      w.img.setPosition(w.x + (Math.random() - 0.5) * 5, w.y + (Math.random() - 0.5) * 3);
      w.img.rotation += 0.0012 * f * (w.v % 2 ? 1 : -1);
      if (Math.floor(t / 3) % 4 === 0) w.img.setTintFill(0xffffff);
      else w.img.setTint(Phaser.Display.Color.GetColor(255, Math.round(255 - t * 1.1), Math.round(255 - t * 1.4)));
      const every = this.lowFx ? 14 : 7;
      if (Math.floor(t / every) !== Math.floor(t0 / every)) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random());
        this.explosion(w.x + Math.cos(a) * 105 * d, w.y + Math.sin(a) * 50 * d, 14 + Math.random() * 14, 0xffb040, rig.organic);
        this.shake = Math.max(this.shake, 6);
      }
      if (Math.random() < 0.3 * f) {
        const [dx, dy] = rig.smoke[Math.floor(Math.random() * rig.smoke.length)];
        this.smokePuffs(w.x + dx, w.y + dy, 1, 30);
      }
    }
    if (crossed(100)) {
      // Stufe 2: Großexplosion
      w.img.setVisible(false);
      const { x, y } = { x: w.x, y: w.y };
      const col = BOSS_TINT[w.v];
      this.flash(0xffffff, 0.9);
      this.shake = Math.max(this.shake, 26);
      sfx.play('explodeBig', x);
      this.particle('fx_glow', x, y, { s0: 1.5, s1: 4, max: 16, a0: 0.9 });
      this.particle('fx_shock', x, y, { s0: 0.3, s1: 7, max: 30, a0: 0.7, drag: 1 });
      this.particle('fx_shock', x, y, { s0: 0.2, s1: 4.5, max: 36, a0: 0.6, tint: col, drag: 1 });
      this.particle('fx_ring', x, y, { s0: 0.2, s1: 10, max: 40, a0: 0.6, tint: 0xff7a1f, drag: 1 });
      for (let i = 0; i < this.cnt(10); i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
        const d = 30 + Math.random() * 60;
        this.particle('fx_soft', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5, { vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.2, s0: 0.8, s1: 2, max: 26 + Math.random() * 16, tint: i % 2 ? 0xff7a1f : 0xffe45c });
      }
      this.sparks(x, y, this.cnt(26), 0, Math.PI * 2, col, 2);
      this.debris(x, y, this.cnt(22), 100, rig.organic, 1.8);
      this.smokePuffs(x, y, this.cnt(10), 120);
      const words = ['KAWUMM!', 'BLAMM!', 'KRAWUMM!', 'BOOM!'];
      this.popup(x, y - 40, words[Math.floor(Math.random() * words.length)], '#FF7A1F', 46, 70);
    }
    if (t >= 100) {
      // Stufe 3: Nachglühen, vereinzelte Nachexplosionen, abziehender Rauch
      w.y += 0.6 * f;
      for (const at of [118, 140, 168]) {
        if (crossed(at)) this.explosion(w.x + (Math.random() - 0.5) * 160, w.y + (Math.random() - 0.5) * 70, 22, 0xffb040, rig.organic);
      }
      if (Math.random() < 0.4 * f * this.fxMul && t < 200) {
        const a = Math.random() * Math.PI * 2;
        this.particle('dot', w.x + Math.cos(a) * 60, w.y + Math.sin(a) * 30, { vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6 + 0.5, s0: 1.4, s1: 0.2, max: 40, tint: 0xff9a40, drag: 0.99 });
      }
    }
    if (t > 240) {
      w.img.destroy();
      this.wreck = null;
    }
  }

  private popup(x: number, y: number, text: string, color = '#FFE45C', size = 18, life = 50) {
    if (this.popups.length > 24) return;
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#0E1022', strokeThickness: Math.max(3, size / 5) })
      .setOrigin(0.5).setDepth(D.popup);
    this.popups.push({ t, life, max: life, vy: -0.6 });
  }

  protected banner(title: string, sub = '') {
    this.ui.banner(title, sub);
  }

  private flash(color: number, a: number) {
    this.flashRect.setFillStyle(color, 1).setAlpha(a);
  }

  private shotSound(name: string, x: number) {
    sfx.play(name, x);
  }

  /** Mündungsfeuer der Bordkanone und Raketenrauch; Anbauwaffen blitzen an ihren echten Läufen (renderShip) */
  private muzzle(w: string, x: number, y: number) {
    if (w === 'main') {
      this.particle('fx_muzzle', x, y - 36, { s0: 0.55, s1: 0.2, max: 5, tint: MUZZLE_TINT.main, rot: Math.random() * 0.6 - 0.3 });
    } else if (w === 'missile') {
      this.particle('fx_smoke', x, y - 4, { s0: 0.15, s1: 0.4, max: 20, a0: 0.5, curve: 1, blend: NORMAL, depth: D.smoke, vy: 1.2, rot: Math.random() * 6 });
    }
  }

  protected handleEvents(events: SimEvent[]) {
    const sim = this.sim!;
    for (const ev of events) {
      switch (ev.e) {
        case 'shot': {
          const name = ev.w === 'main' ? 'shoot' : ev.w;
          const now = performance.now();
          if ((this.lastShotSound.get(name) ?? 0) + 40 < now) {
            this.lastShotSound.set(name, now);
            this.shotSound(name, ev.x);
          }
          this.muzzle(ev.w, ev.x, ev.y);
          if (ev.slot) {
            this.recoil[ev.slot] = 1;
            this.fired.add(ev.slot);
          }
          break;
        }
        case 'eshot':
          sfx.play('eshot', ev.x, ev.big ? 1 : 0.7);
          if (sim.boss && sim.boss.hp > 0 && Math.abs(ev.x - sim.boss.x) < 1 && Math.abs(ev.y - sim.boss.y) < 1) this.bossFire = 6;
          else this.particle('fx_muzzle', ev.x, ev.y + 8, { s0: ev.big ? 0.5 : 0.35, s1: 0.1, max: 5, tint: 0xff7a9a, rot: Math.random() });
          break;
        case 'burst':
          // Flak-Granate zerplatzt: Blitz, Ring, Funken rundherum
          this.particle('fx_glow', ev.x, ev.y, { s0: 0.3, s1: 0.06, max: 7, tint: 0xf2f6b8 });
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.06, s1: 0.4, max: 10, tint: 0xe4ee70 });
          this.sparks(ev.x, ev.y, this.lowFx ? 2 : 5, -Math.PI / 2, Math.PI * 2, 0xe4ee70, 0.9);
          sfx.play('burst', ev.x, 0.8);
          break;
        case 'crit':
          // kritischer Treffer: roter Stern
          this.particle('fx_star', ev.x, ev.y, { s0: 0.7, s1: 0.15, max: 12, tint: 0xff5a3c, rot: Math.random(), spin: 0.3 });
          sfx.play('crit', ev.x, 0.8);
          break;
        case 'absorb':
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.16, s1: 0.03, max: 8, tint: 0xffe45c });
          sfx.play('absorb', ev.x, 0.7);
          break;
        case 'shock':
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.2, s1: 1.5, max: 16, tint: 0x7cf7ff });
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.1, s1: 1.1, max: 12, tint: 0xffffff });
          break;
        case 'bossRage':
          this.banner('RASEREI!', 'Der Endgegner trifft immer härter');
          sfx.play('bossPhase');
          break;
        case 'guardian':
          this.popup(Math.max(150, Math.min(WIDTH - 150, sim.player.x)), sim.player.y - 60, 'SCHUTZENGEL!', '#7CF7FF', 22, 80);
          sfx.play('phoenix');
          break;
        case 'bounce':
          // Abpraller: drehender Funkenstern, Ring und Funken rundherum
          this.particle('fx_star', ev.x, ev.y, { s0: 0.55, s1: 0.12, max: 11, tint: 0xfff4b0, rot: Math.random(), spin: 0.25 });
          this.particle('fx_glow', ev.x, ev.y, { s0: 0.22, s1: 0.05, max: 8, tint: 0xffe45c });
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.05, s1: 0.26, max: 10, tint: 0xfff0a0 });
          this.sparks(ev.x, ev.y, this.lowFx ? 2 : 5, -Math.PI / 2, Math.PI * 2, 0xffffff, 0.8);
          break;
        case 'arc':
          // Blitze aus der Spule starten am Abschusspunkt der Sim (Schiff, 20 px über der Mitte)
          this.arcs.push({ pts: ev.pts.slice(), t: 0, forks: [], ship: Math.abs(ev.pts[0] - sim.player.x) < 24 && Math.abs(ev.pts[1] - (sim.player.y - 20)) < 24 });
          break;
        case 'hit':
          this.particle('dot', ev.x, ev.y, { s0: 2.2, s1: 0.4, max: 8, tint: 0xfff0a0 });
          // Funken spritzen entgegen der Schussrichtung (Spielerschüsse fliegen nach oben)
          this.sparks(ev.x, ev.y, this.lowFx ? 1 : 2, Math.PI / 2, 2.2, 0xffe45c, 0.8);
          sfx.play('hit', ev.x, 0.6);
          break;
        case 'kill': {
          const big = ev.type === 'bomber' || ev.type === 'frigate' || ev.type === 'boss';
          const organic = ev.type === 'swarmer';
          const col = ev.type === 'swarmer' ? 0x7bd53a : ev.type === 'spinner' ? 0xc04be8 : 0xffa040;
          // Boss: erste Explosion klein, der Rest kommt mit der Todessequenz (bossDown)
          this.explosion(ev.x, ev.y, ev.type === 'boss' ? 28 : ev.r, col, organic);
          sfx.play(big ? 'explodeBig' : 'explode', ev.x);
          if (ev.score) this.popup(ev.x, ev.y - 10, String(ev.score), '#FFFFFF', big ? 22 : 15, 40);
          if (big) {
            this.shake = Math.max(this.shake, ev.type === 'boss' ? 12 : 10);
            if (ev.type !== 'boss') {
              const words = ['KAWUMM!', 'BLAMM!', 'KRAWUMM!', 'BOOM!'];
              this.popup(ev.x, ev.y - 40, words[Math.floor(Math.random() * words.length)], '#FF7A1F', 30, 60);
            }
          }
          break;
        }
        case 'pickup': {
          const text: Record<string, string> = {
            P: sim.player.gun >= 5 && ev.value ? `+${ev.value}` : `WAFFE ${sim.player.gun}!`,
            crystal: `+${ev.value} ◆`,
            repair: sim.player.hull >= sim.d.maxHull && ev.value === 250 ? '+250' : `+${ev.value} HÜLLE`,
            shield: 'SCHILD!',
            bomb: ev.value ? `+${ev.value}` : '+1 BOMBE',
          };
          const col: Record<string, string> = { P: '#7CF7FF', crystal: '#3BF0A0', repair: '#9BEA6A', shield: '#E9A8FF', bomb: '#FFC060' };
          this.popup(ev.x, ev.y - 20, text[ev.kind], col[ev.kind], ev.kind === 'crystal' ? 14 : 20, 45);
          sfx.play(ev.kind === 'crystal' ? 'coin' : ev.kind === 'repair' ? 'repair' : ev.kind === 'shield' ? 'shield' : 'powerup', ev.x);
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.1, s1: 0.6, max: 14, tint: 0xffffff });
          break;
        }
        case 'gunUp':
          break;
        case 'playerHit':
          if (ev.shield) {
            sfx.play('shieldHit', ev.x);
            this.particle('fx_ring', ev.x, ev.y, { s0: 0.6, s1: 1.2, max: 14, tint: 0x7cf7ff });
            this.sparks(ev.x, ev.y - 20, this.cnt(5), -Math.PI / 2, 2.4, 0x7cf7ff);
          } else {
            sfx.play('hurt', ev.x);
            this.flash(0xff2040, 0.35);
            this.shake = Math.max(this.shake, 12);
            this.explosion(ev.x, ev.y - 10, 10, 0xff3d6e);
          }
          break;
        case 'bomb':
          sfx.play('bomb', ev.x);
          this.flash(0xffffff, 0.8);
          this.shake = Math.max(this.shake, 18);
          this.particle('fx_shock', ev.x, ev.y, { s0: 0.2, s1: 20, max: 40, a0: 1, tint: 0xffe45c, drag: 1 });
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.1, s1: 12, max: 34, a0: 0.8, tint: 0x7cf7ff });
          break;
        case 'bossSpawn':
          sfx.play('alarm');
          this.banner('ACHTUNG!', `Endgegner im Anflug: ${BOSS_RIGS[(sim.sector - 1) % 4].name.toUpperCase()}`);
          break;
        case 'bossPhase':
          this.shake = Math.max(this.shake, 8);
          if (sim.boss) {
            // Phasenwechsel: Panzerplatten platzen ab
            this.explosion(sim.boss.x + (Math.random() - 0.5) * 120, sim.boss.y, 24);
            this.debris(sim.boss.x, sim.boss.y, this.cnt(8), 80, BOSS_RIGS[sim.boss.p[0] % 4].organic, 1.4);
          }
          break;
        case 'frigate':
          sfx.play('alarm');
          this.banner('FREGATTE!', '');
          break;
        case 'bossDown':
          this.flash(0xffffff, 0.5);
          this.startWreck(ev.x, ev.y);
          for (let i = 0; i < 6; i++) {
            this.time.delayedCall(i * 140, () => {
              sfx.play('explodeBig', ev.x);
              this.shake = Math.max(this.shake, 14);
            });
          }
          break;
        case 'sectorClear':
          sfx.play('clear');
          this.time.delayedCall(900, () => this.banner('SEKTOR GESCHAFFT!', ev.summary.noHit ? 'Ohne Treffer: Bonus und Extra-Skillpunkt!' : `Bonus +${ev.summary.bonus}`));
          break;
        case 'shop':
          this.ui.openShop(sim);
          break;
        case 'launch':
          break;
        case 'gameOver':
          this.explosion(sim.player.x, sim.player.y, 50, 0x7cf7ff);
          this.flash(0xffffff, 0.8);
          this.shake = 26;
          sfx.play('explodeBig');
          sfx.play('gameover');
          break;
        case 'phoenix':
          this.flash(0xffa040, 0.8);
          this.banner('PHÖNIX!', 'Zweite Chance');
          sfx.play('powerup');
          break;
        case 'emergency':
          this.banner('NOTSCHILD!', '');
          sfx.play('shield');
          break;
        case 'drop':
          break;
        case 'hazardWarn':
          sfx.play('warn', ev.x);
          break;
        case 'hazardFire':
          sfx.play('zap', ev.x);
          this.shake = Math.max(this.shake, 4);
          break;
        case 'sniper':
          sfx.play('lockon', ev.x);
          this.popup(WIDTH / 2, 250, 'SCHARFSCHÜTZE!', '#FF3D6E', 28, 80);
          this.popup(WIDTH / 2, 284, 'Nicht stehen bleiben!', '#FFFFFF', 16, 80);
          break;
        case 'locked':
          // Zielerfassung: wer stehen bleibt, nimmt mehr Schaden, Reparatur und Schild ruhen
          this.popup(Math.max(120, Math.min(WIDTH - 120, ev.x)), ev.y - 60, 'ERFASST!', '#FF3D6E', 22, 70);
          this.popup(Math.max(120, Math.min(WIDTH - 120, ev.x)), ev.y - 36, 'Treffer härter – weiterfliegen!', '#FFFFFF', 13, 70);
          break;
        case 'graze': {
          const now = performance.now();
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.05, s1: 0.22, max: 9, tint: 0xfff4b0 });
          if (now > this.lastGraze + 160) {
            this.lastGraze = now;
            this.popup(Math.max(50, Math.min(WIDTH - 50, ev.x)), ev.y - 8, `STREIF +${ev.score}`, '#FFF4B0', 13, 32);
            sfx.play('graze', ev.x);
          }
          break;
        }
        case 'grazeReward':
          this.popup(Math.max(150, Math.min(WIDTH - 150, ev.x)), ev.y - 56, ev.kind === 'bomb' ? 'STREIF-BONUS: +1 BOMBE!' : `STREIF-BONUS: +${ev.value} ◆`, '#FFC23A', 20, 70);
          sfx.play(ev.kind === 'bomb' ? 'pickupBomb' : 'coin', ev.x);
          this.particle('fx_ring', ev.x, ev.y, { s0: 0.1, s1: 0.9, max: 18, tint: 0xffc23a });
          break;
      }
    }
  }

  /** nach dem Händler: nächsten Sektor starten */
  launch() {
    const sim = this.sim!;
    if (!sim.command({ t: 'launch' })) return;
    sim.drain();
    this.acc = 0;
    this.clearFx();
    this.setupSectorVisuals(sim.sector);
    const th = themeFor(sim.sector);
    this.banner(`SEKTOR ${sim.sector}`, th.name);
    sfx.play('launch');
  }

  /** Debug (nur ?debug): n Ticks sofort rechnen, Events wie im Spiel verarbeiten */
  debugStep(n: number, input: Input = { mx: 0, my: 0, bomb: false }) {
    const sim = this.sim;
    if (!sim) return;
    for (let i = 0; i < n && sim.phase !== 'shop' && sim.phase !== 'over'; i++) {
      sim.step({ ...input });
      this.handleEvents(sim.drain());
    }
  }

  get currentSector() {
    return this.bgSector;
  }
}
