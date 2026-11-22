/**
 * Welche Spielversionen lassen sich wiedergeben? Ohne Abhängigkeit auf die Kerne selbst, damit auch
 * der Server (Liste: Feld `playable`) dieselbe Regel nutzt wie die Wiedergabeseite.
 *
 * Replays sind versionsgebunden: abgespielt wird mit dem Sim-Kern der Version (aktueller Kern oder
 * ein eingefrorener aus server/cores). Der Renderer ist immer der aktuelle; Versionen, deren Zustand
 * er nicht mehr darstellen kann, stehen in NOT_RENDERABLE (bisher keine: v0.2.0 bis heute geprüft).
 */

/** Spielversion → Grund, warum der aktuelle Renderer sie nicht darstellen kann */
export const NOT_RENDERABLE: Record<string, string> = {};

/**
 * @param version    Spielversion der Partie
 * @param hasCore    gibt es einen Sim-Kern für die Version?
 * @param hasReplay  ist eine Aufzeichnung gespeichert?
 * @returns leer = abspielbar, sonst der Grund
 */
export function unplayableReason(version: string, hasCore: boolean, hasReplay = true): string {
  if (!hasReplay) return 'ohne Aufzeichnung';
  if (!hasCore) return `kein Sim-Kern für v${version}`;
  return NOT_RENDERABLE[version] ?? '';
}
