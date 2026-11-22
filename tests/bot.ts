// Einfacher Bot für Tests und Balancing: weicht Kugeln (mit Vorausschau) und Sperrfeuer aus, sonst unter den nächsten Gegner.
import { Sim } from '../src/core/sim/sim';
import { SLOTS, STATS, WEAPONS, SKILLS, type SkillId, type SlotId, type StatId, type WeaponId } from '../src/core/data/shop';
import type { Input } from '../src/core/sim/types';
import { WIDTH, HEIGHT } from '../src/core/config';

/**
 * dodge: 'always' = weicht Kugeln und Gegnern aus · 'boss' = nur im Bosskampf (wie im Nutzer-Feedback:
 * „man kann das Schiff stehen lassen und muss nur beim Boss ausweichen“) · 'never' = zielt nur, weicht nie aus
 */
export type Dodge = 'always' | 'boss' | 'never';

export function botInput(sim: Sim, skill = 1, dodge: Dodge = 'always'): Input {
  const p = sim.player;
  let tx = p.x;
  let ty = HEIGHT - 160;
  let target = null as null | { x: number; y: number };
  let bd = Infinity;
  for (const e of sim.enemies) {
    if (e.y < 0) continue;
    const d = Math.abs(e.x - p.x) + (e.y > p.y ? 9999 : 0);
    if (d < bd) { bd = d; target = e; }
  }
  if (target) tx = target.x;
  // Items einsammeln
  for (const it of sim.items) if (it.y > 300 && Math.abs(it.x - p.x) < 150) { tx = it.x; ty = Math.max(ty - 0, it.y); }
  // Ausweichen: Summe der Abstoßung naher Kugeln
  let ax = 0;
  let ay = 0;
  // skill = Anteil der Kugeln, die der Bot „sieht“ (0..1). Er schaut voraus: wo kommt die Kugel dem
  // Schiff in den nächsten 20 Ticks am nächsten? Weg von diesem Punkt, dringender je früher.
  const dodging = dodge === 'always' || (dodge === 'boss' && sim.phase === 'boss');
  if (dodging) for (let i = 0; i < sim.ebullets.length; i++) {
    const b = sim.ebullets[i];
    // je Kugel fest (Geschwindigkeit ändert sich nicht): manche Kugeln übersieht der Bot ganz
    if ((((Math.floor(b.vx * 977) * 31 + Math.floor(b.vy * 613) * 17) % 100) + 100) % 100 >= skill * 100) continue;
    const rx = b.x - p.x;
    const ry = b.y - p.y;
    if (rx * rx + ry * ry > 220 * 220) continue;
    const vv = b.vx * b.vx + b.vy * b.vy || 1;
    const tc = Math.max(0, Math.min(20, -(rx * b.vx + ry * b.vy) / vv));
    let cx = rx + b.vx * tc;
    const cy = ry + b.vy * tc;
    const d2 = cx * cx + cy * cy;
    const rr = b.r + 9 + 14;
    if (d2 > rr * rr) continue;
    // frontal: seitlich weg (zur Feldmitte hin)
    if (Math.abs(cx) < 2) cx = p.x < WIDTH / 2 ? -2 : 2;
    const w = 1 / ((d2 + 30) * (1 + tc * 0.2));
    ax -= cx * w;
    ay -= cy * w * 0.6;
  }
  if (dodging) for (const e of sim.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 90 * 90) continue;
    ax += dx / (d2 + 1);
    ay += dy / (d2 + 1);
  }
  let mx = (tx - p.x) / 4;
  let my = (ty - p.y) / 4;
  if (ax !== 0 || ay !== 0) {
    const l = Math.sqrt(ax * ax + ay * ay);
    mx = (ax / l) * 100;
    my = (ay / l) * 100;
  }
  // Sperrfeuer: aus jedem Warnstreifen heraus (sieht ein Mensch rechtzeitig)
  if (dodging) {
    for (const h of (sim as unknown as { hazards?: { kind: string; x: number; y: number; w: number; t: number; warn: number; dur: number }[] }).hazards ?? []) {
      if (h.t >= h.warn + h.dur) continue;
      if (h.kind === 'col' && Math.abs(p.x - h.x) < h.w + 16) {
        const right = h.x < WIDTH / 2 ? h.x - h.w > 80 ? p.x >= h.x : true : p.x >= h.x && h.x + h.w < WIDTH - 80;
        mx = right ? 100 : -100;
        if (Math.abs(my) > 40) my = Math.sign(my) * 40;
      } else if (h.kind === 'row' && Math.abs(p.y - h.y) < h.w + 16) {
        my = h.y > HEIGHT - 140 || p.y < h.y ? -100 : 100;
        if (Math.abs(mx) > 40) mx = Math.sign(mx) * 40;
      }
    }
  }
  if (p.x < 40 && mx < 0) mx = 50;
  if (p.x > WIDTH - 40 && mx > 0) mx = -50;
  const danger = sim.ebullets.filter((b) => Math.abs(b.x - p.x) < 40 && b.y < p.y && p.y - b.y < 60).length;
  return { mx, my, bomb: danger >= 4 && p.hull < 40 };
}

/** Stillsteh-Bot: bewegt sich nie (bleibt an der Startposition), zündet Bomben wie der normale Bot */
export function stillInput(sim: Sim): Input {
  const p = sim.player;
  const danger = sim.ebullets.filter((b) => Math.abs(b.x - p.x) < 40 && b.y < p.y && p.y - b.y < 60).length;
  return { mx: 0, my: 0, bomb: danger >= 4 && p.hull < 40 };
}

/** Skill-Reihenfolge der Bots: erst Überleben und Grundschaden, dann Wirtschaft, dann die Spezial-Äste */
const SKILL_ORDER: SkillId[] = [
  'def1', 'off1', 'def2', 'def3', 'off2', 'tec1', 'pil1', 'def4', 'gun1', 'gun2', 'tec2', 'tec3', 'off3', 'off4',
  'pil2', 'pil3', 'def5', 'def6', 'tec4', 'tec5', 'off5', 'off6', 'gun3', 'gun4', 'gun5', 'gun6', 'tec6', 'pil4', 'pil5', 'pil6',
];
/** erlittener Schaden beim letzten Händlerbesuch (für die Einschätzung „brauche ich mehr Schutz?“) */
const lastDamage = new WeakMap<Sim, number>();

/**
 * Einkaufsstrategie: reparieren, Skills, dann reihum Waffen und Schiffswerte (inkl. der neuen Ausbauten und Kanonen).
 * Wer im letzten Sektor mehr als die halbe Hülle verloren hat, kauft zuerst Schutz (Panzerung, Reparaturdrohnen,
 * Reaktivpanzer, Schild) – so wie es ein Mensch auch täte.
 */
export function botShop(sim: Sim, opts: { noClass?: boolean } = {}) {
  const dmg = sim.damageTaken - (lastDamage.get(sim) ?? 0);
  lastDamage.set(sim, sim.damageTaken);
  const shaky = dmg > sim.d.maxHull * 0.5;
  sim.command({ t: 'repair' });
  for (let pass = 0; pass < 3; pass++) for (const id of SKILL_ORDER) if (sim.canSkill(id)) sim.command({ t: 'skill', id });
  const stat = (id: StatId, upTo = 99) => () => (sim.loadout.stats[id] < upTo ? sim.command({ t: 'stat', id }) : false);
  const mount = (slot: SlotId, w: WeaponId) => () => (sim.slotOpen(slot) && !sim.loadout.slots[slot] ? sim.command({ t: 'weapon', slot, w }) : false);
  const up = (slot: SlotId) => () => sim.command({ t: 'upgrade', slot });
  const defense = [stat('armor'), stat('regen'), stat('plating'), stat('shield', 3)];
  if (shaky) {
    // erst zwei Runden Schutz
    for (let i = 0; i < 2; i++) for (const f of defense) f();
  }
  const plan: (() => boolean)[] = [
    // Schiffsklasse (Endspiel): sobald freigeschaltet und bezahlbar
    () => (opts.noClass ? false : sim.command({ t: 'stat', id: 'cls' })),
    mount('core2', 'plasma'),
    mount('core3', 'drone'),
    up('core2'),
    up('core3'),
    mount('wingL', 'side'),
    mount('wingR', 'flak'),
    stat('armor'),
    stat('regen'),
    mount('core', 'laser'),
    stat('plating'),
    stat('caliber'),
    stat('cooling'),
    up('wingL'),
    up('wingR'),
    up('core'),
    stat('salvage', 3),
    stat('shield'),
    stat('rig', 1),
    mount('wingL2', 'rail'),
    mount('wingR2', 'beam'),
    up('wingL2'),
    up('wingR2'),
    stat('crit'),
    stat('engine', 3),
    stat('bay', 2),
    stat('grazer', 2),
    stat('cannon'),
    stat('rig'),
    mount('wingL3', 'pulse'),
    mount('wingR3', 'missile'),
    up('wingL3'),
    up('wingR3'),
    stat('magnet', 2),
    stat('overdrive'),
  ];
  let any = true;
  while (any) {
    any = false;
    for (const f of plan) if (f()) any = true;
  }
  void SLOTS; void STATS; void WEAPONS; void SKILLS;
  // Rest in Bomben
  while (sim.command({ t: 'bomb' }));
  sim.command({ t: 'launch' });
}

/** skill < 0 = Stillsteh-Bot */
export function runBot(seed: number, maxTicks = 60 * 60 * 25, skill = 1, SimClass: new (seed: number) => Sim = Sim) {
  const sim = new SimClass(seed);
  while (sim.phase !== 'over' && sim.tick < maxTicks) {
    if (sim.phase === 'shop') botShop(sim);
    else sim.step(skill < 0 ? stillInput(sim) : botInput(sim, skill));
    sim.drain();
  }
  return sim;
}
