import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
// @ts-expect-error – reines JS-Skript ohne Typen
import { computeVersion } from './scripts/version.mjs';
// @ts-expect-error – reines JS-Skript ohne Typen
import { licensesPlugin } from './scripts/licenses.mjs';

const v = computeVersion() as { version: string; commit: string; date: string };

/**
 * Zweiter Single-File-Build: die Wiedergabeseite (replay.html → dist/replay.html). Eigener Einstieg,
 * damit das Spiel-Bundle nicht um die eingefrorenen Sim-Kerne älterer Versionen wächst. Läuft nach
 * dem Spiel-Build in dasselbe dist/ (emptyOutDir: false). vite-plugin-singlefile kann nur einen
 * Einstieg je Build inlinen, deshalb nicht als zweiter rollup-Input.
 */
export default defineConfig({
  base: './',
  plugins: [licensesPlugin(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(v.version),
    __APP_COMMIT__: JSON.stringify(v.commit),
    __APP_BUILD_DATE__: JSON.stringify(v.date),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 5000,
    emptyOutDir: false,
    rollupOptions: { input: 'replay.html' },
  },
  // Der Vorrechen-Worker wird als Blob eingebettet (?worker&inline); IIFE, damit keine Chunks entstehen
  worker: { format: 'iife' },
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});
