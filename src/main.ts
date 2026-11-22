import '@fontsource/russo-one/latin-400.css';
import '@fontsource/exo-2/latin-400.css';
import '@fontsource/exo-2/latin-700.css';
import './style.css';
import Phaser from 'phaser';
import { WIDTH, HEIGHT } from './core/config';
import { loadImages } from './assets/sprites';
import { GameScene } from './scenes/GameScene';
import { UI } from './ui';
import { sfx } from './audio/sfx';
import { music } from './audio/music';
import { settingsHooks } from './ui/hooks';

// Musik-Regler im Einstellungsdialog
settingsHooks.music = music;
import { computeLayout, type LayoutInfo } from './ui/layout';
import { installDiag } from './ui/mobile';

const params = new URLSearchParams(location.search);

/**
 * Rahmen füllt den Bildschirm, Spielfeld immer 9:16 (siehe ui/layout.ts). --u = Skalierung eines
 * Spielfeld-Pixels, damit HUD und Menüs mitwachsen. Handy quer: Hinweis „Bitte hochkant halten“ und Pause.
 */
let last: LayoutInfo | null = null;
function layout(game?: Phaser.Game) {
  last = computeLayout();
  game?.scale.refresh();
  return last.landscapePhone;
}

function blockGestures() {
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.target as Element;
      if (!t.closest('.card, .shop-body, .cl-list, input')) e.preventDefault();
    },
    { passive: false },
  );
}

/** Verlässliche Knöpfe auf Touch-Geräten (iOS lässt den click bei Zittern oder Neuzeichnen ausfallen) */
function reliableTaps() {
  let down: { el: HTMLElement; x: number; y: number; id: number } | null = null;
  let suppressUntil = 0;
  const buttonAt = (t: EventTarget | null) => (t instanceof Element ? (t.closest('button') as HTMLButtonElement | null) : null);
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const b = buttonAt(e.target);
    down = b && !b.disabled ? { el: b, x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  }, true);
  document.addEventListener('pointercancel', () => { down = null; }, true);
  document.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || e.pointerId !== d.id) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
    let b: HTMLElement | null = d.el;
    if (!b.isConnected) b = buttonAt(document.elementFromPoint(e.clientX, e.clientY));
    if (!b || (b as HTMLButtonElement).disabled || b.id === 'btn-bomb') return;
    suppressUntil = performance.now() + 700;
    b.click();
  }, true);
  document.addEventListener('click', (e) => {
    if (e.isTrusted && performance.now() < suppressUntil && buttonAt(e.target)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

async function boot() {
  layout();
  blockGestures();
  reliableTaps();
  const [images] = await Promise.all([
    loadImages(),
    document.fonts ? Promise.all([document.fonts.load('24px "Russo One"'), document.fonts.load('16px "Exo 2"')]).catch(() => undefined) : Promise.resolve(),
  ]);
  const ui = new UI(images);
  const scene = new GameScene(images, ui);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#070814',
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
    input: { activePointers: 3 },
    audio: { noAudio: true },
    render: { antialias: true },
  });
  game.events.once('ready', () => ui.attach(scene));

  const relayout = () => {
    if (layout(game)) ui.pause(true);
  };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => {
    relayout();
    setTimeout(relayout, 150);
    setTimeout(relayout, 500);
  });
  window.visualViewport?.addEventListener('resize', relayout);

  // Hängende Touch-Zeiger freigeben (iOS meldet ein Loslassen manchmal nicht)
  document.addEventListener('touchstart', (ev) => {
    const ids = new Set(Array.from(ev.touches).map((t) => t.identifier));
    for (const p of game.input.pointers) {
      if (p.isDown && p.wasTouch && !ids.has(p.identifier)) p.reset();
    }
  }, true);

  installDiag(() => {
    const l = last;
    const vv = window.visualViewport;
    return `${innerWidth}×${innerHeight} vv ${vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}` : '-'} dpr ${devicePixelRatio}\n` +
      (l ? `u ${l.u.toFixed(3)} ${l.bands ? 'Leisten' : 'überlagert'} safe ${l.insets.top}/${l.insets.right}/${l.insets.bottom}/${l.insets.left}` : '') +
      `\nZeiger: ${game.input.pointers.filter((p) => p.isDown).map((p) => p.id).join(',') || '-'}`;
  });

  if (import.meta.env.DEV || params.has('debug')) {
    (window as unknown as { oganesson: unknown }).oganesson = { scene, ui, sfx, music, game };
  }
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="color:#fff;padding:2em">Fehler beim Start:\n${String(err)}</pre>`;
  console.error(err);
});
