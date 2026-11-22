import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Speicherung in SQLite über das eingebaute node:sqlite (keine nativen Abhängigkeiten).
// Tabellen:
//   runs   – vergebene Spielstarts (Einmal-Einlösung)
//   scores – Bestenliste, nur vom Server nachgerechnete Werte; dazu das Replay der Partie (gzip) für die
//            öffentliche Wiedergabe unter /replay – es verschwindet mit dem Eintrag
//   plays  – anonyme Telemetrie: jede eingesendete Partie als gzip-Replay (ohne Name, IP und Run-ID,
//            also nicht mit der Bestenliste verknüpfbar)

export interface ScoreRow {
  id: number;
  name: string;
  score: number;
  sector: number;
  kills: number;
  ticks: number;
  version: string;
  createdAt: number;
}

export interface RankedRow extends ScoreRow {
  rank: number;
  /** Aufzeichnung gespeichert (Wiedergabe unter /replay) */
  hasReplay: boolean;
}

/** Zeile der Wiedergabe-Liste: Platz nach Punkten innerhalb des Filters, unabhängig von der Sortierung */
export type ReplayRow = RankedRow;

export type ReplaySort = 'score' | 'date' | 'sector';

export interface NewScore {
  runId: string;
  name: string;
  score: number;
  sector: number;
  kills: number;
  ticks: number;
  credits: number;
  version: string;
  commit: string;
  /** gzip-komprimiertes Replay-JSON (für die Wiedergabe) */
  replay?: Uint8Array | null;
}

export interface NewPlay {
  version: string;
  commit: string;
  seed: number;
  /** 'ok' oder Ablehnungsgrund */
  status: string;
  score: number;
  sector: number;
  kills: number;
  ticks: number;
  credits: number;
  realMs: number;
  simMs: number;
  /** gzip-komprimiertes Replay-JSON */
  replay: Uint8Array;
}

export interface PlayRow extends Omit<NewPlay, 'replay'> {
  id: number;
  createdAt: number;
  replay: Uint8Array;
}

export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        seed INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        sector INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        ticks INTEGER NOT NULL,
        credits INTEGER NOT NULL,
        version TEXT NOT NULL,
        commit_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, id ASC);
      CREATE TABLE IF NOT EXISTS plays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        commit_id TEXT NOT NULL,
        seed INTEGER NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL,
        sector INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        ticks INTEGER NOT NULL,
        credits INTEGER NOT NULL,
        real_ms INTEGER NOT NULL,
        sim_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        replay BLOB NOT NULL
      );
    `);
    this.migrate();
  }

  /** Schema älterer Datenbanken nachziehen (idempotent) */
  private migrate() {
    const cols = (this.db.prepare('PRAGMA table_info(scores)').all() as { name: string }[]).map((c) => c.name);
    // seit v1.0.0: Replay am Bestenlisten-Eintrag (vorher nur anonym in plays)
    if (!cols.includes('replay')) this.db.exec('ALTER TABLE scores ADD COLUMN replay BLOB');
  }

  /**
   * Einträge aus der Zeit vor der Replay-Spalte mit ihrer Partie aus der Telemetrie (plays) verknüpfen:
   * nur wenn das nachgerechnete Ergebnis (Punkte, Ticks, Version, Sektor, Abschüsse) genau eine
   * angenommene Partie und genau einen Eintrag trifft. Idempotent; liefert, wie viele Einträge ein
   * Replay bekommen haben und wie viele weiter ohne sind (von Hand eingetragene, mehrdeutige).
   */
  backfillReplays(): { filled: number; missing: number } {
    const open = this.db
      .prepare('SELECT id, score, ticks, version, sector, kills FROM scores WHERE replay IS NULL')
      .all() as { id: number; score: number; ticks: number; version: string; sector: number; kills: number }[];
    const same = 'score = ? AND ticks = ? AND version = ? AND sector = ? AND kills = ?';
    const twins = this.db.prepare(`SELECT COUNT(*) AS n FROM scores WHERE ${same}`);
    const plays = this.db.prepare(`SELECT id, replay FROM plays WHERE status = 'ok' AND ${same} LIMIT 2`);
    const put = this.db.prepare('UPDATE scores SET replay = ? WHERE id = ? AND replay IS NULL');
    let filled = 0;
    for (const s of open) {
      const key = [s.score, s.ticks, s.version, s.sector, s.kills] as const;
      if (Number((twins.get(...key) as { n: number }).n) !== 1) continue;
      const found = plays.all(...key) as { id: number; replay: Uint8Array }[];
      if (found.length !== 1) continue;
      filled += Number(put.run(found[0].replay, s.id).changes);
    }
    return { filled, missing: open.length - filled };
  }

  addRun(id: string, seed: number, startedAt: number) {
    this.db.prepare('INSERT INTO runs (id, seed, started_at) VALUES (?, ?, ?)').run(id, seed, startedAt);
  }

  /** Markiert den Run als benutzt. false, wenn unbekannt oder schon eingelöst. */
  consumeRun(id: string, now = Date.now()): boolean {
    const r = this.db.prepare('UPDATE runs SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, id);
    return Number(r.changes) === 1;
  }

  /** Run wieder freigeben (Server konnte die Einsendung nicht verarbeiten) */
  releaseRun(id: string) {
    this.db.prepare('UPDATE runs SET used_at = NULL WHERE id = ?').run(id);
  }

  /** Runs entfernen, deren Token ohnehin abgelaufen ist */
  pruneRuns(olderThan: number) {
    this.db.prepare('DELETE FROM runs WHERE started_at < ?').run(olderThan);
  }

  addScore(s: NewScore, now = Date.now()): number {
    const r = this.db
      .prepare(`INSERT INTO scores (run_id, name, score, sector, kills, ticks, credits, version, commit_id, created_at, replay)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.runId, s.name, s.score, s.sector, s.kills, s.ticks, s.credits, s.version, s.commit, now, s.replay ?? null);
    return Number(r.lastInsertRowid);
  }

  /** Platz (1-basiert) und Gesamtzahl */
  /**
   * Platz eines Eintrags; mit `version` nur unter den Einträgen dieser Spielversion
   * (wie die Bestenliste im Spiel sie zeigt), sonst über alle Versionen.
   */
  rankOf(id: number, versions?: string[] | null): { rank: number; total: number } | null {
    const row = this.db.prepare('SELECT score FROM scores WHERE id = ?').get(id) as { score: number } | undefined;
    if (!row) return null;
    const v = versions ? JSON.stringify(versions) : null;
    const better = this.db
      .prepare('SELECT COUNT(*) AS n FROM scores WHERE (score > ? OR (score = ? AND id < ?)) AND (? IS NULL OR version IN (SELECT value FROM json_each(?)))')
      .get(row.score, row.score, id, v, v) as { n: number };
    return { rank: Number(better.n) + 1, total: this.count(versions) };
  }

  /** Anzahl Einträge; `versions` = nur diese Spielversionen (null = alle) */
  count(versions?: string[] | null): number {
    const v = versions ? JSON.stringify(versions) : null;
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM scores WHERE (? IS NULL OR version IN (SELECT value FROM json_each(?)))').get(v, v) as { n: number }).n);
  }

  /** Versionen mit Einträgen */
  versions(): string[] {
    return (this.db.prepare('SELECT DISTINCT version FROM scores').all() as { version: string }[]).map((r) => r.version);
  }

  top(limit: number, offset = 0, versions?: string[] | null): RankedRow[] {
    const v = versions ? JSON.stringify(versions) : null;
    const rows = this.db
      .prepare(`SELECT id, name, score, sector, kills, ticks, version, created_at AS createdAt, replay IS NOT NULL AS hasReplay FROM scores
        WHERE (? IS NULL OR version IN (SELECT value FROM json_each(?))) ORDER BY score DESC, id ASC LIMIT ? OFFSET ?`)
      .all(v, v, limit, offset) as unknown as (ScoreRow & { hasReplay: number })[];
    return rows.map((r, i) => ({ ...r, hasReplay: !!r.hasReplay, rank: offset + i + 1 }));
  }

  /** Einträge je Spielversion */
  versionCounts(): { version: string; n: number }[] {
    return (this.db.prepare('SELECT version, COUNT(*) AS n FROM scores GROUP BY version').all() as { version: string; n: number }[])
      .map((r) => ({ version: r.version, n: Number(r.n) }));
  }

  /**
   * Liste für die Wiedergabeseite: Bestenlisten-Einträge (einer Version oder aller) mit Platz nach
   * Punkten, sortiert nach Punkten, Datum oder Sektor.
   */
  replayList(versions: string[] | null, sort: ReplaySort, desc: boolean, limit: number, offset: number): ReplayRow[] {
    const vj = versions ? JSON.stringify(versions) : null;
    const d = desc ? 'DESC' : 'ASC';
    const order = sort === 'date' ? `created_at ${d}, id ${d}` : sort === 'sector' ? `sector ${d}, score ${d}, id ASC` : `score ${d}, id ${desc ? 'ASC' : 'DESC'}`;
    const rows = this.db
      .prepare(`SELECT * FROM (
          SELECT id, name, score, sector, kills, ticks, version, created_at, created_at AS createdAt, replay IS NOT NULL AS hasReplay,
            ROW_NUMBER() OVER (ORDER BY score DESC, id ASC) AS rank
          FROM scores WHERE (? IS NULL OR version IN (SELECT value FROM json_each(?)))
        ) ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(vj, vj, limit, offset) as unknown as (ReplayRow & { created_at?: number })[];
    return rows.map(({ created_at: _c, ...r }) => ({ ...r, rank: Number(r.rank), hasReplay: !!r.hasReplay }));
  }

  /** Ein Eintrag mit Replay (gzip) oder null */
  replayOf(id: number): { row: ScoreRow; replay: Uint8Array | null } | null {
    const r = this.db
      .prepare('SELECT id, name, score, sector, kills, ticks, version, created_at AS createdAt, replay FROM scores WHERE id = ?')
      .get(id) as (ScoreRow & { replay: Uint8Array | null }) | undefined;
    if (!r) return null;
    const { replay, ...row } = r;
    return { row, replay: replay ?? null };
  }

  /** Alle Einträge für die Gesamtstatistik (ohne Namen) */
  statRows(): { id: number; score: number; sector: number; kills: number; ticks: number; version: string; createdAt: number; hasReplay: boolean }[] {
    return (this.db
      .prepare('SELECT id, score, sector, kills, ticks, version, created_at AS createdAt, replay IS NOT NULL AS hasReplay FROM scores ORDER BY id')
      .all() as unknown as { id: number; score: number; sector: number; kills: number; ticks: number; version: string; createdAt: number; hasReplay: number }[])
      .map((r) => ({ ...r, hasReplay: !!r.hasReplay }));
  }

  replayBlob(id: number): Uint8Array | null {
    const r = this.db.prepare('SELECT replay FROM scores WHERE id = ?').get(id) as { replay: Uint8Array | null } | undefined;
    return r?.replay ?? null;
  }

  deleteScore(id: number): boolean {
    return Number(this.db.prepare('DELETE FROM scores WHERE id = ?').run(id).changes) === 1;
  }

  /** Telemetrie-Partie speichern; Zeitpunkt nur auf den Tag genau (nicht mit der Bestenliste verknüpfbar) */
  addPlay(p: NewPlay, now = Date.now()) {
    const day = now - (now % 86_400_000);
    this.db
      .prepare(`INSERT INTO plays (version, commit_id, seed, status, score, sector, kills, ticks, credits, real_ms, sim_ms, created_at, replay)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(p.version, p.commit, p.seed, p.status, p.score, p.sector, p.kills, p.ticks, p.credits, p.realMs, p.simMs, day, p.replay);
  }

  /** Telemetrie ab id > since, aufsteigend */
  plays(since: number, limit: number): PlayRow[] {
    return this.db
      .prepare(`SELECT id, version, commit_id AS "commit", seed, status, score, sector, kills, ticks, credits,
        real_ms AS realMs, sim_ms AS simMs, created_at AS createdAt, replay FROM plays WHERE id > ? ORDER BY id LIMIT ?`)
      .all(since, limit) as unknown as PlayRow[];
  }

  countPlays(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM plays').get() as { n: number }).n);
  }

  close() {
    this.db.close();
  }
}
