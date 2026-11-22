// Sektor-Kulissen: je Thema eigene Parallax-Ebenen (Felsen, Werftstrukturen, Nebel, Waben/Ranken).
// Alles liegt unter den Spielobjekten (Tiefe < 0), ist dunkel und kontrastarm, damit Gegner und Kugeln
// immer klar lesbar bleiben. Rein optisch, Math.random erlaubt.
import Phaser from 'phaser';
import { WIDTH, HEIGHT } from '../core/config';

type Img = Phaser.GameObjects.Image;

interface Light {
  img: Img;
  dx: number;
  dy: number;
  ph: number;
  rate: number;
  a: number;
}

interface Deco {
  img: Img;
  speed: number;
  /** neue Position, wenn das Teil unten hinausgelaufen ist */
  place: (d: Deco, first: boolean) => void;
  spin: number;
  lights: Light[];
  /** sanftes Pulsieren der Deckkraft */
  pulse: number;
  a0: number;
  ph: number;
  /** seitliches Schweben (Sporen) */
  sway: number;
  x0: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** Platzierung nur am Rand: links oder rechts, damit die Mitte frei bleibt */
const sideX = (inner: number, outer = -20) => (Math.random() < 0.5 ? rnd(outer, inner) : WIDTH - rnd(outer, inner));

export class Backdrop {
  private items: Deco[] = [];
  private t = 0;

  constructor(private scene: Phaser.Scene) {}

  clear() {
    for (const d of this.items) {
      d.img.destroy();
      for (const l of d.lights) l.img.destroy();
    }
    this.items = [];
  }

  /** Kulisse für den Sektor aufbauen; low = sparsame Variante (weniger Teile, keine Nahebene) */
  setup(sector: number, low: boolean) {
    this.clear();
    const theme = (sector - 1) % 4;
    const n = (full: number, lo: number) => (low ? lo : full);
    // Farben stecken in den Texturen (kein Tint: der Canvas-Renderer kann keinen)
    // gemeinsamer Nebelschleier in Themenfarbe (ganz hinten)
    if (theme !== 2) {
      for (let i = 0; i < n(2, 1); i++) {
        this.add(`bg_neb_${theme}_${i % 2}`, -9.5, 0.12, { alpha: 0.2, scale: rnd(2, 2.6), rot: rnd(0, 6) });
      }
    }
    // Planet (dezent)
    this.add(`planet_${theme}`, -9, 0.16, { alpha: 0.26, scale: rnd(0.26, 0.4), once: true });

    if (theme === 0) this.asteroids(n);
    else if (theme === 1) this.shipyard(n, low);
    else if (theme === 2) this.nebula(n, low);
    else this.hive(n, low);
  }

  private add(
    key: string,
    depth: number,
    speed: number,
    o: { alpha: number; scale: number; rot?: number; spin?: number; side?: number; once?: boolean; flip?: boolean; blend?: Phaser.BlendModes; pulse?: number; sway?: number; place?: Deco['place'] },
  ): Deco {
    const img = this.scene.add.image(0, 0, key).setDepth(depth).setScale(o.scale).setAlpha(o.alpha);
    if (o.rot) img.setRotation(o.rot);
    if (o.flip) img.setFlipX(Math.random() < 0.5);
    if (o.blend !== undefined) img.setBlendMode(o.blend);
    const side = o.side;
    const place =
      o.place ??
      ((d: Deco, first: boolean) => {
        const h = Math.max(d.img.displayWidth, d.img.displayHeight) / 2;
        d.img.x = side !== undefined ? sideX(side) : rnd(-40, WIDTH + 40);
        d.img.y = first ? rnd(-h, HEIGHT + h) : -h - rnd(0, o.once ? 1600 : 300);
        d.x0 = d.img.x;
      });
    const d: Deco = { img, speed, place, spin: o.spin ?? 0, lights: [], pulse: o.pulse ?? 0, a0: o.alpha, ph: rnd(0, 6), sway: o.sway ?? 0, x0: 0 };
    place(d, true);
    this.items.push(d);
    return d;
  }

  /** Blinklicht, das mit einem Kulissenteil mitwandert */
  private light(d: Deco, dx: number, dy: number, key: string, size = 0.12) {
    const img = this.scene.add.image(0, 0, key).setDepth(d.img.depth + 0.05).setScale(size);
    img.setBlendMode(Phaser.BlendModes.ADD);
    d.lights.push({ img, dx, dy, ph: rnd(0, 6), rate: rnd(0.03, 0.07), a: rnd(0.45, 0.75) });
  }

  // ───────────────────────────── Themen ─────────────────────────────

  private asteroids(n: (a: number, b: number) => number) {
    // Staubband
    this.add('bg_wisp_1', -9, 0.22, { alpha: 0.1, scale: rnd(1.6, 2), rot: rnd(-0.4, 0.4) });
    // ferne Trümmerfelder
    for (let i = 0; i < n(4, 2); i++) {
      this.add(`bg_rubble_${i % 2}`, -8.5, rnd(0.35, 0.45), { alpha: 0.6, scale: rnd(0.9, 1.3), rot: rnd(0, 6) });
    }
    // mittlere Brocken, langsam drehend
    for (let i = 0; i < n(6, 3); i++) {
      this.add(`bg_rock_${i % 4}`, -6.5, rnd(0.7, 1), { alpha: 0.75, scale: rnd(0.26, 0.45), rot: rnd(0, 6), spin: rnd(-0.006, 0.006) });
    }
    // nahe große Brocken am Rand (dunkler, größer, schneller)
    for (let i = 0; i < n(2, 0); i++) {
      this.add(`bg_rock_${i % 4}`, -5.5, rnd(1.7, 2.1), { alpha: 0.5, scale: rnd(1, 1.35), rot: rnd(0, 6), spin: rnd(-0.004, 0.004), side: 30 });
    }
  }

  private shipyard(n: (a: number, b: number) => number, low: boolean) {
    const lights = ['glow_orange', 'glow_red', 'glow_mint', 'fx_softblue'];
    // ferne Rumpfsektionen im Dock
    for (let i = 0; i < n(3, 2); i++) {
      const d = this.add('bg_dock', -8.5, rnd(0.3, 0.38), { alpha: 0.6, scale: rnd(0.55, 0.8), side: 90, flip: true });
      if (!low) for (let k = 0; k < 2; k++) this.light(d, rnd(-0.4, 0.4), rnd(-0.45, 0.45), pick(lights), 0.09);
    }
    // waagerechte Träger quer durchs Bild
    for (let i = 0; i < n(2, 1); i++) {
      const d = this.add('bg_girder_h', -7.5, rnd(0.55, 0.65), { alpha: 0.45, scale: rnd(0.9, 1.1) });
      d.place = (dd, first) => {
        dd.img.x = rnd(0, WIDTH);
        dd.img.y = first ? rnd(0, HEIGHT) : -40 - rnd(0, 700);
      };
      d.place(d, true);
      if (!low) for (let k = 0; k < 3; k++) this.light(d, (k - 1) * 0.36, -0.3, pick(lights), 0.08);
    }
    // senkrechte Träger an den Seiten
    for (let i = 0; i < n(4, 2); i++) {
      const d = this.add('bg_girder_v', -6.5, rnd(0.8, 0.9), { alpha: 0.7, scale: rnd(0.45, 0.6), side: 70 });
      if (!low) for (let k = 0; k < 2; k++) this.light(d, -0.3, rnd(-0.4, 0.4), pick(lights), 0.1);
    }
    // nahe, große Träger am äußersten Rand
    for (let i = 0; i < n(2, 0); i++) {
      this.add('bg_girder_v', -5.5, 1.8, { alpha: 0.5, scale: 1.05, side: 16 });
    }
    // ferne Positionslichter, die langsam vorbeiziehen
    for (let i = 0; i < n(10, 4); i++) {
      this.add(pick(lights), -8.8, rnd(0.25, 0.4), { alpha: 0.5, scale: rnd(0.05, 0.08), blend: Phaser.BlendModes.ADD, pulse: 0.4 });
    }
  }

  private nebula(n: (a: number, b: number) => number, low: boolean) {
    // dichte Schwaden in drei Tiefen: [Tiefe, Tempo, Deckkraft, Größe, Anzahl]
    const layers: [number, number, number, number, number][] = [
      [-9.4, 0.18, 0.55, 3, n(4, 3)],
      [-8, 0.45, 0.42, 2.2, n(4, 2)],
      [-6.8, 0.9, 0.3, 1.7, n(3, 0)],
    ];
    let k = 0;
    for (const [depth, speed, alpha, size, count] of layers) {
      for (let i = 0; i < count; i++) {
        this.add(`bg_neb_2_${k++ % 4}`, depth, rnd(speed * 0.85, speed * 1.15), { alpha, scale: rnd(size * 0.8, size * 1.2), rot: rnd(0, 6), pulse: 0.15 });
      }
    }
    // Filamente
    for (let i = 0; i < n(3, 1); i++) {
      this.add(`bg_wisp_${i % 2}`, -7.2, rnd(0.6, 0.8), { alpha: 0.14, scale: rnd(1.2, 1.7), rot: rnd(-0.8, 0.8), blend: Phaser.BlendModes.ADD });
    }
    // dunkle Staubwolken davor (geben Tiefe, verdunkeln nur)
    for (let i = 0; i < n(3, 1); i++) {
      this.add('bg_neb_dark', -5.8, rnd(1.3, 1.5), { alpha: 0.75, scale: rnd(1.8, 2.4), rot: rnd(0, 6), side: 40 });
    }
    // eingebettete junge Sterne
    if (!low) {
      for (let i = 0; i < 4; i++) {
        this.add('glow_purple', -8.9, rnd(0.25, 0.35), { alpha: 0.22, scale: rnd(0.5, 0.8), blend: Phaser.BlendModes.ADD, pulse: 0.3 });
      }
    }
  }

  private hive(n: (a: number, b: number) => number, low: boolean) {
    // ferne Wabenflecken
    for (let i = 0; i < n(3, 2); i++) {
      this.add(`bg_comb_${i % 2}`, -8.5, rnd(0.35, 0.45), { alpha: 0.26, scale: rnd(0.6, 0.85), rot: rnd(0, 6), pulse: 0.2 });
    }
    // größere Waben am Rand
    for (let i = 0; i < n(2, 1); i++) {
      this.add(`bg_comb_${(i + 1) % 2}`, -7, rnd(0.75, 0.85), { alpha: 0.4, scale: rnd(1, 1.3), rot: rnd(0, 6), side: 40, pulse: 0.15 });
    }
    // Ranken an den Seiten
    for (let i = 0; i < n(4, 2); i++) {
      this.add(`bg_vine_${i % 2}`, -6.5, rnd(1, 1.15), { alpha: 0.7, scale: rnd(0.7, 0.95), side: 40, flip: true, rot: rnd(-0.15, 0.15) });
    }
    // nahe dicke Ranken
    for (let i = 0; i < n(2, 0); i++) {
      this.add(`bg_vine_${i % 2}`, -5.5, 1.9, { alpha: 0.55, scale: rnd(1.4, 1.7), side: 10, flip: true });
    }
    // schwebende Sporen
    if (!low) {
      for (let i = 0; i < 10; i++) {
        this.add('glow_green', -7.8, rnd(0.4, 0.9), { alpha: 0.3, scale: rnd(0.06, 0.12), blend: Phaser.BlendModes.ADD, pulse: 0.5, sway: rnd(6, 16) });
      }
    }
  }

  // ───────────────────────────── Bewegung ─────────────────────────────

  update(f: number, boost = 1) {
    this.t += f;
    for (const d of this.items) {
      const img = d.img;
      img.y += d.speed * f * boost;
      if (d.spin) img.rotation += d.spin * f;
      if (d.sway) img.x = d.x0 + Math.sin(this.t * 0.02 + d.ph) * d.sway;
      if (d.pulse) img.setAlpha(d.a0 * (1 - d.pulse * 0.5 + d.pulse * 0.5 * Math.sin(this.t * 0.03 + d.ph)));
      const h = Math.max(img.displayWidth, img.displayHeight) / 2;
      if (img.y - h > HEIGHT) d.place(d, false);
      if (d.lights.length) {
        const w = img.displayWidth;
        const hh = img.displayHeight;
        const sx = img.flipX ? -1 : 1;
        for (const l of d.lights) {
          l.img.setPosition(img.x + l.dx * w * sx, img.y + l.dy * hh);
          const s = Math.sin(this.t * l.rate + l.ph);
          l.img.setAlpha(s > 0.55 ? l.a : l.a * 0.15);
        }
      }
    }
  }
}
