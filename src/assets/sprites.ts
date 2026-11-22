// Alle Grafiken als SVG-Code (Comic-Sci-Fi: dunkle Outline, flächige Farben, eine harte Schattenstufe, Glanzpunkt).
// Doppelte Auflösung: width/height = 2 × viewBox, im Spiel mit setScale(0.5) gezeichnet.
// Spieler schaut nach oben, Gegner nach unten.

import { MAX_CLASS, shipClass } from '../core/data/shop';

const O = '#0E1022';

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** wie svg(), aber alles auf die viewBox beschnitten (für kachelnde Kulissen) */
function svgClip(id: string, w: number, h: number, body: string): string {
  return svg(w, h, `<defs><clipPath id="${id}"><rect width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#${id})">${body}</g>`);
}

/** Füllung mit Outline */
const f = (fill: string, sw = 2.2) => `fill="${fill}" stroke="${O}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;

/** symmetrisches Polygon: linke Hälfte (von oben nach unten) wird an cx gespiegelt */
function sym(cx: number, half: [number, number][]): string {
  const right = [...half].reverse().map(([x, y]) => [2 * cx - x, y] as [number, number]);
  return [...half, ...right].map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(' ');
}

function poly(points: string, attrs: string) {
  return `<polygon points="${points}" ${attrs}/>`;
}

/** weißer Glanzpunkt */
const shine = (x: number, y: number, rx = 2.2, ry = 1.4, rot = -30) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#fff" opacity="0.9"/>`;

function glow(id: string, color: string) {
  return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>`;
}

// ───────────────────────────── Spieler ─────────────────────────────

function player(): string {
  const cx = 32;
  const hull = sym(cx, [[32, 2], [27, 14], [25, 30], [12, 42], [4, 54], [6, 60], [22, 56], [24, 64], [30, 66]]);
  const shade = sym(cx, [[25, 31], [12, 43], [5, 54], [6, 59], [22, 55], [24, 62], [30, 64]]);
  return svg(64, 72, `
    ${poly(hull, f('#D8E3F0', 2.6))}
    <polygon points="${shade}" fill="#8A9BB5"/>
    <polygon points="${sym(cx, [[32, 6], [28, 16], [27, 40], [30, 58]])}" fill="#EEF4FA"/>
    ${poly(sym(cx, [[8, 50], [5, 55], [10, 57]]), f('#2EC4FF', 1.6))}
    ${poly(sym(cx, [[20, 44], [14, 50], [22, 52]]), f('#E8573A', 1.6))}
    <ellipse cx="32" cy="24" rx="4.5" ry="8" ${f('#2EC4FF', 2)}/>
    <ellipse cx="32" cy="26" rx="2.6" ry="5" fill="#1A6FB0"/>
    ${shine(30.6, 20, 1.4, 2.6, 0)}
    <rect x="26" y="60" width="12" height="6" rx="2" ${f('#5A6880', 2)}/>
  `);
}

/** Geschützturm auf dem Rumpf der großen Schiffsklassen (Kuppel mit kurzem Doppellauf) */
function hullTurret(x: number, y: number, r: number, gold: boolean): string {
  let s = `<rect x="${x - 2.6}" y="${y - r - 5}" width="2" height="${r + 4}" rx="0.8" ${f('#5A6880', 1.1)}/><rect x="${x + 0.6}" y="${y - r - 5}" width="2" height="${r + 4}" rx="0.8" ${f('#5A6880', 1.1)}/>`;
  s += `<circle cx="${x}" cy="${y}" r="${r}" ${f(gold ? '#FFD24A' : '#8A9BB5', 1.6)}/>`;
  s += `<circle cx="${x}" cy="${y}" r="${+(r * 0.45).toFixed(2)}" fill="#2EC4FF" stroke="${O}" stroke-width="1"/>`;
  return s;
}

/** fest eingebauter Lauf der Schiffsklassen (Mündung bei y) */
function hullBarrel(x: number, y: number, len: number, gold: boolean): string {
  return `<rect x="${x - 2.2}" y="${y}" width="4.4" height="${len}" rx="1.3" ${f('#5A6880', 1.4)}/>`
    + `<rect x="${x - 3}" y="${y - 0.6}" width="6" height="3.2" rx="1" ${f(gold ? '#FFD24A' : '#8A9BB5', 1.2)}/>`
    + `<rect x="${x - 0.7}" y="${y + 0.4}" width="1.4" height="2" fill="#7CF7FF"/>`
    + `<rect x="${x - 3.6}" y="${y + len - 4}" width="7.2" height="9" rx="2.4" ${f(gold ? '#FFD24A' : '#D8E3F0', 1.5)}/>`;
}

/** Kreuzer (Schiffsklasse 1): breiter Rumpf mit Triebwerksgondeln, zwei festen Läufen und zwei Geschütztürmen */
function playerCruiser(): string {
  const W = 84, H = 100, cx = 42, cy = 50;
  const hull = sym(cx, [[42, 2], [36, 14], [33, 34], [27, 42], [13, 54], [4, 72], [3, 82], [8, 86], [24, 80], [27, 92], [38, 96]]);
  const shade = sym(cx, [[33, 36], [27, 44], [14, 55], [5, 73], [4, 81], [8, 84], [24, 78], [27, 90], [38, 94]]);
  let s = '';
  // Triebwerksgondeln
  for (const sd of [-1, 1]) {
    s += `<rect x="${cx + sd * 10 - 5}" y="84" width="10" height="13" rx="3" ${f('#5A6880', 2)}/>`;
    s += `<rect x="${cx + sd * 10 - 3}" y="93" width="6" height="2.4" rx="1" fill="#7CF7FF"/>`;
  }
  s += poly(hull, f('#D8E3F0', 2.8));
  s += `<polygon points="${shade}" fill="#8A9BB5"/>`;
  s += `<polygon points="${sym(cx, [[42, 7], [38, 18], [36, 52], [40, 84]])}" fill="#EEF4FA"/>`;
  // Flügelspitzen und Streifen
  s += poly(sym(cx, [[8, 68], [4, 78], [11, 82]]), f('#2EC4FF', 1.7));
  s += poly(sym(cx, [[25, 50], [15, 60], [27, 64]]), f('#E8573A', 1.7));
  s += poly(sym(cx, [[22, 68], [14, 74], [24, 76]]), f('#E8573A', 1.5));
  // Panzergürtel
  s += `<rect x="${cx - 8}" y="56" width="16" height="4" rx="1.4" ${f('#8A9BB5', 1.3)}/><rect x="${cx - 8}" y="64" width="16" height="3" rx="1.2" ${f('#5A6880', 1.2)}/>`;
  // Brücke
  s += `<ellipse cx="${cx}" cy="28" rx="5.5" ry="10" ${f('#2EC4FF', 2.2)}/><ellipse cx="${cx}" cy="31" rx="3.2" ry="6.4" fill="#1A6FB0"/>${shine(cx - 1.8, 23, 1.6, 3, 0)}`;
  // feste Läufe (Sim: ±21, Mündung 14 px vor der Mitte) und Türme (±17, +14)
  for (const sd of [-1, 1]) s += hullBarrel(cx + sd * 21, cy - 20, 20, false);
  for (const sd of [-1, 1]) s += hullTurret(cx + sd * 17, cy + 14, 5, false);
  META.player_c1 = { w: W, h: H, ax: cx, ay: cy, tips: [], lamp: [0, 0] };
  return svg(W, H, s);
}

/** Schlachtschiff (Schiffsklasse 2): schwerer Rumpf mit Goldkante, vier festen Läufen, vier Türmen, drei Triebwerken */
function playerBattleship(): string {
  const W = 112, H = 128, cx = 56, cy = 64;
  const hull = sym(cx, [[56, 2], [48, 14], [44, 34], [41, 50], [30, 56], [12, 74], [3, 96], [2, 108], [9, 112], [28, 104], [32, 116], [44, 124]]);
  const shade = sym(cx, [[44, 36], [41, 52], [30, 58], [13, 75], [4, 97], [3, 107], [9, 110], [28, 102], [32, 114], [44, 122]]);
  let s = '';
  for (const dx of [-17, 0, 17]) {
    s += `<rect x="${cx + dx - 6}" y="${dx ? 108 : 112}" width="12" height="15" rx="3.4" ${f('#5A6880', 2)}/>`;
    s += `<rect x="${cx + dx - 3.5}" y="${dx ? 119 : 123}" width="7" height="2.6" rx="1" fill="#7CF7FF"/>`;
  }
  s += poly(hull, f('#D8E3F0', 3));
  s += `<polygon points="${shade}" fill="#8A9BB5"/>`;
  s += `<polygon points="${sym(cx, [[56, 8], [51, 20], [48, 66], [52, 110]])}" fill="#EEF4FA"/>`;
  // Goldkante am Bug, Flügelspitzen, Streifen
  s += `<path d="M${cx - 7},16 L${cx},4.5 L${cx + 7},16" fill="none" stroke="${O}" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M${cx - 7},16 L${cx},4.5 L${cx + 7},16" fill="none" stroke="#FFD24A" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += poly(sym(cx, [[8, 92], [3, 104], [12, 108]]), f('#FFD24A', 1.8));
  s += poly(sym(cx, [[30, 62], [18, 74], [32, 80]]), f('#E8573A', 1.8));
  s += poly(sym(cx, [[26, 86], [14, 94], [28, 98]]), f('#2EC4FF', 1.7));
  // Panzergürtel und Decksaufbau
  for (const y of [70, 78, 86]) s += `<rect x="${cx - 11}" y="${y}" width="22" height="4" rx="1.4" ${f(y === 78 ? '#FFD24A' : '#8A9BB5', 1.3)}/>`;
  s += `<rect x="${cx - 6}" y="44" width="12" height="18" rx="3" ${f('#8A9BB5', 1.8)}/>`;
  s += `<ellipse cx="${cx}" cy="30" rx="6.5" ry="12" ${f('#2EC4FF', 2.4)}/><ellipse cx="${cx}" cy="34" rx="3.8" ry="7.6" fill="#1A6FB0"/>${shine(cx - 2.2, 24, 1.8, 3.4, 0)}`;
  s += `<circle cx="${cx}" cy="53" r="3.4" ${f('#FFD24A', 1.4)}/>`;
  // feste Läufe (±24, ±34) und Türme (±21, −8), (±25, +28)
  for (const sd of [-1, 1]) s += hullBarrel(cx + sd * 34, cy - 14, 22, true) + hullBarrel(cx + sd * 24, cy - 22, 24, true);
  for (const sd of [-1, 1]) s += hullTurret(cx + sd * 21, cy - 8, 5.5, true) + hullTurret(cx + sd * 25, cy + 28, 6, true);
  META.player_c2 = { w: W, h: H, ax: cx, ay: cy, tips: [], lamp: [0, 0] };
  return svg(W, H, s);
}

function flame(): string {
  return svg(20, 34, `${glow('fl', '#2EC4FF')}
    <ellipse cx="10" cy="14" rx="9" ry="14" fill="url(#fl)"/>
    <path d="M5,2 Q10,34 15,2 Z" fill="#7CF7FF"/>
    <path d="M7.5,2 Q10,22 12.5,2 Z" fill="#fff"/>`);
}

// ───────────────────────────── Anbauten ─────────────────────────────
// Jede Anbauwaffe hat eigene Grafiken je Stufe (Stufe 1 kompakt, 2 gepanzert, 3 übertrieben, 4 noch wuchtiger,
// 5 = Evolution mit eigener Silhouette und Goldakzenten; Gatling und Gewitterspule zusätzlich mit Animations-Frames).
// Zu jeder Grafik gibt es Metadaten (PartMeta): Ankerpunkt (= Abschusspunkt der Sim bzw. Schiffsmitte),
// Laufmündungen und Leuchtpunkt relativ zum Anker – der Renderer setzt damit Mündungsfeuer und Glühen.

export interface PartMeta {
  /** Größe der Grafik in Spielpixeln */
  w: number;
  h: number;
  /** Anker in Spielpixeln innerhalb der Grafik */
  ax: number;
  ay: number;
  /** Mündungen relativ zum Anker */
  tips: [number, number][];
  /** Leuchtpunkt (Lampe/Spule) relativ zum Anker */
  lamp: [number, number];
}

const META: Record<string, PartMeta> = {};
/** Metadaten einer Anbau-Grafik (Anker, Mündungen, Lampe); nach allSvgs() verfügbar */
export function partMeta(key: string): PartMeta | undefined {
  return META[key];
}

type WingKind = 'side' | 'spread' | 'missile' | 'pulse' | 'beam' | 'rail' | 'flak';
const WCOL: Record<WingKind, [string, string, string]> = {
  side: ['#F2A93B', '#B87412', '#FFE7B0'],
  spread: ['#7BD53A', '#3F8A1E', '#DFFFC0'],
  missile: ['#E8573A', '#9A2A14', '#FFC8B0'],
  pulse: ['#2EC4FF', '#1A6FB0', '#C8FCFF'],
  beam: ['#E23C8C', '#8A1450', '#FFC0E4'],
  rail: ['#7F8CFF', '#3A45B0', '#E4E8FF'],
  flak: ['#B4BE3C', '#6C7418', '#F2F6B8'],
};

/** Railgun: zwei Schienen mit leuchtendem Spalt und Spulenblöcken; gibt SVG zurück (Mündung bei top) */
function rails(cx: number, top: number, base: number, gap: number, w: number, coils: number, coilCol: string, glowCol: string): string {
  let s = `<rect x="${n2(cx - gap / 2)}" y="${n2(top + 1.5)}" width="${n2(gap)}" height="${n2(base - top - 2)}" fill="${glowCol}" opacity="0.9"/>`;
  s += barrel(cx - gap / 2 - w / 2, top, base, w, DARK) + barrel(cx + gap / 2 + w / 2, top, base, w, DARK);
  const span = gap + 2 * w + 2.4;
  for (let i = 0; i < coils; i++) {
    const y = base - 5 - i * ((base - top - 9) / Math.max(1, coils));
    s += `<rect x="${n2(cx - span / 2)}" y="${n2(y)}" width="${n2(span)}" height="3" rx="1.2" ${f(coilCol, 1.1)}/>`;
  }
  return s;
}

/** Flak: kurzes, dickes Rohr mit breiter Mündung */
function mortar(x: number, top: number, base: number, w: number, col: string, rim: string): string {
  return barrel(x, top + 2, base, w, col, { sw: 1.6 })
    + `<rect x="${n2(x - w / 2 - 1.6)}" y="${n2(top)}" width="${n2(w + 3.2)}" height="4" rx="1.4" ${f(rim, 1.3)}/>`
    + `<ellipse cx="${n2(x)}" cy="${n2(top + 1.6)}" rx="${n2(w * 0.32)}" ry="1" fill="${O}"/>`;
}
const GOLD = '#FFD24A';
const METAL = '#8A9BB5';
const DARK = '#5A6880';
const LIGHT = '#D8E3F0';
const n2 = (v: number) => +v.toFixed(2);

/** Lauf von oben (top) bis unten (bottom), optional Mündungsbremse und Spulenringe */
function barrel(x: number, top: number, bottom: number, w: number, col: string, o: { brake?: boolean; rings?: number; ring?: string; sw?: number } = {}): string {
  const h = bottom - top;
  let s = `<rect x="${n2(x - w / 2)}" y="${n2(top)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(Math.min(1.6, w / 3))}" ${f(col, o.sw ?? 1.5)}/>`;
  s += `<rect x="${n2(x - w / 2 + 0.9)}" y="${n2(top + 1.6)}" width="${n2(Math.max(0.8, w * 0.2))}" height="${n2(h - 3.2)}" fill="#fff" opacity="0.4"/>`;
  for (let i = 0; i < (o.rings ?? 0); i++) {
    s += `<rect x="${n2(x - w / 2 - 0.7)}" y="${n2(top + 4 + i * 3.2)}" width="${n2(w + 1.4)}" height="1.7" rx="0.8" fill="${o.ring ?? '#7CF7FF'}" stroke="${O}" stroke-width="0.8"/>`;
  }
  if (o.brake) s += `<rect x="${n2(x - w / 2 - 1.1)}" y="${n2(top - 0.6)}" width="${n2(w + 2.2)}" height="3.4" rx="1" ${f(DARK, 1.3)}/>`;
  return s;
}

/** Rumpf eines Flügel-Pods: Grundkörper, ab Stufe 2 Panzerplatten, ab Stufe 3 Kühlrippen und Goldstreifen,
 *  Stufe 4 mit Schulterpanzern und doppelten Rippen, Stufe 5 (Evolution) mit goldgesäumten Flossen und Goldwinkel */
function podBody(lvl: number, cx: number, y0: number, bw: number, bh: number, c: [string, string, string]): string {
  const y1 = y0 + bh;
  let s = '';
  const pw = [0, 0, 4, 5, 6, 6][lvl];
  // Evolution: gepfeilte Flossen außen, Goldkante, Leuchtspitze
  if (lvl >= 5) {
    for (const sd of [-1, 1]) {
      const xi = cx + sd * (bw / 2 + 1);
      const xo = cx + sd * (bw / 2 + pw + 7);
      const fin = `${n2(xi)},${n2(y0 + 6)} ${n2(xo)},${n2(y0 + bh * 0.5)} ${n2(xo)},${n2(y0 + bh * 0.86)} ${n2(xi)},${n2(y1 - 5)}`;
      s += poly(fin, f(c[1], 1.8));
      s += `<path d="M${n2(xi + sd * 1.5)},${n2(y0 + 8)} L${n2(xo - sd * 0.6)},${n2(y0 + bh * 0.5 + 1)} L${n2(xo - sd * 0.6)},${n2(y0 + bh * 0.84)}" fill="none" stroke="${GOLD}" stroke-width="1.4" stroke-linejoin="round"/>`;
      s += `<circle cx="${n2(xo)}" cy="${n2(y0 + bh * 0.86)}" r="1.7" fill="${c[2]}" stroke="${O}" stroke-width="0.9"/>`;
    }
  }
  // Kühlrippen (Stufe 3 und 4): außen an den Panzerplatten
  if (lvl === 3 || lvl === 4) {
    const n = lvl === 4 ? 6 : 5;
    const rw = lvl === 4 ? 4.6 : 4;
    for (const sd of [-1, 1]) {
      const x = sd < 0 ? cx - bw / 2 - pw - rw + 1.5 : cx + bw / 2 + pw - 1.5;
      for (let i = 0; i < n; i++) s += `<rect x="${n2(x)}" y="${n2(y0 + 5 + i * 4.4)}" width="${rw}" height="2.2" rx="0.8" ${f(DARK, 1.1)}/>`;
    }
  }
  // Panzerplatten
  if (lvl >= 2) {
    for (const sd of [-1, 1]) {
      const x = sd < 0 ? cx - bw / 2 - pw + 1.6 : cx + bw / 2 - 1.6;
      s += `<rect x="${n2(x)}" y="${n2(y0 + 3)}" width="${pw}" height="${n2(bh - 5)}" rx="1.6" ${f(METAL, 1.5)}/>`;
      s += `<circle cx="${n2(x + pw / 2)}" cy="${n2(y0 + 5.5)}" r="0.75" fill="${O}"/><circle cx="${n2(x + pw / 2)}" cy="${n2(y1 - 4.5)}" r="0.75" fill="${O}"/>`;
      if (lvl >= 3) s += `<rect x="${n2(x + pw / 2 - 0.9)}" y="${n2(y0 + 8)}" width="1.8" height="${n2(bh - 15)}" rx="0.9" fill="${lvl >= 5 ? GOLD : c[2]}" stroke="${O}" stroke-width="0.6"/>`;
    }
  }
  s += `<rect x="${n2(cx - bw / 2)}" y="${y0}" width="${bw}" height="${bh}" rx="${n2(bw * 0.38)}" ${f(c[0], lvl >= 3 ? 2.4 : 2.2)}/>`;
  // harte Schattenstufe rechts
  s += `<path d="M${n2(cx + bw * 0.12)},${n2(y0 + 2.5)} L${n2(cx + bw / 2 - 1.6)},${n2(y0 + bw * 0.3)} L${n2(cx + bw / 2 - 1.6)},${n2(y1 - bw * 0.3)} L${n2(cx + bw * 0.12)},${n2(y1 - 2.5)} Z" fill="${c[1]}" opacity="0.55"/>`;
  if (lvl >= 2) s += `<rect x="${n2(cx - bw / 2 + 1)}" y="${n2(y0 + 1)}" width="${bw - 2}" height="3" rx="1.2" fill="${DARK}" stroke="${O}" stroke-width="1"/>`;
  if (lvl >= 3) s += `<rect x="${n2(cx - bw / 2 + 0.8)}" y="${n2(y0 + bh * 0.68)}" width="${n2(bw - 1.6)}" height="2.4" fill="${GOLD}" stroke="${O}" stroke-width="0.9"/>`;
  if (lvl >= 4) s += `<rect x="${n2(cx - bw / 2 + 1.2)}" y="${n2(y0 + bh * 0.78)}" width="${n2(bw - 2.4)}" height="1.8" fill="${lvl >= 5 ? GOLD : DARK}" stroke="${O}" stroke-width="0.8"/>`;
  // Evolution: Goldwinkel unter der Lampe
  if (lvl >= 5) {
    const y = n2(y0 + bh * 0.6);
    const d = `M${cx - 4.5},${y} L${cx},${n2(y + 2.8)} L${cx + 4.5},${y}`;
    s += `<path d="${d}" fill="none" stroke="${O}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // Schulterpanzer (Stufe 4: Stahl, Stufe 5: Gold)
  if (lvl >= 4) {
    for (const sd of [-1, 1]) {
      const xa = cx + sd * (bw / 2 - 3);
      const xb = cx + sd * (bw / 2 + pw - 0.6);
      s += poly(`${n2(xa)},${n2(y0 - 1)} ${n2(xb)},${n2(y0 + 2.5)} ${n2(xb)},${n2(y0 + 9)} ${n2(xa)},${n2(y0 + 6.5)}`, f(lvl >= 5 ? GOLD : METAL, 1.5));
      s += `<circle cx="${n2((xa + xb) / 2)}" cy="${n2(y0 + 4.2)}" r="0.8" fill="${O}"/>`;
    }
  }
  // Lampe
  const lr = [0, 2.4, 3, 3.8, 4.2, 4.6][lvl];
  const ly = y0 + bh * 0.42;
  if (lvl >= 5) s += `<circle cx="${cx}" cy="${n2(ly)}" r="${n2(lr + 1.8)}" ${f(GOLD, 1.4)}/>`;
  s += `<circle cx="${cx}" cy="${n2(ly)}" r="${lr}" ${f(c[2], 1.4)}/><circle cx="${cx}" cy="${n2(ly)}" r="${n2(lr * 0.45)}" fill="#fff"/>`;
  // Düse unten
  s += `<rect x="${n2(cx - bw * 0.3)}" y="${n2(y1 - 1.5)}" width="${n2(bw * 0.6)}" height="${lvl >= 3 ? 4.5 : 3.5}" rx="1.2" ${f(DARK, 1.4)}/>`;
  if (lvl >= 4) s += `<rect x="${n2(cx - bw * 0.2)}" y="${n2(y1 + 1.2)}" width="${n2(bw * 0.4)}" height="1.4" rx="0.7" fill="${lvl >= 5 ? c[2] : '#7CF7FF'}"/>`;
  s += shine(n2(cx - bw * 0.24), y0 + 5.5, 1.2, 2, 0);
  return s;
}

/** Waffenteil oben am Pod (Läufe, Rohre, Emitter); gibt SVG und Mündungen (absolut) zurück */
function podTop(kind: WingKind, lvl: number, cx: number, y0: number, frame = 0): { s: string; tips: [number, number][]; over?: string } {
  if (lvl >= 4) return podTopHi(kind, lvl, cx, y0, frame);
  const c = WCOL[kind];
  const tip = [0, 3.5, 2.5, 1.8][lvl];
  const base = y0 + 4;
  let s = '';
  const tips: [number, number][] = [];
  if (kind === 'side') {
    if (lvl === 1) {
      s += barrel(cx, tip, base, 5, DARK);
      tips.push([cx, tip]);
    } else if (lvl === 2) {
      s += barrel(cx - 6, tip + 6, base, 2.8, METAL) + barrel(cx + 6, tip + 6, base, 2.8, METAL);
      s += barrel(cx, tip, base, 6.5, DARK, { brake: true });
      tips.push([cx, tip]);
    } else {
      s += barrel(cx - 8.5, tip + 8, base, 2.8, METAL) + barrel(cx + 8.5, tip + 8, base, 2.8, METAL);
      s += `<rect x="${cx - 2}" y="${tip + 6}" width="4" height="${base - tip - 6}" rx="1" ${f(c[1], 1.2)}/>`;
      s += barrel(cx - 4.5, tip, base, 5.5, DARK, { brake: true }) + barrel(cx + 4.5, tip, base, 5.5, DARK, { brake: true });
      s += `<rect x="${cx - 8}" y="${tip + 7}" width="16" height="2.4" rx="1" fill="${c[0]}" stroke="${O}" stroke-width="1"/>`;
      tips.push([cx - 4.5, tip], [cx + 4.5, tip]);
    }
  } else if (kind === 'rail') {
    // Railgun: Schienenpaar, je Stufe länger, breiter, mit mehr Spulen
    const gap = [0, 2, 2.4, 4][lvl];
    const w = [0, 2.4, 2.8, 3.2][lvl];
    const t = tip - (lvl === 3 ? 1 : 0);
    if (lvl >= 3) s += `<rect x="${cx - 9}" y="${base - 8}" width="18" height="7" rx="2.5" ${f(c[1], 1.4)}/>`;
    s += rails(cx, t, base, gap, w, lvl + 1, lvl >= 3 ? GOLD : c[0], c[2]);
    if (lvl >= 2) for (const sd of [-1, 1]) s += `<rect x="${n2(cx + sd * (gap / 2 + w + 2.6) - 1.5)}" y="${base - 7}" width="3" height="6" rx="1" ${f(METAL, 1.1)}/>`;
    tips.push([cx, t]);
  } else if (kind === 'flak') {
    // Flak: Mörserrohr(e), ab Stufe 2 mit Magazin, Stufe 3 Zwilling
    const w = [0, 6.5, 8, 7][lvl];
    const t = tip + 5;
    if (lvl === 3) {
      s += `<rect x="${cx - 11}" y="${base - 8}" width="22" height="7" rx="2.5" ${f(c[1], 1.4)}/>`;
      s += mortar(cx - 5, t, base, w, DARK, c[0]) + mortar(cx + 5, t, base, w, DARK, c[0]);
      s += `<rect x="${cx - 10}" y="${base - 4}" width="20" height="2.2" fill="${GOLD}" stroke="${O}" stroke-width="0.8"/>`;
      tips.push([cx - 5, t], [cx + 5, t]);
    } else {
      if (lvl === 2) s += `<rect x="${cx + 4}" y="${base - 9}" width="6" height="8" rx="1.6" ${f(METAL, 1.3)}/><circle cx="${cx + 7}" cy="${base - 6}" r="1.4" fill="${c[0]}" stroke="${O}" stroke-width="0.7"/>`;
      s += mortar(cx, t, base, w, DARK, c[0]);
      tips.push([cx, t]);
    }
  } else if (kind === 'pulse') {
    if (lvl < 3) {
      const w = lvl === 1 ? 4.5 : 6;
      s += barrel(cx, tip, base, w, DARK, { rings: lvl + 1 });
      s += `<circle cx="${cx}" cy="${tip + 1.2}" r="${n2(w * 0.32)}" fill="#B8FBFF"/>`;
      tips.push([cx, tip]);
    } else {
      s += `<rect x="${cx - 9}" y="${base - 8}" width="18" height="7" rx="2.5" ${f(c[1], 1.4)}/>`;
      s += barrel(cx - 4.5, tip, base - 2, 5, DARK, { rings: 3 }) + barrel(cx + 4.5, tip, base - 2, 5, DARK, { rings: 3 });
      s += `<circle cx="${cx - 4.5}" cy="${tip + 1.2}" r="1.5" fill="#B8FBFF"/><circle cx="${cx + 4.5}" cy="${tip + 1.2}" r="1.5" fill="#B8FBFF"/>`;
      s += `<rect x="${cx - 10.5}" y="${base - 6}" width="3" height="3" rx="1" fill="#7CF7FF" stroke="${O}" stroke-width="0.9"/><rect x="${cx + 7.5}" y="${base - 6}" width="3" height="3" rx="1" fill="#7CF7FF" stroke="${O}" stroke-width="0.9"/>`;
      tips.push([cx - 4.5, tip], [cx + 4.5, tip]);
    }
  } else if (kind === 'spread') {
    // Läufe neigen sich nach außen (Grafik für die rechte Seite, links gespiegelt)
    const set: [number, number, number, number][] = lvl === 1 ? [[-2.5, 10, 4, 11], [2.5, 25, 4, 11]]
      : lvl === 2 ? [[-3, 10, 5, 15], [3, 25, 5, 15]]
        : [[-5, 8, 4.6, 17], [0, 20, 4.6, 17], [5, 32, 4.6, 17]];
    if (lvl >= 2) s += `<path d="M${cx - 7},${base} L${cx - 5},${base - 6} L${cx + 6},${base - 6} L${cx + 9},${base} Z" ${f(METAL, 1.4)}/>`;
    for (const [dx, a, w, len] of set) {
      const bx = cx + dx;
      s += `<g transform="rotate(${a} ${bx} ${base})">${barrel(bx, base - len, base, w, DARK, { brake: lvl >= 2 })}</g>`;
      const r = (a * Math.PI) / 180;
      tips.push([n2(bx + Math.sin(r) * len), n2(base - Math.cos(r) * len)]);
    }
  } else if (kind === 'missile') {
    const xs = lvl === 1 ? [-3.2, 3.2] : lvl === 2 ? [-5, 0, 5] : [-7.5, -2.5, 2.5, 7.5];
    const tw = lvl === 1 ? 4.6 : 4.4;
    if (lvl >= 2) s += `<rect x="${cx + xs[0] - tw / 2 - 1.8}" y="${tip + 4}" width="${xs[xs.length - 1] - xs[0] + tw + 3.6}" height="${base - tip - 2}" rx="2" ${f(METAL, 1.6)}/>`;
    for (const dx of xs) {
      s += `<rect x="${n2(cx + dx - tw / 2)}" y="${tip + 2}" width="${tw}" height="${base - tip}" rx="1.4" ${f(lvl >= 2 ? DARK : c[0], 1.4)}/>`;
      // Sprengkopf
      s += `<path d="M${n2(cx + dx - tw / 2 + 0.6)},${tip + 4} Q${n2(cx + dx)},${tip - 1.5} ${n2(cx + dx + tw / 2 - 0.6)},${tip + 4} Z" fill="${lvl >= 2 ? c[0] : '#fff'}" stroke="${O}" stroke-width="1"/>`;
      tips.push([cx + dx, tip]);
    }
    if (lvl >= 3) s += `<rect x="${cx - 11}" y="${tip + 10}" width="22" height="2.4" fill="${GOLD}" stroke="${O}" stroke-width="0.9"/>`;
  } else {
    // Strahllaser: Emitter mit Linse, ab Stufe 2 Fokus-Zinken
    const ew = [0, 4, 5, 6.5][lvl];
    if (lvl >= 2) {
      const px = lvl >= 3 ? 9 : 6;
      for (const sd of [-1, 1]) {
        const x = cx + sd * px;
        const pt = tip + 1.8;
        s += `<path d="M${x},${base} L${x},${pt + 5} Q${x},${pt + 1} ${n2(x - sd * 2.5)},${pt}" fill="none" stroke="${O}" stroke-width="4.4" stroke-linecap="round"/>`;
        s += `<path d="M${x},${base} L${x},${pt + 5} Q${x},${pt + 1} ${n2(x - sd * 2.5)},${pt}" fill="none" stroke="${METAL}" stroke-width="2.2" stroke-linecap="round"/>`;
        s += `<circle cx="${n2(x - sd * 2.5)}" cy="${pt}" r="1.4" fill="${c[2]}"/>`;
      }
    }
    s += `<path d="M${cx - ew},${base} L${n2(cx - ew * 0.55)},${tip + 1} L${n2(cx + ew * 0.55)},${tip + 1} L${cx + ew},${base} Z" ${f(c[0], 1.6)}/>`;
    s += `<rect x="${n2(cx - ew * 0.3)}" y="${tip + 2.5}" width="${n2(ew * 0.6)}" height="${base - tip - 5}" rx="1" fill="${c[2]}"/>`;
    if (lvl >= 3) s += `<path d="M${cx},${tip + 0.6} L${cx + 2.6},${tip + 3.6} L${cx},${tip + 7} L${cx - 2.6},${tip + 3.6} Z" fill="#fff" stroke="${O}" stroke-width="1"/>`;
    tips.push([cx, tip]);
  }
  return { s, tips };
}

/** Zickzack-Blitz von (x0,y0) nach (x1,y1); `seed` verschiebt die Zacken (deterministisch, für Animations-Frames) */
function zigzag(x0: number, y0: number, x1: number, y1: number, n: number, amp: number, seed: number): string {
  const dx = x1 - x0, dy = y1 - y0;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / l, ny = dx / l;
  let d = `M${n2(x0)},${n2(y0)}`;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const o = (((i * 7 + seed * 3) % 5) / 4 - 0.5) * 2 * amp * (i % 2 ? 1 : -1);
    d += ` L${n2(x0 + dx * t + nx * o)},${n2(y0 + dy * t + ny * o)}`;
  }
  return `${d} L${n2(x1)},${n2(y1)}`;
}

/** Blitz mit dunklem Saum, hellblauem Leib und weißem Kern */
function bolt3(d: string, w = 1.6): string {
  return `<path d="${d}" fill="none" stroke="${O}" stroke-width="${n2(w + 1.4)}" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="#7CF7FF" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="#fff" stroke-width="${n2(w * 0.4)}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/**
 * Gatling-Trommel von oben: sechs Läufe auf einem Zylinder, `frame` dreht sie um je 20° weiter
 * (bei 60° Laufabstand ergeben drei Frames eine nahtlose Drehung). Lauf 0 ist farbig markiert, damit man die Drehung sieht.
 */
function gatling(cx: number, tip: number, base: number, frame: number, mark: string): string {
  const R = 8.6;
  const bars: { x: number; d: number; i: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 + (frame * Math.PI) / 9;
    bars.push({ x: cx + R * Math.sin(th), d: Math.cos(th), i });
  }
  bars.sort((a, b) => a.d - b.d);
  let s = '';
  for (const b of bars) {
    const col = b.i === 0 ? mark : b.d > 0.4 ? LIGHT : b.d > -0.4 ? METAL : DARK;
    s += barrel(b.x, n2(tip + (1 - b.d) * 0.9), base - 8, 4, col, { sw: 1.1 });
  }
  // Klemmringe halten das Bündel zusammen
  for (const [y, col] of [[tip + 3.2, METAL], [n2((tip + base) / 2 - 4), GOLD]] as [number, string][]) {
    s += `<rect x="${cx - R - 2.6}" y="${n2(y)}" width="${2 * R + 5.2}" height="2.4" rx="1.2" ${f(col, 1.1)}/>`;
  }
  // Trommel: Rippen wandern mit der Drehung mit
  const T = R + 3.6;
  s += `<rect x="${n2(cx - T)}" y="${base - 12}" width="${n2(2 * T)}" height="10" rx="3" ${f(METAL, 1.6)}/>`;
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2 + (frame * Math.PI) / 9;
    if (Math.cos(th) < 0.15) continue;
    const x = n2(cx + (T - 1.6) * Math.sin(th));
    s += `<rect x="${n2(x - 0.8)}" y="${base - 11}" width="1.6" height="8" fill="${Math.cos(th) > 0.7 ? LIGHT : DARK}"/>`;
  }
  s += `<rect x="${n2(cx - T + 0.6)}" y="${base - 8}" width="${n2(2 * T - 1.2)}" height="2.2" fill="${GOLD}" stroke="${O}" stroke-width="0.8"/>`;
  return s;
}

/** Waffenteil der Stufen 4 und 5 (Evolution) oben am Pod */
function podTopHi(kind: WingKind, lvl: number, cx: number, y0: number, frame: number): { s: string; tips: [number, number][]; over: string } {
  const c = WCOL[kind];
  const evo = lvl >= 5;
  const tip = evo ? 1 : 1.2;
  const base = y0 + 4;
  let s = '';
  let over = '';
  const tips: [number, number][] = [];
  if (kind === 'side') {
    if (!evo) {
      // drei Läufe (Dreifachschuss), außen kurze Zusatzläufe
      s += barrel(cx - 12, tip + 9, base, 2.8, METAL) + barrel(cx + 12, tip + 9, base, 2.8, METAL);
      s += `<rect x="${cx - 11}" y="${base - 7}" width="22" height="7" rx="2" ${f(c[1], 1.3)}/>`;
      s += barrel(cx - 7, tip + 3, base, 5, DARK, { brake: true }) + barrel(cx + 7, tip + 3, base, 5, DARK, { brake: true });
      s += barrel(cx, tip, base, 5.6, DARK, { brake: true });
      s += `<rect x="${cx - 11.5}" y="${tip + 9}" width="23" height="2.4" rx="1" fill="${c[0]}" stroke="${O}" stroke-width="1"/>`;
      tips.push([cx - 7, tip + 3], [cx, tip], [cx + 7, tip + 3]);
    } else {
      // Gatling-Batterie: Munitionsgurt rechts, rotierende Trommel
      let belt = '';
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const x = cx + 12 + t * 7, y = base - 8 + t * t * 13;
        belt += `<rect x="${n2(x - 1.6)}" y="${n2(y - 1.1)}" width="3.2" height="2.2" rx="0.6" fill="${GOLD}" stroke="${O}" stroke-width="0.7" transform="rotate(${n2(t * 50)} ${n2(x)} ${n2(y)})"/>`;
      }
      s += gatling(cx, tip, base, frame, c[0]);
      over += belt;
      tips.push([cx - 7, tip], [cx, tip], [cx + 7, tip]);
    }
  } else if (kind === 'rail') {
    if (!evo) {
      // Stufe 4: schwere Schienen mit vier Goldspulen und Kondensatoren
      s += `<rect x="${cx - 11}" y="${base - 9}" width="22" height="8" rx="2.5" ${f(c[1], 1.4)}/>`;
      for (const sd of [-1, 1]) s += `<rect x="${cx + sd * 10 - 2}" y="${tip + 12}" width="4" height="${base - tip - 14}" rx="1.4" ${f(METAL, 1.2)}/><rect x="${cx + sd * 10 - 0.7}" y="${tip + 14}" width="1.4" height="6" fill="${c[2]}"/>`;
      s += rails(cx, tip, base, 4.6, 3.6, 4, GOLD, c[2]);
      tips.push([cx, tip]);
    } else {
      // Tachyonlanze: zwei Schienenpaare, Goldklammer, Lichtbogen dazwischen
      s += `<rect x="${cx - 14}" y="${base - 9}" width="28" height="8" rx="2.5" ${f(GOLD, 1.4)}/>`;
      s += rails(cx - 6, tip, base, 3.4, 3, 4, GOLD, '#fff') + rails(cx + 6, tip, base, 3.4, 3, 4, GOLD, '#fff');
      over += bolt3(zigzag(cx - 6, tip + 3, cx + 6, tip + 3, 4, 1.6, 2), 1.1);
      over += poly(`${cx - 3},${base - 5} ${cx},${base - 8.5} ${cx + 3},${base - 5} ${cx},${base - 1.5}`, f(c[2], 0.9));
      tips.push([cx - 6, tip], [cx + 6, tip]);
    }
  } else if (kind === 'flak') {
    // Stufe 4: Zwillingsmörser hinter Schutzschild; Evolution „Sturmflak“: dicke Goldrohre mit Trommelmagazin
    const w = evo ? 9 : 8;
    const t = tip + (evo ? 3 : 5);
    s += `<rect x="${cx - 13}" y="${base - 9}" width="26" height="8" rx="2.5" ${f(evo ? GOLD : c[1], 1.4)}/>`;
    s += mortar(cx - 6, t, base, w, DARK, evo ? GOLD : c[0]) + mortar(cx + 6, t, base, w, DARK, evo ? GOLD : c[0]);
    for (const sd of [-1, 1]) s += poly(`${cx + sd * 12},${base} ${cx + sd * 15},${t + 6} ${cx + sd * 18},${t + 9} ${cx + sd * 15},${base + 2}`, f(METAL, 1.3));
    if (evo) {
      over += `<circle cx="${cx}" cy="${base - 4}" r="6" ${f(DARK, 1.5)}/><circle cx="${cx}" cy="${base - 4}" r="4.8" fill="none" stroke="${GOLD}" stroke-width="1.3"/>`;
      for (const a of [0, 90, 180, 270]) {
        const r = (a * Math.PI) / 180;
        over += `<circle cx="${n2(cx + Math.sin(r) * 2.6)}" cy="${n2(base - 4 - Math.cos(r) * 2.6)}" r="1.3" fill="${c[0]}" stroke="${O}" stroke-width="0.6"/>`;
      }
    } else s += `<rect x="${cx - 11}" y="${base - 5}" width="22" height="2.2" fill="${GOLD}" stroke="${O}" stroke-width="0.8"/>`;
    tips.push([cx - 6, t], [cx + 6, t]);
  } else if (kind === 'pulse') {
    const w = evo ? 5 : 4.6;
    if (evo) {
      // Reflektorschild: zwei schräge Spiegelplatten mit Goldrahmen, dazwischen ein schimmernder Bogen
      for (const sd of [-1, 1]) {
        const pts = `${cx + sd * 10},${base + 1} ${cx + sd * 21},${tip + 7} ${cx + sd * 24},${tip + 11} ${cx + sd * 14},${base + 4}`;
        s += poly(pts, `fill="none" stroke="${O}" stroke-width="4.4" stroke-linejoin="round"`);
        s += poly(pts, `fill="#C8FCFF" stroke="${GOLD}" stroke-width="1.8" stroke-linejoin="round"`);
        s += `<path d="M${cx + sd * 13},${base} L${cx + sd * 20},${tip + 10}" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`;
        s += `<path d="M${cx + sd * 16},${base + 1.5} L${cx + sd * 21.5},${tip + 13}" stroke="#7CF7FF" stroke-width="0.9" stroke-linecap="round"/>`;
      }
      s += `<path d="M${cx - 21},${tip + 7} Q${cx},${tip - 1.5} ${cx + 21},${tip + 7}" fill="none" stroke="#7CF7FF" stroke-width="1.4" stroke-dasharray="2.6 1.8" opacity="0.85"/>`;
    }
    s += `<rect x="${cx - 12}" y="${base - 8}" width="24" height="7" rx="2.5" ${f(evo ? GOLD : c[1], 1.4)}/>`;
    for (const dx of [-7, 0, 7]) {
      const t = dx === 0 ? tip : tip + 2.5;
      s += barrel(cx + dx, t, base - 2, w, DARK, { rings: 3, ring: evo ? GOLD : '#7CF7FF' });
      s += `<circle cx="${cx + dx}" cy="${t + 1.2}" r="1.5" fill="#B8FBFF"/>`;
      tips.push([cx + dx, t]);
    }
    if (!evo) s += `<rect x="${cx - 14}" y="${base - 6}" width="3" height="3" rx="1" fill="#7CF7FF" stroke="${O}" stroke-width="0.9"/><rect x="${cx + 11}" y="${base - 6}" width="3" height="3" rx="1" fill="#7CF7FF" stroke="${O}" stroke-width="0.9"/>`;
    else over += poly(`${cx - 2.6},${base - 4.5} ${cx},${base - 7} ${cx + 2.6},${base - 4.5} ${cx},${base - 2}`, f('#7CF7FF', 0.9));
  } else if (kind === 'spread') {
    // vier Läufe im Fächer (rechte Seite; links gespiegelt), Evolution: Splitterkronen und Trommelmagazin
    const set: [number, number][] = [[-7, 6], [-2.5, 16], [2.5, 26], [7, 36]];
    const len = base - (evo ? 6 : 4);
    const w = evo ? 5 : 4.4;
    s += `<path d="M${cx - 10},${base} L${cx - 8},${base - 7} L${cx + 9},${base - 7} L${cx + 13},${base} Z" ${f(METAL, 1.4)}/>`;
    for (const [dx, a] of set) {
      const bx = cx + dx;
      const top = base - len;
      let g = barrel(bx, top, base, w, DARK, { brake: !evo });
      if (evo) {
        g += `<rect x="${n2(bx - w / 2 - 1)}" y="${n2(top + 0.4)}" width="${n2(w + 2)}" height="2.6" rx="1" ${f(GOLD, 1)}/>`;
        for (const k of [-1, 0, 1]) g += poly(`${n2(bx + k * 2 - 1)},${n2(top + 0.8)} ${n2(bx + k * 2.6)},${n2(top - 2.4 + Math.abs(k) * 0.8)} ${n2(bx + k * 2 + 1)},${n2(top + 0.8)}`, f(GOLD, 0.8));
      }
      s += `<g transform="rotate(${a} ${bx} ${base})">${g}</g>`;
      const r = (a * Math.PI) / 180;
      const l2 = evo ? len + 2 : len;
      tips.push([n2(bx + Math.sin(r) * l2), n2(base - Math.cos(r) * l2)]);
    }
    if (evo) {
      // Trommelmagazin mit drei Splittergranaten
      const mx = cx + 1, my = base - 3;
      over += `<circle cx="${mx}" cy="${my}" r="6.6" ${f(DARK, 1.6)}/>`;
      over += `<circle cx="${mx}" cy="${my}" r="5.4" fill="none" stroke="${GOLD}" stroke-width="1.4"/>`;
      for (const a of [0, 120, 240]) {
        const r = (a * Math.PI) / 180;
        over += `<circle cx="${n2(mx + Math.sin(r) * 2.6)}" cy="${n2(my - Math.cos(r) * 2.6)}" r="1.5" fill="${c[0]}" stroke="${O}" stroke-width="0.7"/>`;
      }
    } else s += `<rect x="${cx - 9}" y="${base - 5}" width="20" height="2.2" fill="${GOLD}" stroke="${O}" stroke-width="0.8"/>`;
  } else if (kind === 'missile') {
    if (!evo) {
      // fünf Rohre in gepanzertem Kasten, zwei Raketen pro Salve
      const xs = [-9.6, -4.8, 0, 4.8, 9.6];
      const tw = 4.2;
      s += `<rect x="${cx - 13.5}" y="${tip + 4}" width="27" height="${base - tip - 1}" rx="2.4" ${f(METAL, 1.6)}/>`;
      for (const sd of [-1, 1]) s += `<rect x="${cx + sd * 13.5 - 2}" y="${tip + 7}" width="4" height="${base - tip - 6}" rx="1.4" ${f(DARK, 1.2)}/>`;
      for (const dx of xs) {
        s += `<rect x="${n2(cx + dx - tw / 2)}" y="${tip + 2}" width="${tw}" height="${base - tip}" rx="1.4" ${f(DARK, 1.3)}/>`;
        s += `<path d="M${n2(cx + dx - tw / 2 + 0.6)},${tip + 4} Q${n2(cx + dx)},${tip - 1.5} ${n2(cx + dx + tw / 2 - 0.6)},${tip + 4} Z" fill="${c[0]}" stroke="${O}" stroke-width="1"/>`;
      }
      s += `<rect x="${cx - 13}" y="${tip + 10}" width="26" height="2.4" fill="${GOLD}" stroke="${O}" stroke-width="0.9"/>`;
      s += `<rect x="${cx - 12}" y="${tip + 14}" width="24" height="1.6" fill="${DARK}"/>`;
      tips.push([cx - 4.8, tip], [cx + 4.8, tip]);
    } else {
      // Raketenschwarm: drei dicke Rohre mit goldenen Sprengköpfen, außen Mini-Raketengestelle
      for (const sd of [-1, 1]) {
        const x = cx + sd * 17;
        s += `<rect x="${x - 3.5}" y="${base - 7}" width="7" height="13" rx="2" ${f(DARK, 1.3)}/>`;
        for (const dy of [0, 5]) s += `<circle cx="${x}" cy="${base - 4 + dy}" r="1.7" fill="${c[0]}" stroke="${O}" stroke-width="0.8"/>`;
      }
      s += `<rect x="${cx - 13.5}" y="${tip + 6}" width="27" height="${base - tip - 3}" rx="3" ${f(c[1], 1.6)}/>`;
      for (const dx of [-8, 0, 8]) {
        const t = dx === 0 ? tip : tip + 2;
        s += `<rect x="${cx + dx - 3.3}" y="${t + 3}" width="6.6" height="${base - t}" rx="2" ${f(DARK, 1.4)}/>`;
        for (const ry of [t + 9, t + 13]) s += `<rect x="${cx + dx - 3.9}" y="${ry}" width="7.8" height="1.8" rx="0.8" fill="${GOLD}" stroke="${O}" stroke-width="0.8"/>`;
        s += `<path d="M${cx + dx - 2.7},${t + 5} Q${cx + dx},${t - 2} ${cx + dx + 2.7},${t + 5} Z" fill="${c[0]}" stroke="${O}" stroke-width="1.1"/>`;
        s += `<path d="M${cx + dx - 1},${t + 1.4} Q${cx + dx},${t - 0.6} ${cx + dx + 1},${t + 1.4} Z" fill="${GOLD}"/>`;
        tips.push([cx + dx, t]);
      }
    }
  } else {
    // Strahllaser: Stufe 4 mit vier Fokus-Zinken, Evolution „Todesstrahl“ mit Elektroden, Kettenblitzen und Fokusring
    const prongs: [number, number, string][] = evo ? [[13, tip + 4, METAL]] : [[9, tip + 1.8, METAL], [13.5, tip + 7, DARK]];
    for (const [px, pt, col] of prongs) {
      for (const sd of [-1, 1]) {
        const x = cx + sd * px;
        const d = `M${x},${base} L${x},${pt + 5} Q${x},${pt + 1} ${n2(x - sd * 2.8)},${pt}`;
        s += `<path d="${d}" fill="none" stroke="${O}" stroke-width="${evo ? 5 : 4.4}" stroke-linecap="round"/>`;
        s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${evo ? 2.8 : 2.2}" stroke-linecap="round"/>`;
        s += `<circle cx="${n2(x - sd * 2.8)}" cy="${pt}" r="${evo ? 2.1 : 1.4}" fill="${evo ? '#B8FBFF' : c[2]}" ${evo ? `stroke="${O}" stroke-width="0.9"` : ''}/>`;
      }
    }
    const ew = evo ? 8.5 : 7.5;
    if (evo) over += `<rect x="${cx - 10}" y="${base - 8}" width="20" height="4" rx="1.5" ${f(GOLD, 1.3)}/>`;
    s += `<path d="M${cx - ew},${base} L${n2(cx - ew * 0.55)},${tip + 1} L${n2(cx + ew * 0.55)},${tip + 1} L${cx + ew},${base} Z" ${f(c[0], 1.6)}/>`;
    s += `<rect x="${n2(cx - ew * 0.3)}" y="${tip + 2.5}" width="${n2(ew * 0.6)}" height="${base - tip - 5}" rx="1" fill="${c[2]}"/>`;
    if (!evo) over += `<rect x="${cx - 8}" y="${base - 7.5}" width="16" height="2.4" fill="${GOLD}" stroke="${O}" stroke-width="0.8"/>`;
    if (evo) {
      for (const sd of [-1, 1]) s += bolt3(zigzag(cx + sd * 10, tip + 4.5, cx + sd * 3, tip + 6, 3, 1.4, sd + 2), 1.2);
      s += `<ellipse cx="${cx}" cy="${tip + 9}" rx="9" ry="2.6" fill="none" stroke="${O}" stroke-width="3.4"/>`;
      s += `<ellipse cx="${cx}" cy="${tip + 9}" rx="9" ry="2.6" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`;
    }
    const dr = evo ? 3.4 : 3;
    s += `<path d="M${cx},${tip + 0.4} L${cx + dr},${n2(tip + 0.4 + dr * 1.15)} L${cx},${n2(tip + 0.4 + dr * 2.4)} L${cx - dr},${n2(tip + 0.4 + dr * 1.15)} Z" fill="#fff" stroke="${O}" stroke-width="1"/>`;
    tips.push([cx, tip]);
  }
  return { s, tips, over };
}

/** Flügel-Anbau je Waffe und Stufe (Grafik für die rechte Seite; links mit negativer x-Skalierung gespiegelt) */
function wingPod(key: string, kind: WingKind, lvl: number, frame = 0): string {
  const bw = [0, 12, 16, 22, 24, 26][lvl];
  const bh = [0, 20, 25, 32, 35, 38][lvl];
  const W = [0, 20, 28, 42, 50, 58][lvl];
  const cx = W / 2;
  const y0 = [0, 13, 14, 17, 20, 23][lvl];
  const H = y0 + bh + 5;
  const ay = 20;
  const top = podTop(kind, lvl, cx, y0, frame);
  const body = podBody(lvl, cx, y0, bw, bh, WCOL[kind]);
  // Raketen: Werfer liegt über dem Körper, sonst Läufe dahinter
  const art = (kind === 'missile' ? body + top.s : top.s + body) + (top.over ?? '');
  META[key] = { w: W, h: H, ax: cx, ay, tips: top.tips.map(([x, y]) => [n2(x - cx), n2(y - ay)]), lamp: [0, n2(y0 + bh * 0.42 - ay)] };
  return svg(W, H, art);
}

/** Gitterträger zwischen Rumpf und Stufe-3-Pod (Grafik zeigt nach rechts) */
function pylon(): string {
  const W = 26, H = 12;
  META.pylon = { w: W, h: H, ax: W - 2, ay: 6, tips: [], lamp: [0, 0] };
  let lat = '';
  for (let x = 3; x < W - 3; x += 5) lat += `M${x},3.5 L${x + 2.5},8.5 L${x + 5},3.5 `;
  return svg(W, H, `
    <rect x="1" y="2" width="${W - 2}" height="8" rx="2" fill="${DARK}" stroke="${O}" stroke-width="1.8"/>
    <path d="${lat}" fill="none" stroke="${METAL}" stroke-width="1.5"/>
    <rect x="1.5" y="2.4" width="${W - 3}" height="1.8" fill="${LIGHT}"/>
    <rect x="${W - 6}" y="1" width="4.5" height="10" rx="1.5" ${f(METAL, 1.4)}/>
    <circle cx="${W - 3.75}" cy="6" r="1" fill="${O}"/>`);
}

/**
 * Ausleger: breiter Gitterträger quer unter dem Schiff mit Halterungen für die äußeren Pods.
 * `hps` = Halterungen (Abstand von der Mitte): eine (Stufe 1) oder zwei (Stufe 2); bei größeren
 * Schiffsklassen rücken sie nach außen.
 */
function rigTruss(key = 'rig', hps: number[] = [68], root = 20): string {
  const HP = hps[hps.length - 1];
  const cx = HP + 14, W = 2 * cx, H = 26, cy = 12;
  // Gurte laufen nach außen zusammen (innen 12 hoch, außen 7)
  const half = (x: number) => 6 - (Math.abs(x - cx) / HP) * 2.6;
  let lat = '';
  for (let x = 12; x < W - 12; x += 6) {
    if (Math.abs(x + 3 - cx) < 12) continue;
    const xm = x + 3;
    lat += `M${x},${n2(cy - half(x))} L${xm},${n2(cy + half(xm))} L${x + 6},${n2(cy - half(x + 6))} `;
  }
  const chord = (sd: number) => {
    const pts = [[cx - HP - 2, cy + sd * half(cx - HP)], [cx, cy + sd * 6], [cx + HP + 2, cy + sd * half(cx + HP)]];
    return `M${pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' L')}`;
  };
  let s = `<path d="${lat}" fill="none" stroke="${O}" stroke-width="3.4" stroke-linejoin="round"/>`;
  s += `<path d="${lat}" fill="none" stroke="${DARK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  for (const sd of [-1, 1]) {
    s += `<path d="${chord(sd)}" fill="none" stroke="${O}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<path d="${chord(sd)}" fill="none" stroke="${sd < 0 ? LIGHT : METAL}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // Wurzelplatten am Rumpf
  for (const sd of [-1, 1]) {
    s += `<rect x="${cx + sd * root - 5}" y="${cy - 6.5}" width="10" height="13" rx="2" ${f(METAL, 1.8)}/>`;
    s += `<circle cx="${cx + sd * root}" cy="${cy - 3}" r="1" fill="${O}"/><circle cx="${cx + sd * root}" cy="${cy + 3}" r="1" fill="${O}"/>`;
  }
  // Halterungen mit Warnstreifen; Positionslicht am äußeren Ende (links rot, rechts grün)
  for (const hp of hps) {
    for (const sd of [-1, 1]) {
      const x = cx + sd * hp;
      s += `<rect x="${x - 6}" y="${cy - 8}" width="12" height="16" rx="3" ${f(METAL, 2)}/>`;
      s += `<rect x="${x - 4}" y="${cy - 2}" width="8" height="4" fill="${GOLD}"/>`;
      s += `<path d="M${x - 3},${cy + 2} L${x - 1},${cy - 2} M${x + 1},${cy + 2} L${x + 3},${cy - 2}" stroke="${O}" stroke-width="1.4"/>`;
      s += `<rect x="${x - 4}" y="${cy - 2}" width="8" height="4" fill="none" stroke="${O}" stroke-width="1"/>`;
      if (hp !== HP) continue;
      s += `<rect x="${x + sd * 6 - (sd < 0 ? 3 : 0)}" y="${cy - 3}" width="3" height="6" rx="1" ${f(DARK, 1.2)}/>`;
      s += `<circle cx="${x + sd * 10.5}" cy="${cy}" r="2.2" fill="${sd < 0 ? '#FF3D6E' : '#3BF0A0'}" stroke="${O}" stroke-width="1.2"/>`;
    }
  }
  META[key] = { w: W, h: H, ax: cx, ay: cy, tips: [], lamp: [HP + 10.5, 0] };
  return svg(W, H, s);
}

/** Rumpf-Aufsatz der Stufen 4 und 5 (Evolution); Koordinaten wie coreMount (Schiffsmitte cx, cy) */
function coreHi(kind: CoreKind, lvl: number, cx: number, cy: number, frame: number): { s: string; tips: [number, number][]; lamp: [number, number] } {
  const evo = lvl >= 5;
  let s = '';
  let tips: [number, number][] = [];
  let lamp: [number, number] = [0, 0];
  const PURPLE = '#C04BE8', PINK = '#F0B8FF';
  if (kind === 'laser') {
    if (!evo) {
      // Stufe 4: dicker Hauptlauf, zwei Seitenläufe, Kondensator-Flossen
      const tip = cy - 51.5;
      for (const sd of [-1, 1]) {
        s += `<rect x="${cx + sd * 13 - 2}" y="${cy - 37}" width="4" height="13" rx="1.6" ${f(PURPLE, 1.4)}/>`;
        s += `<rect x="${cx + sd * 13 - 0.7}" y="${cy - 35}" width="1.4" height="9" fill="${PINK}"/>`;
        s += barrel(cx + sd * 8, cy - 43, cy - 18, 3.8, METAL, { brake: true }) + `<circle cx="${cx + sd * 8}" cy="${cy - 43.5}" r="1.6" fill="${PINK}"/>`;
      }
      s += barrel(cx, tip, cy - 20, 11, PURPLE, { rings: 3, ring: PINK, sw: 1.9 });
      s += `<rect x="${cx - 2}" y="${tip + 3}" width="4" height="${cy - 26 - tip}" fill="#F6DAFF"/>`;
      s += `<rect x="${cx - 10.5}" y="${cy - 27}" width="21" height="8" rx="2.8" ${f(PURPLE, 1.8)}/>`;
      s += `<rect x="${cx - 3.5}" y="${cy - 25}" width="7" height="3" rx="1" fill="${PINK}"/>`;
      s += `<rect x="${cx - 7.4}" y="${tip - 0.8}" width="14.8" height="3.8" rx="1.2" ${f(GOLD, 1.3)}/>`;
      s += `<rect x="${cx - 7}" y="${tip + 4}" width="14" height="2.2" rx="1" ${f(DARK, 1)}/>`;
      tips = [[0, tip - cy]];
      lamp = [0, tip + 2 - cy];
    } else {
      // Prismalanze: zwei Lanzen, dazwischen ein Prismakristall, goldene Halterung mit Schwingen
      const tip = cy - 53;
      for (const sd of [-1, 1]) {
        s += poly(`${cx + sd * 11},${cy - 29} ${cx + sd * 18},${cy - 21} ${cx + sd * 11},${cy - 19}`, f(GOLD, 1.5));
        s += barrel(cx + sd * 6.5, tip, cy - 22, 5.2, PURPLE, { rings: 3, ring: PINK, sw: 1.6 });
        s += `<rect x="${cx + sd * 6.5 - 3.6}" y="${tip - 0.8}" width="7.2" height="3.2" rx="1.2" ${f(GOLD, 1.2)}/>`;
      }
      s += `<rect x="${cx - 12}" y="${cy - 29}" width="24" height="9" rx="3" ${f(GOLD, 1.8)}/>`;
      s += `<rect x="${cx - 9}" y="${cy - 26}" width="18" height="2.4" rx="1" fill="${PURPLE}" stroke="${O}" stroke-width="0.8"/>`;
      // Prisma: sechseckiger Kristall mit farbigen Facetten (Regenbogen-Schimmer)
      const t = cy - 51, m1 = cy - 44, m2 = cy - 34, b = cy - 28, hw = 5.6;
      const P = { t: [cx, t], l1: [cx - hw, m1], r1: [cx + hw, m1], l2: [cx - hw, m2], r2: [cx + hw, m2], b: [cx, b], c: [cx, cy - 39] };
      const tri = (a: number[], b2: number[], c2: number[], col: string) => `<polygon points="${a.join(',')} ${b2.join(',')} ${c2.join(',')}" fill="${col}"/>`;
      s += poly(`${P.t.join(',')} ${P.r1.join(',')} ${P.r2.join(',')} ${P.b.join(',')} ${P.l2.join(',')} ${P.l1.join(',')}`, f('#F6DAFF', 1.8));
      s += tri(P.t, P.l1, P.c, '#FFFFFF') + tri(P.t, P.r1, P.c, '#7CF7FF') + tri(P.r1, P.r2, P.c, '#3BF0A0');
      s += tri(P.r2, P.b, P.c, GOLD) + tri(P.b, P.l2, P.c, '#FF7AB8') + tri(P.l2, P.l1, P.c, '#C08BFF');
      s += poly(`${P.t.join(',')} ${P.r1.join(',')} ${P.r2.join(',')} ${P.b.join(',')} ${P.l2.join(',')} ${P.l1.join(',')}`, `fill="none" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"`);
      s += `<circle cx="${cx}" cy="${cy - 39}" r="1.6" fill="#fff"/>`;
      s += shine(cx - 2.4, cy - 46, 1, 1.8, 30);
      tips = [[-6.5, tip - cy], [6.5, tip - cy]];
      lamp = [0, -39];
    }
  } else if (kind === 'arc') {
    if (!evo) {
      // Stufe 4: sechs Kronen-Zinken, vier Spulen, große Kugel
      const oy = cy - 44.5, r = 7;
      for (const a of [-70, -42, -16, 16, 42, 70]) {
        const rad = (a * Math.PI) / 180;
        const x1 = cx + Math.sin(rad) * (r + 5), y1 = oy - Math.cos(rad) * (r + 5) + 2;
        const d = `M${n2(cx + Math.sin(rad) * 3)},${oy + 10} Q${n2(cx + Math.sin(rad) * (r + 6))},${oy + 5} ${n2(x1)},${n2(y1)}`;
        s += `<path d="${d}" fill="none" stroke="${O}" stroke-width="4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${METAL}" stroke-width="2" stroke-linecap="round"/>`;
        s += `<circle cx="${n2(x1)}" cy="${n2(y1)}" r="1.5" fill="#B8FBFF" stroke="${O}" stroke-width="0.8"/>`;
      }
      s += `<rect x="${cx - 3}" y="${oy}" width="6" height="${cy - 22 - oy}" rx="1.5" ${f(DARK, 1.6)}/>`;
      for (let i = 0; i < 4; i++) {
        s += `<ellipse cx="${cx}" cy="${oy + 9 + i * 4.2}" rx="${n2(5 + (4 - i) * 0.9)}" ry="1.9" fill="${i === 0 ? GOLD : '#2EC4FF'}" stroke="${O}" stroke-width="1.2"/>`;
      }
      s += `<circle cx="${cx}" cy="${oy}" r="${r}" ${f('#7CF7FF', 1.9)}/><circle cx="${cx}" cy="${oy}" r="3.5" fill="#fff"/>`;
      s += `<path d="M${cx - 4.2},${oy - 0.7} L${cx - 0.7},${oy + 1.8} L${cx + 0.4},${oy - 1.8} L${cx + 4.2},${oy + 0.7}" fill="none" stroke="#1A6FB0" stroke-width="1"/>`;
      s += `<rect x="${cx - 10}" y="${cy - 27}" width="20" height="7" rx="2.5" ${f(METAL, 1.8)}/>`;
      tips = [[0, oy - cy]];
      lamp = [0, oy - cy];
    } else {
      // Gewittersturm: goldene Krone mit sechs Zinken, Blitze zwischen Kugel und Zinken (je Frame andere), pulsierende Kugel
      const oy = cy - 43.5;
      const r = 7.4 + [0, 0.7, 0.35][frame];
      const angs = [-76, -46, -16, 16, 46, 76];
      const ends = angs.map((a) => {
        const rad = (a * Math.PI) / 180;
        return [n2(cx + Math.sin(rad) * 13.5), n2(oy - Math.cos(rad) * 13.5 + 3)] as [number, number];
      });
      s += `<circle cx="${cx}" cy="${oy}" r="${n2(r + 4)}" fill="#7CF7FF" opacity="${[0.22, 0.34, 0.28][frame]}"/>`;
      s += `<rect x="${cx - 3.2}" y="${oy}" width="6.4" height="${cy - 22 - oy}" rx="1.5" ${f(DARK, 1.6)}/>`;
      for (let i = 0; i < 5; i++) {
        s += `<ellipse cx="${cx}" cy="${n2(oy + 10 + i * 3.6)}" rx="${n2(5 + (5 - i) * 0.9)}" ry="1.8" fill="${i % 2 ? '#2EC4FF' : GOLD}" stroke="${O}" stroke-width="1.1"/>`;
      }
      angs.forEach((a, i) => {
        const rad = (a * Math.PI) / 180;
        const [x1, y1] = ends[i];
        const d = `M${n2(cx + Math.sin(rad) * 4)},${oy + 8} Q${n2(cx + Math.sin(rad) * 14)},${oy + 6} ${x1},${y1}`;
        s += `<path d="${d}" fill="none" stroke="${O}" stroke-width="4.2" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${GOLD}" stroke-width="2.2" stroke-linecap="round"/>`;
      });
      s += `<ellipse cx="${cx}" cy="${oy + 8}" rx="9" ry="2.6" ${f(GOLD, 1.4)}/>`;
      // Blitze: Kugel → Zinken (abwechselnd je Frame) und kleine Kronenblitze nach außen
      angs.forEach((a, i) => {
        if ((i + frame) % 2) return;
        const rad = (a * Math.PI) / 180;
        const [x1, y1] = ends[i];
        s += bolt3(zigzag(n2(cx + Math.sin(rad) * r), n2(oy - Math.cos(rad) * r), x1, y1, 3, 1.3, i + frame), 1.1);
        const ox = x1 + Math.sin(rad) * 4.5, oy2 = Math.max(1.5, y1 - Math.cos(rad) * 4.5);
        s += bolt3(zigzag(x1, y1, n2(ox), n2(oy2), 2, 1, frame + i * 2), 0.9);
      });
      for (const [x1, y1] of ends) s += `<circle cx="${x1}" cy="${y1}" r="1.7" fill="#fff" stroke="${O}" stroke-width="0.9"/>`;
      s += `<circle cx="${cx}" cy="${oy}" r="${n2(r)}" ${f('#7CF7FF', 1.9)}/><circle cx="${cx}" cy="${oy}" r="${n2(r * 0.52)}" fill="#fff"/>`;
      s += `<path d="${zigzag(cx - r * 0.65, oy, cx + r * 0.65, oy, 4, 1.2, frame)}" fill="none" stroke="#1A6FB0" stroke-width="1"/>`;
      s += `<rect x="${cx - 11}" y="${cy - 27}" width="22" height="7" rx="2.5" ${f(GOLD, 1.8)}/>`;
      s += `<rect x="${cx - 7}" y="${cy - 25}" width="14" height="2.4" rx="1" fill="#2EC4FF" stroke="${O}" stroke-width="0.8"/>`;
      tips = [[0, oy - cy]];
      lamp = [0, oy - cy];
    }
  } else if (kind === 'rear') {
    const col = '#F2A93B';
    if (!evo) {
      // Stufe 4: dicker Mittellauf mit Doppelbremse, kräftigere Seitenläufe
      const by = cy + 22;
      for (const a of [45, 80]) {
        for (const sd of [-1, 1]) {
          const len = a === 80 ? 13 : 17;
          s += `<g transform="rotate(${-sd * a} ${cx + sd * 5} ${by - 4})">${barrel(cx + sd * 5, by - 4, by - 4 + len, 4.6, col, { sw: 1.4 })}`
            + `<rect x="${cx + sd * 5 - 3.1}" y="${by - 4 + len - 2.6}" width="6.2" height="2.8" rx="1" ${f(DARK, 1.1)}/></g>`;
        }
      }
      const end = by + 13;
      s += barrel(cx, by - 4, end, 8.5, col, { sw: 1.9 });
      s += `<rect x="${cx - 5.5}" y="${end - 3}" width="11" height="3.4" rx="1" ${f(GOLD, 1.3)}/>`;
      s += `<rect x="${cx - 5.2}" y="${end - 8}" width="10.4" height="2.6" rx="1" ${f(DARK, 1.1)}/>`;
      for (const sd of [-1, 1]) s += `<rect x="${cx + sd * 9 - 3}" y="${cy + 12}" width="6" height="12" rx="1.8" ${f(DARK, 1.4)}/>`;
      s += `<rect x="${cx - 8.5}" y="${cy + 10}" width="17" height="14" rx="4.5" ${f(METAL)}/>`;
      s += `<rect x="${cx - 6}" y="${cy + 21}" width="12" height="1.8" fill="${GOLD}"/>`;
      s += `<circle cx="${cx}" cy="${cy + 16.5}" r="2.8" ${f('#FFE7B0', 1.2)}/>`;
      tips = [[0, end - cy]];
      lamp = [0, 16.5];
    } else {
      // Igel: Kuppel mit Läufen in alle Schussrichtungen und Zierstacheln dazwischen
      const oy = cy + 19;
      const dirs = [0, 45, -45, 80, -80, 125, -125];
      for (const g of [77.5, -77.5, 117.5, -117.5, 157.5, -157.5, 22, -22]) {
        const a = 180 - g;
        s += `<g transform="rotate(${a} ${cx} ${oy})">${poly(`${cx - 1.9},${oy - 7} ${cx},${oy - 14.5} ${cx + 1.9},${oy - 7}`, f(METAL, 1.2))}`
          + `<polygon points="${cx - 0.75},${oy - 12} ${cx},${oy - 14.5} ${cx + 0.75},${oy - 12}" fill="${GOLD}"/></g>`;
      }
      for (const d of dirs) {
        const a = 180 - d;
        s += `<g transform="rotate(${a} ${cx} ${oy})">${barrel(cx, oy - 18, oy - 5, 4.2, col, { sw: 1.4 })}`
          + `<rect x="${cx - 2.9}" y="${oy - 18.6}" width="5.8" height="2.8" rx="1" ${f(GOLD, 1.1)}/></g>`;
        const rad = (a * Math.PI) / 180;
        tips.push([n2(Math.sin(rad) * 18), n2(19 - Math.cos(rad) * 18)]);
      }
      s += `<circle cx="${cx}" cy="${oy}" r="9" ${f(col, 2)}/>`;
      s += `<path d="M${cx - 8.4},${oy + 2} A8.4,8.4 0 0 0 ${cx + 8.4},${oy + 2} Z" fill="#B87412"/>`;
      s += `<circle cx="${cx}" cy="${oy}" r="5.6" fill="none" stroke="${GOLD}" stroke-width="1.8"/>`;
      s += `<circle cx="${cx}" cy="${oy}" r="2.8" ${f('#FFE7B0', 1.2)}/>`;
      s += shine(cx - 3.5, oy - 4, 1.4, 0.9, -30);
      lamp = [0, 19];
    }
  } else {
    // Drohnenhangar: Stufe 4 mit vier Antennen, Evolution mit drei goldenen Andockbuchten für den Schwarm
    const hy = cy + 13;
    if (!evo) {
      for (const [ex, ey] of [[16, 24], [18, 13]] as [number, number][]) {
        for (const sd of [-1, 1]) {
          s += `<path d="M${cx + sd * 8},${hy + 3} L${cx + sd * ex},${cy + ey}" stroke="${O}" stroke-width="4" stroke-linecap="round"/><path d="M${cx + sd * 8},${hy + 3} L${cx + sd * ex},${cy + ey}" stroke="${METAL}" stroke-width="2" stroke-linecap="round"/>`;
          s += `<circle cx="${cx + sd * ex}" cy="${cy + ey}" r="2.6" ${f(ey > 20 ? GOLD : '#2EC4FF', 1.3)}/>`;
        }
      }
      s += `<circle cx="${cx}" cy="${hy}" r="10" ${f(METAL)}/>`;
      s += `<path d="M${cx - 9},${hy + 1} A9,9 0 0 0 ${cx + 9},${hy + 1} Z" fill="${DARK}"/>`;
      s += `<circle cx="${cx}" cy="${hy}" r="7" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`;
      s += `<circle cx="${cx}" cy="${hy}" r="4.6" ${f('#2EC4FF', 1.4)}/>`;
      s += shine(cx - 3, hy - 3.5, 1.3, 0.8, -30);
    } else {
      const bays: [number, number][] = [[-15, 6], [15, 6], [0, 13]];
      for (const [bx, by] of bays) {
        s += `<path d="M${cx},${hy} L${cx + bx},${hy + by}" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M${cx},${hy} L${cx + bx},${hy + by}" stroke="${GOLD}" stroke-width="2.6" stroke-linecap="round"/>`;
      }
      for (const [bx, by] of bays) {
        s += `<circle cx="${cx + bx}" cy="${hy + by}" r="4.6" ${f(DARK, 1.5)}/>`;
        s += `<circle cx="${cx + bx}" cy="${hy + by}" r="2.4" fill="#7CF7FF" stroke="${O}" stroke-width="0.9"/>`;
      }
      s += `<circle cx="${cx}" cy="${hy}" r="10" ${f(GOLD)}/>`;
      s += `<path d="M${cx - 9},${hy + 1} A9,9 0 0 0 ${cx + 9},${hy + 1} Z" fill="#C49A1E"/>`;
      s += `<circle cx="${cx}" cy="${hy}" r="6.4" ${f(METAL, 1.4)}/>`;
      s += `<circle cx="${cx}" cy="${hy}" r="4" ${f('#2EC4FF', 1.4)}/>`;
      s += `<path d="${zigzag(cx - 3, hy, cx + 3, hy, 3, 1, 1)}" fill="none" stroke="#fff" stroke-width="1"/>`;
      s += shine(cx - 4, hy - 4, 1.4, 0.9, -30);
    }
    lamp = [0, 13];
  }
  return { s, tips, lamp };
}

type CoreKind = 'laser' | 'rear' | 'drone' | 'arc' | 'plasma';

/** Plasma-Orb: Reaktorkugel in Klauen auf der Nase; je Stufe größer, Stufe 4 mit Fokusring, Evolution „Sonnenkern“ golden mit Strahlenkranz */
function corePlasma(lvl: number, cx: number, cy: number): { s: string; tips: [number, number][]; lamp: [number, number] } {
  const G = '#3BF0A0', GD = '#128A5A', GL = '#C8FFE8';
  const evo = lvl >= 5;
  const r = [0, 4.6, 5.6, 6.6, 7.6, 8.6][lvl];
  const oy = cy - 40 - lvl * 1.5;
  let s = '';
  // Sockel und Stiel
  s += `<rect x="${cx - 3}" y="${oy + r - 1}" width="6" height="${cy - 22 - oy - r + 1}" rx="1.6" ${f(DARK, 1.6)}/>`;
  s += `<rect x="${cx - 5.5 - lvl}" y="${cy - 27}" width="${11 + 2 * lvl}" height="7" rx="2.5" ${f(evo ? GOLD : METAL, 1.8)}/>`;
  if (lvl >= 2) s += `<rect x="${cx - 3}" y="${cy - 25}" width="6" height="3" rx="1" fill="${G}"/>`;
  // Strahlenkranz (Evolution)
  if (evo) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x0 = cx + Math.sin(a) * (r + 2), y0 = oy - Math.cos(a) * (r + 2);
      const x1 = cx + Math.sin(a) * (r + 7.5), y1 = oy - Math.cos(a) * (r + 7.5);
      s += `<path d="M${n2(x0)},${n2(y0)} L${n2(x1)},${n2(y1)}" stroke="${O}" stroke-width="3.6" stroke-linecap="round"/><path d="M${n2(x0)},${n2(y0)} L${n2(x1)},${n2(y1)}" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round"/>`;
    }
  }
  // Klauen (2, ab Stufe 3 vier)
  const claws = lvl >= 3 ? [-62, -28, 28, 62] : [-45, 45];
  for (const a of claws) {
    const rad = (a * Math.PI) / 180;
    const x1 = cx + Math.sin(rad) * (r + 2.2), y1 = oy - Math.cos(rad) * (r + 2.2) + 1;
    const d = `M${n2(cx + Math.sin(rad) * 3)},${n2(oy + r + 5)} Q${n2(cx + Math.sin(rad) * (r + 7))},${n2(oy + 4)} ${n2(x1)},${n2(y1)}`;
    s += `<path d="${d}" fill="none" stroke="${O}" stroke-width="4.2" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${evo ? GOLD : METAL}" stroke-width="2.1" stroke-linecap="round"/>`;
  }
  // Kugel
  s += `<circle cx="${cx}" cy="${oy}" r="${r}" ${f(evo ? '#FFE9A0' : G, 1.9)}/>`;
  s += `<path d="M${n2(cx - r + 0.8)},${n2(oy + 1)} A${n2(r - 0.8)},${n2(r - 0.8)} 0 0 0 ${n2(cx + r - 0.8)},${n2(oy + 1)} Z" fill="${evo ? '#F2A93B' : GD}" opacity="0.7"/>`;
  s += `<circle cx="${cx}" cy="${oy}" r="${n2(r * 0.55)}" fill="${evo ? '#fff' : GL}"/><circle cx="${cx}" cy="${oy}" r="${n2(r * 0.25)}" fill="#fff"/>`;
  // Fokusring (ab Stufe 4)
  if (lvl >= 4) {
    s += `<ellipse cx="${cx}" cy="${oy + r * 0.2}" rx="${n2(r + 3.4)}" ry="2.6" fill="none" stroke="${O}" stroke-width="3.2"/>`;
    s += `<ellipse cx="${cx}" cy="${oy + r * 0.2}" rx="${n2(r + 3.4)}" ry="2.6" fill="none" stroke="${evo ? GOLD : G}" stroke-width="1.5"/>`;
  }
  s += shine(n2(cx - r * 0.4), n2(oy - r * 0.45), 1.3, 0.8, -30);
  return { s, tips: [[0, oy - r - cy]], lamp: [0, oy - cy] };
}

/** Rumpf-Aufsatz je Waffe und Stufe; Anker = Schiffsmitte. Liegt über dem Schiff: Laser/Blitz auf der Nase, Heckkanone und Hangar hinten */
function coreMount(key: string, kind: CoreKind, lvl: number, icon = false, frame = 0): string {
  const W = 44, H = 104, cx = 22, cy = 58;
  let s = '';
  let tips: [number, number][] = [];
  let lamp: [number, number] = [0, 0];
  if (kind === 'plasma') ({ s, tips, lamp } = corePlasma(lvl, cx, cy));
  else if (lvl >= 4) ({ s, tips, lamp } = coreHi(kind, lvl, cx, cy, frame));
  else if (kind === 'laser') {
    const tip = cy - 44 - (lvl - 1) * 2.5;
    const w = [0, 6, 8, 9.5][lvl];
    if (lvl >= 3) {
      for (const sd of [-1, 1]) s += barrel(cx + sd * 7.5, cy - 40, cy - 18, 3.4, METAL, { brake: true }) + `<circle cx="${cx + sd * 7.5}" cy="${cy - 40.5}" r="1.5" fill="#F0B8FF"/>`;
    }
    s += barrel(cx, tip, cy - 20, w, '#C04BE8', { rings: lvl - 1, ring: '#F0B8FF', sw: 1.8 });
    s += `<rect x="${n2(cx - w * 0.18)}" y="${tip + 3}" width="${n2(w * 0.36)}" height="${cy - 26 - tip}" fill="#F6DAFF"/>`;
    s += `<rect x="${cx - 5.5 - lvl}" y="${cy - 27}" width="${11 + 2 * lvl}" height="7" rx="2.5" ${f(lvl >= 3 ? '#C04BE8' : METAL, 1.8)}/>`;
    if (lvl >= 2) s += `<rect x="${cx - 3}" y="${cy - 25}" width="6" height="3" rx="1" fill="#F0B8FF"/>`;
    if (lvl >= 2) s += `<rect x="${n2(cx - w / 2 - 1.4)}" y="${tip - 0.8}" width="${n2(w + 2.8)}" height="3.6" rx="1.2" ${f(lvl >= 3 ? GOLD : DARK, 1.3)}/>`;
    tips = [[0, tip - cy]];
    lamp = [0, tip + 2 - cy];
  } else if (kind === 'arc') {
    const oy = cy - 40 - (lvl - 1) * 1.5;
    const r = [0, 4.6, 5.4, 6.4][lvl];
    if (lvl >= 2) {
      // Kronen-Zinken um die Kugel
      const prongs = lvl >= 3 ? [-55, -25, 25, 55] : [-40, 40];
      for (const a of prongs) {
        const rad = (a * Math.PI) / 180;
        const x1 = cx + Math.sin(rad) * (r + 5), y1 = oy - Math.cos(rad) * (r + 5) + 2;
        const d = `M${cx + Math.sin(rad) * 3},${oy + 9} Q${n2(cx + Math.sin(rad) * (r + 6))},${oy + 4} ${n2(x1)},${n2(y1)}`;
        s += `<path d="${d}" fill="none" stroke="${O}" stroke-width="4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${METAL}" stroke-width="2" stroke-linecap="round"/>`;
        s += `<circle cx="${n2(x1)}" cy="${n2(y1)}" r="1.5" fill="#B8FBFF" stroke="${O}" stroke-width="0.8"/>`;
      }
    }
    s += `<rect x="${cx - 2.5}" y="${oy}" width="5" height="${cy - 22 - oy}" rx="1.5" ${f(DARK, 1.6)}/>`;
    for (let i = 0; i < lvl; i++) {
      const y = oy + 8 + i * 4.5;
      const rx = 5 + (lvl - i) * 0.8;
      s += `<ellipse cx="${cx}" cy="${y}" rx="${n2(rx)}" ry="1.8" fill="${i === 0 && lvl >= 3 ? GOLD : '#2EC4FF'}" stroke="${O}" stroke-width="1.2"/>`;
    }
    s += `<circle cx="${cx}" cy="${oy}" r="${r}" ${f('#7CF7FF', 1.8)}/>`;
    s += `<circle cx="${cx}" cy="${oy}" r="${n2(r * 0.5)}" fill="#fff"/>`;
    s += `<path d="M${n2(cx - r * 0.6)},${n2(oy - r * 0.1)} L${n2(cx - r * 0.1)},${n2(oy + r * 0.25)} L${n2(cx + r * 0.05)},${n2(oy - r * 0.25)} L${n2(cx + r * 0.6)},${n2(oy + r * 0.1)}" fill="none" stroke="#1A6FB0" stroke-width="1"/>`;
    s += `<rect x="${cx - 5.5 - lvl}" y="${cy - 27}" width="${11 + 2 * lvl}" height="7" rx="2.5" ${f(METAL, 1.8)}/>`;
    tips = [[0, oy - cy]];
    lamp = [0, oy - cy];
  } else if (kind === 'rear') {
    // Heckkanone: Läufe ragen hinten heraus (Stufe 3: zusätzlich zwei fast seitliche)
    const col = '#F2A93B';
    const by = cy + 22;
    const angled = lvl >= 3 ? [45, 80] : [45];
    for (const a of angled) {
      for (const sd of [-1, 1]) {
        const len = a === 80 ? 12 : 13 + lvl;
        s += `<g transform="rotate(${-sd * a} ${cx + sd * 5} ${by - 4})">${barrel(cx + sd * 5, by - 4, by - 4 + len, lvl >= 2 ? 4 : 3.4, col, { sw: 1.4 })}</g>`;
      }
    }
    const cw = [0, 5, 6.5, 7.5][lvl];
    const end = by + 9 + lvl;
    s += barrel(cx, by - 4, end, cw, col, { sw: 1.8 });
    if (lvl >= 2) s += `<rect x="${n2(cx - cw / 2 - 1.1)}" y="${end - 3}" width="${n2(cw + 2.2)}" height="3.4" rx="1" ${f(lvl >= 3 ? GOLD : DARK, 1.3)}/>`;
    if (lvl >= 2) for (const sd of [-1, 1]) s += `<rect x="${cx + sd * 8 - 2.5}" y="${cy + 13}" width="5" height="10" rx="1.5" ${f(DARK, 1.4)}/>`;
    s += `<rect x="${cx - 7}" y="${cy + 11}" width="14" height="12" rx="4" ${f(METAL)}/>`;
    s += `<circle cx="${cx}" cy="${cy + 17}" r="2.4" ${f('#FFE7B0', 1.2)}/>`;
    tips = [[0, end - cy]];
    lamp = [0, 17];
  } else {
    // Drohnenhangar: Andockring, ab Stufe 2 Antennen an den Seiten
    if (lvl >= 2) {
      for (const sd of [-1, 1]) {
        s += `<path d="M${cx + sd * 8},${cy + 16} L${cx + sd * 17},${cy + 24}" stroke="${O}" stroke-width="4" stroke-linecap="round"/><path d="M${cx + sd * 8},${cy + 16} L${cx + sd * 17},${cy + 24}" stroke="${METAL}" stroke-width="2" stroke-linecap="round"/>`;
        s += `<circle cx="${cx + sd * 17}" cy="${cy + 24}" r="${lvl >= 3 ? 3 : 2.4}" ${f(lvl >= 3 ? GOLD : '#2EC4FF', 1.3)}/>`;
      }
    }
    s += `<circle cx="${cx}" cy="${cy + 13}" r="${5 + lvl}" ${f(METAL)}/>`;
    s += `<path d="M${cx - 5 - lvl + 1},${cy + 14} A${4 + lvl},${4 + lvl} 0 0 0 ${cx + 5 + lvl - 1},${cy + 14} Z" fill="${DARK}"/>`;
    s += `<circle cx="${cx}" cy="${cy + 13}" r="${2.5 + lvl * 0.5}" ${f('#2EC4FF', 1.4)}/>`;
    s += shine(cx - 2.5, cy + 10, 1.2, 0.8, -30);
    lamp = [0, 13];
  }
  if (icon) {
    // Händler-Symbol: nur der sichtbare Teil, eng zugeschnitten
    const [x0, y0, w, h] = coreIconCrop(kind, lvl);
    return svg(w, h, `<g transform="translate(${-(cx + x0)} ${-(cy + y0)})">${s}</g>`);
  }
  META[key] = { w: W, h: H, ax: cx, ay: cy, tips, lamp };
  return svg(W, H, s);
}
/** Zuschnitt der Händler-Symbole relativ zur Schiffsmitte: x, y, Breite, Höhe */
function coreIconCrop(kind: CoreKind, lvl: number): [number, number, number, number] {
  const lo: Record<CoreKind, [number, number, number, number]> = {
    laser: [-13, -53, 26, 36], arc: [-15, -55, 30, 36], rear: [-19, 8, 38, 32], drone: [-21, 3, 42, 28], plasma: [-15, -55, 30, 36],
  };
  const hi: Record<CoreKind, [number, number, number, number]> = {
    laser: [-19, -56, 38, 39], arc: lvl >= 5 ? [-22, -60, 44, 44] : [-17, -58, 34, 40], rear: lvl >= 5 ? [-21, -1, 42, 42] : [-20, 8, 40, 34], drone: [-22, 1, 44, 34],
    plasma: lvl >= 5 ? [-23, -68, 46, 50] : [-18, -62, 36, 44],
  };
  return lvl >= 4 ? hi[kind] : lo[kind];
}

/** Begleitdrohne je Stufe (Stufe 2: Seitenkanonen, Stufe 3: größer mit Goldring, 4: Flossen, 5: goldener Schwarm-Jäger mit Blitzring) */
function drone(lvl = 1): string {
  if (lvl >= 4) return droneHi(lvl);
  const r = [0, 9, 10, 11][lvl];
  const S = 30, c = 15;
  let guns = '';
  if (lvl >= 2) for (const sd of [-1, 1]) guns += `<rect x="${c + sd * (r - 1) - 2}" y="${c - r + 2}" width="4" height="9" rx="1.2" ${f('#5A6880', 1.4)}/>`;
  return svg(S, S, `${guns}
    <circle cx="${c}" cy="${c}" r="${r}" ${f('#D8E3F0', 2.2)}/>
    <path d="M${c - r + 0.5},${c + 2} A${r - 0.5},${r - 0.5} 0 0 0 ${c + r - 0.5},${c + 2} Z" fill="#8A9BB5"/>
    ${lvl >= 3 ? `<circle cx="${c}" cy="${c}" r="${r - 3}" fill="none" stroke="${GOLD}" stroke-width="1.8"/>` : ''}
    <circle cx="${c}" cy="${c}" r="4" ${f('#2EC4FF', 1.6)}/>
    <circle cx="${c}" cy="${c}" r="1.6" fill="#fff"/>
    <rect x="${c - 1.5}" y="${c - r - 2.6}" width="3" height="4.6" rx="1" ${f('#5A6880', 1.4)}/>
    ${shine(c - 3, c - 3, 1.6, 1, -30)}`);
}

function droneHi(lvl: number): string {
  const evo = lvl >= 5;
  const S = 36, c = 18, r = evo ? 11 : 11.5;
  let s = '';
  // Flossen im 120°-Abstand (Evolution: Gold)
  for (const a of [60, 180, 300]) {
    s += `<g transform="rotate(${a} ${c} ${c})">${poly(`${c - 3.5},${c - r + 2} ${c},${c - r - 5} ${c + 3.5},${c - r + 2}`, f(evo ? GOLD : METAL, 1.4))}</g>`;
  }
  const guns = evo ? [0, 120, 240] : [-1, 1];
  if (evo) {
    for (const a of guns) s += `<g transform="rotate(${a} ${c} ${c})"><rect x="${c - 1.8}" y="${c - r - 4}" width="3.6" height="7" rx="1" ${f(DARK, 1.3)}/><rect x="${c - 1}" y="${c - r - 4.6}" width="2" height="1.6" fill="#7CF7FF"/></g>`;
  } else {
    for (const sd of [-1, 1]) s += `<rect x="${c + sd * (r - 1) - 2.2}" y="${c - r + 1}" width="4.4" height="11" rx="1.2" ${f(DARK, 1.4)}/>`;
  }
  s += `<circle cx="${c}" cy="${c}" r="${r}" ${f(evo ? '#FFE9A0' : LIGHT, 2.2)}/>`;
  s += `<path d="M${c - r + 0.5},${c + 2} A${r - 0.5},${r - 0.5} 0 0 0 ${c + r - 0.5},${c + 2} Z" fill="${evo ? '#D8A82A' : METAL}"/>`;
  s += `<circle cx="${c}" cy="${c}" r="${r - 3}" fill="none" stroke="${evo ? '#fff' : GOLD}" stroke-width="1.8"/>`;
  if (evo) s += `<circle cx="${c}" cy="${c}" r="${r + 4.6}" fill="none" stroke="#7CF7FF" stroke-width="1.3" stroke-dasharray="3.2 2.4" opacity="0.9"/>`;
  s += `<circle cx="${c}" cy="${c}" r="4.4" ${f(evo ? '#7CF7FF' : '#2EC4FF', 1.6)}/><circle cx="${c}" cy="${c}" r="1.8" fill="#fff"/>`;
  if (!evo) s += `<rect x="${c - 1.6}" y="${c - r - 3}" width="3.2" height="5" rx="1" ${f(DARK, 1.4)}/>`;
  s += shine(c - 3.4, c - 3.4, 1.7, 1, -30);
  return svg(S, S, s);
}

/** Bordkanone ab P-Stufe 2: Geschütz-Sponsons am Rumpf (Overlay in Schiffskoordinaten 64×72) */
function hullGuns(n: number): string {
  const cx = 32;
  let s = '';
  const sponson = (dx: number, y: number, gold: boolean) => {
    for (const sd of [-1, 1]) {
      const x = cx + sd * dx;
      s += `<rect x="${x - 1.6}" y="${y - 15}" width="3.2" height="17" rx="1" ${f(DARK, 1.3)}/>`;
      s += `<rect x="${x - 0.6}" y="${y - 14}" width="1.2" height="2" fill="#7CF7FF"/>`;
      s += `<rect x="${x - 3}" y="${y}" width="6" height="8" rx="2.2" ${f(gold ? GOLD : '#D8E3F0', 1.5)}/>`;
    }
  };
  const pats: Record<number, [number, number][]> = { 2: [[7, 20]], 3: [[10, 24]], 4: [[7, 20], [12, 26]], 5: [[9, 22], [14, 28]] };
  for (const [dx, y] of pats[n]) sponson(dx, y, n >= 5);
  if (n === 3 || n === 5) {
    s += `<rect x="${cx - 1.8}" y="1.2" width="3.6" height="9.4" rx="1.2" ${f(DARK, 1.4)}/>`;
    s += `<rect x="${cx - 0.7}" y="2" width="1.4" height="2" fill="#7CF7FF"/>`;
  }
  return svg(64, 72, s);
}

// ───────────────────────────── Gegner ─────────────────────────────

/** Schwärmer mit Flügelschlag: Frame 0 = Flügel weit offen, 2 = angelegt */
function swarmer(frame = 0): string {
  // Flügelhäute (hinter dem Körper): Breite und Anstellwinkel je Frame
  const [rx, ry, rot] = [[7, 5.2, -38], [6.2, 5.6, -18], [3.6, 6.4, 4]][frame];
  const wing = (side: -1 | 1) => {
    const cx = 17 + side * (7.5 + rx * 0.25);
    const r = rot * side;
    return `<ellipse cx="${cx}" cy="11" rx="${rx}" ry="${ry}" transform="rotate(${r} ${cx} 11)" ${f('#C04BE8', 2)}/>
      <ellipse cx="${cx}" cy="12.2" rx="${rx * 0.62}" ry="${ry * 0.55}" transform="rotate(${r} ${cx} 11)" fill="#E9A8FF" opacity="0.75"/>`;
  };
  return svg(34, 34, `
    ${wing(-1)}${wing(1)}
    <ellipse cx="17" cy="16" rx="10" ry="12" ${f('#7BD53A', 2.4)}/>
    <path d="M7.5,18 Q17,32 26.5,18 Q17,26 7.5,18 Z" fill="#3F8A1E"/>
    <circle cx="13" cy="20" r="3.4" ${f('#FFE45C', 1.6)}/>
    <circle cx="21" cy="20" r="3.4" ${f('#FFE45C', 1.6)}/>
    <circle cx="13" cy="21" r="1.4" fill="${O}"/><circle cx="21" cy="21" r="1.4" fill="${O}"/>
    ${shine(13, 9, 2.4, 1.4)}`);
}

function hunter(): string {
  const cx = 21;
  const body = sym(cx, [[21, 40], [17, 30], [4, 12], [2, 4], [12, 8], [16, 2], [21, 4]]);
  return svg(42, 42, `
    ${poly(body, f('#E8573A', 2.4))}
    <polygon points="${sym(cx, [[21, 38], [18, 30], [6, 15], [14, 16], [21, 26]])}" fill="#A8321C"/>
    <ellipse cx="21" cy="20" rx="4" ry="7" ${f('#FFE45C', 1.8)}/>
    <ellipse cx="21" cy="22" rx="2" ry="4" fill="#E89B12"/>
    ${poly(sym(cx, [[4, 6], [2.6, 1.4], [8, 4]]), f("#F2A93B", 1.4))}
    ${shine(14, 8, 2, 1.2, 30)}`);
}

function spinner(): string {
  const pts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? 21 : 12;
    pts.push(`${(23 + Math.sin(a) * r).toFixed(2)},${(23 - Math.cos(a) * r).toFixed(2)}`);
  }
  return svg(46, 46, `
    ${poly(pts.join(' '), f('#C04BE8', 2.4))}
    <circle cx="23" cy="23" r="11" ${f('#8A2BB0', 2.2)}/>
    <circle cx="23" cy="23" r="6" ${f('#FF3D6E', 2)}/>
    <circle cx="23" cy="23" r="2.5" fill="#fff"/>
    ${shine(18, 17, 2.4, 1.4)}`);
}

function kamikaze(): string {
  const cx = 17;
  return svg(34, 40, `
    ${poly(sym(cx, [[17, 38], [10, 22], [2, 14], [8, 10], [12, 2], [17, 6]]), f('#F2A93B', 2.4))}
    <polygon points="${sym(cx, [[17, 35], [11, 22], [5, 15], [12, 16], [17, 24]])}" fill="#C47A12"/>
    <circle cx="17" cy="14" r="4.5" ${f('#FF3D6E', 1.8)}/>
    ${shine(15.5, 12.5, 1.4, 1)}
    <path d="M12,2 L17,-2 L22,2" fill="none"/>`);
}

function mine(): string {
  let spikes = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x1 = 18 + Math.sin(a) * 10;
    const y1 = 18 - Math.cos(a) * 10;
    const x2 = 18 + Math.sin(a) * 15;
    const y2 = 18 - Math.cos(a) * 15;
    spikes += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${O}" stroke-width="5" stroke-linecap="round"/>`;
    spikes += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#8A9BB5" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return svg(36, 36, `${spikes}
    <circle cx="18" cy="18" r="11" ${f('#5A6880', 2.4)}/>
    <path d="M8,20 A11,11 0 0 0 28,20 Z" fill="#3B4458"/>
    <circle cx="18" cy="18" r="4" ${f('#FF3D6E', 1.8)}/>
    ${shine(14, 13, 2.4, 1.4)}`);
}

function bomber(): string {
  const cx = 39;
  return svg(78, 64, `
    ${poly(sym(cx, [[39, 62], [30, 56], [8, 40], [2, 26], [8, 20], [24, 24], [28, 6], [34, 2]]), f('#8A9BB5', 2.6))}
    <polygon points="${sym(cx, [[39, 60], [30, 54], [9, 40], [4, 30], [26, 36], [34, 48]])}" fill="#5A6880"/>
    <rect x="31" y="10" width="16" height="30" rx="6" ${f('#E8573A', 2.2)}/>
    <rect x="34" y="28" width="10" height="9" rx="3" fill="#A8321C"/>
    <circle cx="16" cy="32" r="5" ${f('#F2A93B', 1.8)}/><circle cx="62" cy="32" r="5" ${f('#F2A93B', 1.8)}/>
    <ellipse cx="39" cy="46" rx="5" ry="6" ${f('#FFE45C', 1.8)}/>
    ${shine(35, 15, 1.6, 3, 0)}${shine(14, 24, 2.4, 1.3, 20)}`);
}

function turretBase(): string {
  return svg(56, 56, `
    <polygon points="14,4 42,4 52,14 52,42 42,52 14,52 4,42 4,14" ${f('#5A6880', 2.6)}/>
    <polygon points="6,40 6,42 14,50 42,50 50,42 50,40" fill="#3B4458"/>
    <circle cx="10" cy="10" r="1.8" fill="${O}"/><circle cx="46" cy="10" r="1.8" fill="${O}"/>
    <circle cx="10" cy="46" r="1.8" fill="${O}"/><circle cx="46" cy="46" r="1.8" fill="${O}"/>
    <circle cx="28" cy="28" r="15" ${f('#8A9BB5', 2.2)}/>
    ${shine(14, 9, 3, 1.4, 0)}`);
}

/** Geschützrohr, zeigt nach unten (Drehung im Renderer) */
function turretGun(): string {
  return svg(40, 40, `
    <rect x="16" y="20" width="8" height="18" rx="2" ${f('#3B4458', 2.2)}/>
    <circle cx="20" cy="20" r="10" ${f('#E8573A', 2.4)}/>
    <circle cx="20" cy="20" r="4" ${f('#FFE45C', 1.6)}/>
    ${shine(16, 15, 2, 1.2)}`);
}

/** Trümmerplatte, auf der Geschütztürme stehen */
function plate(): string {
  return svg(96, 96, `
    <polygon points="10,18 40,4 84,12 92,50 80,88 30,92 4,62" ${f('#2A3348', 2.6)}/>
    <polygon points="6,60 30,88 78,84 88,52 80,80 32,90" fill="#1A2133"/>
    <path d="M22,30 L70,22 M18,52 L84,46 M30,74 L72,70" stroke="#3B4660" stroke-width="2"/>
    <path d="M40,4 L46,22 M84,12 L70,22" stroke="${O}" stroke-width="1.6"/>`);
}

function frigate(): string {
  const cx = 66;
  return svg(132, 92, `
    ${poly(sym(cx, [[66, 90], [52, 80], [20, 64], [4, 44], [10, 30], [30, 36], [40, 12], [54, 4], [60, 2]]), f('#8A9BB5', 2.8))}
    <polygon points="${sym(cx, [[66, 88], [52, 78], [21, 63], [7, 46], [36, 54], [56, 70]])}" fill="#5A6880"/>
    <rect x="50" y="12" width="32" height="50" rx="10" ${f('#C04BE8', 2.4)}/>
    <rect x="55" y="44" width="22" height="14" rx="5" fill="#8A2BB0"/>
    <circle cx="66" cy="34" r="8" ${f('#FF3D6E', 2)}/><circle cx="66" cy="34" r="3" fill="#fff"/>
    <rect x="18" y="40" width="14" height="22" rx="4" ${f('#E8573A', 2)}/>
    <rect x="100" y="40" width="14" height="22" rx="4" ${f('#E8573A', 2)}/>
    <rect x="22" y="58" width="6" height="12" rx="2" ${f('#3B4458', 1.6)}/>
    <rect x="104" y="58" width="6" height="12" rx="2" ${f('#3B4458', 1.6)}/>
    ${shine(57, 18, 2, 4, 0)}${shine(18, 34, 3, 1.4, 20)}`);
}

const BOSS_COLORS: [string, string, string][] = [
  ['#E8573A', '#A8321C', '#FFE45C'],
  ['#2EC4FF', '#1A6FB0', '#7CF7FF'],
  ['#C04BE8', '#8A2BB0', '#FF3D6E'],
  ['#7BD53A', '#3F8A1E', '#F2A93B'],
];

/**
 * Anbauteile der Endgegner relativ zur Mitte (Spielfeld-Pixel = viewBox-Einheiten).
 * guns: drehbare Geschütze (Muster C feuert bei ±70/+30, Muster A mittig bei +50),
 * engines: Triebwerke oben (Flammen nach oben), lights: Blinklichter, smoke: Schadstellen (< 33 % HP),
 * core: leuchtender Kern, ring: rotierender Emitterring (Muster D).
 */
export interface BossRig {
  name: string;
  guns: [number, number][];
  engines: [number, number][];
  lights: [number, number][];
  smoke: [number, number][];
  core: [number, number];
  ring: boolean;
  organic: boolean;
}

export const BOSS_RIGS: BossRig[] = [
  { name: 'Brecher', guns: [[-70, 30], [70, 30]], engines: [[-26, -70], [26, -70]], lights: [[-110, -6], [110, -6]], smoke: [[-56, -14], [44, -30], [10, 24]], core: [0, -26], ring: false, organic: false },
  { name: 'Hammerhai', guns: [[-70, 30], [70, 30]], engines: [[-10, -72], [10, -72]], lights: [[-114, -16], [114, -16], [0, -64]], smoke: [[-84, 4], [64, -2], [-6, -30]], core: [0, -38], ring: false, organic: false },
  { name: 'Nebelauge', guns: [[-70, 30], [70, 30]], engines: [[-22, -66], [22, -66]], lights: [[-122, -44], [122, -44], [-122, 18], [122, 18]], smoke: [[-36, -30], [40, 16], [-20, 40]], core: [0, 2], ring: true, organic: false },
  { name: 'Brutmutter', guns: [[-70, 30], [70, 30]], engines: [], lights: [[-26, -52], [26, -52], [-44, -36], [44, -36], [0, -62]], smoke: [[-30, -40], [36, -30], [0, 8]], core: [0, 40], ring: false, organic: true },
];

/** Hülle mit harter Schattenstufe (Schattenformen werden auf die Hülle geschnitten) */
function hullWithShade(id: string, pts: string, base: string, shade: string, shadeBody: string, sw = 3): string {
  return `<defs><clipPath id="${id}"><polygon points="${pts}"/></clipPath></defs>
    ${poly(pts, `fill="${base}"`)}
    <g clip-path="url(#${id})">${shadeBody.split('SHADE').join(shade)}</g>
    <polygon points="${pts}" fill="none" stroke="${O}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/** dicker Pfad mit Outline (Beine, Ranken) */
const limb = (d: string, color: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${O}" stroke-width="${w + 4.4}" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Pfad an der senkrechten Mittelachse (x = 130) spiegeln */
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${260 - +x},${y}`);

function boss(v: number): string {
  const [c1, c2, c3] = BOSS_COLORS[v];
  const cx = 130;
  if (v === 0) {
    // „Brecher“: schwerer Panzerkrebs mit zwei Scheren und Hauptkanone
    const claw = `<polygon points="56,80 36,104 34,132 48,152 58,140 52,126 62,112 82,98" ${f('#8A9BB5', 3)}/>
        <polygon points="37,108 36,130 47,147 52,140 46,124" fill="#5A6880"/>
        <polygon points="70,112 76,140 68,152 62,132" ${f(c2, 2.6)}/>`;
    const hull = sym(cx, [[130, 4], [98, 8], [62, 20], [30, 42], [12, 68], [18, 92], [44, 102], [70, 96], [90, 112], [108, 120], [130, 122]]);
    return svg(260, 156, `
      ${claw}${mirror(claw)}
      <rect x="120" y="104" width="20" height="42" rx="4" ${f('#3B4458', 3)}/>
      <rect x="116" y="134" width="28" height="12" rx="3" ${f('#5A6880', 2.6)}/>
      ${hullWithShade('bh0', hull, '#8A9BB5', '#5A6880', `<polygon points="0,72 260,72 260,160 0,160" fill="SHADE"/>`)}
      <path d="M36,52 L84,40 M224,52 L176,40 M26,80 L76,76 M234,80 L184,76 M84,40 L100,92 M176,40 L160,92" stroke="#5A6880" stroke-width="3" fill="none"/>
      <path d="M40,60 L58,56 M220,60 L202,56" stroke="${O}" stroke-width="2.4"/>
      ${poly(sym(cx, [[130, 14], [104, 20], [92, 46], [96, 82], [110, 100], [130, 104]]), f(c1, 3))}
      <polygon points="${sym(cx, [[130, 74], [97, 72], [98, 84], [111, 99], [130, 103]])}" fill="${c2}"/>
      ${poly(sym(cx, [[130, 30], [112, 40], [110, 60], [130, 66]]), f(c3, 2.6))}
      <polygon points="${sym(cx, [[130, 50], [111, 52], [112, 60], [130, 65]])}" fill="#E89B12"/>
      <rect x="98" y="84" width="10" height="5" rx="2" fill="${O}"/><rect x="152" y="84" width="10" height="5" rx="2" fill="${O}"/>
      <circle cx="22" cy="72" r="5" ${f('#3B4458', 2)}/><circle cx="238" cy="72" r="5" ${f('#3B4458', 2)}/>
      ${shine(118, 36, 5, 2.4, -30)}${shine(56, 32, 6, 2, -30)}${shine(204, 32, 6, 2, 30)}`);
  }
  if (v === 1) {
    // „Hammerhai“: Werftkreuzer mit Hammerholm, Kanonenreihe und Triebwerksgondeln
    const barrels = [36, 66, 96, 164, 194, 224]
      .map((x) => `<rect x="${x - 4}" y="96" width="8" height="24" rx="2" ${f('#3B4458', 2.2)}/><rect x="${x - 5.5}" y="114" width="11" height="6" rx="2" ${f('#5A6880', 1.8)}/>`).join('');
    const hull = sym(cx, [[130, 2], [118, 8], [110, 30], [106, 56], [36, 58], [16, 64], [8, 80], [14, 96], [40, 104], [104, 104], [112, 128], [122, 148], [130, 152]]);
    const windows = [44, 58, 72, 86].map((x) => `<rect x="${x}" y="77" width="7" height="5" rx="1" fill="#1A6FB0"/><rect x="${253 - x}" y="77" width="7" height="5" rx="1" fill="#1A6FB0"/>`).join('');
    return svg(260, 156, `
      ${barrels}
      ${hullWithShade('bh1', hull, '#8A9BB5', '#5A6880', `<polygon points="0,88 260,88 260,160 0,160" fill="SHADE"/>`)}
      <path d="M24,70 L104,68 M236,70 L156,68 M30,92 L100,92 M230,92 L160,92" stroke="#5A6880" stroke-width="3"/>
      ${windows}
      <ellipse cx="17" cy="80" rx="12" ry="20" ${f(c1, 2.6)}/><ellipse cx="243" cy="80" rx="12" ry="20" ${f(c1, 2.6)}/>
      <path d="M6.5,86 Q17,103 27.5,86 Q17,94 6.5,86 Z" fill="${c2}"/><path d="M232.5,86 Q243,103 253.5,86 Q243,94 232.5,86 Z" fill="${c2}"/>
      <ellipse cx="130" cy="52" rx="15" ry="40" ${f(c1, 3)}/>
      <path d="M115.5,62 Q130,104 144.5,62 Q130,80 115.5,62 Z" fill="${c2}"/>
      <rect x="123" y="22" width="14" height="30" rx="7" ${f(c3, 2.2)}/>
      <rect x="126" y="38" width="8" height="12" rx="4" fill="#1A6FB0"/>
      <rect x="116" y="104" width="28" height="30" rx="6" ${f('#5A6880', 2.6)}/>
      <rect x="125" y="128" width="10" height="16" rx="2" ${f('#3B4458', 2.2)}/>
      ${shine(126, 26, 1.8, 4.4, 0)}${shine(13, 68, 2.2, 4, 0)}${shine(239, 68, 2.2, 4, 0)}${shine(62, 64, 8, 1.6, 0)}`);
  }
  if (v === 2) {
    // „Nebelauge“: Untertasse mit Sichelflossen, rotierendem Emitterring (eigene Textur) und großem Auge
    const fin = sym(cx, [[130, 30], [74, 44], [30, 22], [6, 32], [22, 62], [6, 96], [36, 114], [80, 104], [130, 120]]);
    return svg(260, 156, `
      ${hullWithShade('bh2', fin, '#8A9BB5', '#5A6880', `<polygon points="0,72 260,72 260,160 0,160" fill="SHADE"/>`)}
      <path d="M16,34 L60,48 M244,34 L200,48 M18,94 L64,88 M242,94 L196,88" stroke="#5A6880" stroke-width="3"/>
      <path d="M10,35 L23,62 L10,95 M250,35 L237,62 L250,95" fill="none" stroke="${c1}" stroke-width="3.4" stroke-linejoin="round"/>
      <circle cx="130" cy="78" r="70" ${f(c2, 3)}/>
      <circle cx="130" cy="78" r="62" fill="${c1}"/>
      <path d="M68,84 A62,62 0 0 0 192,84 A62,52 0 0 1 68,84 Z" fill="${c2}"/>
      <circle cx="130" cy="78" r="62" fill="none" stroke="${O}" stroke-width="2"/>
      <circle cx="130" cy="78" r="30" ${f('#3B1450', 2.6)}/>
      <circle cx="130" cy="78" r="22" ${f(c3, 2.4)}/>
      <ellipse cx="130" cy="80" rx="9" ry="13" fill="${O}"/>
      <circle cx="130" cy="80" r="3.6" fill="#fff"/>
      ${shine(104, 30, 10, 3.6, -25)}${shine(122, 68, 4, 2, -30)}`);
  }
  // „Brutmutter“: Schwarmkönigin mit Hinterleib, Beinen, Mandibeln und Brutsäcken
  const legs = ['M100,70 Q60,52 30,64 Q16,70 9,90', 'M98,82 Q58,86 34,106 Q24,116 22,134', 'M104,94 Q80,110 70,142'];
  const mand = 'M116,124 Q104,138 112,150';
  return svg(260, 156, `
    ${legs.map((d) => limb(d, c2, 6) + limb(mirror(d), c2, 6)).join('')}
    ${limb(mand, '#E8573A', 5)}${limb(mirror(mand), '#E8573A', 5)}
    <ellipse cx="130" cy="42" rx="56" ry="38" ${f(c1, 3)}/>
    <path d="M76,52 Q130,102 184,52 Q130,82 76,52 Z" fill="${c2}"/>
    <path d="M82,28 Q130,14 178,28 M76,44 Q130,30 184,44 M82,60 Q130,48 178,60" stroke="${c2}" stroke-width="3" fill="none"/>
    <path d="M100,12 Q112,30 104,50 M160,12 Q148,30 156,50" stroke="#C04BE8" stroke-width="2.4" fill="none"/>
    <ellipse cx="130" cy="88" rx="42" ry="22" ${f(c1, 3)}/>
    <path d="M90,94 Q130,118 170,94 Q130,104 90,94 Z" fill="${c2}"/>
    <ellipse cx="130" cy="118" rx="26" ry="20" ${f(c1, 3)}/>
    <path d="M105,122 Q130,144 155,122 Q130,132 105,122 Z" fill="${c2}"/>
    <circle cx="118" cy="114" r="6" ${f(c3, 2)}/><circle cx="142" cy="114" r="6" ${f(c3, 2)}/>
    <circle cx="118" cy="115" r="2.4" fill="${O}"/><circle cx="142" cy="115" r="2.4" fill="${O}"/>
    ${shine(104, 22, 9, 3.4, -20)}${shine(112, 80, 5, 2, -20)}${shine(121, 106, 3, 1.4, -20)}`);
}

/** Drehbares Boss-Geschütz, Rohr zeigt nach unten; Drehpunkt (18,16) */
function bossGun(v: number): string {
  const [c1, c2, c3] = BOSS_COLORS[v];
  if (v === 3) {
    // organischer Spucksack mit Schlund
    return svg(36, 44, `
      <path d="M12,24 Q18,44 24,24 Z" ${f(c2, 2.2)}/>
      <circle cx="18" cy="16" r="13" ${f(c1, 2.4)}/>
      <path d="M6,20 A13,13 0 0 0 30,20 Q18,26 6,20 Z" fill="${c2}"/>
      <circle cx="18" cy="17" r="5" ${f('#C04BE8', 2)}/>
      <ellipse cx="18" cy="35" rx="3.6" ry="2.6" fill="${O}"/><ellipse cx="18" cy="34.4" rx="1.8" ry="1" fill="#C04BE8"/>
      ${shine(13, 10, 3, 1.6)}`);
  }
  return svg(36, 44, `
    <rect x="12.5" y="18" width="11" height="24" rx="2" ${f('#3B4458', 2.2)}/>
    <rect x="11" y="34" width="14" height="8" rx="2" ${f('#5A6880', 2)}/>
    <circle cx="18" cy="16" r="13" ${f(c1, 2.4)}/>
    <path d="M6,20 A13,13 0 0 0 30,20 Q18,26 6,20 Z" fill="${c2}"/>
    <circle cx="18" cy="15" r="5" ${f(c3, 2)}/>
    ${shine(13, 9, 3, 1.6)}`);
}

/** rotierender Emitterring des Nebelauges (hohl, damit das Auge sichtbar bleibt) */
function bossRing(): string {
  const [c1, c2, c3] = BOSS_COLORS[2];
  let nodes = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = (52 + Math.cos(a) * 44).toFixed(2);
    const y = (52 + Math.sin(a) * 44).toFixed(2);
    nodes += `<circle cx="${x}" cy="${y}" r="6" ${f(c2, 2.2)}/><circle cx="${x}" cy="${y}" r="2.6" fill="${c3}"/>`;
  }
  return svg(104, 104, `
    <circle cx="52" cy="52" r="44" fill="none" stroke="${O}" stroke-width="9"/>
    <circle cx="52" cy="52" r="44" fill="none" stroke="#5A6880" stroke-width="5"/>
    <circle cx="52" cy="52" r="44" fill="none" stroke="${c1}" stroke-width="1.6" stroke-dasharray="6 8"/>
    ${nodes}`);
}

/** Triebwerksflamme für Gegner: zeigt nach oben (Gegner fliegen nach unten), Fuß unten */
function enemyFlame(): string {
  return svg(16, 30, `${glow('fle', '#FF7A1F')}
    <ellipse cx="8" cy="18" rx="7.5" ry="11.5" fill="url(#fle)"/>
    <path d="M3.5,29 Q8,0.5 12.5,29 Z" fill="#FFB040"/>
    <path d="M5.8,29 Q8,10 10.2,29 Z" fill="#FFF3C0"/>`);
}

/** dreiblättriger Rotor (Bomber-Triebwerke) */
function rotor(): string {
  let blades = '';
  for (let i = 0; i < 3; i++) {
    blades += `<path d="M9,9 L7.4,2 Q9,1 10.6,2 Z" transform="rotate(${i * 120} 9 9)" ${f('#D8E3F0', 1.2)}/>`;
  }
  return svg(18, 18, `${blades}<circle cx="9" cy="9" r="2.6" ${f('#5A6880', 1.2)}/>`);
}

/** drehende Radarschüssel (Fregatte) */
function radar(): string {
  return svg(28, 28, `
    <rect x="12" y="4" width="4" height="20" rx="2" ${f('#5A6880', 1.6)}/>
    <path d="M4,10 Q14,4 24,10 L22,14 Q14,9 6,14 Z" ${f('#D8E3F0', 1.8)}/>
    <circle cx="14" cy="14" r="4" ${f('#C04BE8', 1.6)}/>
    ${shine(12.5, 12.5, 1.2, 0.8)}`);
}

/** kleines Seitengeschütz (Fregatte), Drehpunkt (9,8) */
function smallGun(): string {
  return svg(18, 26, `
    <rect x="6" y="9" width="6" height="15" rx="1.5" ${f('#3B4458', 1.8)}/>
    <circle cx="9" cy="8" r="6.5" ${f('#E8573A', 2)}/>
    <circle cx="9" cy="8" r="2.4" fill="#FFE45C"/>
    ${shine(7, 5.5, 1.4, 0.8)}`);
}

// ───────────────────────────── Projektile ─────────────────────────────

function bolt(w: number, h: number, color: string, core = '#fff'): string {
  return svg(w, h, `<rect x="${w * 0.1}" y="0.5" width="${w * 0.8}" height="${h - 1}" rx="${w * 0.4}" fill="${color}"/>
    <rect x="${w * 0.32}" y="${h * 0.12}" width="${w * 0.36}" height="${h * 0.7}" rx="${w * 0.18}" fill="${core}"/>`);
}

function orb(r: number, color: string): string {
  const s = r * 2 + 4;
  const c = s / 2;
  return svg(s, s, `<circle cx="${c}" cy="${c}" r="${r + 1}" fill="${O}"/><circle cx="${c}" cy="${c}" r="${r}" fill="${color}"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.5}" fill="#fff"/>`);
}

/**
 * Schwere Kugel (Schadensstufe 1–3, ab Sektor 5): größer, mit hellem Rand, der je Stufe kräftiger wird;
 * ab Stufe 2 zusätzlich ein dunkler Kern („massiv“). So ist auf einen Blick lesbar, dass ein Treffer mehr kostet.
 */
function heavyOrb(r0: number, color: string, tier: number): string {
  const r = Math.round(r0 * (1 + 0.11 * tier) * 10) / 10;
  const s = Math.ceil(r * 2 + 5);
  const c = s / 2;
  const rim = 0.7 + 0.45 * tier;
  return svg(s, s, `<circle cx="${c}" cy="${c}" r="${r + 1.2}" fill="${O}"/><circle cx="${c}" cy="${c}" r="${r}" fill="${color}"/>
    <circle cx="${c}" cy="${c}" r="${r - rim / 2}" fill="none" stroke="#FFF1A8" stroke-width="${rim}"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.5}" fill="#fff"/>
    ${tier >= 2 ? `<circle cx="${c}" cy="${c}" r="${r * (tier >= 3 ? 0.3 : 0.2)}" fill="${tier >= 3 ? '#5A0A1E' : color}"/>` : ''}`);
}

/** Flak-Granate: kleine, olivgrüne Kapsel mit Zünderband */
function shell(): string {
  return svg(12, 14, `<ellipse cx="6" cy="7" rx="4.6" ry="5.8" ${f('#B4BE3C', 1.5)}/>
    <rect x="1.8" y="6.2" width="8.4" height="2.2" fill="#FFD24A" stroke="${O}" stroke-width="0.7"/>
    <ellipse cx="4.6" cy="4" rx="1.2" ry="1.6" fill="#fff" opacity="0.85"/>`);
}

/** Railgun-Schuss: langer, dünner Lichtspeer */
function railBolt(): string {
  return svg(12, 64, `<rect x="2" y="1" width="8" height="62" rx="4" fill="#7F8CFF" opacity="0.55"/>
    <rect x="3.6" y="2" width="4.8" height="60" rx="2.4" fill="#C8D0FF"/>
    <rect x="5" y="3" width="2" height="56" rx="1" fill="#fff"/>`);
}

/** Plasma-Orb (Radius 26 in der Grafik, im Spiel auf den Sim-Radius skaliert) */
function plasmaOrb(sun: boolean): string {
  const c = sun ? ['#FFE45C', '#F2A93B'] : ['#3BF0A0', '#128A5A'];
  return svg(60, 60, `<defs><radialGradient id="po${sun ? 1 : 0}"><stop offset="0" stop-color="#fff"/><stop offset="0.4" stop-color="${c[0]}"/><stop offset="0.85" stop-color="${c[1]}" stop-opacity="0.75"/><stop offset="1" stop-color="${c[1]}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="30" cy="30" r="29" fill="url(#po${sun ? 1 : 0})"/>
    <circle cx="30" cy="30" r="24" fill="none" stroke="${c[0]}" stroke-width="1.6" stroke-dasharray="7 5" opacity="0.9"/>
    <circle cx="30" cy="30" r="10" fill="#fff" opacity="0.85"/>`);
}

function missile(): string {
  return svg(10, 22, `
    <path d="M5,1.2 L8.5,6 L8.5,17 L5,15 L1.5,17 L1.5,6 Z" ${f('#D8E3F0', 1.4)}/>
    <path d="M5,1.2 L8.5,6 L1.5,6 Z" fill="#E8573A"/>
    <circle cx="5" cy="19.5" r="2.4" fill="#FFE45C"/>`);
}

// ───────────────────────────── Items ─────────────────────────────

function itemCase(color: string, dark: string, inner: string): string {
  return svg(32, 32, `
    <circle cx="16" cy="16" r="13.5" ${f(color, 2.4)}/>
    <path d="M4,19 A13,13 0 0 0 28,19 Q16,26 4,19 Z" fill="${dark}"/>
    ${inner}
    ${shine(10.5, 9, 3, 1.6)}`);
}

const ITEMS: Record<string, () => string> = {
  i_P: () => itemCase('#2EC4FF', '#1A6FB0', `<text x="16" y="21.5" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="15" text-anchor="middle" fill="#fff" stroke="${O}" stroke-width="1.4" paint-order="stroke">P</text>`),
  i_crystal: () => svg(28, 32, `
    ${poly('14,1.8 26,11 14,30.2 2,11', f('#3BF0A0', 2.2))}
    <polygon points="14,1.8 26,11 14,13 2,11" fill="#A8FFD8"/>
    <polygon points="14,13 26,11 14,30.2" fill="#1FB377"/>
    ${shine(10, 7, 2.2, 1.2, 30)}`),
  i_repair: () => itemCase('#7BD53A', '#3F8A1E', `<path d="M16,8 L16,24 M8,16 L24,16" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M16,8 L16,24 M8,16 L24,16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`),
  i_shield: () => itemCase('#C04BE8', '#8A2BB0', `<path d="M16,7 L23,10 Q23,20 16,25 Q9,20 9,10 Z" fill="#fff" stroke="${O}" stroke-width="1.6"/>`),
  i_bomb: () => itemCase('#F2A93B', '#C47A12', `<circle cx="15" cy="18" r="6" fill="${O}"/><path d="M18,12 Q21,8 23,9" stroke="${O}" stroke-width="2" fill="none"/><circle cx="23.5" cy="8.5" r="1.8" fill="#FFE45C"/>${shine(13, 16, 1.4, 0.9)}`),
};

// ───────────────────────────── Effekte & Hintergrund ─────────────────────────────

function soft(id: string, color: string, size: number): string {
  return svg(size, size, `${glow(id, color)}<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#${id})"/>`);
}

function ring(): string {
  return svg(64, 64, `<circle cx="32" cy="32" r="28" fill="none" stroke="#fff" stroke-width="4"/>`);
}

function shieldBubble(): string {
  return svg(90, 90, `<defs><radialGradient id="sb"><stop offset="0.6" stop-color="#C04BE8" stop-opacity="0"/><stop offset="0.92" stop-color="#E9A8FF" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0.9"/></radialGradient></defs>
    <circle cx="45" cy="45" r="43" fill="url(#sb)"/>${shine(26, 20, 7, 3, -40)}`);
}

function planet(color: string, dark: string, ringed: boolean): string {
  return svg(220, 220, `
    <defs><clipPath id="pc"><circle cx="110" cy="110" r="80"/></clipPath></defs>
    <circle cx="110" cy="110" r="82" fill="${O}"/>
    <circle cx="110" cy="110" r="80" fill="${color}"/>
    <g clip-path="url(#pc)">
      <path d="M20,90 Q110,70 200,96 L200,110 Q110,86 20,104 Z" fill="${dark}" opacity="0.5"/>
      <path d="M20,140 Q110,124 200,150 L200,160 Q110,136 20,152 Z" fill="${dark}" opacity="0.4"/>
      <circle cx="150" cy="150" r="90" fill="${dark}" opacity="0.55"/>
    </g>
    ${ringed ? `<ellipse cx="110" cy="116" rx="108" ry="22" fill="none" stroke="${O}" stroke-width="7" transform="rotate(-14 110 116)"/><ellipse cx="110" cy="116" rx="108" ry="22" fill="none" stroke="#D8C8A8" stroke-width="3.5" transform="rotate(-14 110 116)"/>` : ''}
    ${shine(78, 66, 18, 8, -35)}`);
}

function asteroid(seed: number): string {
  const pts: string[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 22 + rnd() * 8;
    pts.push(`${(32 + Math.sin(a) * r).toFixed(1)},${(32 - Math.cos(a) * r).toFixed(1)}`);
  }
  const id = `ac${seed}`;
  return svg(64, 64, `<defs><clipPath id="${id}"><polygon points="${pts.join(' ')}"/></clipPath></defs>
    ${poly(pts.join(' '), f('#5E5466', 2.6))}
    <circle cx="44" cy="44" r="22" fill="#3E3646" opacity="0.8" clip-path="url(#${id})"/>
    <polygon points="${pts.join(' ')}" fill="none" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="24" cy="26" r="5" ${f('#4A4152', 1.6)}/><circle cx="40" cy="36" r="3.4" ${f('#4A4152', 1.4)}/>
    ${shine(22, 16, 4, 2)}`);
}

function dot(): string {
  return svg(4, 4, `<circle cx="2" cy="2" r="2" fill="#fff"/>`);
}

// ───────────────────────────── Juice-Effekte ─────────────────────────────

/** gerichteter Funke (zeigt nach oben, wird in Flugrichtung gedreht) */
function spark(): string {
  return svg(8, 24, `${glow('spk', '#FFE45C')}
    <ellipse cx="4" cy="12" rx="4" ry="12" fill="url(#spk)"/>
    <path d="M4,0.5 L5.4,12 L4,23.5 L2.6,12 Z" fill="#fff"/>`);
}

/** Mündungsfeuer: vierzackiger Blitz (weiß, wird eingefärbt) */
function muzzle(): string {
  return svg(32, 32, `${glow('mz', '#ffffff')}
    <circle cx="16" cy="16" r="11" fill="url(#mz)" opacity="0.8"/>
    <path d="M16,0.5 L18.4,13.6 L31.5,16 L18.4,18.4 L16,31.5 L13.6,18.4 L0.5,16 L13.6,13.6 Z" fill="#fff"/>`);
}

/** Funkenstern beim Abprallen: acht Zacken (vier lange, vier kurze), weiß, wird eingefärbt */
function star(): string {
  let pts = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 4 === 0 ? 15.5 : i % 2 === 0 ? 8.5 : 3.2;
    pts += `${n2(16 + Math.sin(a) * r)},${n2(16 - Math.cos(a) * r)} `;
  }
  return svg(32, 32, `${glow('st', '#ffffff')}<circle cx="16" cy="16" r="9" fill="url(#st)" opacity="0.7"/><polygon points="${pts.trim()}" fill="#fff"/>`);
}

/** Rauchwolke (normale Überblendung, grau, weicher Rand) */
function smoke(): string {
  return svg(64, 64, `<defs><radialGradient id="smk"><stop offset="0" stop-color="#8C8698" stop-opacity="0.95"/><stop offset="0.55" stop-color="#5A5468" stop-opacity="0.75"/><stop offset="1" stop-color="#3A3446" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="34" r="30" fill="url(#smk)"/>
    <circle cx="22" cy="26" r="16" fill="url(#smk)"/>
    <circle cx="42" cy="24" r="14" fill="url(#smk)"/>`);
}

/** Schockwelle: dicker, innen weicher Ring */
function shock(): string {
  return svg(64, 64, `<defs><radialGradient id="shk"><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="0.86" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.95" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="32" r="31.5" fill="url(#shk)"/>`);
}

/** Trümmerstücke: Metallsplitter mit Outline */
function debris(v: number): string {
  const shapes = [
    '2,5 9,1.5 14,6 10,13 4,12',
    '1.5,8 7,1.5 14.5,3 11,10 5,14',
    '3,2 13,4 14,9 6,14.5 1.5,9',
  ];
  const cols = [['#8A9BB5', '#5A6880'], ['#5A6880', '#3B4458'], ['#E8573A', '#A8321C']][v];
  return svg(16, 16, `${poly(shapes[v], f(cols[0], 1.6))}
    <polygon points="${shapes[v].split(' ').slice(2).join(' ')}" fill="${cols[1]}" opacity="0.8"/>
    ${shine(6, 5, 1.6, 0.8)}`);
}

/** organischer Brocken (Schwärmer, Brutmutter) */
function goo(): string {
  return svg(16, 16, `<path d="M3,8 Q2,2 8,2.5 Q14,2 13.5,8 Q14,14 8,13.5 Q2,14 3,8 Z" ${f('#7BD53A', 1.6)}/>
    <path d="M3.4,9 Q8,15 13,9 Q8,11.5 3.4,9 Z" fill="#3F8A1E"/>${shine(6.5, 5.5, 1.6, 0.9)}`);
}

// ───────────────────────────── Sektor-Kulissen ─────────────────────────────
// Alle Kulissen sind dunkel und kontrastarm (keine Outline in Spielfarbe, kein Weiß),
// damit sie nie mit Gegnern oder Kugeln verwechselt werden.

/** dunkler Felsbrocken für den Asteroidengürtel (Hintergrund, nicht treffbar) */
function bgRock(seed: number, n = 11): string {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 34 + rnd() * 12;
    pts.push(`${(50 + Math.sin(a) * r).toFixed(1)},${(50 - Math.cos(a) * r).toFixed(1)}`);
  }
  const P = pts.join(' ');
  const id = `br${seed}`;
  let craters = '';
  for (let i = 0; i < 4; i++) {
    const x = 30 + rnd() * 40;
    const y = 28 + rnd() * 40;
    const r = 3 + rnd() * 7;
    craters += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#201C2C"/><path d="M${(x - r).toFixed(1)},${y.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${(x + r).toFixed(1)},${y.toFixed(1)}" fill="none" stroke="#141120" stroke-width="2"/>`;
  }
  return svg(100, 100, `<defs><clipPath id="${id}"><polygon points="${P}"/></clipPath></defs>
    <polygon points="${P}" fill="#3A3448"/>
    <g clip-path="url(#${id})">
      <circle cx="70" cy="70" r="44" fill="#272233"/>
      <circle cx="30" cy="26" r="18" fill="#463F56"/>
      ${craters}
    </g>
    <polygon points="${P}" fill="none" stroke="#0A0914" stroke-width="2.4" stroke-linejoin="round"/>`);
}

/** Feld aus winzigen Brocken (ferne Ebene) */
function bgRubble(seed: number): string {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let body = '';
  for (let i = 0; i < 16; i++) {
    const x = 12 + rnd() * 136;
    const y = 12 + rnd() * 136;
    const r = 2 + rnd() * 5;
    const pts: string[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rnd();
      const rr = r * (0.7 + rnd() * 0.5);
      pts.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`);
    }
    body += `<polygon points="${pts.join(' ')}" fill="${rnd() < 0.5 ? '#3A3448' : '#2C2738'}"/>`;
  }
  return svg(160, 160, body);
}

/** senkrechter Werftträger (Fachwerk) mit Positionslampen-Fassungen */
function bgGirderV(): string {
  let brace = '';
  for (let y = 10; y < 310; y += 40) {
    brace += `<path d="M14,${y} L46,${y + 40} M46,${y} L14,${y + 40}" stroke="#1E2C40" stroke-width="5"/>`;
    brace += `<rect x="6" y="${y - 3}" width="48" height="6" fill="#2A3C54"/>`;
  }
  return svgClip('gv', 60, 320, `
    ${brace}
    <rect x="6" y="0" width="10" height="320" fill="#2A3C54"/>
    <rect x="44" y="0" width="10" height="320" fill="#22324A"/>
    <rect x="6" y="0" width="3" height="320" fill="#38506C"/>
    <rect x="44" y="0" width="3" height="320" fill="#2E4460"/>
    ${[40, 120, 200, 280].map((y) => `<rect x="7" y="${y}" width="8" height="8" rx="1" fill="#152030"/><rect x="45" y="${y + 40}" width="8" height="8" rx="1" fill="#152030"/>`).join('')}`);
}

/** waagerechter Werftträger */
function bgGirderH(): string {
  let brace = '';
  for (let x = 6; x < 300; x += 36) brace += `<path d="M${x},8 L${x + 36},30 M${x + 36},8 L${x},30" stroke="#1E2C40" stroke-width="4"/>`;
  return svgClip('gh', 320, 40, `
    ${brace}
    <rect x="0" y="4" width="320" height="8" fill="#2A3C54"/>
    <rect x="0" y="28" width="320" height="8" fill="#22324A"/>
    <rect x="0" y="4" width="320" height="2.5" fill="#38506C"/>
    ${[40, 110, 180, 250].map((x) => `<rect x="${x}" y="5" width="12" height="6" fill="#152030"/>`).join('')}`);
}

/** Rumpfsektion im Dock mit Fensterreihen (Fenster gedämpft) */
function bgDock(): string {
  let win = '';
  for (let y = 40; y < 200; y += 22) {
    for (let x = 30; x < 130; x += 16) {
      const lit = (x * 7 + y * 3) % 5 === 0;
      win += `<rect x="${x}" y="${y}" width="8" height="5" rx="1" fill="${lit ? '#4A6A70' : '#18222E'}"/>`;
    }
  }
  return svg(160, 240, `
    <polygon points="20,10 140,10 156,40 156,200 140,232 20,232 4,200 4,40" fill="#1E2A3C"/>
    <polygon points="80,10 140,10 156,40 156,200 140,232 80,232" fill="#18222F"/>
    <path d="M4,70 L156,70 M4,140 L156,140 M4,200 L156,200 M80,10 L80,232" stroke="#273750" stroke-width="3"/>
    ${win}
    <rect x="60" y="0" width="40" height="12" fill="#2A3C54"/>
    <polygon points="20,10 140,10 156,40 156,200 140,232 20,232 4,200 4,40" fill="none" stroke="#0A1018" stroke-width="3"/>`);
}

/** Nebelschwade in fester Farbe (kein Tint nötig, damit sie auch im Canvas-Renderer stimmt), weich gezeichnet */
function bgNebula(seed: number, color: string, light: string): string {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let blobs = '';
  for (let i = 0; i < 9; i++) {
    const x = 42 + rnd() * 66;
    const y = 38 + rnd() * 74;
    const rx = 14 + rnd() * 18;
    const ry = 10 + rnd() * 16;
    blobs += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" transform="rotate(${(rnd() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${rnd() < 0.3 ? light : color}" opacity="${(0.4 + rnd() * 0.45).toFixed(2)}"/>`;
  }
  const id = `nb${seed}`;
  return svg(150, 150, `<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter></defs>
    <g filter="url(#${id})">${blobs}</g>`);
}

/** langgezogenes Nebelfilament */
function bgWisp(seed: number, color: string): string {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const y0 = 50 + rnd() * 40;
  const d = `M30,${y0.toFixed(0)} C110,${(y0 - 50 + rnd() * 30).toFixed(0)} 220,${(y0 + 40 - rnd() * 30).toFixed(0)} 330,${(70 + rnd() * 20).toFixed(0)}`;
  const id = `ws${seed}`;
  return svg(360, 140, `<defs><filter id="${id}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="7"/></filter></defs>
    <g filter="url(#${id})" fill="none" stroke-linecap="round">
      <path d="${d}" stroke="${color}" stroke-width="22" opacity="0.5"/>
      <path d="${d}" stroke="${color}" stroke-width="7" opacity="0.9" transform="translate(0,${(rnd() * 10 - 5).toFixed(0)})"/>
    </g>`);
}

/** Waben des Schwarmkerns: unregelmäßiger Fleck aus Sechseckzellen, manche mit Brut */
function bgComb(seed: number): string {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const R = 14;
  const w = Math.sqrt(3) * R;
  let cells = '';
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 10; col++) {
      const x = 20 + col * w + (row % 2 ? w / 2 : 0);
      const y = 20 + row * R * 1.5;
      const dx = x - 120;
      const dy = y - 120;
      const dist = Math.sqrt(dx * dx + dy * dy) + rnd() * 26;
      if (dist > 100 || x > 222 || y > 222) continue;
      const pts: string[] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        pts.push(`${(x + Math.cos(a) * (R - 2)).toFixed(1)},${(y + Math.sin(a) * (R - 2)).toFixed(1)}`);
      }
      const r = rnd();
      const fill = r < 0.12 ? '#2C5420' : r < 0.3 ? '#1A3418' : '#10220F';
      cells += `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="#20401E" stroke-width="3.4" stroke-linejoin="round"/>`;
      if (r < 0.12) cells += `<ellipse cx="${x.toFixed(1)}" cy="${(y + 1).toFixed(1)}" rx="5" ry="6" fill="#3A6A28"/>`;
    }
  }
  return svg(240, 240, cells);
}

/** organische Ranke mit Knoten und Dornen (senkrecht) */
function bgVine(seed: number): string {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let d = 'M40,0';
  const nodes: [number, number][] = [];
  for (let y = 40; y <= 320; y += 40) {
    const x = 26 + rnd() * 28;
    d += ` S${x.toFixed(0)},${y - 20} ${x.toFixed(0)},${y}`;
    nodes.push([x, y]);
  }
  let deco = '';
  for (const [x, y] of nodes) {
    const side = rnd() < 0.5 ? -1 : 1;
    deco += `<path d="M${x.toFixed(0)},${y} q${side * 14},-6 ${side * 20},-18" fill="none" stroke="#1C3A1E" stroke-width="4" stroke-linecap="round"/>`;
    if (rnd() < 0.6) deco += `<circle cx="${x.toFixed(0)}" cy="${y}" r="${(5 + rnd() * 4).toFixed(1)}" fill="#24482A" stroke="#0C1A0C" stroke-width="2"/>`;
  }
  return svgClip(`vc${seed}`, 80, 320, `
    <path d="${d}" fill="none" stroke="#0C1A0C" stroke-width="15" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#1C3A1E" stroke-width="10" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="#2A5228" stroke-width="3" stroke-linecap="round" transform="translate(-2,0)"/>
    ${deco}`);
}

/** Icons für den Händler (zusätzlich als Texturen) */
export function allSvgs(): Record<string, string> {
  const out: Record<string, string> = {
    player: player(),
    flame: flame(),
    drone: drone(1),
    drone_2: drone(2),
    drone_3: drone(3),
    pylon: pylon(),
    rig: rigTruss(),
    e_swarmer: swarmer(),
    e_hunter: hunter(),
    e_spinner: spinner(),
    e_kamikaze: kamikaze(),
    e_mine: mine(),
    e_bomber: bomber(),
    e_turret: turretBase(),
    e_turret_gun: turretGun(),
    e_frigate: frigate(),
    plate: plate(),
    b_main: bolt(8, 22, '#2EC4FF'),
    b_side: bolt(7, 16, '#FFE45C', '#FFF8D0'),
    b_spread: bolt(7, 14, '#7BD53A', '#E6FFD0'),
    b_laser: bolt(9, 44, '#C04BE8', '#F6DAFF'),
    b_rear: bolt(7, 14, '#F2A93B', '#FFF0D0'),
    b_drone: bolt(6, 12, '#7CF7FF'),
    b_pulse: bolt(5, 11, '#2EC4FF', '#E8FDFF'),
    b_missile: missile(),
    b_rail: railBolt(),
    b_flak: shell(),
    b_plasma: plasmaOrb(false),
    b_plasma_5: plasmaOrb(true),
    player_c1: playerCruiser(),
    player_c2: playerBattleship(),
    eb_orb: orb(6, '#FF3D6E'),
    eb_big: orb(9, '#FF7A1F'),
    eb_orb_h1: heavyOrb(6, '#FF3D6E', 1),
    eb_orb_h2: heavyOrb(6, '#FF2F5E', 2),
    eb_orb_h3: heavyOrb(6, '#F0204E', 3),
    eb_big_h1: heavyOrb(9, '#FF7A1F', 1),
    eb_big_h2: heavyOrb(9, '#FF6A14', 2),
    eb_big_h3: heavyOrb(9, '#F85A0A', 3),
    fx_soft: soft('sw', '#FFE45C', 64),
    fx_softblue: soft('sb2', '#2EC4FF', 64),
    fx_ring: ring(),
    fx_bubble: shieldBubble(),
    dot: dot(),
    planet_0: planet('#C04BE8', '#5A1F78', true),
    planet_1: planet('#2EC4FF', '#155A8A', false),
    planet_2: planet('#E8573A', '#7A2412', false),
    planet_3: planet('#7BD53A', '#2C5E12', true),
    asteroid_0: asteroid(7),
    asteroid_1: asteroid(1234),
    asteroid_2: asteroid(98765),
  };
  // Anbauten je Waffe und Stufe (`pod_<w>_<lvl>`, `core_<w>_<lvl>`), Bordkanonen-Sponsons ab P2
  for (let lvl = 1; lvl <= 5; lvl++) {
    for (const w of ['pulse', 'side', 'spread', 'missile', 'beam', 'rail', 'flak'] as const) out[`pod_${w}_${lvl}`] = wingPod(`pod_${w}_${lvl}`, w, lvl);
    for (const w of ['laser', 'rear', 'drone', 'arc', 'plasma'] as const) {
      out[`core_${w}_${lvl}`] = coreMount(`core_${w}_${lvl}`, w, lvl);
      out[`ico_core_${w}_${lvl}`] = coreMount('', w, lvl, true);
    }
  }
  // Animations-Frames der Evolutionen (Konvention `${textur}_f${i}`): rotierende Gatling-Trommel, knisternde Gewitterspule
  for (let i = 0; i < 3; i++) {
    out[`pod_side_5_f${i}`] = wingPod(`pod_side_5_f${i}`, 'side', 5, i);
    out[`core_arc_5_f${i}`] = coreMount(`core_arc_5_f${i}`, 'arc', 5, false, i);
  }
  // Ausleger je Stufe (1/2) und Schiffsklasse: `rig` (Stufe 1, Jäger), sonst `rig_<stufe>_<klasse>`
  for (let cls = 0; cls <= MAX_CLASS; cls++) {
    const sh = shipClass(cls).wingShift;
    if (cls > 0) out[`rig_1_${cls}`] = rigTruss(`rig_1_${cls}`, [68 + sh], 20 + sh);
    out[`rig_2_${cls}`] = rigTruss(`rig_2_${cls}`, [68 + sh, 112 + sh], 20 + sh);
  }
  out.drone_4 = drone(4);
  out.drone_5 = drone(5);
  for (let n = 2; n <= 5; n++) {
    out[`hullgun_${n}`] = hullGuns(n);
    META[`hullgun_${n}`] = { w: 64, h: 72, ax: 32, ay: 36, tips: [], lamp: [0, 0] };
  }
  META.player = { w: 64, h: 72, ax: 32, ay: 36, tips: [], lamp: [0, 0] };
  for (let v = 0; v < 4; v++) {
    out[`boss_${v}`] = boss(v);
    out[`boss_gun_${v}`] = bossGun(v);
  }
  out.boss_ring = bossRing();
  // Flügelschlag-Frames (Konvention `${textur}_f${i}`)
  for (let i = 0; i < 3; i++) out[`e_swarmer_f${i}`] = swarmer(i);
  Object.assign(out, {
    flame_e: enemyFlame(),
    d_rotor: rotor(),
    d_radar: radar(),
    d_gun: smallGun(),
    fx_glow: soft('gw', '#ffffff', 64),
    fx_spark: spark(),
    fx_muzzle: muzzle(),
    fx_star: star(),
    fx_smoke: smoke(),
    fx_shock: shock(),
    fx_debris_0: debris(0),
    fx_debris_1: debris(1),
    fx_debris_2: debris(2),
    fx_goo: goo(),
    bg_rock_0: bgRock(11),
    bg_rock_1: bgRock(4242, 9),
    bg_rock_2: bgRock(777, 13),
    bg_rock_3: bgRock(31337, 10),
    bg_rubble_0: bgRubble(5),
    bg_rubble_1: bgRubble(99),
    bg_girder_v: bgGirderV(),
    bg_girder_h: bgGirderH(),
    bg_dock: bgDock(),
    // Nebel je Thema (Farben wie THEMES[].nebula), Purpurnebel mit vier Tönen, dazu dunkle Staubwolke
    bg_neb_0_0: bgNebula(3, '#6B4AA8', '#8A6AC8'),
    bg_neb_0_1: bgNebula(808, '#5A3A90', '#6B4AA8'),
    bg_neb_1_0: bgNebula(3, '#2A7FA8', '#3A98C0'),
    bg_neb_1_1: bgNebula(808, '#1E6488', '#2A7FA8'),
    bg_neb_2_0: bgNebula(3, '#C0397A', '#E0609A'),
    bg_neb_2_1: bgNebula(808, '#7A2A9A', '#A040B8'),
    bg_neb_2_2: bgNebula(4711, '#9A3070', '#C0397A'),
    bg_neb_2_3: bgNebula(1717, '#502080', '#7A2A9A'),
    bg_neb_3_0: bgNebula(3, '#4FA83A', '#6CC050'),
    bg_neb_3_1: bgNebula(808, '#3A8A2A', '#4FA83A'),
    bg_neb_dark: bgNebula(4711, '#14060F', '#0A0308'),
    bg_wisp_0: bgWisp(12, '#E060A0'),
    bg_wisp_1: bgWisp(345, '#8A6AC8'),
    // farbige Leuchtpunkte (ohne Tint, damit sie in beiden Renderern gleich aussehen)
    glow_red: soft('gr', '#FF3D6E', 64),
    glow_orange: soft('go', '#FF7A1F', 64),
    glow_green: soft('gg', '#7BD53A', 64),
    glow_mint: soft('gm', '#3BF0A0', 64),
    glow_purple: soft('gp', '#C04BE8', 64),
    glow_pink: soft('gpk', '#FF4FA8', 64),
    glow_cyan: soft('gcy', '#7CF7FF', 64),
    bar: svg(4, 4, `<rect width="4" height="4" fill="#FF3D6E"/>`),
    bg_comb_0: bgComb(21),
    bg_comb_1: bgComb(1999),
    bg_vine_0: bgVine(8),
    bg_vine_1: bgVine(606),
  });
  for (const [k, fn] of Object.entries(ITEMS)) out[k] = fn();
  return out;
}

export interface LoadedImage {
  key: string;
  canvas: HTMLCanvasElement;
}

/** SVGs in Canvas mit exakter Zielgröße rastern (iOS-Safari zeigt SVG-Bilder sonst falsch skaliert) */
export async function loadImages(): Promise<LoadedImage[]> {
  const svgs = allSvgs();
  return Promise.all(
    Object.entries(svgs).map(
      ([key, src]) =>
        new Promise<LoadedImage>((resolve, reject) => {
          const img = new Image();
          const w = Number(/width="([\d.]+)"/.exec(src)![1]);
          const h = Number(/height="([\d.]+)"/.exec(src)![1]);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            resolve({ key, canvas });
          };
          img.onerror = () => reject(new Error(`Grafik ${key} lädt nicht`));
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
        }),
    ),
  );
}
