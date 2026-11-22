// Sim-Kern einer veröffentlichten Version einfrieren, damit der Server Partien dieser Version auch
// nach einem Update noch nachrechnen kann (sonst wäre der Highscore nach jedem Deploy verloren).
//
//   npm run freeze-core -- <version> <commit>     z. B.  npm run freeze-core -- 0.3.0 a912f12
//
// Legt server/cores/v<version>/ als Kopie von src/core aus dem Commit an und erzeugt
// server/src/cores.gen.ts (Liste aller eingefrorenen Kerne für die Nachsimulation) und
// src/replay/cores.gen.ts (dieselben Kerne als Sim-Klassen für die Wiedergabeseite) neu.
// Ohne Argumente nur die Listen.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const coresDir = join(root, 'server/cores');
const [version, commit] = process.argv.slice(2);

if (version) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !commit) {
    console.error('Aufruf: npm run freeze-core -- <version> <commit>');
    process.exit(1);
  }
  const out = join(coresDir, `v${version}`);
  if (existsSync(out)) {
    console.log(`Kern v${version} ist schon eingefroren.`);
  } else {
    mkdirSync(out, { recursive: true });
    const tar = execFileSync('git', ['archive', '--format=tar', commit, 'src/core'], { cwd: root, maxBuffer: 64 << 20 });
    execFileSync('tar', ['-x', '--strip-components=2', '-C', out], { input: tar });
    writeFileSync(join(out, 'FROZEN.txt'), `Eingefrorener Sim-Kern von Oganesson v${version} (Commit ${commit}). Nicht ändern.\n`);
    console.log(`Kern v${version} aus ${commit} eingefroren: ${out}`);
  }
}

const versions = existsSync(coresDir)
  ? readdirSync(coresDir).filter((d) => /^v\d+\.\d+\.\d+$/.test(d)).map((d) => d.slice(1)).sort()
  : [];
const id = (v) => `v${v.replace(/\./g, '_')}`;
const src = `// Von scripts/freeze-core.mjs erzeugt – nicht von Hand ändern.
// Eingefrorene Sim-Kerne älterer Versionen (server/cores/v*/) für die Nachsimulation nach Updates.
${versions.map((v) => `import { simulateReplay as ${id(v)} } from '../cores/v${v}/sim/replay';`).join('\n')}

export type FrozenSim = (replay: never) => { score: number; sector: number; kills: number; ticks: number; credits: number; valid: boolean; error?: string };

export const FROZEN_CORES: Record<string, FrozenSim> = {
${versions.map((v) => `  '${v}': ${id(v)} as unknown as FrozenSim,`).join('\n')}
};
`;
writeFileSync(join(root, 'server/src/cores.gen.ts'), src);

// Wiedergabeseite (/replay): dieselben Kerne, aber die Sim-Klasse selbst (Schritt für Schritt abspielen)
const replaySrc = `// Von scripts/freeze-core.mjs erzeugt – nicht von Hand ändern.
// Sim-Klassen der eingefrorenen Kerne (server/cores/v*/) für die Wiedergabeseite (src/replay).
${versions.map((v) => `import { Sim as ${id(v)} } from '../../server/cores/v${v}/sim/sim';`).join('\n')}

/** Spielversion → Sim-Klasse dieser Version */
export const FROZEN_SIMS: Record<string, unknown> = {
${versions.map((v) => `  '${v}': ${id(v)},`).join('\n')}
};
`;
writeFileSync(join(root, 'src/replay/cores.gen.ts'), replaySrc);
console.log(`cores.gen.ts: ${versions.length ? versions.map((v) => 'v' + v).join(', ') : 'keine'}`);
