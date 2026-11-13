import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeSnapshot } from '#provider-registry';
import { readStatuslineInput, runStatusline, STATUSLINE_MAX_INPUT } from './statusline.ts';
import type { StatuslineDeps } from './statusline.ts';

export interface NativeStatuslineBinding { file: string; hostId: string }
/** Paths are data inside base64, never shell-interpolated. This works in sh, Git Bash and PowerShell. */
export function nativeStatuslineCommand(binding: NativeStatuslineBinding): string {
  const module = Buffer.from(pathToFileURL(fileURLToPath(import.meta.url)).href).toString('base64');
  const data = Buffer.from(JSON.stringify(binding)).toString('base64');
  return `node -e "import(Buffer.from('${module}','base64').toString()).then(m=>m.runNativeStatusline(JSON.parse(Buffer.from('${data}','base64').toString())))"`;
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Capture native identity/values before delegating the original statusline, without changing its bytes. */
export async function runNativeStatusline(binding: NativeStatuslineBinding, deps: StatuslineDeps = {}): Promise<void> {
  const input = deps.input ?? await readStatuslineInput();
  try {
    if (input.length > STATUSLINE_MAX_INPUT) return;
    const v = object(JSON.parse(input.toString('utf8')));
    const model = object(v['model']); const effort = object(v['effort']);
    const workspace = object(v['workspace']);
    if (/^[a-f0-9-]{36}$/i.test(binding.hostId) && typeof binding.file === 'string' && binding.file.endsWith('.parameters-native')
      && typeof v['session_id'] === 'string' && /^[a-f0-9-]{36}$/i.test(v['session_id'])
      && typeof model['id'] === 'string' && model['id'].length <= 200
      && typeof model['display_name'] === 'string' && model['display_name'].length <= 200
      && typeof v['version'] === 'string' && v['version'].length <= 80
      && typeof (v['cwd'] ?? workspace['current_dir']) === 'string' && String(v['cwd'] ?? workspace['current_dir']).length <= 8192) {
      await writeSnapshot(binding.file, {
        version: 1, hostId: binding.hostId, sessionId: v['session_id'], cwd: v['cwd'] ?? workspace['current_dir'],
        cliVersion: v['version'], model: { id: model['id'], label: model['display_name'] ?? model['id'] },
        effort: typeof effort['level'] === 'string' ? effort['level'] : null,
        fast: typeof v['fast_mode'] === 'boolean' ? v['fast_mode'] : null, at: (deps.now ?? (() => new Date()))().getTime(),
      });
    }
  } catch { /* Metadata failure cannot change the user's statusline. */ }
  await runStatusline(['--client', 'claude'], { ...deps, input });
}
