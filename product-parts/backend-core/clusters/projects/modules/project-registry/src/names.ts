/** Longest accepted project name, in characters. */
export const MAX_PROJECT_NAME_LENGTH = 100;

/** Device names Windows reserves in any case and with any extension (CON, CON.txt, COM1, LPT¹...). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/** Characters Windows forbids in file names, plus ASCII control characters. */
const FORBIDDEN_CHARS = /[<>:"|?*\u0000-\u001f\u007f]/;

/** Result of the project name check. */
export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Checks a project name (spec section 6): Unicode is normalized to NFC and trimmed;
 * no "/", "\", "..", leading "-", Windows reserved names or characters, no trailing dot
 * or space. Rules are the same on every OS so a project can move between machines.
 */
export function checkProjectName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'Имя проекта должно быть строкой' };
  const name = raw.normalize('NFC').trim();
  if (name === '') return { ok: false, reason: 'Введите имя проекта' };
  if ([...name].length > MAX_PROJECT_NAME_LENGTH) {
    return { ok: false, reason: `Имя длиннее ${MAX_PROJECT_NAME_LENGTH} символов` };
  }
  if (name.includes('/') || name.includes('\\')) return { ok: false, reason: 'Имя не может содержать / или \\' };
  if (name === '.' || name.includes('..')) return { ok: false, reason: 'Имя не может быть «.» или содержать «..»' };
  if (name.startsWith('-')) return { ok: false, reason: 'Имя не может начинаться с «-»' };
  if (FORBIDDEN_CHARS.test(name)) {
    return { ok: false, reason: 'Имя не может содержать управляющие символы и < > : " | ? *' };
  }
  if (name.endsWith('.')) return { ok: false, reason: 'Имя не может заканчиваться точкой' };
  if (WINDOWS_RESERVED.test(name)) return { ok: false, reason: `Имя «${name}» зарезервировано в Windows` };
  return { ok: true, name };
}
