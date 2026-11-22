// Sektor-Generator: zieht aus dem Seed eine Folge von Gegnerwellen.
import { WIDTH, HEIGHT, SCROLL } from './config';
import { Rng } from './rng';
import type { EnemyType, MoveKind } from './data/enemies';

export interface Spawn {
  /** Flug-Tick, ab dem der Gegner erscheint */
  at: number;
  type: EnemyType;
  x: number;
  y: number;
  move: MoveKind;
  /** Parameter der Bewegung, siehe sim.ts moveEnemy() */
  p: number[];
  /** Formations-Nummer (komplett abgeschossen → Item) */
  form: number;
}

export interface SectorTheme {
  name: string;
  /** Hintergrundfarben (oben, unten) und Nebelfarbe für den Renderer */
  bg: [string, string];
  nebula: string;
  /** bevorzugte Wellen */
  prefer: string[];
}

export const THEMES: SectorTheme[] = [
  { name: 'Asteroidengürtel', bg: ['#0B0A1E', '#1A1430'], nebula: '#6B4AA8', prefer: ['mines', 'mineField', 'swarmLine', 'swarmV'] },
  { name: 'Werft Kepler-9', bg: ['#071420', '#0E2A3A'], nebula: '#2A7FA8', prefer: ['turrets', 'hunters', 'pincer', 'flank'] },
  { name: 'Purpurnebel', bg: ['#170818', '#33102E'], nebula: '#C0397A', prefer: ['spinners', 'kamikaze', 'swarmArc', 'rise'] },
  { name: 'Schwarmkern', bg: ['#0A1608', '#16301A'], nebula: '#4FA83A', prefer: ['swarmArc', 'swarmLine', 'kamikaze', 'bomber', 'rise', 'flank'] },
];

export function themeFor(sector: number): SectorTheme {
  return THEMES[(sector - 1) % THEMES.length];
}

/** Länge der Flugphase in Ticks (danach Boss) */
export const FLIGHT_TICKS = 4300;

interface Template {
  id: string;
  cost: number;
  min: number;
  make: (rng: Rng, at: number, form: () => number, s: number) => Spawn[];
}

const DEG = 0.017453292519943295;

const TEMPLATES: Template[] = [
  {
    // Kette aus Schwärmern in Schlangenlinie
    id: 'swarmLine', cost: 2, min: 1,
    make: (rng, at, form) => {
      const f = form();
      const x = rng.range(110, WIDTH - 110);
      const n = 6;
      const amp = rng.range(40, 90) * (rng.chance(0.5) ? 1 : -1);
      return Array.from({ length: n }, (_, i) => ({
        at: at + i * 12, type: 'swarmer' as const, x, y: -30, move: 'sine' as const, p: [2.4, amp, 0.045, 0], form: f,
      }));
    },
  },
  {
    // Kette fliegt von oben seitlich ein und schwenkt im Bogen
    id: 'swarmArc', cost: 3, min: 1,
    make: (rng, at, form) => {
      const f = form();
      const left = rng.chance(0.5);
      const n = 8;
      const x = left ? 60 : WIDTH - 60;
      const w = (left ? -1 : 1) * rng.range(0.018, 0.026);
      return Array.from({ length: n }, (_, i) => ({
        at: at + i * 10, type: 'swarmer' as const, x, y: -30, move: 'arc' as const, p: [0, 3.4, 50, 200, w], form: f,
      }));
    },
  },
  {
    // Keil-Formation geradeaus
    id: 'swarmV', cost: 3, min: 1,
    make: (rng, at, form) => {
      const f = form();
      const cx = rng.range(150, WIDTH - 150);
      const out: Spawn[] = [];
      for (let i = -3; i <= 3; i++) {
        out.push({ at: at + Math.abs(i) * 8, type: 'swarmer', x: cx + i * 34, y: -30, move: 'line', p: [0, 2.6], form: f });
      }
      return out;
    },
  },
  {
    // Jäger fliegen ein, halten an, feuern, fliegen seitlich ab
    id: 'hunters', cost: 3, min: 1,
    make: (rng, at, form) => {
      const f = form();
      const n = 2 + rng.int(2);
      const out: Spawn[] = [];
      for (let i = 0; i < n; i++) {
        const x = (WIDTH / (n + 1)) * (i + 1) + rng.range(-20, 20);
        const exit = x < WIDTH / 2 ? -2.6 : 2.6;
        out.push({ at: at + i * 20, type: 'hunter', x, y: -30, move: 'stop', p: [3, rng.range(140, 300), 200, exit, 0.6], form: f });
      }
      return out;
    },
  },
  {
    // Zange: Jäger kommen von beiden Seiten im Bogen
    id: 'pincer', cost: 5, min: 2,
    make: (_rng, at, form) => {
      const f = form();
      const out: Spawn[] = [];
      for (let i = 0; i < 3; i++) {
        out.push({ at: at + i * 18, type: 'hunter', x: -30, y: 120 + i * 30, move: 'arc', p: [3.2, 0.4, 20, 110, 0.012], form: f });
        out.push({ at: at + i * 18, type: 'hunter', x: WIDTH + 30, y: 120 + i * 30, move: 'arc', p: [-3.2, 0.4, 20, 110, -0.012], form: f });
      }
      return out;
    },
  },
  {
    id: 'spinners', cost: 4, min: 1,
    make: (rng, at, form) => {
      const f = form();
      const n = 2 + rng.int(2);
      return Array.from({ length: n }, (_, i) => ({
        at: at + i * 40, type: 'spinner' as const, x: rng.range(80, WIDTH - 80), y: -30, move: 'drift' as const, p: [rng.range(-0.4, 0.4), 1.3], form: f,
      }));
    },
  },
  {
    id: 'kamikaze', cost: 3, min: 2,
    make: (rng, at, form) => {
      const f = form();
      return Array.from({ length: 4 }, (_, i) => ({
        at: at + i * 25, type: 'kamikaze' as const, x: rng.range(60, WIDTH - 60), y: -30, move: 'homing' as const, p: [4.2, 0.05], form: f,
      }));
    },
  },
  {
    id: 'mines', cost: 2, min: 1,
    make: (rng, at) =>
      Array.from({ length: 5 }, (_, i) => ({
        at: at + i * 30, type: 'mine' as const, x: rng.range(50, WIDTH - 50), y: -30, move: 'drift' as const, p: [rng.range(-0.3, 0.3), rng.range(1.2, 1.9)], form: 0,
      })),
  },
  {
    // Bomber mit Begleitschutz
    id: 'bomber', cost: 6, min: 2,
    make: (rng, at, form) => {
      const x = rng.range(130, WIDTH - 130);
      const out: Spawn[] = [{ at, type: 'bomber', x, y: -50, move: 'drift', p: [0, 0.9], form: 0 }];
      const f = form();
      for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        out.push({ at: at + 30 + i * 10, type: 'swarmer', x: x + side * 70, y: -30, move: 'sine', p: [1.4, side * 30, 0.05, i * 0.8], form: f });
      }
      return out;
    },
  },
  {
    // Geschütztürme auf Trümmerplatten, scrollen mit dem Hintergrund
    id: 'turrets', cost: 5, min: 1,
    make: (rng, at, form) => {
      const f = form();
      const n = 2 + rng.int(2);
      const out: Spawn[] = [];
      for (let i = 0; i < n; i++) {
        out.push({ at: at + i * 45, type: 'turret', x: rng.range(70, WIDTH - 70), y: -40, move: 'drift', p: [0, SCROLL], form: f });
      }
      return out;
    },
  },
  {
    // Flanke: Kette fliegt seitlich auf Höhe des Spielers quer übers Feld (Pfeile am Rand warnen vor)
    id: 'flank', cost: 3, min: 1,
    make: (rng, at, form, s) => {
      const f = form();
      const left = rng.chance(0.5);
      const n = 5 + (s >= 3 ? 1 : 0);
      const y = s >= 2 ? rng.range(520, 800) : rng.range(420, 640);
      const vx = (left ? 1 : -1) * (2.6 + 0.1 * Math.min(6, s - 1));
      const vy = rng.range(-0.4, 0.4);
      return Array.from({ length: n }, (_, i) => ({
        at: at + i * 13, type: 'swarmer' as const, x: left ? -90 : WIDTH + 90, y, move: 'line' as const, p: [vx, vy], form: f,
      }));
    },
  },
  {
    // von unten: Schwärmer steigen in Schlangenlinie von hinten auf (ab Sektor 2, Pfeile am unteren Rand)
    id: 'rise', cost: 3, min: 2,
    make: (rng, at, form) => {
      const f = form();
      const out: Spawn[] = [];
      const cols = [rng.range(60, WIDTH / 2 - 60), rng.range(WIDTH / 2 + 60, WIDTH - 60)];
      for (let c = 0; c < 2; c++) {
        for (let i = 0; i < 3; i++) {
          out.push({ at: at + c * 30 + i * 14, type: 'swarmer', x: cols[c], y: HEIGHT + 130, move: 'sine', p: [-3.2, 26, 0.06, i], form: f });
        }
      }
      return out;
    },
  },
  {
    // Minenfeld über die ganze Breite mit einer Lücke
    id: 'mineField', cost: 4, min: 1,
    make: (rng, at) => {
      const n = 9;
      const gap = 1 + rng.int(n - 3);
      const out: Spawn[] = [];
      const vy = rng.range(1.0, 1.3);
      for (let i = 0; i < n; i++) {
        if (i === gap || i === gap + 1) continue;
        out.push({ at, type: 'mine', x: 30 + i * ((WIDTH - 60) / (n - 1)), y: -30, move: 'drift', p: [0, vy], form: 0 });
      }
      return out;
    },
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

/** Wellen eines Sektors; deterministisch aus (seed, sector) */
export function buildSector(seed: number, sector: number): Spawn[] {
  const rng = new Rng((seed ^ Math.imul(sector, 0x9e3779b1)) >>> 0);
  const theme = themeFor(sector);
  const density = 1 + 0.06 * (sector - 1);
  let formId = sector * 1000;
  const form = () => ++formId;
  const out: Spawn[] = [];
  let t = 60;
  const pool = TEMPLATES.filter((tp) => tp.min <= sector);
  const weights = pool.map((tp) => ({ w: theme.prefer.includes(tp.id) ? 3 : 1, v: tp }));
  let frigateDone = sector < 2;
  while (t < FLIGHT_TICKS) {
    if (!frigateDone && t > FLIGHT_TICKS * 0.5) {
      // Zwischenboss zur Halbzeit
      out.push({ at: t, type: 'frigate', x: WIDTH / 2, y: -60, move: 'pendulum', p: [1.6, 200, 150, 0.012], form: 0 });
      t += Math.round(520 / density);
      frigateDone = true;
      continue;
    }
    const tp = rng.weighted(weights);
    out.push(...tp.make(rng, t, form, sector));
    // ab Sektor 4 kommt gelegentlich eine zweite Welle gleichzeitig
    if (sector >= 4 && rng.chance(0.12 + 0.03 * (sector - 4))) {
      const tp2 = rng.weighted(weights);
      out.push(...tp2.make(rng, t + 40, form, sector));
    }
    t += Math.round((70 + tp.cost * 42) / density);
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

export { DEG };
