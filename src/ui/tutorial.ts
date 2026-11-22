// Tutorial: kurze, nicht blockierende Sprechblasen, jede nur einmal, abschaltbar (settings.tips).
// Ausgelöst allein aus ui.updateHud(sim) und ui.openShop(sim) – die Scene bleibt unverändert.
import type { Sim } from '../core/sim/sim';
import { settings, loadJson, saveJson } from '../settings';

const KEY = 'oganesson.tutorial';

export type TipId = 'controls' | 'pitem' | 'shop' | 'skill' | 'hazard' | 'sniper' | 'graze';

interface TipDef {
  html: () => string;
  /** Position im Spielbereich: Anteil der Säulenhöhe, oder ein Element, unter das die Blase zeigt */
  at: { y: number } | { below: string; arrowX?: number };
  ms: number;
}

const touch = () => document.documentElement.classList.contains('touch');

const TIPS: Record<TipId, TipDef> = {
  controls: {
    html: () =>
      touch()
        ? settings.control === 'stick'
          ? '<b>Steuerung:</b> Daumen aufs Feld legen – dort erscheint der Joystick – und schieben. Gefeuert wird automatisch.'
          : '<b>Steuerung:</b> Finger irgendwo aufs Feld legen und ziehen – das Schiff folgt deiner Bewegung. Gefeuert wird automatisch.'
        : '<b>Steuerung:</b> WASD/Pfeiltasten oder Maus gedrückt halten. Gefeuert wird automatisch. <b>B</b>/Leertaste: Bombe, <b>P</b>: Pause.',
    at: { y: 0.6 },
    ms: 7000,
  },
  pitem: {
    html: () => 'Eine <b>P-Kapsel</b>! Einsammeln verstärkt deine Bordkanone – bis Stufe 5 (Anzeige oben links).',
    at: { y: 0.24 },
    ms: 6000,
  },
  shop: {
    html: () =>
      '<b>Händler:</b> <b>Schiff</b> = Upgrades und Reparatur, <b>Waffen</b> = Steckplatz am Schiff antippen und Anbauwaffe kaufen, <b>Skills</b> = Skillpunkte ausgeben.',
    at: { below: '.tabs' },
    ms: 9000,
  },
  hazard: {
    html: () => '<b>Sperrfeuer!</b> Rote Streifen zeigen, wo gleich ein Laser einschlägt. Raus da – du hast eine Sekunde.',
    at: { y: 0.3 },
    ms: 6000,
  },
  sniper: {
    html: () => '<b>Scharfschütze!</b> Wer zu lange still steht, wird anvisiert – ab Sektor 5 sogar <b>erfasst</b> (Treffer kosten mehr, Schild lädt nicht). In Bewegung bleiben!',
    at: { y: 0.3 },
    ms: 6000,
  },
  graze: {
    html: () => '<b>Streifschuss:</b> Knapp an Kugeln vorbei gibt Punkte und füllt die gelbe Leiste – voll gibt es eine Bombe.',
    at: { y: 0.3 },
    ms: 7000,
  },
  skill: {
    html: () => 'Du hast einen <b>Skillpunkt</b>! Im Reiter <b>Skills</b> schaltest du dauerhafte Verbesserungen frei.',
    at: { below: '.tabs', arrowX: 0.83 },
    ms: 7000,
  },
};

export class Tutorial {
  private seen = new Set<TipId>(loadJson<TipId[]>(KEY, []));
  private queue: TipId[] = [];
  private current: TipId | null = null;
  private shownAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private el = document.getElementById('tips')!;

  constructor() {
    // Im Händler blendet Antippen irgendwo die Blase aus (blockiert nichts: kein preventDefault).
    // Im Flug nicht – da liegt der Finger ohnehin dauernd auf dem Feld; dort läuft nur die Zeit ab.
    const dismiss = () => {
      if (!this.current || performance.now() - this.shownAt < 600) return;
      if (!document.getElementById('overlay')!.hidden) this.next();
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', dismiss, true);
  }

  /** jeden Frame aus updateHud */
  onHud(sim: Sim) {
    if (!settings.tips || this.seen.size >= 7) return;
    if (sim.phase === 'flight' || sim.phase === 'boss') {
      this.want('controls');
      if (sim.items.some((it) => it.kind === 'P')) this.want('pitem');
      if (sim.hazards.length) this.want('hazard');
      if (sim.enemies.some((e) => e.type === 'sniper')) this.want('sniper');
      if (sim.player.grazes > 0) this.want('graze');
    }
  }

  /** beim Öffnen des Händlers */
  onShop(sim: Sim) {
    if (!settings.tips) return;
    this.want('shop');
    if (sim.skillPoints > 0) this.want('skill');
  }

  /** Blase jetzt zeigen (falls nicht schon gesehen/geplant) */
  private want(id: TipId) {
    if (this.seen.has(id) || this.queue.includes(id) || this.current === id) return;
    this.queue.push(id);
    if (!this.current) this.next();
  }

  private next() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.el.innerHTML = '';
    this.current = null;
    const id = this.queue.shift();
    if (!id || !settings.tips) return;
    this.current = id;
    this.shownAt = performance.now();
    this.seen.add(id);
    saveJson(KEY, [...this.seen]);
    const def = TIPS[id];
    const b = document.createElement('div');
    b.className = 'tip';
    b.dataset.tip = id;
    const inShop = id === 'shop' || id === 'skill';
    b.innerHTML = `${def.html()}${inShop ? `<small>${touch() ? 'Antippen' : 'Klicken'} zum Schließen</small>` : ''}`;
    this.el.appendChild(b);
    this.place(b, def);
    this.timer = setTimeout(() => this.next(), def.ms);
  }

  private place(b: HTMLElement, def: TipDef) {
    const col = document.getElementById('col')!.getBoundingClientRect();
    if ('y' in def.at) {
      b.style.top = `${def.at.y * col.height}px`;
      b.classList.add('no-arrow');
      return;
    }
    const target = document.querySelector(def.at.below);
    const r = target?.getBoundingClientRect();
    if (!r) {
      b.style.top = `${0.3 * col.height}px`;
      b.classList.add('no-arrow');
      return;
    }
    b.style.top = `${r.bottom - col.top + 12}px`;
    b.style.setProperty('--ax', `${(def.at.arrowX ?? 0.5) * 100}%`);
  }

  /** alles ausblenden (Pause, Game Over, Start); Geplantes verfällt nicht */
  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.el.innerHTML = '';
  }

  /** Verwerfen inkl. Warteschlange (z. B. Tipps ausgeschaltet) */
  stop() {
    this.queue = [];
    this.clear();
  }

  /** Tipps wieder von vorn zeigen */
  reset() {
    this.seen.clear();
    saveJson(KEY, []);
  }
}
