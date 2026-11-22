// Key-Artwork und Icons für Link-Vorschau (Open Graph) und Web-App.
//
// Die Szenen werden als SVG-Komposit aus den echten Spiel-Sprites (src/assets/sprites.ts:
// Spielerschiff, Gegner, Boss-Rigs, Kulissen, Effekte) zusammengesetzt und mit einem
// headless Browser (playwright-core, standardmäßig Firefox) als PNG gerendert.
// Bei Grafikänderungen einfach neu erzeugen:  npm run artwork
//
// Ausgabe nach assets/public/:
//   og-image.png (1200×630), og-image-square.png (1200×1200), apple-touch-icon.png (180×180),
//   icon-192.png, icon-512.png, icon-512-maskable.png, favicon-32.png, favicon.svg
//
// Optionen:
//   --preview <ordner>   zusätzlich verkleinerte Prüfbilder (300×157, 60×60, 32×32 …)
//   --html <ordner>      die erzeugten HTML-Seiten zum Debuggen ablegen
//
// Umgebungsvariablen:
//   PW_DIR       Ordner mit node_modules/playwright-core (Default: siehe DEFAULT_PW_DIR)
//   BROWSER_EXE  Pfad zur Browser-Binary (Default: Playwright-Firefox im ms-playwright-Cache)
//   BROWSER      'firefox' (Default) oder 'chromium'

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'assets/public');
const DEFAULT_PW_DIR = join(root, 'node_modules');
const DEFAULT_BROWSER_EXE = join(homedir(), '.cache/ms-playwright/firefox-1543/firefox/firefox');

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const PREVIEW_DIR = argVal('--preview');
const HTML_DIR = argVal('--html');

// ---------------------------------------------------------------- Playwright laden

function loadPlaywright() {
  const dir = process.env.PW_DIR || DEFAULT_PW_DIR;
  if (!existsSync(join(dir, 'playwright-core', 'package.json'))) {
    console.error(
      `playwright-core nicht gefunden unter:\n  ${dir}\n` +
        'Bitte playwright-core in einen beliebigen Ordner installieren (npm i playwright-core)\n' +
        'und den node_modules-Ordner per Umgebungsvariable angeben, z. B.:\n' +
        '  PW_DIR=/pfad/zu/node_modules npm run artwork',
    );
    process.exit(1);
  }
  return createRequire(join(dir, 'x.js'))('playwright-core');
}

// ---------------------------------------------------------------- Sprites und Schrift

async function loadSprites() {
  const r = await build({
    entryPoints: [join(root, 'src/assets/sprites.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'error',
  });
  const mod = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
  const svgs = mod.allSvgs();
  return { svgs, rigs: mod.BOSS_RIGS, meta: mod.partMeta };
}

const fontB64 = readFileSync(join(root, 'node_modules/@fontsource/russo-one/files/russo-one-latin-400-normal.woff2')).toString('base64');
const FONT_CSS = `@font-face{font-family:'Russo One';src:url(data:font/woff2;base64,${fontB64}) format('woff2');font-display:block}`;

// ---------------------------------------------------------------- Hilfen

const O = '#0E1022'; // Outline-Farbe der Sprites
const f = (n) => +(+n).toFixed(2);

/** Deterministischer Zufall (mulberry32), damit jedes Rendering gleich aussieht */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

let SV = {};
let RIGS = [];
let META = () => null;

/** Zerlegt ein Sprite-SVG in Größe (viewBox) und Inhalt */
function parts(key) {
  const svg = SV[key];
  if (!svg) throw new Error('Unbekanntes Sprite: ' + key);
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { w: +m[1], h: +m[2], inner };
}

/**
 * Setzt ein Sprite mittig auf (x, y). s = Skalierung (1 = viewBox-Einheiten = Spielpixel),
 * sy = eigene Höhenskalierung, rot in Grad. ox/oy = Drehpunkt relativ zur viewBox (Default: Mitte).
 * add = additiv wirkend (Glühen, Flammen) per mix-blend-mode: screen.
 */
function sprite(key, x, y, { s = 1, sy = null, rot = 0, ox = null, oy = null, opacity = 1, add = false, extra = '' } = {}) {
  const { w, h, inner } = parts(key);
  const px = ox ?? w / 2;
  const py = oy ?? h / 2;
  const style = add ? ' style="mix-blend-mode:screen"' : '';
  const op = opacity !== 1 ? ` opacity="${f(opacity)}"` : '';
  return (
    `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(s)} ${f(sy ?? s)})"${op}${style} ${extra}>` +
    `<svg x="${-px}" y="${-py}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">${inner}</svg></g>`
  );
}

// ---------------------------------------------------------------- Bausteine der Szene

/** Weltraum-Hintergrund: Farbverlauf (wie Sektor-Themen), Nebel, Sterne, Tempo-Streifen */
function space(W, H, { seed = 1, stars = 260, nebulae = [], streaks = 0 }) {
  const R = rng(seed);
  let g =
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#170818"/><stop offset=".55" stop-color="#1A1030"/><stop offset="1" stop-color="#0B0A1E"/></linearGradient>` +
    `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (const n of nebulae) g += sprite(n.key, n.x, n.y, { s: n.s, rot: n.rot ?? 0, opacity: n.o ?? 1 });
  // Sterne: viele kleine, wenige helle mit Glühen
  for (let i = 0; i < stars; i++) {
    const x = R() * W;
    const y = R() * H;
    const big = R() < 0.08;
    const r = big ? R.range(1.6, 2.4) : R.range(0.6, 1.4);
    const col = R.pick(['#FFFFFF', '#FFFFFF', '#BFF6FF', '#FFE9F6', '#FFF3C0']);
    if (big) {
      const l = r * 4.5;
      g += `<path d="M${f(x - l)} ${f(y)} H${f(x + l)} M${f(x)} ${f(y - l)} V${f(y + l)}" stroke="${col}" stroke-opacity=".7" stroke-width="${f(r * 0.6)}" stroke-linecap="round"/>`;
    }
    g += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${col}" opacity="${f(big ? 1 : R.range(0.35, 0.85))}"/>`;
  }
  // Tempo-Streifen: dünne senkrechte Linien, die Flug nach oben andeuten
  for (let i = 0; i < streaks; i++) {
    const x = R() * W;
    const y = R() * H;
    const l = R.range(40, 120);
    g += `<path d="M${f(x)} ${f(y)} V${f(y + l)}" stroke="#BFF6FF" stroke-opacity="${f(R.range(0.08, 0.22))}" stroke-width="${f(R.range(1, 2))}" stroke-linecap="round"/>`;
  }
  return g;
}

/** Teil am Ankerpunkt setzen (Metadaten aus sprites.ts), links gespiegelt */
function part(key, x, y, s, flip = false) {
  const m = META(key);
  return sprite(key, x, y, { s: flip ? -s : s, sy: s, ox: m.ax, oy: m.ay });
}

/**
 * Spielerschiff wie im Spiel, voll ausgebaut: Ausleger, Seitenkanonen Stufe 3 auf den Flügeln,
 * Impulsblaster Stufe 3 außen am Ausleger, Pulslaser Stufe 3 auf der Nase, Bordkanone P5.
 * Abstände wie slotOffset() in src/core/data/shop.ts (innen 40, außen 84 bei Stufe 3).
 */
function playerShip(x, y, s, { pods = true, core = true, flame = 1.25 } = {}) {
  let g = '';
  g += sprite('fx_softblue', x, y + 40 * s, { s: s * 0.9 * flame, opacity: 0.85, add: true });
  g += sprite('fx_softblue', x, y + 62 * s, { s: s * 0.55 * flame, sy: s * 1.1 * flame, opacity: 0.7, add: true });
  g += sprite('flame', x, y + (32 + 15 * flame) * s, { s: s * 1.3, sy: s * 1.25 * flame });
  if (pods) {
    g += part('rig', x, y + 8 * s, s);
    for (const sd of [-1, 1]) {
      g += part('pylon', x + sd * 72 * s, y + 5 * s, s, sd < 0);
      g += part('pod_pulse_3', x + sd * 84 * s, y + 2 * s, s, sd < 0);
      g += part('pylon', x + sd * 28 * s, y + 5 * s, s, sd < 0);
    }
  }
  g += sprite('player', x, y, { s });
  if (pods) for (const sd of [-1, 1]) g += part('pod_side_3', x + sd * 40 * s, y + 2 * s, s, sd < 0);
  if (core) g += part('core_laser_3', x, y, s);
  if (pods) g += part('hullgun_5', x, y, s);
  return g;
}

/** Spielerschüsse: Reihen von Bolzen nach oben, mit Mündungsfeuer */
function playerShots(x, y, s, { rows = 4, gap = 70, len = 1, stop = -1e9 } = {}) {
  let g = '';
  const lanes = [
    ['b_main', 0, -50, '#2EC4FF'],
    ['b_main', -9, -44, '#2EC4FF'],
    ['b_main', 9, -44, '#2EC4FF'],
    ['b_laser', 0, -62, '#C04BE8'],
    ['b_side', -44.5, -16, '#FFE45C'],
    ['b_side', -35.5, -16, '#FFE45C'],
    ['b_side', 35.5, -16, '#FFE45C'],
    ['b_side', 44.5, -16, '#FFE45C'],
    ['b_pulse', -88.5, -16, '#2EC4FF'],
    ['b_pulse', -79.5, -16, '#2EC4FF'],
    ['b_pulse', 79.5, -16, '#2EC4FF'],
    ['b_pulse', 88.5, -16, '#2EC4FF'],
  ];
  for (const [key, ox, oy, col] of lanes) {
    for (let r = 0; r < rows; r++) {
      const by = y + (oy - 30 - r * gap) * s;
      if (by < stop) break; // Schüsse enden am Ziel (Treffer am Boss)
      g += sprite('fx_glow', x + ox * s, by, { s: s * 0.32, sy: s * 0.6, opacity: 0.35, add: true, extra: `filter="url(#tint${col.slice(1)})"` });
      g += sprite(key, x + ox * s, by, { s: s * 1.1, sy: s * 1.1 * len });
    }
    // Mündungsfeuer
    g += sprite('fx_muzzle', x + ox * s, y + oy * s, { s: s * (key === 'b_main' ? 0.9 : 0.7), rot: 45, add: true, extra: `filter="url(#tint${col.slice(1)})"` });
  }
  return g;
}

/** Explosion aus den Juice-Effekten: Rauch, Glut, Schockwelle, Funken, Trümmer */
function explosion(x, y, s, seed = 3, glowKey = 'glow_orange') {
  const R = rng(seed);
  let g = '';
  for (let i = 0; i < 3; i++) g += sprite('fx_smoke', x + R.range(-24, 24) * s, y + R.range(-20, 20) * s, { s: s * R.range(0.8, 1.1), opacity: 0.5 });
  g += sprite(glowKey, x, y, { s: s * 2.4, add: true });
  g += sprite('glow_red', x, y, { s: s * 1.7, opacity: 0.9, add: true });
  g += sprite('fx_shock', x, y, { s: s * 1.3, opacity: 0.55, add: true, extra: 'filter="url(#tintFFE45C)"' });
  g += sprite('fx_soft', x, y, { s: s * 0.9, add: true });
  g += sprite('fx_muzzle', x, y, { s: s * 2.4, rot: R.range(0, 40), add: true, extra: 'filter="url(#tintFFE45C)"' });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * 360 + R.range(-14, 14);
    const d = R.range(30, 52) * s;
    const ar = (a * Math.PI) / 180;
    g += sprite('fx_spark', x + Math.sin(ar) * d, y - Math.cos(ar) * d, { s: s * R.range(1, 1.5), rot: a, add: true });
  }
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2;
    const d = R.range(40, 62) * s;
    g += sprite(`fx_debris_${i % 3}`, x + Math.cos(a) * d, y + Math.sin(a) * d, { s: s * R.range(1, 1.4), rot: R() * 360 });
  }
  g += sprite('fx_glow', x, y, { s: s * 0.55, add: true });
  return g;
}

/** Endgegner mit Triebwerken, Kernleuchten, Geschützen (wie GameScene.renderBoss) */
function bossShip(v, x, y, s, { aim = 0 } = {}) {
  const rig = RIGS[v];
  const glowKey = ['glow_orange', 'fx_softblue', 'glow_purple', 'glow_green'][v];
  let g = '';
  for (const [dx, dy] of rig.engines) {
    g += sprite('glow_orange', x + dx * s, y + (dy - 16) * s, { s: s * 0.7, opacity: 0.8, add: true });
    g += sprite('flame_e', x + dx * s, y + (dy - 14) * s, { s: s * 1.5, sy: s * 1.9 });
  }
  g += sprite(`boss_${v}`, x, y, { s });
  const [cx, cy] = rig.core;
  g += sprite(glowKey, x + cx * s, y + cy * s, { s: s * 1.1, opacity: 0.7, add: true });
  if (rig.ring) g += sprite('boss_ring', x + cx * s, y + cy * s, { s, rot: 12 });
  for (const [dx, dy] of rig.guns) {
    const a = aim * Math.sign(dx);
    g += sprite(`boss_gun_${v}`, x + dx * s, y + dy * s, { s, rot: a, ox: 18, oy: 16 });
  }
  for (const [dx, dy] of rig.lights) g += sprite('glow_red', x + dx * s, y + dy * s, { s: s * 0.28, add: true });
  return g;
}

/** Gegner mit Triebwerksflamme oben (Gegner fliegen nach unten) */
function enemy(key, x, y, s, { rot = 0, flame = 0 } = {}) {
  let g = '';
  if (flame) {
    g += sprite('glow_orange', x, y - flame * s, { s: s * 0.32, opacity: 0.7, add: true });
    g += sprite('flame_e', x, y - (flame + 6) * s, { s: s * 0.9, sy: s * 1.1, rot: 0 });
  }
  g += sprite(key, x, y, { s, rot });
  return g;
}

/** Gegnerkugel mit Glühen */
const orb = (x, y, s, key = 'eb_orb') => sprite('glow_red', x, y, { s: s * 0.4, add: true }) + sprite(key, x, y, { s });

/** Titel „OGANESSON“ in Russo One: Leuchten, dunkle Kontur, Farbverlauf, Glanzkante */
function titleText(text, x, y, size, { spacing = 0.04 } = {}) {
  const attrs = `font-family="Russo One" font-size="${f(size)}" letter-spacing="${f(size * spacing)}" text-anchor="middle" stroke-linejoin="round"`;
  const t = (extra) => `<text x="${f(x)}" y="${f(y)}" ${attrs} ${extra}>${text}</text>`;
  return (
    // weites Leuchten (Magenta/Cyan wie die Spielpalette)
    t(`fill="none" stroke="#C04BE8" stroke-width="${f(size * 0.2)}" opacity=".75" filter="url(#tglowWide)"`) +
    t(`fill="none" stroke="#2EC4FF" stroke-width="${f(size * 0.1)}" opacity=".9" filter="url(#tglow)"`) +
    // harter Schlagschatten
    `<g transform="translate(0 ${f(size * 0.06)})">${t(`fill="${O}" stroke="${O}" stroke-width="${f(size * 0.11)}"`)}</g>` +
    // Kontur + Füllung
    t(`fill="url(#tgrad)" stroke="${O}" stroke-width="${f(size * 0.1)}" paint-order="stroke"`) +
    // helle Innenkante
    t(`fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="${f(size * 0.012)}"`)
  );
}

/** „GIGABASH“ unter dem Titel wie auf dem Startbildschirm (.title .giga): gelb, dunkle Kontur, harter Schatten, leicht schräg */
function gigaText(text, x, y, size) {
  const attrs = `font-family="Russo One" font-size="${f(size)}" letter-spacing="${f(size * 0.12)}" text-anchor="middle" stroke-linejoin="round"`;
  const t = (extra) => `<text x="${f(x)}" y="${f(y)}" ${attrs} ${extra}>${text}</text>`;
  const sh = size * 0.12;
  return (
    `<g transform="rotate(-3 ${f(x)} ${f(y)})">` +
    t(`fill="none" stroke="#F2A93B" stroke-width="${f(size * 0.3)}" opacity=".55" filter="url(#tglow)"`) +
    `<g transform="translate(${f(sh)} ${f(sh)})">${t(`fill="${O}" stroke="${O}" stroke-width="${f(size * 0.1)}"`)}</g>` +
    t(`fill="#FFE45C" stroke="${O}" stroke-width="${f(size * 0.1)}" paint-order="stroke"`) +
    '</g>'
  );
}

/** Unterzeile auf dunkler Plakette */
function subline(text, x, y, size, w) {
  const h = size * 1.7;
  return (
    `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(h / 2)}" fill="${O}" fill-opacity=".82" stroke="#2EC4FF" stroke-opacity=".8" stroke-width="${f(size * 0.09)}"/>` +
    `<text x="${f(x)}" y="${f(y + size * 0.36)}" font-family="Russo One" font-size="${f(size)}" letter-spacing="${f(size * 0.08)}" text-anchor="middle" fill="#FFE45C">${text}</text>`
  );
}

/** Gemeinsame Definitionen: Titel-Verlauf, Leucht-Filter, Einfärbe-Filter für weiße Effekte */
function defs() {
  const tint = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return `<filter id="tint${hex.slice(1)}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${c[0]} 0 0 0 0  0 ${c[1]} 0 0 0  0 0 ${c[2]} 0 0  0 0 0 1 0"/></filter>`;
  };
  return (
    '<defs>' +
    '<linearGradient id="tgrad" x1="0" y1="0" x2="0" y2="1"><stop offset=".08" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#BFF6FF"/><stop offset=".78" stop-color="#2EC4FF"/><stop offset="1" stop-color="#1A6FB0"/></linearGradient>' +
    '<filter id="tglow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>' +
    '<filter id="tglowWide" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="22"/></filter>' +
    '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>' +
    tint('#2EC4FF') + tint('#FFE45C') + tint('#FF3D6E') +
    '</defs>'
  );
}

const svgDoc = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}${body}</svg>`;

// ---------------------------------------------------------------- Key-Artwork

/**
 * Szene für das Key-Artwork. L enthält Format und Positionen; alles in Bildpixeln.
 * Ebenen: Weltraum → Planet/Asteroiden → Boss → Gegner → Schüsse/Explosionen → Spieler → Abdunklung → Titel.
 */
function keyArt(L) {
  const { W, H } = L;
  let g = space(W, H, L.space);
  for (const p of L.planets ?? []) g += sprite(p.key, p.x, p.y, { s: p.s, rot: p.rot ?? 0, opacity: p.o ?? 1 });
  for (const a of L.asteroids ?? []) g += sprite(a.key, a.x, a.y, { s: a.s, rot: a.rot ?? 0 });
  const b = L.boss;
  g += bossShip(b.v, b.x, b.y, b.s, { aim: b.aim ?? 0.25 });
  // Bossfeuer: Mündungsblitze und Kugeln Richtung Spieler
  for (const [x, y, s] of L.bossShots ?? []) g += orb(x, y, s, 'eb_big');
  for (const e of L.enemies) g += enemy(e.key, e.x, e.y, e.s, { rot: e.rot ?? 0, flame: e.flame ?? 0 });
  for (const [x, y, s] of L.orbs ?? []) g += orb(x, y, s);
  const p = L.player;
  g += playerShots(p.x, p.y, p.s, L.shots);
  for (const e of L.booms ?? []) g += explosion(e.x, e.y, e.s, e.seed, e.glow);
  g += playerShip(p.x, p.y, p.s);
  for (const w of L.wings ?? []) g += sprite('drone', w.x, w.y, { s: w.s, rot: w.rot ?? 0 });
  // weiche Abdunklung hinter dem Titel für Lesbarkeit in kleinen Vorschaukarten
  const t = L.title;
  g += `<ellipse cx="${W / 2}" cy="${f(t.y - t.size * 0.3 + (L.giga ? t.size * 0.3 : 0))}" rx="${f(t.size * 3.6)}" ry="${f(t.size * (L.giga ? 1.25 : 0.9))}" fill="#07040F" opacity="${t.halo ?? 0.6}" filter="url(#soft)"/>`;
  g += titleText('OGANESSON', W / 2, t.y, t.size);
  if (L.giga) g += gigaText('GIGABASH', W / 2, L.giga.y, L.giga.size);
  if (L.sub) g += subline(L.sub.text, W / 2, L.sub.y, L.sub.size, L.sub.w);
  return svgDoc(W, H, g);
}

/** Querformat 1200×630: Boss oben, Formation an den Seiten, Spieler unten, Titel mittig */
const LAYOUT_WIDE = {
  W: 1200, H: 630,
  space: {
    seed: 5, stars: 240, streaks: 26,
    nebulae: [
      { key: 'bg_neb_2_0', x: 180, y: 140, s: 3.4, o: 0.75 },
      { key: 'bg_neb_2_1', x: 1040, y: 470, s: 3.8, o: 0.8 },
      { key: 'bg_neb_2_3', x: 620, y: 300, s: 4.4, o: 0.55 },
      { key: 'bg_neb_2_2', x: 980, y: 90, s: 2.6, o: 0.6 },
      { key: 'bg_neb_0_0', x: 140, y: 560, s: 3, o: 0.6 },
    ],
  },
  planets: [{ key: 'planet_0', x: 1100, y: 560, s: 1.15, rot: 0 }],
  asteroids: [
    { key: 'asteroid_0', x: 70, y: 420, s: 1.1, rot: 20 },
    { key: 'asteroid_2', x: 140, y: 495, s: 0.7, rot: 80 },
  ],
  boss: { v: 0, x: 600, y: 74, s: 1.45, aim: 0.3 },
  bossShots: [[438, 196, 1.3], [770, 210, 1.3]],
  enemies: [
    // Schwärmer-V links
    { key: 'e_swarmer_f0', x: 150, y: 116, s: 1.5 },
    { key: 'e_swarmer_f1', x: 210, y: 160, s: 1.5 },
    { key: 'e_swarmer_f2', x: 90, y: 160, s: 1.5 },
    { key: 'e_swarmer_f0', x: 270, y: 204, s: 1.5 },
    { key: 'e_swarmer_f1', x: 30, y: 204, s: 1.5 },
    // Jäger und Kreisel rechts
    { key: 'e_hunter', x: 1000, y: 150, s: 1.45, flame: 22 },
    { key: 'e_hunter', x: 1100, y: 118, s: 1.45, flame: 22 },
    { key: 'e_spinner', x: 1130, y: 260, s: 1.3, rot: 18 },
    { key: 'e_kamikaze', x: 300, y: 470, s: 1.35, rot: 14, flame: 22 },
  ],
  orbs: [[860, 470, 1.2], [930, 410, 1.1], [255, 555, 1.1]],
  player: { x: 600, y: 556, s: 1.6 },
  shots: { rows: 7, gap: 52, stop: 200 },
  booms: [
    { x: 1012, y: 236, s: 1.05, seed: 7 },
    { x: 190, y: 470, s: 0.8, seed: 11 },
    { x: 600, y: 196, s: 0.55, seed: 3 },
  ],
  title: { y: 300, size: 146, halo: 0.7 },
  giga: { y: 386, size: 74 },
  sub: { text: 'WELTRAUM-SHOOTER IM BROWSER', y: 438, size: 21, w: 450 },
};

/** Quadrat 1200×1200: mehr Formation oben, Titel in der Mitte */
const LAYOUT_SQUARE = {
  W: 1200, H: 1200,
  space: {
    seed: 9, stars: 420, streaks: 40,
    nebulae: [
      { key: 'bg_neb_2_0', x: 200, y: 260, s: 4.4, o: 0.75 },
      { key: 'bg_neb_2_1', x: 1000, y: 820, s: 5, o: 0.8 },
      { key: 'bg_neb_2_3', x: 600, y: 600, s: 6, o: 0.55 },
      { key: 'bg_neb_2_2', x: 1000, y: 200, s: 3.4, o: 0.6 },
      { key: 'bg_neb_0_0', x: 180, y: 1000, s: 4, o: 0.6 },
    ],
  },
  planets: [{ key: 'planet_0', x: 1080, y: 1060, s: 1.6 }],
  asteroids: [
    { key: 'asteroid_0', x: 90, y: 820, s: 1.4, rot: 20 },
    { key: 'asteroid_2', x: 190, y: 920, s: 0.9, rot: 80 },
    { key: 'asteroid_1', x: 1110, y: 560, s: 0.8, rot: 40 },
  ],
  boss: { v: 0, x: 600, y: 170, s: 2.1, aim: 0.3 },
  bossShots: [[420, 380, 1.6], [800, 400, 1.6], [520, 470, 1.3]],
  enemies: [
    { key: 'e_swarmer_f0', x: 150, y: 330, s: 1.8 },
    { key: 'e_swarmer_f1', x: 225, y: 385, s: 1.8 },
    { key: 'e_swarmer_f2', x: 75, y: 385, s: 1.8 },
    { key: 'e_swarmer_f0', x: 300, y: 440, s: 1.8 },
    { key: 'e_hunter', x: 1000, y: 360, s: 1.8, flame: 22 },
    { key: 'e_hunter', x: 1110, y: 320, s: 1.8, flame: 22 },
    { key: 'e_spinner', x: 1120, y: 470, s: 1.6, rot: 18 },
    { key: 'e_kamikaze', x: 290, y: 900, s: 1.6, rot: 14, flame: 22 },
    { key: 'e_bomber', x: 960, y: 900, s: 1.3, flame: 0 },
  ],
  orbs: [[860, 860, 1.4], [940, 800, 1.3], [340, 990, 1.3]],
  player: { x: 600, y: 1030, s: 2.3 },
  shots: { rows: 9, gap: 54, stop: 410 },
  booms: [
    { x: 600, y: 400, s: 0.75, seed: 3 },
    { x: 1030, y: 450, s: 1.3, seed: 7 },
    { x: 220, y: 800, s: 1.0, seed: 11 },
  ],
  title: { y: 600, size: 156, halo: 0.65 },
  giga: { y: 696, size: 84 },
  sub: { text: 'WELTRAUM-SHOOTER IM BROWSER', y: 776, size: 30, w: 640 },
};

// ---------------------------------------------------------------- Icons

/**
 * App-Icon: Spielerschiff groß auf Weltraum-Hintergrund mit Triebwerksglühen
 * und einem Orbit-Ring (Atom-Anspielung auf das Element Oganesson).
 * pad = Rand pro Seite als Anteil (maskable: 0.1 → Motiv in der 80-%-Safe-Zone, Hintergrund vollflächig).
 */
function iconSvg({ size, pad = 0 }) {
  const S = 512; // intern in 512er Koordinaten zeichnen, dann skalieren
  const R = rng(4);
  let bg =
    `<radialGradient id="ibg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#3A1450"/><stop offset=".55" stop-color="#1A1030"/><stop offset="1" stop-color="#0B0A1E"/></radialGradient>` +
    `<rect width="${S}" height="${S}" fill="url(#ibg)"/>`;
  bg += sprite('bg_neb_2_0', 120, 110, { s: 2.2, opacity: 0.55 });
  bg += sprite('bg_neb_2_1', 420, 420, { s: 2.4, opacity: 0.55 });
  for (let i = 0; i < 46; i++) {
    const r = R() < 0.15 ? 3 : R.range(1.2, 2.2);
    bg += `<circle cx="${f(R() * S)}" cy="${f(R() * S)}" r="${f(r)}" fill="#FFFFFF" opacity="${f(R.range(0.4, 0.95))}"/>`;
  }
  // Motiv: Orbit-Ring (hinter dem Schiff) mit zwei „Elektronen“, darüber das Schiff
  let m = '';
  const cx = S / 2;
  const cy = S * 0.45;
  const [rx, ry, tilt] = [226, 76, -24];
  const onRing = (t) => {
    const a = (tilt * Math.PI) / 180;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + 34 + x * Math.sin(a) + y * Math.cos(a)];
  };
  m += `<circle cx="${cx}" cy="${cy + 30}" r="200" fill="#2EC4FF" opacity=".25" filter="url(#iglowWide)"/>`;
  m +=
    `<g transform="rotate(${tilt} ${cx} ${cy + 34})">` +
    `<ellipse cx="${cx}" cy="${cy + 34}" rx="${rx}" ry="${ry}" fill="none" stroke="#C04BE8" stroke-width="34" opacity=".6" filter="url(#iglow)"/>` +
    `<ellipse cx="${cx}" cy="${cy + 34}" rx="${rx}" ry="${ry}" fill="none" stroke="${O}" stroke-width="20"/>` +
    `<ellipse cx="${cx}" cy="${cy + 34}" rx="${rx}" ry="${ry}" fill="none" stroke="#E9A8FF" stroke-width="10"/>` +
    '</g>';
  for (const t of [Math.PI * 0.93, Math.PI * 1.9]) {
    const [ex, ey] = onRing(t);
    m += sprite('glow_purple', ex, ey, { s: 1.3, add: true });
    m += `<circle cx="${f(ex)}" cy="${f(ey)}" r="15" fill="#FFFFFF" stroke="${O}" stroke-width="6"/>`;
  }
  m += playerShip(cx, cy, 4.3, { pods: false, core: false, flame: 1.15 });
  const fx =
    '<defs><filter id="iglow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>' +
    '<filter id="iglowWide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter></defs>';
  const k = (1 - pad * 2);
  const body = bg + `<g transform="translate(${f(S * pad)} ${f(S * pad)}) scale(${f(k)})">${m}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${S} ${S}">${fx}${body}</svg>`;
}

/**
 * Schlanke Favicon-Version: Schiff-Silhouette auf abgerundeter dunkler Kachel, ohne Filter und Text,
 * damit Browser sie zuverlässig und scharf darstellen.
 */
function faviconSvg() {
  const { inner } = parts('player');
  // Schiff (viewBox 64×72) mittig in 64×64-Kachel; Flamme als einfache Form
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="fb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#33102E"/><stop offset="1" stop-color="#0B0A1E"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="14" fill="url(#fb)"/>` +
    `<path d="M25.5,50 Q32,67 38.5,50 Z" fill="#2EC4FF"/><path d="M28,50 Q32,63 36,50 Z" fill="#7CF7FF"/><path d="M30,50 Q32,58 34,50 Z" fill="#fff"/>` +
    `<g transform="translate(32 29) scale(.8) translate(-32 -36)">${inner}</g>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------- PNG ohne Alphakanal

/**
 * Wandelt ein RGBA-PNG (8 Bit, nicht interlaced) in ein RGB-PNG um. Icons für iOS & Co. sollen keine
 * Transparenz enthalten; Browser-Screenshots liefern aber immer RGBA. Bricht ab, falls doch ein
 * Pixel durchscheint (dann wäre das Motiv nicht randlos gefüllt).
 */
function stripAlpha(png) {
  const chunks = [];
  let ihdr = null;
  const idat = [];
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    const type = png.toString('latin1', o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    chunks.push(type);
    o += 12 + len;
  }
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) throw new Error('stripAlpha: nur 8-Bit-RGBA ohne Interlacing');
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const cur = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);
  const out = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    // Zeile als RGB mit Filter „Sub“ schreiben (komprimiert gut)
    const o = y * (w * 3 + 1);
    out[o] = 1;
    for (let x = 0; x < w; x++) {
      if (cur[x * 4 + 3] !== 255) throw new Error(`stripAlpha: transparentes Pixel bei ${x},${y}`);
      for (let k = 0; k < 3; k++) {
        const v = cur[x * 4 + k];
        const left = x ? cur[(x - 1) * 4 + k] : 0;
        out[o + 1 + x * 3 + k] = (v - left) & 255;
      }
    }
    prev = Buffer.from(cur);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, 'latin1');
    data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const hdr = Buffer.from(ihdr);
  hdr[9] = 2; // Farbtyp RGB
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', hdr), chunk('IDAT', deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- Rendern

const page = (svg, w, h) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style></head>` +
  `<body style="width:${w}px;height:${h}px"><div style="width:${w}px;height:${h}px">${svg.replace(/^<svg /, `<svg style="width:${w}px;height:${h}px" `)}</div></body></html>`;

async function main() {
  ({ svgs: SV, rigs: RIGS, meta: META } = await loadSprites());
  const pw = loadPlaywright();
  const browserType = process.env.BROWSER === 'chromium' ? pw.chromium : pw.firefox;
  const exe = process.env.BROWSER_EXE || (process.env.BROWSER === 'chromium' ? null : DEFAULT_BROWSER_EXE);
  let browser;
  try {
    browser = await browserType.launch(exe ? { executablePath: exe } : {});
  } catch (e) {
    console.error('Browser konnte nicht gestartet werden. BROWSER_EXE prüfen.\n' + e.message);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  if (PREVIEW_DIR) mkdirSync(PREVIEW_DIR, { recursive: true });
  if (HTML_DIR) mkdirSync(HTML_DIR, { recursive: true });

  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1200, height: 1200 } });
  const p = await ctx.newPage();

  async function render(name, svg, w, h, { transparent = false } = {}) {
    if (transparent) {
      // Firefox kann kein omitBackground: SVG stattdessen im Browser auf ein Canvas zeichnen (Alphakanal bleibt erhalten)
      await p.setContent('<body></body>');
      const b64 = await p.evaluate(
        async ([src, w, h]) => {
          const im = new Image();
          im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
          await im.decode();
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(im, 0, 0, w, h);
          return c.toDataURL('image/png').split(',')[1];
        },
        [svg, w, h],
      );
      const buf = Buffer.from(b64, 'base64');
      writeFileSync(join(OUT, name), buf);
      console.log(`  ${name}  ${w}×${h}  ${(buf.length / 1024).toFixed(1)} KB`);
      return buf;
    }
    const html = page(svg, w, h);
    if (HTML_DIR) writeFileSync(join(HTML_DIR, name.replace(/\.png$/, '.html')), html);
    // sehr kleine Fenster mögen manche Browser nicht: Mindestgröße, dann per clip ausschneiden
    await p.setViewportSize({ width: Math.max(w, 320), height: Math.max(h, 240) });
    await p.setContent(html);
    await p.evaluate(async () => {
      await document.fonts.load('100px "Russo One"');
      await document.fonts.ready;
    });
    await p.waitForTimeout(150);
    const buf = stripAlpha(await p.screenshot({ clip: { x: 0, y: 0, width: w, height: h } }));
    writeFileSync(join(OUT, name), buf);
    console.log(`  ${name}  ${w}×${h}  ${(buf.length / 1024).toFixed(0)} KB`);
    return buf;
  }

  /** Verkleinertes Prüfbild eines PNG (Wirkung in kleinen Karten bzw. auf dem Home-Bildschirm) */
  async function preview(buf, name, w, h, { round = 0, zoom = 1, bg = '#fff' } = {}) {
    if (!PREVIEW_DIR) return;
    // zoom > 1: erst auf w×h verkleinern, dann pixelgenau vergrößert anzeigen (zum Begutachten winziger Icons)
    await p.setViewportSize({ width: Math.max(w * zoom, 320), height: Math.max(h * zoom, 240) });
    await p.setContent(
      `<body style="margin:0;background:${bg}"><canvas id="c" width="${w}" height="${h}" style="display:block;width:${w * zoom}px;height:${h * zoom}px;image-rendering:pixelated;border-radius:${round * 100}%"></canvas></body>`,
    );
    await p.evaluate(async (src) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      const c = document.getElementById('c');
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, 0, 0, c.width, c.height);
    }, 'data:image/png;base64,' + buf.toString('base64'));
    await p.screenshot({ path: join(PREVIEW_DIR, name), clip: { x: 0, y: 0, width: w * zoom, height: h * zoom } });
  }

  console.log('Rendere Artwork nach assets/public/ …');
  const og = await render('og-image.png', keyArt(LAYOUT_WIDE), 1200, 630);
  const sq = await render('og-image-square.png', keyArt(LAYOUT_SQUARE), 1200, 1200);
  const touch = await render('apple-touch-icon.png', iconSvg({ size: 180 }), 180, 180);
  await render('icon-192.png', iconSvg({ size: 192 }), 192, 192);
  const i512 = await render('icon-512.png', iconSvg({ size: 512 }), 512, 512);
  // maskable: Motiv innerhalb des inneren 80-%-Kreises (Safe Zone), Hintergrund vollflächig
  const mask = await render('icon-512-maskable.png', iconSvg({ size: 512, pad: 0.1 }), 512, 512);
  const favSvg = faviconSvg();
  writeFileSync(join(OUT, 'favicon.svg'), favSvg);
  console.log(`  favicon.svg  Vektor  ${(favSvg.length / 1024).toFixed(1)} KB`);
  const fav = await render('favicon-32.png', favSvg, 32, 32, { transparent: true });

  if (PREVIEW_DIR) {
    await preview(og, 'og-300x157.png', 300, 157);
    await preview(og, 'og-600x315.png', 600, 315);
    await preview(sq, 'square-240.png', 240, 240);
    await preview(touch, 'touch-60.png', 60, 60, { round: 0.225 });
    await preview(i512, 'icon-48.png', 48, 48);
    await preview(mask, 'maskable-120-rund.png', 120, 120, { round: 0.5 });
    await preview(fav, 'favicon-32.png', 32, 32);
    await preview(fav, 'favicon-16.png', 16, 16);
    await preview(touch, 'touch-60-zoom.png', 60, 60, { zoom: 4, round: 0.225 });
    await preview(fav, 'favicon-32-zoom-hell.png', 32, 32, { zoom: 6 });
    await preview(fav, 'favicon-16-zoom-dunkel.png', 16, 16, { zoom: 8, bg: '#202124' });
    console.log('Prüfbilder in ' + PREVIEW_DIR);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
