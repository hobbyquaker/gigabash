/**
 * Sim-Kerne für die Wiedergabe: aktuelle Sim (src/core) und die eingefrorenen Kerne älterer
 * Spielversionen (server/cores/v*, Liste in cores.gen.ts von scripts/freeze-core.mjs). Ohne DOM,
 * läuft auch im Vorrechen-Worker und im Node-Test.
 *
 * Alle Kerne werden wie die aktuelle Sim angesprochen (Typ `CoreSim`). Was ältere Kerne noch nicht
 * hatten und der aktuelle Renderer liest, ergänzt `createSim` an der Instanz (leere Listen, einfache
 * Ersatzfunktionen) – der Ablauf der Simulation bleibt davon unberührt.
 */
import { Sim } from '../core/sim/sim';
import { APP_VERSION } from '../version';
import { FROZEN_SIMS } from './cores.gen';
import { unplayableReason } from './version';

export type CoreSim = Sim;
type SimCtor = new (seed: number) => CoreSim;

function ctorFor(version: string): SimCtor | null {
  if (version === APP_VERSION) return Sim;
  return Object.prototype.hasOwnProperty.call(FROZEN_SIMS, version) ? (FROZEN_SIMS[version] as SimCtor) : null;
}

/** Versionen, für die es einen Kern gibt (aktuelle zuerst) */
export const CORE_VERSIONS: string[] = [APP_VERSION, ...Object.keys(FROZEN_SIMS).filter((v) => v !== APP_VERSION).reverse()];

export const hasCore = (version: string) => ctorFor(version) !== null;

/** leer = abspielbar, sonst Grund */
export const whyUnplayable = (version: string) => unplayableReason(version, hasCore(version));

/** Frische Sim der Spielversion; wirft, wenn es keinen Kern gibt */
export function createSim(version: string, seed: number): CoreSim {
  const C = ctorFor(version);
  if (!C) throw new Error(`kein Sim-Kern für v${version}`);
  const sim = new C(seed);
  const s = sim as unknown as Record<string, unknown>;
  // vor v0.3.0: keine Strahllaser; vor v0.6.0: kein Sperrfeuer
  if (!Array.isArray(s.beams)) s.beams = [];
  if (!Array.isArray(s.hazards)) s.hazards = [];
  // vor v0.3.0 kannte die Sim shotDamage noch nicht (der Renderer fragt damit die Zahl der Drohnen ab)
  if (typeof s.shotDamage !== 'function') s.shotDamage = (w: string, lvl: number): [number, number] => [w === 'drone' && lvl >= 3 ? 2 : 1, 0];
  return sim;
}
