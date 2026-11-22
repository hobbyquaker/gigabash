import { sfx } from './sfx';

/**
 * Prozedurale Musik: kleiner WebAudio-Sequencer mit Vorausplanung (Lookahead).
 * Stimmen: treibender Synth-Bass, Arpeggio, Lead-Motiv (Thema), Flächen (Pad) und synthetische
 * Drums (Kick, Snare, Hi-Hat aus Rauschen). Keine Audiodateien, alles zur Laufzeit erzeugt.
 *
 * - Jede Stimmung (menu, flight, boss, shop, over) hat ein eigenes Thema (Tonart, Tempo,
 *   Akkordfolge, Bass-/Drum-Muster, Motiv) und einen Ablauf aus Abschnitten, damit es nicht
 *   eintönig wird (Intro, Steigerung, Motiv, B-Teil, Breakdown).
 * - Je Sektor leicht anders: Tonart verschoben, Tempo etwas höher, anderer Modus/Arpeggio.
 * - Wechsel der Stimmung: alter und neuer „Player“ laufen kurz parallel und werden übergeblendet.
 * - Knackfrei: jede Note beginnt und endet mit einer Rampe auf 0, Schleifen gibt es nicht
 *   (es wird fortlaufend weitergeplant), Lautstärkeänderungen werden gerampt.
 * - CPU-schonend: wenige Knoten je Note, gemeinsame Filter je Stimme, Planung alle 50 ms
 *   (taktweise: sobald der nächste Takt in die Vorausschau fällt, wird er ganz angelegt),
 *   bei Stummschaltung oder ausgeschalteter Musik werden keine Noten erzeugt.
 *
 * Kette: Noten -> Stimmen-Bus -> Player-Gain (Überblendung) -> Ausgang (Lautstärke, Pause-Tiefpass)
 *        -> sfx.musicBus -> Master (Stummschaltung) -> Kompressor.
 */

export type Mood = 'menu' | 'flight' | 'boss' | 'shop' | 'over';

// ───────────────────────────── Themen ─────────────────────────────

/** Tonleitern (Halbtöne über dem Grundton) */
const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** Stimmen eines Abschnitts: b Bass, k Kick, s Snare, h Hi-Hat, a Arpeggio, l Lead, p Pad */
interface Section {
  bars: number;
  prog: 'A' | 'B';
  parts: string;
}

export interface Theme {
  bpm: number;
  /** Grundton als Tonklasse (0 = C … 11 = H) */
  key: number;
  scales: number[][];
  /** Akkordfolgen (Stufen 0..6, ein Akkord pro Takt) */
  A: number[];
  B: number[];
  /** 16 Schritte: x Grundton, o Oktave, 5 Quinte, 3 Terz, - Pause */
  bass: string;
  bassWave: OscillatorType;
  /** Tiefpass des Basses (Hz) und Filterhüllkurve (Faktor beim Anschlag) */
  bassCut: number;
  bassEnv: number;
  /** Arpeggio-Varianten: Akkordton-Index je 16tel, -1 Pause */
  arps: number[][];
  arpWave: OscillatorType;
  arpCut: number;
  /** Arpeggio eine Oktave höher (1) oder normal (0) */
  arpOct: number;
  /** Drums, 16 Schritte: x laut, o leise, - nichts */
  kick: string;
  snare: string;
  hat: string;
  /** Motiv über 2 Takte in Achteln: Akkordton-Index, -1 Pause, -2 halten */
  lead: number[];
  leadWave: OscillatorType;
  leadCut: number;
  padCut: number;
  /** Verschiebung der Achtel/16tel für Swing (Anteil eines 16tels) */
  swing: number;
  /** Ablauf; nach dem letzten Abschnitt geht es bei loopFrom weiter */
  sections: Section[];
  loopFrom: number;
  /** Tempo-Zuwachs je Sektor (Anteil) */
  tempoStep: number;
  /** Pegelangleich der Themen untereinander (gemessen mit scripts/audio-levels.mjs) */
  gain: number;
}

/** Akkordton-Index -> Stufen über dem Akkordgrundton (Dreiklang über zwei Oktaven) */
const TONE = [0, 2, 4, 7, 9, 11, 14];

export const THEMES: Record<Mood, Theme> = {
  // Titel: getragen, dorisch, Pad + Arpeggio, später Groove und das Hauptmotiv
  menu: {
    bpm: 112,
    key: 2,
    scales: [SCALES.dorian],
    A: [0, 6, 5, 6],
    B: [3, 0, 5, 4],
    bass: 'x--x--o-x--x-5o-',
    bassWave: 'sawtooth',
    bassCut: 520,
    bassEnv: 3,
    arps: [[0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 4, 2, 1, 0, 1]],
    arpWave: 'triangle',
    arpCut: 3200,
    arpOct: 0,
    kick: 'x-------x-------',
    snare: '----x-------x---',
    hat: '--o---o---o---o-',
    lead: [3, -2, -2, 2, 1, -2, 2, -2, 3, -2, 4, -2, 2, -2, -2, -1],
    leadWave: 'triangle',
    leadCut: 3000,
    padCut: 1400,
    swing: 0,
    sections: [
      { bars: 4, prog: 'A', parts: 'pa' },
      { bars: 4, prog: 'A', parts: 'pab' },
      { bars: 8, prog: 'A', parts: 'pabkh' },
      { bars: 8, prog: 'A', parts: 'pabkhsl' },
      { bars: 8, prog: 'B', parts: 'pabkhsl' },
      { bars: 4, prog: 'A', parts: 'pa' },
    ],
    loopFrom: 1,
    tempoStep: 0,
    gain: 1.5,
  },
  // Flug: treibender Oktav-Bass, four-on-the-floor, Moll (Sektoren wechseln zwischen äolisch/dorisch)
  flight: {
    bpm: 136,
    key: 9,
    scales: [SCALES.aeolian, SCALES.dorian],
    A: [0, 5, 2, 6],
    B: [3, 5, 0, 6],
    bass: 'x-xox-xox-xox5xo',
    bassWave: 'sawtooth',
    bassCut: 700,
    bassEnv: 4,
    arps: [
      [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 4, 3, 2, 1],
      [0, 2, 1, 3, 0, 2, 1, 3, 1, 3, 2, 4, 1, 3, 2, 4],
      [0, 3, 2, 3, 1, 3, 2, 3, 0, 3, 2, 3, 1, 4, 2, 4],
    ],
    arpWave: 'square',
    arpCut: 2400,
    arpOct: 0,
    kick: 'x---x---x---x---',
    snare: '----x-------x---',
    hat: 'o-x-o-x-o-x-o-xo',
    lead: [3, -2, 2, 1, 2, -2, -1, 0, 1, -2, 2, -2, 4, -2, -2, -1],
    leadWave: 'square',
    leadCut: 2600,
    padCut: 1200,
    swing: 0,
    sections: [
      { bars: 4, prog: 'A', parts: 'bkha' },
      { bars: 8, prog: 'A', parts: 'bkhsa' },
      { bars: 8, prog: 'A', parts: 'bkhsal' },
      { bars: 8, prog: 'B', parts: 'bkhsal' },
      { bars: 4, prog: 'A', parts: 'bhap' },
    ],
    loopFrom: 1,
    tempoStep: 0.02,
    gain: 1,
  },
  // Boss: phrygisch, schneller, 16tel-Bass, gebrochene Kick, harte Stöße
  boss: {
    bpm: 150,
    key: 4,
    scales: [SCALES.phrygian],
    A: [0, 0, 1, 0],
    B: [5, 4, 1, 0],
    bass: 'xxxoxxxoxx5xxxo5',
    bassWave: 'sawtooth',
    bassCut: 820,
    bassEnv: 5,
    arps: [[0, 3, 1, 3, 2, 3, 1, 3, 0, 3, 1, 3, 2, 4, 2, 5]],
    arpWave: 'sawtooth',
    arpCut: 2000,
    arpOct: 0,
    kick: 'x--x--x-x--x--x-',
    snare: '----x-------x--x',
    hat: 'xoxoxoxoxoxoxoxo',
    lead: [3, -2, -2, -2, 4, -2, 3, -2, 5, -2, -2, 4, 3, -2, 1, -1],
    leadWave: 'sawtooth',
    leadCut: 2200,
    padCut: 900,
    swing: 0,
    sections: [
      { bars: 2, prog: 'A', parts: 'bk' },
      { bars: 8, prog: 'A', parts: 'bkhsa' },
      { bars: 8, prog: 'A', parts: 'bkhsal' },
      { bars: 8, prog: 'B', parts: 'bkhsal' },
      { bars: 4, prog: 'B', parts: 'bkhsa' },
    ],
    loopFrom: 1,
    tempoStep: 0.015,
    gain: 0.95,
  },
  // Händler: entspannt, Dur, leichter Swing, Pad und Dreieck-Arpeggio
  shop: {
    bpm: 100,
    key: 5,
    scales: [SCALES.major, SCALES.mixolydian],
    A: [0, 5, 1, 4],
    B: [3, 4, 2, 5],
    bass: 'x--o--x-5--x-o--',
    bassWave: 'triangle',
    bassCut: 900,
    bassEnv: 2,
    arps: [[0, -1, 2, -1, 1, -1, 3, -1, 2, -1, 4, -1, 3, -1, 1, -1]],
    arpWave: 'triangle',
    arpCut: 3500,
    arpOct: 0,
    kick: 'x-----x---x-----',
    snare: '----x-------x---',
    hat: 'x-o-x-o-x-o-x-oo',
    lead: [2, -2, 3, 4, 3, -2, 2, -1, 1, -2, 2, 3, 2, -2, -2, -1],
    leadWave: 'sine',
    leadCut: 4000,
    padCut: 1600,
    swing: 0.28,
    sections: [
      { bars: 4, prog: 'A', parts: 'pbh' },
      { bars: 8, prog: 'A', parts: 'pbkhsa' },
      { bars: 8, prog: 'A', parts: 'pbkhsal' },
      { bars: 8, prog: 'B', parts: 'pbkhsa' },
    ],
    loopFrom: 1,
    tempoStep: 0,
    gain: 1.25,
  },
  // Game Over: langsam, Moll, Pad, ruhiges Arpeggio, klagendes Motiv
  over: {
    bpm: 76,
    key: 0,
    scales: [SCALES.aeolian],
    A: [0, 5, 3, 4],
    B: [0, 5, 3, 4],
    bass: 'x-------x-------',
    bassWave: 'triangle',
    bassCut: 600,
    bassEnv: 1.5,
    arps: [[0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 1, -1]],
    arpWave: 'triangle',
    arpCut: 2400,
    arpOct: 0,
    kick: '----------------',
    snare: '----------------',
    hat: '----------------',
    lead: [3, -2, -2, 2, 1, -2, -2, -1, 2, -2, 1, -2, 0, -2, -2, -1],
    leadWave: 'triangle',
    leadCut: 2200,
    padCut: 1000,
    swing: 0,
    sections: [
      { bars: 4, prog: 'A', parts: 'pa' },
      { bars: 8, prog: 'A', parts: 'pabl' },
    ],
    loopFrom: 0,
    tempoStep: 0,
    gain: 1.9,
  },
};

/** Tonart-Verschiebung je Sektor (Halbtöne) */
const SECTOR_SHIFT = [0, 2, -2, 3, -3, 5, 1, -4];

// ───────────────────────────── Sequencer-Logik (rein, testbar) ─────────────────────────────

export type Voice = 'bass' | 'arp' | 'lead' | 'pad' | 'kick' | 'snare' | 'hat';

export interface NoteEvent {
  voice: Voice;
  /** Startzeit relativ zum Taktbeginn (s) */
  t: number;
  /** Dauer (s) */
  dur: number;
  /** MIDI-Note (Drums: 0) bzw. bei Pad mehrere */
  notes: number[];
  vel: number;
}

/** Ausprägung eines Themas für einen Sektor */
export interface Arrangement {
  theme: Theme;
  bpm: number;
  key: number;
  scale: number[];
  arp: number[];
  /** Dauer eines 16tels (s) */
  step: number;
}

export function arrange(mood: Mood, sector = 1): Arrangement {
  const theme = THEMES[mood];
  const i = Math.max(0, Math.floor(sector) - 1);
  const shift = mood === 'flight' || mood === 'boss' ? SECTOR_SHIFT[i % SECTOR_SHIFT.length] : 0;
  const bpm = theme.bpm * (1 + theme.tempoStep * Math.min(i, 6));
  return {
    theme,
    bpm,
    key: (((theme.key + shift) % 12) + 12) % 12,
    scale: theme.scales[i % theme.scales.length],
    arp: theme.arps[i % theme.arps.length],
    step: 60 / bpm / 4,
  };
}

/** Abschnitt zu einem fortlaufenden Takt (mit Wiederholung ab loopFrom) */
export function sectionAt(theme: Theme, bar: number): { sec: Section; barInSec: number } {
  const s = theme.sections;
  let b = bar;
  for (let k = 0; ; k++) {
    if (k >= s.length) k = theme.loopFrom;
    if (b < s[k].bars) return { sec: s[k], barInSec: b };
    b -= s[k].bars;
  }
}

/** MIDI-Note einer Tonleiterstufe (beliebig viele Oktaven) über dem Grundton in Oktave base */
function degNote(a: Arrangement, deg: number, base: number): number {
  const n = a.scale.length;
  const o = Math.floor(deg / n);
  const d = deg - o * n;
  return base + a.key + 12 * o + a.scale[d];
}

/** Grundton-Lage: Bass zwischen A1 (33) und G#2 (44) */
function bassBase(a: Arrangement): number {
  return 33 + ((a.key - 9 + 12) % 12) - a.key;
}

/** kleiner deterministischer Zufall (Variation von Anschlag und Hi-Hat) */
function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** alle Noten eines Taktes */
export function barEvents(a: Arrangement, bar: number): NoteEvent[] {
  const th = a.theme;
  const { sec, barInSec } = sectionAt(th, bar);
  const prog = sec.prog === 'A' ? th.A : th.B;
  const chord = prog[bar % prog.length];
  // obere Stufen eine Oktave tiefer legen, damit Arpeggio, Lead und Pad in ihrer Lage bleiben
  const cr = chord >= 4 ? chord - 7 : chord;
  const has = (c: string) => sec.parts.includes(c);
  const step = a.step;
  const out: NoteEvent[] = [];
  const at = (i: number) => i * step + (i % 2 ? th.swing * step : 0);
  const bb = bassBase(a);
  const lastBar = barInSec === sec.bars - 1;

  if (has('b')) {
    for (let i = 0; i < 16; i++) {
      const c = th.bass[i];
      if (c === '-') continue;
      let len = 1;
      while (i + len < 16 && th.bass[i + len] === '-' && len < 4) len++;
      const deg = cr + (c === '5' ? 4 : c === '3' ? 2 : 0);
      const note = degNote(a, deg, bb) + (c === 'o' ? 12 : 0);
      const accent = i % 4 === 0 ? 1 : 0.8;
      out.push({ voice: 'bass', t: at(i), dur: step * len * 0.92, notes: [note], vel: accent });
    }
  }
  if (has('a')) {
    for (let i = 0; i < 16; i++) {
      const k = a.arp[i];
      if (k < 0) continue;
      let note = degNote(a, cr + TONE[k], bb + 24 + 12 * th.arpOct);
      if (note > 81) note -= 12;
      out.push({ voice: 'arp', t: at(i), dur: step * 0.9, notes: [note], vel: 0.75 + 0.25 * hash(bar * 16 + i) });
    }
  }
  if (has('l')) {
    const half = (bar % 2) * 8;
    for (let j = 0; j < 8; j++) {
      const k = th.lead[half + j];
      if (k < 0) continue;
      let len = 1;
      while (half + j + len < 16 && th.lead[half + j + len] === -2) len++;
      let note = degNote(a, cr + TONE[k], bb + 36);
      if (note > 86) note -= 12;
      out.push({ voice: 'lead', t: at(j * 2), dur: step * 2 * len * 0.95, notes: [note], vel: 1 });
    }
  }
  if (has('p')) {
    const notes = [0, 2, 4].map((d) => degNote(a, cr + d, bb + 24));
    out.push({ voice: 'pad', t: 0, dur: step * 16, notes, vel: 1 });
  }
  if (has('k')) {
    for (let i = 0; i < 16; i++) {
      if (th.kick[i] !== '-') out.push({ voice: 'kick', t: at(i), dur: 0.3, notes: [0], vel: th.kick[i] === 'x' ? 1 : 0.6 });
    }
  }
  if (has('s')) {
    for (let i = 0; i < 16; i++) {
      // Fill am Abschnittsende: 16tel-Snare auf der letzten Zählzeit
      const fill = lastBar && i >= 12 && sec.bars > 1;
      const c = th.snare[i];
      if (c !== '-' || fill) out.push({ voice: 'snare', t: at(i), dur: 0.18, notes: [0], vel: c === 'x' ? 1 : 0.45 + 0.1 * (i - 12) });
    }
  }
  if (has('h')) {
    for (let i = 0; i < 16; i++) {
      const c = th.hat[i];
      if (c === '-') continue;
      out.push({ voice: 'hat', t: at(i), dur: c === 'x' ? 0.07 : 0.035, notes: [0], vel: (c === 'x' ? 1 : 0.55) * (0.85 + 0.3 * hash(bar * 31 + i)) });
    }
  }
  return out;
}

// ───────────────────────────── Klangerzeugung ─────────────────────────────

/** Grundlautstärken der Stimmen */
const LEVEL: Record<Voice, number> = { bass: 0.3, arp: 0.075, lead: 0.085, pad: 0.05, kick: 0.75, snare: 0.32, hat: 0.13 };
/** Überblendzeit beim Stimmungswechsel (s) */
const FADE = 1.6;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** ein laufendes Thema mit eigenem Gain (für Überblendungen) */
class Player {
  /** Einblenden (Rampe 0 -> 1 ab Start) und davon getrennt Ausblenden, damit nie eine laufende Rampe abgebrochen werden muss */
  readonly gain: GainNode;
  private fade: GainNode;
  private buses: Record<'arp' | 'lead' | 'pad' | 'snare' | 'hat', AudioNode>;
  private nodes: AudioNode[] = [];
  bar = 0;
  /** Startzeit des nächsten Taktes */
  next: number;
  /** ab hier ausgeblendet, danach entfernen */
  endAt = Infinity;

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
    private noise: AudioBuffer,
    readonly mood: Mood,
    readonly sector: number,
    readonly arr: Arrangement,
    start: number,
    fadeIn: number,
  ) {
    this.next = start;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(arr.theme.gain, start + Math.max(0.02, fadeIn));
    this.fade = ctx.createGain();
    g.connect(this.fade).connect(dest);
    this.gain = g;
    const th = arr.theme;
    const filt = (type: BiquadFilterType, f: number, q = 0.7) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      n.connect(g);
      this.nodes.push(n);
      return n;
    };
    // Lead mit leichtem Echo (punktierte Achtel)
    const lead = filt('lowpass', th.leadCut);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = arr.step * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    lead.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(g);
    this.nodes.push(delay, fb, wet);
    this.buses = {
      arp: filt('lowpass', th.arpCut),
      lead,
      pad: filt('lowpass', th.padCut),
      snare: filt('bandpass', 1800, 0.8),
      hat: filt('highpass', 7000),
    };
  }

  /** Takte bis zur Zeit tEnd vorausplanen */
  schedule(tEnd: number, silent: boolean) {
    const barLen = this.arr.step * 16;
    while (this.next < tEnd) {
      if (!silent && this.next < this.endAt) {
        for (const ev of barEvents(this.arr, this.bar)) this.play(ev, this.next + ev.t);
      }
      this.next += barLen;
      this.bar++;
    }
  }

  /** ausblenden ab t */
  fadeOut(t: number, dur = FADE) {
    if (this.endAt !== Infinity) return;
    const p = this.fade.gain;
    p.setValueAtTime(1, t);
    p.linearRampToValueAtTime(0, t + dur);
    this.endAt = t + dur;
  }

  dispose() {
    try {
      this.gain.disconnect();
      this.fade.disconnect();
      for (const n of this.nodes) n.disconnect();
    } catch {
      /* egal */
    }
  }

  /** Hüllkurve: 0 -> peak (Anschlag) -> linear auf peak·sustain bis Notenende -> 0 (knackfrei) */
  private env(t: number, peak: number, attack: number, dur: number, release: number, sustain = 1): GainNode {
    const g = this.ctx.createGain();
    const p = g.gain;
    const te = t + Math.max(attack, dur);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + attack);
    // nur lineare Rampen: der Verlauf hat nirgends Sprünge
    p.linearRampToValueAtTime(peak * sustain, te);
    p.linearRampToValueAtTime(0, te + release);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, stop: number, out: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(out);
    o.start(t);
    o.stop(stop);
    o.onended = () => o.disconnect();
    return o;
  }

  private play(ev: NoteEvent, t: number) {
    const ctx = this.ctx;
    const th = this.arr.theme;
    const v = LEVEL[ev.voice] * ev.vel;
    switch (ev.voice) {
      case 'bass': {
        const rel = 0.03;
        const g = this.env(t, v, 0.004, ev.dur, rel, 0.75);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = 5;
        f.frequency.setValueAtTime(th.bassCut * th.bassEnv, t);
        f.frequency.exponentialRampToValueAtTime(th.bassCut, t + Math.min(0.14, ev.dur));
        f.connect(g).connect(this.gain);
        const o = this.osc(th.bassWave, mtof(ev.notes[0]), t, t + ev.dur + rel + 0.02, f);
        o.addEventListener('ended', () => {
          f.disconnect();
          g.disconnect();
        });
        break;
      }
      case 'arp':
      case 'lead': {
        const lead = ev.voice === 'lead';
        const rel = lead ? 0.08 : 0.04;
        const g = this.env(t, v, lead ? 0.012 : 0.003, ev.dur, rel, lead ? 0.7 : 0.4);
        g.connect(this.buses[ev.voice]);
        const o = this.osc(lead ? th.leadWave : th.arpWave, mtof(ev.notes[0]), t, t + ev.dur + rel + 0.02, g);
        if (lead) {
          // leichtes Vibrato nach dem Anschlag
          o.detune.setValueAtTime(0, t);
          o.detune.linearRampToValueAtTime(-6, t + Math.min(0.3, ev.dur));
        }
        o.addEventListener('ended', () => g.disconnect());
        break;
      }
      case 'pad': {
        const rel = 0.5;
        const g = this.env(t, v, 0.35, ev.dur, rel);
        g.connect(this.buses.pad);
        let left = ev.notes.length;
        for (const n of ev.notes) {
          const o = this.osc('sawtooth', mtof(n), t, t + ev.dur + rel + 0.02, g, (left % 2 ? 1 : -1) * 6);
          o.addEventListener('ended', () => {
            if (--left === 0) g.disconnect();
          });
        }
        break;
      }
      case 'kick': {
        const g = this.env(t, v, 0.002, 0.02, 0.26);
        g.connect(this.gain);
        const o = this.osc('sine', 150, t, t + 0.32, g);
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        o.addEventListener('ended', () => g.disconnect());
        break;
      }
      case 'snare':
      case 'hat': {
        const g = this.env(t, v, 0.001, ev.voice === 'snare' ? 0.015 : 0.005, ev.dur);
        g.connect(this.buses[ev.voice]);
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.connect(g);
        // zufälliger Versatz im Rauschpuffer, damit nicht jeder Schlag gleich klingt
        const off = hash(Math.floor(t * 1000)) * (this.noise.duration - 0.5);
        src.start(t, off);
        src.stop(t + ev.dur + 0.03);
        src.onended = () => {
          src.disconnect();
          g.disconnect();
        };
        break;
      }
    }
  }
}

/**
 * Musik-Engine für einen beliebigen (auch Offline-)Kontext: plant Noten bis zu einer Zeit voraus.
 * Wird im Spiel vom music-Objekt getaktet, für Tests/Export direkt mit einem OfflineAudioContext.
 */
export class MusicEngine {
  readonly out: GainNode;
  private lp: BiquadFilterNode;
  private noise: AudioBuffer;
  private players: Player[] = [];

  /**
   * keepNodes: ausgeklungene Player nicht abhängen (für OfflineAudioContext, der erst nach dem
   * Planen rendert – ein disconnect() würde dort für die ganze Aufnahme gelten).
   */
  constructor(
    readonly ctx: BaseAudioContext,
    dest: AudioNode,
    private keepNodes = false,
  ) {
    // Ausgang: Lautstärke -> Tiefpass (in der Pause gedämpft) -> Ziel
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 18000;
    this.lp.Q.value = 0.5;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.lp).connect(dest);
    // 1 s weißes Rauschen (deterministisch) für Snare und Hi-Hat
    const len = Math.floor(ctx.sampleRate);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 1;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      d[i] = (s / 2147483648 - 1) * 0.9;
    }
  }

  /** aktuelle Stimmung (letzter Player) */
  get current(): { mood: Mood; sector: number } | null {
    const p = this.players[this.players.length - 1];
    return p && p.endAt === Infinity ? { mood: p.mood, sector: p.sector } : null;
  }

  /** Stimmung ab Zeit t wechseln (mit Überblendung) */
  setMood(mood: Mood, sector: number, t: number, fade = FADE) {
    const cur = this.current;
    if (cur && cur.mood === mood && cur.sector === sector) return;
    for (const p of this.players) if (p.endAt === Infinity) p.fadeOut(t, fade);
    const first = this.players.length === 0;
    this.players.push(new Player(this.ctx, this.out, this.noise, mood, sector, arrange(mood, sector), t + 0.05, first ? 0.3 : fade));
  }

  /** alles ausblenden (Musik aus) */
  stop(t: number, fade = 0.5) {
    for (const p of this.players) if (p.endAt === Infinity) p.fadeOut(t, fade);
  }

  /** Ausgangslautstärke und Pause-Dämpfung rampen */
  setLevel(gain: number, muffled: boolean, t: number, tc = 0.12) {
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(gain, t, tc);
    const f = this.lp.frequency;
    f.cancelScheduledValues(t);
    f.setTargetAtTime(muffled ? 700 : 18000, t, 0.15);
  }

  /**
   * Bis tEnd vorausplanen. Liegt ein Player hinter now (z. B. nach Suspend/Hintergrund), springt
   * er auf den nächsten Takt nach now, statt verspätete Noten nachzuholen.
   */
  schedule(now: number, tEnd: number, silent = false) {
    for (const p of this.players) {
      if (p.next < now) {
        const barLen = p.arr.step * 16;
        const skip = Math.ceil((now - p.next) / barLen);
        p.next += skip * barLen;
        p.bar += skip;
      }
      p.schedule(tEnd, silent);
    }
    // ausgeblendete Player nach dem Ausklingen entfernen
    this.players = this.players.filter((p) => {
      if (p.endAt + 1 < now && !this.keepNodes) {
        p.dispose();
        return false;
      }
      return true;
    });
  }

  get playerCount(): number {
    return this.players.length;
  }

  dispose() {
    for (const p of this.players) p.dispose();
    this.players = [];
    try {
      this.out.disconnect();
      this.lp.disconnect();
    } catch {
      /* egal */
    }
  }
}

// ───────────────────────────── Steuerung im Spiel ─────────────────────────────

const STORE_KEY = 'oganesson.music';
/** Planungsabstand (ms) und Vorausschau (s); im Hintergrund drosseln Browser Timer auf ~1 s */
const TICK_MS = 50;
const AHEAD = 0.3;
const AHEAD_HIDDEN = 1.5;
/** Grundpegel der Musik relativ zu den Effekten (Flug bei Standardlautstärke ≈ −27 dBFS RMS) */
export const BASE_GAIN = 0.25;
export const DEFAULT_VOLUME = 0.6;
/** Faktor in der Pause */
const PAUSE_GAIN = 0.35;

class Music {
  enabled = true;
  volume = DEFAULT_VOLUME;
  private mood: Mood = 'menu';
  private sector = 1;
  private hasMood = false;
  private paused = false;
  private engine: MusicEngine | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { enabled?: boolean; volume?: number };
        if (typeof s.enabled === 'boolean') this.enabled = s.enabled;
        if (typeof s.volume === 'number' && Number.isFinite(s.volume)) this.volume = Math.min(1, Math.max(0, s.volume));
      }
    } catch {
      /* kein Speicher */
    }
    try {
      sfx.onContext((ctx) => this.attach(ctx));
    } catch {
      /* ohne Audio */
    }
  }

  /** Stimmung setzen; gleiche Stimmung und gleicher Sektor: nichts tun (darf oft aufgerufen werden) */
  setMood(m: Mood, sector?: number) {
    if (sector !== undefined && Number.isFinite(sector)) this.sector = Math.max(1, Math.floor(sector));
    const sec = this.themeSector(m);
    if (this.hasMood && m === this.mood && sec === this.themeSector(this.mood)) return;
    this.mood = m;
    this.hasMood = true;
    this.apply();
  }

  /** nur Flug und Boss variieren je Sektor; die anderen Themen bleiben gleich */
  private themeSector(m: Mood): number {
    return m === 'flight' || m === 'boss' ? this.sector : 1;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.save();
    this.apply();
  }

  setVolume(v: number) {
    if (!Number.isFinite(v)) return;
    this.volume = Math.min(1, Math.max(0, v));
    this.save();
    this.apply();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.applyLevel();
  }

  /** Diagnose (für ?debug) */
  debugInfo() {
    return {
      mood: this.mood,
      sector: this.sector,
      enabled: this.enabled,
      volume: this.volume,
      paused: this.paused,
      players: this.engine?.playerCount ?? 0,
      running: !!this.timer,
      /** hängt die Musik am aktuellen Kontext von sfx? */
      attached: !!this.engine && this.engine.ctx === sfx.context,
    };
  }

  /** neuer bzw. wieder laufender Kontext von sfx */
  private attach(ctx: AudioContext) {
    if (this.engine && this.engine.ctx === ctx) {
      this.apply();
      return;
    }
    const bus = sfx.musicBus;
    if (!bus || bus.context !== ctx) return;
    this.engine?.dispose();
    try {
      this.engine = new MusicEngine(ctx, bus);
    } catch {
      this.engine = null;
      return;
    }
    this.apply();
  }

  private get active(): boolean {
    return this.enabled && this.volume > 0 && this.hasMood;
  }

  /** Zustand auf die Engine übertragen und Takt starten/stoppen */
  private apply() {
    const e = this.engine;
    if (!e) return;
    const ctx = e.ctx as AudioContext;
    const now = ctx.currentTime;
    if (this.active) {
      e.setMood(this.mood, this.themeSector(this.mood), now);
      this.start();
    } else {
      e.stop(now);
    }
    this.applyLevel();
  }

  private applyLevel() {
    const e = this.engine;
    if (!e) return;
    const g = this.enabled ? this.volume * BASE_GAIN * (this.paused ? PAUSE_GAIN : 1) : 0;
    e.setLevel(g, this.paused, e.ctx.currentTime);
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private tick() {
    const e = this.engine;
    if (!e) return;
    const ctx = e.ctx as AudioContext;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // stumm: keine Knoten erzeugen, nur die Zeit weiterlaufen lassen
    const silent = sfx.muted || !this.active;
    const hidden = typeof document !== 'undefined' && document.hidden;
    try {
      e.schedule(now, now + (hidden ? AHEAD_HIDDEN : AHEAD), silent);
    } catch (err) {
      console.warn('Musik: Fehler beim Planen', err);
    }
    // Musik aus und alles ausgeklungen: Takt anhalten
    if (!this.active && e.playerCount === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {
      /* egal */
    }
  }
}

export const music = new Music();
