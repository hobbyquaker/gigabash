// DOM-Oberfläche: HUD, Start, Pause, Händler (Schiff, Waffen, Skills), Game Over.
import { GRAZE_FULL, KILLS_PER_POINT, MILESTONE_EVERY, type Sim } from './core/sim/sim';
import {
  BOMB_PRICE, BRANCHES, BRANCH_ICONS, BRANCH_NAMES, CORE_SLOTS, REPAIR_PER_HP, SHIP_CLASSES, SKILLS, SKILL_TIERS, SLOTS, SLOT_NAMES, STATS, WEAPONS,
  WEAPON_BY_ID, shipClass, slotAccepts, slotClass, weaponName,
  type SkillBranch, type SlotId, type StatId,
} from './core/data/shop';
import type { Command } from './core/sim/types';
import { themeFor } from './core/sector';
import { partMeta, type LoadedImage } from './assets/sprites';
import { classOf, shipLayout, spriteLvl } from './assets/shipLayout';
import type { GameScene } from './scenes/GameScene';
import { sfx } from './audio/sfx';
import { settings, loadBest, saveBest, loadName, saveName, cleanName, NAME_MAX, loadJson, saveJson } from './settings';
import { music } from './audio/music';
import { startRun, submitScore, fetchScores, isOnline, serverVersion, type RunTicket } from './net/api';
import { APP_VERSION, VERSION_LABEL } from './version';
import { CHANGELOG, entriesSince, latestVersion, compareVersions } from './changelog';
import { Dialogs } from './ui/dialogs';
import { Tutorial } from './ui/tutorial';
import { HomeScreenHint, enterFullscreen } from './ui/mobile';
import { fillLegalLinks, repoLink } from './ui/legal';
import { buffList, shipStats } from './ui/buffs';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STAT_ICONS: Record<StatId, string> = {
  armor: '🛡️', engine: '🚀', cooling: '❄️', caliber: '💥', shield: '🔰', magnet: '🧲', cannon: '⚡', rig: '↔️', overdrive: '☢️',
  regen: '🩹', plating: '🧱', bay: '💣', crit: '🎯', salvage: '💰', grazer: '✨', cls: '🚢',
};

/** Gruppen im Schiff-Tab (Reihenfolge der Karten) */
const STAT_GROUPS: { title: string; ids: StatId[] }[] = [
  { title: 'Schutz', ids: ['armor', 'regen', 'plating', 'shield'] },
  { title: 'Feuerkraft', ids: ['caliber', 'cooling', 'crit', 'cannon', 'overdrive'] },
  { title: 'Technik', ids: ['engine', 'magnet', 'salvage', 'bay', 'grazer'] },
  { title: 'Ausbau', ids: ['rig', 'cls'] },
];

type Tab = 'ship' | 'weapons' | 'skills';

function fmt(n: number): string {
  return Math.floor(n).toLocaleString('de-DE');
}

/** Tastendruck gehört einem Eingabefeld (Text tippen) → keine Hotkeys */
function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range';
}

const TABS: Tab[] = ['ship', 'weapons', 'skills'];
const VERSION_KEY = 'oganesson.version';
/** Häkchen „Alle Versionen“ unter der Bestenliste */
const BOARD_ALL_KEY = 'oganesson.boardAll';
/** nicht eingetragene Online-Partie (Sicherheitsnetz fürs Eintragen) */
const PENDING_KEY = 'oganesson.pending';
interface Pending {
  token: string;
  replay: ReturnType<Sim['replay']>;
  version: string;
  score: number;
  sector: number;
  at: number;
}
function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* egal */
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class UI {
  private scene!: GameScene;
  private img = new Map<string, string>();
  private cache: Record<string, string | number | boolean> = {};
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private tab: Tab = 'ship';
  private slot: SlotId = 'wingL';
  private branch: SkillBranch = 'off';
  private overlay = $('overlay');
  private mode: 'start' | 'pause' | 'shop' | 'over' | 'none' = 'start';
  private dialogs = new Dialogs();
  private tutorial = new Tutorial();
  private a2hs = new HomeScreenHint();

  constructor(images: LoadedImage[]) {
    for (const im of images) {
      if (/^(player|pod_|core_|ico_|drone|rig|pylon|hullgun|i_)/.test(im.key)) this.img.set(im.key, im.canvas.toDataURL());
    }
    $('ver').textContent = VERSION_LABEL;
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-bomb').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      this.scene.requestBomb();
    });
    // Pause, wenn der Tab den Fokus verliert
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause(true);
    });
    window.addEventListener('blur', () => this.pause(true));
    // Tastatur: Enter = Start/Weiter, im Händler 1/2/3 bzw. Q/E für die Reiter.
    // Esc/P kommen über die Scene (togglePause) und schließen dort auch Dialoge.
    document.addEventListener('keydown', (e) => {
      if (typing(e.target) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.dialogs.open) this.dialogs.confirm();
        else if (this.mode === 'shop') this.launch();
        else if (this.mode === 'start' || this.mode === 'over') this.requestStart();
        else if (this.mode === 'pause') this.pause(false);
        return;
      }
      if (this.mode !== 'shop' || this.dialogs.open || !this.scene?.sim) return;
      let i = TABS.indexOf(this.tab);
      if (e.code === 'Digit1' || e.code === 'Numpad1') i = 0;
      else if (e.code === 'Digit2' || e.code === 'Numpad2') i = 1;
      else if (e.code === 'Digit3' || e.code === 'Numpad3') i = 2;
      else if (e.code === 'KeyQ') i = (i + 2) % 3;
      else if (e.code === 'KeyE') i = (i + 1) % 3;
      else return;
      if (TABS[i] !== this.tab) {
        this.tab = TABS[i];
        sfx.play('click');
        this.renderShop(this.scene.sim);
      }
    });
    this.overlay.addEventListener('click', (e) => this.onClick(e));
    this.dialogs.onTips = (on, reset) => {
      if (reset) this.tutorial.reset();
      if (!on) this.tutorial.stop();
    };
  }

  attach(scene: GameScene) {
    this.scene = scene;
    this.showStart();
    this.newsOnOpen();
    void isOnline().then((on) => {
      if (!on) return;
      void this.checkUpdate();
      setInterval(() => void this.checkUpdate(), 5 * 60_000);
    });
  }

  /** neuere Version auf dem Server (nur online) */
  private newVersion: string | null = null;

  /** Server hat eine neuere Version: Aufkleber im Start-/Game-Over-Bildschirm (nie mitten im Spiel) */
  private async checkUpdate() {
    const v = await serverVersion();
    if (!v || compareVersions(v, APP_VERSION) <= 0) return;
    this.newVersion = v;
    $('ver').classList.add('new');
    const el = this.overlay.querySelector<HTMLElement>('.upd-sticker');
    if (el) {
      el.innerHTML = `Neue Version v${esc(v)} – <b>neu laden</b>`;
      el.hidden = false;
    }
  }

  /**
   * Seit dem letzten Besuch aktualisiert: gleich beim Öffnen zeigen, was neu ist.
   * Ganz neue Spieler (nichts gespeichert) sehen nichts; Version wird danach als gesehen gemerkt.
   */
  private newsOnOpen() {
    const seen = loadJson<string | null>(VERSION_KEY, null);
    const veteran = seen !== null || ['oganesson.best', 'oganesson.settings', 'oganesson.audio'].some((k) => loadJson<unknown>(k, null) !== null);
    const fresh = veteran ? entriesSince(seen) : [];
    const save = () => {
      const latest = latestVersion();
      saveJson(VERSION_KEY, compareVersions(APP_VERSION, latest) > 0 ? APP_VERSION : latest);
    };
    if (!fresh.length) return save();
    const intro = `Du spielst jetzt ${VERSION_LABEL}${seen ? ` (vorher v${esc(seen)})` : ''}.`;
    this.dialogs.openChangelog(fresh, 'WEITER ▶', save, intro);
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private set(id: string, key: string, value: string | number | boolean, apply: (el: HTMLElement) => void) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply($(id));
  }

  updateHud(sim: Sim | null) {
    if (!sim) return;
    // Musikstimmung folgt der Sim-Phase (setMood ignoriert Wiederholungen)
    if (sim.phase === 'boss') music.setMood('boss', sim.sector);
    else if (sim.phase === 'intro' || sim.phase === 'flight' || sim.phase === 'clear') music.setMood('flight', sim.sector);
    if (this.mode === 'none') this.tutorial.onHud(sim);
    const p = sim.player;
    this.set('h-score', 'score', sim.score, (el) => (el.textContent = fmt(sim.score)));
    this.set('h-credits', 'cr', sim.credits, (el) => (el.textContent = fmt(sim.credits)));
    this.set('h-sector', 'sector', sim.sector, (el) => (el.textContent = `SEKTOR ${sim.sector}`));
    this.set('h-gun', 'gun', p.gun, (el) => (el.innerHTML = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= p.gun ? 'on' : ''}"></i>`).join('')));
    const hull = Math.max(0, Math.ceil(p.hull));
    this.set('h-hull', 'hull', `${hull}/${sim.d.maxHull}`, (el) => {
      el.style.width = `${(100 * hull) / sim.d.maxHull}%`;
      el.parentElement!.classList.toggle('low', hull < sim.d.maxHull * 0.3);
      $('h-hull-t').textContent = `HÜLLE ${hull}/${sim.d.maxHull}`;
    });
    const sh = sim.d.shieldMax > 0 ? Math.round((100 * p.shield) / sim.d.shieldMax) : -1;
    this.set('h-shield', 'shield', sh, (el) => {
      $('shieldbar').style.visibility = sh < 0 ? 'hidden' : 'visible';
      el.style.width = `${Math.max(0, sh)}%`;
    });
    this.set('h-bombs', 'bombs', p.bombs, (el) => {
      el.innerHTML = `<i></i><b>×${p.bombs}</b><kbd>B</kbd>`;
      el.classList.toggle('empty', p.bombs <= 0);
      $('h-bomb-n').textContent = String(p.bombs);
      ($('btn-bomb') as HTMLButtonElement).disabled = p.bombs <= 0;
    });
    const gz = Math.round((100 * p.graze) / GRAZE_FULL);
    this.set('h-graze', 'graze', gz, (el) => (el.style.width = `${gz}%`));
    const fp = sim.firepower();
    this.set('h-dps', 'dps', Math.round(fp.total), (el) => (el.textContent = fmt(Math.round(fp.total))));
    const buffs = buffList(sim);
    this.set('h-buffs', 'buffs', buffs.map((b) => b.key).join('|'), (el) => {
      el.innerHTML = buffs.map((b) => `<span class="buff ${b.cls}" title="${esc(b.title)}">${b.html}</span>`).join('');
    });
    const boss = sim.boss;
    const bh = boss ? Math.round((1000 * boss.hp) / boss.maxHp) : -1;
    this.set('h-boss', 'boss', bh, (el) => {
      $('bossbar').hidden = bh < 0;
      if (bh >= 0) el.style.width = `${bh / 10}%`;
    });
  }

  banner(title: string, sub = '') {
    const el = $('banner');
    el.innerHTML = `<h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}`;
    el.classList.add('show');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ───────────────────────────── Overlays ─────────────────────────────

  private show(html: string, cls = '') {
    this.overlay.className = cls;
    this.overlay.innerHTML = html;
    this.overlay.hidden = false;
  }

  private hide() {
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
    this.mode = 'none';
  }

  showStart() {
    this.mode = 'start';
    $('hud').hidden = true;
    this.tutorial.clear();
    const best = loadBest();
    const touch = document.documentElement.classList.contains('touch');
    this.show(`<div class="card start-card">
      <button class="xbtn gear" data-act="settings" title="Einstellungen" aria-label="Einstellungen">⚙️</button>
      <div class="title"><h1>OGANESSON</h1><div class="giga">GIGABASH</div>
        <div class="sub">Weltraum-Shooter · Sektor für Sektor</div>
        <button class="ver-chip" data-act="news" title="Was ist neu?">${VERSION_LABEL} · Was ist neu?</button></div>
      <button class="upd-sticker" data-act="reload" ${this.newVersion ? '' : 'hidden'}>Neue Version ${this.newVersion ? `v${esc(this.newVersion)}` : ''} – <b>neu laden</b></button>
      <ul class="help">
        ${touch
          ? (settings.control === 'stick'
            ? '<li><b>Joystick</b>: Daumen irgendwo aufs Feld (am besten unten links) und schieben.</li><li><b>Bombe</b>: Knopf unten rechts.</li>'
            : '<li><b>Finger aufs Feld</b> und ziehen: das Schiff folgt deiner Bewegung.</li><li><b>Bombe</b>: Knopf unten rechts.</li>')
          : '<li><b>WASD / Pfeiltasten</b> oder Maus gedrückt halten und ziehen.</li><li><b>B / Leertaste</b>: Smartbombe · <b>P</b>: Pause</li>'}
        <li>Gefeuert wird automatisch. <b>P-Kapseln</b> verstärken die Bordkanone.</li>
        <li>Abschüsse und <b>◆ Kristalle</b> bringen Credits. Nach jedem Endgegner kaufst du beim <b>Händler</b> Waffen, Upgrades und Skills.</li>
      </ul>
      <div id="pending" hidden></div>
      <button class="big-btn" data-act="start">STARTEN ▶</button>
      ${best.score ? `<div class="best">Persönlicher Rekord: <b>${fmt(best.score)}</b> Punkte · Sektor <b>${best.sector}</b></div>` : ''}
      <div id="board" class="board"></div>
      <div class="card-ver">${VERSION_LABEL}<span class="legal-link" hidden></span> · ${repoLink()}</div>
    </div>`);
    this.a2hs.maybeShow();
    music.setPaused(false);
    music.setMood('menu');
    void this.renderBoard();
    void this.renderPending();
    fillLegalLinks();
  }

  /** Bestenliste vom Server in #board (offline bleibt der Platz leer und unsichtbar) */
  /** Bestenliste: alle Versionen mit derselben Spiellogik wie diese (sonst Vorgänger), per Häkchen „Alle Versionen“ */
  private async renderBoard(highlightId?: number) {
    if (highlightId !== undefined) this.boardHighlight = highlightId;
    const all = loadJson<boolean>(BOARD_ALL_KEY, false);
    const b = await fetchScores(10, all);
    const el = document.getElementById('board');
    if (!el || !(await isOnline())) return;
    // Ohne Haken keine Versionsangaben (nur der Hinweis, falls die Liste noch von der Vorversion stammt)
    const sub = b.all ? 'alle Versionen' : b.fallback ? '<small>(noch keine Einträge für diese Version – vorherige Spielversion)</small>' : '';
    const rows = b.scores.length
      ? `<ol>${b.scores
          .map((e, i) => `<li class="${e.id === this.boardHighlight ? 'me' : ''}"><span class="rk">${i + 1}.</span><span class="nm">${esc(e.name)}${b.all && e.sim ? ` <small class="ver" title="Sim-Version: gleiche Nummer = gleiche Spiellogik (v${esc(e.version)})">Sim ${e.sim}</small>` : ''}</span><span class="sc">${fmt(e.score)}</span><span class="sx">S${e.sector}</span>${e.replay ? `<a class="rp" href="replay#${e.id}" target="_blank" rel="noopener" title="Replay ansehen" aria-label="Replay von ${esc(e.name)} ansehen">▶</a>` : '<span class="rp"></span>'}</li>`)
          .join('')}</ol>`
      : '<p class="board-empty">Noch keine Einträge – sei die oder der Erste!</p>';
    el.innerHTML = `<h3>BESTENLISTE <span class="board-ver">${sub}</span></h3>${rows}
      <div class="board-foot"><label class="board-all"><input type="checkbox" data-board-all ${all ? 'checked' : ''}> Alle Versionen</label>
        <a class="board-replays" href="replay" target="_blank" rel="noopener">Replays</a></div>`;
    const cb = el.querySelector<HTMLInputElement>('[data-board-all]');
    cb?.addEventListener('change', () => {
      saveJson(BOARD_ALL_KEY, cb.checked);
      void this.renderBoard();
    });
  }

  /** zuletzt eingetragene Partie (Eintrags-Nummer) zum Hervorheben */
  private boardHighlight: number | undefined;

  togglePause() {
    // Esc/P: zuerst offene Dialoge schließen
    if (this.dialogs.open) {
      this.dialogs.close();
      return;
    }
    if (this.mode === 'pause') this.pause(false);
    else if (this.mode === 'none') this.pause(true);
  }

  pause(on: boolean) {
    const sim = this.scene?.sim;
    if (on) {
      if (this.mode !== 'none' || !sim || sim.phase === 'over' || sim.phase === 'shop') return;
      this.mode = 'pause';
      this.scene.paused = true;
      music.setPaused(true);
      this.tutorial.clear();
      this.show(`<div class="card pause-card"><div class="title"><h1>PAUSE</h1></div>
        ${shipStats(sim)}
        <button class="big-btn" data-act="resume">WEITER ▶</button>
        <div class="row"><button class="btn2" data-act="settings">⚙️ Einstellungen</button><button class="btn2" data-act="quit">Aufgeben</button></div>
        <div class="card-ver">${VERSION_LABEL}</div></div>`);
    } else if (this.mode === 'pause') {
      this.dialogs.close();
      this.hide();
      this.scene.paused = false;
      music.setPaused(false);
    }
  }

  /**
   * Klick auf Starten/Nochmal: Android ins Vollbild, dann ggf. „Was ist neu?“ (Einträge neuer als die
   * gespeicherte Version), erst nach dem Schließen speichern und starten.
   */
  private requestStart() {
    if (this.dialogs.open) return;
    sfx.unlock();
    enterFullscreen();
    this.a2hs.dismiss();
    const seen = loadJson<string | null>(VERSION_KEY, null);
    // Ganz neue Spieler (noch nie gespielt, nichts gespeichert) brauchen kein „Was ist neu?“ –
    // wer schon vor dem Changelog gespielt hat (Rekord/Einstellungen vorhanden), sieht alles.
    const veteran = seen !== null || ['oganesson.best', 'oganesson.settings', 'oganesson.audio'].some((k) => loadJson<unknown>(k, null) !== null);
    const fresh = veteran ? entriesSince(seen) : [];
    const done = () => {
      const latest = latestVersion();
      saveJson(VERSION_KEY, compareVersions(APP_VERSION, latest) > 0 ? APP_VERSION : latest);
      this.start();
    };
    if (fresh.length) this.dialogs.openChangelog(fresh, "LOS GEHT'S ▶", done);
    else done();
  }

  private ticket: RunTicket | null = null;
  private starting = false;

  private async start() {
    if (this.starting) return;
    this.starting = true;
    sfx.unlock();
    this.dialogs.close();
    // Online: signierter Spielstart mit Seed vom Server (für die Bestenliste); offline lokaler Seed
    this.ticket = await startRun().catch(() => null);
    this.starting = false;
    this.hide();
    $('hud').hidden = false;
    this.cache = {};
    this.tab = 'ship';
    const seed = this.ticket ? this.ticket.seed : (Math.random() * 4294967296) >>> 0;
    this.scene.startRun(seed);
  }

  showGameOver(sim: Sim) {
    this.mode = 'over';
    this.tutorial.clear();
    music.setPaused(false);
    music.setMood('over');
    this.overSim = sim;
    this.dialogs.close();
    const best = loadBest();
    const record = sim.score > best.score;
    if (record) saveBest({ score: sim.score, sector: sim.sector });
    const min = Math.floor(sim.tick / 3600);
    const sec = Math.floor(sim.tick / 60) % 60;
    this.show(`<div class="card">
      <div class="title go-title"><h1>GAME OVER</h1><div class="sub">Sektor ${sim.sector} · ${esc(themeFor(sim.sector).name)}</div></div>
      ${record ? '<div class="record">★ NEUER REKORD! ★</div>' : ''}
      <button class="upd-sticker" data-act="reload" ${this.newVersion ? '' : 'hidden'}>Neue Version ${this.newVersion ? `v${esc(this.newVersion)}` : ''} – <b>neu laden</b></button>
      <div class="stats">
        <span>Punkte</span><b>${fmt(sim.score)}</b>
        <span>Abschüsse</span><b>${fmt(sim.kills)}</b>
        <span>Credits verdient</span><b>◆ ${fmt(sim.totalCredits)}</b>
        <span>Flugzeit</span><b>${min}:${String(sec).padStart(2, '0')}</b>
        <span>Persönlicher Rekord</span><b>${fmt(Math.max(best.score, sim.score))}</b>
      </div>
      <label class="name-row"><span>Dein Name</span><input id="name" type="text" maxlength="${NAME_MAX}"
        autocomplete="nickname" autocapitalize="words" spellcheck="false" enterkeyhint="done" placeholder="für die Bestenliste" value="${esc(loadName())}"></label>
      ${this.savePending(sim)}${this.ticket && sim.score > 0 ? '<button class="btn2 submit-btn" data-act="submit">IN DIE BESTENLISTE EINTRAGEN</button><div id="submit-msg" class="submit-msg"></div>' : ''}
      <button class="big-btn" data-act="start">NOCHMAL ▶</button>
      <div id="board" class="board"></div>
    </div>`);
    this.bindNameField();
    void this.renderBoard();
  }

  private overSim: Sim | null = null;

  /** Ergebnis einsenden: der Server rechnet das Replay nach und trägt nur seine eigenen Werte ein */
  /**
   * Sicherheitsnetz: Online-Partie mit Punkten sofort auf dem Gerät merken. Klappt das Eintragen nicht
   * (Update, Funkloch, Tab zu), bietet der Startbildschirm „Eintrag nachholen“ an. Gibt '' zurück.
   */
  private savePending(sim: Sim): string {
    if (this.ticket && sim.score > 0) {
      saveJson(PENDING_KEY, { token: this.ticket.token, replay: sim.replay(), version: APP_VERSION, score: sim.score, sector: sim.sector, at: Date.now() } satisfies Pending);
    }
    return '';
  }

  /** gespeicherte, nicht eingetragene Partie nachreichen */
  private async submitPending(btn: HTMLButtonElement) {
    const pd = loadJson<Pending | null>(PENDING_KEY, null);
    const msg = document.getElementById('pending-msg');
    const inp = document.getElementById('pname') as HTMLInputElement | null;
    const name = cleanName(inp?.value ?? '');
    if (!pd || !msg) return;
    if (!name) {
      msg.textContent = 'Bitte einen Namen eingeben.';
      inp?.focus();
      return;
    }
    saveName(name);
    btn.disabled = true;
    msg.textContent = 'Wird geprüft …';
    const r = await submitScore(pd.token, name, pd.replay, pd.version);
    if (r.ok) {
      clearPending();
      btn.remove();
      msg.textContent = `Eingetragen: Platz ${r.rank} mit ${fmt(r.score ?? pd.score)} Punkten.`;
      sfx.play('clear');
      void this.renderBoard(r.id);
    } else {
      msg.textContent = r.error ?? 'Eintragen fehlgeschlagen.';
      btn.disabled = false;
      sfx.play('error');
    }
  }

  /** Karte „Eintrag nachholen“ im Startbildschirm (nur online und wenn eine Partie offen ist) */
  private async renderPending() {
    const el = document.getElementById('pending');
    const pd = loadJson<Pending | null>(PENDING_KEY, null);
    if (!el || !pd || !(await isOnline())) return;
    el.innerHTML = `<div class="pending-card"><b>Nicht eingetragene Partie:</b> ${fmt(pd.score)} Punkte · Sektor ${pd.sector}
      <div class="name-row"><input id="pname" maxlength="${NAME_MAX}" value="${esc(loadName())}" placeholder="Dein Name" autocomplete="nickname"></div>
      <div class="row"><button class="btn2" data-act="pending">JETZT EINTRAGEN</button><button class="btn2 small" data-act="pending-drop">Verwerfen</button></div>
      <div id="pending-msg" class="submit-msg"></div></div>`;
    el.hidden = false;
  }

  private async submit(btn: HTMLButtonElement) {
    const sim = this.overSim;
    const t = this.ticket;
    const msg = document.getElementById('submit-msg');
    const inp = document.getElementById('name') as HTMLInputElement | null;
    const name = cleanName(inp?.value ?? '');
    if (!sim || !t || !msg) return;
    if (!name) {
      msg.textContent = 'Bitte einen Namen eingeben.';
      inp?.focus();
      return;
    }
    saveName(name);
    btn.disabled = true;
    msg.textContent = 'Wird geprüft …';
    const r = await submitScore(t.token, name, sim.replay());
    if (r.ok) {
      this.ticket = null;
      clearPending();
      btn.remove();
      msg.textContent = `Eingetragen: Platz ${r.rank} mit ${fmt(r.score ?? sim.score)} Punkten.`;
      sfx.play('clear');
      void this.renderBoard(r.id);
    } else {
      msg.textContent = r.error ?? 'Eintragen fehlgeschlagen.';
      btn.disabled = false;
      sfx.play('error');
    }
  }

  /** Namensfeld (1–16 Zeichen, in localStorage oganesson.name). Absenden an die Bestenliste folgt beim Merge. */
  private bindNameField() {
    const inp = document.getElementById('name') as HTMLInputElement | null;
    if (!inp) return;
    const kb = this.scene?.input?.keyboard;
    inp.addEventListener('focus', () => kb?.disableGlobalCapture());
    inp.addEventListener('blur', () => {
      kb?.enableGlobalCapture();
      saveName(inp.value);
      inp.value = loadName();
    });
    inp.addEventListener('input', () => saveName(inp.value));
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') inp.blur();
    });
  }

  // ───────────────────────────── Händler ─────────────────────────────

  openShop(sim: Sim) {
    this.mode = 'shop';
    music.setMood('shop');
    $('hud').hidden = true;
    $('banner').classList.remove('show');
    this.dialogs.close();
    this.renderShop(sim);
    this.tutorial.onShop(sim);
  }

  private launch() {
    this.tutorial.stop();
    this.hide();
    $('hud').hidden = false;
    this.scene.launch();
  }

  private renderShop(sim: Sim) {
    const s = sim.lastSummary;
    const sp = sim.skillPoints;
    const keepScroll = (this.overlay.querySelector('.shop-body') as HTMLElement | null)?.scrollTop ?? 0;
    const body = this.tab === 'ship' ? this.shipTab(sim) : this.tab === 'weapons' ? this.weaponsTab(sim) : this.skillsTab(sim);
    this.show(`<div class="shop">
      <div class="shop-head"><h2>HÄNDLER</h2><div class="pill credits"><span class="cr">◆</span><b>${fmt(sim.credits)}</b></div></div>
      ${s ? `<div class="summary"><span>Sektor <b>${s.sector}</b> geschafft</span><span>Abschüsse <b>${s.kills}</b></span><span>Credits <b>+${fmt(s.credits)}</b></span><span>Bonus <b>+${fmt(s.bonus)}</b></span>${s.prize ? `<span>Prämie <b>◆ ${fmt(s.prize)}</b></span>` : ''}${s.repaired ? `<span>Feldwerkstatt <b>+${s.repaired} Hülle</b></span>` : ''}${s.noHit ? '<span class="nohit">★ Ohne Treffer: +1 Skillpunkt</span>' : ''}${s.milestone ? '<span class="nohit">★ Meilenstein: +1 Skillpunkt</span>' : ''}${s.killPoints ? `<span class="nohit">★ Abschuss-Marke: +${s.killPoints} Skillpunkt${s.killPoints > 1 ? 'e' : ''}</span>` : ''}</div>` : ''}
      <div class="tabs">
        <button data-tab="ship" class="${this.tab === 'ship' ? 'on' : ''}">Schiff</button>
        <button data-tab="weapons" class="${this.tab === 'weapons' ? 'on' : ''}">Waffen</button>
        <button data-tab="skills" class="${this.tab === 'skills' ? 'on' : ''}">Skills${sp > 0 ? `<span class="badge">${sp}</span>` : ''}</button>
      </div>
      <div class="shop-body">${body}</div>
      <div class="shop-foot"><button class="big-btn" data-act="launch">SEKTOR ${sim.sector + 1} STARTEN ▶</button></div>
    </div>`, 'shop');
    const b = this.overlay.querySelector('.shop-body') as HTMLElement;
    b.scrollTop = keepScroll;
  }

  private buyBtn(price: number | null, cmd: Command, credits: number, label = ''): string {
    if (price === null) return `<button class="buy max" disabled>MAX</button>`;
    const data = esc(JSON.stringify(cmd));
    return `<button class="buy" data-cmd="${data}" ${price > credits ? 'disabled' : ''}>${label}◆ ${fmt(price)}</button>`;
  }

  private shipTab(sim: Sim): string {
    const st = sim.loadout.stats;
    const card = (id: StatId) => {
      const def = STATS.find((d) => d.id === id)!;
      const lvl = st[def.id];
      const price = sim.statPrice(def.id);
      const lock = sim.statLock(def.id);
      // Schiffsklasse: nächste Klasse mit ihren Vorzügen beschreiben
      const next = def.id === 'cls' && lvl < def.max ? SHIP_CLASSES[lvl + 1] : null;
      const desc = next ? `<b>${next.name}</b>: ${next.desc}` : def.desc;
      const buy = lock && price !== null
        ? `<button class="buy max" disabled>🔒 ${lock}</button>`
        : this.buyBtn(price, { t: 'stat', id: def.id }, sim.credits);
      return `<div class="item${def.id === 'cls' ? ' wide' : ''}">
        <div class="name"><span class="ico">${STAT_ICONS[def.id]}</span>${def.name}</div>
        ${def.max > 10 ? `<div class="val">Stufe ${lvl}</div>` : `<div class="lvl">${Array.from({ length: def.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`}
        <div class="desc">${desc}</div>
        <div class="val">${def.show(lvl)}${lvl < def.max ? ` → ${def.show(lvl + 1)}` : ''}</div>
        ${buy}
      </div>`;
    };
    const p = sim.player;
    const rp = sim.repairPrice();
    const service = `<div class="item">
      <div class="name"><span class="ico">🔧</span>Reparatur</div>
      <div class="desc">Hülle wieder voll machen (${REPAIR_PER_HP} ◆ pro Punkt, Teilreparatur möglich).</div>
      <div class="val">Hülle ${Math.ceil(p.hull)}/${sim.d.maxHull}</div>
      ${rp <= 0 ? '<button class="buy max" disabled>VOLL</button>' : `<button class="buy" data-cmd='{"t":"repair"}' ${sim.credits < REPAIR_PER_HP ? 'disabled' : ''}>◆ ${fmt(rp)}</button>`}
    </div><div class="item">
      <div class="name"><span class="ico"><img src="${this.img.get('i_bomb')}" alt=""></span>Smartbombe</div>
      <div class="desc">Löscht alle Kugeln, trifft alle Gegner im Bild.</div>
      <div class="val">Vorrat ${p.bombs}/${sim.d.bombMax}</div>
      ${p.bombs >= sim.d.bombMax ? '<button class="buy max" disabled>VOLL</button>' : this.buyBtn(sim.price(BOMB_PRICE), { t: 'bomb' }, sim.credits)}
    </div>`;
    const groups = STAT_GROUPS.map((g) => `<h3 class="grp">${g.title}</h3><div class="grid">${g.ids.map(card).join('')}</div>`).join('');
    return `<div class="grid">${service}</div>${groups}`;
  }

  private weaponsTab(sim: Sim): string {
    const slots = sim.loadout.slots;
    const rig = sim.loadout.stats.rig;
    const cls = classOf(sim.loadout);
    if (!sim.slotOpen(this.slot)) this.slot = 'wingL';
    // Knöpfe der Steckplätze: Flügel in zwei Spalten, Rumpf-Plätze in der Mitte unten
    const big = rig >= 2 || cls >= 1;
    const pos: Record<SlotId, [number, number]> = big
      ? { wingL3: [15, 12], wingR3: [85, 12], wingL2: [15, 34], wingR2: [85, 34], wingL: [15, 56], wingR: [85, 56], core: [50, 86], core2: [17, 86], core3: [83, 86] }
      : { wingL3: [17, 17], wingR3: [83, 17], wingL2: [17, 17], wingR2: [83, 17], wingL: [17, 72], wingR: [83, 72], core: [50, 90], core2: [50, 90], core3: [50, 90] };
    // Schiff aus denselben Teilen wie im Spiel (Ausleger, Träger, Pods je Stufe, Rumpf-Aufsatz, Bordkanone)
    // großes Schiff: zwischen die Knopfspalten einpassen (halbe Breite = äußerster Pod der Stufe 5)
    const half = (rig >= 2 ? 138 : rig === 1 ? 94 : 48) + shipClass(cls).wingShift + 30;
    const k = big ? Math.min(1.2, 128 / half) : rig === 1 ? 1.3 : 1.6;
    let view = '';
    for (const part of shipLayout(sim.loadout, sim.d.startGun)) {
      const m = partMeta(part.key);
      const src = this.img.get(part.key);
      if (!m || !src) continue;
      const tx = ((part.flip ? m.w - m.ax : m.ax) / m.w) * 100;
      const ty = (m.ay / m.h) * 100;
      const ps = k * (part.scale ?? 1);
      view += `<img src="${src}" style="left:calc(50% + var(--u) * ${+(part.x * k).toFixed(1)});top:calc(${big ? 36 : 44}% + var(--u) * ${+(part.y * k).toFixed(1)});`
        + `width:calc(var(--u) * ${+(m.w * ps).toFixed(1)});height:calc(var(--u) * ${+(m.h * ps).toFixed(1)});`
        + `transform:translate(-${tx.toFixed(1)}%,-${ty.toFixed(1)}%)${part.flip ? ' scaleX(-1)' : ''}" alt="">`;
    }
    for (const sl of SLOTS) {
      const m = slots[sl];
      const [x, y] = pos[sl];
      if (!sim.slotOpen(sl)) {
        // gesperrte Plätze nur zeigen, wenn sie der nächste Ausbauschritt sind (Ausleger 1 → 2, Kreuzer → Schlachtschiff)
        const needRig = sl === 'wingL2' || sl === 'wingR2' ? 1 : sl === 'wingL3' || sl === 'wingR3' ? 2 : 0;
        const show = needRig ? rig === needRig - 1 && (needRig === 1 || big) : cls >= 1 && slotClass(sl) === cls + 1;
        if (show) view += `<button class="slot-btn locked" data-tab="ship" style="left:${x}%;top:${y}%">🔒 ${SLOT_NAMES[sl]}<small>${needRig ? 'Ausleger' : SHIP_CLASSES[slotClass(sl)].name} im Schiff-Tab</small></button>`;
        continue;
      }
      view += `<button class="slot-btn ${this.slot === sl ? 'on' : ''}" data-slot="${sl}" style="left:${x}%;top:${y}%">${SLOT_NAMES[sl]}<small>${m ? `${weaponName(m.w, m.lvl)} ${'★'.repeat(m.lvl)}` : 'leer'}</small></button>`;
    }
    const cur = slots[this.slot];
    let mounted = '';
    if (cur) {
      const def = WEAPON_BY_ID[cur.w];
      mounted = `<div class="mounted"><div class="item cur">
        <div class="name"><span class="ico"><img src="${this.img.get(CORE_SLOTS.includes(this.slot) ? `ico_core_${cur.w}_${spriteLvl(cur.lvl)}` : `pod_${cur.w}_${spriteLvl(cur.lvl)}`)}" alt=""></span>${weaponName(cur.w, cur.lvl)}${cur.lvl >= 5 ? ' <small class="evo">EVOLUTION</small>' : ''}</div>
        <div class="lvl">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= cur.lvl ? 'on' : ''}${i === 5 ? ' evo' : ''}"></i>`).join('')}</div>
        <div class="desc">${cur.lvl >= 5 ? def.evoDesc : def.desc}</div>
        ${cur.lvl === 3 ? `<div class="val">Stufe 4: ${def.lvl4}</div>` : cur.lvl === 4 ? `<div class="val evo-next">Evolution → <b>${def.evo}</b>: ${def.evoDesc}</div>` : ''}
        <div class="row">
          ${this.buyBtn(sim.upgradePrice(this.slot), { t: 'upgrade', slot: this.slot }, sim.credits, (cur.lvl === 4 ? 'Evolution ' : 'Stufe ' + Math.min(5, cur.lvl + 1) + ' '))}
          <button class="buy sell" data-cmd='${JSON.stringify({ t: 'sell', slot: this.slot })}'>Verkaufen +${fmt(sim.sellValue(this.slot))}</button>
        </div>
      </div></div>`;
    }
    const refund = sim.sellValue(this.slot);
    const list = WEAPONS.filter((w) => slotAccepts(this.slot, w.id) && w.id !== cur?.w).map((w) => {
      const price = sim.price(w.price);
      const net = price - refund;
      const key = w.place === 'core' ? `ico_core_${w.id}_1` : `pod_${w.id}_1`;
      return `<div class="item">
        <div class="name"><span class="ico"><img src="${this.img.get(key)}" alt=""></span>${w.name}</div>
        <div class="desc">${w.desc}</div>
        ${cur ? `<div class="val">Tausch: ${def(cur.w)} wird verkauft (+${fmt(refund)})</div>` : ''}
        <button class="buy" data-cmd='${JSON.stringify({ t: 'weapon', slot: this.slot, w: w.id })}' ${net > sim.credits ? 'disabled' : ''}>◆ ${fmt(price)}</button>
      </div>`;
    });
    return `<div class="ship-view${big ? ' big' : ''}">${view}</div>${mounted}<div class="grid">${list.join('')}</div>`;
  }

  /**
   * Skillbaum: fünf Äste mit je sechs Stufen. Oben die Übersicht (ein Knopf je Ast mit Fortschritt – leuchtet,
   * wenn dort ein Skill frei ist), darunter der gewählte Ast als Kette großer, gut lesbarer Karten (Handy!).
   */
  private skillsTab(sim: Sim): string {
    const state = (id: (typeof SKILLS)[number]['id']) => (sim.has(id) ? 'owned' : sim.canSkill(id) ? 'avail' : 'locked');
    const total = sim.loadout.skills.length;
    const chips = BRANCHES.map((b) => {
      const list = SKILLS.filter((s) => s.branch === b);
      const pips = list.map((s) => `<i class="${state(s.id)}"></i>`).join('');
      const open = list.some((s) => state(s.id) === 'avail');
      return `<button class="br-chip ${this.branch === b ? 'on' : ''} ${open ? 'open' : ''}" data-branch="${b}"><span class="ico">${BRANCH_ICONS[b]}</span><span class="nm">${BRANCH_NAMES[b]}</span><span class="pips">${pips}</span></button>`;
    }).join('');
    const nodes = SKILLS.filter((s) => s.branch === this.branch).map((s) => {
      const cls = state(s.id);
      return `<button class="node ${cls}" ${cls === 'avail' ? `data-cmd='${JSON.stringify({ t: 'skill', id: s.id })}'` : 'disabled'}>
        <span class="tier">${cls === 'owned' ? '✔' : s.tier}</span><span class="txt"><b>${s.name}</b><small>${s.desc}</small></span>${cls === 'avail' ? '<span class="get">LERNEN</span>' : ''}</button>`;
    }).join('');
    return `<div class="sp-info">Skillpunkte: <b>${sim.skillPoints}</b> · gelernt <b>${total}</b>/${BRANCHES.length * SKILL_TIERS}<br>
      <small>+1 je Sektor · +1 ohne Treffer · +1 in jedem ${MILESTONE_EVERY}. Sektor · +1 je ${KILLS_PER_POINT} Abschüsse (${sim.kills % KILLS_PER_POINT}/${KILLS_PER_POINT})</small></div>
      <div class="br-chips">${chips}</div>
      <div class="branch"><h3>${BRANCH_ICONS[this.branch]} ${BRANCH_NAMES[this.branch]}</h3>${nodes}</div>`;
  }

  // ───────────────────────────── Klicks ─────────────────────────────

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const btn = t.closest('button') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    sfx.unlock();
    const sim = this.scene.sim;
    if (btn.dataset.act) {
      switch (btn.dataset.act) {
        case 'start':
          this.requestStart();
          return;
        case 'settings':
          sfx.play('click');
          this.dialogs.openSettings();
          return;
        case 'pending':
          void this.submitPending(btn);
          return;
        case 'pending-drop':
          clearPending();
          document.getElementById('pending')?.remove();
          return;
        case 'news':
          sfx.play('click');
          this.dialogs.openChangelog(CHANGELOG, 'ZURÜCK', () => {});
          return;
        case 'reload':
          location.reload();
          return;
        case 'submit':
          void this.submit(btn);
          return;
        case 'resume':
          this.pause(false);
          return;
        case 'quit':
          this.scene.paused = false;
          this.hide();
          if (sim) this.showGameOver(sim);
          return;
        case 'launch':
          sfx.play('click');
          this.launch();
          return;
      }
    }
    if (!sim) return;
    if (btn.dataset.tab) {
      this.tab = btn.dataset.tab as Tab;
      sfx.play('click');
      this.renderShop(sim);
      return;
    }
    if (btn.dataset.branch) {
      this.branch = btn.dataset.branch as SkillBranch;
      sfx.play('click');
      this.renderShop(sim);
      return;
    }
    if (btn.dataset.slot) {
      this.slot = btn.dataset.slot as SlotId;
      sfx.play('click');
      this.renderShop(sim);
      return;
    }
    if (btn.dataset.cmd) {
      const cmd = JSON.parse(btn.dataset.cmd) as Command;
      if (sim.command(cmd)) {
        sfx.play(cmd.t === 'sell' ? 'coin' : 'buy');
        sim.drain();
      } else sfx.play('error');
      this.renderShop(sim);
    }
  }
}

function def(w: string): string {
  return WEAPON_BY_ID[w as keyof typeof WEAPON_BY_ID]?.name ?? w;
}
