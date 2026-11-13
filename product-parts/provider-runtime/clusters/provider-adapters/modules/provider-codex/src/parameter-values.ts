import path from 'node:path';
import type { ParameterId } from '#provider-registry';
export type Dict = Record<string, unknown>;
export const obj = (v: unknown): Dict => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Dict : {};
export const str = (v: unknown): string | null => typeof v === 'string' && v ? v : null;
export const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export const list = (v: unknown): Dict[] => Array.isArray(v) ? v.map(obj) : [];
export const EFFORT: Record<string, string> = { low: 'Низкое', medium: 'Среднее', high: 'Высокое', xhigh: 'Очень высокое', max: 'Максимальное', ultra: 'Ультра' };
export const LABELS: Record<ParameterId, string> = { ultracode: 'Ultracode', model: 'Модель', effort: 'Усилие', speed: 'Скорость', mode: 'Режим', permissions: 'Разрешения' };
export const PERMISSIONS: Record<string, string> = { ':read-only': 'Только чтение', ':workspace': 'Рабочая папка', ':danger-full-access': 'Полный доступ' };
export function valueLabel(id: ParameterId, value: string, models: Dict[]): string {
  if (id === 'effort') return EFFORT[value] ?? value;
  if (id === 'permissions') return PERMISSIONS[value] ?? value;
  if (id === 'mode') return ({ default: 'Обычный', plan: 'План' } as Dict)[value] as string || value;
  if (id === 'speed') return value === 'standard' ? 'Стандартная' : value === 'priority' ? 'Быстрая' : value;
  const model = models.find(m => m['model'] === value || m['id'] === value);
  const display = str(model?.['displayName']);
  return display ? display.replace(/-([^-]+)$/, ' $1') : value;
}

/** Only verified shapes count as standard permissions; unfamiliar structures fail closed. */
export function permissionId(settings: Dict, fromTurn: boolean, platform: NodeJS.Platform): string | null {
  if (fromTurn) return ({ 'read-only': ':read-only', 'danger-full-access': ':danger-full-access' } as Dict)[String(obj(settings['sandbox_policy'])['type'])] as string || null;
  const profile = obj(settings['permission_profile']);
  if (profile['type'] === 'disabled' && Object.keys(profile).length === 1) return ':danger-full-access';
  if (Object.keys(profile).some(k => !['type', 'file_system', 'network'].includes(k)) || profile['type'] !== 'managed' || profile['network'] !== 'restricted') return null;
  const fs = obj(profile['file_system']);
  if (fs['type'] !== 'restricted' || !Array.isArray(fs['entries'])) return null;
  const entries = list(fs['entries']);
  const root = (e: Dict) => obj(e['path'])['type'] === 'special' && obj(obj(e['path'])['value'])['kind'] === 'root';
  if (entries.length === 1 && root(entries[0]!) && entries[0]!['access'] === 'read') return ':read-only';
  const p = platform === 'win32' ? path.win32 : path.posix;
  const normalize = (s: string) => platform === 'win32' ? p.resolve(s).toLowerCase() : p.resolve(s);
  const roots = Array.isArray(settings['runtime_workspace_roots']) ? (settings['runtime_workspace_roots'] as unknown[]).filter((r): r is string => typeof r === 'string').map(normalize) : [];
  let hasRoot = false; let hasWrite = false;
  if (!roots.length) return null;
  for (const entry of entries) {
    if (Object.keys(entry).some(k => !['path', 'access', 'missing_path_behavior'].includes(k))) return null;
    if (root(entry)) { if (entry['access'] !== 'read') return null; hasRoot = true; continue; }
    const target = obj(entry['path']); const access = entry['access'];
    if (!['write', 'read'].includes(String(access))) return null;
    if (target['type'] === 'special') {
      if (access !== 'write' || !['slash_tmp', 'tmpdir'].includes(String(obj(target['value'])['kind']))) return null;
      hasWrite = true; continue;
    }
    const value = str(target['path']); if (target['type'] !== 'path' || !value || !p.isAbsolute(value)) return null;
    const canonical = normalize(value);
    if (access === 'write') { if (!roots.includes(canonical)) return null; hasWrite = true; }
    else if (!roots.some(r => { const relative = p.relative(r, canonical); return relative !== '..' && !relative.startsWith(`..${p.sep}`) && !p.isAbsolute(relative); })) return null;
  }
  return hasRoot && hasWrite ? ':workspace' : null;
}
