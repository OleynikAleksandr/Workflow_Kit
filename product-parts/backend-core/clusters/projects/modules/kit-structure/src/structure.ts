// Check and install of the Kit structure in a project folder (spec section 7).
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { InvalidJsonFileError, readJsonFile, writeFileAtomic } from '#data-store';
import { FRAGMENTS, FragmentError, PRODUCT_PARTS_README_PATH, sha256 } from './fragments.ts';
import type { FragmentId, FragmentKind, FragmentSpec } from './fragments.ts';
import { STRUCTURE_VERSION } from './templates.ts';

/** Status of a fragment and of the whole structure. */
export type StructureStatus = 'ok' | 'missing' | 'modified' | 'outdated' | 'newer';

/** Path of the manifest relative to the project root. */
export const MANIFEST_PATH = '.workflow-kit/manifest.json';

/** One fragment in the check report. */
export interface FragmentReport {
  id: FragmentId;
  path: string;
  kind: FragmentKind;
  status: StructureStatus;
  /** Why the fragment cannot be read (invalid JSON, broken markers). */
  error?: string;
}

/** Result of checking a project folder. */
export interface StructureReport {
  /** Overall status: the most serious fragment status (modified > newer > outdated > missing > ok). */
  status: StructureStatus;
  /** Structure version of this Kit. */
  version: number;
  /** Version recorded in the manifest, null without a manifest. */
  installedVersion: number | null;
  fragments: FragmentReport[];
  /** Problems the user should know about (CLAUDE.md without @AGENTS.md, broken manifest). */
  warnings: string[];
  /** Informational notes (e.g. product-parts already exists, README is not created). */
  notes: string[];
  /** True when install would write something without force. */
  installable: boolean;
}

/** Result of an install. */
export interface InstallResult {
  /** Fragments written by this install (empty when everything was already in place). */
  written: string[];
  /** Fragments left as they are because the user changed them (or a newer Kit wrote them). */
  skipped: Array<{ id: FragmentId; status: StructureStatus }>;
  report: StructureReport;
}

/** Install refused before anything was written. */
export class StructureError extends Error {
  readonly code: 'invalid-json' | 'bad-markers' | 'bad-shape';
  readonly files: string[];

  constructor(code: StructureError['code'], message: string, files: string[]) {
    super(message);
    this.name = 'StructureError';
    this.code = code;
    this.files = files;
  }
}

interface ManifestRecord {
  path: string;
  sha256: string;
  version: number;
}

interface Manifest {
  kit: 'workflow-kit';
  version: number;
  fragments: Partial<Record<FragmentId, ManifestRecord>>;
}

interface FragmentState {
  spec: FragmentSpec;
  fileText: string | undefined;
  fileMode: number | undefined;
  status: StructureStatus;
  error?: FragmentError;
}

interface Inspection {
  root: string;
  manifest: Manifest | undefined;
  manifestText: string | undefined;
  manifestError?: string;
  states: FragmentState[];
  report: StructureReport;
}

const SEVERITY: Readonly<Record<StructureStatus, number>> = { ok: 0, missing: 1, outdated: 2, newer: 3, modified: 4 };

function absolute(root: string, relative: string): string {
  return path.join(root, ...relative.split('/'));
}

async function readText(file: string): Promise<{ text: string | undefined; mode: number | undefined }> {
  try {
    const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    return { text, mode: info.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: undefined, mode: undefined };
    throw error;
  }
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseManifest(raw: unknown): Manifest | undefined {
  if (!isRecord(raw)) return undefined;
  const fragments: Manifest['fragments'] = {};
  if (isRecord(raw['fragments'])) {
    for (const [id, value] of Object.entries(raw['fragments'])) {
      if (!isRecord(value) || typeof value['sha256'] !== 'string') continue;
      const version = typeof value['version'] === 'number' ? value['version'] : 0;
      fragments[id as FragmentId] = { path: String(value['path'] ?? ''), sha256: value['sha256'], version };
    }
  }
  return { kit: 'workflow-kit', version: typeof raw['version'] === 'number' ? raw['version'] : 0, fragments };
}

function classify(actual: string | undefined, spec: FragmentSpec, record: ManifestRecord | undefined): StructureStatus {
  if (actual === undefined) return 'missing';
  if (!spec.hashed) return 'ok';
  const hash = sha256(actual);
  if (hash === sha256(spec.expected)) return 'ok';
  if (record && record.sha256 === hash) return record.version > STRUCTURE_VERSION ? 'newer' : 'outdated';
  return 'modified';
}

async function inspect(root: string): Promise<Inspection> {
  const manifestFile = absolute(root, MANIFEST_PATH);
  let manifest: Manifest | undefined;
  let manifestError: string | undefined;
  try {
    manifest = parseManifest(await readJsonFile(manifestFile));
  } catch (error) {
    if (!(error instanceof InvalidJsonFileError)) throw error;
    manifestError = `${MANIFEST_PATH}: invalid JSON`;
  }
  const manifestText = (await readText(manifestFile)).text;
  const productParts = await exists(absolute(root, 'product-parts'));
  const states: FragmentState[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  for (const spec of FRAGMENTS) {
    const { text, mode } = await readText(absolute(root, spec.path));
    if (spec.path === PRODUCT_PARTS_README_PATH && productParts && !(text !== undefined && manifest?.fragments[spec.id])) {
      notes.push('Каталог product-parts уже есть: Kit его не меняет и README не создаёт.');
      continue;
    }
    try {
      const status = classify(spec.extract(text), spec, manifest?.fragments[spec.id]);
      states.push({ spec, fileText: text, fileMode: mode, status });
    } catch (error) {
      if (!(error instanceof FragmentError)) throw error;
      states.push({ spec, fileText: text, fileMode: mode, status: 'modified', error });
    }
    if (spec.id === 'claude-md' && text !== undefined && !/^\s*@AGENTS\.md\b/m.test(text)) {
      warnings.push('CLAUDE.md не подключает @AGENTS.md: Claude не прочитает раздел Kit в AGENTS.md.');
    }
  }
  if (manifestError) warnings.push(`Манифест Kit повреждён (${manifestError}); установка его не перезапишет.`);
  const fragments: FragmentReport[] = states.map((s) => ({
    id: s.spec.id,
    path: s.spec.path,
    kind: s.spec.kind,
    status: s.status,
    ...(s.error ? { error: s.error.message } : {}),
  }));
  let status: StructureStatus = manifest || manifestError ? 'ok' : 'missing';
  if (manifestError) status = 'modified';
  for (const fragment of fragments) if (SEVERITY[fragment.status] > SEVERITY[status]) status = fragment.status;
  const report: StructureReport = {
    status,
    version: STRUCTURE_VERSION,
    installedVersion: manifest ? manifest.version : null,
    fragments,
    warnings,
    notes,
    installable: !manifestError && (!manifest || states.some((s) => s.status === 'missing' || s.status === 'outdated')),
  };
  return { root, manifest, manifestText, manifestError, states, report };
}

/** Checks the Kit structure in a project folder; never writes. */
export async function checkStructure(root: string): Promise<StructureReport> {
  return (await inspect(root)).report;
}

/**
 * Installs or updates the Kit structure. Missing and outdated fragments are written; fragments
 * changed by the user (modified) or written by a newer Kit are kept unless force is set.
 * Files that cannot be read safely (invalid JSON, broken markers) refuse the whole install
 * before anything is written. A repeated install writes nothing.
 */
export async function installStructure(root: string, options: { force?: boolean } = {}): Promise<InstallResult> {
  const before = await inspect(root);
  const broken = before.states.filter((s) => s.error);
  if (before.manifestError) throw new StructureError('invalid-json', before.manifestError, [MANIFEST_PATH]);
  const first = broken[0]?.error;
  if (first) {
    throw new StructureError(first.code, broken.map((s) => s.error?.message).join('; '), broken.map((s) => s.spec.path));
  }
  const written: string[] = [];
  const skipped: InstallResult['skipped'] = [];
  const records: Manifest['fragments'] = {};
  for (const state of before.states) {
    const { spec, status } = state;
    const force = options.force === true && spec.hashed;
    const write = status === 'missing' || status === 'outdated' || (force && (status === 'modified' || status === 'newer'));
    if (write) {
      await writeFileAtomic(absolute(root, spec.path), spec.write(state.fileText), { mode: state.fileMode ?? 0o644, dirMode: 0o755 });
      written.push(spec.id);
    } else if (status !== 'ok') {
      skipped.push({ id: spec.id, status });
    }
    if (!spec.hashed) continue;
    const kept = before.manifest?.fragments[spec.id];
    if (write || status === 'ok') records[spec.id] = { path: spec.path, sha256: sha256(spec.expected), version: STRUCTURE_VERSION };
    else if (kept) records[spec.id] = kept;
  }
  const manifest: Manifest = { kit: 'workflow-kit', version: STRUCTURE_VERSION, fragments: records };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  if (manifestText !== before.manifestText) {
    await writeFileAtomic(absolute(root, MANIFEST_PATH), manifestText, { mode: 0o644, dirMode: 0o755 });
    written.push('manifest');
  }
  return { written, skipped, report: await checkStructure(root) };
}
