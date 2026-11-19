// M47 T001, end to end on a real service (createApp on loopback, the CLI hooks): Claude 2.1.328
// reports a long paste in its UserPromptSubmit hook wrapped in <pasted_content> (recorded live);
// the panel message that began the turn answers `{ sent: true }` and is not queued again.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { sessionKey } from '#agent-channel';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import { DIRECT_CONFIRM_MS } from '../src/direct-message.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let env: Record<string, string> = {};
let folder = '';
const lines: string[] = [];
/** The text and its hook prompt recorded from Claude 2.1.328 (bracketed paste of 7 lines). */
const PANEL_TEXT = 'Сделай маленькую утилиту на Node.js без зависимостей: `node wc.mjs <файл>` печатает число строк,\nслов и символов файла. Нужна спецификация и план из трёх задач:\n1) код утилиты;\n2) тест на node:test (пустой файл, файл с кириллицей, отсутствующий файл → код выхода 1);\n3) задача поставки (delivery): `npm pack` и запись имени архива в docs/release.md.\nПеред первой задачей спроси меня через AskUserQuestion, какое имя дать команде: «wc» или «счётчик».\nЭто проверка записи: ничего не делай, ответь одним словом: ок.';
const wrap = (text: string): string => `\n\n<pasted_content id="4ec3">\n${text}\n</pasted_content id="4ec3">\n`;
const terminal = { pasted: [] as string[] };

const pasting = (): Provider => ({
  ...createStubProvider({ id: 'paste', title: 'paste', task: 'T' }),
  marksPanelProcess: true,
  sendDirect: async (_project, sessionId, text) => {
    terminal.pasted.push(text);
    setTimeout(() => void hook('prompt', { session_id: sessionId, cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: wrap(text) }), 20);
    return true;
  },
});

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m47-e2e-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  app = await createApp({ env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' }, homedir: tmp, providers: [pasting], log: (line) => void lines.push(line) });
  const bound = await app.start();
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  await app.projects.open(folder);
});
after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function hook(event: string, input: object): Promise<void> {
  await main(['hook', event, '--client', 'paste'], {
    stdout: () => undefined, stderr: () => undefined,
    app: { env: { ...env, WFK_PANEL_SESSION: '1' }, homedir: tmp },
    readStdin: async () => JSON.stringify(input),
    hookClients: ['paste'],
  });
}

async function panelMessage(key: string, text: string): Promise<Record<string, unknown>> {
  const project = (await app.projects.list())[0]!;
  const response = await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/projects/${project.id}/sessions/${encodeURIComponent(key)}/message`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${env['WFK_PORT']}` }, body: JSON.stringify({ text }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as Record<string, unknown>;
}

test('a long paste whose hook comes wrapped is sent, not queued, and logged as confirmed by order', { timeout: DIRECT_CONFIRM_MS + 15_000 }, async () => {
  const key = sessionKey('paste', 'p-1');
  const stop = { session_id: 'p-1', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false };
  await hook('stop', stop);
  assert.equal(app.channel.get(key)!.state, 'waiting');

  const started = Date.now();
  assert.deepEqual(await panelMessage(key, PANEL_TEXT), { sent: true });
  assert.ok(Date.now() - started < DIRECT_CONFIRM_MS, 'answered with the hook, not after the confirmation time');
  assert.equal(app.channel.get(key)!.state, 'working');
  assert.deepEqual(app.channel.queued(key), []);
  assert.deepEqual(terminal.pasted, [PANEL_TEXT]);
  assert.ok(lines.some((line) => line.includes(`channel: prompt hook of ${key} confirmed the pasted message by order`)), lines.join('\n'));
  assert.ok(!lines.some((line) => line.includes('no prompt hook took it')), lines.join('\n'));
});
