// Wiedergabe (/replay): für jede Spielversion mit Sim-Kern muss gelten
//   1. der schrittweise Ablauf (ReplayRun) liefert dasselbe Ergebnis wie die Partie selbst,
//   2. aus jedem Schlüsselbild weitergerechnet == durchgerechnet (bitgleicher Zustand),
//   3. Schlüsselbilder überstehen structuredClone (Weg vom Worker in den Hauptthread).
// Partien: je Version eine Bot-Partie; mit REPLAY_DATA=<telemetrie.jsonl> zusätzlich echte Partien
// (Export von GET /api/telemetry – gehört nicht ins Repo).
import { readFileSync } from 'node:fs';
import { botInput } from './bot';
import { CORE_VERSIONS, createSim, whyUnplayable } from '../src/replay/cores';
import { ReplayRun, inputTicks, type ReplayData } from '../src/replay/run';
import { precompute } from '../src/replay/precompute';
import { digest, takeSnapshot } from '../src/replay/snapshot';
import type { Command } from '../src/core/sim/types';

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) fails++;
};

/** Einkauf, der auf jedem Kern läuft: was die Version nicht kennt, lehnt sie ab (oder wirft) */
const SHOP: Command[] = [
  { t: 'repair' }, { t: 'skill', id: 'off1' }, { t: 'skill', id: 'def1' }, { t: 'skill', id: 'tec1' },
  { t: 'weapon', slot: 'wingL', w: 'side' }, { t: 'weapon', slot: 'wingR', w: 'spread' }, { t: 'weapon', slot: 'core', w: 'drone' },
  { t: 'weapon', slot: 'core', w: 'laser' }, { t: 'stat', id: 'armor' }, { t: 'stat', id: 'shield' }, { t: 'upgrade', slot: 'wingL' },
  { t: 'stat', id: 'rig' }, { t: 'weapon', slot: 'wingL2', w: 'beam' }, { t: 'weapon', slot: 'wingR2', w: 'pulse' }, { t: 'bomb' },
  // seit dem Ausbau-Update (ältere Kerne lehnen ab): neue Schiffswerte, Kanonen, Skill-Äste
  { t: 'stat', id: 'regen' }, { t: 'stat', id: 'plating' }, { t: 'stat', id: 'crit' }, { t: 'skill', id: 'gun1' }, { t: 'skill', id: 'pil1' },
  { t: 'weapon', slot: 'wingR', w: 'flak' }, { t: 'weapon', slot: 'wingL', w: 'rail' }, { t: 'weapon', slot: 'core', w: 'plasma' },
];

function botReplay(version: string, seed: number, maxTicks: number) {
  const sim = createSim(version, seed);
  while (sim.phase !== 'over' && sim.tick < maxTicks) {
    if (sim.phase === 'shop') {
      for (const c of SHOP) {
        try {
          sim.command(c);
        } catch {
          /* Kennung in dieser Version unbekannt */
        }
      }
      sim.command({ t: 'launch' });
    } else sim.step(botInput(sim, 0.9));
    sim.drain();
  }
  return { replay: sim.replay() as ReplayData, score: sim.score, ticks: sim.tick, sector: sim.sector };
}

async function verify(label: string, version: string, replay: ReplayData, want: { score: number; ticks: number }) {
  const t0 = performance.now();
  const every = 600;
  const total = inputTicks(replay.inputs);
  // Vorrechnen wie der Worker: Schlüsselbilder alle 600 Ticks
  const snaps: { tick: number; data: unknown }[] = [];
  const pre = await precompute(version, replay, every, 60, (tick, data) => snaps.push({ tick, data }));
  if (!pre) throw new Error('abgebrochen');
  const okResult = pre.stats.end.score === want.score && pre.ticks === want.ticks && total === want.ticks;
  // höchstens 8 Schlüsselbilder prüfen (über die Partie verteilt, das letzte immer)
  const pick = snaps.length <= 8 ? snaps : Array.from({ length: 8 }, (_, i) => snaps[Math.round((i * (snaps.length - 1)) / 7)]);
  // Durchrechnung: Fingerabdruck 317 Ticks nach jedem gewählten Schlüsselbild (oder am Ende)
  const stops = pick.map((s) => Math.min(s.tick + 317, pre.ticks));
  const ref = new Map<number, string>();
  const straight = new ReplayRun(version, replay);
  for (;;) {
    if (straight.atShop) straight.applyShop();
    if (!straight.step()) break;
    if (stops.includes(straight.tick)) ref.set(straight.tick, digest(takeSnapshot(straight.sim)));
  }
  let bad = 0;
  const run = new ReplayRun(version, replay);
  pick.forEach((s, i) => {
    run.restart(structuredClone(s.data));
    if (run.tick !== s.tick) bad++;
    while (run.tick < stops[i] && run.step());
    if (digest(takeSnapshot(run.sim)) !== ref.get(stops[i])) bad++;
  });
  const st = pre.stats;
  check(
    okResult && bad === 0 && !straight.error,
    `${label}: ${okResult ? 'Ergebnis stimmt' : `Ergebnis weicht ab (${pre.stats.end.score}/${pre.ticks} statt ${want.score}/${want.ticks})`}, ` +
      `${pick.length} von ${snaps.length} Schlüsselbildern geprüft${bad ? `, ${bad} Abweichungen` : ''} ` +
      `(Sektor ${st.end.sector}, ${st.end.score} Punkte, ${(pre.ticks / 3600).toFixed(1)} min, ${st.shops.length} Händler, ${st.marks.length} Marken) [${(performance.now() - t0).toFixed(0)} ms]`,
  );
}

for (const version of [...CORE_VERSIONS].sort()) {
  const why = whyUnplayable(version);
  if (why) {
    console.log(`– v${version}: nicht abspielbar (${why})`);
    continue;
  }
  const b = botReplay(version, 20261117, 60 * 60 * 6);
  check(b.replay.actions.length > 0, `v${version}: Bot-Partie mit Händlerbesuch (Sektor ${b.sector}, ${b.replay.actions.length} Aktionen)`);
  await verify(`v${version} Bot`, version, b.replay, b);
}

const file = process.env.REPLAY_DATA;
if (file) {
  console.log(`\nEchte Partien aus ${file}`);
  const seen = new Set<string>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const p = JSON.parse(line) as { id: number; version: string; status: string; score: number; ticks: number; replay: ReplayData };
    if (p.status !== 'ok') continue;
    seen.add(p.version);
    if (whyUnplayable(p.version)) {
      check(false, `#${p.id} v${p.version}: ${whyUnplayable(p.version)}`);
      continue;
    }
    await verify(`#${p.id} v${p.version}`, p.version, p.replay, p);
  }
  console.log(`Versionen mit echten Partien: ${[...seen].sort().join(', ')}`);
}

if (fails) {
  console.log(`\n${fails} Fehler`);
  process.exit(1);
}
console.log('\nalles gut');
