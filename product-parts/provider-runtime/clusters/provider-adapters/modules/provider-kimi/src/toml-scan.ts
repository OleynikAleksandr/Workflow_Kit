// A text scanner of config.toml (protocol section 8): no TOML library, only what Kit needs to
// find the [[hooks]] blocks without touching a byte of the rest. It splits the text into the
// root part and the tables (a table runs from its header line to the next header), and lists
// the keys of each with the raw text of their values. Strings (basic, literal, multi-line) and
// arrays that span lines are followed so that a `[` inside them is never taken for a header.
// A text it cannot follow throws TomlScanError: Kit then does not write the file.

/** The text is not TOML that this scanner can follow. */
export class TomlScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TomlScanError';
  }
}

/** One `key = value` of a table; raw is the value text without the trailing comment. */
export interface TomlEntry {
  key: string;
  raw: string;
}

/** The root part or one table of the file, by offsets in the text. */
export interface TomlSection {
  kind: 'root' | 'table' | 'array';
  /** Name between the brackets ('' for the root). */
  name: string;
  /** Offset of the header line (0 for the root). */
  start: number;
  /** Offset after the last line with content: the header or a key with its value. */
  contentEnd: number;
  /** Offset of the next header, or the length of the text. */
  end: number;
  entries: TomlEntry[];
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/** Splits a TOML text into the root part and its tables. */
export function scanToml(text: string): TomlSection[] {
  const n = text.length;
  const fail = (what: string, at: number): never => {
    throw new TomlScanError(`${what} (строка ${lineOf(text, at)})`);
  };
  const lineEnd = (from: number): number => {
    const at = text.indexOf('\n', from);
    return at === -1 ? n : at + 1;
  };

  // Offset after the string that opens at p.
  const skipString = (p: number): number => {
    const quote = text[p]!;
    const triple = quote.repeat(3);
    if (text.startsWith(triple, p)) {
      let from = p + 3;
      for (;;) {
        const close = text.indexOf(triple, from);
        if (close === -1) return fail('многострочная строка не закрыта', p);
        let slashes = 0;
        while (quote === '"' && close - 1 - slashes >= p + 3 && text[close - 1 - slashes] === '\\') slashes += 1;
        if (slashes % 2 === 1) {
          from = close + 1;
          continue;
        }
        let end = close + 3;
        // Up to two more quotes belong to the string itself.
        while (end < close + 5 && text[end] === quote) end += 1;
        return end;
      }
    }
    let at = p + 1;
    for (;;) {
      const ch = text[at];
      if (ch === undefined || ch === '\n') return fail('строка не закрыта', p);
      if (ch === '\\' && quote === '"') at += 2;
      else if (ch === quote) return at + 1;
      else at += 1;
    }
  };

  // The value that starts at `from`: where its statement ends and where the value text ends.
  const scanValue = (from: number): { end: number; valueEnd: number } => {
    let p = from;
    let depth = 0;
    let valueEnd = -1;
    for (;;) {
      if (p >= n) {
        if (depth > 0) fail('массив не закрыт', from);
        return { end: n, valueEnd: valueEnd === -1 ? n : valueEnd };
      }
      const ch = text[p]!;
      if (ch === '\n') {
        if (depth === 0) return { end: p + 1, valueEnd: valueEnd === -1 ? p : valueEnd };
        p += 1;
      } else if (ch === '#') {
        if (depth === 0 && valueEnd === -1) valueEnd = p;
        const next = text.indexOf('\n', p);
        p = next === -1 ? n : next;
      } else if (ch === '"' || ch === "'") {
        p = skipString(p);
      } else {
        if (ch === '[' || ch === '{') depth += 1;
        if (ch === ']' || ch === '}') depth -= 1;
        if (depth < 0) fail('лишняя закрывающая скобка', p);
        p += 1;
      }
    }
  };

  const sections: TomlSection[] = [{ kind: 'root', name: '', start: 0, contentEnd: 0, end: n, entries: [] }];
  let current = sections[0]!;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && (text[j] === ' ' || text[j] === '\t')) j += 1;
    const first = text[j];
    if (first === undefined || first === '\n' || first === '\r' || first === '#') {
      i = lineEnd(j);
    } else if (first === '[') {
      const array = text[j + 1] === '[';
      const close = array ? ']]' : ']';
      const nameStart = j + close.length;
      const eol = lineEnd(j);
      const nameEnd = text.indexOf(close, nameStart);
      if (nameEnd === -1 || nameEnd >= eol) fail('заголовок таблицы не закрыт', j);
      const rest = text.slice(nameEnd + close.length, eol).trim();
      if (rest !== '' && !rest.startsWith('#')) fail('лишний текст после заголовка таблицы', j);
      current.end = i;
      current = { kind: array ? 'array' : 'table', name: text.slice(nameStart, nameEnd).trim(), start: i, contentEnd: eol, end: n, entries: [] };
      sections.push(current);
      i = eol;
    } else {
      let p = j;
      while (p < n && text[p] !== '=' && text[p] !== '\n') p = text[p] === '"' || text[p] === "'" ? skipString(p) : p + 1;
      if (text[p] !== '=') fail('строка без знака «=»', j);
      const { end, valueEnd } = scanValue(p + 1);
      const raw = text.slice(p + 1, valueEnd).trim();
      if (raw === '') fail('у ключа нет значения', j);
      current.entries.push({ key: text.slice(j, p).trim(), raw });
      current.contentEnd = end;
      i = end;
    }
  }
  return sections;
}

const ESCAPES: Readonly<Record<string, string>> = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };

function unescapeBasic(body: string): string {
  return body.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\s\S])/g, (whole, code: string) => {
    if (code.length > 1) return String.fromCodePoint(Number.parseInt(code.slice(1), 16));
    return ESCAPES[code] ?? whole;
  });
}

/** The value of a raw text when it is a string or an integer; undefined for anything else. */
export function tomlValue(raw: string): string | number | undefined {
  for (const quote of ['"', "'"]) {
    const triple = quote.repeat(3);
    if (raw.length >= 6 && raw.startsWith(triple) && raw.endsWith(triple)) {
      // A newline right after the opening quotes is not part of the string.
      const body = raw.slice(3, -3).replace(/^\r?\n/, '');
      return quote === '"' ? unescapeBasic(body) : body;
    }
    if (raw.length >= 2 && raw.startsWith(quote) && raw.endsWith(quote)) return quote === '"' ? unescapeBasic(raw.slice(1, -1)) : raw.slice(1, -1);
  }
  return /^[+-]?\d+$/.test(raw) ? Number(raw) : undefined;
}
