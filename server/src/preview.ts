// Link-Vorschau (Open Graph, Twitter Card) und Icon-/Manifest-Links für die ausgelieferte Seite.
//
// Das Spiel kann hinter einem Reverse-Proxy unter einem Unterpfad laufen (z. B. https://example.com/gigabash/), der Container
// sieht aber nur "/". Deshalb: Vorschaubild und og:url absolut aus PUBLIC_URL, Icons und Manifest
// relativ ohne führenden Schrägstrich. Nichts davon landet in der file://-Datei; die Tags werden
// nur beim Ausliefern direkt nach <title> eingefügt (Crawler lesen nur den Anfang der Seite).

import { APP_VERSION } from '../../src/version';

/**
 * Cache-Buster: iOS und Vorschau-Crawler speichern Icons und Vorschaubild hartnäckig. Mit der
 * Spielversion in der URL holt ein neu angelegtes Lesezeichen bzw. eine neue Vorschau sicher das
 * aktuelle Bild (bereits angelegte Home-Bildschirm-Icons aktualisiert iOS grundsätzlich nicht).
 */
const V = `?v=${encodeURIComponent(APP_VERSION)}`;

export const PREVIEW = {
  title: 'Oganesson GigaBash',
  description:
    'Weltraum-Shooter im Browser: Gegnerwellen und Endgegner abschießen, P-Kapseln sammeln und beim Händler Anbauwaffen, Upgrades und Skills kaufen. Ohne Installation, auch auf dem Handy.',
  imageAlt: 'Oganesson GigaBash: Ein Raumschiff kämpft gegen Gegnerwellen und einen Endgegner',
  image: 'og-image.png',
  imageWidth: 1200,
  imageHeight: 630,
  themeColor: '#070814',
  backgroundColor: '#070814',
};

/** Web-App-Manifest; alle Pfade relativ, damit es unter einem Unterpfad genauso funktioniert */
export function manifest(): string {
  return JSON.stringify(
    {
      name: PREVIEW.title,
      short_name: 'Oganesson',
      description: PREVIEW.description,
      lang: 'de',
      start_url: './',
      scope: './',
      display: 'fullscreen',
      orientation: 'portrait',
      background_color: PREVIEW.backgroundColor,
      theme_color: PREVIEW.themeColor,
      icons: [
        { src: `icon-192.png${V}`, sizes: '192x192', type: 'image/png' },
        { src: `icon-512.png${V}`, sizes: '512x512', type: 'image/png' },
        { src: `icon-512-maskable.png${V}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  );
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Tags für den <head>; publicUrl leer = nur Icons und Manifest (ohne absolute URL keine Open-Graph-Tags) */
export function headTags(publicUrl: string): string {
  const base = publicUrl.replace(/\/+$/, '');
  const lines = [
    `<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png${V}">`,
    `<link rel="icon" type="image/svg+xml" href="favicon.svg${V}">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png${V}">`,
    `<link rel="manifest" href="manifest.webmanifest${V}">`,
    `<meta name="description" content="${esc(PREVIEW.description)}">`,
  ];
  if (base) {
    const img = `${esc(base)}/${PREVIEW.image}${V}`;
    lines.push(
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${esc(PREVIEW.title)}">`,
      `<meta property="og:title" content="${esc(PREVIEW.title)}">`,
      `<meta property="og:description" content="${esc(PREVIEW.description)}">`,
      `<meta property="og:url" content="${esc(base)}/">`,
      `<meta property="og:image" content="${img}">`,
      `<meta property="og:image:type" content="image/png">`,
      `<meta property="og:image:width" content="${PREVIEW.imageWidth}">`,
      `<meta property="og:image:height" content="${PREVIEW.imageHeight}">`,
      `<meta property="og:image:alt" content="${esc(PREVIEW.imageAlt)}">`,
      `<meta property="og:locale" content="de_DE">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(PREVIEW.title)}">`,
      `<meta name="twitter:description" content="${esc(PREVIEW.description)}">`,
      `<meta name="twitter:image" content="${img}">`,
    );
  }
  return '\n    ' + lines.join('\n    ');
}

/**
 * Tags direkt hinter </title> einfügen und den Platzhalter-Favicon (data:,) entfernen, der in der
 * file://-Version Favicon-Requests verhindert.
 */
export function injectHead(html: string, publicUrl: string): string {
  const out = html.replace(/\s*<link rel="icon" href="data:,"\s*\/?>/, '');
  const i = out.indexOf('</title>');
  if (i < 0) return out;
  const at = i + '</title>'.length;
  return out.slice(0, at) + headTags(publicUrl) + out.slice(at);
}
