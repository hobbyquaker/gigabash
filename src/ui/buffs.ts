// Anzeige aktiver Buffs/Powerups im HUD und der Schiffswerte im Pausenmenü.
// Liest nur den Sim-Zustand, verändert nichts.
import type { Sim } from '../core/sim/sim';
import { SHIP_CLASSES, weaponName } from '../core/data/shop';
import type { PlayerWeapon } from '../core/sim/types';

export interface Buff {
  /** ändert sich, wenn neu gezeichnet werden muss (inkl. Restsekunden) */
  key: string;
  cls: string;
  html: string;
  title: string;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const SHORT: Record<PlayerWeapon, string> = {
  main: 'Kanone', side: 'Seite', spread: 'Streu', missile: 'Rakete', laser: 'Laser', rear: 'Heck', drone: 'Drohne',
  pulse: 'Impuls', beam: 'Strahl', arc: 'Blitz', rail: 'Rail', flak: 'Flak', plasma: 'Plasma',
};
const ICON: Record<PlayerWeapon, string> = {
  main: '🔫', side: '➶', spread: '✳', missile: '🚀', laser: '⚡', rear: '↯', drone: '🛰',
  pulse: '•', beam: '┃', arc: 'ϟ', rail: '║', flak: '✹', plasma: '◉',
};

/** zeitlich begrenzte Effekte zuerst, dann bereite Fähigkeiten, dann Anbauwaffen */
export function buffList(sim: Sim): Buff[] {
  const p = sim.player;
  const out: Buff[] = [];
  const secs = (t: number) => Math.ceil(t / 60);
  // Zielerfassung (Härte-Update; ältere Sim-Kerne der Wiedergabe kennen sie nicht)
  if ((sim as { locked?: () => boolean }).locked?.()) {
    out.push({ key: 'lock', cls: 'timed inv', html: '🎯<b>Erfasst</b>', title: 'Erfasst: du stehst still – Treffer kosten mehr, kein Notschild, Reparatur und Schild ruhen. Weiterfliegen!' });
  }
  if (p.bubble > 0) {
    const s = secs(p.bubble);
    out.push({ key: `bubble${s}`, cls: 'timed bubble', html: `🔮<b>${s}s</b>`, title: 'Schutzblase: schluckt alle Kugeln' });
  }
  // Notschild und Phönix geben 3 s Unverwundbarkeit; normale Treffer nur kurz (nicht anzeigen)
  if (p.invuln > 50) {
    const s = secs(p.invuln);
    out.push({ key: `inv${s}`, cls: 'timed inv', html: `✨<b>${s}s</b>`, title: 'Unverwundbar' });
  }
  if (sim.has('def2') && !p.emergencyUsed) out.push({ key: 'emg', cls: 'ready', html: '🆘', title: 'Notschild bereit (unter 25 % Hülle: 3 s unverwundbar)' });
  if (sim.has('def4') && !p.phoenixUsed) out.push({ key: 'phx', cls: 'ready', html: '🔥', title: 'Phönix bereit (einmal Wiederbelebung)' });
  if (sim.has('def3')) out.push({ key: 'nan', cls: 'ready', html: '🔧', title: 'Naniten: Hülle repariert sich' });
  // neuere Fähigkeiten: ältere Sim-Kerne (Wiedergabe) kennen sie nicht
  if (p.adren > 0) {
    const s = secs(p.adren);
    out.push({ key: `adr${s}`, cls: 'timed inv', html: `⚡<b>${s}s</b>`, title: 'Adrenalin: +20 % Feuerrate' });
  }
  if (sim.has('pil6') && p.bombs > 0 && !p.guardianUsed) out.push({ key: 'grd', cls: 'ready', html: '👼', title: 'Schutzengel bereit (tödlicher Treffer zündet eine Bombe)' });
  if ((sim.d.regen ?? 0) > 0 && !sim.has('def3')) out.push({ key: 'reg', cls: 'ready', html: '🩹', title: 'Reparaturdrohnen: Hülle repariert sich' });
  for (const slot of ['wingL3', 'wingL2', 'wingL', 'core', 'core2', 'core3', 'wingR', 'wingR2', 'wingR3'] as const) {
    const m = sim.loadout.slots[slot];
    if (!m) continue;
    out.push({
      key: `${slot}${m.w}${m.lvl}`,
      cls: m.lvl >= 5 ? 'weapon evo' : 'weapon',
      html: `<span class="ico">${ICON[m.w]}</span>${SHORT[m.w]}<b>${ROMAN[m.lvl]}</b>`,
      title: `${weaponName(m.w, m.lvl)} Stufe ${m.lvl}`,
    });
  }
  return out;
}

const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');
const pct = (m: number) => `+${Math.round((m - 1) * 100)} %`;

/** Schiffswerte für das Pausenmenü: Feuerkraft je Waffe und die wichtigsten Werte */
export function shipStats(sim: Sim): string {
  const p = sim.player;
  const d = sim.d;
  const fp = sim.firepower();
  const name = (id: PlayerWeapon, lvl: number) => (id === 'main' ? 'Bordkanone' : weaponName(id, lvl));
  const weapons = fp.parts
    .map((w) => `<tr><td>${name(w.id, w.lvl)} <small>${w.id === 'main' ? `P${w.lvl}` : `Stufe ${w.lvl}`}</small></td><td>${fmt(w.dps)}</td></tr>`)
    .join('');
  const rows: [string, string][] = [
    ['Hülle', `${Math.ceil(p.hull)} / ${d.maxHull}`],
    ['Schild', d.shieldMax > 0 ? `${Math.ceil(p.shield)} / ${d.shieldMax}` : '–'],
    ['Feuerrate', pct(d.fireMult)],
    ['Schaden', pct(d.dmgMult)],
    ['Tempo', `${Math.round(d.speed * 60)} km/s`],
    ['Sammelradius', `${d.magnet} m`],
    ['Bomben', `${p.bombs} / ${d.bombMax}`],
  ];
  const cls = sim.loadout.stats.cls ?? 0;
  if (cls > 0) rows.unshift(['Klasse', SHIP_CLASSES[Math.min(cls, SHIP_CLASSES.length - 1)].name]);
  if (d.dmgTaken < 1) rows.push(['Panzerung', `−${Math.round((1 - d.dmgTaken) * 100)} % Schaden`]);
  if (d.regen > 0) rows.push(['Reparatur', `${(d.regen * 60).toLocaleString('de-DE')} /s`]);
  if (d.critChance > 0) rows.push(['Krit-Chance', `${Math.round(d.critChance * 100)} % (×${d.critMult})`]);
  if (d.creditMult > 1) rows.push(['Credits', pct(d.creditMult)]);
  if (d.priceMult < 1) rows.push(['Händlerpreise', `−${Math.round((1 - d.priceMult) * 100)} %`]);
  return `<div class="ship-stats">
    <table class="dps-tab"><thead><tr><th>Feuerkraft</th><th>DPS</th></tr></thead><tbody>${weapons}</tbody>
      <tfoot><tr><td>Gesamt</td><td>${fmt(fp.total)}</td></tr></tfoot></table>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <p class="hint">DPS = Schaden pro Sekunde, wenn alle Schüsse treffen.</p>
  </div>`;
}
