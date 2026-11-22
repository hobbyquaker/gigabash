/**
 * Kompakte Diagramme als Inline-SVG (keine Fremdbibliotheken, keine Anfragen nach außen) für die
 * Wiedergabeseite. Eine Achse je Diagramm; Mengen in einer Grundfarbe, mehrere Reihen in festen
 * Kategoriefarben (gegen die dunkle Fläche auf Unterscheidbarkeit bei Farbfehlsichtigkeit geprüft) und
 * immer mit Legende; Text in Textfarbe. Jede Marke zeigt ihren Wert beim Überfahren/Antippen.
 */

/** Kategoriefarben in fester Reihenfolge: Blau, Orange, Türkis, Gelb */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];
/** Grundfarbe für Mengen */
export const MAG = SERIES[0];
const GRID = 'rgba(143,154,200,0.22)';
const MUTED = '#8f9ac8';

export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const fmtInt = (n: number) => Math.round(n).toLocaleString('de-DE');
/** Sekunden als m:ss oder h:mm:ss */
export const fmtTime = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
/** kurze Zahl für Achsen: 1,2 Mio. / 34 Tsd. */
export const fmtShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd.`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.`;
  if (a >= 1e4) return `${Math.round(n / 1e3).toLocaleString('de-DE')} Tsd.`;
  return fmtInt(n);
};

/** runde Obergrenze und Schrittweite für eine Achse 0..max */
function niceMax(max: number, steps = 4): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 1 };
  const raw = max / steps;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return { top: Math.ceil(max / step) * step, step };
}

// ---------------------------------------------------------------- gemeinsamer Tooltip

let tip: HTMLDivElement | null = null;
function showTip(html: string, x: number, y: number) {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    document.body.append(tip);
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const w = tip.offsetWidth;
  const left = Math.max(6, Math.min(window.innerWidth - w - 6, x + 14));
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(6, y - tip.offsetHeight - 12)}px`;
}
export function hideTip() {
  if (tip) tip.hidden = true;
}

/** Marken mit data-tip zeigen ihren Text beim Überfahren, Antippen und per Tastatur-Fokus */
export function bindTips(root: HTMLElement) {
  const at = (e: Event) => (e.target as Element).closest?.('[data-tip]') as HTMLElement | null;
  root.addEventListener('pointermove', (e) => {
    const el = at(e);
    if (el) showTip(el.dataset.tip!, e.clientX, e.clientY);
    else hideTip();
  });
  root.addEventListener('pointerleave', hideTip);
  root.addEventListener('focusin', (e) => {
    const el = at(e);
    if (!el) return;
    const r = el.getBoundingClientRect();
    showTip(el.dataset.tip!, r.left + r.width / 2, r.top);
  });
  root.addEventListener('focusout', hideTip);
}

// ---------------------------------------------------------------- Balken

export interface BarItem {
  label: string;
  value: number;
  /** Zusatz hinter dem Wert */
  note?: string;
}

/** Waagerechte Balken: Beschriftung links, Wert rechts am Balken */
export function barChart(items: BarItem[], opts: { unit?: string } = {}): string {
  if (!items.length) return '<p class="empty">Noch keine Daten.</p>';
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="bars">${items
    .map((it) => {
      const val = `${fmtInt(it.value)}${opts.unit ?? ''}`;
      const tipText = `<b>${esc(it.label)}</b><br>${val}${it.note ? ` · ${esc(it.note)}` : ''}`;
      return `<div class="bar-row" tabindex="0" data-tip="${esc(tipText)}"><span class="bar-l">${esc(it.label)}</span>
        <span class="bar-t"><i style="width:${Math.max(it.value > 0 ? 1.5 : 0, (100 * it.value) / max).toFixed(1)}%"></i></span>
        <span class="bar-v">${val}${it.note ? ` <small>${esc(it.note)}</small>` : ''}</span></div>`;
    })
    .join('')}</div>`;
}

/** Senkrechte Säulen über einer geordneten Achse (Sektoren, Tage) */
export function columnChart(items: { label: string; value: number; tip?: string; seek?: number }[], opts: { height?: number; yLabel?: string } = {}): string {
  if (!items.length) return '<p class="empty">Noch keine Daten.</p>';
  const W = 520;
  const H = opts.height ?? 150;
  const L = 44;
  const B = 20;
  const T = 8;
  const { top, step } = niceMax(Math.max(...items.map((i) => i.value)));
  const pw = (W - L - 4) / items.length;
  const bw = Math.max(1, Math.min(34, pw - 2));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.yLabel ?? 'Säulendiagramm')}">`;
  for (let v = 0; v <= top + 1e-9; v += step) {
    s += `<line x1="${L}" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${GRID}"/><text x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${fmtShort(v)}</text>`;
  }
  // Beschriftung der Achse: so viele, wie Platz haben
  const every = Math.max(1, Math.ceil(items.length / Math.floor((W - L) / 34)));
  items.forEach((it, i) => {
    const cx = L + pw * (i + 0.5);
    const h = Math.max(it.value > 0 ? 2 : 0, H - B - y(it.value));
    const r = Math.min(4, bw / 2, h);
    const x0 = cx - bw / 2;
    const yt = H - B - h;
    // oben abgerundet, unten an der Grundlinie verankert
    const d = `M${x0.toFixed(1)},${H - B}V${(yt + r).toFixed(1)}q0,${-r} ${r},${-r}h${(bw - 2 * r).toFixed(1)}q${r},0 ${r},${r}V${H - B}z`;
    const tipText = it.tip ?? `<b>${esc(it.label)}</b><br>${fmtInt(it.value)}`;
    s += `<g tabindex="0" data-tip="${esc(tipText)}"${it.seek !== undefined ? ` data-seek="${it.seek}" class="seekable"` : ''}>
      <rect x="${(cx - pw / 2).toFixed(1)}" y="${T}" width="${pw.toFixed(1)}" height="${H - T - B}" fill="transparent"/><path d="${d}" fill="${MAG}"/></g>`;
    if (i % every === 0) s += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ax">${esc(it.label)}</text>`;
  });
  return s + '</svg>';
}

// ---------------------------------------------------------------- Linien über der Spielzeit

export interface LineSeries {
  name: string;
  values: number[];
}

export interface LineOpts {
  /** Abstand der Werte in Sekunden */
  dt: number;
  /** Länge der Achse in Sekunden */
  total: number;
  fmt?: (v: number) => string;
  /** feste Obergrenze (z. B. 100 %) */
  max?: number;
  /** Klick ins Diagramm: Zeit in Sekunden */
  onPick?: (t: number) => void;
}

/**
 * Liniendiagramm über der Spielzeit in `host` aufbauen: Fadenkreuz mit Werten aller Reihen beim
 * Überfahren, Klick springt zur Stelle. Liefert eine Funktion, die die Abspielposition (s) einzeichnet.
 */
export function lineChart(host: HTMLElement, series: LineSeries[], o: LineOpts): (t: number) => void {
  const W = 520;
  const H = 150;
  const L = 52;
  const R = 8;
  const B = 20;
  const T = 8;
  const fmt = o.fmt ?? fmtInt;
  const { top, step } = o.max ? { top: o.max, step: o.max / 4 } : niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const total = Math.max(1, o.total);
  const x = (t: number) => L + (W - L - R) * Math.min(1, t / total);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  let s = `<svg class="chart line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((q) => q.name).join(', '))} über der Spielzeit">`;
  for (let v = 0; v <= top + 1e-9; v += step) {
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${GRID}"/><text x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${esc(fmt(v))}</text>`;
  }
  // Zeitachse: 4–6 runde Marken
  const tStep = [30, 60, 120, 300, 600, 900, 1800, 3600].find((q) => total / q <= 6) ?? 7200;
  for (let t = 0; t <= total; t += tStep) s += `<text x="${x(t).toFixed(1)}" y="${H - 6}" text-anchor="${t === 0 ? 'start' : 'middle'}" class="ax">${fmtTime(t)}</text>`;
  series.forEach((q, i) => {
    const pts = q.values.map((v, k) => `${x(k * o.dt).toFixed(1)},${y(Math.min(top, v)).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${SERIES[i]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  s += `<line class="pos" y1="${T}" y2="${H - B}" x1="${L}" x2="${L}" stroke="#ffe45c" stroke-width="1.5"/>`;
  s += `<line class="cross" y1="${T}" y2="${H - B}" stroke="${MUTED}" stroke-dasharray="3 3" visibility="hidden"/>`;
  series.forEach((_, i) => (s += `<circle class="dot" r="4" fill="${SERIES[i]}" stroke="#101329" stroke-width="2" visibility="hidden"/>`));
  s += '</svg>';
  const legend = series.length > 1 ? `<div class="legend">${series.map((q, i) => `<span><i style="background:${SERIES[i]}"></i>${esc(q.name)}</span>`).join('')}</div>` : '';
  host.innerHTML = legend + s;
  const svg = host.querySelector('svg')!;
  const pos = svg.querySelector<SVGLineElement>('.pos')!;
  const cross = svg.querySelector<SVGLineElement>('.cross')!;
  const dots = [...svg.querySelectorAll<SVGCircleElement>('.dot')];
  const timeAt = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(total, ((px - L) / (W - L - R)) * total));
  };
  svg.addEventListener('pointermove', (e) => {
    const t = timeAt(e);
    const k = Math.max(0, Math.min(Math.round(t / o.dt), Math.max(...series.map((q) => q.values.length)) - 1));
    const cx = x(k * o.dt).toFixed(1);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    let html = `<b>${fmtTime(k * o.dt)}</b>`;
    series.forEach((q, i) => {
      const v = q.values[Math.min(k, q.values.length - 1)] ?? 0;
      dots[i].setAttribute('cx', cx);
      dots[i].setAttribute('cy', y(Math.min(top, v)).toFixed(1));
      dots[i].setAttribute('visibility', 'visible');
      html += `<br><i class="sw" style="background:${SERIES[i]}"></i>${series.length > 1 ? `${esc(q.name)}: ` : ''}${esc(fmt(v))}`;
    });
    showTip(html, e.clientX, e.clientY);
  });
  svg.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    for (const d of dots) d.setAttribute('visibility', 'hidden');
    hideTip();
  });
  if (o.onPick) {
    svg.classList.add('seekable');
    svg.addEventListener('click', (e) => o.onPick!(timeAt(e as PointerEvent)));
  }
  return (t: number) => {
    const cx = x(t).toFixed(1);
    pos.setAttribute('x1', cx);
    pos.setAttribute('x2', cx);
  };
}
