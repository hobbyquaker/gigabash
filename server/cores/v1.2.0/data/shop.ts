// Händler: Schiffswerte, Anbauwaffen, Skillbaum.

export type StatId =
  | 'armor' | 'engine' | 'cooling' | 'caliber' | 'shield' | 'magnet' | 'cannon' | 'rig' | 'overdrive'
  | 'regen' | 'plating' | 'bay' | 'crit' | 'salvage' | 'grazer' | 'cls';

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

/** Schadensminderung je Stufe „Reaktivpanzer“ */
export const PLATING_STEP = 0.06;
/** Hüllenreparatur (Punkte pro Sekunde) je Stufe „Reparaturdrohnen“ */
export const REGEN_STEP = 0.5;
/** Chance auf kritische Treffer je Stufe „Zielcomputer“ */
export const CRIT_STEP = 0.05;
/** Credits-Zuschlag je Stufe „Bergungsvertrag“ */
export const SALVAGE_STEP = 0.1;

/**
 * Schiffsklassen (Endspiel): 0 Jäger, 1 Kreuzer (ab Sektor 20), 2 Schlachtschiff (ab Sektor 30).
 * Größerer Rumpf mit mehr Hülle und Grundschild, zusätzliche Bordkanonen-Läufe und Geschütztürme, weitere
 * Rumpf-Steckplätze, weniger Schaden je Treffer – dafür eine etwas größere Trefferzone.
 */
export interface ShipClass {
  name: string;
  /** frühester Sektor, vor dessen Start die Klasse beim Händler zu haben ist */
  sector: number;
  price: number;
  hull: number;
  shield: number;
  /** Zuschlag auf den Radius der Trefferzone (px) */
  hitbox: number;
  /** Faktor auf den Schaden der Bordkanone */
  gunDmg: number;
  /** Feuerleitzentrale: Faktor auf den Schaden aller Waffen */
  dmgMult: number;
  /** zusätzliche Läufe der Bordkanone: [x-Versatz, Winkel in Grad] */
  guns: [number, number][];
  /** selbst zielende Geschütztürme: [x, y] relativ zur Schiffsmitte */
  turrets: [number, number][];
  turretDmg: number;
  /** Faktor auf erlittenen Schaden (Panzergürtel) */
  dmgTaken: number;
  /** Bomben, die zu jedem Sektorstart nachgeladen werden */
  bombs: number;
  /** Flügel-Steckplätze rücken so weit nach außen (px), Rumpf-Aufsatz nach vorn */
  wingShift: number;
  noseShift: number;
  /** Größe des Rumpfs gegenüber dem Jäger (Grafik) */
  scale: number;
  desc: string;
}
export const SHIP_CLASSES: ShipClass[] = [
  { name: 'Jäger', sector: 1, price: 0, hull: 0, shield: 0, hitbox: 0, gunDmg: 1, dmgMult: 1, guns: [], turrets: [], turretDmg: 0, dmgTaken: 1, bombs: 0, wingShift: 0, noseShift: 0, scale: 1, desc: '' },
  { name: 'Kreuzer', sector: 20, price: 9000, hull: 120, shield: 40, hitbox: 2, gunDmg: 1.5, dmgMult: 1.2, guns: [[-21, 0], [21, 0]], turrets: [[-17, 14], [17, 14]], turretDmg: 14,
    dmgTaken: 0.9, bombs: 0, wingShift: 9, noseShift: 9, scale: 1.3,
    desc: '+120 Hülle, +40 Schild, Bordkanone +2 Läufe und +50 % Schaden, 2 Geschütztürme, zweiter Rumpf-Steckplatz, Feuerleitzentrale (alle Waffen +20 % Schaden), 10 % weniger Schaden je Treffer. Etwas größere Trefferzone.' },
  { name: 'Schlachtschiff', sector: 30, price: 24000, hull: 500, shield: 200, hitbox: 4, gunDmg: 2, dmgMult: 2, guns: [[-24, 0], [24, 0], [-34, -5], [34, 5]], turrets: [[-21, -8], [21, -8], [-25, 28], [25, 28]], turretDmg: 18,
    dmgTaken: 0.7, bombs: 1, wingShift: 20, noseShift: 18, scale: 1.62,
    desc: '+500 Hülle, +200 Schild, Bordkanone +4 Läufe und doppelter Schaden, 4 Geschütztürme, dritter Rumpf-Steckplatz, große Feuerleitzentrale (alle Waffen doppelter Schaden), 30 % weniger Schaden je Treffer, jeder Sektor bringt eine Bombe. Größere Trefferzone.' },
];
export const MAX_CLASS = SHIP_CLASSES.length - 1;
export const shipClass = (cls: number | undefined): ShipClass => SHIP_CLASSES[cls && cls > 0 ? (cls > MAX_CLASS ? MAX_CLASS : cls) : 0];

export const STATS: StatDef[] = [
  { id: 'armor', name: 'Panzerung', icon: 'armor', desc: 'Mehr maximale Hülle', max: 10, price: (n) => 90 * n, show: (n) => `${100 + 20 * n} Hülle` },
  { id: 'regen', name: 'Reparaturdrohnen', icon: 'regen', desc: 'Flicken die Hülle im Flug – in jedem Sektor aufs Neue', max: 5, price: (n) => 130 * n, show: (n) => (n ? `+${(REGEN_STEP * n).toLocaleString('de-DE')} Hülle/s` : 'aus') },
  { id: 'plating', name: 'Reaktivpanzer', icon: 'plating', desc: 'Jeder Treffer kostet weniger Hülle', max: 5, price: (n) => 150 * n, show: (n) => `−${Math.round(PLATING_STEP * 100 * n)} % Schaden` },
  { id: 'shield', name: 'Schildgenerator', icon: 'shield', desc: 'Schild lädt sich nach 3 s ohne Treffer auf', max: 6, price: (n) => 200 * n, show: (n) => `${20 * n} Schild` },
  { id: 'engine', name: 'Antrieb', icon: 'engine', desc: 'Schneller fliegen', max: 5, price: (n) => 100 * n, show: (n) => `${300 + 30 * n} km/s` },
  { id: 'cooling', name: 'Kühlung', icon: 'cooling', desc: 'Alle Waffen feuern schneller', max: 8, price: (n) => 140 * n, show: (n) => `+${10 * n} % Feuerrate` },
  { id: 'caliber', name: 'Kaliber', icon: 'caliber', desc: 'Alle Waffen treffen härter', max: 8, price: (n) => 160 * n, show: (n) => `+${12 * n} % Schaden` },
  { id: 'crit', name: 'Zielcomputer', icon: 'crit', desc: 'Kritische Treffer: doppelter Schaden', max: 5, price: (n) => 220 * n, show: (n) => `${Math.round(CRIT_STEP * 100 * n)} % Chance` },
  { id: 'cannon', name: 'Bordkanone', icon: 'cannon', desc: 'Höhere Start-Waffenstufe in jedem Sektor', max: 3, price: (n) => 300 * n, show: (n) => `Start-Stufe ${1 + n}` },
  { id: 'magnet', name: 'Magnet', icon: 'magnet', desc: 'Größerer Sammelradius', max: 4, price: (n) => 80 * n, show: (n) => `${40 + 30 * n} m Radius` },
  { id: 'salvage', name: 'Bergungsvertrag', icon: 'salvage', desc: 'Mehr Credits für Abschüsse, Kristalle und Sektor-Prämien', max: 5, price: (n) => 180 * n, show: (n) => `+${Math.round(SALVAGE_STEP * 100 * n)} % Credits` },
  { id: 'bay', name: 'Bombenschacht', icon: 'bay', desc: 'Mehr Platz für Smartbomben; jede Stufe liefert eine Bombe mit', max: 3, price: (n) => 250 * n, show: (n) => `${3 + n} Bomben` },
  { id: 'grazer', name: 'Streif-Verstärker', icon: 'grazer', desc: 'Streifschüsse zählen aus größerem Abstand und füllen die Bomben-Leiste schneller', max: 3, price: (n) => 200 * n, show: (n) => `+${30 * n} % Leiste` },
  { id: 'overdrive', name: 'Overdrive', icon: 'overdrive', desc: 'Reaktor übertakten: +5 % Schaden und +3 % Feuerrate je Stufe – ohne Obergrenze', max: 999, price: (n) => 500 + 250 * (n - 1) + 30 * (n - 1) * (n - 1), show: (n) => `+${5 * n} % / +${3 * n} %` },
  { id: 'cls', name: 'Schiffsklasse', icon: 'cls', desc: 'Größeres Schiff fürs Endspiel: Kreuzer ab Sektor 20, Schlachtschiff ab Sektor 30', max: MAX_CLASS, price: (n) => shipClass(n).price, show: (n) => shipClass(n).name },
  { id: 'rig', name: 'Ausleger', icon: 'rig', desc: 'Breite Ausleger: je Stufe zwei zusätzliche Flügel-Steckplätze weiter außen', max: 2, price: (n) => (n <= 1 ? 600 : 2400), show: (n) => `${3 + 2 * n} Steckplätze` },
];

export const STAT_BY_ID = Object.fromEntries(STATS.map((s) => [s.id, s])) as Record<StatId, StatDef>;

export type SlotId = 'wingL' | 'wingR' | 'core' | 'wingL2' | 'wingR2' | 'wingL3' | 'wingR3' | 'core2' | 'core3';
/** Reihenfolge = Feuerreihenfolge der Sim (die äußeren Ausleger-Plätze hinten, damit alte Abläufe gleich bleiben) */
export const SLOTS: SlotId[] = ['wingL', 'wingR', 'core', 'wingL2', 'wingR2', 'wingL3', 'wingR3', 'core2', 'core3'];
/** Rumpf-Steckplätze (core2/core3 erst mit Kreuzer bzw. Schlachtschiff) */
export const CORE_SLOTS: SlotId[] = ['core', 'core2', 'core3'];
/** nötige Schiffsklasse je Steckplatz */
export function slotClass(slot: SlotId): number {
  return slot === 'core3' ? 2 : slot === 'core2' ? 1 : 0;
}
/** Längs-Versatz der Rumpf-Steckplätze (px, negativ = Richtung Bug) je Schiffsklasse */
export function slotY(slot: SlotId, cls = 0): number {
  const c = shipClass(cls);
  if (slot === 'core') return -c.noseShift;
  if (slot === 'core2') return cls >= 2 ? 6 : 16;
  if (slot === 'core3') return 30;
  return 0;
}
/** Bahnradius der Begleitdrohnen je Rumpf-Steckplatz */
export function droneRadius(slot: SlotId, cls = 0): number {
  return 46 + (cls > 0 ? 8 * cls : 0) + (slot === 'core2' ? 20 : slot === 'core3' ? 40 : 0);
}
/** Plätze, die erst der Ausleger (Schiffswert „rig“) freischaltet */
export const OUTER_SLOTS: SlotId[] = ['wingL2', 'wingR2'];
/** Plätze der zweiten Ausleger-Stufe (noch weiter außen) */
export const OUTER2_SLOTS: SlotId[] = ['wingL3', 'wingR3'];
/** nötige Ausleger-Stufe je Steckplatz */
export function slotRig(slot: SlotId): number {
  return OUTER2_SLOTS.includes(slot) ? 2 : OUTER_SLOTS.includes(slot) ? 1 : 0;
}
export const LEFT_SLOTS: SlotId[] = ['wingL', 'wingL2', 'wingL3'];
/** seitlicher Versatz (Abschusspunkt) je Stufe: größere Pods sitzen weiter außen, ab Stufe 3 auf einem Träger */
const WING_OX = [0, 24, 28, 40, 44, 48];
const OUTER_OX = [0, 68, 72, 84, 88, 94];
const OUTER2_OX = [0, 112, 116, 128, 132, 138];
export function slotOffset(slot: SlotId, lvl: number, cls = 0): number {
  if (CORE_SLOTS.includes(slot)) return 0;
  const l = lvl < 1 ? 1 : lvl > MAX_WEAPON_LVL ? MAX_WEAPON_LVL : lvl;
  const ox = OUTER2_SLOTS.includes(slot) ? OUTER2_OX[l] : OUTER_SLOTS.includes(slot) ? OUTER_OX[l] : WING_OX[l];
  const o = ox + shipClass(cls).wingShift;
  return LEFT_SLOTS.includes(slot) ? -o : o;
}
export const SLOT_NAMES: Record<SlotId, string> = {
  wingL: 'Flügel links', wingR: 'Flügel rechts', core: 'Rumpf', wingL2: 'Ausleger links', wingR2: 'Ausleger rechts',
  wingL3: 'Außen links', wingR3: 'Außen rechts', core2: 'Rumpf Mitte', core3: 'Rumpf Heck',
};

export type WeaponId = 'side' | 'spread' | 'missile' | 'pulse' | 'beam' | 'laser' | 'rear' | 'drone' | 'arc' | 'rail' | 'flak' | 'plasma';

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
  { id: 'flak', name: 'Flak', place: 'wing', price: 320, up: [240, 400, 700, 1050], desc: 'Granate zerplatzt beim Treffer oder am Ende der Flugbahn in einen Ring aus Splittern. Stufe 3: zwei Granaten.',
    lvl4: 'Zehn Splitter je Granate, lädt schneller.', evo: 'Sturmflak', evoDesc: 'Zwölf Splitter je Granate, die noch einen Gegner durchschlagen.' },
  { id: 'rail', name: 'Railgun', place: 'wing', price: 450, up: [320, 520, 880, 1350], desc: 'Langsam, aber gewaltig: der Schuss durchschlägt alle Gegner in seiner Bahn. Stufe 3: breiterer Schuss.',
    lvl4: 'Mehr Schaden, lädt schneller.', evo: 'Tachyonlanze', evoDesc: 'Zwei Schienen; jeder Durchschlag macht den Schuss 20 % stärker.' },
  { id: 'laser', name: 'Pulslaser', place: 'core', price: 480, up: [350, 550, 900, 1400], desc: 'Bolzen durchschlägt bis zu 3 Gegner.',
    lvl4: 'Durchschlägt 4 Gegner, feuert schneller.', evo: 'Prismalanze', evoDesc: 'Zwei Bolzen, die viermal von Gegner zu Gegner abprallen.' },
  { id: 'rear', name: 'Heckkanone', place: 'core', price: 300, up: [220, 380, 650, 1000], desc: 'Schießt nach hinten und schräg zur Seite.',
    lvl4: 'Mehr Schaden, schneller.', evo: 'Igel', evoDesc: 'Feuert in alle Richtungen, jeder Schuss prallt einmal ab.' },
  { id: 'drone', name: 'Begleitdrohne', place: 'core', price: 520, up: [380, 600, 1000, 1500], desc: 'Kreist ums Schiff und zielt selbst. Stufe 3: zwei Drohnen.',
    lvl4: 'Schneller und stärker.', evo: 'Drohnenschwarm', evoDesc: 'Drei Drohnen, ihre Treffer springen als Blitz weiter.' },
  { id: 'arc', name: 'Blitzbogen', place: 'core', price: 400, up: [300, 480, 820, 1250], desc: 'Blitz springt auf den nächsten Gegner und weiter auf 1/2/3 Nachbarn.',
    lvl4: 'Springt auf 4 Nachbarn.', evo: 'Gewittersturm', evoDesc: 'Fünf Sprünge, dazu gabelt sich ein zweiter Blitz.' },
  { id: 'plasma', name: 'Plasma-Orb', place: 'core', price: 560, up: [400, 650, 1050, 1600], desc: 'Träge Plasmakugel, die durch alle Gegner wandert und sie dabei pausenlos verbrennt. Stufe 3: größer.',
    lvl4: 'Größer, lädt schneller.', evo: 'Sonnenkern', evoDesc: 'Riesige Kugel, die gegnerische Kugeln verschluckt.' },
];

/** Anzeigename einer Waffe auf ihrer Stufe (Stufe 5: Evolution) */
export function weaponName(w: WeaponId, lvl: number): string {
  const d = WEAPON_BY_ID[w];
  return lvl >= MAX_WEAPON_LVL ? d.evo : d.name;
}

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<WeaponId, WeaponDef>;

export function slotAccepts(slot: SlotId, w: WeaponId): boolean {
  return WEAPON_BY_ID[w].place === (CORE_SLOTS.includes(slot) ? 'core' : 'wing');
}

/** Gesamtwert einer eingebauten Waffe (für den Verkauf: 50 % davon) */
export function weaponValue(w: WeaponId, lvl: number): number {
  const d = WEAPON_BY_ID[w];
  let v = d.price;
  for (let l = 2; l <= lvl && l <= MAX_WEAPON_LVL; l++) v += d.up[l - 2];
  return v;
}

export const BOMB_PRICE = 150;
export const REPAIR_PER_HP = 1;

export type SkillBranch = 'off' | 'def' | 'tec' | 'gun' | 'pil';
export type SkillId = `${SkillBranch}${1 | 2 | 3 | 4 | 5 | 6}`;

export interface SkillDef {
  id: SkillId;
  branch: SkillBranch;
  tier: number;
  name: string;
  desc: string;
}

export const BRANCHES: SkillBranch[] = ['off', 'def', 'tec', 'gun', 'pil'];
export const BRANCH_NAMES: Record<SkillBranch, string> = { off: 'Feuerkraft', def: 'Verteidigung', tec: 'Technik', gun: 'Waffenmeister', pil: 'Pilot' };
export const BRANCH_ICONS: Record<SkillBranch, string> = { off: '🔥', def: '🛡', tec: '🔧', gun: '🎯', pil: '✈' };
/** Stufen je Ast */
export const SKILL_TIERS = 6;

export const SKILLS: SkillDef[] = [
  { id: 'off1', branch: 'off', tier: 1, name: 'Zielwasser', desc: '+10 % Schaden' },
  { id: 'off2', branch: 'off', tier: 2, name: 'Schnellfeuer', desc: '+10 % Feuerrate' },
  { id: 'off3', branch: 'off', tier: 3, name: 'Durchschlag', desc: 'Bordkanone durchschlägt einen Gegner' },
  { id: 'off4', branch: 'off', tier: 4, name: 'Überladung', desc: '+1 Start-Waffenstufe' },
  { id: 'off5', branch: 'off', tier: 5, name: 'Kritische Masse', desc: '+10 % Chance auf kritische Treffer, die dreifach statt doppelt treffen' },
  { id: 'off6', branch: 'off', tier: 6, name: 'Exekutor', desc: '+40 % Schaden gegen Endgegner und Fregatten' },
  { id: 'def1', branch: 'def', tier: 1, name: 'Verstärkung', desc: '+20 maximale Hülle' },
  { id: 'def2', branch: 'def', tier: 2, name: 'Notschild', desc: 'Einmal je Sektor: unter 25 % Hülle 3 s unverwundbar' },
  { id: 'def3', branch: 'def', tier: 3, name: 'Naniten', desc: 'Hülle repariert sich (1 pro Sekunde)' },
  { id: 'def4', branch: 'def', tier: 4, name: 'Phönix', desc: 'Einmal pro Spiel: Wiederbelebung mit halber Hülle' },
  { id: 'def5', branch: 'def', tier: 5, name: 'Schockwelle', desc: 'Ein Treffer löscht alle Kugeln in der Nähe und macht 0,5 s länger unverwundbar' },
  { id: 'def6', branch: 'def', tier: 6, name: 'Bollwerk', desc: '−15 % Schaden, +40 maximale Hülle, Schild lädt doppelt so schnell' },
  { id: 'tec1', branch: 'tec', tier: 1, name: 'Traktorstrahl', desc: '+40 m Sammelradius' },
  { id: 'tec2', branch: 'tec', tier: 2, name: 'Feilschen', desc: '−10 % auf alle Preise beim Händler' },
  { id: 'tec3', branch: 'tec', tier: 3, name: 'Kristallnase', desc: '+25 % Credits' },
  { id: 'tec4', branch: 'tec', tier: 4, name: 'Bombenschacht', desc: '+1 Bomben-Vorrat, jeder Sektor startet mit mindestens einer Bombe' },
  { id: 'tec5', branch: 'tec', tier: 5, name: 'Feldwerkstatt', desc: 'Nach jedem Sektor wird die halbe fehlende Hülle gratis geflickt' },
  { id: 'tec6', branch: 'tec', tier: 6, name: 'Großhändler', desc: 'Weitere −10 % auf alle Preise, Kristalle sind 50 % mehr wert' },
  { id: 'gun1', branch: 'gun', tier: 1, name: 'Munitionsgurte', desc: 'Anbauwaffen feuern 10 % schneller' },
  { id: 'gun2', branch: 'gun', tier: 2, name: 'Hohlladung', desc: 'Anbauwaffen: +12 % Schaden' },
  { id: 'gun3', branch: 'gun', tier: 3, name: 'Splitterlehre', desc: 'Splitter (Flak, Splitterkanone, Raketenschwarm): +60 % Schaden' },
  { id: 'gun4', branch: 'gun', tier: 4, name: 'Panzerbrecher', desc: 'Railgun, Pulslaser und Plasma-Orb: +30 % Schaden' },
  { id: 'gun5', branch: 'gun', tier: 5, name: 'Kettenreaktion', desc: 'Alle Blitze springen auf einen Gegner mehr über' },
  { id: 'gun6', branch: 'gun', tier: 6, name: 'Arsenal', desc: 'Evolutionen (Stufe 5): +25 % Schaden' },
  { id: 'pil1', branch: 'pil', tier: 1, name: 'Nachbrenner', desc: '+10 % Tempo' },
  { id: 'pil2', branch: 'pil', tier: 2, name: 'Draufgänger', desc: 'Streifschüsse füllen die Bomben-Leiste 40 % schneller' },
  { id: 'pil3', branch: 'pil', tier: 3, name: 'Schmale Silhouette', desc: 'Kleinere Trefferzone: Kugeln müssen genauer treffen' },
  { id: 'pil4', branch: 'pil', tier: 4, name: 'Bombenexperte', desc: 'Bomben treffen doppelt so hart, danach 2 s unverwundbar' },
  { id: 'pil5', branch: 'pil', tier: 5, name: 'Adrenalin', desc: 'Nach jedem Streifschuss 2 s lang +20 % Feuerrate' },
  { id: 'pil6', branch: 'pil', tier: 6, name: 'Schutzengel', desc: 'Einmal je Sektor: ein tödlicher Treffer zündet stattdessen automatisch eine Bombe (wenn eine da ist)' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDef>;
