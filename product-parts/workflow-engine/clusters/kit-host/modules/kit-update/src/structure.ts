// The Kit structure (wfk) of a project on the Kit card and in its update (spec M38 section 2.2):
// the state comes from kit-structure's check; the update writes the missing and outdated fragments
// right before `install --update --with`, so Kit commits them together with its own files. Files
// with uncommitted changes are never written over, and a Kit failure puts the old texts back.
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_PATH } from '#kit-structure';
import type { InstallResult, StructureReport } from '#kit-structure';

/** The structure part of a kitUpdate entry. */
export interface KitStructureState {
  /** Overall status of kit-structure: ok, missing, modified, outdated, newer. */
  status: string;
  /** Structure version recorded in the project's manifest, or null without one. */
  installed: number | null;
  /** Structure version of the app. */
  version: number;
  /** Missing or outdated fragments that the update writes. */
  installable: boolean;
  /** Paths of fragments changed by hand (modified) or written by a newer app (newer): kept. */
  kept: string[];
}

/** The structure part of the last update: what went into the commit. */
export interface KitStructureLast {
  from: number | null;
  to: number;
  files: string[];
}

/** kit-structure's check and install, injected by cli. */
export interface StructureAccess {
  check(root: string): Promise<StructureReport>;
  install(root: string): Promise<InstallResult>;
}

/** The text of a skipped structure update. */
export const STRUCTURE_NO_CHANGES = 'Kit не сообщил файлы вне коммитов';

export function structureState(report: StructureReport): KitStructureState {
  return {
    status: report.status,
    installed: report.installedVersion,
    version: report.version,
    installable: report.installable,
    kept: report.fragments.filter((f) => f.status === 'modified' || f.status === 'newer').map((f) => f.path),
  };
}

/** Paths an install writes: the missing and outdated fragments and the manifest. */
export function pendingPaths(report: StructureReport): string[] {
  const paths = report.fragments.filter((f) => f.status === 'missing' || f.status === 'outdated').map((f) => f.path);
  return [...new Set([...paths, MANIFEST_PATH])];
}

/** Project paths of the fragment ids an install wrote ("manifest" is the manifest). */
export function writtenPaths(report: StructureReport, written: readonly string[]): string[] {
  const paths = written.map((id) => (id === 'manifest' ? MANIFEST_PATH : report.fragments.find((f) => f.id === id)?.path));
  return [...new Set(paths.filter((p): p is string => typeof p === 'string'))];
}

/** «файлы изменены и не закоммичены: a, b, c, d, e и ещё N». */
export function dirtyNote(paths: readonly string[]): string {
  const shown = paths.slice(0, 5).join(', ');
  const more = paths.length > 5 ? ` и ещё ${paths.length - 5}` : '';
  return `файлы изменены и не закоммичены: ${shown}${more}`;
}

/** Texts of the files before the install (null: the file did not exist). */
export type StructureSnapshot = Map<string, string | null>;

const fileOf = (root: string, relative: string): string => path.join(root, ...relative.split('/'));

export async function snapshot(root: string, paths: readonly string[]): Promise<StructureSnapshot> {
  const saved: StructureSnapshot = new Map();
  for (const relative of paths) {
    saved.set(relative, await readFile(fileOf(root, relative), 'utf8').catch(() => null));
  }
  return saved;
}

/** Puts the saved texts back and removes the files the install created. */
export async function restore(root: string, saved: StructureSnapshot): Promise<void> {
  for (const [relative, text] of saved) {
    const file = fileOf(root, relative);
    if (text === null) await rm(file, { force: true });
    else await writeFile(file, text);
  }
}
