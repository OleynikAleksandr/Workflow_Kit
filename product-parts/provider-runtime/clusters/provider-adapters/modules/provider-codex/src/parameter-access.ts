import type { AccessOption, AccessPresentation } from '#provider-registry';
import type { RpcSession } from './rpc.ts';
import { obj, str, list } from './parameter-values.ts';
import type { Dict } from './parameter-values.ts';

export const ACCESS_PRESETS: Record<string, { permissions: string; approvalPolicy: string; approvalsReviewer: string }> = {
  ask: { permissions: ':workspace', approvalPolicy: 'on-request', approvalsReviewer: 'user' },
  auto: { permissions: ':workspace', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' },
  full: { permissions: ':danger-full-access', approvalPolicy: 'never', approvalsReviewer: 'user' },
};
export function accessId(profile: string | null, policy: unknown, reviewer: unknown): string | null {
  const canonical = reviewer === 'guardian_subagent' ? 'auto_review' : reviewer;
  if (profile === ':workspace' && policy === 'on-request') return canonical === 'user' ? 'ask' : canonical === 'auto_review' ? 'auto' : null;
  return profile === ':danger-full-access' && policy === 'never' && canonical === 'user' ? 'full' : null;
}
function allowed(requirements: Dict, key: string, value: string): boolean {
  if (!Object.hasOwn(requirements, key) || requirements[key] === null) return true;
  const values = requirements[key];
  return Array.isArray(values) && values.every(v => typeof v === 'string') && values.includes(value);
}
export interface AccessLimits { requirements: Dict | null; guardian: boolean | null }
/** Reads only RPC metadata; config bodies are reduced immediately and never retained or logged. */
export function createAccessReader(now: () => Date) {
  const cache = new Map<string, { at: number; value: AccessLimits }>();
  return {
    clear() { cache.clear(); },
    async read(session: RpcSession, cwd: string | null, force = false): Promise<AccessLimits> {
      const key = cwd ?? ''; const old = cache.get(key); const at = now().getTime();
      if (!force && old && at - old.at < 60000) return old.value;
      const request = (method: string, params: Dict) => session.request(method, params).then(obj).catch(() => null);
      const [requirements, features, config] = await Promise.all([
        request('configRequirements/read', {}), request('experimentalFeature/list', {}),
        request('config/read', { includeLayers: false, ...(cwd ? { cwd } : {}) }),
      ]);
      const raw = requirements?.['requirements'];
      const validRequirements = requirements && Object.hasOwn(requirements, 'requirements') && (raw === null || (raw !== null && typeof raw === 'object' && !Array.isArray(raw)));
      const flag = list(features?.['data']).find(f => f['name'] === 'guardian_approval')?.['enabled'];
      const local = obj(obj(config?.['config'])['features'])['guardian_approval'];
      const configKnown = config && config['config'] !== null && typeof config['config'] === 'object' && !Array.isArray(config['config']);
      const guardian = !configKnown || typeof flag !== 'boolean' || (local !== undefined && typeof local !== 'boolean') ? null : flag && local !== false;
      const value: AccessLimits = { requirements: validRequirements ? obj(raw) : null, guardian };
      cache.set(key, { at, value }); return value;
    },
  };
}
export function accessPresentation(profile: string | null, policy: unknown, reviewer: unknown, profiles: Dict[], limits: AccessLimits, reason: string | null, confirm: string): AccessPresentation {
  const value = accessId(profile, policy, reviewer);
  const labels: Record<string, string> = { ask: 'Запрашивать разрешение', auto: 'Подтверждать за меня', full: 'Полный доступ' };
  const descriptions: Record<string, string> = {
    ask: 'Всегда запрашивать разрешение перед изменением внешних файлов и использованием интернета',
    auto: 'Запрашивать подтверждение только для потенциально небезопасных действий',
    full: 'Неограниченный доступ к интернету и любым файлам на вашем компьютере',
  };
  const icons: Record<string, AccessOption['icon']> = { ask: 'hand', auto: 'shield-check', full: 'shield-alert' };
  const options: AccessOption[] = Object.entries(ACCESS_PRESETS).map(([id, preset]) => {
    let blocked = reason;
    if (!blocked && !profiles.some(p => p['id'] === preset.permissions && p['allowed'] === true)) blocked = 'Профиль доступа запрещён или недоступен';
    if (!blocked && !limits.requirements) blocked = 'Требования доступа сейчас недоступны';
    if (!blocked && limits.requirements && (!allowed(limits.requirements, 'allowedApprovalPolicies', preset.approvalPolicy) || !allowed(limits.requirements, 'allowedApprovalsReviewers', preset.approvalsReviewer))) blocked = 'Запрещено политикой провайдера';
    if (!blocked && id === 'auto' && limits.guardian !== true) blocked = limits.guardian === false ? 'Автоматическая проверка отключена в Codex' : 'Состояние автоматической проверки недоступно';
    return { value: id, label: labels[id]!, description: descriptions[id]!, icon: icons[id]!, ...(blocked ? { disabled: true, reason: blocked } : {}), ...(id === 'full' ? { confirm } : {}) };
  });
  return { value, label: value ? labels[value]! : 'Особые разрешения', tone: value === 'full' ? 'warning' : 'primary', options, ...(reason ? { reason } : {}) };
}
export function speedHint(model: Dict | undefined): string | undefined {
  const description = str(list(model?.['serviceTiers']).find(t => t['id'] === 'priority')?.['description']);
  if (!description) return undefined;
  const match = /^(\d+(?:\.\d+)?)x speed(?:, increased usage)?$/i.exec(description);
  return match ? `Скорость ${match[1]!.replace('.', ',')}×\nБольше использования` : description;
}
