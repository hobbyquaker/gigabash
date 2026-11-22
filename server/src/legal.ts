// Impressum, Datenschutz & Lizenzen (§ 18 MStV, Art. 13 DSGVO) unter /impressum (Alias /datenschutz).
// Persönliche Angaben kommen aus der Server-Umgebung, nie aus dem Repo: IMPRESSUM_NAME,
// IMPRESSUM_ADDRESS (Zeilen mit „|“ getrennt), IMPRESSUM_EMAIL. Alle Links sind relativ, damit die
// Seite auch hinter dem Reverse-Proxy unter einem Unterpfad (/gigabash/impressum) stimmt.
//
// Die Angaben zur Datenverarbeitung beschreiben, was der Code tatsächlich tut. Bei Änderungen an
// Datenbank (db.ts), Telemetrie, Rate-Limits, Server-Log oder localStorage-Schlüsseln im Client
// (oganesson.*) bitte hier mitziehen.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface LegalInfo {
  name: string;
  address: string;
  email: string;
  /** Aufbewahrung der Zugriffsprotokolle des Webservers (Tage) */
  logDays: number;
}

export function legalInfo(env: NodeJS.ProcessEnv): LegalInfo {
  return {
    name: (env.IMPRESSUM_NAME ?? '').trim(),
    address: (env.IMPRESSUM_ADDRESS ?? '').trim(),
    email: (env.IMPRESSUM_EMAIL ?? '').trim(),
    logDays: Number(env.LOG_RETENTION_DAYS ?? 14) || 14,
  };
}

/** Sicherheitsrichtlinie: nur Inline-CSS und das kleine Inline-Skript für die E-Mail-Adresse */
export const LEGAL_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

/** @param runMaxAgeH  Gültigkeit eines Spielstarts in Stunden (danach werden Spielkennungen gelöscht) */
export function legalPage(i: LegalInfo, version: string, runMaxAgeH = 12): string {
  const configured = !!(i.name && i.address && i.email);
  const addr = i.address.split('|').map((l) => esc(l.trim())).filter(Boolean).join('<br>');
  // E-Mail leicht verschleiert gegen einfache Sammler (per Skript zusammengesetzt, ohne Skript lesbar mit [at])
  const [user, domain] = i.email.split('@');
  const mail = configured
    ? `<span class="mail" data-u="${esc(user ?? '')}" data-d="${esc(domain ?? '')}">${esc(user ?? '')} [at] ${esc(domain ?? '')}</span>`
    : '';
  const who = configured ? `${esc(i.name)}<br>${addr}<br>E-Mail: ${mail}` : '<em>(noch nicht hinterlegt)</em>';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#070814">
<title>Impressum, Datenschutz &amp; Lizenzen – Oganesson GigaBash</title>
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<style>
  :root { color-scheme: dark; --bg: #070814; --fg: #dfe6ff; --mut: #8d97bd; --card: #10142b; --line: #2a3363; --acc: #4fd8ff; --hot: #ff8a3d;
    --head: 'Russo One', 'Arial Black', Impact, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: radial-gradient(ellipse at 50% -10%, #1b1f4d 0%, transparent 60%), var(--bg); background-attachment: fixed; min-height: 100vh; }
  main { max-width: 760px; margin: 0 auto; padding: 20px 16px 48px; }
  .card { background: color-mix(in srgb, var(--card) 92%, transparent); border: 1px solid var(--line); border-radius: 14px;
    box-shadow: 0 0 0 1px #00000060, 0 10px 30px #00000070; padding: 6px 22px 16px; margin: 18px 0; }
  h1, h2 { font-family: var(--head); font-weight: 700; letter-spacing: 1px; }
  h1 { font-size: 34px; line-height: 1.1; margin: 14px 0 4px; color: #fff; text-shadow: 0 0 18px #4fd8ff80, 0 0 2px #4fd8ff; }
  h2 { font-size: 22px; margin: 14px 0 4px; color: var(--acc); text-transform: uppercase; }
  h3 { font-size: 16px; margin: 16px 0 2px; color: #fff; }
  p, li { margin: 4px 0; }
  .lead, .mut { color: var(--mut); }
  a { color: var(--acc); }
  ul { padding-left: 20px; }
  .back { display: inline-block; padding: 6px 14px; font-weight: 700; text-decoration: none; color: #070814; background: var(--acc);
    border-radius: 999px; box-shadow: 0 0 14px #4fd8ff70; }
</style>
</head>
<body>
<main>
<a class="back" href="./">← zurück zum Spiel</a>
<h1>Impressum, Datenschutz &amp; Lizenzen</h1>
<p class="lead">Oganesson GigaBash ist ein privates, nicht-kommerzielles Hobbyprojekt: keine Werbung, kein Tracking, keine Kosten.</p>

<section class="card">
<h2>Impressum</h2>
<p>Angaben gemäß § 18 Abs. 1 Medienstaatsvertrag (MStV):</p>
<p>${who}</p>
</section>

<section class="card">
<h2>Datenschutz</h2>
<h3>Verantwortlicher</h3>
<p>Verantwortlich für die Datenverarbeitung auf dieser Seite ist die oben im Impressum genannte Person.</p>

<h3>Server-Protokolle</h3>
<p>Beim Aufruf der Seite verarbeitet der Webserver technisch notwendige Daten: IP-Adresse, Zeitpunkt, aufgerufene Adresse,
Browser-Kennung (User-Agent) und Referrer. Das dient dem sicheren Betrieb und der Abwehr von Missbrauch
(Art. 6 Abs. 1 lit. f DSGVO). Diese Zugriffsprotokolle werden nach spätestens ${i.logDays + 1} Tagen automatisch gelöscht.
Das Protokoll des Spielservers selbst enthält keine IP-Adressen und keine Namen, nur technische Angaben wie
„Eintrag Nr. 12, Punkte, Sektor, Platz“.</p>
<p>Zum Schutz vor Missbrauch begrenzt der Spielserver die Zahl der Anfragen je IP-Adresse. Dafür hält er die IP-Adresse
für wenige Minuten im Arbeitsspeicher; sie wird dabei nicht dauerhaft gespeichert.</p>

<h3>Bestenliste</h3>
<p>Wenn du dich nach einer Partie in die Bestenliste einträgst, speichern wir den von dir gewählten Namen zusammen mit Punkten,
erreichtem Sektor, Abschüssen, Spielzeit, Credits, Spielversion und Zeitpunkt. Name, Punkte, Sektor, Abschüsse, Spielzeit und
das Datum (ohne Uhrzeit) sind öffentlich in der Bestenliste sichtbar, dazu die Aufzeichnung der Partie (siehe „Spielaufzeichnungen“).
<b>Bitte verwende einen Spitznamen und nicht deinen echten vollen Namen.</b> Der Eintrag ist freiwillig
(Art. 6 Abs. 1 lit. a und b DSGVO). Auf Anfrage per E-Mail löschen wir deinen Eintrag.</p>

<h3>Spielaufzeichnungen (Replays)</h3>
<p>Damit niemand schummeln kann, rechnet der Server jede eingetragene Partie nach. Dazu schickt das Spiel beim Eintragen das
„Replay“ mit: den Startwert der Partie, deine Steuereingaben (Flugrichtung, Bombe) Bild für Bild und deine Einkäufe beim Händler.
Partien, die du nicht einträgst, verlassen dein Gerät nicht.</p>
<p><b>Öffentliche Wiedergabe:</b> Das Replay wird zusammen mit deinem Bestenlisten-Eintrag gespeichert. Auf der Seite
<a href="replay">Replays</a> kann jeder die eingetragenen Partien ansehen: sichtbar sind der gewählte Name, das Ergebnis
(Punkte, Sektor, Abschüsse, Spielzeit), die Spielversion, das Datum (ohne Uhrzeit) und der Spielablauf selbst, also wie du geflogen
bist und was du beim Händler gekauft hast. Das gilt auch für Einträge aus der Zeit vor der Wiedergabeseite, soweit sich ihre
Aufzeichnung eindeutig zuordnen ließ. Mit dem Eintrag in die Bestenliste willigst du darin ein (Art. 6 Abs. 1 lit. a DSGVO).
Löschen wir deinen Eintrag auf Anfrage, verschwindet auch das Replay aus der Wiedergabe.</p>
<p>Die Statistik auf derselben Seite zeigt nur Gesamtzahlen über alle Einträge (Zahl der Partien je Version und Tag, Spielzeit,
erreichte Sektoren, beliebte Käufe) – ohne Namen und ohne Uhrzeiten.</p>
<p>Zusätzlich speichert der Server jede eingesendete Partie, auch abgelehnte, ohne Namen und ohne IP-Adresse zusammen mit
Ergebnis, Spielversion, Datum und tatsächlicher Spieldauer. Diese Kopie dient nur dazu, die Schwierigkeit des Spiels zu
verbessern (Art. 6 Abs. 1 lit. f DSGVO), und wird nicht veröffentlicht.</p>
<p>Für jede Partie vergibt der Server beim Start eine zufällige Spielkennung mit Startwert und Startzeit, damit jedes Ergebnis nur
einmal eingetragen werden kann. Spielkennungen werden nach ${runMaxAgeH} Stunden gelöscht.</p>

<h3>Speicher im Browser</h3>
<p>Das Spiel speichert im Speicher deines Browsers (localStorage): Einstellungen (Lautstärke, Musik, Effekte, Steuerung, Tipps),
bereits gesehene Tipps und Hinweise, deinen lokalen Rekord, deinen zuletzt verwendeten Namen, die zuletzt gesehene Spielversion
(für „Was ist neu?“) und – bis zum erfolgreichen Eintragen – deine letzte Online-Partie (Replay und Spielstart-Kennung), damit ein
fehlgeschlagener Bestenlisten-Eintrag nachgeholt werden kann. Diese Daten bleiben auf deinem Gerät und sind für die von dir gewünschten Spielfunktionen erforderlich
(§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst sie jederzeit über die Browser-Einstellungen löschen.
Cookies, Tracking und Analyse-Dienste verwenden wir nicht.</p>

<h3>Keine Drittanbieter</h3>
<p>Schriften, Grafiken, Musik und Töne sind im Spiel enthalten. Es werden keine Inhalte von anderen Servern geladen.</p>

<h3>Deine Rechte</h3>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung sowie auf Widerspruch
(Art. 15–21 DSGVO). Schreib dafür einfach eine E-Mail an die Adresse im Impressum. Außerdem kannst du dich bei einer
Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel beim Landesbeauftragten für den Datenschutz und die Informationsfreiheit
Baden-Württemberg.</p>
</section>

<section class="card">
<h2>Open-Source-Lizenzen</h2>
<p>Oganesson verwendet diese freien Komponenten – vielen Dank an ihre Autorinnen und Autoren:</p>
<ul>
<li><a href="https://phaser.io">Phaser 3</a> (MIT-Lizenz), darin enthalten EventEmitter3 (MIT-Lizenz)</li>
<li><a href="https://github.com/KilledByAPixel/ZzFX">ZzFX</a> von Frank Force (MIT-Lizenz)</li>
<li>Schriften <a href="https://fonts.google.com/specimen/Russo+One">Russo One</a> und <a href="https://fonts.google.com/specimen/Exo+2">Exo 2</a>
(SIL Open Font License 1.1), eingebunden über Fontsource</li>
</ul>
<p>Alle Lizenztexte im Wortlaut: <a href="third-party-licenses.txt">third-party-licenses.txt</a>.
Grafiken, Musik und Soundeffekte sind für das Spiel selbst erstellt.</p>
</section>
<p class="mut"><small>Oganesson GigaBash v${esc(version)}</small></p>
</main>
<script>
  for (const m of document.querySelectorAll('.mail')) {
    const a = document.createElement('a');
    a.href = 'mailto:' + m.dataset.u + '@' + m.dataset.d;
    a.textContent = m.dataset.u + '@' + m.dataset.d;
    m.replaceWith(a);
  }
</script>
</body>
</html>`;
}
