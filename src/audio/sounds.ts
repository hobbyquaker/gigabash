// ZzFX-Parameter aller Soundeffekte.
// Reihenfolge: volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
// slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush,
// delay, sustainVolume, decay, tremolo, filter
// shape: 0 Sinus, 1 Dreieck, 2 Sägezahn, 3 Tan, 4 Rauschen, 5 Rechteck (shapeCurve = Tastverhältnis)
// filter: positiv = Hochpass, negativ = Tiefpass (Grenzfrequenz in Hz)
// slide: Frequenzänderung ≈ slide · 500 Hz pro Sekunde
//
// Pegelregeln (geprüft mit `node scripts/audio-levels.mjs`):
// - Dauerfeuer (shoot, side, spread, rear, drone) leise, kurz, weich (Tiefpass), mehrere Varianten.
// - Treffer an Gegnern (hit) leiser als die Bordkanone, sonst wird das Dauerfeuer zum Geknatter.
// - Warn- und Ansage-Sounds (hurt, alarm, warn, bomb, explodeBig, gameover, clear) deutlich lauter
//   als das Dauerfeuer.

export type ZzfxParams = (number | undefined)[];

export interface SoundDef {
  p: ZzfxParams;
  /** Mindestabstand zwischen zwei gleichen Sounds (s) */
  gap: number;
  /** zusätzliche Lautstärke */
  vol?: number;
  /** vorberechnete Varianten (wegen randomness) */
  variants?: number;
  loop?: boolean;
}

export const SOUNDS: Record<string, SoundDef> = {
  // ── Spielerwaffen (Dauerfeuer: leise, kurz, leicht variiert) ──
  /** Bordkanone: weiches, tiefes „pff“, Dreieck mit Tiefpass, 4 Varianten */
  shoot: { p: [0.5, 0.1, 620, 0, 0.012, 0.045, 1, 1.3, -13, , , , , , , , , 0.6, , , -2600], gap: 0.06, vol: 0.28, variants: 4 },
  /** Seitenkanonen: helles, dünnes Ticken */
  side: { p: [0.45, 0.08, 1150, 0, 0.006, 0.03, 2, 1, -36, , , , , , , , , 0.5, , , -4500], gap: 0.09, vol: 0.3, variants: 3 },
  /** Streuschuss: rauschiges „fft“ */
  spread: { p: [0.5, 0.08, 380, 0, 0.012, 0.06, 1, 1, -5, , , , , 0.8, , , , 0.5, , , -2400], gap: 0.1, vol: 0.28, variants: 3 },
  /** Rakete: zischender Start, ansteigend */
  missile: { p: [0.6, 0.1, 180, 0.01, 0.07, 0.2, 4, 1, 4, , , , , 1.2, , , , 0.6, , , -2200], gap: 0.14, vol: 0.3, variants: 3 },
  /** Laser: kurzer Sägezahn-Zap mit Vibrato */
  laser: { p: [0.5, 0.05, 1500, 0.002, 0.035, 0.11, 2, 1, -12, , , , , , 22, , , 0.6, , , -5200], gap: 0.12, vol: 0.27, variants: 3 },
  /** Heckkanone: dumpfer Plopp */
  rear: { p: [0.5, 0.06, 240, 0, 0.012, 0.06, 1, 1, -3, , , , , , , , , 0.6, , , -1800], gap: 0.12, vol: 0.32, variants: 3 },
  /** Drohne: winziger Sinus-Blip */
  drone: { p: [0.35, 0.06, 1700, 0, 0.005, 0.025, 0, 1, -40], gap: 0.1, vol: 0.2, variants: 3 },
  /** Impulsblaster: sehr kurzes, helles „pip“ (feuert schnell, daher leise) */
  pulse: { p: [0.3, 0.08, 1400, 0, 0.004, 0.02, 0, 1, -30, , , , , , , , , 0.5], gap: 0.08, vol: 0.18, variants: 3 },
  /** Strahllaser: leises Brummen mit Vibrato, alle paar Zehntel wiederholt solange der Strahl läuft */
  beam: { p: [0.4, 0.02, 220, 0.02, 0.12, 0.06, 2, 1, , , , , , , 8, , , 0.7, , , -1400], gap: 0.16, vol: 0.14, variants: 2 },
  /** Blitzbogen: knisternder Zap */
  arc: { p: [0.6, 0.15, 900, 0, 0.02, 0.12, 4, 1, -20, , , , , 1.5, 40, , , 0.5, , , -3000], gap: 0.12, vol: 0.32, variants: 3 },
  /** Railgun: harter, heller Knall mit schnell fallendem Sägezahn */
  rail: { p: [0.7, 0.05, 1900, 0, 0.02, 0.16, 2, 1.4, -60, , , , , 0.3, , 0.1, , 0.6, , , -5200], gap: 0.14, vol: 0.34, variants: 3 },
  /** Flak: dumpfes „Wumm“ beim Abschuss */
  flak: { p: [0.6, 0.08, 150, 0, 0.02, 0.09, 1, 1, -4, , , , , 0.6, , , , 0.6, , , -1500], gap: 0.12, vol: 0.34, variants: 3 },
  /** Flak-Granate zerplatzt: kurzes, trockenes Knallen */
  burst: { p: [0.6, 0.15, 260, 0, 0.008, 0.07, 4, 1, -2, , , , , 0.9, , 0.1, , 0.5, , , -2600], gap: 0.09, vol: 0.26, variants: 3 },
  /** Plasma-Orb: tiefes, schwellendes Summen */
  plasma: { p: [0.6, 0.03, 120, 0.04, 0.12, 0.2, 0, 1, 1.2, , , , , , 14, , , 0.7, , , -1200], gap: 0.3, vol: 0.4, variants: 2 },
  /** Sonnenkern verschluckt eine Kugel: kurzes, weiches „blub“ */
  absorb: { p: [0.35, 0.1, 520, 0, 0.01, 0.05, 0, 1, -12, , , , , , , , , 0.5], gap: 0.07, vol: 0.25, variants: 2 },
  /** kritischer Treffer: helles, kurzes „tschak“ */
  crit: { p: [0.45, 0.08, 1500, 0, 0.006, 0.045, 2, 1, -25, , , , , 0.3, , , , 0.5, , , -5000], gap: 0.09, vol: 0.26, variants: 2 },

  // ── Gegner ──
  /** Gegnerschuss: tiefer, aufsteigender Bloop (anders als die eigenen Schüsse) */
  eshot: { p: [0.45, 0.1, 230, 0.005, 0.03, 0.08, 0, 1, 14, , , , , , , , , 0.6], gap: 0.07, vol: 0.34 },
  /** Treffer am Gegner: kurzes Knacken, leiser als die Bordkanone */
  hit: { p: [0.45, 0.2, 320, 0, 0.004, 0.03, 4, 1, , , , , , 0.5, , , , , , , 1200], gap: 0.045, vol: 0.22 },
  /** kleine Explosion: kurzer, knackiger Rauschstoß */
  explode: { p: [1, 0.1, 85, 0.004, 0.05, 0.32, 4, 1.3, -0.12, , , , , 0.7, , 0.12, , 0.6, 0.03, , -3200], gap: 0.05, vol: 0.62 },
  /** große Explosion (Bomber, Fregatte, Boss): lang, tief, mit Nachhall */
  explodeBig: { p: [1, 0.05, 52, 0.006, 0.18, 1.0, 4, 1.6, -0.03, , , , , 1.1, , 0.25, 0.08, 0.6, 0.08, , -1900], gap: 0.12, vol: 1.25 },

  /** Sperrfeuer zündet: kurzes, tiefes Laser-Brummen mit Abwärts-Slide */
  zap: { p: [0.9, 0.05, 150, 0.005, 0.2, 0.25, 2, 1, -0.25, , , , , 0.4, 30, , , 0.8, , , -2600], gap: 0.2, vol: 0.85 },
  /** Scharfschütze erfasst das Ziel: zwei helle Pieptöne */
  lockon: { p: [0.6, 0, 1250, 0, 0.04, 0.03, 5, 0.5, , , , , 0.09, , , , , 0.8, , , -4000], gap: 0.6, vol: 0.75, variants: 1 },
  /** Streifschuss: kurzes, helles „tsing“ */
  graze: { p: [0.35, 0.08, 1900, 0, 0.008, 0.05, 0, 1, 25, , , , , , , , , 0.5], gap: 0.06, vol: 0.4 },

  // ── Items (klar unterscheidbar je Itemtyp) ──
  /** Kristall: heller Doppel-Ding (Münze) */
  coin: { p: [0.5, 0, 1675, , 0.04, 0.16, 1, 1.8, , , 837, 0.05], gap: 0.05, vol: 0.55, variants: 1 },
  /** P-Kapsel: schnelles aufsteigendes Arpeggio (Waffe stärker) */
  powerup: { p: [0.6, 0, 262, 0.01, 0.26, 0.18, 1, 1.4, , , 131, 0.05, 0.05, , , , , 0.85], gap: 0.1, vol: 0.85, variants: 1 },
  /** Reparatur: warmes, aufsteigendes Anschwellen (Sinus) */
  repair: { p: [0.6, 0, 300, 0.04, 0.2, 0.25, 0, 1, 5, , 150, 0.12, , , , , , 0.8], gap: 0.1, vol: 0.9, variants: 1 },
  /** Schild-Kapsel: schimmernder Glanz mit Tremolo */
  shield: { p: [0.6, 0, 440, 0.04, 0.3, 0.3, 0, 1, 3, , 220, 0.1, 0.06, , , , , 0.8, , 0.4], gap: 0.2, vol: 0.85, variants: 1 },
  /** Bomben-Kapsel: tiefer, schwerer Ton, stufenweise steigend (neu, GameScene spielt bisher 'powerup') */
  pickupBomb: { p: [0.8, 0, 110, 0.005, 0.08, 0.2, 2, 1.5, , , 55, 0.09, 0.18, 0.2, , , , 0.7, , , -1400], gap: 0.1, vol: 0.9, variants: 1 },

  // ── Spieler ──
  /** Spieler getroffen: harter, verzerrter Abwärts-Krach */
  hurt: { p: [1, 0.05, 210, 0.003, 0.08, 0.28, 2, 2, -1, , , , , 1.2, , 0.35, , 0.6, 0.02, , -2800], gap: 0.15, vol: 1.3 },
  /** Schild fängt Treffer ab: metallisches „Ping-Bong“ */
  shieldHit: { p: [0.7, 0.05, 1050, 0.002, 0.04, 0.22, 0, 1, -4, , , , , , 18, , 0.04, 0.6], gap: 0.12, vol: 1.3 },
  /** Smartbombe: gewaltiges, langes Grollen mit Echo */
  bomb: { p: [1, 0, 42, 0.02, 0.45, 1.5, 4, 1.2, -0.015, , , , , 1.6, , 0.2, 0.14, 0.75, 0.15, , -1500], gap: 0.3, vol: 1.5, variants: 1 },
  /** Waffenstufe gestiegen: kurze Fanfare (neu, für Event 'gunUp') */
  gunUp: { p: [0.6, 0, 392, 0.01, 0.12, 0.25, 2, 1, , , 196, 0.07, 0.07, , , , , 0.8, , , -3500], gap: 0.3, vol: 0.8, variants: 1 },
  /** Phönix / zweite Chance: lang aufsteigender Glanz (neu) */
  phoenix: { p: [0.7, 0, 196, 0.05, 0.5, 0.4, 1, 1, 2.5, , 98, 0.1, 0.1, , , , 0.06, 0.8, , 0.2], gap: 1, vol: 1.3, variants: 1 },

  // ── Ereignisse ──
  /** Boss-Alarm: Sirene, viermal auf- und abschwellend */
  alarm: { p: [0.8, 0, 360, 0.02, 1.0, 0.2, 2, 1, 5, , , , 0.3, , , , , 0.85, , , -3000], gap: 1, vol: 1.1, variants: 1 },
  /** kurze Warnung (Fregatte): drei fallende Signaltöne (neu; GameScene spielt bisher 'alarm') */
  warn: { p: [0.8, 0, 660, 0.01, 0.22, 0.08, 5, 0.5, , , -165, 0.13, 0.15, , , , , 0.85, , , -3000], gap: 1, vol: 0.7, variants: 1 },
  /** Boss wechselt die Phase: tiefer, drohender Stoß (neu, für Event 'bossPhase') */
  bossPhase: { p: [0.9, 0, 70, 0.01, 0.25, 0.5, 2, 1.5, -0.08, , , , , 0.5, , 0.2, 0.05, 0.7, , , -900], gap: 0.5, vol: 1, variants: 1 },
  /** Sektor geschafft: Dur-Arpeggio aufwärts */
  clear: { p: [0.6, 0, 392, 0.01, 0.35, 0.4, 1, 1, , , 196, 0.1, 0.1, , , , 0.08, 0.8], gap: 0.5, vol: 1.3, variants: 1 },
  /** Start in den Sektor: aufsteigendes Triebwerksrauschen */
  launch: { p: [0.7, 0.05, 160, 0.25, 0.35, 0.5, 4, 1, 2.5, , , , , 1, , , , 0.7, , , -1800], gap: 0.5, vol: 0.9, variants: 1 },
  /** Game Over: lang abfallender, trauriger Ton */
  gameover: { p: [0.8, 0, 330, 0.02, 0.6, 0.8, 1, 1, -0.25, , -55, 0.4, , , , , 0.12, 0.8, , 0.15], gap: 1, vol: 1.1, variants: 1 },

  // ── Händler ──
  /** Kauf: zwei helle, steigende Glöckchen */
  buy: { p: [0.5, 0, 990, , 0.05, 0.22, 1, 1.8, , , 495, 0.06], gap: 0.05, vol: 0.8, variants: 1 },
  /** Fehler (zu teuer / nicht erlaubt): tiefes Doppel-Brummen */
  error: { p: [0.6, 0, 110, 0.005, 0.12, 0.06, 2, 1, , , , , 0.09, , , , , 0.9, , 1, -1500], gap: 0.15, vol: 0.8, variants: 1 },
  /** Klick (Reiter, Knöpfe): kurzes, weiches Tick */
  click: { p: [0.3, 0, 1200, , 0.004, 0.02, 0, 1, -30], gap: 0.03, vol: 0.6, variants: 1 },
};
