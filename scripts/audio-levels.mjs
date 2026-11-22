// Pegelprüfung der Soundeffekte (offline, ohne Browser) und WAV-Export zum Anhören.
// Aufruf: node scripts/audio-levels.mjs [ausgabeordner]   (Standard: build/sounds)
//
// Rechnet jeden Sound aus src/audio/sounds.ts mit ZzFX in Node vor und misst
//  - Länge (s)
//  - Spitzenpegel (dBFS) und Lautheit (RMS des lautesten 100-ms-Fensters, dBFS),
//    jeweils mit der Verstärkung im Spiel: ZzFX-Grundlautstärke · vol · Aufruf-Lautstärke · Master
//    (Standard-Lautstärke 0,7 · 2), vor dem Kompressor
//  - für Dauerfeuer zusätzlich den Dauerpegel bei Höchstrate (RMS über 1 s)
// und prüft die Pegelregeln (Warnsounds deutlich lauter als Dauerfeuer usw.). Bei Verstoß Exit-Code 1.
// Die WAV-Dateien haben die Lautstärke wie im Spiel (16 bit, 44,1 kHz, mono); alle.wav enthält alle
// Sounds nacheinander.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] || 'build/sounds';

// ZzFX legt beim Import einen AudioContext an – in Node gibt es keinen
globalThis.AudioContext = class {};

// reproduzierbare Zufallswerte (randomness der Sounds)
let seed = 12345;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const res = await build({ entryPoints: ['src/audio/sounds.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { SOUNDS } = await import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
const { ZZFX } = await import('zzfx');

const SR = ZZFX.sampleRate;
/** Master im Spiel: Standard-Lautstärke 0,7 · Grundverstärkung 2 (siehe sfx.ts) */
const MASTER = 0.7 * 2;
/** Lautstärke, mit der GameScene einzelne Sounds aufruft (sonst 1) */
const CALL_VOL = { hit: 0.6, eshot: 0.85 };
/** Mindestabstand zwischen Schusssounds in GameScene (ms) */
const SCENE_SHOT_GAP = 0.04;

const FIRE = ['shoot', 'side', 'spread', 'rear', 'drone', 'missile', 'laser'];
const CONTINUOUS = ['shoot', 'side', 'spread', 'rear', 'drone'];
/** müssen deutlich (≥ 6 dB) lauter sein als die Bordkanone */
const LOUD = ['hurt', 'alarm', 'warn', 'bomb', 'explodeBig', 'gameover', 'clear', 'shieldHit', 'bossPhase'];
/** sollen klar (≥ 3 dB) über der Bordkanone liegen */
const CLEAR = ['powerup', 'coin', 'repair', 'shield', 'pickupBomb', 'gunUp', 'explode', 'buy', 'error'];

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-inf');

function measure(s) {
  let peak = 0;
  for (const v of s) peak = Math.max(peak, Math.abs(v));
  const win = Math.round(SR * 0.1);
  let best = 0;
  let acc = 0;
  for (let i = 0; i < s.length; i++) {
    acc += s[i] * s[i];
    if (i >= win) acc -= s[i - win] * s[i - win];
    best = Math.max(best, acc);
  }
  const rms = Math.sqrt(best / Math.min(win, s.length || 1));
  return { peak, rms };
}

/** Dauerpegel: Sound in der höchsten Rate wiederholt (Varianten abwechselnd), RMS über 1 s */
function sustained(bufs, gap) {
  const n = SR;
  const mix = new Float64Array(n);
  const step = Math.round(Math.max(gap, SCENE_SHOT_GAP) * SR);
  for (let k = 0, t = 0; t < n; k++, t += step) {
    const b = bufs[k % bufs.length];
    for (let i = 0; i < b.length && t + i < n; i++) mix[t + i] += b[i];
  }
  let acc = 0;
  for (const v of mix) acc += v * v;
  return Math.sqrt(acc / n);
}

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

mkdirSync(outDir, { recursive: true });
const rows = [];
const all = [];
const gapS = new Float64Array(Math.round(SR * 0.45));
for (const [name, def] of Object.entries(SOUNDS)) {
  const gain = (def.vol ?? 1) * (CALL_VOL[name] ?? 1) * MASTER;
  const bufs = [];
  for (let i = 0; i < (def.variants ?? 3); i++) bufs.push(ZZFX.buildSamples(...def.p).map((v) => v * gain));
  const m = bufs.map(measure);
  const peak = Math.max(...m.map((x) => x.peak));
  const rms = m.reduce((a, x) => a + x.rms, 0) / m.length;
  const len = bufs[0].length / SR;
  const cont = CONTINUOUS.includes(name) || FIRE.includes(name) ? sustained(bufs, def.gap) : NaN;
  rows.push({ name, len, peak: db(peak), rms: db(rms), cont: db(cont), variants: bufs.length, gap: def.gap });
  writeFileSync(join(outDir, `${name}.wav`), wav(bufs[0]));
  // Dauerfeuer zusätzlich als 1-s-Salve, damit man den Dauereindruck hört
  if (CONTINUOUS.includes(name) || FIRE.includes(name)) {
    const step = Math.round(Math.max(def.gap, SCENE_SHOT_GAP) * SR);
    const n = SR * 1.5;
    const mix = new Float64Array(n);
    for (let k = 0, t = 0; t < n; k++, t += step) {
      const b = bufs[k % bufs.length];
      for (let i = 0; i < b.length && t + i < n; i++) mix[t + i] += b[i];
    }
    writeFileSync(join(outDir, `${name}-salve.wav`), wav(mix));
  }
  all.push(...bufs[0], ...gapS);
}
writeFileSync(join(outDir, 'alle.wav'), wav(all));

// Tabelle
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(`${pad('Sound', 12)}${lpad('Länge s', 9)}${lpad('Peak dB', 9)}${lpad('RMS dB', 9)}${lpad('Dauer dB', 10)}${lpad('Var', 5)}${lpad('Abst s', 8)}`);
for (const r of rows) {
  console.log(
    `${pad(r.name, 12)}${lpad(r.len.toFixed(2), 9)}${lpad(f1(r.peak), 9)}${lpad(f1(r.rms), 9)}${lpad(Number.isFinite(r.cont) ? f1(r.cont) : '', 10)}${lpad(r.variants, 5)}${lpad(r.gap.toFixed(2), 8)}`,
  );
}

// Regeln
const by = Object.fromEntries(rows.map((r) => [r.name, r]));
const problems = [];
const ref = by.shoot;
for (const n of LOUD) if (by[n] && by[n].rms < ref.rms + 6) problems.push(`${n} nur ${f1(by[n].rms - ref.rms)} dB über shoot (soll ≥ 6)`);
for (const n of CLEAR) if (by[n] && by[n].rms < ref.rms + 3) problems.push(`${n} nur ${f1(by[n].rms - ref.rms)} dB über shoot (soll ≥ 3)`);
if (by.hit && by.hit.rms > ref.rms) problems.push('hit lauter als shoot');
for (const n of CONTINUOUS) {
  if (by[n].len > 0.1) problems.push(`${n} zu lang für Dauerfeuer (${by[n].len.toFixed(2)} s)`);
  if (by[n].cont > by.alarm.rms - 6) problems.push(`${n}: Dauerpegel ${f1(by[n].cont)} dB zu nah am Alarm`);
}
for (const r of rows) if (r.peak > 3) problems.push(`${r.name}: Spitze ${f1(r.peak)} dBFS (Kompressor/Begrenzung greift stark)`);
console.log(`\nWAV-Dateien: ${outDir}/ (${rows.length} Sounds, *-salve.wav = 1,5 s Dauerfeuer, alle.wav = alle nacheinander)`);

// ───────────── Musik: Sequencer mit Attrappen-Kontext prüfen ─────────────
const mres = await build({
  stdin: { contents: "export * from './src/audio/music'; export { sfx } from './src/audio/sfx';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
});
const M = await import('data:text/javascript;base64,' + Buffer.from(mres.outputFiles[0].text).toString('base64'));
problems.push(...checkMusic(M));
problems.push(...(await checkMusicLive(M)));

// ───────────── Musik im Browser rendern (optional, braucht Firefox über playwright-core) ─────────────
if (process.env.PW_PATH && process.env.BROWSER_EXE) await renderMusic(join(outDir, '..', 'music'));
else console.log('\nMusik-WAVs: übersprungen (PW_PATH und BROWSER_EXE setzen, um mit Firefox zu rendern)');

if (problems.length) {
  console.log('\nPROBLEME:\n- ' + [...new Set(problems.map((p) => p.replace(/ \(Takt \d+\)/, '')))].join('\n- '));
  process.exit(1);
}
console.log('Pegelregeln eingehalten.');

/** Attrappe eines AudioContext: zeichnet Knoten und Parameter-Automation auf */
function mockContext() {
  const log = { created: {}, params: [], sources: [] };
  class Param {
    constructor(v = 0) {
      this.value = v;
      this.ev = [];
      log.params.push(this);
    }
    setValueAtTime(v, t) { this.ev.push(['set', v, t]); return this; }
    linearRampToValueAtTime(v, t) { this.ev.push(['lin', v, t]); return this; }
    exponentialRampToValueAtTime(v, t) { this.ev.push(['exp', v, t]); return this; }
    setTargetAtTime(v, t, c) { this.ev.push(['target', v, t, c]); return this; }
    cancelScheduledValues(t) { this.ev.push(['cancel', 0, t]); return this; }
  }
  class Node {
    constructor(kind) {
      log.created[kind] = (log.created[kind] ?? 0) + 1;
      this.kind = kind;
      this.context = ctx;
      this.out = new Set();
    }
    connect(n) { this.out.add(n); return n; }
    disconnect() { this.out.clear(); }
    addEventListener() {}
  }
  class Source extends Node {
    start(t = 0) { this.t0 = t; log.sources.push(this); }
    stop(t) { this.t1 = t; }
  }
  const ctx = {
    sampleRate: 44100,
    currentTime: 0,
    state: 'running',
    addEventListener() {},
    resume: async () => {},
    close: async () => {},
    createDynamicsCompressor() { const n = new Node('comp'); n.threshold = new Param(); n.ratio = new Param(); return n; },
    createStereoPanner() { const n = new Node('pan'); n.pan = new Param(); return n; },
    createGain() { const n = new Node('gain'); n.gain = new Param(1); return n; },
    createBiquadFilter() { const n = new Node('filter'); n.frequency = new Param(350); n.Q = new Param(1); return n; },
    createDelay() { const n = new Node('delay'); n.delayTime = new Param(0); return n; },
    createOscillator() { const n = new Source('osc'); n.frequency = new Param(440); n.detune = new Param(0); return n; },
    createBufferSource() { return new Source('buffer'); },
    createBuffer(ch, len, sr) { const d = new Float32Array(len); return { duration: len / sr, getChannelData: () => d }; },
  };
  ctx.destination = new Node('destination');
  return { ctx, log, dest: new Node('dest') };
}

/**
 * Steuerung im Spiel (music-Objekt) mit echtem sfx und Attrappen-Kontext, der in Echtzeit läuft:
 * Anhängen an den Kontext, Überblendung, Stummschaltung, neu angelegter Kontext, Abschalten.
 */
async function checkMusicLive(M) {
  const problems = [];
  const { sfx, music } = M;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const live = () => {
    const m = mockContext();
    const t0 = performance.now();
    Object.defineProperty(m.ctx, 'currentTime', { get: () => (performance.now() - t0) / 1000 });
    return m;
  };
  music.setMood('menu'); // vor dem Entsperren: nur merken
  const A = live();
  sfx.install(A.ctx); // wie nach unlock() (privat, hier direkt)
  await wait(300);
  let d = music.debugInfo();
  if (!d.attached || !d.running || d.players !== 1 || A.log.sources.length === 0) problems.push(`Musik startet nicht am Kontext: ${JSON.stringify(d)}`);
  music.setMood('flight', 2);
  music.setMood('flight', 2); // doppelt: nichts tun
  d = music.debugInfo();
  if (d.players !== 2) problems.push(`Überblendung im Spiel: ${d.players} Player statt 2`);
  music.setPaused(true);
  sfx.setMuted(true, false);
  await wait(450);
  const n0 = A.log.sources.length;
  await wait(400);
  if (A.log.sources.length !== n0) problems.push('stumm geschaltet, aber es werden weiter Noten erzeugt');
  sfx.setMuted(false, false);
  music.setPaused(false);
  const B = live();
  sfx.install(B.ctx); // wie nach einem neu angelegten Kontext
  music.setMood('boss', 3);
  await wait(300);
  d = music.debugInfo();
  if (!d.attached || B.log.sources.length === 0) problems.push(`Musik zieht nicht zum neuen Kontext um: ${JSON.stringify(d)}`);
  music.setEnabled(false);
  await wait(2400);
  d = music.debugInfo();
  if (d.running || d.players !== 0) problems.push(`Musik aus, aber Takt läuft noch: ${JSON.stringify(d)}`);
  console.log(`Steuerung (Attrappe in Echtzeit): Start, Überblendung, Stumm, neuer Kontext, Abschalten ${problems.length ? 'FEHLER' : 'ok'}`);
  return problems;
}

function checkMusic(M) {
  const problems = [];
  const moods = ['menu', 'flight', 'boss', 'shop', 'over'];
  console.log('\nMusik (Sequencer-Prüfung):');
  console.log(`${pad('Stimmung', 10)}${lpad('BPM', 6)}${lpad('Tonart', 8)}${lpad('Noten/s', 9)}${lpad('Knoten/s', 10)}${lpad('Abschnitte', 12)}${lpad('MIDI', 10)}`);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'];
  for (const mood of moods) {
    const a = M.arrange(mood, 1);
    const range = { bass: [28, 60], arp: [45, 84], lead: [55, 91], pad: [45, 80] };
    let lo = 127;
    let hi = 0;
    // reine Logik: 64 Takte Noten prüfen
    let notes = 0;
    const barLen = a.step * 16;
    for (let bar = 0; bar < 64; bar++) {
      for (const ev of M.barEvents(a, bar)) {
        notes++;
        if (!(ev.t >= 0 && ev.t < barLen)) problems.push(`${mood}: Note außerhalb des Taktes (${ev.voice}, Takt ${bar})`);
        if (!(ev.dur > 0 && ev.dur < 10)) problems.push(`${mood}: ungültige Dauer (${ev.voice})`);
        const r = range[ev.voice];
        for (const n of ev.notes) {
          if (!r) continue;
          lo = Math.min(lo, n);
          hi = Math.max(hi, n);
          if (n < r[0] || n > r[1]) problems.push(`${mood}: Note ${n} außerhalb der Lage von ${ev.voice} (Takt ${bar})`);
        }
      }
    }
    // Engine mit Attrappe: 60 s planen, in Häppchen wie im Spiel
    const { ctx, log, dest } = mockContext();
    const e = new M.MusicEngine(ctx, dest);
    e.setLevel(0.5, false, 0);
    e.setMood(mood, 1, 0);
    const T = 60;
    for (let t = 0; t < T; t += 0.05) e.schedule(t, t + 0.3);
    const nodes = Object.values(log.created).reduce((x, y) => x + y, 0);
    // Hüllkurven: jede Noten-Hüllkurve beginnt bei 0 und endet bei 0; Zeiten aufsteigend
    let bad = 0;
    for (const p of log.params) {
      const ev = p.ev.filter((x) => x[0] !== 'cancel');
      for (let i = 1; i < ev.length; i++) if (ev[i][2] < ev[i - 1][2] - 1e-9) bad++;
      if (ev.length >= 4 && ev[0][0] === 'set' && ev.at(-1)[0] === 'lin') {
        if (ev[0][1] !== 0 || ev.at(-1)[1] !== 0) bad++;
      }
    }
    for (const s of log.sources) if (!(s.t1 > s.t0)) bad++;
    if (bad) problems.push(`${mood}: ${bad} Hüllkurven/Quellen nicht knackfrei oder nicht aufsteigend`);
    const nps = nodes / T;
    if (nps > 150) problems.push(`${mood}: ${nps.toFixed(0)} Knoten/s (zu viel fürs Handy)`);
    console.log(`${pad(mood, 10)}${lpad(a.bpm.toFixed(0), 6)}${lpad(names[a.key], 8)}${lpad((notes / (64 * barLen)).toFixed(1), 9)}${lpad(nps.toFixed(0), 10)}${lpad(M.THEMES[mood].sections.length, 12)}${lpad(`${lo}..${hi}`, 10)}`);
  }
  // Sektor-Variation
  const vari = [];
  for (let s = 1; s <= 6; s++) {
    const a = M.arrange('flight', s);
    vari.push(`${s}: ${names[a.key]} ${a.bpm.toFixed(0)} BPM ${a.scale[5] === 9 ? 'dorisch' : 'äolisch'}`);
  }
  console.log('Flug je Sektor: ' + vari.join(' · '));
  // Überblendung: zwei Player während des Wechsels, danach einer
  {
    const { ctx, dest } = mockContext();
    const e = new M.MusicEngine(ctx, dest);
    e.setMood('flight', 1, 0);
    for (let t = 0; t < 10; t += 0.05) e.schedule(t, t + 0.3);
    e.setMood('boss', 1, 10);
    e.schedule(10, 10.3);
    const during = e.playerCount;
    e.setMood('boss', 1, 10.5); // gleiche Stimmung: nichts tun
    for (let t = 10; t < 16; t += 0.05) e.schedule(t, t + 0.3);
    const after = e.playerCount;
    console.log(`Überblendung flight → boss: ${during} Player während, ${after} danach`);
    if (during !== 2 || after !== 1) problems.push('Überblendung: Player werden nicht korrekt ersetzt');
  }
  return problems;
}

/** Musik je Stimmung mit OfflineAudioContext in Firefox rendern, Pegel messen, als WAV speichern */
async function renderMusic(dir) {
  const { createRequire } = await import('node:module');
  const { firefox } = createRequire(join(process.env.PW_PATH, 'x.js'))('playwright-core');
  const res = await build({ entryPoints: ['src/audio/music.ts'], bundle: true, format: 'iife', globalName: 'MUS', write: false, logLevel: 'error' });
  const browser = await firefox.launch({ executablePath: process.env.BROWSER_EXE });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: res.outputFiles[0].text });
    mkdirSync(dir, { recursive: true });
    const jobs = [
      ['menu', [['menu', 1, 0]], 40],
      ['flight-s1', [['flight', 1, 0]], 40],
      ['flight-s2', [['flight', 2, 0]], 20],
      ['boss', [['boss', 1, 0]], 36],
      ['shop', [['shop', 1, 0]], 36],
      ['over', [['over', 1, 0]], 30],
      ['wechsel-flight-boss-shop', [['flight', 1, 0], ['boss', 1, 10], ['shop', 1, 22]], 32],
    ];
    console.log(`\nMusik gerendert (Standardlautstärke, vor dem Kompressor; zum Vergleich shoot-Dauerpegel ${f1(by.shoot.cont)} dB, explode ${f1(by.explode.rms)} dB):`);
    console.log(`${pad('Datei', 26)}${lpad('Länge s', 9)}${lpad('Peak dB', 9)}${lpad('RMS dB', 9)}`);
    for (const [name, moods, len] of jobs) {
      const out = await page.evaluate(
        async ({ moods, len }) => {
          const sr = 44100;
          const off = new OfflineAudioContext(1, sr * len, sr);
          const e = new MUS.MusicEngine(off, off.destination, true);
          e.setLevel(MUS.DEFAULT_VOLUME * MUS.BASE_GAIN, false, 0, 0.01);
          for (let t = 0; t < len; t += 0.25) {
            for (const [m, s, at] of moods) if (at >= t && at < t + 0.25) e.setMood(m, s, at);
            e.schedule(t, t + 0.5);
          }
          const buf = await off.startRendering();
          return Array.from(buf.getChannelData(0));
        },
        { moods, len },
      );
      const m = measure(out);
      let acc = 0;
      for (const v of out) acc += v * v;
      const rms = Math.sqrt(acc / out.length);
      writeFileSync(join(dir, `${name}.wav`), wav(out));
      console.log(`${pad(name + '.wav', 26)}${lpad(len, 9)}${lpad(f1(db(m.peak)), 9)}${lpad(f1(db(rms)), 9)}`);
    }
    console.log(`Musik-WAVs: ${dir}/`);
    if (errs.length) console.log('Fehler im Browser: ' + errs.join('; '));
  } finally {
    await browser.close();
  }
}
