// Änderungsprotokoll für „Was ist neu?“ – spielerverständlich, neueste Version zuerst.
// Neue Version: Eintrag oben ergänzen und package.json anheben (siehe scripts/version.mjs).

export interface ChangelogEntry {
  /** SemVer, z. B. "0.2.0" */
  version: string;
  /** YYYY-MM-DD */
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.3.1',
    date: '2026-11-22',
    items: [
      'GigaBash ist Open Source: Das kleine GitHub-Logo im Hauptmenü und in den Einstellungen führt zum Quellcode.',
      'Im Hauptmenü und nach dem Spiel heißt dein Rekord jetzt „Persönlicher Rekord“.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-18',
    items: [
      'Der Schild ist schwächer (15 statt 20 je Stufe) und lädt nur noch, solange du dich bewegst. Bollwerk beschleunigt ihn um 50 % statt doppelt.',
      'Neu ab Sektor 5 – Zielerfassung: Wer 3 Sekunden stillsteht, wird erfasst. Treffer kosten dann immer mehr, Notschild und Reparatur fallen aus und Scharfschützen kommen öfter. In Bewegung bleiben!',
      'Endgegner und Fregatten wachsen mit deinem Schiff: Auch mit starkem Ausbau dauert ein Endgegner wieder rund eine halbe Minute, eine Fregatte einige Sekunden.',
      'Reparaturdrohnen (0,4 statt 0,5 Hülle/s) und Naniten (0,75 statt 1 Hülle/s) reparieren langsamer. Die Raserei der Endgegner beginnt erst nach 90 Sekunden.',
      'Endspiel: vor dem Kreuzer (Sektor 17–19) etwas sanfter, ab Sektor 20 deutlich härter.',
      'Neue Spiellogik: Die Bestenliste beginnt für diese Version neu – bis zum ersten Eintrag siehst du die bisherige, ältere Einträge findest du unter „Alle Versionen“.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-18',
    items: [
      'Mehr Credits: Abschüsse und Kristalle bringen mehr, dazu gibt es nach jedem Sektor eine Prämie. Reparieren kostet nur noch die Hälfte. Die ersten Sektoren sind sanfter – dafür zieht es ab Sektor 7 spürbar an.',
      'Sechs neue Schiffs-Upgrades: Reparaturdrohnen, Reaktivpanzer, Zielcomputer (kritische Treffer), Bergungsvertrag, Bombenschacht und Streif-Verstärker. Panzerung, Kühlung, Kaliber und Schild gehen jetzt höher, der Ausleger hat eine zweite Stufe mit zwei weiteren Steckplätzen.',
      'Drei neue Kanonen: Flak (zerplatzt in Splitter), Railgun (durchschlägt alles) und Plasma-Orb (brennt sich durch die Gegner; als Sonnenkern verschluckt er sogar Kugeln).',
      'Der Skillbaum ist mehr als doppelt so groß: fünf Äste mit je sechs Stufen, neu sind Waffenmeister und Pilot. Skillpunkte gibt es jetzt auch in jedem dritten Sektor und für je 100 Abschüsse.',
      'Fürs Endspiel: Ab Sektor 20 kannst du dein Schiff zum Kreuzer ausbauen, ab Sektor 30 zum Schlachtschiff – größer, mit Geschütztürmen, mehr Läufen und zusätzlichen Steckplätzen. Dafür ist es etwas leichter zu treffen.',
      'Bosskämpfe lassen sich nicht mehr aussitzen: Nach 75 Sekunden gerät der Endgegner in Raserei und trifft immer härter.',
      'Neue Spiellogik: Die Bestenliste beginnt für diese Version neu – bis zum ersten Eintrag siehst du die bisherige, ältere Einträge findest du unter „Alle Versionen“.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-17',
    items: [
      'Ab Sektor 5 fliegen deutlich weniger Kugeln über den Bildschirm – dafür sind sie schwerer: größer, mit hellem Rand, und ein Treffer kostet mehr Hülle. Die Gefahr bleibt gleich, aber du siehst wieder, wo du hinfliegst.',
      'Streifschüsse an schweren Kugeln füllen die Bomben-Leiste schneller und bringen mehr Punkte.',
      'Endgegner ab Sektor 6: ein Muster weniger in der letzten Phase.',
      'Bestenliste aufgeräumt: Versionsangaben erscheinen nur noch bei „Alle Versionen“ – als Sim-Version (gleiche Nummer = gleiche Spiellogik).',
      'Neue Spiellogik: Die Bestenliste beginnt für diese Version neu – bis zum ersten Eintrag siehst du die bisherige, ältere Einträge findest du unter „Alle Versionen“.',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-11-17',
    items: [
      'Bestenliste: Versionen mit gleicher Spiellogik stehen jetzt gemeinsam in einer Liste – deine Highscores aus v0.6.0 und v0.6.1 zählen also weiter neben v1.0. Die Version steht klein neben dem Namen.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-17',
    items: [
      'Version 1.0! Danke an alle, die mitgespielt und Feedback gegeben haben.',
      'Replays: Jede Partie der Bestenliste lässt sich jetzt ansehen – auf ▶ neben einem Eintrag tippen oder „Replays“ unter der Bestenliste.',
      'Wiedergabe mit Pause, Tempo von 0,5× bis 8×, Zeitleiste zum Springen und Sprüngen zu Sektoren und Endgegnern.',
      'Kennzahlen zu jeder Partie: Punkte, Credits, Hülle, Abschüsse je Sektor und alle Einkäufe beim Händler.',
      'Neue Statistik-Seite: Wie weit kommen alle, welche Waffen und Upgrades sind am beliebtesten?',
      'Auch Partien aus älteren Spielversionen sind abspielbar. Hinweis: Mit dem Eintrag in die Bestenliste wird deine Partie öffentlich ansehbar (siehe Datenschutz).',
    ],
  },
  {
    version: '0.6.1',
    date: '2026-11-16',
    items: [
      'Die Bestenliste zeigt jetzt nur Partien deiner Spielversion – so vergleichst du dich unter gleichen Bedingungen. Gibt es noch keine, siehst du die der Vorgängerversion.',
      'Häkchen „Alle Versionen“ unter der Bestenliste zeigt wieder alle Partien (mit Versionsangabe).',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-11-16',
    items: [
      'Härter, schneller, gemeiner: Stehenbleiben ist vorbei – wer zu lange an einer Stelle parkt, wird vom Scharfschützen anvisiert. Rote Linie heißt: sofort weg!',
      'Sperrfeuer: Rote Warnstreifen kündigen eine Sekunde vorher einen Laservorhang an – ab Sektor 3 auch doppelt oder als Kreuz.',
      'Gegner greifen jetzt auch von der Seite und von unten an (Pfeile am Rand warnen vor), dazu Minenfelder über die ganze Breite mit einer Lücke.',
      'Gegner zielen dorthin, wo du gleich sein wirst, feuern früher und mit mehr Mustern.',
      'Ab Sektor 3 goldene Elite-Gegner: zäher und aggressiver, aber doppelte Beute. Endgegner feuern ab Sektor 4 dichter.',
      'Streifschüsse: Knapp an Kugeln vorbeifliegen gibt Punkte und füllt die gelbe Leiste – ist sie voll, gibt es eine Bombe.',
    ],
  },
  {
    version: '0.5.2',
    date: '2026-11-16',
    items: [
      'Kein Highscore geht mehr verloren: Klappt das Eintragen nicht (Update, Funkloch, Tab geschlossen), merkt sich das Spiel die Partie – im Startbildschirm kannst du sie bis zu 3 Tage später nachtragen.',
    ],
  },
  {
    version: '0.5.1',
    date: '2026-11-15',
    items: [
      'Waffenstufe 4 und 5 sehen jetzt eigen aus: Evolutionen mit Goldflossen, rotierender Gatling-Trommel, Prismakristall, Gewitterkrone und mehr.',
      'Abpraller funkeln, Splitter fliegen sichtbar weiter, der Drohnenschwarm zeigt alle drei Drohnen.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-11-15',
    items: [
      'Handy: Steuerung per Joystick – Daumen aufs Feld legen, der Joystick erscheint darunter und wandert beim Weiterziehen mit. In Ruhe wartet er unten links.',
      'Wer lieber wie bisher direkt zieht: Einstellungen → Touch-Steuerung → „Direkt ziehen“.',
    ],
  },
  {
    version: '0.4.1',
    date: '2026-11-15',
    items: ['Das Spiel heißt jetzt Oganesson GigaBash – im Startbildschirm, im Seitentitel und in der Link-Vorschau.'],
  },
  {
    version: '0.4.0',
    date: '2026-11-15',
    items: [
      'Dein Highscore zählt auch nach einem Update: Partien, die vor dem Update begonnen wurden, werden mit ihrer alten Version nachgerechnet.',
      'Waffen-Evolution: Jede Anbauwaffe lässt sich bis Stufe 5 ausbauen – Stufe 5 verwandelt sie in eine neue Waffe.',
      'Querschläger, Prismalanze und Igel: Schüsse prallen von Gegner zu Gegner ab.',
      'Todesstrahl, Drohnenschwarm und Gewittersturm: Kettenblitze springen auf Nachbarn über.',
      'Splitterkanone und Raketenschwarm zerplatzen beim Treffer in Splitter; Gatling-Batterie feuert im Dauerfeuer.',
      'Overdrive beim Händler: mehr Schaden und Feuerrate ohne Obergrenze – Credits sind nie mehr wertlos.',
      'Anbauwaffen sehen je Stufe wuchtiger aus, der Ausleger macht das Schiff richtig breit; neue Optik für Strahl und Blitz.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-11-15',
    items: [
      'Neuer Name im Startbildschirm: Oganesson GigaBlast – mit Version und „Was ist neu?“ direkt unter dem Titel.',
      'Drei neue Waffen: Impulsblaster (günstiger Einstieg), Strahllaser (Dauerstrahl, Stufe 3 durchschlägt alles) und Blitzbogen (springt von Gegner zu Gegner).',
      'Ausleger beim Händler: zwei zusätzliche Flügel-Steckplätze außen – das Schiff wird richtig breit.',
      'Seitenkanone günstiger (180 statt 220 Credits), damit schon nach Sektor 1 mehr Auswahl drin ist.',
      'Anzeige der Smartbomben mit Taste B, DPS-Anzeige und Chips für aktive Buffs, Skills und Anbauwaffen.',
      'Pausenmenü zeigt die Feuerkraft jeder Waffe und deine Schiffswerte.',
      'Items schweben nur noch kurz: Nach gut 4 Sekunden blinken sie und fallen herunter – schnell einsammeln!',
      'Neue Version auf dem Server? Ein Hinweis im Startbildschirm lädt sie mit einem Tipp.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-11-15',
    items: [
      'Das erste spielbare Oganesson: Sektor für Sektor gegen Gegnerwellen, Fregatten und Endgegner.',
      'P-Kapseln verstärken deine Bordkanone in fünf Stufen, Smartbomben räumen den Bildschirm frei.',
      'Beim Händler nach jedem Endgegner: Schiffs-Upgrades, sechs Anbauwaffen für drei Steckplätze, Reparatur und ein Skillbaum.',
      'Lange Handys: Punkte, Credits und Lebensbalken sitzen in den freien Leisten über und unter dem Spielfeld statt schwarzer Ränder.',
      'Einstellungen (⚙️): Lautstärke, Musik, Bildschirmwackeln, Effektmenge, Touch-Empfindlichkeit und Tipps.',
      'Kurze Tipps beim ersten Spiel, bei der ersten P-Kapsel, beim ersten Händlerbesuch und beim ersten Skillpunkt – abschaltbar.',
      'Vier Sektor-Kulissen (Asteroidengürtel, Werft, Purpurnebel, Schwarmkern) und vier Endgegner: Brecher, Hammerhai, Nebelauge und Brutmutter.',
      'Satte Explosionen, Trümmer, Rauch und eine mehrstufige Boss-Explosion.',
      'Musik, die zu Flug, Endgegner und Händler passt, dazu neue Soundeffekte.',
      'Online: Bestenliste im Startbildschirm und nach dem Spiel – trag dich mit deinem Namen ein.',
      'Handy: Wischen funktioniert auch, wenn der Daumen in der Leiste unter dem Spielfeld beginnt.',
      'Händler per Tastatur: Reiter mit 1/2/3 oder Q/E, Enter startet den nächsten Sektor, Esc schließt Dialoge.',
      'iPhone/iPad: Hinweis „Zum Home-Bildschirm“ für echtes Vollbild; Android startet im Vollbild.',
      'Eigenes Icon für den Home-Bildschirm und ein Vorschaubild, wenn du den Link verschickst.',
      'Impressum & Datenschutz unten im Startbildschirm und in den Einstellungen.',
    ],
  },
];

/** Vergleich zweier Versionen "a.b.c": <0, 0, >0 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Einträge, die neuer sind als `seen` (null = noch nie gesehen → alle) */
export function entriesSince(seen: string | null): ChangelogEntry[] {
  return CHANGELOG.filter((e) => !seen || compareVersions(e.version, seen) > 0);
}

/** neueste Version im Protokoll */
export function latestVersion(): string {
  return CHANGELOG.reduce((m, e) => (compareVersions(e.version, m) > 0 ? e.version : m), '0.0.0');
}
