// Prüfung der Spielernamen für die Bestenliste

export const NAME_MAX = 16;

// Buchstaben (inkl. Umlaute), Ziffern, Leerzeichen und ein paar Satzzeichen
const ALLOWED = /^[\p{L}\p{N} ._\-!?'&+#]+$/u;

// Einfacher Wortfilter. Geprüft wird auf der normalisierten Form (klein, Leetspeak aufgelöst,
// nur Buchstaben, Wiederholungen zusammengezogen), daher als Teilstring.
const BAD = [
  'arschl', 'fick', 'fotze', 'hure', 'nutte', 'wichs', 'schlampe', 'missgeburt', 'spast', 'schwuchtel',
  'hitler', 'nazi', 'siegheil', 'heilhitler', 'adolf', 'kanake', 'neger', 'nigg', 'judensau', 'kinderf',
  'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'penis', 'vagina', 'porn', 'pussy',
  'admin', 'moderator',
];

// Nur am Namensanfang geprüft (sonst trifft z. B. "arsch" auch "Marschall")
const BAD_START = ['arsch'];

// Ziffernfolgen, die ohne Leetspeak-Auflösung verboten sind
const BAD_DIGITS = ['88', '1488', '187'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '+': 't' };

export function normalizeForFilter(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0-9@$!+]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-zß]/g, '')
    .replace(/(.)\1+/g, '$1');
}

export type NameResult = { ok: true; name: string } | { ok: false; message: string };

export function validateName(raw: unknown): NameResult {
  if (typeof raw !== 'string') return { ok: false, message: 'Bitte einen Namen eingeben.' };
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const len = [...name].length;
  if (len < 1) return { ok: false, message: 'Bitte einen Namen eingeben.' };
  if (len > NAME_MAX) return { ok: false, message: `Der Name darf höchstens ${NAME_MAX} Zeichen haben.` };
  if (!ALLOWED.test(name)) return { ok: false, message: "Erlaubt sind Buchstaben, Ziffern, Leerzeichen und . _ - ! ? ' & + #" };
  const norm = normalizeForFilter(name);
  const digits = name.replace(/[^0-9]/g, '');
  const bad =
    BAD.some((w) => norm.includes(w.replace(/(.)\1+/g, '$1'))) ||
    BAD_START.some((w) => norm.startsWith(w)) ||
    BAD_DIGITS.some((d) => digits === d || new RegExp(`(^|[^0-9])${d}([^0-9]|$)`).test(name));
  if (bad) return { ok: false, message: 'Dieser Name ist nicht erlaubt.' };
  return { ok: true, name };
}
