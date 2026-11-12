// Builds the Kit bundle from the local sources (spec M22 section 2.5): esbuild bundles the Kit
// command line of product-parts/kit-core into one ESM file for Node, the bundle may import Node
// built-ins only, a smoke run installs it into a temporary git project, and the gzip, PROVENANCE
// and the generated constants of kit-bundle are written next to the module.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';

/** Folder of the Kit modules, relative to the repository root (POSIX form). */
export const KIT_MODULES = 'product-parts/kit-core/clusters/project-workflow/modules';
/** Entry of the bundle: the Kit command line. */
export const KIT_ENTRY = `${KIT_MODULES}/workflow-kit/src/workflow-kit-cli.ts`;
/** The source of KIT_VERSION. */
export const KIT_VERSION_FILE = `${KIT_MODULES}/workflow-installer/src/installer-payload.ts`;
/** The kit-bundle module that ships the bundle. */
export const BUNDLE_MODULE = 'product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle';
/** Where the Kit runs inside a project (KIT_BUNDLE_PATH of workflow-platform). */
const PROJECT_RUNTIME = ['.harness', 'workflow', 'runtime', 'workflow.mjs'];
/** Harness AI commit the sources were taken from (product-parts/kit-core/product-part.md). */
export const BASE_COMMIT = '94a9d457';

const VERSION_LINE = /^export const KIT_VERSION = "(\d+\.\d+\.\d+)";$/mu;
const STATIC_IMPORT = /^\s*(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']/gmu;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/gu;

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const toPosix = (value: string): string => value.split(path.sep).join('/');

/** KIT_VERSION as the installer of the sources declares it. */
export function readKitVersion(root: string): string {
  const text = readFileSync(path.join(root, KIT_VERSION_FILE), 'utf8');
  const match = VERSION_LINE.exec(text);
  if (!match?.[1]) throw new Error(`${KIT_VERSION_FILE}: no line export const KIT_VERSION = "x.y.z";`);
  return match[1];
}

/** The source files that go into the bundle: `<module>/src/*.ts`, sorted by POSIX path. */
export function kitSourceFiles(root: string): string[] {
  const modules = path.join(root, ...KIT_MODULES.split('/'));
  const files: string[] = [];
  for (const module of readdirSync(modules, { withFileTypes: true })) {
    if (!module.isDirectory()) continue;
    const src = path.join(modules, module.name, 'src');
    let entries: string[];
    try {
      entries = readdirSync(src);
    } catch {
      continue;
    }
    for (const entry of entries) if (entry.endsWith('.ts')) files.push(`${KIT_MODULES}/${module.name}/src/${entry}`);
  }
  return files.sort();
}

/**
 * Digest of the Kit sources: sha256 over every file's POSIX path and text (CRLF read as LF), so
 * it is the same on every OS. A change of the sources without a rebuild changes it.
 */
export function kitSourceDigest(root: string): string {
  const hash = createHash('sha256');
  for (const file of kitSourceFiles(root)) {
    const text = readFileSync(path.join(root, ...file.split('/')), 'utf8').replace(/\r\n/g, '\n');
    hash.update(`${file}\0${text}\0`);
  }
  return hash.digest('hex');
}

/** Module specifiers of a bundle that are not Node built-ins (`node:*`). */
export function foreignImports(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) if (match[1] && !match[1].startsWith('node:')) found.add(match[1]);
  }
  return [...found].sort();
}

export interface BuiltBundle {
  text: string;
  sha256: string;
  lines: number;
}

/**
 * Bundles the Kit command line in memory. Paths in the output are relative to the repository
 * root; a source from outside product-parts/kit-core or an import of a package is refused.
 */
export async function buildKitBundle(root: string): Promise<BuiltBundle> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [KIT_ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const outside = Object.keys(result.metafile.inputs).filter((input) => !toPosix(input).startsWith(`${KIT_MODULES}/`));
  if (outside.length > 0) throw new Error(`Kit bundle takes sources outside ${KIT_MODULES}: ${outside.join(', ')}`);
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild gave no output');
  const text = output.text;
  const foreign = foreignImports(text);
  if (foreign.length > 0) throw new Error(`Kit bundle imports non-builtin modules: ${foreign.join(', ')}`);
  return { text, sha256: sha256(text), lines: text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length };
}

/** The environment of the smoke run: a temporary git identity and no git variables of a hook. */
function smokeEnv(folder: string): NodeJS.ProcessEnv {
  const config = path.join(folder, 'gitconfig');
  writeFileSync(config, '[user]\n\tname = Workflow Kit Smoke\n\temail = smoke@workflow-kit.test\n');
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
  for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[name];
  return env;
}

/** The answer of a Kit command (its JSON envelope), or null when it printed none. */
function envelope(stdout: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Runs the bundle end to end and returns the problems (empty when it works): help, status and
 * validate of an empty folder, install into a new git project, then validate and doctor of the
 * installed project. On Windows the installed runtime runs with node (the launcher is
 * workflow.cmd); elsewhere the POSIX launcher scripts/workflow runs, as an agent calls it.
 */
export function smokeBundle(text: string, platform: NodeJS.Platform = process.platform): string[] {
  const folder = mkdtempSync(path.join(tmpdir(), 'wfk-kit-smoke-'));
  const problems: string[] = [];
  try {
    const file = path.join(folder, 'workflow.mjs');
    writeFileSync(file, text);
    const env = smokeEnv(folder);
    const run = (args: string[], cwd = folder) => spawnSync(process.execPath, [file, ...args], { cwd, env, encoding: 'utf8' });
    const help = run(['help']);
    if (help.status !== 0 || !help.stdout.includes('Usage:')) problems.push(`help: ${help.status} ${help.stderr}`);
    const status = envelope(run(['status', '--root', folder]).stdout);
    if ((status?.['result'] as { installed?: boolean } | undefined)?.installed !== false) problems.push('status: an empty folder must be not installed');
    const validate = envelope(run(['validate', '--root', folder]).stdout);
    const errors = (validate?.['result'] as { errors?: Array<{ code?: string }> } | undefined)?.errors;
    if (errors?.[0]?.code !== 'NOT_INSTALLED') problems.push('validate: an empty folder must answer NOT_INSTALLED');
    const project = path.join(folder, 'project');
    const install = run(['install', project, '--name', 'Smoke']);
    const installed = envelope(install.stdout);
    if (install.status !== 0 || (installed?.['result'] as { commit?: unknown } | undefined)?.commit == null) {
      problems.push(`install: ${install.status} ${install.stdout}${install.stderr}`);
      return problems;
    }
    const kit = (args: string[]) =>
      platform === 'win32'
        ? spawnSync(process.execPath, [path.join(project, ...PROJECT_RUNTIME), ...args], { cwd: project, env, encoding: 'utf8' })
        : spawnSync(path.join(project, 'scripts', 'workflow'), args, { cwd: project, env, encoding: 'utf8' });
    for (const command of ['validate', 'doctor']) {
      const answer = kit([command]);
      if (answer.status !== 0 || (envelope(answer.stdout)?.['result'] as { ok?: boolean } | undefined)?.ok !== true) {
        problems.push(`installed ${command}: ${answer.status} ${answer.stdout}${answer.stderr}`);
      }
    }
    return problems;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Text of vendor/PROVENANCE. */
export function provenanceText(version: string, bundle: BuiltBundle, digest: string): string {
  return [
    `Harness Workflow Kit ${version} single-file bundle (gzip of workflow.mjs).`,
    '',
    `built by:          tools/kit-build (npm run build:kit), esbuild ${esbuildVersion}`,
    `sources:           ${KIT_MODULES}/*/src/*.ts`,
    `source digest:     ${digest}`,
    `based on:          Harness AI commit ${BASE_COMMIT} (Kit 2.2.3), adapted in product-parts/kit-core`,
    `lines:             ${bundle.lines}`,
    `sha256 (unpacked): ${bundle.sha256}`,
    '',
    'The bundle is unpacked into <appDir>/kit/ and verified against this hash',
    'before use (module kit-bundle). Rebuild with `npm run build:kit`: the test of',
    'tools/kit-build fails when the Kit sources change without a rebuild.',
    '',
  ].join('\n');
}

/** Text of kit-bundle/src/bundle-meta.ts. */
export function metaText(version: string, bundle: BuiltBundle, digest: string): string {
  return [
    '// Generated by tools/kit-build (npm run build:kit) from product-parts/kit-core. Do not edit by hand.',
    '',
    '/** Kit version of the vendored bundle. */',
    `export const KIT_VERSION = '${version}';`,
    '/** SHA-256 of the unpacked bundle (see vendor/PROVENANCE). */',
    `export const KIT_SHA256 = '${bundle.sha256}';`,
    '/** Digest of the Kit sources the bundle was built from (tools/kit-build kitSourceDigest). */',
    `export const KIT_SOURCE_DIGEST = '${digest}';`,
    '',
  ].join('\n');
}

/** Writes the gzip (and removes the gzip of other versions), PROVENANCE and bundle-meta.ts. */
export function writeBundleFiles(root: string, version: string, bundle: BuiltBundle, digest: string): string[] {
  const vendor = path.join(root, ...BUNDLE_MODULE.split('/'), 'vendor');
  const name = `workflow-kit-${version}.mjs.gz`;
  for (const entry of readdirSync(vendor)) {
    if (/^workflow-kit-.+\.mjs\.gz$/u.test(entry) && entry !== name) unlinkSync(path.join(vendor, entry));
  }
  writeFileSync(path.join(vendor, name), gzipSync(Buffer.from(bundle.text, 'utf8'), { level: 9 }));
  writeFileSync(path.join(vendor, 'PROVENANCE'), provenanceText(version, bundle, digest));
  const meta = path.join(root, ...BUNDLE_MODULE.split('/'), 'src', 'bundle-meta.ts');
  writeFileSync(meta, metaText(version, bundle, digest));
  return [`${BUNDLE_MODULE}/vendor/${name}`, `${BUNDLE_MODULE}/vendor/PROVENANCE`, `${BUNDLE_MODULE}/src/bundle-meta.ts`];
}
