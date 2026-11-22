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
}

export interface EBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  big: boolean;
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
}

export type SimEvent =
  | { e: 'shot'; w: PlayerWeapon; x: number; y: number }
  | { e: 'eshot'; x: number; y: number; big: boolean }
  | { e: 'hit'; x: number; y: number }
  | { e: 'kill'; type: EnemyType; x: number; y: number; r: number; score: number }
  | { e: 'drop'; kind: ItemKind; x: number; y: number }
  | { e: 'pickup'; kind: ItemKind; x: number; y: number; value: number }
  | { e: 'playerHit'; dmg: number; x: number; y: number; shield: boolean }
  | { e: 'bomb'; x: number; y: number }
  | { e: 'bossSpawn' }
  | { e: 'bossPhase'; phase: number }
  | { e: 'bossDown'; x: number; y: number }
  | { e: 'frigate' }
  | { e: 'sectorClear'; summary: SectorSummary }
  | { e: 'shop' }
  | { e: 'launch'; sector: number }
  | { e: 'gameOver' }
  | { e: 'phoenix' }
  | { e: 'emergency' }
  | { e: 'gunUp'; lvl: number };

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
