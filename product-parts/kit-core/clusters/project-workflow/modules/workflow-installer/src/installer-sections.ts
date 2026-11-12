export type SectionStyle = "hash" | "html";

const MARKERS: Readonly<Record<SectionStyle, { begin: string; end: string }>> =
  {
    hash: { begin: "# workflow-kit:begin", end: "# workflow-kit:end" },
    html: {
      begin: "<!-- workflow-kit:begin -->",
      end: "<!-- workflow-kit:end -->",
    },
  };
const SHEBANG = /^#![^\n]*\n/u;
const CRLF = /\r\n/gu;
const LF = /\n/gu;

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** The managed block with its markers, using `\n` line ends. */
export function sectionBlock(style: SectionStyle, body: string): string {
  const { begin, end } = MARKERS[style];
  return `${begin}\n${body.trimEnd()}\n${end}\n`;
}

function bounds(
  text: string,
  style: SectionStyle
): { end: number; start: number } | null {
  const { begin, end } = MARKERS[style];
  const start = text.indexOf(begin);
  const stop = start === -1 ? -1 : text.indexOf(end, start);
  if (start === -1 || stop === -1) {
    return null;
  }
  let after = stop + end.length;
  if (text.startsWith("\r\n", after)) {
    after += 2;
  } else if (text.startsWith("\n", after)) {
    after += 1;
  }
  return { end: after, start };
}

/** The current managed block (markers included, `\n` line ends), or null. */
export function extractSection(
  text: string,
  style: SectionStyle
): string | null {
  const found = bounds(text, style);
  return found ? text.slice(found.start, found.end).replace(CRLF, "\n") : null;
}

/**
 * Replaces or inserts the managed block. Text outside it is kept byte for
 * byte; a new block goes to the end, or after the shebang for `top`.
 */
export function upsertSection(
  current: string | null,
  style: SectionStyle,
  body: string,
  placement: "bottom" | "top" = "bottom"
): string {
  const text = current ?? "";
  const eol = eolOf(text);
  const block = sectionBlock(style, body).replace(LF, eol);
  const found = bounds(text, style);
  if (found) {
    return `${text.slice(0, found.start)}${block}${text.slice(found.end)}`;
  }
  if (placement === "top") {
    const shebang = SHEBANG.exec(text)?.[0] ?? "";
    return `${shebang}${block}${text.slice(shebang.length)}`;
  }
  if (text === "") {
    return block;
  }
  const separator = text.endsWith("\n") ? eol : `${eol}${eol}`;
  return `${text}${separator}${block}`;
}
