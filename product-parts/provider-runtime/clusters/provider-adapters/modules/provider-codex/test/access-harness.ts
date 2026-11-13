import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SharedAccess } from '#provider-registry';
import { createParameterParts } from '../src/parameters.ts';
import { createParameterUpdater } from '../src/parameter-update.ts';
import type { CodexRuntime } from '../src/runtime.ts';
import type { RpcSession } from '../src/rpc.ts';

export async function accessHarness(platform: NodeJS.Platform) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-access-')); const file = path.join(tmp, 'rollout');
  const cwd = platform === 'win32' ? 'C:\\Work' : '/work';
  const workspace = { type: 'managed', network: 'restricted', file_system: { type: 'restricted', entries: [
    { path: { type: 'special', value: { kind: 'root' } }, access: 'read' },
    { path: { type: 'path', path: cwd }, access: 'write' },
  ] } };
  const settings: Record<string, unknown> = { permission_profile: workspace, runtime_workspace_roots: [cwd], approval_policy: 'on-request', approvals_reviewer: 'user', service_tier: 'priority', collaboration_mode: { mode: 'default', settings: { developer_instructions: 'Keep me' } } };
  const thread = { id: 's', cwd, path: file, model: 'wide', reasoningEffort: 'high', status: { type: 'active' } };
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const state = { requirements: { requirements: null } as Record<string, unknown>, guardian: true, configFlag: undefined as unknown, profilesAllowed: true, ignoreUpdate: false };
  const persist = () => appendFile(file, JSON.stringify({ type: 'event_msg', payload: { type: 'thread_settings_applied', thread_settings: settings } }) + '\n');
  await writeFile(file, ''); await persist();
  const session = { async request(method: string, raw: unknown = {}) {
    const params = raw as Record<string, unknown>; calls.push({ method, params });
    if (method === 'thread/read') return { thread };
    if (method === 'model/list') return { data: [{ model: 'wide', displayName: 'Wide', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }], serviceTiers: [{ id: 'priority', description: '1.5x speed, increased usage' }] }] };
    if (method === 'collaborationMode/list') return { data: [{ mode: 'default' }] };
    if (method === 'permissionProfile/list') return { data: [':workspace', ':danger-full-access', ':read-only'].map(id => ({ id, allowed: state.profilesAllowed })) };
    if (method === 'account/rateLimits/read') return {};
    if (method === 'configRequirements/read') return state.requirements;
    if (method === 'experimentalFeature/list') return { data: [{ name: 'guardian_approval', enabled: state.guardian }] };
    if (method === 'config/read') return { config: { features: state.configFlag === undefined ? {} : { guardian_approval: state.configFlag } } };
    if (method === 'thread/loaded/list') return { data: ['s'] };
    if (method === 'thread/settings/update') {
      if (!state.ignoreUpdate) {
        if (params.permissions) settings.permission_profile = params.permissions === ':workspace' ? workspace : { type: 'disabled' };
        if (Object.hasOwn(params, 'approvalPolicy')) settings.approval_policy = params.approvalPolicy;
        if (Object.hasOwn(params, 'approvalsReviewer')) settings.approvals_reviewer = params.approvalsReviewer;
        if (params.effort) thread.reasoningEffort = String(params.effort);
        await persist();
      }
      return {};
    }
    throw new Error('Unexpected method ' + method);
  } } as unknown as RpcSession;
  const rt = { context: { platform, now: () => new Date(), log() {} }, withDaemon: async (fn: (s: RpcSession) => Promise<unknown>) => fn(session) } as unknown as CodexRuntime;
  const parts = createParameterParts(rt, { cached: () => ({ state: 'active' }) } as unknown as SharedAccess);
  const update = createParameterUpdater(rt, parts, { active: () => true, refresh: async () => true });
  return { tmp, file, cwd, settings, thread, state, parts, update, calls, persist, updates: () => calls.filter(c => c.method === 'thread/settings/update'), close: () => rm(tmp, { recursive: true, force: true }) };
}
