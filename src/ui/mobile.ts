// Handy-Feinheiten: Plattform-Erkennung, Vollbild (Android), „Zum Home-Bildschirm“-Hinweis (iOS),
// Diagnose-Einblendung ?diag mit den letzten Touch-Ereignissen.
import { loadJson, saveJson } from '../settings';

const params = new URLSearchParams(location.search);

/** 'iphone' | 'ipad' | null; zum Testen erzwingbar mit ?ios=iphone bzw. ?ios=ipad */
export function iosDevice(): 'iphone' | 'ipad' | null {
  const forced = params.get('ios');
  if (forced === 'iphone' || forced === 'ipad') return forced;
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ipad';
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  return null;
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent) || params.get('android') !== null;
}

/** als Web-App vom Home-Bildschirm gestartet */
export function isStandalone(): boolean {
  return (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}

/** Android: beim Start-Klick ins Vollbild (muss in der Nutzeraktion passieren). Nicht auf iPhone/iPad. */
export function enterFullscreen() {
  if (!isAndroid() || iosDevice() || isStandalone() || document.fullscreenElement) return;
  const el = document.documentElement;
  try {
    el.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
  } catch {
    /* nicht unterstützt */
  }
}

/** Safari-Teilen-Symbol: Quadrat mit Pfeil nach oben */
export const SHARE_ICON = `<svg class="share-ico" viewBox="0 0 24 24" aria-label="Teilen" role="img" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 9.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2h-1.5"/><path d="M12 14.5V2.8"/><path d="M8.3 6.3 12 2.6l3.7 3.7"/></svg>`;

const A2HS_KEY = 'oganesson.a2hs';

/**
 * Einmaliger Hinweis „Zum Home-Bildschirm hinzufügen“ (nur iPhone/iPad im Browser).
 * iPhone hochkant: Teilen-Knopf unten in der Safari-Leiste → Blase unten mit Pfeil nach unten.
 * iPad: Teilen-Knopf oben rechts → Blase oben rechts mit Pfeil nach oben.
 */
export class HomeScreenHint {
  private el: HTMLElement | null = null;

  maybeShow() {
    const dev = iosDevice();
    if (!dev || isStandalone() || this.el) return;
    if (loadJson<boolean>(A2HS_KEY, false) && !params.has('a2hs')) return;
    const el = document.createElement('div');
    el.id = 'a2hs';
    el.className = dev;
    el.innerHTML = `<p><b>Tipp:</b> Für echtes Vollbild tippe ${dev === 'iphone' ? 'unten' : 'oben rechts'} auf ${SHARE_ICON} <b>Teilen</b>
      und dann auf <b>„Zum Home-Bildschirm“</b>.</p><button class="btn2" data-a2hs="ok">Verstanden</button>`;
    el.querySelector('button')!.addEventListener('click', () => this.dismiss());
    document.getElementById('frame')!.appendChild(el);
    this.el = el;
  }

  /** ausblenden und nicht wieder zeigen */
  dismiss() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    saveJson(A2HS_KEY, true);
  }
}

/** ?diag: Einblendung mit den letzten Touch-/Pointer-Ereignissen und Layout-Werten */
export function installDiag(info: () => string) {
  if (!params.has('diag')) return;
  const box = document.createElement('pre');
  box.id = 'diag';
  document.body.appendChild(box);
  const lines: string[] = [];
  const t0 = performance.now();
  const tgt = (t: EventTarget | null) => {
    if (!(t instanceof Element)) return '-';
    return t.tagName.toLowerCase() + (t.id ? `#${t.id}` : t.classList.length ? `.${t.classList[0]}` : '');
  };
  let moves = 0;
  const push = (s: string) => {
    lines.unshift(`${((performance.now() - t0) / 1000).toFixed(2).padStart(7)} ${s}`);
    lines.length = Math.min(lines.length, 14);
    render();
  };
  const render = () => {
    box.textContent = `${info()}\nmoves: ${moves}\n${lines.join('\n')}`;
  };
  for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
    document.addEventListener(type, (e) => {
      const ch = Array.from(e.changedTouches).map((t) => `${t.identifier}@${Math.round(t.clientX)},${Math.round(t.clientY)}`).join(' ');
      push(`${type.slice(5).padEnd(6)} n=${e.touches.length} [${ch}] ${tgt(e.target)}`);
    }, { capture: true, passive: true });
  }
  document.addEventListener('touchmove', () => { moves++; }, { capture: true, passive: true });
  for (const type of ['pointerdown', 'pointerup', 'pointercancel'] as const) {
    document.addEventListener(type, (e) => {
      push(`${type.slice(7).padEnd(6)} p${e.pointerId} ${e.pointerType} ${Math.round(e.clientX)},${Math.round(e.clientY)} ${tgt(e.target)}`);
    }, true);
  }
  document.addEventListener('click', (e) => push(`click  ${e.isTrusted ? '' : '(synth) '}${tgt(e.target)}`), true);
  setInterval(render, 500);
  render();
}
