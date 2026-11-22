// Aufbau des Spielerschiffs aus Einzelgrafiken (Ausleger, Träger, Pods, Rumpf-Aufsatz, Schiff, Bordkanone).
// Gemeinsam genutzt vom Renderer (GameScene) und der Händler-Ansicht, damit beide gleich aussehen.
import { CORE_SLOTS, MAX_WEAPON_LVL, OUTER_SLOTS, OUTER2_SLOTS, shipClass, slotOffset, slotY, type SlotId } from '../core/data/shop';
import type { Loadout } from '../core/sim/types';

export interface ShipPart {
  /** Texturname */
  key: string;
  /** Ankerposition relativ zur Schiffsmitte (Spielpixel) */
  x: number;
  y: number;
  /** links gespiegelt */
  flip: boolean;
  /** Zeichenreihenfolge (größer = weiter oben) */
  z: number;
  slot?: SlotId;
  lvl?: number;
  /** Vergrößerung (Bordkanonen-Sponsons auf den großen Schiffsklassen) */
  scale?: number;
}

/** Höhe der Flügel-Steckplätze (wie in der Sim: Abschusspunkt p.y + 2) */
export const WING_Y = 2;

/** Triebwerksflammen je Schiffsklasse: [x, y] relativ zur Schiffsmitte */
export const ENGINES: [number, number][][] = [[[0, 38]], [[-10, 50], [10, 50]], [[-17, 62], [0, 66], [17, 62]]];

/** Textur des Rumpfs je Schiffsklasse */
export function hullKey(cls: number): string {
  return cls >= 2 ? 'player_c2' : cls === 1 ? 'player_c1' : 'player';
}

/** Schiffsklasse aus dem Loadout (ältere Sim-Kerne kennen sie nicht → Jäger) */
export function classOf(loadout: Loadout): number {
  const c = (loadout.stats as Partial<Loadout['stats']>).cls;
  return typeof c === 'number' && c > 0 ? Math.min(2, c) : 0;
}

export function shipLayout(loadout: Loadout, gun: number): ShipPart[] {
  const parts: ShipPart[] = [];
  const slots = loadout.slots;
  const cls = classOf(loadout);
  const sc = shipClass(cls);
  const rig = loadout.stats.rig ?? 0;
  if (rig >= 1) parts.push({ key: rig === 1 && cls === 0 ? 'rig' : `rig_${Math.min(2, rig)}_${cls}`, x: 0, y: 8 + cls * 3, flip: false, z: -4 });
  for (const slot of ['wingL3', 'wingR3', 'wingL2', 'wingR2', 'wingL', 'wingR'] as const) {
    const m = slots[slot];
    if (!m) continue;
    const ox = slotOffset(slot, m.lvl, cls);
    const flip = ox < 0;
    const outer = OUTER_SLOTS.includes(slot) || OUTER2_SLOTS.includes(slot);
    // innere Pods sitzen auf den Flügeln (über dem Schiff), äußere auf dem Ausleger
    const z = outer ? -3 : 0.2;
    // ab Stufe 3: Gitterträger zum Rumpf bzw. zum Ausleger-Ende
    if (m.lvl >= 3) parts.push({ key: 'pylon', x: ox + (flip ? 12 : -12), y: WING_Y + 3, flip, z: outer ? -3.5 : -0.5 });
    parts.push({ key: `pod_${m.w}_${spriteLvl(m.lvl)}`, x: ox, y: WING_Y, flip, z, slot, lvl: m.lvl });
  }
  CORE_SLOTS.forEach((slot, i) => {
    const core = slots[slot];
    if (core) parts.push({ key: `core_${core.w}_${spriteLvl(core.lvl)}`, x: 0, y: slotY(slot, cls), flip: false, z: 0.6 + i * 0.05, slot, lvl: core.lvl });
  });
  parts.push({ key: hullKey(cls), x: 0, y: 0, flip: false, z: 0 });
  if (gun >= 2) parts.push({ key: `hullgun_${Math.min(5, gun)}`, x: 0, y: -sc.noseShift * 0.55, flip: false, z: 0.5, scale: cls ? 1 + (sc.scale - 1) * 0.5 : 1 });
  return parts.sort((a, b) => a.z - b.z);
}

/** Stufe der Anbau-Sprites (Grafiken für Stufe 1–5, Stufe 5 = Evolution) */
export function spriteLvl(lvl: number): number {
  return lvl < 1 ? 1 : lvl > MAX_WEAPON_LVL ? MAX_WEAPON_LVL : lvl;
}
