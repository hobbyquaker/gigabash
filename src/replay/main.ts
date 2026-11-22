/**
 * Wiedergabeseite (/replay): Liste der Bestenlisten-Einträge, Wiedergabe einer Partie mit dem echten
 * Renderer (ReplayScene ⊂ GameScene), Tempo, Zeitleiste mit Scrubben über Schlüsselbilder, Kennzahlen
 * der Partie und Gesamtstatistik. Eigener Vite-Einstieg (replay.html → dist/replay.html), damit das
 * Spiel-Bundle nicht um die eingefrorenen Sim-Kerne älterer Versionen wächst. Ohne Ton.
 *
 * Adressen: replay#<Eintrags-Nr.> spielt eine Partie ab, replay#stats zeigt die Statistik.
 */
import '@fontsource/russo-one/latin-400.css';
import '@fontsource/exo-2/latin-400.css';
import '@fontsource/exo-2/latin-700.css';
import './style.css';
import Phaser from 'phaser';
import { WIDTH, HEIGHT, TICK_RATE } from '../core/config';
import { SKILL_BY_ID, STAT_BY_ID, WEAPON_BY_ID } from '../core/data/shop';
import { loadImages } from '../assets/sprites';
import type { Sim } from '../core/sim/sim';
import { APP_VERSION } from '../version';
import { ReplayScene } from './ReplayScene';
import { ReplayPlayer, type BufferInfo, type ShopView } from './player';
import { whyUnplayable } from './cores';
import { ApiError, fetchReplay, fetchReplays, fetchStats, isOnline, type ReplayDetail, type ReplayEntry, type ReplayList, type StatsReport } from './api';
import type { GameStats, Mark } from './analysis';
import { barChart, bindTips, columnChart, esc, fmtInt, fmtShort, fmtTime, hideTip, lineChart } from './charts';

const SPEEDS = [0.5, 1, 2, 4, 8];
const PAGE = 50;
const fmtDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const main = $('rp-main');
const tabs = $('rp-tabs');
$('rp-ver').textContent = `v${APP_VERSION}`;
bindTips(document.body);

// ---------------------------------------------------------------- Ansichten

const viewList = document.createElement('section');
viewList.id = 'view-list';
const viewPlay = document.createElement('section');
viewPlay.id = 'view-play';
viewPlay.hidden = true;
const viewStats = document.createElement('section');
viewStats.id = 'view-stats';
viewStats.hidden = true;
main.append(viewList, viewPlay, viewStats);

type View = 'list' | 'play' | 'stats';
let view: View = 'list';
let game: Phaser.Game | null = null;

function showView(v: View) {
  view = v;
  viewList.hidden = v !== 'list';
  viewPlay.hidden = v !== 'play';
  viewStats.hidden = v !== 'stats';
  hideTip();
  for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === (v === 'play' ? 'list' : v));
  if (game) {
    if (v === 'play') {
      game.loop.wake();
      requestAnimationFrame(fitField);
    } else game.loop.sleep();
  }
}

tabs.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b) location.hash = b.dataset.tab === 'stats' ? '#stats' : '#list';
});

// ---------------------------------------------------------------- Liste

const filter = { version: APP_VERSION, sort: 'score', dir: 'desc' as 'asc' | 'desc', offset: 0 };
const SORTABLE: Record<string, string> = { score: 'Punkte', sector: 'Sektor', date: 'Datum' };
let listSeq = 0;
let lastList: ReplayList | null = null;

viewList.innerHTML = `
  <div class="card">
    <h2>Replays der Bestenliste</h2>
    <div class="filters">
      <label>Version <select id="f-ver"><option value="${esc(APP_VERSION)}">v${esc(APP_VERSION)}</option><option value="all">alle Versionen</option></select></label>
      <span class="count" id="f-count"> </span>
    </div>
    <div class="tbl-wrap"><table class="list">
      <thead><tr><th class="num">#</th><th>Name</th><th class="num" data-sort="score">Punkte</th><th class="num" data-sort="sector">Sektor</th>
        <th class="num c-kills">Abschüsse</th><th class="num c-time">Spielzeit</th><th class="c-ver">Version</th><th data-sort="date">Datum</th><th></th></tr></thead>
      <tbody id="f-rows"></tbody>
    </table></div>
    <div class="pager" id="f-pager" hidden><button class="btn" id="f-prev" aria-label="vorige Seite">◀</button><span id="f-page"> </span><button class="btn" id="f-next" aria-label="nächste Seite">▶</button></div>
    <p class="note">Ein Klick auf eine Zeile spielt die Partie ab – mit dem Spielstand der Version, in der sie gespielt wurde. Klick auf Punkte, Sektor oder Datum sortiert
      (nochmal: umgekehrt). Der Platz zählt nach Punkten innerhalb der gewählten Version.</p>
  </div>`;

function rowHtml(e: ReplayEntry): string {
  const why = !e.hasReplay ? 'ohne Aufzeichnung' : e.playable ? whyUnplayable(e.version) : 'nicht abspielbar';
  const ok = !why;
  return `<tr class="${ok ? 'play' : 'off'}" data-id="${e.id}" ${ok ? 'tabindex="0"' : ''} title="${ok ? 'Wiedergabe starten' : esc(why)}">
    <td class="num">${e.rank}</td><td class="nm">${esc(e.name)}${lastList?.all ? `<small>v${esc(e.version)}</small>` : ''}</td><td class="num sc">${fmtInt(e.score)}</td><td class="num">${e.sector}</td>
    <td class="num c-kills">${fmtInt(e.kills)}</td><td class="num c-time">${fmtTime(e.ticks / TICK_RATE)}</td><td class="c-ver">v${esc(e.version)}</td><td>${fmtDate(e.date)}</td>
    <td class="go">${ok ? '▶' : `<span class="badge">${esc(why)}</span>`}</td></tr>`;
}

async function loadList() {
  const seq = ++listSeq;
  const rows = $('f-rows');
  const count = $('f-count');
  count.textContent = 'lädt …';
  try {
    const r = await fetchReplays({ version: filter.version, sort: filter.sort, dir: filter.dir, limit: PAGE, offset: filter.offset });
    if (seq !== listSeq) return;
    lastList = r;
    // Versionsauswahl aus dem, was es gibt (neueste zuerst); die gezeigte Version kann ein Vorgänger sein
    const shown = r.all ? 'all' : r.version ?? filter.version;
    filter.version = shown;
    const sel = $<HTMLSelectElement>('f-ver');
    const vers = r.versions.some((v) => v.version === r.current) ? r.versions : [{ version: r.current, n: 0 }, ...r.versions];
    sel.innerHTML = vers.map((v) => `<option value="${esc(v.version)}">v${esc(v.label ?? v.version)} (${v.n})</option>`).join('') +
      `<option value="all">alle Versionen (${r.versions.reduce((n, v) => n + v.n, 0)})</option>`;
    sel.value = shown;
    for (const th of viewList.querySelectorAll<HTMLElement>('th[data-sort]')) {
      const on = th.dataset.sort === r.sort;
      th.textContent = SORTABLE[th.dataset.sort!] + (on ? (r.dir === 'asc' ? ' ▲' : ' ▼') : '');
      th.setAttribute('aria-sort', on ? (r.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    }
    rows.innerHTML = r.replays.length ? r.replays.map(rowHtml).join('') : '<tr class="none"><td colspan="9">Noch keine Einträge.</td></tr>';
    count.textContent = `${r.total} ${r.total === 1 ? 'Eintrag' : 'Einträge'}${r.fallback ? ` · für v${r.current} gibt es noch keine` : ''}`;
    $('f-pager').hidden = r.total <= PAGE;
    $('f-page').textContent = `${r.offset + 1}–${r.offset + r.replays.length} von ${r.total}`;
    $<HTMLButtonElement>('f-prev').disabled = r.offset <= 0;
    $<HTMLButtonElement>('f-next').disabled = r.offset + r.replays.length >= r.total;
  } catch (err) {
    if (seq !== listSeq) return;
    rows.innerHTML = '';
    count.textContent = err instanceof ApiError ? err.message : 'Fehler beim Laden.';
  }
}

function setupList() {
  $<HTMLSelectElement>('f-ver').addEventListener('change', (e) => {
    filter.version = (e.target as HTMLSelectElement).value;
    filter.offset = 0;
    void loadList();
  });
  viewList.querySelector('thead')!.addEventListener('click', (e) => {
    const th = (e.target as HTMLElement).closest<HTMLElement>('th[data-sort]');
    if (!th) return;
    if (filter.sort === th.dataset.sort) filter.dir = filter.dir === 'desc' ? 'asc' : 'desc';
    else {
      filter.sort = th.dataset.sort!;
      filter.dir = 'desc';
    }
    filter.offset = 0;
    void loadList();
  });
  const open = (e: Event) => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr.play');
    if (tr) location.hash = `#${tr.dataset.id}`;
  };
  $('f-rows').addEventListener('click', open);
  $('f-rows').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(e);
    }
  });
  $('f-prev').addEventListener('click', () => {
    filter.offset = Math.max(0, filter.offset - PAGE);
    void loadList();
  });
  $('f-next').addEventListener('click', () => {
    filter.offset += PAGE;
    void loadList();
  });
}

// ---------------------------------------------------------------- Wiedergabe

viewPlay.innerHTML = `
  <div class="play-grid">
    <div class="stage">
      <div class="play-head"><a class="btn back" href="#list" aria-label="zurück zur Liste">◀ Liste</a><div id="p-title"></div></div>
      <div id="field">
        <div id="game"></div>
        <div id="hud" hidden>
          <div class="hud-top"><span class="pill" title="Punkte"><b id="h-score">0</b></span><span class="pill" title="Credits"><i class="cr">◆</i><b id="h-credits">0</b></span><span class="pill sec" id="h-sector">SEKTOR 1</span></div>
          <div id="bossbar" hidden><span>ENDGEGNER</span><div class="track"><i id="h-boss"></i></div></div>
          <div class="hud-bottom"><div class="bars2"><div class="hbar hull"><i id="h-hull"></i><span id="h-hull-t"></span></div><div class="hbar shield" id="shieldbar"><i id="h-shield"></i></div></div>
            <span class="pill bombs" title="Smartbomben">✹ <b id="h-bombs">0</b></span></div>
        </div>
        <div id="banner"></div>
        <div id="shop" hidden></div>
        <div id="endcard" hidden></div>
        <div id="busy" hidden></div>
      </div>
      <div id="ctl">
        <div class="tl-row"><span id="t-now">0:00</span>
          <div id="tl" role="slider" tabindex="0" aria-label="Zeitleiste" aria-valuemin="0"><div class="tl-track"><i id="tl-buf"></i><i id="tl-pos"></i><div id="tl-marks"></div></div><b id="tl-knob"></b></div>
          <span id="t-total">0:00</span></div>
        <div class="btn-row">
          <button class="btn" id="c-prev" title="voriger Sektor [↑]" aria-label="voriger Sektor">⏮</button>
          <button class="btn main" id="c-play" title="Wiedergabe/Pause [Leertaste]" aria-label="Wiedergabe oder Pause">❚❚</button>
          <button class="btn" id="c-next" title="nächster Sektor [↓]" aria-label="nächster Sektor">⏭</button>
          <button class="btn" id="c-boss" title="zum nächsten Endgegner [B]">Endgegner ▸</button>
          <div class="speeds" id="c-speeds" role="group" aria-label="Tempo">${SPEEDS.map((s) => `<button class="btn" data-speed="${s}">${String(s).replace('.', ',')}×</button>`).join('')}</div>
        </div>
      </div>
    </div>
    <aside id="facts"></aside>
  </div>`;

let scene: ReplayScene | null = null;
let player: ReplayPlayer | null = null;
let entry: ReplayDetail | null = null;
let playSeq = 0;
/** Abspielposition in die Verlaufsdiagramme einzeichnen */
let chartPos: ((t: number) => void)[] = [];
let scrubbing = false;
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
const hudCache: Record<string, string | number> = {};

function hudSet(id: string, value: string | number, apply: (el: HTMLElement) => void) {
  if (hudCache[id] === value) return;
  hudCache[id] = value;
  apply($(id));
}

/** Schnittstelle, über die der Renderer mit der Seite spricht (im Spiel: UI aus ui.ts) */
const host = {
  togglePause,
  showGameOver() {},
  openShop() {},
  banner(title: string, sub = '') {
    const el = $('banner');
    el.innerHTML = `<h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}`;
    el.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), 2200);
  },
  updateHud(sim: Sim | null) {
    if (!sim || !player) return;
    const p = sim.player;
    hudSet('h-score', sim.score, (el) => (el.textContent = fmtInt(sim.score)));
    hudSet('h-credits', sim.credits, (el) => (el.textContent = fmtInt(sim.credits)));
    hudSet('h-sector', sim.sector, (el) => (el.textContent = `SEKTOR ${sim.sector}`));
    const hull = Math.max(0, Math.ceil(p.hull));
    hudSet('h-hull', `${hull}/${sim.d.maxHull}`, (el) => {
      el.style.width = `${(100 * hull) / Math.max(1, sim.d.maxHull)}%`;
      el.parentElement!.classList.toggle('low', hull < sim.d.maxHull * 0.3);
      $('h-hull-t').textContent = `HÜLLE ${hull}/${sim.d.maxHull}`;
    });
    const sh = sim.d.shieldMax > 0 ? Math.round((100 * p.shield) / sim.d.shieldMax) : -1;
    hudSet('h-shield', sh, (el) => {
      $('shieldbar').style.visibility = sh < 0 ? 'hidden' : 'visible';
      el.style.width = `${Math.max(0, sh)}%`;
    });
    hudSet('h-bombs', p.bombs, (el) => (el.textContent = String(p.bombs)));
    const boss = sim.boss;
    const bh = boss ? Math.round((1000 * boss.hp) / Math.max(1, boss.maxHp)) : -1;
    hudSet('h-boss', bh, (el) => {
      $('bossbar').hidden = bh < 0;
      if (bh >= 0) el.style.width = `${bh / 10}%`;
    });
    uiFrame();
  },
};

/** Spielfeld 9:16 in den Platz einpassen; --u = ein Spielfeld-Pixel (Banner, HUD) */
function fitField() {
  const f = $('field');
  f.style.setProperty('--u', `${f.clientWidth / WIDTH}px`);
  game?.scale.refresh();
}

function ensureGame(): Promise<ReplayScene> {
  if (scene) return Promise.resolve(scene);
  return (async () => {
    const [images] = await Promise.all([
      loadImages(),
      document.fonts ? Promise.all([document.fonts.load('24px "Russo One"'), document.fonts.load('16px "Exo 2"')]).catch(() => undefined) : Promise.resolve(),
    ]);
    const sc = new ReplayScene(images, host);
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: '#070814',
      banner: false,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [sc],
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      audio: { noAudio: true },
      render: { antialias: true },
    });
    await new Promise<void>((res) => game!.events.once('ready', () => res()));
    await new Promise<void>((res) => (sc.sys.isActive() ? res() : sc.events.once('create', () => res())));
    scene = sc;
    new ResizeObserver(fitField).observe($('field'));
    window.addEventListener('resize', fitField);
    return sc;
  })();
}

function busy(text: string | null) {
  const el = $('busy');
  el.hidden = !text;
  if (text) el.textContent = text;
}

function closePlayer() {
  playSeq++;
  scene?.setPlayer(null);
  player?.dispose();
  player = null;
  entry = null;
  chartPos = [];
  $('shop').hidden = true;
  $('endcard').hidden = true;
  $('banner').classList.remove('show');
  $('hud').hidden = true;
  busy(null);
}

async function openReplay(id: number) {
  closePlayer();
  const seq = playSeq;
  showView('play');
  $('p-title').innerHTML = `<b>Partie #${id}</b>`;
  $('facts').innerHTML = '';
  $('tl-marks').innerHTML = '';
  busy('lädt …');
  try {
    const [d, sc] = await Promise.all([fetchReplay(id), ensureGame()]);
    if (seq !== playSeq) return;
    entry = d;
    $('p-title').innerHTML = `<b>${esc(d.name)}</b><span>${fmtInt(d.score)} Punkte · Sektor ${d.sector} · v${esc(d.version)} · ${fmtDate(d.date)}</span>`;
    document.title = `${d.name} · ${fmtInt(d.score)} Punkte · Oganesson GigaBash Replay`;
    const why = !d.replay ? 'Zu diesem Eintrag gibt es keine Aufzeichnung.' : whyUnplayable(d.version) ? `Diese Partie lässt sich nicht abspielen: ${whyUnplayable(d.version)}.` : '';
    if (why || !d.replay) {
      busy(why);
      return;
    }
    player = new ReplayPlayer(d.version, d.replay, {
      onEvents: (ev) => sc.feed(ev),
      onRebuild: () => {
        sc.rebuild();
        $('endcard').hidden = true;
        $('banner').classList.remove('show');
      },
      onShop: showShop,
      onBuffer: renderBuffer,
      onMarks: renderMarks,
      onStats: renderFacts,
      onSeeking: (on) => busy(on ? 'springe …' : null),
      onEnd: showEnd,
    });
    setSpeed(1);
    player.paused = false;
    sc.setPlayer(player);
    $('hud').hidden = false;
    $('t-total').textContent = fmtTime(player.total / TICK_RATE);
    $('tl').setAttribute('aria-valuemax', String(Math.round(player.total / TICK_RATE)));
    $('facts').innerHTML = '<div class="card"><h2>Kennzahlen</h2><p class="note" id="facts-wait">Partie wird durchgerechnet …</p></div>';
    busy(null);
    fitField();
  } catch (err) {
    if (seq !== playSeq) return;
    busy(err instanceof ApiError ? (err.status === 404 ? 'Diesen Eintrag gibt es nicht (mehr).' : err.message) : `Fehler: ${String(err)}`);
  }
}

function showShop(v: ShopView | null) {
  const el = $('shop');
  if (!v) {
    el.hidden = true;
    return;
  }
  const spent = v.creditsBefore - v.creditsAfter;
  el.innerHTML = `<h3>HÄNDLER</h3><p class="sub">nach Sektor ${v.sector} · ${fmtInt(v.creditsBefore)} ◆ dabei</p>
    ${v.items.length
      ? `<ul>${v.items.map((p) => `<li><span>${esc(p.label)}</span><b class="${p.cost < 0 ? 'gain' : ''}">${p.cost < 0 ? '+' : p.cost > 0 ? '−' : ''}${p.cost ? `${fmtInt(Math.abs(p.cost))} ◆` : p.t === 'skill' ? 'Skillpunkt' : '–'}</b></li>`).join('')}</ul>`
      : '<p class="none">nichts gekauft</p>'}
    <p class="sum">ausgegeben <b>${fmtInt(spent)} ◆</b> · übrig <b>${fmtInt(v.creditsAfter)} ◆</b></p>
    <button class="btn" id="shop-skip">Weiter ▸</button>`;
  el.hidden = false;
}

/** Ende der Partie: erst die Explosion zeigen, dann die Karte */
function showEnd() {
  const seq = playSeq;
  const p = player;
  setTimeout(() => {
    if (seq === playSeq && p === player && p?.ended) endCard();
  }, p?.run.error ? 0 : 1300);
}

function endCard() {
  if (!player || !entry) return;
  const sim = player.sim;
  const el = $('endcard');
  const err = player.run.error;
  el.innerHTML = err
    ? `<h3>Wiedergabe abgebrochen</h3><p>${esc(err)}</p><a class="btn" href="#list">◀ zur Liste</a>`
    : `<h3>${sim.phase === 'over' ? 'SCHIFF ZERSTÖRT' : 'PARTIE BEENDET'}</h3>
      <p><b>${fmtInt(sim.score)}</b> Punkte · Sektor <b>${sim.sector}</b> · <b>${fmtInt(sim.kills)}</b> Abschüsse</p>
      <div class="row"><button class="btn" id="end-again">↺ noch einmal</button><a class="btn" href="#list">◀ zur Liste</a></div>`;
  el.hidden = false;
}

function setSpeed(s: number) {
  if (player) player.speed = s;
  for (const b of $('c-speeds').querySelectorAll<HTMLElement>('button')) b.classList.toggle('on', Number(b.dataset.speed) === s);
}

function togglePause() {
  if (!player) return;
  if (player.ended) {
    seek(0);
    player.paused = false;
    return;
  }
  player.paused = !player.paused;
}

function seek(tick: number) {
  if (!player) return;
  $('endcard').hidden = true;
  player.seekTo(tick);
}

function renderBuffer(b: BufferInfo) {
  if (!player) return;
  $('tl-buf').style.width = `${(100 * Math.min(1, b.tick / Math.max(1, player.total))).toFixed(2)}%`;
  const wait = document.getElementById('facts-wait');
  if (wait) wait.textContent = b.error ? `Kennzahlen nicht verfügbar: ${b.error}` : `Partie wird durchgerechnet … ${Math.round((100 * b.tick) / Math.max(1, player.total))} %`;
}

function renderMarks(marks: Mark[]) {
  if (!player) return;
  const total = Math.max(1, player.total);
  $('tl-marks').innerHTML = marks
    .filter((m) => m.kind !== 'shop' && m.tick > 0)
    .map((m) => `<i class="m-${m.kind}" style="left:${((100 * m.tick) / total).toFixed(2)}%" data-tip="${esc(`<b>${m.label}</b><br>${fmtTime(m.tick / TICK_RATE)}`)}"></i>`)
    .join('');
}

/** Sprungziel: nächste/vorige Marke einer Art relativ zur Abspielposition */
function jump(kind: Mark['kind'], dir: 1 | -1) {
  if (!player) return;
  const t = player.tick;
  const list = player.marks.filter((m) => m.kind === kind).map((m) => m.tick);
  if (kind === 'sector' && !list.includes(0)) list.unshift(0);
  // rückwärts: erst zum Anfang des laufenden Abschnitts, kurz danach zum vorigen
  const target = dir > 0 ? list.find((x) => x > t) : [...list].reverse().find((x) => x < t - 2 * TICK_RATE) ?? 0;
  if (target === undefined) return;
  // Endgegner: zwei Sekunden vor dem Auftritt einsteigen
  seek(kind === 'boss' ? Math.max(0, target - 2 * TICK_RATE) : target);
}

function renderFacts(s: GameStats) {
  if (!player || !entry) return;
  const el = $('facts');
  const sec = s.end.ticks / TICK_RATE;
  const hits = s.sectors.reduce((n, x) => n + x.hits, 0);
  const grazes = s.sectors.reduce((n, x) => n + x.grazes, 0);
  const bombs = s.sectors.reduce((n, x) => n + x.bombs, 0);
  const spent = s.shops.reduce((n, x) => n + x.spent, 0);
  const tile = (label: string, value: string) => `<div class="tile"><span>${label}</span><b>${value}</b></div>`;
  el.innerHTML = `
    <div class="card"><h2>Kennzahlen</h2>
      <div class="tiles">${tile('Punkte', fmtInt(s.end.score))}${tile('Sektor', String(s.end.sector))}${tile('Abschüsse', fmtInt(s.end.kills))}${tile('Spielzeit', fmtTime(sec))}
        ${tile('Credits verdient', fmtInt(s.end.credits))}${tile('ausgegeben', fmtInt(spent))}${tile('Treffer kassiert', fmtInt(hits))}${tile('Bomben gezündet', fmtInt(bombs))}${grazes ? tile('Streifschüsse', fmtInt(grazes)) : ''}</div>
      <p class="note">Klick in ein Diagramm springt an die Stelle der Partie.</p>
    </div>
    <div class="card"><h3>Punkte</h3><div id="ch-score"></div></div>
    <div class="card"><h3>Credits</h3><div id="ch-credits"></div></div>
    <div class="card"><h3>Hülle in Prozent</h3><div id="ch-hull"></div></div>
    <div class="card"><h3>Abschüsse je Sektor</h3><div id="ch-kills">${columnChart(s.sectors.map((x) => ({
      label: String(x.sector), value: x.kills, seek: x.start,
      tip: `<b>Sektor ${x.sector}</b><br>${fmtInt(x.kills)} Abschüsse · ${fmtInt(x.score)} Punkte<br>${x.hits} Treffer kassiert${x.noHit ? ' · ohne Treffer geschafft' : ''}${x.clearAt < 0 ? '<br>nicht geschafft' : ''}`,
    })), { yLabel: 'Abschüsse je Sektor' })}</div></div>
    <div class="card"><h3>Händlerbesuche</h3>${s.shops.length
      ? s.shops.map((v) => `<details class="visit"><summary><span>nach Sektor ${v.sector}</span><b>${fmtInt(v.spent)} ◆</b><button class="btn mini" data-seek="${v.tick}" title="zum Händler springen">▸</button></summary>
          ${v.items.length ? `<ul>${v.items.map((p) => `<li><span>${esc(p.label)}</span><b>${p.cost < 0 ? '+' : ''}${p.cost ? `${fmtInt(Math.abs(p.cost))} ◆` : p.t === 'skill' ? 'Skillpunkt' : '–'}</b></li>`).join('')}</ul>` : '<p class="none">nichts gekauft</p>'}</details>`).join('')
      : '<p class="none">Kein Händler erreicht.</p>'}</div>`;
  const dt = s.every / TICK_RATE;
  const pick = (t: number) => seek(t * TICK_RATE);
  chartPos = [
    lineChart($('ch-score'), [{ name: 'Punkte', values: s.score }], { dt, total: sec, fmt: fmtShort, onPick: pick }),
    lineChart($('ch-credits'), [{ name: 'verdient gesamt', values: s.earned }, { name: 'auf der Hand', values: s.credits }], { dt, total: sec, fmt: fmtShort, onPick: pick }),
    lineChart($('ch-hull'), [{ name: 'Hülle', values: s.hull }], { dt, total: sec, max: 100, fmt: (v) => `${Math.round(v)} %`, onPick: pick }),
  ];
}

function setupPlay() {
  $('c-play').addEventListener('click', togglePause);
  $('c-prev').addEventListener('click', () => jump('sector', -1));
  $('c-next').addEventListener('click', () => jump('sector', 1));
  $('c-boss').addEventListener('click', () => jump('boss', 1));
  $('c-speeds').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-speed]');
    if (b) setSpeed(Number(b.dataset.speed));
  });
  $('field').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('#shop-skip')) player?.skipShop();
    else if (t.closest('#end-again')) {
      seek(0);
      if (player) player.paused = false;
    } else if (!t.closest('a, button')) togglePause();
  });
  $('facts').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement | SVGElement>('[data-seek]');
    if (!b) return;
    e.preventDefault();
    seek(Number(b.dataset.seek));
  });
  // Zeitleiste: ziehen springt laufend (wenn der vorige Sprung fertig ist), loslassen endgültig
  const tl = $('tl');
  const tickAt = (e: PointerEvent) => {
    const r = tl.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))) * (player?.total ?? 0));
  };
  let want = 0;
  tl.addEventListener('pointerdown', (e) => {
    if (!player) return;
    scrubbing = true;
    tl.setPointerCapture(e.pointerId);
    want = tickAt(e);
    seek(want);
  });
  tl.addEventListener('pointermove', (e) => {
    if (!scrubbing || !player) return;
    want = tickAt(e);
    showClock(want);
    if (!player.seeking) seek(want);
  });
  const up = () => {
    if (!scrubbing) return;
    scrubbing = false;
    seek(want);
  };
  tl.addEventListener('pointerup', up);
  tl.addEventListener('pointercancel', up);
  document.addEventListener('keydown', (e) => {
    if (view !== 'play' || !player || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key;
    if (k === ' ' || k === 'k') togglePause();
    else if (k === 'ArrowRight') seek(player.tick + 10 * TICK_RATE);
    else if (k === 'ArrowLeft') seek(player.tick - 10 * TICK_RATE);
    else if (k === 'ArrowDown') jump('sector', 1);
    else if (k === 'ArrowUp') jump('sector', -1);
    else if (k === 'b' || k === 'B') jump('boss', 1);
    else if (k >= '1' && k <= String(SPEEDS.length)) setSpeed(SPEEDS[Number(k) - 1]);
    else return;
    e.preventDefault();
  });
}

let clockShown = -1;
function showClock(tick: number) {
  const s = Math.floor(tick / TICK_RATE);
  if (s === clockShown) return;
  clockShown = s;
  $('t-now').textContent = fmtTime(s);
  $('tl').setAttribute('aria-valuenow', String(s));
}

let playShown: boolean | null = null;
/** je Bild: Zeitleiste, Uhr und Knöpfe nachführen */
function uiFrame() {
  if (!player) return;
  const total = Math.max(1, player.total);
  if (!scrubbing) {
    const f = `${(100 * Math.min(1, player.tick / total)).toFixed(2)}%`;
    $('tl-pos').style.width = f;
    $('tl-knob').style.left = f;
    showClock(player.tick);
  }
  const playing = !player.paused && !player.ended;
  if (playing !== playShown) {
    playShown = playing;
    $('c-play').textContent = player.ended ? '↺' : playing ? '❚❚' : '▶';
  }
  if (chartPos.length) for (const f of chartPos) f(player.tick / TICK_RATE);
}

// ---------------------------------------------------------------- Statistik

let statsLoaded = 0;
async function loadStats() {
  if (Date.now() - statsLoaded < 60_000) return;
  if (!statsLoaded) viewStats.innerHTML = '<div class="card"><h2>Statistik</h2><p class="note">lädt …</p></div>';
  let s: StatsReport;
  try {
    s = await fetchStats();
  } catch (err) {
    viewStats.innerHTML = `<div class="card"><h2>Statistik</h2><p class="note">${esc(err instanceof ApiError ? err.message : 'Fehler beim Laden.')}</p></div>`;
    return;
  }
  statsLoaded = Date.now();
  const tile = (label: string, value: string) => `<div class="tile"><span>${label}</span><b>${value}</b></div>`;
  const named = (rec: Record<string, { name: string } | undefined>, list: StatsReport['weapons']) =>
    list.map((x) => ({ label: rec[x.id]?.name ?? x.id, value: x.n, note: x.games === x.n ? undefined : `in ${x.games} ${x.games === 1 ? 'Partie' : 'Partien'}` }));
  // Sektoren lückenlos von 1 bis zum höchsten, damit die Achse stimmt
  const bySector = new Map(s.sectors.map((x) => [x.sector, x.n]));
  const sectors = Array.from({ length: s.bestSector }, (_, i) => ({ label: String(i + 1), value: bySector.get(i + 1) ?? 0, tip: `<b>Sektor ${i + 1}</b><br>${bySector.get(i + 1) ?? 0} Partien endeten hier` }));
  viewStats.innerHTML = `
    <div class="card"><h2>Statistik</h2>
      <div class="tiles">${tile('Partien in der Bestenliste', fmtInt(s.games))}${tile('Spielzeit gesamt', fmtTime(s.playSeconds))}${tile('längste Partie', fmtTime(s.longestSeconds))}
        ${tile('Abschüsse gesamt', fmtInt(s.kills))}${tile('höchste Punktzahl', fmtInt(s.bestScore))}${tile('weitester Sektor', String(s.bestSector))}</div>
      <p class="note">Gezählt werden die Einträge der Bestenliste über alle Spielversionen – nur Summen, ohne Namen und Uhrzeiten. Käufe stammen aus den ${fmtInt(s.withReplay)} Aufzeichnungen.</p>
    </div>
    <div class="stat-grid">
      <div class="card"><h3>Partien je Spielversion</h3>${barChart(s.versions.map((v) => ({ label: `v${v.version}`, value: v.games, note: `Ø Sektor ${v.avgSector.toLocaleString('de-DE')}` })))}</div>
      <div class="card"><h3>Partien je Tag</h3>${columnChart(s.days.map((d) => ({ label: fmtDate(d.date).slice(0, 6), value: d.n, tip: `<b>${fmtDate(d.date)}</b><br>${d.n} ${d.n === 1 ? 'Partie' : 'Partien'}` })), { yLabel: 'Partien je Tag' })}</div>
      <div class="card wide"><h3>In welchem Sektor endeten die Partien?</h3>${columnChart(sectors, { yLabel: 'Partien je erreichtem Sektor' })}</div>
      <div class="card"><h3>Gekaufte Waffen</h3>${barChart(named(WEAPON_BY_ID, s.weapons))}</div>
      <div class="card"><h3>Gekaufte Schiffswerte</h3>${barChart(named(STAT_BY_ID, s.shipStats))}</div>
      <div class="card"><h3>Gelernte Skills</h3>${barChart(named(SKILL_BY_ID, s.skills))}</div>
      <div class="card"><h3>Sonstiges beim Händler</h3>${barChart([{ label: 'Waffen ausgebaut', value: s.upgrades }, { label: 'Reparaturen', value: s.repairs }, { label: 'Bomben gekauft', value: s.bombs }, { label: 'Waffen verkauft', value: s.sells }])}</div>
    </div>`;
}

// ---------------------------------------------------------------- Start

function route() {
  const h = location.hash.replace(/^#/, '');
  if (/^\d{1,12}$/.test(h)) {
    void openReplay(Number(h));
    return;
  }
  closePlayer();
  document.title = 'Oganesson GigaBash · Replays';
  if (h === 'stats') {
    showView('stats');
    void loadStats();
  } else {
    showView('list');
    if (!lastList) void loadList();
  }
}

if (!isOnline()) {
  main.innerHTML = '<div class="card"><h2>Replays</h2><p class="note">Die Wiedergabe gibt es nur online – sie lädt die Partien der Bestenliste vom Server.</p></div>';
} else {
  setupList();
  setupPlay();
  window.addEventListener('hashchange', route);
  route();
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { replay: unknown }).replay = { get player() { return player; }, get scene() { return scene; }, get game() { return game; }, seek };
  }
}
