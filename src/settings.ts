// Spieler-Einstellungen (localStorage, immer in try/catch)
const KEY = 'oganesson.settings';

export interface Settings {
  shake: boolean;
  effects: 'auto' | 'full' | 'low';
  /** Touch/Maus: Verhältnis Fingerweg zu Schiffsweg */
  sensitivity: number;
  /** Tutorial-Sprechblasen anzeigen */
  tips: boolean;
  /** Touch-Steuerung: virtueller Joystick (Standard) oder direktes Ziehen auf dem Feld */
  control: 'stick' | 'drag';
}

export const settings: Settings = { shake: true, effects: 'auto', sensitivity: 1.3, tips: true, control: 'stick' };

try {
  const raw = localStorage.getItem(KEY);
  if (raw) Object.assign(settings, JSON.parse(raw));
} catch {
  /* kein Speicher */
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* egal */
  }
}

/** Rekord lokal */
export function loadBest(): { score: number; sector: number } {
  try {
    const raw = localStorage.getItem('oganesson.best');
    if (raw) return JSON.parse(raw);
  } catch {
    /* nichts */
  }
  return { score: 0, sector: 0 };
}

export function saveBest(b: { score: number; sector: number }) {
  try {
    localStorage.setItem('oganesson.best', JSON.stringify(b));
  } catch {
    /* egal */
  }
}

/** Spielername für die Bestenliste (1–16 Zeichen) */
export const NAME_MAX = 16;

export function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function loadName(): string {
  try {
    return cleanName(localStorage.getItem('oganesson.name') ?? '');
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  const n = cleanName(name);
  try {
    if (n) localStorage.setItem('oganesson.name', n);
    else localStorage.removeItem('oganesson.name');
  } catch {
    /* egal */
  }
}

/** kleiner Helfer für einfache Merker (Tutorial, Hinweise) */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* nichts */
  }
  return fallback;
}

export function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* egal */
  }
}
