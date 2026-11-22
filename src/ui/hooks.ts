// Optionale Anbindungen für den Einstellungen-Dialog. Module anderer Lanes werden beim Merge hier
// eingehängt, z. B. in main.ts: `import { music } from './audio/music'; settingsHooks.music = music;`
// Fehlt ein Hook, zeigt der Dialog die zugehörigen Regler deaktiviert an.

/** erwartete Musik-API (src/audio/music.ts) */
export interface MusicHook {
  readonly enabled: boolean;
  /** 0..1 */
  readonly volume: number;
  setEnabled(on: boolean): void;
  setVolume(v: number): void;
}

export const settingsHooks: { music?: MusicHook } = {};
