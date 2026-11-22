// Balance-Bericht (npm run balance; „-- detail“ zeigt zusätzlich den Verlauf je Sektor für Seed 1).
//
// 3. Kugel-Kennzahlen je Sektor S1–S12: ein „unsterblicher“ starker Bot (Hülle wird nach jedem Tick aufgefüllt)
//    fliegt alle Sektoren; gemessen werden gegnerische Kugeln auf dem Bildschirm (Mittel, 95 %), Kugeln je
//    Sekunde, Schaden je Treffer, erlittener Schaden, Streifschüsse und Dauer.
// 4. Sektor-Probe S1–S12: der unsterbliche Bot bringt das Schiff bis Sektor s, dann spielt ein sterblicher Bot
//    genau diesen Sektor (überlebt / Schaden / Überlebenszeit).
// Umgebungsvariablen: SEEDS (Partien, Standard 12), METRIC_SEEDS (Kennzahlen/Probe, Standard 12).
//
// 1. Ganze Partien: verschiedene Bots spielen 12 Seeds, Todes-Sektor je Seed, Mittel und Median.
// 2. Sektor-Probe „gutes Schiff“: der starke Bot (0.95) fliegt bis Sektor s und kauft ein; dann übernimmt
//    ein anderer Bot genau dieses Schiff für einen Sektor. Gemessen: wie oft er den Sektor überlebt und
//    wie viel Schaden er nimmt. So wird sichtbar, ob Stillstehen mit ausgebauten Waffen bestraft wird.
import { Sim } from '../src/core/sim/sim';
import { botInput, botShop, stillInput, type Dodge } from './bot';
import type { Input } from '../src/core/sim/types';

const SEEDS = Number(process.env.SEEDS ?? 12);
/** Seeds für Kennzahlen-Lauf und Sektor-Probe S1–S12 */
const METRIC_SEEDS = Number(process.env.METRIC_SEEDS ?? 12);
const METRIC_SECTORS = 12;
/** Zeitlimit je Partie (Spielzeit) und Sektor-Deckel: wer weiter kommt, zählt als „SECTOR_CAP+“ */
const MAX_TICKS = 60 * 60 * 150;
const SECTOR_CAP = Number(process.env.SECTOR_CAP ?? 45);
const detail = process.argv.includes('detail');
/** NUR=partien|probe|kennzahlen|probe12|klassen|still (kommagetrennt) beschränkt den Bericht auf einzelne Teile */
const only = (process.env.NUR ?? '').split(',').filter(Boolean);
const part = (id: string) => only.length === 0 || only.includes(id);

interface Bot { name: string; key: string; input: (sim: Sim) => Input }
const mk = (name: string, skill: number, dodge: Dodge = 'always', key = String(skill)): Bot => ({ name, key, input: (s) => botInput(s, skill, dodge) });
const STILL: Bot = { name: 'Stillstand (bewegt sich nie)', key: 'still', input: stillInput };
const BOSS_ONLY = mk('Zielt, weicht nur beim Boss aus', 0.95, 'boss', 'boss');
const PERFECT = mk('Stärke 1.0 (sieht jede Kugel)', 1, 'always', '1.0');
/** BOTS=still,boss,0.5,0.8,0.95,1.0 (kommagetrennt) beschränkt die ganzen Partien auf einzelne Bots */
const onlyBots = (process.env.BOTS ?? '').split(',').filter(Boolean);
const bots: Bot[] = [STILL, BOSS_ONLY, mk('Stärke 0.5', 0.5), mk('Stärke 0.8', 0.8), mk('Stärke 0.95', 0.95), PERFECT]
  .filter((b) => onlyBots.length === 0 || onlyBots.includes(b.key));
/** Kampf-Kennzahlen je Sektor (ganze Partien): Bosskampf-Dauer und Fregatten-Lebensdauer (Sekunden) */
interface Fight { boss: number[]; frig: number[]; frigEsc: number }
const fights = new Map<string, Fight[]>();
const fightOf = (bot: Bot, s: number): Fight => {
  let a = fights.get(bot.name);
  if (!a) fights.set(bot.name, (a = []));
  return (a[s] ??= { boss: [], frig: [], frigEsc: 0 });
};
const strong = mk('Stärke 0.95', 0.95);

/** Phase ohne TS-Einengung (ändert sich durch step) */
const phase = (sim: Sim): string => sim.phase;

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
};

const share = (a: number[], s: number) => `${Math.round((100 * a.filter((x) => x >= s).length) / a.length)} %`;
/** ganze Partie; Ergebnis = Todes-Sektor (höchstens SECTOR_CAP + 1 = „weiter gekommen“) */
const playOut = (bot: Bot, seed: number, noClass = false): number => {
  const sim = new Sim(seed * 7919);
  while (phase(sim) !== 'over' && sim.tick < MAX_TICKS && sim.sector <= SECTOR_CAP) {
    if (phase(sim) === 'shop') botShop(sim, { noClass });
    else sim.step(bot.input(sim));
    sim.drain();
  }
  return sim.sector;
};
const table: string[] = ['| Bot | Tod in Sektor (je Seed) | Mittel | Median | ≥ S6 | ≥ S10 | ≥ S20 | ≥ S30 |', '|---|---|---|---|---|---|---|---|'];
for (const bot of part('partien') ? bots : []) {
  const rows: string[] = [];
  const deaths: number[] = [];
  let timeouts = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const sim = new Sim(seed * 7919);
    let lastSector = 0;
    let hullAtStart = 0;
    let dmgAtStart = 0;
    let bossAt = -1;
    const frigs = new Map<object, number>();
    while (sim.phase !== 'over' && sim.tick < MAX_TICKS && sim.sector <= SECTOR_CAP) {
      // Kampf-Kennzahlen: Fregatten ab dem Erscheinen bis Abschuss (oder Flucht), Bosskampf vom Erscheinen bis Abschuss
      for (const e of sim.enemies) if (e.type === 'frigate' && !frigs.has(e)) frigs.set(e, sim.tick);
      for (const [e, t] of frigs) {
        if (sim.enemies.includes(e as never)) continue;
        frigs.delete(e);
        const f = fightOf(bot, sim.sector);
        if ((e as { hp: number }).hp <= 0) f.frig.push((sim.tick - t) / 60);
        else f.frigEsc++;
      }
      if (sim.phase === 'boss' && bossAt < 0) bossAt = sim.tick;
      if (sim.phase === 'clear' && bossAt >= 0) { fightOf(bot, sim.sector).boss.push((sim.tick - bossAt) / 60); bossAt = -1; }
      if (sim.phase !== 'boss' && sim.phase !== 'clear') bossAt = -1;
      if (sim.sector !== lastSector && sim.phase === 'intro') {
        lastSector = sim.sector;
        hullAtStart = sim.player.hull;
        dmgAtStart = sim.damageTaken;
      }
      if (sim.phase === 'shop') {
        if (seed === 1) rows.push(`  S${sim.sector}: t=${(sim.tick / 3600).toFixed(1)}min dmg=${(sim.damageTaken - dmgAtStart).toFixed(0)} hull ${hullAtStart.toFixed(0)}→${sim.player.hull.toFixed(0)}/${sim.d.maxHull} cr=${sim.credits} kills=${sim.lastSummary?.kills} gun=${sim.player.gun}`);
        botShop(sim);
      } else sim.step(bot.input(sim));
      sim.drain();
    }
    if (sim.phase !== 'over') timeouts++;
    deaths.push(sim.sector);
  }
  const mean = deaths.reduce((a, b) => a + b, 0) / deaths.length;
  const list = deaths.map((d) => (d > SECTOR_CAP ? `${SECTOR_CAP}+` : d)).join(', ') + (timeouts ? ` (${timeouts}× über S${SECTOR_CAP} oder Zeitlimit)` : '');
  console.log(`${bot.name}: Tod in Sektor ${list} · Mittel ${mean.toFixed(1)} · Median ${median(deaths)}`);
  if (detail) console.log(rows.slice(0, 10).join('\n'));
  table.push(`| ${bot.name} | ${list} | ${mean.toFixed(1)} | ${median(deaths)} | ${share(deaths, 6)} | ${share(deaths, 10)} | ${share(deaths, 20)} | ${share(deaths, 30)} |`);
}
if (part('partien')) console.log('\n' + table.join('\n'));
if (part('partien')) {
  const avgS = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '–');
  for (const bot of bots) {
    const a = fights.get(bot.name);
    if (!a || !a.some((f) => f && f.boss.length)) continue;
    const ft: string[] = ['| Sektor | Bosskampf Ø s (n) | Fregatte Ø s (abgeschossen / entkommen) |', '|---|---|---|'];
    for (let s2 = 1; s2 < a.length && s2 <= 30; s2++) {
      const f = a[s2];
      if (!f) continue;
      ft.push(`| S${s2} | ${avgS(f.boss)} (${f.boss.length}) | ${avgS(f.frig)} (${f.frig.length} / ${f.frigEsc}) |`);
    }
    console.log(`\nKampfdauer je Sektor – ${bot.name} (${SEEDS} Seeds, nur Kämpfe, die er erlebt hat):`);
    console.log(ft.join('\n'));
  }
}

// ── Schiffsklassen (Endspiel): Kreuzer ab S20, Schlachtschiff ab S30 ──
// Die starken Bots spielen jede Partie zweimal: einmal kaufen sie die Schiffsklassen, sobald es geht, einmal nie.
if (part('klassen')) {
  const kt: string[] = ['| Bot | Schiffsklassen | Ø Todes-Sektor | Median | ≥ S20 | ≥ S25 | ≥ S30 | ≥ S35 | ≥ S40 |', '|---|---|---|---|---|---|---|---|---|'];
  for (const bot of [mk('Stärke 0.95', 0.95), PERFECT]) {
    for (const noClass of [false, true]) {
      const d: number[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) d.push(playOut(bot, seed, noClass));
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      kt.push(`| ${bot.name} | ${noClass ? 'nie gekauft' : 'gekauft, sobald möglich'} | ${mean.toFixed(1)} | ${median(d)} | ${share(d, 20)} | ${share(d, 25)} | ${share(d, 30)} | ${share(d, 35)} | ${share(d, 40)} |`);
    }
  }
  console.log(`\nSchiffsklassen (${SEEDS} Seeds; Kreuzer vor Sektor 20, Schlachtschiff vor Sektor 30; Deckel S${SECTOR_CAP}):`);
  console.log(kt.join('\n'));
}

// ── Sektor-Probe ──
const PROBE_SECTORS = part('probe') ? [1, 2, 3, 4, 5, 6] : [];
const PROBE_SEEDS = 8;
const probeBots = [STILL, BOSS_ONLY, strong];
const probe: string[] = [
  '| Sektor | ' + probeBots.map((b) => b.name).join(' | ') + ' |',
  '|---|' + probeBots.map(() => '---|').join(''),
];
if (part('probe')) console.log('\nSektor-Probe mit dem Schiff des starken Bots (überlebt / Schaden in % der Hülle zu Sektorbeginn / Ø Sekunden im Sektor):');
for (const s of PROBE_SECTORS) {
  const cells: string[] = [];
  for (const bot of probeBots) {
    let survived = 0;
    let n = 0;
    let dmgPct = 0;
    let alive = 0;
    for (let seed = 1; seed <= PROBE_SEEDS; seed++) {
      const sim = new Sim(seed * 7919);
      // starker Bot bis zum Beginn von Sektor s
      while (phase(sim) !== 'over' && !(sim.sector === s && phase(sim) === 'intro')) {
        if (phase(sim) === 'shop') botShop(sim);
        else sim.step(strong.input(sim));
        sim.drain();
      }
      if (phase(sim) === 'over') continue; // der starke Bot kam selbst nicht so weit
      n++;
      const hull0 = sim.player.hull + sim.player.shield;
      const dmg0 = sim.damageTaken;
      const t0 = sim.tick;
      while (phase(sim) !== 'over' && phase(sim) !== 'shop') {
        sim.step(bot.input(sim));
        sim.drain();
      }
      if (phase(sim) === 'shop') survived++;
      alive += sim.tick - t0;
      dmgPct += Math.min(1, (sim.damageTaken - dmg0) / hull0);
    }
    cells.push(n ? `${survived}/${n} · ${Math.round((dmgPct / n) * 100)} % · ${Math.round(alive / n / 60)} s` : '–');
  }
  const line = `| S${s} | ${cells.join(' | ')} |`;
  probe.push(line);
  console.log(line);
}
if (part('probe')) console.log('\n' + probe.join('\n'));

// ── Kugel-Kennzahlen je Sektor (unsterblicher starker Bot) ──
/** Schritt mit aufgefüllter Hülle: der Bot kann nicht sterben, Treffer und Schaden werden trotzdem gezählt */
const immortalStep = (sim: Sim, input: Input) => {
  sim.step(input);
  if (sim.player.hull < sim.d.maxHull) sim.player.hull = sim.d.maxHull;
};
/** unsterblicher starker Bot bis zum Beginn (Intro) von Sektor s */
const leadTo = (seed: number, s: number): Sim => {
  const sim = new Sim(seed * 7919);
  while (!(sim.sector === s && phase(sim) === 'intro')) {
    if (phase(sim) === 'shop') botShop(sim);
    else immortalStep(sim, strong.input(sim));
    sim.drain();
  }
  return sim;
};
const quantile = (hist: number[], total: number, q: number) => {
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i] ?? 0;
    if (acc >= total * q) return i;
  }
  return hist.length - 1;
};

interface Metric {
  ticks: number; sum: number; hist: number[];
  flightTicks: number; flightSum: number; bossTicks: number; bossSum: number; endTicks: number; endSum: number;
  fired: number; hits: number; hitDmg: number; dmg: number; laser: number; ram: number; grazes: number; rewards: number; n: number;
}
const metrics: Metric[] = Array.from({ length: METRIC_SECTORS + 1 }, () => ({
  ticks: 0, sum: 0, hist: [], flightTicks: 0, flightSum: 0, bossTicks: 0, bossSum: 0, endTicks: 0, endSum: 0,
  fired: 0, hits: 0, hitDmg: 0, dmg: 0, laser: 0, ram: 0, grazes: 0, rewards: 0, n: 0,
}));
for (let seed = 1; seed <= (part('kennzahlen') ? METRIC_SEEDS : 0); seed++) {
  const sim = new Sim(seed * 7919);
  let seen = new WeakSet<object>();
  while (sim.sector <= METRIC_SECTORS) {
    if (phase(sim) === 'shop') {
      botShop(sim);
      seen = new WeakSet<object>();
      sim.drain();
      continue;
    }
    const m = metrics[sim.sector];
    const ph = phase(sim);
    if (ph === 'intro' && sim.phaseT === 0) m.n++;
    const g0 = sim.player.grazes;
    const d0 = sim.damageTaken;
    immortalStep(sim, strong.input(sim));
    m.grazes += sim.player.grazes - g0;
    m.dmg += sim.damageTaken - d0;
    for (const ev of sim.drain()) {
      if (ev.e === 'playerHit') {
        if (ev.cause === 'bullet') { m.hits++; m.hitDmg += ev.dmg; }
        else if (ev.cause === 'laser') m.laser++;
        else m.ram++;
      } else if (ev.e === 'grazeReward') m.rewards++;
    }
    for (const b of sim.ebullets) if (!seen.has(b)) { seen.add(b); m.fired++; }
    if (ph === 'flight' || ph === 'boss') {
      const c = sim.ebullets.length;
      m.ticks++;
      m.sum += c;
      m.hist[c] = (m.hist[c] ?? 0) + 1;
      if (ph === 'flight') { m.flightTicks++; m.flightSum += c; } else { m.bossTicks++; m.bossSum += c; }
      // letzte Boss-Phase (unter 33 % Leben): dort ist der Bildschirm am vollsten
      if (ph === 'boss' && sim.boss && sim.boss.hp <= sim.boss.maxHp * 0.33) { m.endTicks++; m.endSum += c; }
    }
  }
}
const f1 = (x: number) => x.toFixed(1);
if (part('kennzahlen')) {
const mt: string[] = [
  '| Sektor | Kugeln Ø | Kugeln 95 % | Ø Flug | Ø Boss | Ø Boss-Endphase | Kugeln/s | Schaden/Treffer | Kugeltreffer | Laser/Ramm | Schaden | Streifschüsse | Streif-Belohnungen | Dauer |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];
for (let s = 1; s <= METRIC_SECTORS; s++) {
  const m = metrics[s];
  mt.push(`| S${s} | ${f1(m.sum / m.ticks)} | ${quantile(m.hist, m.ticks, 0.95)} | ${f1(m.flightSum / m.flightTicks)} | ${f1(m.bossSum / m.bossTicks)} | ${m.endTicks ? f1(m.endSum / m.endTicks) : '–'} | ${f1(m.fired / (m.ticks / 60))} | ${m.hits ? f1(m.hitDmg / m.hits) : '–'} | ${f1(m.hits / m.n)} | ${f1(m.laser / m.n)} / ${f1(m.ram / m.n)} | ${Math.round(m.dmg / m.n)} | ${Math.round(m.grazes / m.n)} | ${(m.rewards / m.n).toFixed(2)} | ${Math.round(m.ticks / m.n / 60)} s |`);
}
const avg = (from: number, to: number, f: (m: Metric) => number) => {
  let a = 0;
  for (let s = from; s <= to; s++) a += f(metrics[s]);
  return a / (to - from + 1);
};
console.log(`\nKugel-Kennzahlen je Sektor (unsterblicher Bot Stärke 0.95, ${METRIC_SEEDS} Seeds; Werte je Sektor-Durchlauf):`);
console.log(mt.join('\n'));
console.log(`Mittel S4–S5: ${f1(avg(4, 5, (m) => m.sum / m.ticks))} Kugeln · Mittel S6–S12: ${f1(avg(6, 12, (m) => m.sum / m.ticks))} Kugeln · 95 % S6–S12: ${f1(avg(6, 12, (m) => quantile(m.hist, m.ticks, 0.95)))} · Schaden S6–S12: ${Math.round(avg(6, 12, (m) => m.dmg / m.n))} · Streif-Belohnungen S6–S12: ${avg(6, 12, (m) => m.rewards / m.n).toFixed(2)}`);
}

// ── Sektor-Probe S1–S12 (Schiff vom unsterblichen Bot, dann sterblich) ──
const probe2Bots = [STILL, BOSS_ONLY, mk('Stärke 0.8', 0.8), strong];
const probe2: string[] = [
  '| Sektor | ' + probe2Bots.map((b) => b.name).join(' | ') + ' |',
  '|---|' + probe2Bots.map(() => '---|').join(''),
];
const tot = probe2Bots.map(() => ({ surv: 0, n: 0, dmg: 0, pct: 0 }));
for (let s = 1; s <= (part('probe12') ? METRIC_SECTORS : 0); s++) {
  const cells: string[] = [];
  probe2Bots.forEach((bot, bi) => {
    let survived = 0;
    let dmg = 0;
    let dmgPct = 0;
    let alive = 0;
    for (let seed = 1; seed <= METRIC_SEEDS; seed++) {
      const sim = leadTo(seed, s);
      const hull0 = sim.player.hull + sim.player.shield;
      const dmg0 = sim.damageTaken;
      const t0 = sim.tick;
      while (phase(sim) !== 'over' && phase(sim) !== 'shop') {
        sim.step(bot.input(sim));
        sim.drain();
      }
      if (phase(sim) === 'shop') survived++;
      alive += sim.tick - t0;
      dmg += sim.damageTaken - dmg0;
      dmgPct += Math.min(1, (sim.damageTaken - dmg0) / hull0);
    }
    const n = METRIC_SEEDS;
    if (s >= 6) { tot[bi].surv += survived; tot[bi].n += n; tot[bi].dmg += dmg; tot[bi].pct += dmgPct; }
    cells.push(`${survived}/${n} · ${Math.round(dmg / n)} (${Math.round((dmgPct / n) * 100)} %) · ${Math.round(alive / n / 60)} s`);
  });
  probe2.push(`| S${s} | ${cells.join(' | ')} |`);
}
if (part('probe12')) {
probe2.push(`| S6–S12 | ${tot.map((t) => `${t.surv}/${t.n} · ${Math.round(t.dmg / t.n)} (${Math.round((t.pct / t.n) * 100)} %)`).join(' | ')} |`);
console.log('\nSektor-Probe S1–S12, Schiff vom unsterblichen Bot (überlebt / erlittener Schaden absolut und in % der Hülle+Schild zu Sektorbeginn / Ø Sekunden im Sektor):');
console.log(probe2.join('\n'));
}

// ── Stillstand-Probe S6–S12: ausgebautes Schiff (unsterblicher Bot bis Sektor s), der starke Bot fliegt den Sektor
// sterblich an, nach 30 s Flug bleibt er stehen (wie ein Spieler, der „einfach mal stehen bleibt“).
// Gemessen: Sekunden vom Stehenbleiben bis zum Tod (Notschild und Phönix zählen mit) und wie oft er überlebt.
if (part('still')) {
  const st: string[] = ['| Sektor | überlebt | Ø s bis zum Tod | min–max s | Hülle+Schild beim Anhalten |', '|---|---|---|---|---|'];
  let allT = 0, allN = 0, allSurv = 0, allRuns = 0;
  for (let s = 6; s <= METRIC_SECTORS; s++) {
    const ts: number[] = [];
    let surv = 0;
    let hs = 0;
    for (let seed = 1; seed <= METRIC_SEEDS; seed++) {
      const sim = leadTo(seed, s);
      while (phase(sim) !== 'over' && phase(sim) !== 'shop' && !(phase(sim) === 'flight' && sim.flightT >= 30 * 60) && phase(sim) !== 'boss') {
        sim.step(strong.input(sim));
        sim.drain();
      }
      hs += sim.player.hull + sim.player.shield;
      const t0 = sim.tick;
      while (phase(sim) !== 'over' && phase(sim) !== 'shop') {
        sim.step(stillInput(sim));
        sim.drain();
      }
      if (phase(sim) === 'over') ts.push((sim.tick - t0) / 60);
      else surv++;
    }
    allRuns += METRIC_SEEDS; allSurv += surv;
    for (const t of ts) { allT += t; allN++; }
    const mean = ts.length ? (ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(1) : '–';
    const mm = ts.length ? `${Math.min(...ts).toFixed(1)}–${Math.max(...ts).toFixed(1)}` : '–';
    st.push(`| S${s} | ${surv}/${METRIC_SEEDS} | ${mean} | ${mm} | ${Math.round(hs / METRIC_SEEDS)} |`);
  }
  st.push(`| S6–S12 | ${allSurv}/${allRuns} | ${allN ? (allT / allN).toFixed(1) : '–'} | | |`);
  console.log(`\nStillstand-Probe (Schiff des unsterblichen starken Bots, nach 30 s Flug stehen bleiben; ${METRIC_SEEDS} Seeds):`);
  console.log(st.join('\n'));
}
