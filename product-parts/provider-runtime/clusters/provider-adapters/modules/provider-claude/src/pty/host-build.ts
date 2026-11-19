// M47 T003: the build label of the terminal host. The host (session.exp with interrupt-worker.ts,
// host.ts on Windows) writes it into its state; the service compares it with its own label. A
// different label means the session runs a host of an older install: its control of the model and
// effort is not the installed one.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PTY_HOST_SRC, listSources, sourceDigest } from '#pty-host';
import type { SourceFile } from '#pty-host';

const PTY_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.dirname(PTY_DIR);
/**
 * Files of provider-claude/src outside src/pty the host runs (relative imports of src/pty and theirs;
 * test/m47-host-build.test.ts keeps the list complete). `#provider-registry` types and errors of
 * these files are not host behaviour and stay out.
 */
export const HOST_OUTSIDE_PTY = ['pty.ts', 'links.ts', 'folder-key.ts'];

/** Every source file of the label: src/pty, the files above and the src of pty-host. */
export function hostSources(): SourceFile[] {
  return [
    ...listSources(PTY_DIR, 'provider-claude/src/pty'),
    ...HOST_OUTSIDE_PTY.map(name => ({ name: `provider-claude/src/${name}`, file: path.join(SRC_DIR, name) })),
    ...listSources(PTY_HOST_SRC, 'pty-host/src'),
  ];
}

let cached: string | null | undefined;
/** The label of the files this process runs from; null when they cannot be read. */
export function hostBuild(): string | null {
  if (cached === undefined) { try { cached = sourceDigest(hostSources()); } catch { cached = null; } }
  return cached;
}
