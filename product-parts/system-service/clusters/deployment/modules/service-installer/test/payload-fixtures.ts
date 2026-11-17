// Seeds of the speech integration (spec speech-integration 2.3): a lock with a runtime and a
// dev package, node_modules, notices, a Cargo target with the release helper, user speech data.
import { HELPER_ARTIFACT } from '../src/runtime-payload.ts';
import type { MemoryFs } from './fakes.ts';

export const LOCK = JSON.stringify({
  name: 'workflow-kit',
  lockfileVersion: 3,
  packages: {
    '': { name: 'workflow-kit', dependencies: { ws: '8.23.0' } },
    'node_modules/ws': { version: '8.23.0' },
    'node_modules/esbuild': { version: '0.25.12', dev: true },
  },
});

/** Lock, packages and notices in the source; the release helper when `helper` is given. */
export function seedPayload(fs: MemoryFs, root: string, options: { helper?: string; packages?: boolean } = {}): void {
  const j = fs.p.join;
  fs.seed(j(root, 'package-lock.json'), LOCK);
  fs.seed(j(root, 'THIRD_PARTY_NOTICES.md'), '# Notices\n');
  if (options.packages !== false) {
    fs.seed(j(root, 'node_modules', 'ws', 'package.json'), '{"name":"ws"}');
    fs.seed(j(root, 'node_modules', 'ws', 'lib', 'websocket.js'), 'module.exports = {};\n');
    fs.seed(j(root, 'node_modules', 'esbuild', 'package.json'), '{"name":"esbuild"}');
  }
  const target = j(root, ...HELPER_ARTIFACT.slice(0, -2));
  fs.seed(j(target, 'debug', 'wfk-speech-helper'), 'debug build', 0o755);
  fs.seed(j(target, 'CACHEDIR.TAG'), 'cargo\n');
  if (options.helper !== undefined) fs.seed(j(root, ...HELPER_ARTIFACT), options.helper, 0o755);
}

/** Models and speech settings of the user next to the helper (macOS: one data directory). */
export function seedSpeechData(fs: MemoryFs, data: string): string[] {
  const j = fs.p.join;
  const files = [j(data, 'speech', 'models', 'voxtral-q8.gguf'), j(data, 'speech.json')];
  for (const file of files) fs.seed(file, 'user data');
  return files;
}
