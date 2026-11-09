// Shapes of the Kimi answers Kit uses (protocol, section 10): only the fields that are read are
// checked; anything else in an answer is ignored. A missing or mistyped field is a shape error.
import { shapeError } from './client.ts';

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw shapeError(what);
  return value as Record<string, unknown>;
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw shapeError(what);
  return value;
}

/** GET /api/v1/meta. */
export interface KimiMeta {
  serverVersion: string;
  serverId: string;
  backend: string;
}

export function parseMeta(data: unknown): KimiMeta {
  const meta = record(data, 'meta');
  return { serverVersion: text(meta['server_version'], 'meta.server_version'), serverId: text(meta['server_id'], 'meta.server_id'), backend: text(meta['backend'], 'meta.backend') };
}

/** GET /api/v1/auth: models_ready false means there is no login. */
export function parseAuth(data: unknown): { modelsReady: boolean } {
  const auth = record(data, 'auth');
  if (typeof auth['models_ready'] !== 'boolean') throw shapeError('auth.models_ready');
  return { modelsReady: auth['models_ready'] };
}

/** GET /api/v1/config: Kimi leaves default_model out until a model is chosen. */
export function parseConfig(data: unknown): { defaultModel: string | null } {
  const config = record(data, 'config');
  const model = config['default_model'];
  if (model !== undefined && model !== null && typeof model !== 'string') throw shapeError('config.default_model');
  return { defaultModel: typeof model === 'string' && model.trim() !== '' ? model : null };
}

/** A workspace of Kimi (a folder it knows). */
export interface KimiWorkspace {
  id: string;
  root: string;
  name: string | null;
  sessionCount: number;
}

export function parseWorkspace(data: unknown, what = 'workspace'): KimiWorkspace {
  const item = record(data, what);
  const count = item['session_count'];
  if (count !== undefined && typeof count !== 'number') throw shapeError(`${what}.session_count`);
  return { id: text(item['id'], `${what}.id`), root: text(item['root'], `${what}.root`), name: typeof item['name'] === 'string' ? item['name'] : null, sessionCount: count ?? 0 };
}

/** GET /api/v1/workspaces. */
export function parseWorkspaces(data: unknown): KimiWorkspace[] {
  const items = record(data, 'workspaces')['items'];
  if (!Array.isArray(items)) throw shapeError('workspaces.items');
  return items.map((item, index) => parseWorkspace(item, `workspaces.items[${index}]`));
}

/** GET|POST /api/v1/workspaces/{id}/trust. */
export function parseTrusted(data: unknown): boolean {
  const trusted = record(data, 'trust')['trusted'];
  if (typeof trusted !== 'boolean') throw shapeError('trust.trusted');
  return trusted;
}

/** <home>/server/instances/<server_id>.json. */
export interface KimiInstance {
  serverId: string;
  pid: number;
  port: number;
}

/** A server record; undefined for a file that is not one (it is being written, or of another version). */
export function parseInstance(data: unknown): KimiInstance | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const item = data as Record<string, unknown>;
  const { server_id: serverId, pid, port } = item;
  if (typeof serverId !== 'string' || !Number.isInteger(pid) || !Number.isInteger(port)) return undefined;
  if (typeof item['host'] === 'string' && item['host'] !== '127.0.0.1' && item['host'] !== 'localhost') return undefined;
  return { serverId, pid: pid as number, port: port as number };
}

/** GET /api/v1/config: the hooks the server has loaded (none when the key is absent). */
export function parseConfigHooks(data: unknown): Array<{ event: string; command: string }> {
  const hooks = record(data, 'config')['hooks'];
  if (hooks === undefined || hooks === null) return [];
  if (!Array.isArray(hooks)) throw shapeError('config.hooks');
  return hooks.flatMap((item) => {
    const hook = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
    return typeof hook['event'] === 'string' && typeof hook['command'] === 'string' ? [{ event: hook['event'], command: hook['command'] }] : [];
  });
}
