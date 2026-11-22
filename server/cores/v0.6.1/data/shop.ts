// Händler: Schiffswerte, Anbauwaffen, Skillbaum.

export type StatId = 'armor' | 'engine' | 'cooling' | 'caliber' | 'shield' | 'magnet' | 'cannon' | 'rig' | 'overdrive';

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
  { id: 'overdrive', name: 'Overdrive', icon: 'overdrive', desc: 'Reaktor übertakten: +5 % Schaden und +3 % Feuerrate je Stufe – ohne Obergrenze', max: 999, price: (n) => 500 + 250 * (n - 1), show: (n) => `+${5 * n} % / +${3 * n} %` },
  { id: 'rig', name: 'Ausleger', icon: 'rig', desc: 'Breite Ausleger: zwei zusätzliche Flügel-Steckplätze außen', max: 1, price: () => 600, show: (n) => `${n ? 5 : 3} Steckplätze` },
];

export const STAT_BY_ID = Object.fromEntries(STATS.map((s) => [s.id, s])) as Record<StatId, StatDef>;

export type SlotId = 'wingL' | 'wingR' | 'core' | 'wingL2' | 'wingR2';
/** Reihenfolge = Feuerreihenfolge der Sim (die äußeren Ausleger-Plätze hinten, damit alte Abläufe gleich bleiben) */
export const SLOTS: SlotId[] = ['wingL', 'wingR', 'core', 'wingL2', 'wingR2'];
/** Plätze, die erst der Ausleger (Schiffswert „rig“) freischaltet */
export const OUTER_SLOTS: SlotId[] = ['wingL2', 'wingR2'];
/** seitlicher Versatz (Abschusspunkt) je Stufe: größere Pods sitzen weiter außen, ab Stufe 3 auf einem Träger */
const WING_OX = [0, 24, 28, 40, 44, 48];
const OUTER_OX = [0, 68, 72, 84, 88, 94];
export function slotOffset(slot: SlotId, lvl: number): number {
  if (slot === 'core') return 0;
  const l = lvl < 1 ? 1 : lvl > MAX_WEAPON_LVL ? MAX_WEAPON_LVL : lvl;
  const ox = OUTER_SLOTS.includes(slot) ? OUTER_OX[l] : WING_OX[l];
  return slot === 'wingL' || slot === 'wingL2' ? -ox : ox;
}
export const SLOT_NAMES: Record<SlotId, string> = {
  wingL: 'Flügel links', wingR: 'Flügel rechts', core: 'Rumpf', wingL2: 'Ausleger links', wingR2: 'Ausleger rechts',
};

export type WeaponId = 'side' | 'spread' | 'missile' | 'pulse' | 'beam' | 'laser' | 'rear' | 'drone' | 'arc';

/** höchste Waffenstufe; Stufe 5 ist die Evolution mit eigenem Namen */
export const MAX_WEAPON_LVL = 5;

export interface WeaponDef {
  id: WeaponId;
  name: string;
  place: 'wing' | 'core';
  desc: string;
  price: number;
  /** Preise für Stufe 2, 3, 4 und 5 */
  up: [number, number, number, number];
  /** was Stufe 4 bringt */
  lvl4: string;
  /** Evolution auf Stufe 5: Name und Wirkung */
  evo: string;
  evoDesc: string;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'pulse', name: 'Impulsblaster', place: 'wing', price: 140, up: [130, 240, 420, 700], desc: 'Günstig und schnell: kleine Schüsse im Dauerfeuer. Stufe 3: zwei Läufe.',
    lvl4: 'Drei Läufe.', evo: 'Querschläger', evoDesc: 'Jeder Schuss prallt auf zwei weitere Gegner ab.' },
  { id: 'side', name: 'Seitenkanone', place: 'wing', price: 180, up: [180, 320, 560, 900], desc: 'Gerader Schuss. Stufe 3: Doppelschuss.',
    lvl4: 'Dreifachschuss, etwas schneller.', evo: 'Gatling-Batterie', evoDesc: 'Drei Läufe im rasenden Dauerfeuer.' },
  { id: 'spread', name: 'Streukanone', place: 'wing', price: 260, up: [200, 360, 620, 950], desc: 'Zwei Schüsse schräg nach außen.',
    lvl4: 'Vier Schüsse im Fächer.', evo: 'Splitterkanone', evoDesc: 'Schüsse zerplatzen beim Treffer in drei Splitter.' },
  { id: 'missile', name: 'Zielsuchrakete', place: 'wing', price: 420, up: [300, 500, 850, 1300], desc: 'Lenkt sich selbst ins Ziel. Hoher Schaden.',
    lvl4: 'Zwei Raketen pro Salve.', evo: 'Raketenschwarm', evoDesc: 'Drei Raketen, die beim Einschlag Splitter versprühen.' },
  { id: 'beam', name: 'Strahllaser', place: 'wing', price: 380, up: [300, 480, 820, 1250], desc: 'Dauerstrahl nach oben, trifft sofort. Stufe 3: breiter Strahl durch alle Gegner.',
    lvl4: 'Breiter und stärker.', evo: 'Todesstrahl', evoDesc: 'Von getroffenen Gegnern springen Kettenblitze auf Nachbarn über.' },
  { id: 'laser', name: 'Pulslaser', place: 'core', price: 480, up: [350, 550, 900, 1400], desc: 'Bolzen durchschlägt bis zu 3 Gegner.',
    lvl4: 'Durchschlägt 4 Gegner, feuert schneller.', evo: 'Prismalanze', evoDesc: 'Zwei Bolzen, die viermal von Gegner zu Gegner abprallen.' },
  { id: 'rear', name: 'Heckkanone', place: 'core', price: 300, up: [220, 380, 650, 1000], desc: 'Schießt nach hinten und schräg zur Seite.',
    lvl4: 'Mehr Schaden, schneller.', evo: 'Igel', evoDesc: 'Feuert in alle Richtungen, jeder Schuss prallt einmal ab.' },
  { id: 'drone', name: 'Begleitdrohne', place: 'core', price: 520, up: [380, 600, 1000, 1500], desc: 'Kreist ums Schiff und zielt selbst. Stufe 3: zwei Drohnen.',
    lvl4: 'Schneller und stärker.', evo: 'Drohnenschwarm', evoDesc: 'Drei Drohnen, ihre Treffer springen als Blitz weiter.' },
  { id: 'arc', name: 'Blitzbogen', place: 'core', price: 400, up: [300, 480, 820, 1250], desc: 'Blitz springt auf den nächsten Gegner und weiter auf 1/2/3 Nachbarn.',
    lvl4: 'Springt auf 4 Nachbarn.', evo: 'Gewittersturm', evoDesc: 'Fünf Sprünge, dazu gabelt sich ein zweiter Blitz.' },
];

/** Anzeigename einer Waffe auf ihrer Stufe (Stufe 5: Evolution) */
export function weaponName(w: WeaponId, lvl: number): string {
  const d = WEAPON_BY_ID[w];
  return lvl >= MAX_WEAPON_LVL ? d.evo : d.name;
}

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<WeaponId, WeaponDef>;

export function slotAccepts(slot: SlotId, w: WeaponId): boolean {
  return WEAPON_BY_ID[w].place === (slot === 'core' ? 'core' : 'wing');
}

/** Gesamtwert einer eingebauten Waffe (für den Verkauf: 50 % davon) */
export function weaponValue(w: WeaponId, lvl: number): number {
  const d = WEAPON_BY_ID[w];
  let v = d.price;
  for (let l = 2; l <= lvl && l <= MAX_WEAPON_LVL; l++) v += d.up[l - 2];
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
