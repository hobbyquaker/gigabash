// Händler: Schiffswerte, Anbauwaffen, Skillbaum.

export type StatId = 'armor' | 'engine' | 'cooling' | 'caliber' | 'shield' | 'magnet' | 'cannon';

export interface StatDef {
  id: StatId;
  name: string;
  desc: string;
  icon: string;
  max: number;
  /** Preis der Stufe n (1-basiert) */
  price: (n: number) => number;
  /** Anzeige des Werts auf Stufe n */
  show: (n: number) => string;
}

export const STATS: StatDef[] = [
  { id: 'armor', name: 'Panzerung', icon: 'armor', desc: 'Mehr maximale Hülle', max: 6, price: (n) => 120 * n, show: (n) => `${100 + 20 * n} Hülle` },
  { id: 'engine', name: 'Antrieb', icon: 'engine', desc: 'Schneller fliegen', max: 5, price: (n) => 100 * n, show: (n) => `${300 + 30 * n} km/s` },
  { id: 'cooling', name: 'Kühlung', icon: 'cooling', desc: 'Alle Waffen feuern schneller', max: 5, price: (n) => 140 * n, show: (n) => `+${10 * n} % Feuerrate` },
  { id: 'caliber', name: 'Kaliber', icon: 'caliber', desc: 'Alle Waffen treffen härter', max: 5, price: (n) => 160 * n, show: (n) => `+${12 * n} % Schaden` },
  { id: 'shield', name: 'Schildgenerator', icon: 'shield', desc: 'Schild lädt sich nach 3 s ohne Treffer auf', max: 3, price: (n) => 250 * n, show: (n) => `${20 * n} Schild` },
  { id: 'magnet', name: 'Magnet', icon: 'magnet', desc: 'Größerer Sammelradius', max: 3, price: (n) => 80 * n, show: (n) => `${40 + 30 * n} m Radius` },
  { id: 'cannon', name: 'Bordkanone', icon: 'cannon', desc: 'Höhere Start-Waffenstufe in jedem Sektor', max: 3, price: (n) => 300 * n, show: (n) => `Start-Stufe ${1 + n}` },
];

export const STAT_BY_ID = Object.fromEntries(STATS.map((s) => [s.id, s])) as Record<StatId, StatDef>;

export type SlotId = 'wingL' | 'wingR' | 'core';
export const SLOTS: SlotId[] = ['wingL', 'wingR', 'core'];
export const SLOT_NAMES: Record<SlotId, string> = { wingL: 'Flügel links', wingR: 'Flügel rechts', core: 'Rumpf' };

export type WeaponId = 'side' | 'spread' | 'missile' | 'laser' | 'rear' | 'drone';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  place: 'wing' | 'core';
  desc: string;
  price: number;
  /** Preise für Stufe 2 und 3 */
  up: [number, number];
}

export const WEAPONS: WeaponDef[] = [
  { id: 'side', name: 'Seitenkanone', place: 'wing', price: 220, up: [180, 320], desc: 'Gerader Schuss. Stufe 3: Doppelschuss.' },
  { id: 'spread', name: 'Streukanone', place: 'wing', price: 260, up: [200, 360], desc: 'Zwei Schüsse schräg nach außen.' },
  { id: 'missile', name: 'Zielsuchrakete', place: 'wing', price: 420, up: [300, 500], desc: 'Lenkt sich selbst ins Ziel. Hoher Schaden.' },
  { id: 'laser', name: 'Pulslaser', place: 'core', price: 480, up: [350, 550], desc: 'Bolzen durchschlägt bis zu 3 Gegner.' },
  { id: 'rear', name: 'Heckkanone', place: 'core', price: 300, up: [220, 380], desc: 'Schießt nach hinten und schräg zur Seite.' },
  { id: 'drone', name: 'Begleitdrohne', place: 'core', price: 520, up: [380, 600], desc: 'Kreist ums Schiff und zielt selbst. Stufe 3: zwei Drohnen.' },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<WeaponId, WeaponDef>;

export function slotAccepts(slot: SlotId, w: WeaponId): boolean {
  return WEAPON_BY_ID[w].place === (slot === 'core' ? 'core' : 'wing');
}

/** Gesamtwert einer eingebauten Waffe (für den Verkauf: 50 % davon) */
export function weaponValue(w: WeaponId, lvl: number): number {
  const d = WEAPON_BY_ID[w];
  let v = d.price;
  if (lvl >= 2) v += d.up[0];
  if (lvl >= 3) v += d.up[1];
  return v;
}

export const BOMB_PRICE = 150;
export const REPAIR_PER_HP = 2;

export type SkillId =
  | 'off1' | 'off2' | 'off3' | 'off4'
  | 'def1' | 'def2' | 'def3' | 'def4'
  | 'tec1' | 'tec2' | 'tec3' | 'tec4';

export interface SkillDef {
  id: SkillId;
  branch: 'off' | 'def' | 'tec';
  tier: number;
  name: string;
  desc: string;
}

export const BRANCH_NAMES = { off: 'Feuerkraft', def: 'Verteidigung', tec: 'Technik' } as const;

export const SKILLS: SkillDef[] = [
  { id: 'off1', branch: 'off', tier: 1, name: 'Zielwasser', desc: '+10 % Schaden' },
  { id: 'off2', branch: 'off', tier: 2, name: 'Schnellfeuer', desc: '+10 % Feuerrate' },
  { id: 'off3', branch: 'off', tier: 3, name: 'Durchschlag', desc: 'Bordkanone durchschlägt einen Gegner' },
  { id: 'off4', branch: 'off', tier: 4, name: 'Überladung', desc: '+1 Start-Waffenstufe' },
  { id: 'def1', branch: 'def', tier: 1, name: 'Verstärkung', desc: '+20 maximale Hülle' },
  { id: 'def2', branch: 'def', tier: 2, name: 'Notschild', desc: 'Einmal je Sektor: unter 25 % Hülle 3 s unverwundbar' },
  { id: 'def3', branch: 'def', tier: 3, name: 'Naniten', desc: 'Hülle repariert sich (1 pro Sekunde)' },
  { id: 'def4', branch: 'def', tier: 4, name: 'Phönix', desc: 'Einmal pro Spiel: Wiederbelebung mit halber Hülle' },
  { id: 'tec1', branch: 'tec', tier: 1, name: 'Traktorstrahl', desc: '+40 m Sammelradius' },
  { id: 'tec2', branch: 'tec', tier: 2, name: 'Feilschen', desc: '−10 % auf alle Preise beim Händler' },
  { id: 'tec3', branch: 'tec', tier: 3, name: 'Kristallnase', desc: '+25 % Credits' },
  { id: 'tec4', branch: 'tec', tier: 4, name: 'Bombenschacht', desc: '+1 Bomben-Vorrat, jeder Sektor startet mit mindestens einer Bombe' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
