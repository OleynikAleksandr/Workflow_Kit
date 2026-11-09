// External CLAUDE.md imports of a project folder (verified 2026-11-05 on Claude Code 2.1.318): when
// the project memory imports files outside the folder, Claude asks "Allow external CLAUDE.md file
// imports?" on the first start and records the answer in projects["<folder>"]
// (hasClaudeMdExternalIncludesApproved, hasClaudeMdExternalIncludesWarningShown). Project memory is
// CLAUDE.md, CLAUDE.local.md, .claude/CLAUDE.md and .claude/rules/**/*.md of the folder and of every
// parent folder (e.g. ~/CLAUDE.md with "@AGENTS.md" imports ~/AGENTS.md). User memory
// (~/.claude/CLAUDE.md, ~/.claude/rules) is not project memory and is skipped.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/** One external import: the imported file and the memory file that imports it. */
export interface ExternalImport {
  file: string;
  from: string;
}

/** Result of a scan. */
export interface ImportScan {
  imports: ExternalImport[];
  /** sha256 over the memory files and the imports found. */
  fingerprint: string;
}

/** Import depth Claude follows (an imported file may import further files). */
export const MAX_IMPORT_DEPTH = 5;
const MAX_RULE_FILES = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const MEMORY_FILES = ['CLAUDE.md', 'CLAUDE.local.md', path.join('.claude', 'CLAUDE.md')];

async function isFile(file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    return info.isFile() && info.size <= MAX_FILE_BYTES;
  } catch {
    return false;
  }
}

/** Markdown files under .claude/rules (recursive, bounded). */
async function ruleFiles(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 4 || out.length >= MAX_RULE_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await ruleFiles(full, out, depth + 1);
    else if (entry.name.endsWith('.md') && out.length < MAX_RULE_FILES) out.push(full);
  }
}

/** Project memory files Claude loads for a folder: the folder and all its parents. */
export async function memoryFiles(projectPath: string, homedir: string): Promise<string[]> {
  const userDir = path.join(path.resolve(homedir), '.claude');
  const files: string[] = [];
  let dir = path.resolve(projectPath);
  for (;;) {
    for (const name of MEMORY_FILES) {
      const file = path.join(dir, name);
      if (path.dirname(file) !== userDir && (await isFile(file))) files.push(file);
    }
    const rules = path.join(dir, '.claude', 'rules');
    if (path.dirname(rules) !== userDir) await ruleFiles(rules, files);
    const parent = path.dirname(dir);
    if (parent === dir) return files;
    dir = parent;
  }
}

/** "@path" references of a memory file outside code blocks and inline code. */
export function importReferences(text: string): string[] {
  const prose = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');
  const refs: string[] = [];
  for (const match of prose.matchAll(/(?:^|\s)@((?:[^\s\\]|\\ )+)/g)) {
    const ref = (match[1] ?? '').replace(/\\ /g, ' ').replace(/#.*$/, '').replace(/[),.;:!?]+$/, '');
    if (ref !== '') refs.push(ref);
  }
  return refs;
}

/** Resolves an import reference against the importing file. */
export function resolveImport(ref: string, from: string, homedir: string): string {
  if (ref === '~' || ref.startsWith('~/')) return path.join(homedir, ref.slice(1));
  return path.resolve(path.dirname(from), ref);
}

function inside(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Finds the imports Claude would load for the folder from outside it (existing files only). */
export async function scanExternalImports(projectPath: string, homedir: string): Promise<ImportScan> {
  const root = path.resolve(projectPath);
  const hash = createHash('sha256').update(root);
  const found = new Map<string, ExternalImport>();
  const visited = new Set<string>();
  const visit = async (file: string, depth: number): Promise<void> => {
    if (visited.has(file) || depth > MAX_IMPORT_DEPTH) return;
    visited.add(file);
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      return;
    }
    hash.update(`\0${file}\0${text}`);
    for (const ref of importReferences(text)) {
      const target = resolveImport(ref, file, homedir);
      if (!(await isFile(target))) continue;
      if (!inside(root, target) && !found.has(target)) found.set(target, { file: target, from: file });
      await visit(target, depth + 1);
    }
  };
  for (const file of await memoryFiles(root, homedir)) await visit(file, 0);
  const imports = [...found.values()];
  hash.update(`\0${imports.map((i) => `${i.from}>${i.file}`).join('\n')}`);
  return { imports, fingerprint: hash.digest('hex') };
}
