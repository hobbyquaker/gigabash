import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
// @ts-expect-error – reines JS-Skript ohne Typen
import { computeVersion } from './scripts/version.mjs';
// @ts-expect-error – reines JS-Skript ohne Typen
import { licensesPlugin } from './scripts/licenses.mjs';

const v = computeVersion() as { version: string; commit: string; date: string };

// Alles (JS, CSS, Schriften) wird in eine einzige HTML-Datei gepackt, damit das Spiel auch per file:// läuft.
export default defineConfig({
  base: './',
  plugins: [licensesPlugin(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(v.version),
    __APP_COMMIT__: JSON.stringify(v.commit),
    __APP_BUILD_DATE__: JSON.stringify(v.date),
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 5000 },
  server: { proxy: { '/api': 'http://127.0.0.1:8080' } },
});
