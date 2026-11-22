import type { EnemyType, ItemKind, MoveKind } from '../data/enemies';
import type { SkillId, SlotId, StatId, WeaponId } from '../data/shop';

/** Eingabe pro Tick. mx/my ∈ [−100, 100] = Anteil der Höchstgeschwindigkeit */
export interface Input {
  mx: number;
  my: number;
  bomb: boolean;
}

export const NO_INPUT: Input = { mx: 0, my: 0, bomb: false };

export type Command =
  | { t: 'stat'; id: StatId }
  | { t: 'weapon'; slot: SlotId; w: WeaponId }
  | { t: 'upgrade'; slot: SlotId }
  | { t: 'sell'; slot: SlotId }
  | { t: 'repair' }
  | { t: 'bomb' }
  | { t: 'skill'; id: SkillId }
  | { t: 'launch' };

export type Phase = 'intro' | 'flight' | 'boss' | 'clear' | 'shop' | 'over';

export type PlayerWeapon = 'main' | WeaponId;

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  kind: PlayerWeapon;
  /** so viele Gegner darf das Projektil noch durchschlagen */
  pierce: number;
  hit: number[];
  life: number;
  /** Rakete: Ziel-ID, Tempo */
  target: number;
  speed: number;
  /** Abpraller: so oft springt das Geschoss nach einem Treffer zum nächsten Gegner */
  bounce: number;
  /** zerplatzt beim Treffer in so viele Splitter */
  split: number;
  /** Treffer springt als Blitz auf so viele Nachbarn über */
  chain: number;
  /** Flak: zerplatzt beim Treffer oder am Ende der Flugbahn in einen Ring aus so vielen Splittern (pierce der Splitter: burstPierce) */
  burst?: number;
  burstPierce?: number;
  /** Plasma-Orb: schadet überlappenden Gegnern alle `orb` Ticks und fliegt weiter */
  orb?: number;
  /** Sonnenkern: verschluckt gegnerische Kugeln */
  eat?: boolean;
  /** Tachyonlanze: Schaden wächst je Durchschlag um diesen Anteil */
  amp?: number;
}

export interface EBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  big: boolean;
  /** Schadensstufe 0–3 („schwere Kugeln“ ab Sektor 5: weniger Kugeln, mehr Schaden; der Renderer zeichnet sie größer) */
  heavy: number;
  /** Streifschuss schon gewertet */
  grazed: boolean;
}

/**
 * Sperrfeuer: Streifen über die ganze Höhe ('col', Mitte x) oder Breite ('row', Mitte y) mit halber Breite w.
 * Erst Vorwarnung (t < warn), dann für dur Ticks ein Laservorhang, der beim Berühren Schaden macht.
 */
export interface Hazard {
  kind: 'col' | 'row';
  x: number;
  y: number;
  w: number;
  t: number;
  warn: number;
  dur: number;
  /** hat den Spieler schon getroffen (höchstens einmal) */
  hit: boolean;
}

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Startposition (Sinus) */
  x0: number;
  move: MoveKind;
  p: number[];
  hp: number;
  maxHp: number;
  rx: number;
  ry: number;
  age: number;
  fireT: number;
  /** Salve: noch ausstehende Schüsse */
  burst: number;
  form: number;
  /** Treffer-Aufblitzen (Ticks) */
  flash: number;
  /** Drehwinkel für den Renderer (Kreisel) */
  spin: number;
  /** Elite-Variante (ab Sektor 3): golden, mehr HP, aggressiver */
  elite: boolean;
  /** Zahl der bisherigen Salven (Muster-Wechsel) */
  shots: number;
}

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pulled: boolean;
  age: number;
}

export interface Mount {
  w: WeaponId;
  lvl: number;
}

export interface Loadout {
  stats: Record<StatId, number>;
  slots: Record<SlotId, Mount | null>;
  skills: SkillId[];
}

export interface SectorSummary {
  sector: number;
  bonus: number;
  noHit: boolean;
  kills: number;
  credits: number;
  skillPoints: number;
  /** Sektor-Prämie in Credits (in `credits` enthalten) */
  prize?: number;
  /** Zusatz-Skillpunkte: Meilenstein (jeder 3. Sektor) und Abschuss-Marken (je 100 Abschüsse) */
  milestone?: boolean;
  killPoints?: number;
  /** Feldwerkstatt: gratis reparierte Hülle */
  repaired?: number;
}

export type SimEvent =
  | { e: 'shot'; w: PlayerWeapon; x: number; y: number; slot?: SlotId }
  | { e: 'eshot'; x: number; y: number; big: boolean }
  | { e: 'hit'; x: number; y: number }
  | { e: 'kill'; type: EnemyType; x: number; y: number; r: number; score: number }
  | { e: 'drop'; kind: ItemKind; x: number; y: number }
  | { e: 'pickup'; kind: ItemKind; x: number; y: number; value: number }
  | { e: 'playerHit'; dmg: number; x: number; y: number; shield: boolean; cause: 'bullet' | 'ram' | 'laser' }
  | { e: 'bomb'; x: number; y: number }
  | { e: 'bossSpawn' }
  | { e: 'bossPhase'; phase: number }
  | { e: 'bossDown'; x: number; y: number }
  /** Bosskampf dauert zu lange: der Endgegner trifft ab jetzt immer härter */
  | { e: 'bossRage' }
  | { e: 'frigate' }
  | { e: 'sectorClear'; summary: SectorSummary }
  | { e: 'shop' }
  | { e: 'launch'; sector: number }
  | { e: 'gameOver' }
  | { e: 'phoenix' }
  | { e: 'emergency' }
  /** kritischer Treffer (Zielcomputer) */
  | { e: 'crit'; x: number; y: number }
  /** Schockwelle (Skill): Treffer löscht Kugeln in der Nähe */
  | { e: 'shock'; x: number; y: number }
  /** Schutzengel (Skill): tödlicher Treffer zündet eine Bombe */
  | { e: 'guardian' }
  /** Sonnenkern verschluckt eine Kugel */
  | { e: 'absorb'; x: number; y: number }
  /** Flak-Granate zerplatzt */
  | { e: 'burst'; x: number; y: number }
  | { e: 'gunUp'; lvl: number }
  /** Blitzbogen: Zickzack-Punkte [x0, y0, x1, y1, …] vom Schiff über die getroffenen Gegner */
  | { e: 'arc'; pts: number[] }
  /** Geschoss prallt von einem Gegner zum nächsten ab */
  | { e: 'bounce'; x: number; y: number }
  /** Sperrfeuer: Vorwarnung beginnt / Laser zündet */
  | { e: 'hazardWarn'; kind: 'col' | 'row'; x: number; y: number }
  | { e: 'hazardFire'; kind: 'col' | 'row'; x: number; y: number }
  /** Spieler stand zu lange still: Scharfschütze rückt an */
  | { e: 'sniper'; x: number; y: number }
  /** Zielerfassung: Spieler steht seit 3 s still (Treffer kosten mehr, Reparatur ruht) */
  | { e: 'locked'; x: number; y: number }
  /** Kugel knapp vorbei: Punkte, Streif-Leiste (0..1) */
  | { e: 'graze'; x: number; y: number; score: number; meter: number }
  /** Streif-Leiste voll: Bombe oder Credits */
  | { e: 'grazeReward'; kind: 'bomb' | 'credits'; value: number; x: number; y: number };

/** Strahllaser eines Steckplatzes in diesem Tick (nur für den Renderer) */
export interface Beam {
  x: number;
  /** Start (Mündung) und Ende (Treffer oder oberer Rand) */
  y0: number;
  y1: number;
  /** halbe Strahlbreite */
  w: number;
  lvl: number;
  /** trifft gerade etwas */
  hit: boolean;
}

export interface Replay {
  seed: number;
  /** lauflängenkodiert: [anzahl, mx, my, flags, …] */
  inputs: number[];
  actions: ({ tick: number } & Command)[];
}

export interface RunStats {
  score: number;
  sector: number;
  kills: number;
  ticks: number;
  credits: number;
}
