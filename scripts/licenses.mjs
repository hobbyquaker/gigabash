// Lizenzhinweise der ins Spiel eingebetteten Fremdkomponenten. MIT verlangt Copyright- und Lizenztext in
// jeder Kopie, die SIL Open Font License bei Schriften ebenso. Build-Werkzeuge (Vite, esbuild, TypeScript)
// landen nicht im Spiel und fehlen hier bewusst. Ausgabe: als Kommentar in der Single-File-HTML (gilt auch
// per file://) und als dist/third-party-licenses.txt, die der Server unter /third-party-licenses.txt ausliefert
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PARTS = [
  { name: 'Phaser 3', pkg: 'phaser', file: 'LICENSE.md', url: 'https://phaser.io' },
  { name: 'EventEmitter3 (in Phaser enthalten)', pkg: 'eventemitter3', file: 'LICENSE', url: 'https://github.com/primus/eventemitter3' },
  { name: 'ZzFX', pkg: 'zzfx', file: 'LICENSE', url: 'https://github.com/KilledByAPixel/ZzFX' },
  { name: 'Schrift „Russo One“ (via Fontsource)', pkg: '@fontsource/russo-one', file: 'LICENSE', url: 'https://fonts.google.com/specimen/Russo+One' },
  { name: 'Schrift „Exo 2“ (via Fontsource)', pkg: '@fontsource/exo-2', file: 'LICENSE', url: 'https://fonts.google.com/specimen/Exo+2' },
];

export function licenseText(root = process.cwd()) {
  const out = ['Oganesson – Lizenzen der verwendeten Open-Source-Komponenten', ''];
  for (const p of PARTS) {
    const dir = join(root, 'node_modules', p.pkg);
    const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const text = readFileSync(join(dir, p.file), 'utf8').trim();
    out.push('='.repeat(72), `${p.name} ${meta.version} – ${meta.license} – ${p.url}`, '='.repeat(72), '', text, '');
  }
  // darf den HTML-Kommentar nicht beenden
  return out.join('\n').replace(/--+>/g, '->').replace(/<!--/g, '<!-');
}

/** Vite-Plugin: Lizenztexte als Kommentar ans Ende der HTML und als third-party-licenses.txt ins Ausgabeverzeichnis */
export function licensesPlugin() {
  let text = '';
  let outDir = 'dist';
  return {
    name: 'oganesson-licenses',
    apply: 'build',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    buildStart() {
      text = licenseText();
    },
    transformIndexHtml(html) {
      return html.replace('</body>', `<!--\n${text || licenseText()}\n-->\n</body>`);
    },
    closeBundle() {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'third-party-licenses.txt'), text || licenseText());
    },
  };
}
