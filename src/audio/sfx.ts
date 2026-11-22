import { ZZFX } from 'zzfx';
import { WIDTH } from '../core/config';
import { SOUNDS } from './sounds';

const STORE_KEY = 'oganesson.audio';

/** iPhone/iPad (auch iPadOS, das sich als Mac ausgibt) */
const IOS = typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** kurze stille WAV-Datei als data:-URI (kein Netzwerkzugriff), für das <audio>-Element auf älteren iOS */
function silentWav(): string {
  const n = 800; // 0,1 s bei 8 kHz, 8 bit mono
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, n, true);
  b.fill(128, 44);
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/** höchstens so viele Effekte gleichzeitig (Schleifen und Musik nicht mitgezählt) */
const MAX_VOICES = 32;
/** höchstens so viele gleiche Effekte gleichzeitig */
const MAX_PER_SOUND = 5;
/** Wächter: Prüfabstand (ms) */
const WATCH_MS = 1000;
/** so viele Prüfungen in Folge ohne Fortschritt von currentTime (sichtbarer Tab) → Kontext neu anlegen */
const STALL_LIMIT = 3;
/** so viele Prüfungen in Folge 'suspended', obwohl resume() versucht wurde → Kontext neu anlegen */
const SUSPEND_LIMIT = 4;
/** frühestens nach so vielen ms wieder neu anlegen */
const RECREATE_GAP_MS = 8000;

export type AudioListener = (ctx: AudioContext) => void;

/** Diagnosezustand (für ?debug und Tests) */
export interface AudioDebug {
  state: string;
  time: number;
  voices: number;
  restarts: number;
  resumes: number;
  errors: number;
  lastError: string;
  lastEvent: string;
  /** Pegel am Master (0..1), nur mit enableMeter() */
  level: number;
}

/**
 * Soundeffekte: alle Sounds werden einmal mit ZzFX vorberechnet und als
 * AudioBuffer abgespielt (günstig auch bei 20 MG-Salven pro Sekunde).
 * Kette: Quelle -> Panner -> Gain -> Effekt-Bus -> Master -> Kompressor -> Ausgang.
 * Die Musik (music.ts) hängt mit eigenem Bus am Master: Stummschalten erfasst beides, die
 * Effekt-Lautstärke (volume) gilt nur für Effekte, die Musik hat eine eigene.
 *
 * Robustheit (Ton fiel unter Chrome/Windows sporadisch aus):
 * - Der AudioContext wird bei jeder Nutzereingabe, bei Rückkehr in den Tab/das Fenster und bei
 *   Zustandswechsel wieder angestoßen.
 * - Ein Wächter erkennt einen hängenden Kontext ('running', aber currentTime steht – z. B. nach
 *   Standby oder Wegfall des Ausgabegeräts) bzw. einen, der trotz resume() 'suspended' bleibt, und
 *   legt dann einen neuen an; ebenso nach einem Gerätewechsel (Kopfhörer, Bluetooth, HDMI). Die Musik
 *   zieht über onContext() mit.
 * - Gleichzeitige Effekte sind je Sound und insgesamt begrenzt (nach Endzeit, nicht nach 'ended',
 *   damit ein hängender Kontext die Zähler nicht dauerhaft blockiert). Fehler beim Abspielen werden
 *   abgefangen und gezählt, schalten aber nie dauerhaft stumm.
 * - Mindestabstände zwischen gleichen Sounds laufen über die Uhr des Browsers, nicht über
 *   ctx.currentTime (die steht bei einem hängenden Kontext bzw. beginnt beim neuen bei 0).
 */
class Sfx {
  private ctx: AudioContext | null = null;
  /** Master: nur Stummschaltung; davor Effekt-Bus (volume) und Musik-Bus */
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private music: GainNode | null = null;
  private meter: AnalyserNode | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  private wantMeter = false;
  /** vorberechnete Puffer; AudioBuffer sind nicht an einen Kontext gebunden und überleben ein Neuanlegen */
  private buffers = new Map<string, AudioBuffer[]>();
  /** letzter Start je Sound (ms, performance.now) */
  private last = new Map<string, number>();
  /** voraussichtliche Endzeiten (ms) laufender Effekte je Sound */
  private ends = new Map<string, number[]>();
  private voices = 0;
  private loops = new Map<string, Loop>();
  private listeners: AudioListener[] = [];
  private watch: ReturnType<typeof setInterval> | null = null;
  private lastCt = -1;
  private stall = 0;
  private suspendedFor = 0;
  private lastRecreate = 0;
  private deviceTimer: ReturnType<typeof setTimeout> | null = null;
  private dbg = { restarts: 0, resumes: 0, errors: 0, lastError: '', lastEvent: '' };
  muted = false;
  volume = 0.7;
  /** stilles <audio>-Element (nur iOS ohne navigator.audioSession) */
  private sessionEl: HTMLAudioElement | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { muted?: boolean; volume?: number };
        this.muted = !!s.muted;
        if (typeof s.volume === 'number') this.volume = Math.min(1, Math.max(0, s.volume));
      }
    } catch {
      /* kein Speicher */
    }
  }

  /**
   * Muss aus einer Nutzeraktion (Klick/Taste/Touch) heraus aufgerufen werden. Wird bei jeder
   * Berührung erneut aufgerufen und ist dann billig; nur wenn der Kontext nicht läuft
   * (iOS: 'suspended' oder nach Anruf/Sperre 'interrupted'), wird er wieder angestoßen.
   * Hängt der Kontext (Wächter hat Stillstand bemerkt) oder ist er geschlossen, wird er hier –
   * sicher innerhalb der Nutzeraktion – neu angelegt.
   *
   * iOS-Besonderheiten:
   * - resume() muss synchron im Ereignis-Handler passieren (touchend/click), daher zuerst resume,
   *   danach erst die Sounds vorberechnen.
   * - Ein kurzer stummer Puffer wird sofort abgespielt, das entsperrt die Ausgabe zuverlässig.
   * - Audio-Session 'playback': Ton auch bei eingeschaltetem Stummschalter (wie ein Spiel/Video).
   *   Ältere iOS ohne navigator.audioSession: ein stilles <audio>-Element in Schleife schaltet
   *   die Session ebenfalls auf Wiedergabe.
   */
  unlock() {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running' && this.stall < 2) return;
    this.enablePlaybackSession();
    if (ctx) {
      if (ctx.state === 'closed' || (this.stall >= 2 && !IOS)) {
        this.recreate(ctx.state === 'closed' ? 'geschlossen' : 'hängt (Eingabe)', true);
        return;
      }
      this.resume('Eingabe');
      this.kick(ctx);
      return;
    }
    try {
      const fresh = ZZFX.audioContext;
      // sofort anstoßen, solange wir sicher im Handler der Nutzeraktion sind
      void fresh.resume().catch(() => undefined);
      this.kick(fresh);
      this.install(fresh);
      for (const [name, def] of Object.entries(SOUNDS)) {
        const list: AudioBuffer[] = [];
        for (let i = 0; i < (def.variants ?? 3); i++) {
          const samples = ZZFX.buildSamples(...def.p);
          const buf = fresh.createBuffer(1, samples.length, ZZFX.sampleRate);
          buf.getChannelData(0).set(samples);
          list.push(buf);
        }
        this.buffers.set(name, list);
      }
      this.startWatch();
    } catch (err) {
      this.ctx = null;
      this.noteError(err);
      console.warn('Audio nicht verfügbar', err);
    }
  }

  /** Zustand des AudioContext (für Tests und Fehlersuche) */
  get state(): string {
    return this.ctx?.state ?? 'gesperrt';
  }

  /** aktueller AudioContext (null vor dem ersten unlock) */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Eingang für die Musik (am Master hinter der Stummschaltung, vor dem Kompressor); gehört zum
   * aktuellen Kontext, nach einem Neuanlegen gibt es einen neuen (siehe onContext).
   */
  get musicBus(): GainNode | null {
    return this.music;
  }

  /**
   * Rückruf, sobald ein Kontext läuft (nach Entsperren, resume oder Neuanlegen). Die Musik
   * hängt sich hier an, damit sie nach einem neu angelegten Kontext dort weiterspielt.
   */
  onContext(fn: AudioListener) {
    this.listeners.push(fn);
    if (this.ctx && this.ctx.state === 'running') fn(this.ctx);
  }

  /** Diagnose: Zustand, Neustarts, Fehler, laufende Stimmen, Pegel */
  debugInfo(): AudioDebug {
    let level = 0;
    if (this.meter && this.meterBuf) {
      this.meter.getFloatTimeDomainData(this.meterBuf);
      for (const v of this.meterBuf) level = Math.max(level, Math.abs(v));
    }
    return {
      state: this.state,
      time: this.ctx?.currentTime ?? 0,
      voices: this.countVoices(performance.now()),
      ...this.dbg,
      level,
    };
  }

  /** Pegelmesser am Master einschalten (nur für ?debug, kostet etwas Rechenzeit) */
  enableMeter() {
    this.wantMeter = true;
    if (this.ctx && this.master && !this.meter) this.attachMeter(this.ctx, this.master);
  }

  /**
   * Selbsttest für Fehlersuche: läuft der Kontext und schreitet seine Zeit voran?
   * Spielt dabei einen kurzen Klick (falls nicht stumm).
   */
  async selfTest(): Promise<{ ok: boolean; state: string; advanced: number; info: AudioDebug }> {
    const ctx = this.ctx;
    if (!ctx) return { ok: false, state: this.state, advanced: 0, info: this.debugInfo() };
    const t0 = ctx.currentTime;
    this.play('click');
    await new Promise((r) => setTimeout(r, 400));
    const advanced = (this.ctx?.currentTime ?? 0) - (this.ctx === ctx ? t0 : 0);
    return { ok: this.ctx?.state === 'running' && advanced > 0.2, state: this.state, advanced, info: this.debugInfo() };
  }

  /** Testhilfe: Kontext wie nach einem Gerätewechsel neu anlegen */
  restart(reason = 'manuell') {
    this.recreate(reason, true);
  }

  /** neuen Kontext verdrahten: Kompressor, Master, Zustandsüberwachung */
  private install(ctx: AudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(comp);
    const fx = ctx.createGain();
    fx.connect(master);
    const music = ctx.createGain();
    music.connect(master);
    this.ctx = ctx;
    this.master = master;
    this.fx = fx;
    this.music = music;
    master.gain.value = this.muted ? 0 : 1;
    this.meter = null;
    if (this.wantMeter) this.attachMeter(ctx, master);
    this.applyVolume();
    this.last.clear();
    this.ends.clear();
    this.voices = 0;
    this.loops.clear();
    this.stall = 0;
    this.suspendedFor = 0;
    this.lastCt = -1;
    ctx.addEventListener('statechange', () => {
      if (ctx !== this.ctx) return;
      this.dbg.lastEvent = `Zustand: ${ctx.state}`;
      if (ctx.state === 'running') {
        this.suspendedFor = 0;
        this.notify();
      } else if (ctx.state !== 'closed' && !document.hidden) {
        // nicht von uns verursacht (Gerätewechsel, Standby …): gleich wieder anstoßen
        this.resume('Zustandswechsel');
      }
    });
    // Chrome meldet Ausgabefehler (z. B. Gerät weg) als 'error'-Ereignis am Kontext
    ctx.addEventListener('error', () => {
      if (ctx === this.ctx) this.recreate('Fehler im Kontext', false);
    });
    if (ctx.state === 'running') this.notify();
  }

  private attachMeter(ctx: AudioContext, master: GainNode) {
    try {
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      master.connect(an);
      this.meter = an;
      this.meterBuf = new Float32Array(an.fftSize);
    } catch {
      /* egal */
    }
  }

  private notify() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const fn of this.listeners) {
      try {
        fn(ctx);
      } catch (err) {
        this.noteError(err);
      }
    }
  }

  private resume(why: string) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    this.dbg.resumes++;
    this.dbg.lastEvent = `resume (${why})`;
    try {
      void ctx.resume().catch(() => undefined);
    } catch {
      /* egal */
    }
  }

  /**
   * Alten Kontext verwerfen und neuen anlegen. Ohne Nutzeraktion nur, wenn die Seite schon einmal
   * eine hatte (sonst startet der neue Kontext ohnehin 'suspended'); auf iOS nur aus einer Nutzeraktion.
   */
  private recreate(why: string, fromGesture: boolean) {
    const old = this.ctx;
    if (!old || this.buffers.size === 0) return;
    const now = performance.now();
    if (!fromGesture && now - this.lastRecreate < RECREATE_GAP_MS) return;
    if (!fromGesture && IOS) return;
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    if (!fromGesture && nav.userActivation && !nav.userActivation.hasBeenActive) return;
    this.lastRecreate = now;
    let fresh: AudioContext;
    try {
      fresh = new AudioContext();
    } catch (err) {
      this.noteError(err);
      return;
    }
    this.dbg.restarts++;
    this.dbg.lastEvent = `neu angelegt: ${why}`;
    console.info(`Audio: Kontext neu angelegt (${why})`);
    try {
      void fresh.resume().catch(() => undefined);
      this.kick(fresh);
    } catch {
      /* egal */
    }
    // Schleifen (Rotor …) hängen am alten Kontext; GameScene legt sie im nächsten Frame neu an
    this.install(fresh);
    try {
      void old.close().catch(() => undefined);
    } catch {
      /* egal */
    }
  }

  /** Wächter starten: Stillstand erkennen, Rückkehr in Tab/Fenster und Gerätewechsel beobachten */
  private startWatch() {
    if (this.watch) return;
    this.watch = setInterval(() => this.check(), WATCH_MS);
    const back = () => {
      if (document.hidden) return;
      // Zeitbasis neu setzen: im Hintergrund drosseln Browser die Timer
      this.lastCt = -1;
      this.stall = 0;
      this.resume('Rückkehr');
    };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    window.addEventListener('pageshow', back);
    try {
      navigator.mediaDevices?.addEventListener?.('devicechange', () => {
        this.dbg.lastEvent = 'Gerätewechsel';
        // Ausgabegerät gewechselt (Kopfhörer, Bluetooth, HDMI): ein neuer Kontext nutzt sicher das
        // aktuelle Standardgerät; kurz warten, bis das System umgeschaltet hat
        if (this.deviceTimer) clearTimeout(this.deviceTimer);
        this.deviceTimer = setTimeout(() => {
          this.deviceTimer = null;
          if (this.ctx && this.ctx.state === 'running') this.recreate('Gerätewechsel', false);
          else this.resume('Gerätewechsel');
        }, 800);
      });
    } catch {
      /* nicht unterstützt */
    }
  }

  /** eine Wächter-Runde (öffentlich für Tests) */
  check() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      this.lastCt = -1;
      this.stall = 0;
      return;
    }
    if (ctx.state === 'closed') {
      this.recreate('geschlossen', false);
      return;
    }
    if (ctx.state !== 'running') {
      this.lastCt = -1;
      this.suspendedFor++;
      this.resume('Wächter');
      if (this.suspendedFor >= SUSPEND_LIMIT) this.recreate(`bleibt ${ctx.state}`, false);
      return;
    }
    this.suspendedFor = 0;
    const t = ctx.currentTime;
    if (this.lastCt >= 0 && t - this.lastCt < 0.05) {
      this.stall++;
      if (this.stall >= STALL_LIMIT) this.recreate('Zeit steht', false);
    } else {
      this.stall = 0;
    }
    this.lastCt = t;
  }

  /** stummen Mini-Puffer abspielen: entsperrt die Ausgabe auf iOS */
  private kick(ctx: AudioContext) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* egal */
    }
  }

  /** Audio-Session auf Wiedergabe stellen, damit der Stummschalter des iPhones das Spiel nicht stumm macht */
  private enablePlaybackSession() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) {
      try {
        if (nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
      } catch {
        /* nicht unterstützt */
      }
      return;
    }
    if (!IOS) return;
    try {
      if (!this.sessionEl) {
        const el = document.createElement('audio');
        el.src = silentWav();
        el.loop = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('x-webkit-airplay', 'deny');
        el.preload = 'auto';
        this.sessionEl = el;
      }
      if (this.sessionEl.paused) void this.sessionEl.play().catch(() => undefined);
    } catch {
      /* egal */
    }
  }

  /** laufende Effekte zählen und abgelaufene austragen */
  private countVoices(now: number): number {
    let n = 0;
    for (const list of this.ends.values()) {
      let k = 0;
      for (const e of list) if (e > now) list[k++] = e;
      list.length = k;
      n += k;
    }
    this.voices = n;
    return n;
  }

  private noteError(err: unknown) {
    this.dbg.errors++;
    this.dbg.lastError = String((err as Error)?.message ?? err).slice(0, 120);
  }

  /** Sound abspielen; x (Pixel) steuert das Stereo-Panning */
  play(name: string, x?: number, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.fx || ctx.state !== 'running' || this.muted || this.volume <= 0) return;
    const def = SOUNDS[name];
    const bufs = this.buffers.get(name);
    if (!def || !bufs) return;
    const now = performance.now();
    const last = this.last.get(name);
    if (last !== undefined && now - last < def.gap * 1000) return;
    // Begrenzung: je Sound und insgesamt (Spätspiel mit Dutzenden Explosionen pro Sekunde)
    let ends = this.ends.get(name);
    if (!ends) this.ends.set(name, (ends = []));
    let k = 0;
    for (const e of ends) if (e > now) ends[k++] = e;
    ends.length = k;
    if (k >= MAX_PER_SOUND) return;
    if (this.voices >= MAX_VOICES && this.countVoices(now) >= MAX_VOICES) return;
    this.last.set(name, now);
    try {
      const buf = bufs[Math.floor(Math.random() * bufs.length)];
      const rate = 0.94 + Math.random() * 0.12;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const gain = ctx.createGain();
      const g = (def.vol ?? 1) * vol;
      gain.gain.value = Number.isFinite(g) ? g : 1;
      if (x !== undefined && Number.isFinite(x)) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, (x / WIDTH) * 2 - 1)) * 0.6;
        src.connect(pan).connect(gain);
      } else {
        src.connect(gain);
      }
      gain.connect(this.fx);
      src.onended = () => gain.disconnect();
      src.start();
      ends.push(now + (buf.duration / rate) * 1000 + 30);
      this.voices++;
    } catch (err) {
      this.noteError(err);
    }
  }

  /** Dauerschleife (z. B. Rotor) auf eine Lautstärke 0..1 einblenden */
  setLoop(name: string, level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    try {
      let loop = this.loops.get(name);
      if (!loop) {
        if (level <= 0 || ctx.state !== 'running') return;
        const bufs = this.buffers.get(name);
        if (!bufs) return;
        const src = ctx.createBufferSource();
        src.buffer = bufs[0];
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(this.fx);
        src.start();
        loop = { src, gain };
        this.loops.set(name, loop);
      }
      const target = this.muted ? 0 : level * (SOUNDS[name].vol ?? 1);
      if (Number.isFinite(target) && Math.abs(loop.gain.gain.value - target) > 0.001) {
        loop.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
      }
    } catch (err) {
      this.noteError(err);
    }
  }

  /** Stummschalten; persist=false ändert nur diese Seite (Replay-Seite), nicht die gespeicherte Einstellung */
  setMuted(m: boolean, persist = true) {
    this.muted = m;
    this.applyVolume();
    if (persist) this.save();
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.volume > 0 && this.muted) this.muted = false;
    this.applyVolume();
    this.save();
  }

  private applyVolume() {
    // ZzFX-Samples sind recht leise, daher Grundverstärkung 2
    if (this.fx) this.fx.gain.value = this.volume * 2;
    // Stummschalten kurz rampen, damit laufende Musik nicht knackt
    const ctx = this.ctx;
    const g = this.master?.gain;
    if (!ctx || !g) return;
    const target = this.muted ? 0 : 1;
    try {
      g.cancelScheduledValues(ctx.currentTime);
      g.setTargetAtTime(target, ctx.currentTime, 0.015);
    } catch {
      g.value = target;
    }
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ muted: this.muted, volume: this.volume }));
    } catch {
      /* egal */
    }
  }
}

export const sfx = new Sfx();
