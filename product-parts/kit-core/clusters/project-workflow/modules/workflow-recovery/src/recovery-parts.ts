import { createHash } from "node:crypto";

/**
 * Upper limit of one packet part in UTF-16 code units, its first line
 * included. Claude Code keeps hook output of at most 10 000 units in the
 * context; longer output is replaced by a short preview.
 */
export const PART_LIMIT = 9500;

/** Most parts a hook may ask for (`--part K/N`). */
export const MAX_PARTS = 16;

/** Room kept in the last part for the line about an incomplete packet. */
const INCOMPLETE_RESERVE = 200;

const HEAD_LINE = /^head: (\S+)/mu;
const REVISION = /\brevision (\d+)/u;
const SECTION_START = /(?=^## )/mu;
const LINE_END = /(?<=\n)/u;
const PART_VALUE = /^(\d{1,2})\/(\d{1,2})$/u;

export interface PacketParts {
  /** Parts the whole packet needs; more than `parts.length` when cut. */
  needed: number;
  /** Parts in order, each starting with its part line. */
  parts: string[];
}

export interface PartRequest {
  count: number;
  index: number;
}

/** The part line: number, packet revision and head, digest of the whole text. */
function partLine(
  index: number,
  count: number,
  meta: { digest: string; head: string; revision: string }
): string {
  return `# Workflow recovery packet — part ${index}/${count} · revision ${meta.revision} · head ${meta.head} · digest ${meta.digest}\n`;
}

function packetMeta(text: string): {
  digest: string;
  head: string;
  revision: string;
} {
  return {
    digest: createHash("sha256").update(text).digest("hex").slice(0, 12),
    head: HEAD_LINE.exec(text)?.[1] ?? "-",
    revision: REVISION.exec(text)?.[1] ?? "-",
  };
}

/** Cuts a line into pieces of at most `limit` units without splitting a surrogate pair. */
function cutLine(line: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = line;
  while (rest.length > limit) {
    let cut = limit;
    const code = rest.charCodeAt(cut - 1);
    if (code >= 0xd8_00 && code <= 0xdb_ff) {
      cut -= 1;
    }
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest !== "") {
    pieces.push(rest);
  }
  return pieces;
}

/** Sections (`## ` at a line start), then lines, then characters within `limit`. */
function units(text: string, limit: number): string[] {
  const result: string[] = [];
  for (const section of text.split(SECTION_START)) {
    if (section.length <= limit) {
      result.push(section);
      continue;
    }
    for (const line of section.split(LINE_END)) {
      result.push(...cutLine(line, limit));
    }
  }
  return result.filter((unit) => unit !== "");
}

/** Greedy packing of units into chunks of at most `limit` units. */
function pack(items: string[], limit: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const item of items) {
    if (current !== "" && current.length + item.length > limit) {
      chunks.push(current);
      current = "";
    }
    current += item;
  }
  if (current !== "" || chunks.length === 0) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Splits the packet text into at most `count` parts of at most `PART_LIMIT`
 * units. Without their part lines the parts join to the text; a packet that
 * needs more parts ends the last one with the line about an incomplete packet.
 */
export function packetParts(text: string, count: number): PacketParts {
  const meta = packetMeta(text);
  const body = PART_LIMIT - partLine(MAX_PARTS, MAX_PARTS, meta).length - 1;
  const pieces = units(text, body - INCOMPLETE_RESERVE);
  const full = pack(pieces, body);
  let chunks = full;
  if (full.length > count) {
    // The first chunks hold whole units in order, so their length marks
    // where the units of the last part start.
    const head = full.slice(0, count - 1);
    const used = head.reduce((sum, chunk) => sum + chunk.length, 0);
    const last =
      pack(joinFrom(pieces, used), body - INCOMPLETE_RESERVE)[0] ?? "";
    const line = `\nPacket incomplete: it needs ${full.length} parts, ${count} delivered. Run \`scripts/workflow recover --format text\`.\n`;
    chunks = [...head, `${last}${line}`];
  }
  const total = chunks.length;
  return {
    needed: full.length,
    parts: chunks.map((chunk, i) => `${partLine(i + 1, total, meta)}${chunk}`),
  };
}

/** The units that follow the first `used` units of text. */
function joinFrom(pieces: string[], used: number): string[] {
  let consumed = 0;
  const rest: string[] = [];
  for (const piece of pieces) {
    if (consumed >= used) {
      rest.push(piece);
    }
    consumed += piece.length;
  }
  return rest;
}

/** Parses `K/N` of `--part`; null when it is not `1 <= K <= N <= MAX_PARTS`. */
export function parsePart(value: string | undefined): PartRequest | null {
  const match = PART_VALUE.exec(value ?? "");
  if (!match) {
    return null;
  }
  const index = Number(match[1]);
  const count = Number(match[2]);
  return index >= 1 && index <= count && count <= MAX_PARTS
    ? { count, index }
    : null;
}
