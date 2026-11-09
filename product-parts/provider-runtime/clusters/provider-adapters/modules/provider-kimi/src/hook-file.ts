// The Kit blocks inside the text of config.toml (protocol section 8): which state they are in,
// the file Kit would write (the current one without Kit blocks plus five fresh blocks at the
// end under the marker comment) and the fingerprint of that change. Pure text in, text out:
// everything outside the Kit blocks stays byte for byte.
import { createHash } from 'node:crypto';
import { KIMI_HOOKS_MARKER, isKimiKitCommand, kimiHooksSection } from '#kit-structure';
import type { KimiHookBlock } from '#kit-structure';
import { TomlScanError, scanToml, tomlValue } from './toml-scan.ts';
import type { TomlSection } from './toml-scan.ts';

/** A Kit block found in the file. */
export interface FoundHook {
  event: string | null;
  command: string;
}

/** What Kit knows about its hook in one text of config.toml. */
export interface HookFilePlan {
  status: 'approved' | 'pending' | 'modified' | 'unknown';
  /** Why Kit does not write the file (status unknown). */
  reason: string | null;
  /** The text Kit adds: the marker and the five blocks, in the line ends of the file. */
  section: string;
  /** The file after the approval; null when unknown. */
  target: string | null;
  /** The file without any Kit block; null when unknown. */
  cleaned: string | null;
  /** Kit blocks of the file as Kimi reads them. */
  found: FoundHook[];
}

const isBlank = (line: string): boolean => line.trim() === '';

/** Offsets of the lines of a text: [start, end after the line break]. */
function lineSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let at = 0; at < text.length; ) {
    const next = text.indexOf('\n', at);
    const end = next === -1 ? text.length : next + 1;
    spans.push([at, end]);
    at = end;
  }
  return spans;
}

function entry(section: TomlSection, key: string): string | number | undefined {
  const found = section.entries.find((item) => item.key === key || item.key === `"${key}"` || item.key === `'${key}'`);
  return found ? tomlValue(found.raw) : undefined;
}

/** The text without the given Kit blocks, their marker comment and the blank lines around them. */
function withoutBlocks(text: string, blocks: readonly TomlSection[]): string {
  const spans = lineSpans(text);
  const lineAt = (offset: number): number => spans.findIndex(([start]) => start === offset);
  const line = (index: number): string => text.slice(spans[index]![0], spans[index]![1]);
  const ranges: Array<[number, number]> = [];
  for (const block of blocks) {
    let first = lineAt(block.start);
    let last = block.contentEnd >= text.length ? spans.length : lineAt(block.contentEnd);
    // Blank lines after the block go with it; comments stay (they belong to what follows).
    while (last < spans.length && isBlank(line(last)) && spans[last]![0] < block.end) last += 1;
    if (first > 0 && line(first - 1).trim() === KIMI_HOOKS_MARKER) {
      first -= 1;
      // The one blank line Kit put above its marker.
      if (first > 0 && isBlank(line(first - 1))) first -= 1;
    }
    ranges.push([spans[first]![0], last >= spans.length ? text.length : spans[last]![0]]);
  }
  let result = '';
  let at = 0;
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    if (start > at) result += text.slice(at, start);
    at = Math.max(at, end);
  }
  return result + text.slice(at);
}

/** Reads the Kit blocks of a config.toml text and builds the file Kit would write. */
export function planHookFile(current: string, blocks: readonly KimiHookBlock[]): HookFilePlan {
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const section = kimiHooksSection(blocks, eol);
  const unknown = (reason: string): HookFilePlan => ({ status: 'unknown', reason, section, target: null, cleaned: null, found: [] });
  let sections: TomlSection[];
  try {
    sections = scanToml(current);
  } catch (error) {
    if (!(error instanceof TomlScanError)) throw error;
    return unknown(`config.toml не разбирается: ${error.message}`);
  }
  const named = (name: string): string => name.replace(/["'\s]/g, '');
  if (sections[0]!.entries.some((item) => named(item.key).split('.')[0] === 'hooks')) return unknown('хуки в config.toml заданы массивом `hooks = [...]`');
  if (sections.some((item) => item.kind === 'table' && named(item.name).split('.')[0] === 'hooks')) return unknown('хуки в config.toml заданы таблицей `[hooks…]`');

  const kit = sections.filter((item) => item.kind === 'array' && named(item.name) === 'hooks' && isKimiKitCommand(entry(item, 'command')));
  const found = kit.map((item): FoundHook => {
    const event = entry(item, 'event');
    return { event: typeof event === 'string' ? event : null, command: String(entry(item, 'command')) };
  });
  const exact = (block: KimiHookBlock): boolean => {
    const same = kit.filter((item) => entry(item, 'event') === block.event);
    const [only] = same;
    return same.length === 1 && only!.entries.length === 3 && entry(only!, 'command') === block.command && entry(only!, 'timeout') === block.timeout;
  };
  const status = kit.length === 0 ? 'pending' : kit.length === blocks.length && blocks.every(exact) ? 'approved' : 'modified';

  let cleaned = withoutBlocks(current, kit);
  // Only blank lines left: the file was made of Kit blocks alone.
  if (cleaned.trim() === '') cleaned = '';
  const base = cleaned === '' || cleaned.endsWith('\n') ? cleaned : cleaned + eol;
  const target = status === 'approved' ? current : base + (base === '' ? '' : eol) + section;
  return { status, reason: null, section, target, cleaned, found };
}

/** Fingerprint of a change of the file: sha256(current, NUL, target). */
export function hookFingerprint(current: string, target: string): string {
  return createHash('sha256').update(current, 'utf8').update('\0').update(target, 'utf8').digest('hex');
}
