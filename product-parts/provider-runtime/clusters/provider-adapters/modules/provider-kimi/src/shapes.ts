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
  /** started_at of the record, ms; null when absent. */
  startedAt: number | null;
}

/** A server record; undefined for a file that is not one (it is being written, or of another version). */
export function parseInstance(data: unknown): KimiInstance | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const item = data as Record<string, unknown>;
  const { server_id: serverId, pid, port } = item;
  if (typeof serverId !== 'string' || !Number.isInteger(pid) || !Number.isInteger(port)) return undefined;
  if (typeof item['host'] === 'string' && item['host'] !== '127.0.0.1' && item['host'] !== 'localhost') return undefined;
  const started = item['started_at'];
  const startedAt = typeof started === 'number' && Number.isFinite(started) ? started : typeof started === 'string' && !Number.isNaN(Date.parse(started)) ? Date.parse(started) : null;
  return { serverId, pid: pid as number, port: port as number, startedAt };
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

/** A time of Kimi (ms or an ISO string) as an ISO string. */
function isoTime(value: unknown, what: string): string {
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(ms)) throw shapeError(what);
  return new Date(ms).toISOString();
}

const optionalText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

/** A session as GET /api/v2/sessions lists it. */
export interface KimiListedSession {
  id: string;
  workspaceId: string;
  cwd: string | null;
  title: string;
  createdAt: string;
  archived: boolean;
  /** running, approval, question, failed, idle. */
  status: string | null;
  model: string | null;
}

/** GET /api/v2/sessions: one page; next is the token of the following page, null on the last one. */
export function parseSessionPage(data: unknown): { items: KimiListedSession[]; next: string | null } {
  const page = record(data, 'sessions');
  if (!Array.isArray(page['items'])) throw shapeError('sessions.items');
  const items = page['items'].map((value, index): KimiListedSession => {
    const what = `sessions.items[${index}]`;
    const item = record(value, what);
    const workspace = record(item['workspace'], `${what}.workspace`);
    const meta = record(item['meta'], `${what}.meta`);
    const activity = typeof item['activity'] === 'object' && item['activity'] !== null ? (item['activity'] as Record<string, unknown>) : {};
    if (typeof meta['archived'] !== 'boolean') throw shapeError(`${what}.meta.archived`);
    return {
      id: text(item['id'], `${what}.id`),
      workspaceId: text(workspace['id'], `${what}.workspace.id`),
      cwd: optionalText(workspace['cwd']),
      title: typeof meta['title'] === 'string' ? meta['title'] : '',
      createdAt: isoTime(meta['created_at'], `${what}.meta.created_at`),
      archived: meta['archived'],
      status: optionalText(activity['status']),
      model: optionalText(activity['model']),
    };
  });
  const token = optionalText(page['next_page_token']);
  if (page['has_more'] === true && token === null) throw shapeError('sessions.next_page_token');
  return { items, next: page['has_more'] === false ? null : token };
}

/** A session as POST /api/v1/sessions, GET /api/v1/sessions/{id} and …/profile answer. */
export interface KimiSession {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  archived: boolean;
  /** Kimi waits for an answer of the user (an approval or a question). */
  waiting: boolean;
  /** Model of the session; null until one is set. */
  model: string | null;
  cwd: string | null;
}

export function parseSession(data: unknown): KimiSession {
  const item = record(data, 'session');
  const metadata = typeof item['metadata'] === 'object' && item['metadata'] !== null ? (item['metadata'] as Record<string, unknown>) : {};
  const agent = typeof item['agent_config'] === 'object' && item['agent_config'] !== null ? (item['agent_config'] as Record<string, unknown>) : {};
  const pending = item['pending_interaction'];
  return {
    id: text(item['id'], 'session.id'),
    workspaceId: text(item['workspace_id'], 'session.workspace_id'),
    title: typeof item['title'] === 'string' ? item['title'] : '',
    createdAt: isoTime(item['created_at'], 'session.created_at'),
    archived: item['archived'] === true,
    waiting: typeof pending === 'string' && pending !== '' && pending !== 'none',
    model: optionalText(agent['model']),
    cwd: optionalText(metadata['cwd']),
  };
}

/** One message of a session: its text parts joined; origin is metadata.origin.kind. */
export interface KimiMessage {
  id: string;
  role: string;
  text: string;
  origin: string | null;
  /** created_at as an ISO string; null when absent or malformed (never a shape error). */
  at: string | null;
}

/** An optional time of Kimi (ms or an ISO string) as an ISO string; null when it is not one. */
function optionalTime(value: unknown): string | null {
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : null;
}

/** GET /api/v1/sessions/{id}/messages: one page, newest first. */
export function parseMessages(data: unknown): { items: KimiMessage[]; hasMore: boolean } {
  const page = record(data, 'messages');
  if (!Array.isArray(page['items'])) throw shapeError('messages.items');
  if (typeof page['has_more'] !== 'boolean') throw shapeError('messages.has_more');
  const items = page['items'].map((value, index): KimiMessage => {
    const what = `messages.items[${index}]`;
    const item = record(value, what);
    if (!Array.isArray(item['content'])) throw shapeError(`${what}.content`);
    const parts = item['content'].flatMap((part) => {
      const piece = typeof part === 'object' && part !== null ? (part as Record<string, unknown>) : {};
      return piece['type'] === 'text' && typeof piece['text'] === 'string' ? [piece['text']] : [];
    });
    const metadata = typeof item['metadata'] === 'object' && item['metadata'] !== null ? (item['metadata'] as Record<string, unknown>) : {};
    const origin = typeof metadata['origin'] === 'object' && metadata['origin'] !== null ? (metadata['origin'] as Record<string, unknown>)['kind'] : undefined;
    return { id: text(item['id'], `${what}.id`), role: text(item['role'], `${what}.role`), text: parts.join('\n').trim(), origin: optionalText(origin), at: optionalTime(item['created_at']) };
  });
  return { items, hasMore: page['has_more'] };
}

/** POST /api/v1/sessions/{id}/prompts: the status of the accepted prompt (running, queued, blocked). */
export function parsePrompt(data: unknown): string {
  return text(record(data, 'prompt')['status'], 'prompt.status');
}

/** One row of POST /api/v2/sessions:archive | :restore. */
export interface KimiBatchResult {
  id: string;
  ok: boolean;
  code: number | null;
  message: string | null;
}

export function parseBatch(data: unknown): KimiBatchResult[] {
  const results = record(data, 'batch')['results'];
  if (!Array.isArray(results)) throw shapeError('batch.results');
  return results.map((value, index) => {
    const item = record(value, `batch.results[${index}]`);
    if (typeof item['ok'] !== 'boolean') throw shapeError(`batch.results[${index}].ok`);
    const error = typeof item['error'] === 'object' && item['error'] !== null ? (item['error'] as Record<string, unknown>) : {};
    return { id: text(item['id'], `batch.results[${index}].id`), ok: item['ok'], code: typeof error['code'] === 'number' ? error['code'] : null, message: optionalText(error['message']) };
  });
}

/** The only Remote Control address Kit passes on: the page of a device, without credentials or parameters. */
export const REMOTE_URL = /^https:\/\/code-rc\.kimi\.com\/devices\/[A-Za-z0-9_-]{1,128}\/$/;

/** GET and POST /api/v1/remote-control; url is null unless it is a REMOTE_URL. */
export interface KimiRemoteState {
  enabled: boolean;
  state: string;
  url: string | null;
  /** Another application of the machine runs Remote Control. */
  conflict: boolean;
}

export function parseRemote(data: unknown): KimiRemoteState {
  const remote = record(data, 'remote-control');
  if (typeof remote['enabled'] !== 'boolean') throw shapeError('remote-control.enabled');
  const url = remote['url'];
  const conflict = remote['conflict'];
  return { enabled: remote['enabled'], state: text(remote['state'], 'remote-control.state'), url: typeof url === 'string' && REMOTE_URL.test(url) ? url : null, conflict: typeof conflict === 'object' && conflict !== null };
}
