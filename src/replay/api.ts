/**
 * Client der Wiedergabe-API (GET /api/replays, /api/replays/:id, /api/stats). Alle Aufrufe relativ zur
 * Seite (`api/…`), damit der Server auch unter einem Unterpfad (…/gigabash/replay) funktioniert.
 * Per file:// gibt es keinen Server – die Seite zeigt dann nur den Hinweis „nur online verfügbar“.
 */
import type { StatsReport } from '../../server/src/stats';
import type { ReplayData } from './run';

export type { StatsReport };

export interface ReplayEntry {
  /** Platz nach Punkten innerhalb der gezeigten Auswahl */
  rank: number;
  id: number;
  name: string;
  score: number;
  sector: number;
  kills: number;
  ticks: number;
  version: string;
  /** nur das Datum (YYYY-MM-DD, Europe/Berlin) */
  date: string;
  playable: boolean;
  hasReplay: boolean;
}

export interface ReplayList {
  replays: ReplayEntry[];
  total: number;
  offset: number;
  sort: string;
  dir: 'asc' | 'desc';
  all: boolean;
  /** gezeigte Version (null = alle) */
  version: string | null;
  fallback: boolean;
  /** Sim-Gruppen: Schlüssel = neueste Version, label z. B. „0.6.0–1.0.0“ */
  versions: { version: string; label?: string; n: number }[];
  label?: string | null;
  current: string;
}

export type ReplayDetail = ReplayEntry & { replay: ReplayData | null };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const isOnline = () => location.protocol === 'http:' || location.protocol === 'https:';

const url = (path: string) => new URL(`api/${path}`, location.href).toString();

async function get<T>(path: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url(path), { signal: ctrl.signal, cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!res.ok) throw new ApiError(res.status, json?.message ?? `Serverfehler (${res.status})`);
    if (json === null) throw new ApiError(res.status, 'Ungültige Antwort vom Server.');
    return json;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'Server nicht erreichbar.');
  } finally {
    clearTimeout(timer);
  }
}

export interface ListQuery {
  /** 'all' oder eine Spielversion */
  version: string;
  sort: string;
  dir: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export const fetchReplays = (q: ListQuery) =>
  get<ReplayList>(`replays?${new URLSearchParams({ version: q.version, sort: q.sort, dir: q.dir, limit: String(q.limit), offset: String(q.offset) })}`);

export const fetchReplay = (id: number) => get<ReplayDetail>(`replays/${id}`, 60000);

export const fetchStats = () => get<StatsReport>('stats', 30000);
