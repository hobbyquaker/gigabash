// Gegnertypen (Werte für Sektor 1, Skalierung in sim.ts).

export type EnemyType = 'swarmer' | 'hunter' | 'spinner' | 'kamikaze' | 'mine' | 'bomber' | 'turret' | 'frigate' | 'boss';

export type FireKind = 'none' | 'aimed' | 'ring' | 'fan' | 'salvo' | 'boss';

export interface EnemyDef {
  name: string;
  hp: number;
  r: number;
  score: number;
  credits: number;
  drop: number;
  fire: FireKind;
  /** Feuerabstand in Ticks (Sektor 1) */
  interval: number;
  /** Kollisionsschaden am Spieler */
  ram: number;
  /** Bei Kollision zerstört (kleine Gegner) */
  fragile: boolean;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  swarmer: { name: 'Schwärmer', hp: 10, r: 14, score: 50, credits: 2, drop: 0.05, fire: 'aimed', interval: 260, ram: 15, fragile: true },
  hunter: { name: 'Jäger', hp: 26, r: 18, score: 120, credits: 4, drop: 0.12, fire: 'aimed', interval: 55, ram: 15, fragile: true },
  spinner: { name: 'Kreisel', hp: 45, r: 20, score: 200, credits: 6, drop: 0.2, fire: 'ring', interval: 95, ram: 25, fragile: false },
  kamikaze: { name: 'Kamikaze', hp: 18, r: 15, score: 150, credits: 4, drop: 0.1, fire: 'none', interval: 999, ram: 20, fragile: true },
  mine: { name: 'Mine', hp: 30, r: 16, score: 100, credits: 3, drop: 0.1, fire: 'none', interval: 999, ram: 25, fragile: true },
  bomber: { name: 'Bomber', hp: 160, r: 30, score: 600, credits: 15, drop: 0.6, fire: 'fan', interval: 75, ram: 25, fragile: false },
  turret: { name: 'Geschützturm', hp: 70, r: 22, score: 300, credits: 8, drop: 0.25, fire: 'salvo', interval: 95, ram: 25, fragile: false },
  frigate: { name: 'Fregatte', hp: 900, r: 44, score: 2500, credits: 60, drop: 1, fire: 'fan', interval: 60, ram: 30, fragile: false },
  boss: { name: 'Endgegner', hp: 6000, r: 70, score: 10000, credits: 100, drop: 0, fire: 'boss', interval: 1, ram: 30, fragile: false },
};

/** Bewegungsarten. Parameter je nach Art, siehe sim.ts moveEnemy(). */
export type MoveKind = 'line' | 'sine' | 'arc' | 'stop' | 'homing' | 'drift' | 'pendulum' | 'boss';

export type ItemKind = 'P' | 'crystal' | 'repair' | 'shield' | 'bomb';

export const ITEM_WEIGHTS: { w: number; v: ItemKind }[] = [
  { w: 24, v: 'P' },
  { w: 42, v: 'crystal' },
  { w: 16, v: 'repair' },
  { w: 10, v: 'shield' },
  { w: 6, v: 'bomb' },
];

export const ITEM_NAMES: Record<ItemKind, string> = {
  P: 'Waffenstufe',
  crystal: 'Kristall',
  repair: 'Reparatur',
  shield: 'Schild',
  bomb: 'Bombe',
};
