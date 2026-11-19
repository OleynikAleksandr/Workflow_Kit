// M47 T003: a short digest of the source files a long-lived process runs from. A host started by an
// older install keeps its code after an update; comparing its digest with the service's own tells
// whether its behaviour is still the installed one. The digest is the same on every OS: names use
// '/', contents are read with LF line ends.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The src directory of pty-host itself (the terminal screen every host uses). */
export const PTY_HOST_SRC = path.dirname(fileURLToPath(import.meta.url));

/** A source file: `name` is its stable relative name with '/', `file` the path to read. */
export interface SourceFile { name: string; file: string }

/** Files directly in `dir` (no subdirectories), named `<prefix>/<file name>`. */
export function listSources(dir: string, prefix: string): SourceFile[] {
  return readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => ({ name: `${prefix}/${entry.name}`, file: path.join(dir, entry.name) }));
}

/** 12 hex characters of SHA-256 over the names in order and their LF contents. */
export function sourceDigest(files: SourceFile[], read: (file: string) => string = (file) => readFileSync(file, 'utf8')): string {
  const hash = createHash('sha256');
  for (const source of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    hash.update(source.name).update('\0').update(read(source.file).replace(/\r\n/g, '\n')).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}
