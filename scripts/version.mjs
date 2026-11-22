// Versionsnummer des Spiels nach SemVer: `version` aus package.json, von Hand gepflegt.
//   Minor (0.5.0 → 0.6.0): jedes Release mit neuen Features
//   Patch (0.5.0 → 0.5.1): Releases nur mit Bugfixes
//   Major: bleibt 0, solange das Spiel in Entwicklung ist
// Erhöhen: `npm version minor --no-git-tag-version` bzw. `patch`, dazu Eintrag in src/changelog.ts.
// Dazu der Commit-Hash (mit "-dirty" bei nicht committeten Änderungen) und das Build-Datum.
//
// Im Docker-Build gibt es kein .git. Dort steht die vorab berechnete Version in der Datei
// VERSION (geschrieben vom Deploy bzw. der CI: node scripts/version.mjs --deploy > VERSION), die hier Vorrang hat.
//
// Aufruf auf der Kommandozeile: node scripts/version.mjs [--deploy]
//   gibt die Version als JSON aus; mit --deploy wird der Arbeitsstand ignoriert (Commit-Stand).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};

/** @returns {{ version: string, commit: string, date: string }} */
export function computeVersion({ ignoreDirty = false } = {}) {
  const file = join(root, 'VERSION');
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* kaputte Datei: neu berechnen */
    }
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  let commit = git('rev-parse --short HEAD') || 'unbekannt';
  if (!ignoreDirty && git('status --porcelain')) commit += '-dirty';
  return { version: String(pkg.version), commit, date: new Date().toISOString().slice(0, 10) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stdout.write(JSON.stringify(computeVersion({ ignoreDirty: process.argv.includes('--deploy') })));
}
