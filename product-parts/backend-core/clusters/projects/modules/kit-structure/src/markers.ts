// Marked sections inside user text files (AGENTS.md, .gitignore). Only the text between
// Kit's own markers is ever replaced; everything else is kept byte for byte.

/** Result of looking for a marked section. */
export type MarkedSection =
  | { kind: 'none' }
  /** start: index of the begin marker; end: index right after the end marker; body: LF-normalized text between. */
  | { kind: 'found'; start: number; end: number; body: string }
  | { kind: 'broken'; reason: string };

function occurrences(text: string, needle: string): number[] {
  const found: number[] = [];
  let index = text.indexOf(needle);
  while (index >= 0) {
    found.push(index);
    index = text.indexOf(needle, index + needle.length);
  }
  return found;
}

/** Converts CRLF line ends to LF so hashes do not depend on the checkout settings. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** Finds the single section between begin and end markers. */
export function findMarkedSection(text: string, begin: string, end: string): MarkedSection {
  const begins = occurrences(text, begin);
  const ends = occurrences(text, end);
  if (begins.length === 0 && ends.length === 0) return { kind: 'none' };
  if (begins.length !== 1 || ends.length !== 1) {
    return { kind: 'broken', reason: `markers ${begin} / ${end} must appear exactly once` };
  }
  const start = begins[0] ?? 0;
  const endIndex = ends[0] ?? 0;
  if (endIndex < start) return { kind: 'broken', reason: `${end} comes before ${begin}` };
  let bodyStart = start + begin.length;
  if (text.startsWith('\r\n', bodyStart)) bodyStart += 2;
  else if (text.startsWith('\n', bodyStart)) bodyStart += 1;
  const body = normalizeEol(text.slice(bodyStart, endIndex));
  return { kind: 'found', start, end: endIndex + end.length, body };
}

/** Section text with markers; the body is expected to end with a newline. */
export function renderMarkedSection(begin: string, end: string, body: string): string {
  return `${begin}\n${body}${end}`;
}

/** Replaces the found section, keeping the text before and after it unchanged. */
export function replaceMarkedSection(text: string, section: { start: number; end: number }, rendered: string): string {
  return text.slice(0, section.start) + rendered + text.slice(section.end);
}

/** Appends a section at the end of the text, separated from existing text by a blank line. */
export function appendMarkedSection(text: string, rendered: string): string {
  if (text.length === 0) return `${rendered}\n`;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let base = text;
  if (!base.endsWith('\n')) base += eol;
  if (!base.endsWith(`${eol}${eol}`) && !base.endsWith('\n\n')) base += eol;
  return `${base}${rendered}\n`;
}
