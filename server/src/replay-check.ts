import { SKILLS, SLOTS, STATS, WEAPONS } from '../../src/core/data/shop';
import type { Command, Replay } from '../../src/core/sim/types';

// Formprüfung eines eingesendeten Replays, bevor es nachgerechnet wird (billig, ohne Simulation).
// Das Replay wird dabei neu aufgebaut: nur bekannte Felder und Kennungen, nur ganze Zahlen. So
// erreichen weder fremde Eigenschaften noch Kennungen wie "__proto__" die Simulation.

/** Obergrenze für Shop-Aktionen (eine lange Partie hat einige Hundert) */
export const MAX_ACTIONS = 20_000;
/** Obergrenze für RLE-Einträge (4 Zahlen je Eintrag) */
export const MAX_INPUT_RUNS = 1_000_000;

const STAT_IDS = new Set<string>(STATS.map((s) => s.id));
const SLOT_IDS = new Set<string>(SLOTS);
const WEAPON_IDS = new Set<string>(WEAPONS.map((w) => w.id));
const SKILL_IDS = new Set<string>(SKILLS.map((s) => s.id));

export type CheckResult = { ok: true; replay: Replay; inputTicks: number } | { ok: false; reason: string };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

function command(a: Record<string, unknown>): Command | null {
  switch (a.t) {
    case 'stat':
      return typeof a.id === 'string' && STAT_IDS.has(a.id) ? { t: 'stat', id: a.id as never } : null;
    case 'weapon':
      return typeof a.slot === 'string' && SLOT_IDS.has(a.slot) && typeof a.w === 'string' && WEAPON_IDS.has(a.w)
        ? { t: 'weapon', slot: a.slot as never, w: a.w as never }
        : null;
    case 'upgrade':
    case 'sell':
      return typeof a.slot === 'string' && SLOT_IDS.has(a.slot) ? { t: a.t, slot: a.slot as never } : null;
    case 'skill':
      return typeof a.id === 'string' && SKILL_IDS.has(a.id) ? { t: 'skill', id: a.id as never } : null;
    case 'repair':
    case 'bomb':
    case 'launch':
      return { t: a.t };
    default:
      return null;
  }
}

/**
 * @param raw  Replay aus der Einsendung
 * @param seed Seed aus dem signierten Spielstart
 */
export function checkReplay(raw: unknown, seed: number): CheckResult {
  const fail = (reason: string): CheckResult => ({ ok: false, reason });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Replay fehlt oder hat ein unbekanntes Format.');
  const r = raw as Record<string, unknown>;
  if (r.seed !== seed) return fail('Replay gehört zu einem anderen Spiel.');
  if (!Array.isArray(r.inputs) || !Array.isArray(r.actions)) return fail('Replay hat ein unbekanntes Format.');
  const inp = r.inputs as unknown[];
  if (inp.length === 0 || inp.length % 4 !== 0) return fail('Eingaben haben ein unbekanntes Format.');
  if (inp.length / 4 > MAX_INPUT_RUNS) return fail('Replay ist zu lang.');
  if (r.actions.length > MAX_ACTIONS) return fail('Replay hat zu viele Aktionen.');

  const inputs = new Array<number>(inp.length);
  let inputTicks = 0;
  for (let i = 0; i < inp.length; i += 4) {
    const n = inp[i];
    const mx = inp[i + 1];
    const my = inp[i + 2];
    const fl = inp[i + 3];
    if (!isInt(n) || n < 1 || !isInt(mx) || !isInt(my) || mx < -100 || mx > 100 || my < -100 || my > 100 || (fl !== 0 && fl !== 1)) {
      return fail(`Eingabe ${i / 4} ungültig.`);
    }
    inputTicks += n;
    inputs[i] = n;
    inputs[i + 1] = mx;
    inputs[i + 2] = my;
    inputs[i + 3] = fl;
  }

  const actions: Replay['actions'] = [];
  let last = 0;
  for (let i = 0; i < r.actions.length; i++) {
    const a = r.actions[i] as unknown;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return fail(`Aktion ${i} ungültig.`);
    const o = a as Record<string, unknown>;
    const cmd = command(o);
    if (!cmd || !isInt(o.tick) || o.tick < last || o.tick > inputTicks) return fail(`Aktion ${i} ungültig.`);
    last = o.tick;
    actions.push({ tick: o.tick, ...cmd });
  }
  return { ok: true, replay: { seed, inputs, actions }, inputTicks };
}
