// Bildschirm-Aufteilung: Rahmen füllt den Bildschirm, das Spielfeld bleibt 9:16 (logisch 540×960).
// Auf langen Handys (19,5:9 u. ä.) wandern die HUD-Leisten in die freien Bereiche über/unter dem Feld.
import { WIDTH, HEIGHT } from '../core/config';

const params = new URLSearchParams(location.search);

/** Höhe der oberen HUD-Leiste (Punkte, Credits, Pause) in Spielfeld-Pixeln */
export const BAND_TOP = 64;
/** Höhe der unteren HUD-Leiste (Hülle, Schild, Bomben) in Spielfeld-Pixeln */
export const BAND_BOTTOM = 50;
/** so viel darf das Feld für die Leisten höchstens schrumpfen (sonst HUD wie bisher über dem Feld) */
const MAX_SHRINK = 0.06;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInfo {
  /** HUD in eigenen Leisten außerhalb des Spielfelds */
  bands: boolean;
  /** Handy quer → Hinweis „Bitte hochkant halten“ */
  landscapePhone: boolean;
  /** 1 Spielfeld-Pixel in CSS-Pixeln */
  u: number;
  insets: Insets;
}

let probe: HTMLDivElement | null = null;

/** Safe-Area-Ränder (Notch, Home-Indikator). Zum Testen überschreibbar: ?insets=oben,rechts,unten,links */
export function safeInsets(): Insets {
  const forced = params.get('insets');
  if (forced) {
    const [top = 0, right = 0, bottom = 0, left = 0] = forced.split(',').map((v) => Number(v) || 0);
    return { top, right, bottom, left };
  }
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || params.has('touch');
}

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/**
 * Berechnet Spielfeld- und Leistenposition und setzt sie als Stil bzw. CSS-Variablen:
 * --u (Skalierung), --bt/--bb (Höhe der Leisten in px, 0 ohne Leisten).
 */
export function computeLayout(): LayoutInfo {
  const vw = window.visualViewport?.width ?? innerWidth;
  const vh = window.visualViewport?.height ?? innerHeight;
  const ins = safeInsets();
  const aw = Math.max(1, vw - ins.left - ins.right);
  const ah = Math.max(1, vh - ins.top - ins.bottom);

  const uFit = Math.min(aw / WIDTH, ah / HEIGHT);
  const uBand = Math.min(aw / WIDTH, ah / (HEIGHT + BAND_TOP + BAND_BOTTOM));
  const bands = uBand >= uFit * (1 - MAX_SHRINK) && !params.has('nobands');
  const u = bands ? uBand : uFit;

  const fw = Math.floor(WIDTH * u);
  const fh = Math.floor(HEIGHT * u);
  let bt = 0;
  let bb = 0;
  if (bands) {
    // Restplatz gleichmäßig auf beide Leisten verteilen
    const extra = Math.max(0, ah - fh - (BAND_TOP + BAND_BOTTOM) * u);
    bt = Math.floor(BAND_TOP * u + extra / 2);
    bb = Math.floor(BAND_BOTTOM * u + extra / 2);
  }
  const colH = fh + bt + bb;
  const left = ins.left + (aw - fw) / 2;
  const top = ins.top + (ah - colH) / 2;

  const root = document.documentElement;
  root.style.setProperty('--u', `${u}px`);
  root.style.setProperty('--bt', `${bt}px`);
  root.style.setProperty('--bb', `${bb}px`);
  root.style.setProperty('--sa-top', `${ins.top}px`);
  root.style.setProperty('--sa-bottom', `${ins.bottom}px`);
  root.classList.toggle('bands', bands);

  const col = document.getElementById('col')!;
  Object.assign(col.style, { left: px(left), top: px(top), width: `${fw}px`, height: `${colH}px` });
  const field = document.getElementById('field')!;
  Object.assign(field.style, { top: `${bt}px`, width: `${fw}px`, height: `${fh}px` });

  const touch = isTouchDevice();
  root.classList.toggle('touch', touch);
  const landscapePhone = touch && vw > vh && vh < 600;
  document.getElementById('rotate')!.hidden = !landscapePhone;
  return { bands, landscapePhone, u, insets: ins };
}
