// Bündelt den Server (server/dist/server.mjs), den Worker für die Nachsimulation
// (server/dist/verify-worker.mjs) und die Testhilfe (server/dist/test-play.mjs) mit esbuild.
// Die Versionsangaben (scripts/version.mjs) werden wie im Vite-Build per define eingesetzt,
// damit Client und Server dieselbe Spielversion tragen.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVersion } from './version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = computeVersion({ ignoreDirty: process.argv.includes('--deploy') });

/**
 * Fingerabdruck eines Sim-Kerns (alle .ts-Dateien mit Pfad und Inhalt). Versionen mit gleichem
 * Fingerabdruck rechnen identisch – die Bestenliste fasst sie zusammen.
 */
function coreHash(dir) {
  const files = [];
  const walk = (d, rel) => {
    for (const f of readdirSync(d).sort()) {
      const full = join(d, f);
      if (statSync(full).isDirectory()) walk(full, rel + f + '/');
      else if (f.endsWith('.ts')) files.push([rel + f, readFileSync(full)]);
    }
  };
  walk(dir, '');
  const h = createHash('sha1');
  for (const [name, data] of files) h.update(name).update('\0').update(data).update('\0');
  return h.digest('hex').slice(0, 12);
}
const simHashes = {};
const coresDir = join(root, 'server/cores');
if (existsSync(coresDir)) for (const d of readdirSync(coresDir)) if (/^v\d+\.\d+\.\d+$/.test(d)) simHashes[d.slice(1)] = coreHash(join(coresDir, d));
simHashes[v.version] = coreHash(join(root, 'src/core'));

const common = {
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  logLevel: 'warning',
  define: {
    __APP_VERSION__: JSON.stringify(v.version),
    __APP_COMMIT__: JSON.stringify(v.commit),
    __APP_BUILD_DATE__: JSON.stringify(v.date),
    __SIM_HASHES__: JSON.stringify(simHashes),
  },
};

const entries = [
  ['server/src/main.ts', 'server/dist/server.mjs'],
  ['server/src/verify-worker.ts', 'server/dist/verify-worker.mjs'],
  ['server/test/play.ts', 'server/dist/test-play.mjs'],
];
await Promise.all(entries.map(([entry, out]) => build({ ...common, entryPoints: [join(root, entry)], outfile: join(root, out) })));
console.log(`Server gebaut: Version ${v.version} (${v.commit})`);
