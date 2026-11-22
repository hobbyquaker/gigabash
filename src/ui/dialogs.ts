// Dialoge über Start-/Pausemenü: Einstellungen (⚙️) und „Was ist neu?“.
// Eigene Ebene #dialog, das Menü darunter bleibt erhalten.
import { sfx } from '../audio/sfx';
import { settings, saveSettings, type Settings } from '../settings';
import { CHANGELOG, type ChangelogEntry } from '../changelog';
import { APP_COMMIT, APP_BUILD_DATE, VERSION_LABEL } from '../version';
import { settingsHooks } from './hooks';
import { fillLegalLinks, repoLink } from './legal';

const pct = (v: number) => `${Math.round(v * 100)} %`;

function onOff(on: boolean, act: string, disabled = false): string {
  return `<button class="btn2 sw ${on ? 'on' : ''}" data-set="${act}" aria-pressed="${on}" ${disabled ? 'disabled' : ''}>${on ? 'AN' : 'AUS'}</button>`;
}

function slider(act: string, value: number, min: number, max: number, step: number, label: string, disabled = false): string {
  return `<input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-set="${act}" aria-label="${label}" ${disabled ? 'disabled' : ''}>`;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return day && m && y ? `${day}.${m}.${y}` : d;
}

export class Dialogs {
  private el = document.getElementById('dialog')!;
  private onClose: (() => void) | null = null;
  private primary: (() => void) | null = null;
  /** wird nach Änderungen an „Tipps“ aufgerufen */
  onTips: (on: boolean, reset: boolean) => void = () => undefined;

  constructor() {
    this.el.addEventListener('click', (e) => this.click(e));
    this.el.addEventListener('input', (e) => this.input(e));
    this.el.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.set === 'sfxvol') sfx.play('click');
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  close() {
    if (!this.open) return;
    this.el.hidden = true;
    this.el.innerHTML = '';
    const cb = this.onClose;
    this.onClose = null;
    this.primary = null;
    cb?.();
  }

  /** Enter im Dialog: Hauptknopf */
  confirm() {
    const p = this.primary;
    if (p) p();
    else this.close();
  }

  private showHtml(html: string, onClose: (() => void) | null, primary: (() => void) | null) {
    this.el.innerHTML = html;
    this.el.hidden = false;
    this.onClose = onClose;
    this.primary = primary;
    const card = this.el.querySelector('.card') as HTMLElement | null;
    if (card) card.scrollTop = 0;
  }

  // ───────────── Einstellungen ─────────────

  openSettings(onClose: (() => void) | null = null) {
    this.showHtml(this.settingsHtml(), onClose, null);
    fillLegalLinks(this.el);
  }

  private settingsHtml(): string {
    const m = settingsHooks.music;
    const ctl = (v: Settings['control'], label: string) =>
      `<button class="seg-btn ${settings.control === v ? 'on' : ''}" data-set="control" data-v="${v}" aria-pressed="${settings.control === v}">${label}</button>`;
    const fx = (v: Settings['effects'], label: string) =>
      `<button class="seg-btn ${settings.effects === v ? 'on' : ''}" data-set="effects" data-v="${v}" aria-pressed="${settings.effects === v}">${label}</button>`;
    return `<div class="card dlg settings-dlg" role="dialog" aria-label="Einstellungen">
      <div class="dlg-head"><h2>⚙️ EINSTELLUNGEN</h2><button class="xbtn" data-set="close" aria-label="Schließen">✕</button></div>
      <h3>Ton</h3>
      <div class="set-row"><span class="lbl">Effekte</span>${onOff(!sfx.muted, 'sfx')}${slider('sfxvol', sfx.volume, 0, 1, 0.05, 'Effekt-Lautstärke')}<span class="num" id="v-sfxvol">${pct(sfx.volume)}</span></div>
      <div class="set-row ${m ? '' : 'na'}"><span class="lbl">Musik${m ? '' : '<small>folgt bald</small>'}</span>${onOff(m ? m.enabled : false, 'music', !m)}${slider('musvol', m ? m.volume : 0.5, 0, 1, 0.05, 'Musik-Lautstärke', !m)}<span class="num" id="v-musvol">${m ? pct(m.volume) : '–'}</span></div>
      <h3>Bild</h3>
      <div class="set-row"><span class="lbl">Bildschirmwackeln</span>${onOff(settings.shake, 'shake')}</div>
      <div class="set-row"><span class="lbl">Effektmenge</span><div class="seg">${fx('auto', 'Auto')}${fx('full', 'Voll')}${fx('low', 'Wenig')}</div></div>
      <h3>Steuerung</h3>
      <div class="set-row"><span class="lbl">Touch-Steuerung</span><div class="seg">${ctl('stick', 'Joystick')}${ctl('drag', 'Direkt ziehen')}</div></div>
      <div class="set-row ${settings.control === 'stick' ? 'na' : ''}"><span class="lbl">Touch-Empfindlichkeit${settings.control === 'stick' ? '<small>nur beim direkten Ziehen</small>' : ''}</span>${slider('sens', settings.sensitivity, 0.8, 2, 0.1, 'Touch-Empfindlichkeit')}<span class="num" id="v-sens">${settings.sensitivity.toFixed(1)}×</span></div>
      <div class="set-row"><span class="lbl">Tipps</span>${onOff(settings.tips, 'tips')}<button class="btn2 small" data-set="tipsreset">Erneut zeigen</button></div>
      <div class="dlg-ver"><span>${VERSION_LABEL} · ${APP_BUILD_DATE} · ${APP_COMMIT}<span class="legal-link" hidden></span> · ${repoLink()}</span><button class="btn2 small" data-set="news">Was ist neu?</button></div>
      <button class="big-btn" data-set="close">FERTIG</button>
    </div>`;
  }

  private rerender() {
    const card = this.el.querySelector('.card') as HTMLElement | null;
    const top = card?.scrollTop ?? 0;
    this.el.innerHTML = this.settingsHtml();
    const c2 = this.el.querySelector('.card') as HTMLElement | null;
    if (c2) c2.scrollTop = top;
    fillLegalLinks(this.el);
  }

  private click(e: Event) {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!btn || btn.disabled) {
      // Klick auf den abgedunkelten Hintergrund schließt
      if (e.target === this.el && !this.primary) this.close();
      return;
    }
    sfx.unlock();
    const m = settingsHooks.music;
    switch (btn.dataset.set) {
      case 'close':
        sfx.play('click');
        this.close();
        return;
      case 'primary':
        this.confirm();
        return;
      case 'sfx':
        sfx.setMuted(!sfx.muted);
        if (!sfx.muted) sfx.play('click');
        break;
      case 'music':
        m?.setEnabled(!m.enabled);
        break;
      case 'shake':
        settings.shake = !settings.shake;
        break;
      case 'control':
        settings.control = btn.dataset.v === 'drag' ? 'drag' : 'stick';
        document.documentElement.classList.toggle('stick', settings.control === 'stick');
        break;
      case 'effects':
        settings.effects = (btn.dataset.v as Settings['effects']) ?? 'auto';
        break;
      case 'tips':
        settings.tips = !settings.tips;
        this.onTips(settings.tips, false);
        break;
      case 'tipsreset':
        settings.tips = true;
        this.onTips(true, true);
        btn.textContent = 'Zurückgesetzt ✔';
        saveSettings();
        return;
      case 'news': {
        const back = this.onClose;
        this.onClose = null;
        this.openChangelog(CHANGELOG, 'ZURÜCK', () => this.openSettings(back));
        return;
      }
      default:
        return;
    }
    saveSettings();
    if (btn.dataset.set !== 'sfx') sfx.play('click');
    this.rerender();
  }

  private input(e: Event) {
    const t = e.target as HTMLInputElement;
    const v = Number(t.value);
    const show = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    switch (t.dataset.set) {
      case 'sfxvol':
        sfx.setVolume(v);
        show('v-sfxvol', pct(v));
        // setVolume > 0 hebt Stummschaltung auf: Schalter mitziehen
        this.el.querySelector('[data-set="sfx"]')?.replaceWith(this.fromHtml(onOff(!sfx.muted, 'sfx')));
        break;
      case 'musvol':
        settingsHooks.music?.setVolume(v);
        show('v-musvol', pct(v));
        break;
      case 'sens':
        settings.sensitivity = v;
        saveSettings();
        show('v-sens', `${v.toFixed(1)}×`);
        break;
    }
  }

  private fromHtml(html: string): Element {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstElementChild!;
  }

  // ───────────── Was ist neu? ─────────────

  /**
   * Zeigt Changelog-Einträge. `button` = Beschriftung des Hauptknopfs, `done` wird beim Schließen
   * (Knopf, Esc, Enter) aufgerufen.
   */
  openChangelog(entries: ChangelogEntry[], button: string, done: () => void, intro = '') {
    const list = entries
      .map((e) => `<section class="cl-entry"><h3>Version ${e.version} <small>${fmtDate(e.date)}</small></h3><ul>${e.items.map((i) => `<li>${i}</li>`).join('')}</ul></section>`)
      .join('');
    this.showHtml(`<div class="card dlg news-dlg" role="dialog" aria-label="Was ist neu?">
      <div class="dlg-head"><h2>WAS IST NEU?</h2></div>
      ${intro ? `<p class="cl-intro">${intro}</p>` : ''}
      <div class="cl-list">${list}</div>
      <button class="big-btn" data-set="primary">${button}</button>
    </div>`, done, () => this.close());
  }
}
