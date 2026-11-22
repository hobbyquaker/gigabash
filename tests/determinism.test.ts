// Determinismus: zweimal simulieren → identisch; Replay nachrechnen → identisch; keine verbotene Mathematik in src/core.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runBot } from './bot';
import { simulateReplay, stats } from '../src/core/sim/replay';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) fails++;
};

// 1. verbotene Aufrufe
const forbidden = /Math\.(sin|cos|tan|atan|atan2|pow|hypot|exp|log|log2|log10|random|cbrt)\b|\*\*/;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk('src/core')) {
  if (f.endsWith('dmath.ts')) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const code = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/^\s*\*.*$/, '').replace(/^\s*\/\*\*.*$/, '');
    if (forbidden.test(code)) check(false, `verbotene Mathematik in ${f}:${i + 1}: ${l.trim()}`);
  });
}

// 2. Bot-Partien, Replay
for (const seed of [1, 42, 1234567, 0xdeadbeef]) {
  const t0 = performance.now();
  const a = runBot(seed);
  const b = runBot(seed);
  const ms = performance.now() - t0;
  const sa = stats(a);
  check(JSON.stringify(sa) === JSON.stringify(stats(b)), `Seed ${seed}: zweimal gleich (Sektor ${sa.sector}, ${sa.score} Punkte, ${sa.kills} Kills, ${(sa.ticks / 3600).toFixed(1)} min, ${sa.credits} Credits, ${a.phase}) [${(ms / 2).toFixed(0)} ms]`);
  const r = simulateReplay(a.replay());
  check(r.valid && r.score === sa.score && r.ticks === sa.ticks && r.kills === sa.kills, `Seed ${seed}: Replay stimmt (${r.valid ? 'gültig' : r.error}, ${r.score})`);
  const json = JSON.stringify(a.replay());
  console.log(`   Replay-Größe ${(json.length / 1024).toFixed(1)} KB`);
}

if (fails) {
  console.log(`\n${fails} Fehler`);
  process.exit(1);
}
console.log('\nalles gut');
