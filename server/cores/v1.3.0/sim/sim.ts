// Deterministische Spiellogik: kein Phaser, kein DOM, kein Math.random, nur exakt gerundete Mathematik.
// Der Renderer ruft step(input) 60× pro Sekunde auf, im Shop command(...) und konsumiert die Events.
import { WIDTH, HEIGHT, MARGIN } from '../config';
import { dcos, dsin } from '../dmath';
import { Rng } from '../rng';
import { ENEMIES, ITEM_WEIGHTS, type EnemyType, type ItemKind } from '../data/enemies';
import {
  BOMB_PRICE, REPAIR_PER_HP, SKILL_BY_ID, SLOTS, STAT_BY_ID, WEAPON_BY_ID,
  MAX_WEAPON_LVL, LEFT_SLOTS, CORE_SLOTS, slotAccepts, slotOffset, slotRig, slotClass, slotY, droneRadius, shipClass, weaponValue,
  SHIP_CLASSES, CRIT_STEP, PLATING_STEP, REGEN_STEP, SALVAGE_STEP, NANITE_REGEN, SHIELD_STEP, SHIELD_DELAY_S, SHIELD_RATE, SHIELD_BULWARK, type SkillId, type SlotId, type StatId,
} from '../data/shop';
import { buildSector, FLIGHT_TICKS, type Spawn } from '../sector';
import type {
  Beam, Bullet, Command, EBullet, Enemy, Hazard, Input, Item, Loadout, Phase, PlayerWeapon, Replay, SectorSummary, SimEvent,
} from './types';

/** nur eigene Schlüssel (kein "__proto__", "toString" …) */
const own = (o: object, k: unknown) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

const DEG = 0.017453292519943295;
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;

/** Richtungsvektor zum Winkel a (0 = nach oben, positiv = nach rechts) */
function dir(a: number): [number, number] {
  return [dsin(a), -dcos(a)];
}

/** Bordkanone: je Stufe Liste von [x-Versatz, Winkel in Grad] */
const GUN_PATTERNS: [number, number][][] = [
  [],
  [[0, 0]],
  [[-7, 0], [7, 0]],
  [[0, 0], [-10, -6], [10, 6]],
  [[-7, 0], [7, 0], [-12, -12], [12, 12]],
  [[0, 0], [-9, -3], [9, 3], [-14, -15], [14, 15]],
];
const GUN_DIRS = GUN_PATTERNS.map((pat) => pat.map(([ox, a]) => [ox, ...dir(a * DEG)] as [number, number, number]));
/** zusätzliche Läufe je Schiffsklasse */
const CLASS_GUN_DIRS = SHIP_CLASSES.map((c) => c.guns.map(([ox, a]) => [ox, ...dir(a * DEG)] as [number, number, number]));
/** Geschütztürme der Schiffsklassen: Feuerabstand (Ticks) und Geschosstempo */
const TURRET_INTERVAL = 14;
const TURRET_SPEED = 14;

const SPREAD_DIRS: Record<number, [number, number][]> = {
  1: [dir(10 * DEG), dir(25 * DEG)],
  2: [dir(10 * DEG), dir(25 * DEG)],
  3: [dir(8 * DEG), dir(20 * DEG), dir(32 * DEG)],
  4: [dir(6 * DEG), dir(16 * DEG), dir(26 * DEG), dir(36 * DEG)],
  5: [dir(6 * DEG), dir(16 * DEG), dir(26 * DEG), dir(36 * DEG)],
};
const REAR_DIRS = [dir(PI), dir(PI - 45 * DEG), dir(PI + 45 * DEG)];
const REAR_DIRS3 = [...REAR_DIRS, dir(PI - 80 * DEG), dir(PI + 80 * DEG)];
/** Igel (Heck Stufe 5): zusätzlich schräg nach vorn */
const REAR_DIRS5 = [...REAR_DIRS3, dir(PI - 125 * DEG), dir(PI + 125 * DEG)];
/** Strahlbreite (halb) je Stufe */
const BEAM_W = [0, 5, 7, 11, 13, 16];
/** Sprünge des Blitzbogens je Stufe */
const ARC_JUMPS = [0, 1, 2, 3, 4, 5];
/** Splitter beim Aufprall: fächerförmig nach oben */
const SPLIT_DIRS = [dir(-40 * DEG), dir(0), dir(40 * DEG), dir(-80 * DEG), dir(80 * DEG)];

/** Flak: Splitter je Granate nach Stufe, Richtungen der Splitterringe */
const FLAK_SPLINTERS = [0, 6, 6, 8, 10, 12];
const RING_DIRS: Record<number, [number, number][]> = {};
for (const n of [6, 8, 10, 12]) RING_DIRS[n] = Array.from({ length: n }, (_, i) => dir(((i + 0.5) * TWO_PI) / n));
/** Plasma-Orb: Radius je Stufe, Schadens-Takt (Ticks) */
const ORB_R = [0, 13, 15, 18, 21, 26];
const ORB_TICK = 4;
/** Railgun: Schussbreite (Radius) je Stufe */
const RAIL_R = [0, 4, 4, 7, 7, 7];

/**
 * Wirtschaft (v1.2): deutlich mehr Credits, damit der Ausbau schneller geht.
 * Abschüsse × CREDIT_KILL, je Sektor +CREDIT_SECTOR_STEP; Kristalle CRYSTAL_BASE + CRYSTAL_STEP je Sektor;
 * Sektor-Prämie PRIZE_BASE + PRIZE_STEP je Sektor (ohne Treffer × PRIZE_NOHIT).
 */
const CREDIT_KILL = 1.4;
const CREDIT_SECTOR_STEP = 0.08;
const CRYSTAL_BASE = 11;
const CRYSTAL_STEP = 1;
const PRIZE_BASE = 100;
const PRIZE_STEP = 50;
const PRIZE_NOHIT = 1.5;
/** Skillpunkte: zusätzlich je so vielen Abschüssen und in jedem so-vielten Sektor */
export const KILLS_PER_POINT = 100;
export const MILESTONE_EVERY = 3;

/** Boss-Muster je Variante und Phase. A Fächer, B Spirale, C Salve, D Ring, E Regen */
const BOSS_PATTERNS: string[][][] = [
  [['A'], ['D', 'B'], ['B', 'C']],
  [['C'], ['A', 'E'], ['D', 'B', 'C']],
  [['D'], ['B', 'A'], ['E', 'C', 'D']],
  [['B'], ['C', 'D'], ['A', 'B', 'E']],
];


const PLAYER_HITBOX = 9;
/** Streifschuss: Kugel fliegt höchstens so weit (px) außerhalb der Trefferzone vorbei */
const GRAZE_DIST = 16;
/**
 * Schwere Kugeln ab Sektor 5: das Feuertempo der Gegner fällt auf FIRE_S5 (Sektor 5) bzw. FIRE_S6 (Sektor 6) und steigt
 * danach nur noch um FIRE_STEP je Sektor (vorher 1,48 / 1,60 und +0,12 je Sektor bis 2,4). Dafür wächst der Schaden je
 * Kugel: HEAVY_S5 in Sektor 5, HEAVY_S6 in Sektor 6, danach +HEAVY_STEP je Sektor (höchstens HEAVY_MAX).
 */
// Ausbau-Update: FIRE_S6 1,05 statt 1,14 – ab Sektor 7 sind die Gegner zäher (HP_LATE), leben also länger und
// feuern öfter; mit dem etwas niedrigeren Tempo bleibt die Kugelzahl auf dem Bildschirm auf dem Stand von v1.1.0.
const FIRE_S5 = 1.3;
const FIRE_S6 = 1.05;
const FIRE_STEP = 0.035;
const FIRE_MAX = 1.5;
const HEAVY_S5 = 1.1;
const HEAVY_S6 = 1.4;
const HEAVY_STEP = 0.1;
const HEAVY_MAX = 1.75;
/** Kugelschaden: Sektor 1 und Zuwachs je Sektor (bis v1.1.0: 8 und 1,5) */
const DMG_S1 = 6;
const DMG_STEP = 1.75;
/**
 * Härte-Update: Endgegner und Fregatten halten mindestens so lange durch, wie die Feuerkraft des Schiffs (theoretische
 * DPS mit voller Bordkanone, siehe shipFirepower) für BOSS_FLOOR_S bzw. FRIGATE_FLOOR_S Sekunden braucht – ab Sektor
 * FLOOR_FROM voll, in Sektor FLOOR_FROM − 1 zur Hälfte. Schwache Schiffe merken davon nichts (dort zählt die HP-Kurve),
 * ein voll ausgebautes Schiff hat so Bosskämpfe von ≈ 25–35 s statt 10–15 s und Fregatten von ≈ 8–13 s statt 2–5 s.
 */
const BOSS_FLOOR_S = 26;
const FRIGATE_FLOOR_S = 6;
const FLOOR_FROM = 5;
/** Raserei des Endgegners: Beginn (Ticks im Bosskampf; Härte-Update 90 s statt 75 s, die Kämpfe dauern länger) und Schadenszuwachs je 10 s */
export const RAGE_START = 90 * 60;
const RAGE_STEP = 0.3;
/** Endspiel: ab diesem Sektor werden Gegner je Sektor um HP_LATE_STEP zäher (Zinseszins) */
const HP_LATE_FROM = 7;
const HP_LATE_STEP = 0.285;
/** ab diesem Sektor wächst die Zähigkeit nur noch um HP_LATE_STEP2 je Sektor (Härte-Update: 18 statt 20, vor dem Kreuzer lag eine Wand) */
const HP_LATE_SLOW = 18;
const HP_LATE_STEP2 = 0.12;
/** Härte-Update: ab HP_LATE_END (mit Kreuzer) wieder etwas steiler (HP_LATE_STEP3 je Sektor) */
const HP_LATE_END = 20;
const HP_LATE_STEP3 = 0.16;
/** Endspiel: ab diesem Sektor wächst der Schaden aller Kugeln und Laser zusätzlich um LATE_STEP je Sektor */
const LATE_FROM = 6;
const LATE_STEP = 0.15;
/**
 * Härte-Update: Sektor 17–19 (kurz vor dem Kreuzer) wächst der Kugelschaden nur um LATE_STEP_WALL je Sektor – dort
 * endeten sonst fast alle guten Partien –, ab Sektor 20 (mit Kreuzer) dafür um LATE_STEP_END.
 */
const LATE_WALL_FROM = 16;
const LATE_WALL_TO = 19;
const LATE_STEP_WALL = 0.05;
const LATE_STEP_END = 0.3;
/** Streif-Leiste: Ausbeute je Streifschuss nach Schadensstufe 0–3 (weniger Kugeln → jede zählt mehr) */
const GRAZE_GAIN = [1, 1.25, 1.5, 1.625];
/** so viele Streifschüsse füllen die Streif-Leiste (→ Bombe oder Credits) */
export const GRAZE_FULL = 30;
/** Stillstand: wer sich so lange (Ticks) kaum bewegt, ruft einen Scharfschützen herbei */
export const STILL_LIMIT = 180;
/**
 * Zielerfassung (Härte-Update, ab Sektor LOCK_FROM): wer so lange (Ticks) innerhalb von STILL_RADIUS bleibt, ist „erfasst“ – Treffer kosten
 * LOCK_DMG (+LOCK_DMG_STEP je weitere Sekunde, höchstens LOCK_DMG_MAX), halbe Schonzeit nach Treffern, kein Notschild,
 * Hüllenreparatur ruht, Scharfschützen kommen schneller (LOCK_SNIPER_CD statt 300 Ticks Pause). Ein voll ausgebautes Schiff, das in Sektor 6+ stehen bleibt, fällt so
 * in wenigen Sekunden statt erst nach 18 s und zwei Wiederbelebungen.
 */
export const LOCK_LIMIT = 180;
/** Zielerfassung erst ab diesem Sektor (die ersten Sektoren bleiben für Einsteiger unverändert) */
export const LOCK_FROM = 5;
const LOCK_DMG = 2;
const LOCK_DMG_STEP = 0.5;
const LOCK_DMG_MAX = 4;
const LOCK_SNIPER_CD = 150;
/** „kaum bewegt“ = innerhalb dieses Radius (px) um den Ankerpunkt */
const STILL_RADIUS = 40;
/** Sperrfeuer: Vorwarnung und Dauer des Laservorhangs (Ticks) */
export const HAZARD_WARN = 60;
const HAZARD_DUR = 26;
const PICKUP_RADIUS = 26;
const INVULN_HIT = 50;
/** Schockwelle (Skill): Radius, in dem ein Treffer die Kugeln löscht */
export const SHOCK_RADIUS = 120;
/** Items schweben so lange (Ticks), danach fallen sie nach unten weg (davor blinken sie im Renderer) */
export const ITEM_HOVER = 270;
export const ITEM_WARN = 75;
const START_Y = HEIGHT - 140;

export interface PlayerState {
  x: number;
  y: number;
  hull: number;
  shield: number;
  /** Unverwundbarkeit (Ticks) nach Treffer, Notschild oder Phönix */
  invuln: number;
  /** Schild-Kapsel aktiv (Ticks) */
  bubble: number;
  gun: number;
  bombs: number;
  bombCd: number;
  lastHit: number;
  hitThisSector: boolean;
  emergencyUsed: boolean;
  phoenixUsed: boolean;
  droneAngle: number;
  /** Bewegung im letzten Tick (für Neigung im Renderer; vx/vy auch für den Vorhalt gezielter Schüsse) */
  vx: number;
  vy: number;
  /** Streif-Leiste (0..GRAZE_FULL) und Zahl der Streifschüsse im Spiel */
  graze: number;
  grazes: number;
  /** Ticks, die der Spieler schon fast still steht (Scharfschütze bei STILL_LIMIT) */
  stillT: number;
  /** wie stillT, wird aber vom Scharfschützen nicht zurückgesetzt (Zielerfassung ab LOCK_LIMIT) */
  lockT: number;
  /** Adrenalin (Skill): Rest-Ticks mit erhöhter Feuerrate */
  adren: number;
  /** Schutzengel (Skill) in diesem Sektor schon verbraucht */
  guardianUsed: boolean;
}

export interface Derived {
  maxHull: number;
  speed: number;
  fireMult: number;
  dmgMult: number;
  shieldMax: number;
  magnet: number;
  startGun: number;
  creditMult: number;
  priceMult: number;
  bombMax: number;
  /** Faktor auf erlittenen Schaden (Reaktivpanzer, Bollwerk) */
  dmgTaken: number;
  /** Hüllenreparatur je Tick */
  regen: number;
  critChance: number;
  critMult: number;
  /** Streif-Leiste: Faktor je Streifschuss und Zusatzabstand (px) */
  grazeMult: number;
  grazeDist: number;
  /** Radius der Trefferzone */
  hitbox: number;
  /** Anbauwaffen: Faktor auf Feuerrate und Schaden */
  mountFire: number;
  mountDmg: number;
  crystalMult: number;
}

export class Sim {
  readonly seed: number;
  tick = 0;
  phase: Phase = 'intro';
  phaseT = 0;
  /** Ticks seit Beginn der Flugphase des Sektors */
  flightT = 0;
  sector = 1;
  score = 0;
  credits = 0;
  kills = 0;
  skillPoints = 0;
  /** Summen über das ganze Spiel (Statistik) */
  totalCredits = 0;
  damageTaken = 0;

  player: PlayerState;
  loadout: Loadout;
  d!: Derived;

  bullets: Bullet[] = [];
  ebullets: EBullet[] = [];
  enemies: Enemy[] = [];
  items: Item[] = [];
  /** Sperrfeuer (Warnstreifen und Laservorhänge) */
  hazards: Hazard[] = [];
  /** aktueller Boss (auch in enemies enthalten) */
  boss: Enemy | null = null;
  bossPhase = 0;
  bossT = 0;
  bossAngle = 0;
  lastSummary: SectorSummary | null = null;

  events: SimEvent[] = [];

  private rng: Rng;
  private bossRng: Rng;
  /** eigener Zufall für Sperrfeuer, damit es die übrigen Folgen nicht verschiebt */
  private hazRng: Rng;
  private hazardT = 0;
  private anchorX = 0;
  private anchorY = 0;
  private sniperCd = 0;
  private spawns: Spawn[] = [];
  private spawnIdx = 0;
  private forms = new Map<number, { left: number; escaped: boolean }>();
  private nextId = 1;
  private gunAcc = 0;
  private slotAcc: Record<SlotId, number> = { wingL: 0, wingR: 0, core: 0, wingL2: 0, wingR2: 0, wingL3: 0, wingR3: 0, core2: 0, core3: 0 };
  private turretAcc = 0;
  /** eigener Zufall für kritische Treffer, damit er die übrigen Folgen nicht verschiebt */
  private critRng: Rng;
  /** schon mit Skillpunkten belohnte Abschuss-Marken */
  private killMarks = 0;
  /** hurt() hat die Kugelliste ersetzt (Phönix, Schutzengel, Schockwelle) */
  private cleared = false;
  /** Splitter, die während der Kollision entstehen */
  private spawned: Bullet[] = [];
  /** Strahllaser in diesem Tick (Renderer) */
  beams: Beam[] = [];
  private sectorKills = 0;
  private sectorCredits = 0;

  /** Protokoll für das Replay */
  private log: number[] = [];
  private actions: ({ tick: number } & Command)[] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.bossRng = new Rng((this.seed ^ 0x5bd1e995) >>> 0);
    this.hazRng = new Rng((this.seed ^ 0x2c1b3c6d) >>> 0);
    this.critRng = new Rng((this.seed ^ 0x7f4a7c15) >>> 0);
    this.loadout = {
      stats: {
        armor: 0, engine: 0, cooling: 0, caliber: 0, shield: 0, magnet: 0, cannon: 0, rig: 0, overdrive: 0,
        regen: 0, plating: 0, bay: 0, crit: 0, salvage: 0, grazer: 0, cls: 0,
      },
      slots: { wingL: null, wingR: null, core: null, wingL2: null, wingR2: null, wingL3: null, wingR3: null, core2: null, core3: null },
      skills: [],
    };
    this.recalc();
    this.player = {
      x: WIDTH / 2, y: HEIGHT + 60, hull: this.d.maxHull, shield: 0, invuln: 0, bubble: 0, gun: 1, bombs: 1, bombCd: 0,
      lastHit: -9999, hitThisSector: false, emergencyUsed: false, phoenixUsed: false, droneAngle: 0, vx: 0, vy: 0,
      graze: 0, grazes: 0, stillT: 0, lockT: 0, adren: 0, guardianUsed: false,
    };
    this.startSector();
  }

  has(s: SkillId): boolean {
    return this.loadout.skills.includes(s);
  }

  /** abgeleitete Werte aus Shop-Stufen und Skills */
  recalc() {
    const st = this.loadout.stats;
    const h = (s: SkillId) => this.loadout.skills.includes(s);
    const c = shipClass(st.cls);
    this.d = {
      maxHull: 100 + 20 * st.armor + (h('def1') ? 20 : 0) + (h('def6') ? 40 : 0) + c.hull,
      speed: ((300 + 30 * st.engine) / 60) * (h('pil1') ? 1.1 : 1),
      fireMult: (1 + 0.1 * st.cooling) * (h('off2') ? 1.1 : 1) * (1 + 0.03 * st.overdrive),
      dmgMult: (1 + 0.12 * st.caliber) * (h('off1') ? 1.1 : 1) * (1 + 0.05 * st.overdrive) * c.dmgMult,
      shieldMax: SHIELD_STEP * st.shield + c.shield,
      magnet: 40 + 30 * st.magnet + (h('tec1') ? 40 : 0),
      startGun: Math.min(5, 1 + st.cannon + (h('off4') ? 1 : 0)),
      creditMult: (h('tec3') ? 1.25 : 1) * (1 + SALVAGE_STEP * st.salvage),
      priceMult: 1 - (h('tec2') ? 0.1 : 0) - (h('tec6') ? 0.1 : 0),
      bombMax: 3 + (h('tec4') ? 1 : 0) + st.bay,
      dmgTaken: (1 - PLATING_STEP * st.plating) * (h('def6') ? 0.85 : 1) * c.dmgTaken,
      regen: (REGEN_STEP * st.regen + (h('def3') ? NANITE_REGEN : 0)) / 60,
      critChance: CRIT_STEP * st.crit + (h('off5') ? 0.1 : 0),
      critMult: h('off5') ? 3 : 2,
      grazeMult: (1 + 0.3 * st.grazer) * (h('pil2') ? 1.4 : 1),
      grazeDist: GRAZE_DIST + 4 * st.grazer,
      hitbox: PLAYER_HITBOX + c.hitbox - (h('pil3') ? 2 : 0),
      mountFire: h('gun1') ? 1.1 : 1,
      mountDmg: h('gun2') ? 1.12 : 1,
      crystalMult: h('tec6') ? 1.5 : 1,
    };
  }

  // ───────────────────────────── Sektor-Ablauf ─────────────────────────────

  private startSector() {
    this.phase = 'intro';
    this.phaseT = 0;
    this.flightT = 0;
    this.spawns = buildSector(this.seed, this.sector);
    this.spawnIdx = 0;
    this.forms.clear();
    this.bullets = [];
    this.ebullets = [];
    this.enemies = [];
    this.items = [];
    this.hazards = [];
    this.hazardT = this.firstHazard();
    this.sniperCd = 0;
    this.boss = null;
    this.bossPhase = 0;
    const p = this.player;
    p.stillT = 0;
    p.lockT = 0;
    p.x = WIDTH / 2;
    p.y = HEIGHT + 60;
    p.gun = this.d.startGun;
    p.shield = this.d.shieldMax;
    p.invuln = 0;
    p.bubble = 0;
    p.hitThisSector = false;
    p.emergencyUsed = false;
    p.adren = 0;
    p.guardianUsed = false;
    if (this.has('tec4') && p.bombs < 1) p.bombs = 1;
    const bonusBombs = shipClass(this.loadout.stats.cls).bombs;
    if (bonusBombs && this.sector > 1) p.bombs = Math.min(this.d.bombMax, p.bombs + bonusBombs);
    this.sectorKills = 0;
    this.sectorCredits = 0;
  }

  /** Feuerkraft des Schiffs (theoretische DPS mit voller Bordkanone, unabhängig von der aktuellen Waffenstufe) */
  shipFirepower(): number {
    return this.firepower(5).total;
  }
  /** Mindest-HP von Endgegner/Fregatte: Feuerkraft × Sekunden (ab FLOOR_FROM, ein Sektor davor zur Hälfte) */
  private toughFloor(seconds: number): number {
    const w = this.sector >= FLOOR_FROM ? 1 : this.sector === FLOOR_FROM - 1 ? 0.5 : 0;
    return w ? Math.round(this.shipFirepower() * seconds * w) : 0;
  }

  /** Multiplikatoren der Schwierigkeit für den aktuellen Sektor */
  hpMult(): number {
    const s = this.sector - 1;
    return (1 + 0.36 * s + 0.04 * s * s) * this.cycleHp() * this.lateHp();
  }
  /**
   * Zähigkeit je Durchlauf der acht Sektor-Themen: +60 % je Durchlauf, aber gleitend verteilt (+7,5 % je Sektor ab
   * Sektor 9) statt als Sprung in Sektor 9, 17, 25 … (bis v1.1.0) – an diesen Stufen endeten sonst fast alle Partien.
   */
  private cycleHp(): number {
    return this.sector <= 8 ? 1 : 1 + 0.075 * (this.sector - 8);
  }
  /** Endspiel: ab HP_LATE_FROM werden Gegner und Endgegner je Sektor um HP_LATE_STEP zäher (Zinseszins), ab HP_LATE_SLOW langsamer */
  private lateHp(): number {
    let m = 1;
    for (let s = HP_LATE_FROM; s < this.sector; s++) m *= 1 + (s < HP_LATE_SLOW ? HP_LATE_STEP : s < HP_LATE_END ? HP_LATE_STEP2 : HP_LATE_STEP3);
    return m;
  }
  private bulletSpeed(): number {
    return 4 * Math.min(1.7, 1 + 0.06 * (this.sector - 1));
  }
  /**
   * Feuertempo der Gegner. Bis Sektor 4 steigt es wie gehabt, ab Sektor 5 bleibt es stehen bzw. fällt leicht:
   * statt immer mehr Kugeln gibt es „schwere Kugeln“ mit mehr Schaden (heavyMult), damit der Bildschirm lesbar bleibt.
   */
  private fireMultEnemy(): number {
    const s = this.sector;
    if (s <= 4) return 1 + 0.12 * (s - 1);
    return s === 5 ? FIRE_S5 : Math.min(FIRE_MAX, FIRE_S6 + FIRE_STEP * (s - 6));
  }
  /** Schadensfaktor schwerer Kugeln (Ausgleich für die ausgedünnten Muster ab Sektor 5) */
  private heavyMult(): number {
    const s = this.sector;
    if (s <= 4) return 1;
    return (s === 5 ? HEAVY_S5 : Math.min(HEAVY_MAX, HEAVY_S6 + HEAVY_STEP * (s - 6))) * this.lateMult();
  }
  /** Schadensstufe 0–3 für Optik und Streifschuss-Ausbeute */
  heavyTier(): number {
    const s = this.sector;
    return s <= 4 ? 0 : s === 5 ? 1 : s <= 9 ? 2 : 3;
  }
  /** Anteil des Vorhalts bei gezielten Schüssen (0 = auf die aktuelle Position, 1 = voll vorgehalten) */
  private leadFactor(): number {
    return Math.min(0.85, 0.4 + 0.075 * (this.sector - 1));
  }
  /** Chance auf Elite-Varianten (ab Sektor 3) */
  private eliteChance(): number {
    return this.sector < 3 ? 0 : Math.min(0.3, 0.1 + 0.04 * (this.sector - 3));
  }
  /**
   * Grundschaden einer Kugel: Sektor 1 sanfter (DMG_S1 statt 8), bis Sektor 9 wieder auf dem alten Stand,
   * danach steiler. Ab LATE_FROM wächst zusätzlich der Faktor lateMult – das Endspiel soll auch voll
   * ausgebaute Schiffe (und die Schiffsklassen ab Sektor 20/30) fordern.
   */
  private baseDmg(): number {
    return DMG_S1 + DMG_STEP * (this.sector - 1);
  }
  private lateMult(): number {
    const s = this.sector;
    if (s <= LATE_FROM) return 1;
    return 1 + LATE_STEP * (Math.min(s, LATE_WALL_FROM) - LATE_FROM)
      + LATE_STEP_WALL * (Math.max(LATE_WALL_FROM, Math.min(s, LATE_WALL_TO)) - LATE_WALL_FROM)
      + LATE_STEP_END * Math.max(0, s - LATE_WALL_TO);
  }
  /**
   * Raserei: zieht sich ein Bosskampf länger als RAGE_START hin, trifft der Endgegner immer härter (+RAGE_STEP je
   * 10 s). So lässt sich kein Kampf endlos aussitzen (Reparaturdrohnen!), ohne dass mehr Kugeln fliegen.
   */
  rageMult(): number {
    if (this.phase !== 'boss' || this.bossT <= RAGE_START) return 1;
    return 1 + (RAGE_STEP * (this.bossT - RAGE_START)) / 600;
  }
  private bulletDmg(big: boolean): number {
    const b = this.baseDmg() * this.heavyMult() * this.rageMult();
    return Math.round(big ? b * 1.5 : b);
  }
  /** Sperrfeuer (Laser): unverändert, dort wurde nichts ausgedünnt */
  private laserDmg(): number {
    return Math.round(this.baseDmg() * 1.5 * this.lateMult() * this.rageMult());
  }
  private scoreMult(): number {
    return 1 + 0.25 * (this.sector - 1);
  }

  // ───────────────────────────── Tick ─────────────────────────────

  step(input: Input) {
    if (this.phase === 'shop' || this.phase === 'over') return;
    this.record(input);
    this.tick++;
    this.phaseT++;
    const p = this.player;

    if (this.phase === 'intro') {
      p.y = HEIGHT + 60 - (HEIGHT + 60 - START_Y) * Math.min(1, this.phaseT / 80);
      if (this.phaseT >= 90) {
        this.phase = 'flight';
        this.phaseT = 0;
      }
      return;
    }

    this.movePlayer(input);
    this.beams.length = 0;
    if (this.phase === 'flight' || this.phase === 'boss') {
      this.flightT++;
      if (input.bomb) this.bomb();
      this.spawnFromTimeline();
      this.firePlayer();
      this.updateHazards();
      this.watchStillness();
    }
    this.updateBullets();
    this.updateEnemies();
    this.updateEBullets();
    this.updateItems();
    this.collide();
    this.regen();

    if (this.phase === 'flight' && this.spawnIdx >= this.spawns.length) {
      const lastAt = this.spawns.length ? this.spawns[this.spawns.length - 1].at : 0;
      const remaining = this.enemies.some((e) => e.type !== 'turret');
      if (!remaining || this.flightT > lastAt + 600) this.spawnBoss();
    }
    if (this.phase === 'clear' && this.phaseT >= 200) this.enterShop();
  }

  private record(input: Input) {
    const mx = Math.max(-100, Math.min(100, Math.round(input.mx)));
    const my = Math.max(-100, Math.min(100, Math.round(input.my)));
    const fl = input.bomb ? 1 : 0;
    const L = this.log;
    const n = L.length;
    if (n >= 4 && L[n - 3] === mx && L[n - 2] === my && L[n - 1] === fl) L[n - 4]++;
    else L.push(1, mx, my, fl);
    input.mx = mx;
    input.my = my;
  }

  private movePlayer(input: Input) {
    const p = this.player;
    let mx = input.mx / 100;
    let my = input.my / 100;
    const len2 = mx * mx + my * my;
    if (len2 > 1) {
      const l = Math.sqrt(len2);
      mx /= l;
      my /= l;
    }
    const nx = Math.max(MARGIN, Math.min(WIDTH - MARGIN, p.x + mx * this.d.speed));
    const ny = Math.max(MARGIN + 40, Math.min(HEIGHT - MARGIN, p.y + my * this.d.speed));
    p.vx = nx - p.x;
    p.vy = ny - p.y;
    p.x = nx;
    p.y = ny;
  }

  private spawnFromTimeline() {
    while (this.spawnIdx < this.spawns.length && this.spawns[this.spawnIdx].at <= this.flightT) {
      const s = this.spawns[this.spawnIdx++];
      this.spawnEnemy(s.type, s.x, s.y, s.move, s.p, s.form);
      if (s.type === 'frigate') this.events.push({ e: 'frigate' });
    }
  }

  private spawnEnemy(type: EnemyType, x: number, y: number, move: Spawn['move'], p: number[], form: number): Enemy {
    const def = ENEMIES[type];
    const elite = (type === 'swarmer' || type === 'hunter' || type === 'spinner' || type === 'turret' || type === 'bomber')
      && this.rng.chance(this.eliteChance());
    let hp = def.hp * this.hpMult() * (elite ? 2.5 : 1);
    if (type === 'frigate') hp = Math.max(hp, this.toughFloor(FRIGATE_FLOOR_S));
    const big = type === 'boss' ? [120, 62] : type === 'frigate' ? [58, 34] : type === 'bomber' ? [34, 26] : [def.r, def.r];
    // erster Schuss kurz nach dem Erscheinen (Schwärmer bleiben zufällig verteilt, sonst feuert die ganze Kette gleichzeitig)
    const r = this.rng.next();
    const fireT = type === 'swarmer' ? def.interval * (0.4 + 0.6 * r) : Math.min(def.interval, 16 + 30 * r);
    const e: Enemy = {
      id: this.nextId++, type, x, y, vx: 0, vy: 0, x0: x, move, p, hp, maxHp: hp, rx: big[0], ry: big[1], age: 0,
      fireT, burst: 0, form, flash: 0, spin: 0, elite, shots: 0,
    };
    if (move === 'line' || move === 'drift') {
      e.vx = p[0];
      e.vy = p[1];
    } else if (move === 'arc') {
      e.vx = p[0];
      e.vy = p[1];
    }
    if (form) {
      const f = this.forms.get(form);
      if (f) f.left++;
      else this.forms.set(form, { left: 1, escaped: false });
    }
    this.enemies.push(e);
    return e;
  }

  private spawnBoss() {
    this.phase = 'boss';
    this.phaseT = 0;
    const variant = (this.sector - 1) % 4;
    const e = this.spawnEnemy('boss', WIDTH / 2, -120, 'boss', [variant], 0);
    e.hp = e.maxHp = Math.max(ENEMIES.boss.hp * (1 + 0.55 * (this.sector - 1)) * this.cycleHp() * this.lateHp(), this.toughFloor(BOSS_FLOOR_S));
    this.boss = e;
    this.bossPhase = 0;
    this.bossT = 0;
    this.bossAngle = 0;
    this.events.push({ e: 'bossSpawn' });
  }

  // ───────────────────────────── Spieler-Waffen ─────────────────────────────

  private addBullet(kind: PlayerWeapon, x: number, y: number, vx: number, vy: number, dmg: number, r: number, pierce = 0, life = 90): Bullet {
    const b: Bullet = { x, y, vx, vy, dmg: dmg * this.d.dmgMult, r, kind, pierce, hit: [], life, target: 0, speed: 0, bounce: 0, split: 0, chain: 0 };
    this.bullets.push(b);
    return b;
  }

  private firePlayer() {
    const p = this.player;
    const fm = this.d.fireMult * (p.adren > 0 ? 1.2 : 1);
    const mf = fm * this.d.mountFire;
    const clsN = Math.min(SHIP_CLASSES.length - 1, this.loadout.stats.cls);
    const cls = SHIP_CLASSES[clsN];
    // Bordkanone
    const interval = p.gun >= 5 ? 6 : 7;
    this.gunAcc += fm;
    if (this.gunAcc >= interval) {
      this.gunAcc -= interval;
      const pierce = this.has('off3') ? 1 : 0;
      for (const [ox, dx, dy] of GUN_DIRS[p.gun]) {
        this.addBullet('main', p.x + ox, p.y - 26 - cls.noseShift, dx * 15, dy * 15, 10 * cls.gunDmg, 5, pierce, 70);
      }
      for (const [ox, dx, dy] of CLASS_GUN_DIRS[clsN]) {
        this.addBullet('main', p.x + ox, p.y - 14, dx * 15, dy * 15, 10 * cls.gunDmg, 5, pierce, 70);
      }
      this.events.push({ e: 'shot', w: 'main', x: p.x, y: p.y });
    }
    // Geschütztürme der Schiffsklasse: zielen selbst auf den nächsten Gegner
    if (cls.turrets.length) {
      this.turretAcc += fm;
      if (this.turretAcc >= TURRET_INTERVAL) {
        this.turretAcc -= TURRET_INTERVAL;
        for (const [tx, ty] of cls.turrets) {
          const x = p.x + tx;
          const y = p.y + ty;
          const t = this.nearestEnemy(x, y);
          let vx = 0;
          let vy = -TURRET_SPEED;
          if (t) {
            const ddx = t.x - x;
            const ddy = t.y - y;
            const l = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            vx = (ddx / l) * TURRET_SPEED;
            vy = (ddy / l) * TURRET_SPEED;
          }
          this.addBullet('main', x, y, vx, vy, cls.turretDmg, 4, 0, 70);
        }
      }
    }
    // Anbauwaffen
    for (const slot of SLOTS) {
      const m = this.loadout.slots[slot];
      if (!m) continue;
      const ox = slotOffset(slot, m.lvl, clsN);
      const side = LEFT_SLOTS.includes(slot) ? -1 : 1;
      const x = p.x + ox;
      const y = p.y + (CORE_SLOTS.includes(slot) ? slotY(slot, clsN) : 2);
      const iv = this.weaponInterval(m.w, m.lvl);
      this.slotAcc[slot] += mf;
      if (m.w === 'beam') {
        // Dauerstrahl: Geometrie jeden Tick, Schaden je fälligem Intervall
        let n = 0;
        while (this.slotAcc[slot] >= iv) {
          this.slotAcc[slot] -= iv;
          n++;
        }
        this.fireBeam(x, y - 16, m.lvl, n);
        continue;
      }
      if (this.slotAcc[slot] < iv) continue;
      this.slotAcc[slot] -= iv;
      const L = m.lvl;
      const [cnt, dmg] = this.mountDamage(m.w, L);
      switch (m.w) {
        case 'rail': {
          // durchschlägt alles; Stufe 5 „Tachyonlanze“: zwei Schienen, jeder Durchschlag +20 % Schaden
          for (let i = 0; i < cnt; i++) {
            const b = this.addBullet('rail', x + (i - (cnt - 1) / 2) * 12, y - 20, 0, -26, dmg, RAIL_R[L], 99, 50);
            if (L >= 5) b.amp = 0.2;
          }
          break;
        }
        case 'flak': {
          // Granate mit Zeitzünder: Splitterring beim Treffer oder am Ende der Flugbahn; Stufe 5 „Sturmflak“: Splitter durchschlagen
          for (let i = 0; i < cnt; i++) {
            const b = this.addBullet('flak', x + (i - (cnt - 1) / 2) * 10, y - 12, side * (0.6 + i * 1.6), -9 - i * 1.5, dmg, 6, 0, 34 + ((this.tick + i * 7) % 3) * 6);
            b.burst = FLAK_SPLINTERS[L];
            b.burstPierce = L >= 5 ? 1 : 0;
          }
          break;
        }
        case 'plasma': {
          // träge Kugel, die durch alles wandert; Stufe 5 „Sonnenkern“ verschluckt Kugeln
          const b = this.addBullet('plasma', x, y - 30, 0, -4, dmg, ORB_R[L], 99, 230);
          b.orb = ORB_TICK;
          if (L >= 5) b.eat = true;
          break;
        }
        case 'pulse': {
          // 1/2/3/3/3 Läufe; Stufe 5 „Querschläger“: Schüsse prallen auf 2 weitere Gegner ab
          for (let i = 0; i < cnt; i++) {
            const b = this.addBullet('pulse', x + (i - (cnt - 1) / 2) * 7, y - 12, 0, -16, dmg, 3);
            if (L >= 5) b.bounce = 2;
          }
          break;
        }
        case 'arc':
          this.fireArc(x, y - 20, L, slot);
          break;
        case 'side': {
          // 1/1/2/3/3 Schüsse; Stufe 5 „Gatling-Batterie“ feuert schneller
          for (let i = 0; i < cnt; i++) this.addBullet('side', x + (i - (cnt - 1) / 2) * 7, y - 14, 0, -14, dmg, 4);
          break;
        }
        case 'spread': {
          // Stufe 5 „Splitterkanone“: Schüsse zerplatzen beim Treffer in 3 Splitter
          for (const [dx, dy] of SPREAD_DIRS[L]) {
            const b = this.addBullet('spread', x, y - 10, dx * side * 12, dy * 12, dmg, 4);
            if (L >= 5) b.split = 3;
          }
          break;
        }
        case 'missile': {
          // 1/1/1/2/3 Raketen; Stufe 5 „Raketenschwarm“: Splitter beim Einschlag
          for (let i = 0; i < cnt; i++) {
            const b = this.addBullet('missile', x + (i - (cnt - 1) / 2) * 8, y - 6, side * (2 + i), -5, dmg, 6, 0, 150);
            b.speed = 6;
            b.target = this.nearestEnemy(x, y)?.id ?? 0;
            if (L >= 5) b.split = 5;
          }
          break;
        }
        case 'laser': {
          // Stufe 4: durchschlägt 4; Stufe 5 „Prismalanze“: zwei Bolzen, die zwischen Gegnern abprallen
          if (L >= 5) {
            for (const ox2 of [-6, 6]) {
              const b = this.addBullet('laser', x + ox2, y - 30, 0, -18, dmg, 6, 1, 90);
              b.bounce = 4;
            }
          } else this.addBullet('laser', x, y - 30, 0, -18, dmg, 6, L >= 4 ? 4 : 3, 60);
          break;
        }
        case 'rear': {
          // Stufe 5 „Igel“: auch schräg nach vorn, jeder Schuss prallt einmal ab
          const dirs = L >= 5 ? REAR_DIRS5 : L >= 3 ? REAR_DIRS3 : REAR_DIRS;
          for (const [dx, dy] of dirs) {
            const b = this.addBullet('rear', x + dx * 10, y + 20, dx * 11, dy * 11, dmg, 4);
            if (L >= 5) b.bounce = 1;
          }
          break;
        }
        case 'drone': {
          // 1/1/2/2/3 Drohnen; Stufe 5 „Drohnenschwarm“: Treffer springen als Blitz auf einen Nachbarn über
          for (let i = 0; i < cnt; i++) {
            const [dx, dy] = this.dronePos(i, slot);
            const t = this.nearestEnemy(dx, dy);
            let vx = 0;
            let vy = -13;
            if (t) {
              const ddx = t.x - dx;
              const ddy = t.y - dy;
              const l = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
              vx = (ddx / l) * 13;
              vy = (ddy / l) * 13;
            }
            const b = this.addBullet('drone', dx, dy, vx, vy, dmg, 4);
            if (L >= 5) b.chain = 1;
          }
          break;
        }
      }
      this.events.push({ e: 'shot', w: m.w, x, y, slot });
    }
    // Drohnen kreisen
    p.droneAngle += 0.05;
    if (p.droneAngle > TWO_PI) p.droneAngle -= TWO_PI;
  }

  /**
   * Strahllaser: trifft den nächsten Gegner senkrecht darüber (ab Stufe 3: alle in der Spalte).
   * Stufe 5 „Todesstrahl“: alle 12 Ticks springen von getroffenen Gegnern Blitze auf je 2 Nachbarn.
   */
  private fireBeam(x: number, y0: number, lvl: number, shots: number) {
    const w = BEAM_W[lvl];
    const [, dmg0] = this.mountDamage('beam', lvl);
    // kritische Treffer beim Dauerstrahl als Mittelwert (kein Würfeln je Tick)
    const dmg = dmg0 * this.critAvg();
    const inCol: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.y > y0 || e.y < -e.ry * 0.5) continue;
      if (e.x + e.rx < x - w || e.x - e.rx > x + w) continue;
      inCol.push(e);
    }
    let y1 = -20;
    let hit = false;
    if (inCol.length) {
      hit = true;
      if (lvl >= 3) {
        for (const e of inCol) for (let i = 0; i < shots; i++) this.damageEnemy(e, dmg * this.d.dmgMult);
      } else {
        let near = inCol[0];
        for (const e of inCol) if (e.y > near.y) near = e;
        for (let i = 0; i < shots; i++) this.damageEnemy(near, dmg * this.d.dmgMult);
        y1 = near.y + near.ry * 0.6;
      }
      if (shots && (this.tick & 7) === 0) {
        const t = lvl >= 3 ? inCol[0] : inCol.reduce((a, b) => (b.y > a.y ? b : a));
        this.events.push({ e: 'hit', x, y: t.y + t.ry * 0.5 });
      }
      if (lvl >= 5 && this.tick % 12 === 0) {
        for (const e of inCol.slice(0, 3)) this.chainFrom(e, 2, 12 * this.d.dmgMult * this.critAvg(), [e.id]);
      }
    }
    this.beams.push({ x, y0, y1, w, lvl, hit });
  }

  /**
   * Kettenblitz: springt von Gegner `from` auf bis zu `jumps` weitere (nächster nicht getroffener in 150 px).
   * `skip` = schon getroffene IDs (werden ergänzt). Erzeugt ein 'arc'-Event für den Renderer.
   */
  private chainFrom(from: Enemy, jumps: number, dmg: number, skip: number[]) {
    const pts = [from.x, from.y];
    let cx = from.x;
    let cy = from.y;
    if (this.has('gun5')) jumps++;
    for (let j = 0; j < jumps; j++) {
      let best: Enemy | null = null;
      let bd = 150 * 150;
      for (const e of this.enemies) {
        if (e.hp <= 0 || e.y < -e.ry * 0.5 || e.y > HEIGHT || skip.includes(e.id)) continue;
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) break;
      skip.push(best.id);
      pts.push(best.x, best.y);
      this.events.push({ e: 'hit', x: best.x, y: best.y });
      cx = best.x;
      cy = best.y;
      this.damageEnemy(best, dmg);
    }
    if (pts.length > 2) this.events.push({ e: 'arc', pts });
  }

  /**
   * Blitzbogen: nächster Gegner in Reichweite, dann Sprünge auf Nachbarn (1/2/3/4/5).
   * Stufe 5 „Gewittersturm“: vom ersten Ziel gabelt sich ein zweiter Blitz mit 3 Sprüngen.
   */
  private fireArc(x: number, y: number, lvl: number, slot: SlotId) {
    const [, dmg] = this.mountDamage('arc', lvl);
    let first: Enemy | null = null;
    let bd = 300 * 300;
    for (const e of this.enemies) {
      if (e.hp <= 0 || e.y < -e.ry * 0.5 || e.y > HEIGHT) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        first = e;
      }
    }
    if (!first) return;
    const hitIds = [first.id];
    this.events.push({ e: 'arc', pts: [x, y, first.x, first.y] });
    this.events.push({ e: 'hit', x: first.x, y: first.y });
    const fx = first.x;
    const fy = first.y;
    const d = dmg * this.d.dmgMult * this.crit(fx, fy);
    this.damageEnemy(first, d);
    const jumps = ARC_JUMPS[lvl];
    // Ziel kann gestorben sein: die Kette startet trotzdem an seiner Position
    const anchor = { ...first, x: fx, y: fy } as Enemy;
    this.chainFrom(anchor, jumps, d, hitIds);
    if (lvl >= 5) this.chainFrom(anchor, 3, d, hitIds);
    this.events.push({ e: 'shot', w: 'arc', x, y, slot });
  }

  /** Ist der Steckplatz verfügbar? (äußere Plätze erst mit Ausleger) */
  slotOpen(slot: SlotId): boolean {
    return this.loadout.stats.rig >= slotRig(slot) && this.loadout.stats.cls >= slotClass(slot);
  }

  /** Warum ein Schiffswert (noch) nicht zu kaufen ist; '' = frei. Schiffsklassen gibt es erst vor Sektor 20 bzw. 30. */
  statLock(id: StatId): string {
    if (id !== 'cls') return '';
    const next = SHIP_CLASSES[this.loadout.stats.cls + 1];
    return next && this.sector + 1 < next.sector ? `ab Sektor ${next.sector}` : '';
  }

  /** Würfelt einen kritischen Treffer: Schadensfaktor (1 oder critMult), meldet ihn dem Renderer */
  private crit(x: number, y: number): number {
    const c = this.d.critChance;
    if (c <= 0 || !this.critRng.chance(c)) return 1;
    this.events.push({ e: 'crit', x, y });
    return this.d.critMult;
  }

  /** mittlerer Schadensfaktor durch kritische Treffer (Dauerstrahl, Kettenblitze, Anzeige) */
  critAvg(): number {
    return 1 + this.d.critChance * (this.d.critMult - 1);
  }

  /** wie shotDamage, aber mit den Skill-Boni für Anbauwaffen (Hohlladung, Panzerbrecher, Arsenal) */
  mountDamage(w: string, lvl: number): [number, number] {
    const [n, dmg] = this.shotDamage(w, lvl);
    let m = this.d.mountDmg;
    if ((w === 'rail' || w === 'laser' || w === 'plasma') && this.has('gun4')) m *= 1.3;
    if (lvl >= MAX_WEAPON_LVL && this.has('gun6')) m *= 1.25;
    return [n, dmg * m];
  }

  /**
   * Theoretische Feuerkraft (Schaden pro Sekunde, wenn alle Schüsse treffen) je Waffe und gesamt.
   * Nur Anzeige; rechnet mit denselben Werten wie firePlayer.
   */
  firepower(gun = this.player.gun): { total: number; parts: { id: PlayerWeapon; lvl: number; dps: number }[] } {
    const fm = this.d.fireMult;
    const dm = this.d.dmgMult * this.critAvg();
    const cls = shipClass(this.loadout.stats.cls);
    const parts: { id: PlayerWeapon; lvl: number; dps: number }[] = [
      {
        id: 'main', lvl: gun,
        dps: ((60 * fm) / (gun >= 5 ? 6 : 7)) * (GUN_DIRS[gun].length + cls.guns.length) * 10 * cls.gunDmg * dm
          + ((60 * fm) / TURRET_INTERVAL) * cls.turrets.length * cls.turretDmg * dm,
      },
    ];
    for (const slot of SLOTS) {
      const m = this.loadout.slots[slot];
      if (!m) continue;
      const [n, dmg] = this.mountDamage(m.w, m.lvl);
      parts.push({ id: m.w, lvl: m.lvl, dps: ((60 * fm * this.d.mountFire) / this.weaponInterval(m.w, m.lvl)) * n * dmg * dm });
    }
    let total = 0;
    for (const p of parts) total += p.dps;
    return { total, parts };
  }

  /** Geschosse pro Salve und Schaden je Geschoss (ohne Schadens-Multiplikator); Stufe 1–5 */
  shotDamage(w: string, lvl: number): [number, number] {
    const L = lvl < 1 ? 1 : lvl > 5 ? 5 : lvl;
    switch (w) {
      case 'side': return [[0, 1, 1, 2, 3, 3][L], [0, 7, 9, 9, 10, 11][L]];
      case 'spread': return [SPREAD_DIRS[L].length, [0, 6, 8, 8, 9, 10][L]];
      case 'missile': return [[0, 1, 1, 1, 2, 3][L], [0, 24, 24, 24, 26, 28][L]];
      case 'laser': return [L >= 5 ? 2 : 1, [0, 18, 22, 26, 30, 30][L]];
      case 'rear': return [(L >= 5 ? REAR_DIRS5 : L >= 3 ? REAR_DIRS3 : REAR_DIRS).length, [0, 8, 10, 10, 12, 12][L]];
      case 'drone': return [[0, 1, 1, 2, 2, 3][L], [0, 6, 6, 6, 7, 8][L]];
      case 'pulse': return [[0, 1, 1, 2, 3, 3][L], [0, 4, 5, 5, 5, 6][L]];
      // Strahl: Schaden je Tick-Intervall (2 Ticks)
      case 'beam': return [1, [0, 1.5, 2, 2.5, 3, 3.5][L]];
      // Blitz: Schaden je Treffer, bis zu 1 + Sprünge Gegner (Stufe 5 mit Gabelung)
      case 'arc': return [1 + ARC_JUMPS[L] + (L >= 5 ? 3 : 0), [0, 14, 16, 18, 20, 22][L]];
      // Railgun: 1/1/1/1/2 Schüsse, die alles durchschlagen
      case 'rail': return [L >= 5 ? 2 : 1, [0, 40, 50, 60, 72, 80][L]];
      // Flak: 1/1/2/2/2 Granaten (der Splitterring kommt dazu)
      case 'flak': return [[0, 1, 1, 2, 2, 2][L], [0, 10, 12, 13, 15, 18][L]];
      // Plasma-Orb: Schaden je Takt (alle 4 Ticks), solange ein Gegner in der Kugel steckt
      case 'plasma': return [1, [0, 9, 11, 13, 15, 18][L]];
    }
    return [1, 10];
  }

  weaponInterval(w: string, lvl: number): number {
    const L = lvl < 1 ? 1 : lvl > 5 ? 5 : lvl;
    switch (w) {
      case 'side': return [0, 10, 10, 10, 9, 6][L];
      case 'spread': return [0, 12, 12, 12, 11, 11][L];
      case 'missile': return [0, 48, 40, 32, 30, 26][L];
      case 'laser': return [0, 20, 16, 13, 12, 12][L];
      case 'rear': return [0, 14, 14, 14, 12, 12][L];
      case 'drone': return [0, 14, 11, 8, 7, 6][L];
      case 'pulse': return [0, 6, 6, 6, 6, 5][L];
      case 'beam': return 2;
      case 'arc': return [0, 22, 18, 15, 14, 12][L];
      case 'rail': return [0, 50, 44, 38, 34, 28][L];
      case 'flak': return [0, 34, 30, 28, 24, 20][L];
      case 'plasma': return [0, 80, 72, 64, 56, 50][L];
    }
    return 10;
  }

  /** Position der Begleitdrohne i */
  dronePos(i: number, slot: SlotId = 'core'): [number, number] {
    const m = this.loadout.slots[slot];
    const n = m && m.w === 'drone' ? this.shotDamage('drone', m.lvl)[0] : 1;
    // äußere Bahnen (zweiter/dritter Rumpf-Steckplatz) laufen gegenläufig
    const rev = slot === 'core2' ? -1 : 1;
    const a = rev * this.player.droneAngle + (i * TWO_PI) / n;
    const r = droneRadius(slot, this.loadout.stats.cls);
    return [this.player.x + dcos(a) * r, this.player.y + dsin(a) * r];
  }

  private nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.y < 0 || e.y > HEIGHT) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private bomb() {
    const p = this.player;
    if (p.bombs <= 0 || p.bombCd > 0) return;
    p.bombs--;
    p.bombCd = 40;
    this.blast();
  }

  /** Wirkung einer Smartbombe (auch vom Schutzengel ausgelöst) */
  private blast() {
    const p = this.player;
    const expert = this.has('pil4');
    if (expert && p.invuln < 120) p.invuln = 120;
    this.ebullets = [];
    this.events.push({ e: 'bomb', x: p.x, y: p.y });
    for (const e of [...this.enemies]) {
      if (e.y < -e.ry * 0.5 || e.y > HEIGHT + e.ry * 0.5) continue;
      this.damageEnemy(e, (e.type === 'boss' ? 300 : e.type === 'frigate' ? 200 : 120) * (expert ? 2 : 1));
    }
  }

  /** Flak: Splitterring an der Stelle der Granate (skip = schon getroffener Gegner) */
  private burstRing(b: Bullet, skip: number) {
    const n = b.burst ?? 0;
    const dirs = RING_DIRS[n];
    if (!dirs) return;
    const dmg = b.dmg * 0.45 * (this.has('gun3') ? 1.6 : 1);
    for (const [dx, dy] of dirs) {
      this.spawned.push({ x: b.x, y: b.y, vx: dx * 10, vy: dy * 10, dmg, r: 3, kind: 'flak', pierce: b.burstPierce ?? 0, hit: skip ? [skip] : [], life: 20, target: 0, speed: 0, bounce: 0, split: 0, chain: 0 });
    }
    this.events.push({ e: 'burst', x: b.x, y: b.y });
  }

  private updateBullets() {
    const out: Bullet[] = [];
    for (const b of this.bullets) {
      if (b.kind === 'missile') {
        if (b.speed < 11) b.speed += 0.25;
        let t = b.target ? this.enemies.find((e) => e.id === b.target) : undefined;
        if (!t) {
          t = this.nearestEnemy(b.x, b.y) ?? undefined;
          b.target = t ? t.id : 0;
        }
        let dx: number;
        let dy: number;
        if (t) {
          dx = t.x - b.x;
          dy = t.y - b.y;
          const l = Math.sqrt(dx * dx + dy * dy) || 1;
          dx /= l;
          dy /= l;
        } else {
          dx = 0;
          dy = -1;
        }
        const cl = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
        let nx = b.vx / cl + (dx - b.vx / cl) * 0.14;
        let ny = b.vy / cl + (dy - b.vy / cl) * 0.14;
        const nl = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= nl;
        ny /= nl;
        b.vx = nx * b.speed;
        b.vy = ny * b.speed;
      }
      b.x += b.vx;
      b.y += b.vy;
      b.life--;
      if (b.life > 0 && b.y > -30 && b.y < HEIGHT + 30 && b.x > -30 && b.x < WIDTH + 30) out.push(b);
      else if (b.burst && b.life <= 0) this.burstRing(b, 0);
    }
    this.bullets = out;
  }

  // ───────────────────────────── Gegner ─────────────────────────────

  private updateEnemies() {
    const keep: Enemy[] = [];
    for (const e of this.enemies) {
      e.age++;
      if (e.flash > 0) e.flash--;
      this.moveEnemy(e);
      if (e.type === 'boss') this.bossFire(e);
      else this.enemyFire(e);
      const gone = (e.y > HEIGHT + 80 && e.vy >= 0 && e.age > 30) || e.y > HEIGHT + 200 || e.x < -100 || e.x > WIDTH + 100 || (e.y < -150 && e.age > 60);
      if (gone && e.type !== 'boss') {
        if (e.form) {
          const f = this.forms.get(e.form);
          if (f) {
            f.left--;
            f.escaped = true;
          }
        }
        continue;
      }
      keep.push(e);
    }
    this.enemies = keep;
  }

  private moveEnemy(e: Enemy) {
    const p = e.p;
    switch (e.move) {
      case 'line':
      case 'drift':
        e.x += e.vx;
        e.y += e.vy;
        if (e.type === 'spinner' || e.type === 'mine') e.spin += e.type === 'mine' ? 0.02 : 0.06;
        break;
      case 'sine': {
        // p: [vy, amp, freq, phase]
        e.y += p[0];
        const nx = e.x0 + p[1] * dsin(e.age * p[2] + p[3]);
        e.vx = nx - e.x;
        e.x = nx;
        e.vy = p[0];
        break;
      }
      case 'arc': {
        // p: [vx, vy, turnStart, turnEnd, w] – Geschwindigkeit dreht sich zwischen turnStart und turnEnd um w pro Tick
        if (e.age >= p[2] && e.age < p[3]) {
          const c = dcos(p[4]);
          const s = dsin(p[4]);
          const vx = e.vx * c - e.vy * s;
          const vy = e.vx * s + e.vy * c;
          e.vx = vx;
          e.vy = vy;
        }
        e.x += e.vx;
        e.y += e.vy;
        break;
      }
      case 'stop': {
        // p: [vy, yStop, hold, exitVx, exitVy]
        if (e.y < p[1] && e.spin === 0 && e.age < 400) {
          const rest = p[1] - e.y;
          e.vy = Math.max(0.6, Math.min(p[0], rest * 0.06));
          e.vx = 0;
        } else if (e.spin < p[2]) {
          e.spin++;
          e.vy = 0;
        } else {
          e.vx += (p[3] - e.vx) * 0.04;
          e.vy += (p[4] - e.vy) * 0.04;
        }
        e.x += e.vx;
        e.y += e.vy;
        break;
      }
      case 'homing': {
        // p: [speed, turn] – lenkt auf den Spieler, solange er unter dem Gegner ist
        const pl = this.player;
        if (e.age < 20) {
          e.vx = 0;
          e.vy = p[0] * 0.6;
        } else if (e.y < pl.y - 40) {
          const dx = pl.x - e.x;
          const dy = pl.y - e.y;
          const l = Math.sqrt(dx * dx + dy * dy) || 1;
          const cl = Math.sqrt(e.vx * e.vx + e.vy * e.vy) || 1;
          let nx = e.vx / cl + (dx / l - e.vx / cl) * p[1];
          let ny = e.vy / cl + (dy / l - e.vy / cl) * p[1];
          const nl = Math.sqrt(nx * nx + ny * ny) || 1;
          nx /= nl;
          ny /= nl;
          e.vx = nx * p[0];
          e.vy = ny * p[0];
        }
        e.x += e.vx;
        e.y += e.vy;
        break;
      }
      case 'pendulum': {
        // p: [vy, yStop, amp, freq] – fährt ein und pendelt
        if (e.y < p[1] && e.spin === 0) {
          e.y += p[0];
        } else {
          e.spin++;
          const nx = WIDTH / 2 + p[2] * dsin(e.spin * p[3]);
          e.vx = nx - e.x;
          e.x = nx;
          // nach 20 s zieht sie sich zurück
          if (e.spin > 1200) e.y -= 1.2;
        }
        break;
      }
      case 'boss': {
        if (e.y < 170 && this.bossT === 0) {
          e.y += 1.4;
        } else {
          this.bossT++;
          const nx = WIDTH / 2 + 115 * dsin(this.bossT * 0.011);
          e.vx = nx - e.x;
          e.x = nx;
          e.y = 170 + 22 * dsin(this.bossT * 0.023);
        }
        break;
      }
    }
  }

  private aimAt(x: number, y: number): [number, number] {
    const dx = this.player.x - x;
    const dy = this.player.y - y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / l, dy / l];
  }

  /**
   * Zielen mit Vorhalt: rechnet die Bewegung des Spielers für die Flugzeit der Kugel mit ein (Anteil k).
   * Wer stur in eine Richtung fliegt, wird so genauso getroffen wie jemand, der still steht.
   */
  private aimLead(x: number, y: number, speed: number, k = this.leadFactor()): [number, number] {
    const p = this.player;
    let dx = p.x - x;
    let dy = p.y - y;
    const t = Math.min(90, Math.sqrt(dx * dx + dy * dy) / Math.max(1, speed));
    const tx = Math.max(MARGIN, Math.min(WIDTH - MARGIN, p.x + p.vx * t * k));
    const ty = Math.max(MARGIN + 40, Math.min(HEIGHT - MARGIN, p.y + p.vy * t * k));
    dx = tx - x;
    dy = ty - y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / l, dy / l];
  }

  private eshot(x: number, y: number, dx: number, dy: number, speed: number, big = false) {
    this.ebullets.push({ x, y, vx: dx * speed, vy: dy * speed, r: big ? 9 : 6, big, heavy: this.heavyTier(), grazed: false });
  }

  /** Fächer aus n Kugeln um die Richtung (ax, ay), Abstand step (Bogenmaß) */
  private fan(x: number, y: number, ax: number, ay: number, n: number, step: number, speed: number, big = false) {
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * step;
      const c = dcos(a);
      const s = dsin(a);
      this.eshot(x, y, ax * c - ay * s, ax * s + ay * c, speed, big);
    }
  }

  /** Kugelwand über die ganze Breite mit einer Lücke (langsam, gut lesbar) */
  private wall(y: number, speed: number, rng: Rng) {
    const gapW = 120;
    const gx = rng.range(40 + gapW / 2, WIDTH - 40 - gapW / 2);
    for (let x = 14; x < WIDTH; x += 30) {
      if (Math.abs(x - gx) < gapW / 2) continue;
      this.eshot(x, y, 0, 1, speed);
    }
  }

  private enemyFire(e: Enemy) {
    const def = ENEMIES[e.type];
    if (def.fire === 'none' || (e.type === 'swarmer' && this.sector < 2 && !e.elite)) return;
    if (e.y < 30 || e.y > HEIGHT * 0.8 || e.x < 10 || e.x > WIDTH - 10) return;
    // nicht mehr feuern, wenn der Gegner schon unter dem Spieler ist (von dort kommt nichts Faires)
    if (e.y > this.player.y - 60) return;
    const sp = this.bulletSpeed();
    // Salve: Restschüsse alle 7 Ticks (Scharfschütze: 6)
    if (e.burst > 0 && e.age % (e.type === 'sniper' ? 6 : 7) === 0) {
      e.burst--;
      const fast = e.type === 'sniper' ? 1.7 : 1.15;
      const [dx, dy] = this.aimLead(e.x, e.y, sp * fast, e.type === 'sniper' ? 1 : undefined);
      this.eshot(e.x, e.y + e.ry * 0.6, dx, dy, sp * fast, e.type === 'sniper');
      this.events.push({ e: 'eshot', x: e.x, y: e.y, big: false });
    }
    e.fireT -= this.fireMultEnemy() * (e.elite ? 1.4 : 1);
    if (e.fireT > 0) return;
    e.fireT += def.interval;
    e.shots++;
    const s = this.sector;
    switch (def.fire) {
      case 'aimed': {
        const [dx, dy] = this.aimLead(e.x, e.y, sp);
        // Jäger ab Sektor 3 (Elite immer) mit Dreierfächer
        if (e.type === 'hunter' && (s >= 3 || e.elite)) this.fan(e.x, e.y + 10, dx, dy, 3, 13 * DEG, sp);
        else this.eshot(e.x, e.y + 10, dx, dy, sp);
        break;
      }
      case 'ring': {
        const n = Math.min(10, 8 + Math.floor((s - 1) / 2));
        for (let i = 0; i < n; i++) {
          const [dx, dy] = dir(e.spin + (i * TWO_PI) / n);
          this.eshot(e.x, e.y, dx, dy, sp * 0.8);
        }
        // Elite immer, sonst ab Sektor 5 bei jeder zweiten Salve: zweiter, versetzter und langsamerer Ring
        if (e.elite || (s >= 5 && e.shots % 2 === 0)) {
          for (let i = 0; i < n; i++) {
            const [dx, dy] = dir(e.spin + ((i + 0.5) * TWO_PI) / n);
            this.eshot(e.x, e.y, dx, dy, sp * 0.55);
          }
        }
        break;
      }
      case 'fan': {
        const frig = e.type === 'frigate';
        // Fregatte: jede dritte Salve eine Wand mit Lücke
        if (frig && e.shots % 3 === 2) {
          this.wall(e.y + e.ry, sp * 0.55, this.rng);
          break;
        }
        const n = frig ? 5 : e.elite ? 7 : s >= 3 ? 5 : 3;
        const [ax, ay] = this.aimLead(e.x, e.y, sp);
        this.fan(e.x, e.y + e.ry * 0.6, ax, ay, n, (n > 5 ? 11 : 15) * DEG, sp, frig);
        if (frig) e.burst = 3;
        break;
      }
      case 'salvo': {
        const [dx, dy] = this.aimLead(e.x, e.y, sp * 1.15);
        this.eshot(e.x, e.y, dx, dy, sp * 1.15);
        e.burst = 2 + (s >= 4 ? 1 : 0) + (e.elite ? 2 : 0);
        break;
      }
      case 'snipe': {
        // Scharfschütze: schnelle, voll vorgehaltene Dreiersalve (die Ziellinie im Renderer warnt vorher)
        const [dx, dy] = this.aimLead(e.x, e.y, sp * 1.7, 1);
        this.eshot(e.x, e.y + e.ry * 0.6, dx, dy, sp * 1.7, true);
        e.burst = 2;
        break;
      }
    }
    this.events.push({ e: 'eshot', x: e.x, y: e.y, big: def.fire !== 'aimed' });
  }

  // ───────────────────────────── Druck gegen Stillstand ─────────────────────────────

  /** Ticks bis zum ersten Sperrfeuer des Sektors */
  private firstHazard(): number {
    return Math.max(240, 520 - 30 * (this.sector - 1)) + this.hazRng.int(120);
  }

  /** Abstand zwischen zwei Sperrfeuern; im Bosskampf erst ab Sektor 3 und seltener */
  private hazardGap(): number {
    const base = Math.max(210, 520 - 45 * (this.sector - 1));
    return Math.round(base * (this.phase === 'boss' ? 1.7 : 1)) + this.hazRng.int(140);
  }

  private addHazard(kind: 'col' | 'row', pos: number) {
    const w = kind === 'col' ? 38 : 30;
    const x = kind === 'col' ? Math.max(w, Math.min(WIDTH - w, pos)) : WIDTH / 2;
    const y = kind === 'row' ? Math.max(MARGIN + 40, Math.min(HEIGHT - MARGIN - 10, pos)) : HEIGHT / 2;
    this.hazards.push({ kind, x, y, w, t: 0, warn: HAZARD_WARN, dur: HAZARD_DUR, hit: false });
    this.events.push({ e: 'hazardWarn', kind, x, y });
  }

  /**
   * Sperrfeuer: Warnstreifen über der Position des Spielers, nach 1 s zündet ein Laservorhang.
   * Höchstens zwei Streifen gleichzeitig, immer schmal genug, dass man rechtzeitig herauskommt.
   */
  private updateHazards() {
    const p = this.player;
    if (this.phase === 'flight' || (this.phase === 'boss' && this.sector >= 3 && this.bossT > 0)) {
      if (--this.hazardT <= 0) {
        this.hazardT = this.hazardGap();
        const s = this.sector;
        const r = this.hazRng.next();
        if (s >= 5 && r < 0.3) {
          // Kreuz: Spalte und Zeile – diagonal heraus
          this.addHazard('col', p.x);
          this.addHazard('row', p.y);
        } else if (s >= 3 && r < 0.65) {
          // zwei Spalten mit sicherem Gang dazwischen
          this.addHazard('col', p.x);
          const side = p.x < WIDTH / 2 ? 1 : -1;
          this.addHazard('col', p.x + side * this.hazRng.range(170, 230));
        } else if (s >= 2 && r < 0.85) {
          this.addHazard('row', p.y);
        } else {
          this.addHazard('col', p.x);
        }
      }
    }
    const keep: Hazard[] = [];
    for (const h of this.hazards) {
      h.t++;
      if (h.t === h.warn) this.events.push({ e: 'hazardFire', kind: h.kind, x: h.x, y: h.y });
      if (h.t >= h.warn && !h.hit) {
        const inside = h.kind === 'col' ? Math.abs(p.x - h.x) < h.w + 4 : Math.abs(p.y - h.y) < h.w + 4;
        if (inside && this.hurt(this.laserDmg(), 'laser')) h.hit = true;
      }
      if (h.t < h.warn + h.dur) keep.push(h);
    }
    this.hazards = keep;
  }

  /** Zielerfassung aktiv (Spieler steht seit LOCK_LIMIT Ticks fast still, nur im Flug und im Bosskampf) */
  locked(): boolean {
    return this.player.lockT >= LOCK_LIMIT && this.sector >= LOCK_FROM && (this.phase === 'flight' || this.phase === 'boss');
  }
  /** Schadensfaktor der Zielerfassung: LOCK_DMG, je weitere Sekunde +LOCK_DMG_STEP (höchstens LOCK_DMG_MAX) */
  lockMult(): number {
    if (!this.locked()) return 1;
    return Math.min(LOCK_DMG_MAX, LOCK_DMG + (LOCK_DMG_STEP * (this.player.lockT - LOCK_LIMIT)) / 60);
  }

  /** Wer ~3 s lang (fast) still steht, bekommt einen Scharfschützen auf den Hals */
  private watchStillness() {
    const p = this.player;
    if (this.sniperCd > 0) this.sniperCd--;
    const dx = p.x - this.anchorX;
    const dy = p.y - this.anchorY;
    if (dx * dx + dy * dy > STILL_RADIUS * STILL_RADIUS) {
      this.anchorX = p.x;
      this.anchorY = p.y;
      p.stillT = 0;
      p.lockT = 0;
      return;
    }
    p.stillT++;
    p.lockT++;
    if (p.lockT === LOCK_LIMIT && this.sector >= LOCK_FROM) this.events.push({ e: 'locked', x: p.x, y: p.y });
    if (p.stillT < STILL_LIMIT || this.sniperCd > 0 || this.phase !== 'flight' && this.phase !== 'boss') return;
    if (this.enemies.some((e) => e.type === 'sniper')) return;
    const side = p.x < WIDTH / 2 ? 1 : -1;
    const x = Math.max(60, Math.min(WIDTH - 60, p.x + side * this.hazRng.range(90, 170)));
    const sn = this.spawnEnemy('sniper', x, -30, 'stop', [3.4, this.hazRng.range(110, 190), 330, side * 2.6, -0.5], 0);
    sn.fireT = 46;
    p.stillT = 0;
    this.sniperCd = this.locked() ? LOCK_SNIPER_CD : 300;
    this.events.push({ e: 'sniper', x, y: -30 });
  }

  private bossFire(e: Enemy) {
    if (this.bossT === 0) return;
    if (this.bossT === RAGE_START + 1) this.events.push({ e: 'bossRage' });
    const ph = e.hp > e.maxHp * 0.66 ? 0 : e.hp > e.maxHp * 0.33 ? 1 : 2;
    if (ph !== this.bossPhase) {
      this.bossPhase = ph;
      this.events.push({ e: 'bossPhase', phase: ph });
    }
    const variant = e.p[0];
    const pats = [...BOSS_PATTERNS[variant][ph]];
    if (this.sector >= 4 && ph === 0) pats.push(BOSS_PATTERNS[(variant + 1) % 4][0][0]);
    if (this.sector >= 4 && ph >= 1) pats.push('W');
    // (bis v1.0.1 kam ab Sektor 6 in der letzten Phase noch ein weiteres Muster dazu – entfällt zugunsten schwerer Kugeln)
    const t = this.bossT;
    const sp = this.bulletSpeed();
    const fm = this.fireMultEnemy();
    const every = (n: number) => t % Math.max(3, Math.round(n / fm)) === 0;
    let fired = false;
    for (const pat of pats) {
      switch (pat) {
        case 'A':
          if (every(55)) {
            const [ax, ay] = this.aimLead(e.x, e.y, sp);
            for (let i = 0; i < 7; i++) {
              const a = (i - 3) * 10 * DEG;
              const c = dcos(a);
              const s = dsin(a);
              this.eshot(e.x, e.y + 50, ax * c - ay * s, ax * s + ay * c, sp);
            }
            fired = true;
          }
          break;
        case 'B':
          if (every(6)) {
            this.bossAngle += 0.23;
            for (let k = 0; k < 2; k++) {
              const [dx, dy] = dir(this.bossAngle + k * PI);
              this.eshot(e.x, e.y + 10, dx, dy, sp * 0.8);
            }
            fired = true;
          }
          break;
        case 'C':
          if (t % Math.max(30, Math.round(80 / fm)) < 25 && t % 5 === 0) {
            for (const ox of [-70, 70]) {
              const [dx, dy] = this.aimAt(e.x + ox, e.y + 30);
              this.eshot(e.x + ox, e.y + 30, dx, dy, sp * 1.3);
            }
            fired = true;
          }
          break;
        case 'D':
          if (every(65)) {
            const n = 18;
            const off = Math.floor(t / 65) % 2 === 0 ? 0 : PI / n;
            for (let i = 0; i < n; i++) {
              const [dx, dy] = dir(off + (i * TWO_PI) / n);
              this.eshot(e.x, e.y, dx, dy, sp * 0.75, true);
            }
            fired = true;
          }
          break;
        case 'W':
          if (every(170)) {
            this.wall(e.y + 40, sp * 0.5, this.bossRng);
            fired = true;
          }
          break;
        case 'E':
          if (every(9)) {
            const x = e.x + this.bossRng.range(-110, 110);
            this.eshot(x, e.y + 40, this.bossRng.range(-0.25, 0.25), 1, sp * 1.1);
            fired = true;
          }
          break;
      }
    }
    if (fired) this.events.push({ e: 'eshot', x: e.x, y: e.y, big: true });
  }

  private updateEBullets() {
    const out: EBullet[] = [];
    for (const b of this.ebullets) {
      b.x += b.vx;
      b.y += b.vy;
      if (b.y > -20 && b.y < HEIGHT + 20 && b.x > -20 && b.x < WIDTH + 20) out.push(b);
    }
    this.ebullets = out;
  }

  // ───────────────────────────── Items ─────────────────────────────

  private dropItem(x: number, y: number, kind?: ItemKind) {
    const k = kind ?? this.rng.weighted(ITEM_WEIGHTS);
    this.items.push({ kind: k, x, y, vx: this.rng.range(-0.6, 0.6), vy: -1.5, pulled: false, age: 0 });
    this.events.push({ e: 'drop', kind: k, x, y });
  }

  private updateItems() {
    const p = this.player;
    const out: Item[] = [];
    const r2 = this.d.magnet * this.d.magnet;
    const all = this.phase === 'clear';
    for (const it of this.items) {
      it.age++;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const d2 = dx * dx + dy * dy;
      if (it.pulled || all || d2 < r2) {
        it.pulled = true;
        const l = Math.sqrt(d2) || 1;
        const sp = Math.min(14, 5 + it.age * 0.02 + (all ? 4 : 0));
        it.vx = (dx / l) * sp;
        it.vy = (dy / l) * sp;
      } else if (it.age < ITEM_HOVER) {
        // erst kurz hochspringen, dann fast auf der Stelle schweben (zieht langsam mit dem Bild)
        it.vx *= 0.95;
        it.vy = Math.min(0.35, it.vy + 0.05);
      } else {
        // nicht eingesammelt: fällt beschleunigt nach unten weg
        it.vx *= 0.97;
        it.vy = Math.min(7, it.vy + 0.14);
      }
      it.x += it.vx;
      it.y += it.vy;
      it.x = Math.max(12, Math.min(WIDTH - 12, it.x));
      if (d2 < PICKUP_RADIUS * PICKUP_RADIUS) {
        this.pickup(it);
        continue;
      }
      if (it.y < HEIGHT + 30) out.push(it);
    }
    this.items = out;
  }

  private pickup(it: Item) {
    const p = this.player;
    let value = 0;
    switch (it.kind) {
      case 'P':
        if (p.gun < 5) {
          p.gun++;
          this.events.push({ e: 'gunUp', lvl: p.gun });
        } else {
          value = 1000;
          this.score += value;
        }
        break;
      case 'crystal':
        value = Math.round((CRYSTAL_BASE + CRYSTAL_STEP * this.sector) * this.d.creditMult * this.d.crystalMult);
        this.addCredits(value);
        break;
      case 'repair':
        value = Math.min(25, Math.floor(this.d.maxHull - p.hull));
        if (value > 0) p.hull += value;
        else {
          value = 250;
          this.score += value;
        }
        break;
      case 'shield':
        p.bubble = 300;
        break;
      case 'bomb':
        if (p.bombs < this.d.bombMax) p.bombs++;
        else {
          value = 500;
          this.score += value;
        }
        break;
    }
    this.events.push({ e: 'pickup', kind: it.kind, x: it.x, y: it.y, value });
  }

  private addCredits(n: number) {
    this.credits += n;
    this.totalCredits += n;
    this.sectorCredits += n;
  }

  // ───────────────────────────── Kollisionen ─────────────────────────────

  private collide() {
    // Spielerschüsse gegen Gegner
    const keep: Bullet[] = [];
    for (const b of this.bullets) {
      let alive = true;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (e.y < -e.ry * 0.5) continue; // erst treffbar, wenn sichtbar
        const dx = (b.x - e.x) / (e.rx + b.r);
        const dy = (b.y - e.y) / (e.ry + b.r);
        if (dx * dx + dy * dy > 1) continue;
        if (b.orb) {
          // Plasma-Orb: brennt im Takt, fliegt weiter
          if (b.life % b.orb === 0) {
            if (b.life % (b.orb * 3) === 0) this.events.push({ e: 'hit', x: e.x, y: Math.min(b.y, e.y + e.ry * 0.5) });
            this.damageEnemy(e, b.dmg * this.critAvg());
          }
          continue;
        }
        if (b.hit.includes(e.id)) continue;
        this.events.push({ e: 'hit', x: b.x, y: b.y });
        const ex = e.x;
        const ey = e.y;
        this.damageEnemy(e, b.dmg * this.crit(b.x, b.y));
        if (b.amp) b.dmg *= 1 + b.amp;
        if (b.burst) {
          this.burstRing(b, e.id);
          alive = false;
          break;
        }
        if (b.chain > 0) this.chainFrom({ ...e, x: ex, y: ey } as Enemy, b.chain, b.dmg * 0.7, [e.id]);
        if (b.split > 0) {
          // Splitter fliegen fächerförmig weiter (schaden nicht dem schon getroffenen Gegner)
          const sm = this.has('gun3') ? 1.6 : 1;
          for (let i = 0; i < b.split; i++) {
            const [dx, dy] = SPLIT_DIRS[i];
            const f: Bullet = { x: b.x, y: b.y, vx: dx * 10, vy: dy * 10, dmg: b.dmg * 0.45 * sm, r: 3, kind: b.kind === 'missile' ? 'rear' : b.kind, pierce: 0, hit: [e.id], life: 26, target: 0, speed: 0, bounce: 0, split: 0, chain: 0 };
            this.spawned.push(f);
          }
        }
        if (b.bounce > 0) {
          // Abpraller: zum nächsten noch nicht getroffenen Gegner umlenken
          b.bounce--;
          b.hit.push(e.id);
          let best: Enemy | null = null;
          let bd = 280 * 280;
          for (const o of this.enemies) {
            if (o.hp <= 0 || o.y < -o.ry * 0.5 || o.y > HEIGHT || b.hit.includes(o.id)) continue;
            const dx = o.x - b.x;
            const dy = o.y - b.y;
            const d = dx * dx + dy * dy;
            if (d < bd) {
              bd = d;
              best = o;
            }
          }
          if (best) {
            const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 14;
            const l = Math.sqrt(bd) || 1;
            b.vx = ((best.x - b.x) / l) * sp;
            b.vy = ((best.y - b.y) / l) * sp;
            b.life = Math.max(b.life, 40);
            this.events.push({ e: 'bounce', x: b.x, y: b.y });
            break;
          }
          alive = false;
          break;
        }
        if (b.pierce > 0) {
          b.pierce--;
          b.hit.push(e.id);
        } else {
          alive = false;
          break;
        }
      }
      if (alive) keep.push(b);
    }
    for (const f of this.spawned) keep.push(f);
    this.spawned.length = 0;
    this.bullets = keep;
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    const p = this.player;
    if (this.phase === 'over') return;
    // Sonnenkern: verschluckt Kugeln (jede kostet die Kugel etwas Lebenszeit)
    const eaters = this.bullets.filter((b) => b.eat);
    if (eaters.length) {
      this.ebullets = this.ebullets.filter((b) => {
        for (const o of eaters) {
          const dx = b.x - o.x;
          const dy = b.y - o.y;
          const rr = b.r + o.r;
          if (dx * dx + dy * dy > rr * rr) continue;
          o.life -= 5;
          this.events.push({ e: 'absorb', x: b.x, y: b.y });
          return false;
        }
        return true;
      });
    }
    // Gegnerkugeln gegen Spieler
    const eb: EBullet[] = [];
    const gd = this.d.grazeDist;
    let replaced = false;
    this.cleared = false;
    for (const b of this.ebullets) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const rr = b.r + this.d.hitbox;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        if (this.hurt(this.bulletDmg(b.big))) {
          // Bombe/Schockwelle/Phönix haben die Kugelliste ersetzt: dort weitermachen
          if (this.cleared) {
            replaced = true;
            break;
          }
          continue;
        }
        if (p.bubble > 0) continue; // Schild-Kapsel schluckt Kugeln
      } else if (!b.grazed && d2 < (rr + gd) * (rr + gd)) {
        b.grazed = true;
        this.graze(b);
      }
      eb.push(b);
    }
    if (!replaced) this.ebullets = eb;
    // Rammen
    for (const e of this.enemies) {
      const dx = (p.x - e.x) / (e.rx + 12);
      const dy = (p.y - e.y) / (e.ry + 12);
      if (dx * dx + dy * dy > 1) continue;
      const def = ENEMIES[e.type];
      if (this.hurt(def.ram, 'ram') && def.fragile) this.damageEnemy(e, 9999);
      else if (p.bubble > 0 && def.fragile) this.damageEnemy(e, 9999);
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
  }

  /** Streifschuss: Kugel knapp vorbei → Punkte und Streif-Leiste; voll → Bombe (oder Credits) */
  private graze(b: EBullet) {
    const p = this.player;
    if (p.invuln > 0 || p.bubble > 0 || (this.phase !== 'flight' && this.phase !== 'boss')) return;
    // schwere Kugeln zählen mehr (Punkte und Leiste), damit die Bomben-Belohnung trotz weniger Kugeln gleich häufig bleibt
    const gain = GRAZE_GAIN[b.heavy];
    const score = Math.round(20 * this.scoreMult() * gain);
    this.score += score;
    p.grazes++;
    p.graze += gain * this.d.grazeMult;
    if (this.has('pil5')) p.adren = 120;
    this.events.push({ e: 'graze', x: b.x, y: b.y, score, meter: Math.min(1, p.graze / GRAZE_FULL) });
    if (p.graze >= GRAZE_FULL) {
      p.graze = 0;
      if (p.bombs < this.d.bombMax) {
        p.bombs++;
        this.events.push({ e: 'grazeReward', kind: 'bomb', value: 1, x: p.x, y: p.y });
      } else {
        const v = Math.round((30 + 5 * this.sector) * this.d.creditMult);
        this.addCredits(v);
        this.events.push({ e: 'grazeReward', kind: 'credits', value: v, x: p.x, y: p.y });
      }
    }
  }

  /** Schaden am Spieler; true, wenn er wirkte */
  private hurt(dmg: number, cause: 'bullet' | 'ram' | 'laser' = 'bullet'): boolean {
    const p = this.player;
    if (p.invuln > 0 || p.bubble > 0 || this.phase === 'clear') return false;
    dmg = Math.max(1, Math.round(dmg * this.d.dmgTaken * this.lockMult()));
    // Schutzengel: ein tödlicher Treffer zündet stattdessen eine Bombe
    if (dmg >= p.hull + p.shield && p.bombs > 0 && !p.guardianUsed && this.has('pil6')) {
      p.guardianUsed = true;
      p.bombs--;
      p.bombCd = 40;
      p.lastHit = this.tick;
      p.hitThisSector = true;
      this.blast();
      if (p.invuln < 120) p.invuln = 120;
      this.cleared = true;
      this.events.push({ e: 'guardian' });
      return true;
    }
    let rest = dmg;
    const hadShield = p.shield > 0;
    if (p.shield > 0) {
      const s = Math.min(p.shield, rest);
      p.shield -= s;
      rest -= s;
    }
    p.hull -= rest;
    this.damageTaken += dmg;
    // erfasst: halbe Schonzeit nach dem Treffer
    const lockedNow = this.locked();
    p.invuln = lockedNow ? INVULN_HIT >> 1 : INVULN_HIT;
    p.lastHit = this.tick;
    p.hitThisSector = true;
    this.events.push({ e: 'playerHit', dmg, x: p.x, y: p.y, shield: hadShield && rest === 0, cause });
    if (p.hull <= 0) {
      if (this.has('def4') && !p.phoenixUsed) {
        p.phoenixUsed = true;
        p.hull = Math.round(this.d.maxHull / 2);
        p.invuln = 180;
        this.ebullets = [];
        this.cleared = true;
        this.events.push({ e: 'phoenix' });
      } else {
        p.hull = 0;
        this.phase = 'over';
        this.phaseT = 0;
        this.events.push({ e: 'gameOver' });
      }
    } else if (this.has('def2') && !p.emergencyUsed && !lockedNow && p.hull < this.d.maxHull * 0.25) {
      // (Notschild greift nicht, solange das Schiff erfasst ist)
      p.emergencyUsed = true;
      p.invuln = 180;
      this.events.push({ e: 'emergency' });
    }
    if (this.phase !== 'over' && this.has('def5')) {
      // Schockwelle: Kugeln in der Nähe verpuffen, etwas länger unverwundbar
      if (!lockedNow && p.invuln < INVULN_HIT + 30) p.invuln = INVULN_HIT + 30;
      this.ebullets = this.ebullets.filter((b) => {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        return dx * dx + dy * dy > SHOCK_RADIUS * SHOCK_RADIUS;
      });
      this.cleared = true;
      this.events.push({ e: 'shock', x: p.x, y: p.y });
    }
    return true;
  }

  private damageEnemy(e: Enemy, dmg: number) {
    if (e.hp <= 0) return;
    if ((e.type === 'boss' || e.type === 'frigate') && this.has('off6')) dmg *= 1.4;
    e.hp -= dmg;
    e.flash = 3;
    if (e.hp > 0) return;
    e.hp = 0;
    this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    const def = ENEMIES[e.type];
    const score = Math.round(def.score * (e.type === 'boss' ? this.sector : 1) * (e.elite ? 2 : 1) * this.scoreMult());
    this.score += score;
    const cr = e.type === 'boss' ? def.credits + 30 * this.sector : def.credits * (e.elite ? 2 : 1);
    this.addCredits(Math.round(cr * CREDIT_KILL * (1 + CREDIT_SECTOR_STEP * (this.sector - 1)) * this.d.creditMult));
    this.kills++;
    this.sectorKills++;
    this.events.push({ e: 'kill', type: e.type, x: e.x, y: e.y, r: e.rx, score });
    let dropped = false;
    if (e.type === 'boss') {
      for (let i = 0; i < 6; i++) this.dropItem(e.x + this.rng.range(-90, 90), e.y + this.rng.range(-40, 40), 'crystal');
      this.dropItem(e.x, e.y, 'repair');
      this.bossDown(e);
      return;
    }
    if (e.type === 'frigate') {
      this.dropItem(e.x - 30, e.y);
      this.dropItem(e.x + 30, e.y);
      this.dropItem(e.x, e.y, 'P');
      dropped = true;
    } else if (this.rng.chance(def.drop + (e.elite ? 0.2 : 0))) {
      this.dropItem(e.x, e.y);
      dropped = true;
    }
    if (e.type === 'mine') {
      for (let i = 0; i < 6; i++) {
        const [dx, dy] = dir(e.spin + (i * TWO_PI) / 6);
        this.eshot(e.x, e.y, dx, dy, this.bulletSpeed() * 0.7);
      }
    }
    if (e.form) {
      const f = this.forms.get(e.form);
      if (f) {
        f.left--;
        if (f.left <= 0) {
          this.forms.delete(e.form);
          if (!f.escaped && !dropped) this.dropItem(e.x, e.y);
        }
      }
    }
  }

  private bossDown(e: Enemy) {
    this.events.push({ e: 'bossDown', x: e.x, y: e.y });
    this.boss = null;
    this.ebullets = [];
    this.hazards = [];
    for (const o of this.enemies) {
      if (o !== e && o.hp > 0) {
        o.hp = 0;
        this.events.push({ e: 'kill', type: o.type, x: o.x, y: o.y, r: o.rx, score: 0 });
      }
    }
    // Sektor-Bilanz
    const p = this.player;
    const noHit = !p.hitThisSector;
    const bonus = 2000 * this.sector + (noHit ? 5000 * this.sector : 0);
    this.score += bonus;
    // Sektor-Prämie in Credits (ohne Treffer mehr)
    const prize = Math.round((PRIZE_BASE + PRIZE_STEP * this.sector) * (noHit ? PRIZE_NOHIT : 1) * this.d.creditMult);
    this.addCredits(prize);
    // Skillpunkte: 1 je Sektor, +1 ohne Treffer, +1 in jedem dritten Sektor, +1 je 100 Abschüsse
    const milestone = this.sector % MILESTONE_EVERY === 0;
    const marks = Math.floor(this.kills / KILLS_PER_POINT);
    // höchstens eine Marke je Sektor (der Rest verfällt nicht, er zählt im nächsten Sektor)
    const killPoints = marks > this.killMarks ? 1 : 0;
    this.killMarks += killPoints;
    const sp = 1 + (noHit ? 1 : 0) + (milestone ? 1 : 0) + killPoints;
    this.skillPoints += sp;
    this.lastSummary = { sector: this.sector, bonus, noHit, kills: this.sectorKills, credits: this.sectorCredits, skillPoints: sp, prize, milestone, killPoints };
    this.phase = 'clear';
    this.phaseT = 0;
    this.events.push({ e: 'sectorClear', summary: this.lastSummary });
  }

  private regen() {
    const p = this.player;
    if (p.invuln > 0) p.invuln--;
    if (p.bubble > 0) p.bubble--;
    if (p.bombCd > 0) p.bombCd--;
    if (p.adren > 0) p.adren--;
    // Schild (Härte-Update): lädt erst nach SHIELD_DELAY_S ohne Treffer, langsamer und nur, solange sich das Schiff bewegt
    const moving = p.vx !== 0 || p.vy !== 0;
    if (this.d.shieldMax > 0 && moving && this.tick - p.lastHit > SHIELD_DELAY_S * 60 && p.shield < this.d.shieldMax) {
      p.shield = Math.min(this.d.shieldMax, p.shield + (SHIELD_RATE * (this.has('def6') ? SHIELD_BULWARK : 1)) / 60);
    }
    // Hüllenreparatur (Drohnen, Naniten) ruht während der Zielerfassung
    if (this.d.regen > 0 && p.hull < this.d.maxHull && this.phase !== 'over' && !this.locked()) p.hull = Math.min(this.d.maxHull, p.hull + this.d.regen);
  }

  private enterShop() {
    this.phase = 'shop';
    this.phaseT = 0;
    this.bullets = [];
    this.ebullets = [];
    this.items = [];
    this.hazards = [];
    // Feldwerkstatt: die halbe fehlende Hülle gratis
    const p = this.player;
    if (this.has('tec5') && p.hull < this.d.maxHull) {
      const n = Math.ceil((this.d.maxHull - p.hull) / 2);
      p.hull = Math.min(this.d.maxHull, p.hull + n);
      if (this.lastSummary) this.lastSummary.repaired = n;
    }
    this.events.push({ e: 'shop' });
  }

  // ───────────────────────────── Händler ─────────────────────────────

  price(base: number): number {
    return Math.round(base * this.d.priceMult);
  }

  statPrice(id: StatId): number | null {
    const lvl = this.loadout.stats[id];
    const def = STAT_BY_ID[id];
    if (lvl >= def.max) return null;
    return this.price(def.price(lvl + 1));
  }

  repairPrice(): number {
    const missing = Math.ceil(this.d.maxHull - this.player.hull);
    return missing <= 0 ? 0 : this.price(missing * REPAIR_PER_HP);
  }

  upgradePrice(slot: SlotId): number | null {
    const m = this.loadout.slots[slot];
    if (!m || m.lvl >= MAX_WEAPON_LVL) return null;
    return this.price(WEAPON_BY_ID[m.w].up[m.lvl - 1]);
  }

  sellValue(slot: SlotId): number {
    const m = this.loadout.slots[slot];
    return m ? Math.floor(weaponValue(m.w, m.lvl) / 2) : 0;
  }

  canSkill(id: SkillId): boolean {
    if (this.skillPoints <= 0 || this.has(id)) return false;
    const def = SKILL_BY_ID[id];
    if (def.tier === 1) return true;
    return this.has(`${def.branch}${def.tier - 1}` as SkillId);
  }

  /** Kommando ausführen (nur im Shop); true bei Erfolg. Erfolgreiche Kommandos landen im Protokoll. */
  command(cmd: Command): boolean {
    if (this.phase !== 'shop') return false;
    const ok = this.apply(cmd);
    if (ok) this.actions.push({ tick: this.tick, ...cmd });
    return ok;
  }

  private pay(n: number): boolean {
    if (n > this.credits) return false;
    this.credits -= n;
    return true;
  }

  private apply(cmd: Command): boolean {
    const p = this.player;
    switch (cmd.t) {
      case 'stat': {
        if (!own(STAT_BY_ID, cmd.id)) return false;
        const pr = this.statPrice(cmd.id);
        if (pr === null || this.statLock(cmd.id) || !this.pay(pr)) return false;
        const oldMax = this.d.maxHull;
        this.loadout.stats[cmd.id]++;
        this.recalc();
        if (this.d.maxHull > oldMax) p.hull += this.d.maxHull - oldMax;
        p.shield = this.d.shieldMax;
        // Bombenschacht: jede Stufe liefert eine Bombe mit
        if (cmd.id === 'bay' && p.bombs < this.d.bombMax) p.bombs++;
        return true;
      }
      case 'weapon': {
        if (!own(WEAPON_BY_ID, cmd.w)) return false;
        const def = WEAPON_BY_ID[cmd.w];
        if (!def || !SLOTS.includes(cmd.slot) || !this.slotOpen(cmd.slot) || !slotAccepts(cmd.slot, cmd.w)) return false;
        const cur = this.loadout.slots[cmd.slot];
        if (cur && cur.w === cmd.w) return false;
        const refund = this.sellValue(cmd.slot);
        const pr = this.price(def.price);
        if (pr > this.credits + refund) return false;
        this.credits += refund;
        this.credits -= pr;
        this.loadout.slots[cmd.slot] = { w: cmd.w, lvl: 1 };
        return true;
      }
      case 'upgrade': {
        if (!SLOTS.includes(cmd.slot)) return false;
        const pr = this.upgradePrice(cmd.slot);
        if (pr === null || !this.pay(pr)) return false;
        this.loadout.slots[cmd.slot]!.lvl++;
        return true;
      }
      case 'sell': {
        if (!SLOTS.includes(cmd.slot) || !this.loadout.slots[cmd.slot]) return false;
        this.credits += this.sellValue(cmd.slot);
        this.loadout.slots[cmd.slot] = null;
        return true;
      }
      case 'repair': {
        const pr = this.repairPrice();
        if (pr <= 0) return false;
        if (this.credits >= pr) {
          this.credits -= pr;
          p.hull = this.d.maxHull;
        } else {
          // Teilreparatur mit dem vorhandenen Geld
          const hp = Math.floor(this.credits / (REPAIR_PER_HP * this.d.priceMult));
          if (hp <= 0) return false;
          this.credits -= this.price(hp * REPAIR_PER_HP);
          p.hull = Math.min(this.d.maxHull, p.hull + hp);
        }
        return true;
      }
      case 'bomb': {
        if (p.bombs >= this.d.bombMax || !this.pay(this.price(BOMB_PRICE))) return false;
        p.bombs++;
        return true;
      }
      case 'skill': {
        if (!own(SKILL_BY_ID, cmd.id) || !this.canSkill(cmd.id)) return false;
        this.skillPoints--;
        const oldMax = this.d.maxHull;
        this.loadout.skills.push(cmd.id);
        this.recalc();
        if (this.d.maxHull > oldMax) p.hull += this.d.maxHull - oldMax;
        return true;
      }
      case 'launch': {
        this.sector++;
        this.startSector();
        this.events.push({ e: 'launch', sector: this.sector });
        return true;
      }
    }
    return false;
  }

  /** Events abholen (leert die Liste) */
  drain(): SimEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  replay(): Replay {
    return { seed: this.seed, inputs: [...this.log], actions: this.actions.map((a) => ({ ...a })) };
  }
}

export { FLIGHT_TICKS };
