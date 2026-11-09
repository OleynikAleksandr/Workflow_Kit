// Autorun points of a project folder for the trust preview (D7): the trust dialog starts a Claude
// session in the folder, so its hooks, permissions, MCP servers and status line run. The
// fingerprint covers the raw contents of every inspected file: a change between the preview and
// "Доверять" invalidates the token.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AutorunPoint } from '#provider-registry';
import { hookText, isKitHookEntry } from '#kit-structure';

/** Files inspected, relative to the project folder. */
export const AUTORUN_FILES: readonly string[] = ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json', '.codex/hooks.json'];

/** Result of a scan. */
export interface AutorunScan {
  autorun: AutorunPoint[];
  /** sha256 over the folder path and the raw contents (or absence) of every inspected file. */
  fingerprint: string;
}

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function short(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Hook commands of a { hooks: { <Event>: [{ matcher?, hooks: [{ command }] }] } } config. */
function hookPoints(file: string, config: JsonObject, kind: string): AutorunPoint[] {
  const points: AutorunPoint[] = [];
  const hooks = config['hooks'];
  if (!isRecord(hooks)) return points;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group['hooks'])) continue;
      const matcher = typeof group['matcher'] === 'string' && group['matcher'] !== '' ? ` [${group['matcher']}]` : '';
      for (const hook of group['hooks']) {
        if (!isRecord(hook)) continue;
        const command = typeof hook['command'] === 'string' ? hookText(hook) : JSON.stringify(hook);
        const kit = isKitHookEntry(hook) ? ' (хук Kit)' : '';
        points.push({ file, kind, detail: short(`${event}${matcher}: ${command}${kit}`) });
      }
    }
  }
  return points;
}

function settingsPoints(file: string, config: JsonObject): AutorunPoint[] {
  const points = hookPoints(file, config, 'hook');
  const permissions = config['permissions'];
  if (isRecord(permissions) && Array.isArray(permissions['allow']) && permissions['allow'].length > 0) {
    const allow = permissions['allow'].filter((rule): rule is string => typeof rule === 'string');
    points.push({ file, kind: 'permission', detail: short(`разрешено без вопроса: ${allow.join(', ')}`) });
  }
  if (isRecord(permissions) && permissions['defaultMode'] === 'bypassPermissions') {
    points.push({ file, kind: 'permission', detail: 'defaultMode: bypassPermissions — без вопросов о разрешениях' });
  }
  if (config['enableAllProjectMcpServers'] === true) {
    points.push({ file, kind: 'mcp', detail: 'enableAllProjectMcpServers: все серверы .mcp.json включаются без вопроса' });
  }
  if (Array.isArray(config['enabledMcpjsonServers']) && config['enabledMcpjsonServers'].length > 0) {
    points.push({ file, kind: 'mcp', detail: short(`включены серверы .mcp.json: ${config['enabledMcpjsonServers'].join(', ')}`) });
  }
  for (const key of ['statusLine', 'apiKeyHelper', 'awsAuthRefresh', 'awsCredentialExport']) {
    const value = config[key];
    const command = isRecord(value) ? value['command'] : value;
    if (typeof command === 'string' && command !== '') points.push({ file, kind: 'command', detail: short(`${key}: ${command}`) });
  }
  return points;
}

function mcpPoints(file: string, config: JsonObject): AutorunPoint[] {
  const servers = config['mcpServers'];
  if (!isRecord(servers)) return [];
  return Object.entries(servers).map(([name, server]) => {
    let detail = name;
    if (isRecord(server)) {
      const args = Array.isArray(server['args']) ? server['args'].filter((a): a is string => typeof a === 'string') : [];
      if (typeof server['command'] === 'string') detail = `${name}: ${[server['command'], ...args].join(' ')}`;
      else if (typeof server['url'] === 'string') detail = `${name}: ${server['url']}`;
    }
    return { file, kind: 'mcp-server', detail: short(detail) };
  });
}

/** Scans the project folder; unreadable JSON is reported as a point, never thrown. */
export async function scanAutorun(projectPath: string): Promise<AutorunScan> {
  const hash = createHash('sha256').update(projectPath);
  const autorun: AutorunPoint[] = [];
  for (const relative of AUTORUN_FILES) {
    const file = path.join(projectPath, ...relative.split('/'));
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      hash.update(`\0${relative}\0-`);
      continue;
    }
    hash.update(`\0${relative}\0+${text}`);
    let config: unknown;
    try {
      config = JSON.parse(text);
    } catch {
      autorun.push({ file: relative, kind: 'invalid', detail: 'файл не читается как JSON — проверьте его вручную' });
      continue;
    }
    if (!isRecord(config)) {
      autorun.push({ file: relative, kind: 'invalid', detail: 'ожидается JSON-объект — проверьте файл вручную' });
      continue;
    }
    if (relative === '.mcp.json') autorun.push(...mcpPoints(relative, config));
    else if (relative === '.codex/hooks.json') autorun.push(...hookPoints(relative, config, 'codex-hook'));
    else autorun.push(...settingsPoints(relative, config));
  }
  return { autorun, fingerprint: hash.digest('hex') };
}
