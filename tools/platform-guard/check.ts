// platform-guard: keeps Workflow Kit code and specs honest about macOS, Linux and Windows.
// Rule A: process.platform is only a default for an injectable platform.
// Rule B: a program of one OS is described for all three OSes in allowlist.json.
// Rule C: a new spec in docs/planning has a section on behaviour per OS.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ProgramEntry {
  file: string;
  program: string;
  darwin: string;
  linux: string;
  win32: string;
}

export interface Allowlist {
  programNames: string[];
  directPlatform: { file: string; reason: string }[];
  programs: ProgramEntry[];
  legacySpecs: string[];
}

export interface Issue {
  file: string;
  line: number;
  rule: 'platform-injected' | 'os-program' | 'spec-os-section' | 'allowlist';
  message: string;
}

export interface StringLiteral {
  value: string;
  line: number;
}

export interface Scanned {
  // Source with comments and string contents blanked out; line breaks are kept.
  code: string;
  strings: StringLiteral[];
}

const OSES = ['darwin', 'linux', 'win32'] as const;
const SPEC_HEADING = 'Поведение на ОС';
const SPEC_NAMES = ['macOS', 'Linux', 'Windows'];

/** Splits JS/TS source into code without comments and the static text of its string literals. */
export function scanSource(source: string): Scanned {
  let code = '';
  const strings: StringLiteral[] = [];
  let line = 1;
  let i = 0;
  // Each entry is the brace depth of an open `${` inside a template literal.
  const templateDepths: number[] = [];
  let depth = 0;
  const blank = (ch: string): string => (ch === '\n' ? '\n' : ' ');
  const readTemplate = (): void => {
    // Reads template text up to the closing backtick or the next `${`.
    let value = '';
    const start = line;
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === '\\') {
        value += source[i + 1] ?? '';
        code += '  ';
        if (source[i + 1] === '\n') line += 1;
        i += 2;
        continue;
      }
      if (ch === '`') {
        code += '`';
        i += 1;
        strings.push({ value, line: start });
        return;
      }
      if (ch === '$' && source[i + 1] === '{') {
        code += '${';
        i += 2;
        strings.push({ value, line: start });
        templateDepths.push(depth);
        depth += 1;
        return;
      }
      if (ch === '\n') line += 1;
      value += ch;
      code += blank(ch);
      i += 1;
    }
    strings.push({ value, line: start });
  };
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        code += ' ';
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i += 1) {
        if (source[i] === '\n') line += 1;
        code += blank(source[i]!);
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      let value = '';
      const start = line;
      code += ch;
      i += 1;
      while (i < source.length && source[i] !== ch && source[i] !== '\n') {
        if (source[i] === '\\') {
          value += source[i + 1] ?? '';
          code += '  ';
          i += 2;
          continue;
        }
        value += source[i]!;
        code += ' ';
        i += 1;
      }
      code += ch;
      i += 1;
      strings.push({ value, line: start });
      continue;
    }
    if (ch === '`') {
      code += '`';
      i += 1;
      readTemplate();
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (templateDepths.length > 0 && templateDepths[templateDepths.length - 1] === depth) {
        templateDepths.pop();
        code += '}';
        i += 1;
        readTemplate();
        continue;
      }
    }
    if (ch === '\n') line += 1;
    code += ch;
    i += 1;
  }
  return { code, strings };
}

/** Finds process.platform uses other than a default value of an injectable platform. */
export function directPlatformUses(code: string): number[] {
  const lines: number[] = [];
  const pattern = /process\.platform\b/g;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    const before = code.slice(0, match.index);
    const after = code.slice(match.index + match[0].length);
    const isDefault = /(\?\?|[^=!<>]=|\bplatform\s*:)\s*$/.test(before);
    const compared = /^\s*(===?|!==?)/.test(after) || /\bswitch\s*\(\s*$/.test(before);
    if (!isDefault || compared) lines.push(before.split('\n').length);
  }
  return lines;
}

/**
 * Returns the program named by a string literal: its first word, also as the last part of a
 * path (`/bin/launchctl`, `\\System32\\rundll32.exe`).
 */
export function programOf(value: string, names: readonly string[]): string | null {
  const first = value.split(' ')[0] ?? '';
  const base = first.split(/[\\/]/).pop() ?? '';
  const plain = base.toLowerCase().endsWith('.exe') ? base.slice(0, -4) : base;
  for (const candidate of [first, base, plain]) {
    const name = names.find((n) => n === candidate);
    if (name) return name;
  }
  return null;
}

/** Checks that a spec has a level-2 section on behaviour per OS naming all three OSes. */
export function specIssue(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('## ') && l.includes(SPEC_HEADING));
  if (start === -1) return `add a level-2 section with «${SPEC_HEADING}» (see docs/planning/TEMPLATE.md)`;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  const missing = SPEC_NAMES.filter((name) => !section.includes(name));
  return missing.length > 0 ? `section «${SPEC_HEADING}» does not mention ${missing.join(', ')}` : null;
}

/** Whether a repository path (with `/`) is product code checked by rules A and B. */
export function isCheckedCode(file: string): boolean {
  if (file.split('/').includes('vendor')) return false;
  if (file.startsWith('bin/')) return file.endsWith('.mjs');
  if (!file.startsWith('product-parts/') || file.startsWith('product-parts/control-panel/')) return false;
  return file.split('/').includes('src') && /\.(ts|js|mjs)$/.test(file);
}

async function listFiles(root: string, dir: string): Promise<string[]> {
  try {
    const names = await readdir(path.join(root, dir), { recursive: true, withFileTypes: true });
    return names
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'));
  } catch {
    return [];
  }
}

/** Runs rules A, B and C over the repository at root. */
export async function checkTree(root: string, allowlist: Allowlist): Promise<Issue[]> {
  const issues: Issue[] = [];
  const listed = 'tools/platform-guard/allowlist.json';
  const code = [...(await listFiles(root, 'product-parts')), ...(await listFiles(root, 'bin'))]
    .filter(isCheckedCode)
    .sort();
  const direct = new Map(allowlist.directPlatform.map((e) => [e.file, e]));
  const usedDirect = new Set<string>();
  const usedPrograms = new Set<string>();
  const entries = new Map(allowlist.programs.map((e) => [`${e.file}\u0000${e.program}`, e]));
  const reported = new Set<string>();
  for (const file of code) {
    const scanned = scanSource(await readFile(path.join(root, file), 'utf8'));
    for (const line of directPlatformUses(scanned.code)) {
      if (direct.has(file)) {
        usedDirect.add(file);
        continue;
      }
      issues.push({
        file,
        line,
        rule: 'platform-injected',
        message: 'take the platform as a parameter (`platform ?? process.platform`) instead of comparing process.platform',
      });
    }
    for (const literal of scanned.strings) {
      const program = programOf(literal.value, allowlist.programNames);
      if (!program) continue;
      const key = `${file}\u0000${program}`;
      usedPrograms.add(key);
      if (entries.has(key) || reported.has(`${key}\u0000${literal.line}`)) continue;
      reported.add(`${key}\u0000${literal.line}`);
      issues.push({
        file,
        line: literal.line,
        rule: 'os-program',
        message: `describe \`${program}\` for darwin, linux and win32 in ${listed}`,
      });
    }
  }
  for (const entry of allowlist.directPlatform) {
    if (!usedDirect.has(entry.file)) {
      issues.push({ file: listed, line: 1, rule: 'allowlist', message: `stale directPlatform entry ${entry.file}` });
    }
    if (!entry.reason?.trim()) {
      issues.push({ file: listed, line: 1, rule: 'allowlist', message: `directPlatform entry ${entry.file} needs a reason` });
    }
  }
  for (const entry of allowlist.programs) {
    if (!usedPrograms.has(`${entry.file}\u0000${entry.program}`)) {
      issues.push({ file: listed, line: 1, rule: 'allowlist', message: `stale programs entry ${entry.file} ${entry.program}` });
    }
    for (const os of OSES) {
      if (typeof entry[os] !== 'string' || !entry[os].trim()) {
        issues.push({ file: listed, line: 1, rule: 'allowlist', message: `programs entry ${entry.file} ${entry.program} needs ${os}` });
      }
    }
  }
  const specs = (await listFiles(root, 'docs/planning')).filter((f) => /^docs\/planning\/[^/]+\.md$/.test(f)).sort();
  const legacy = new Set(allowlist.legacySpecs);
  for (const spec of allowlist.legacySpecs) {
    if (!specs.includes(spec)) issues.push({ file: listed, line: 1, rule: 'allowlist', message: `stale legacySpecs entry ${spec}` });
  }
  for (const spec of specs) {
    if (legacy.has(spec)) continue;
    const problem = specIssue(await readFile(path.join(root, spec), 'utf8'));
    if (problem) issues.push({ file: spec, line: 1, rule: 'spec-os-section', message: problem });
  }
  return issues;
}

export async function readAllowlist(file: string): Promise<Allowlist> {
  return JSON.parse(await readFile(file, 'utf8')) as Allowlist;
}

export function formatIssue(issue: Issue): string {
  return `${issue.file}:${issue.line} ${issue.rule} ${issue.message}`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? path.join(here, '..', '..'));
  const issues = await checkTree(root, await readAllowlist(path.join(here, 'allowlist.json')));
  for (const issue of issues) console.error(formatIssue(issue));
  if (issues.length > 0) {
    console.error(`platform-guard: ${issues.length} problem(s); see tools/platform-guard/README.md`);
    process.exitCode = 1;
  } else {
    console.log('platform-guard: ok');
  }
}
