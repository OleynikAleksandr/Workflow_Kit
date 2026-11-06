import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PROJECT_WIZARD_ASSETS_DIR, PROJECT_WIZARD_PREFIX, projectWizardMount } from '../src/index.ts';
import { buttonViews, chatTarget, choiceViews, filesLabel, findRun, previewView, runView, validAnswers } from '../src/wizard-model.js';

const preview = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  token: 't',
  expiresAt: '2026-11-06T08:15:00Z',
  mode: 'create',
  name: 'F001',
  path: '/Users/u/VSCODE/F001',
  actions: [{ id: 'structure', title: 'Структура Kit в папке', detail: 'AGENTS.md, CLAUDE.md' }],
  changes: { count: 3, files: ['AGENTS.md', 'CLAUDE.md', '.codex/hooks.json'] },
  choices: [
    {
      id: 'claude:imports',
      title: 'Внешние импорты CLAUDE.md',
      description: 'CLAUDE.md подключает файлы вне папки',
      required: true,
      options: [{ id: 'allow', title: 'Разрешить' }, { id: 'deny', title: 'Запретить' }],
    },
  ],
  blocked: null,
  providers: { claude: { available: true, reason: null }, codex: { available: false, reason: 'Codex CLI не найден' } },
  notes: ['Папка новая'],
  ...extra,
});

test('the mount serves the wizard files under /project-wizard/', async () => {
  assert.deepEqual(projectWizardMount(), { prefix: PROJECT_WIZARD_PREFIX, dir: PROJECT_WIZARD_ASSETS_DIR });
  const source = await readFile(path.join(PROJECT_WIZARD_ASSETS_DIR, 'project-wizard.js'), 'utf8');
  assert.match(source, /export function install\(shell\)/);
  assert.match(source, /registerSlot\('newProject'/);
  assert.match(source, /'\/api\/setup\/preview'/);
  assert.match(source, /'\/api\/setup\/apply'/);
  assert.match(source, /\/cancel`/);
  assert.doesNotMatch(source, /innerHTML/);
});

test('preview: actions, changes, notes and expiry', () => {
  const view = previewView(preview(), Date.parse('2026-11-06T08:10:00Z'));
  assert.equal(view.title, 'Новый проект');
  assert.equal(view.changesLabel, 'Изменения в папке · 3 файла');
  assert.deepEqual(view.actions, [{ title: 'Структура Kit в папке', detail: 'AGENTS.md, CLAUDE.md' }]);
  assert.equal(view.expired, false);
  assert.equal(previewView(preview(), Date.parse('2026-11-06T08:20:00Z')).expired, true);
  assert.equal(previewView(preview({ mode: 'open' }), 0).title, 'Открыть проект');
  assert.deepEqual([1, 3, 5, 21, 70].map(filesLabel), ['1 файл', '3 файла', '5 файлов', '21 файл', '70 файлов']);
});

test('buttons wait for a required answer; unavailable providers and blocked previews say why', () => {
  let buttons = buttonViews(preview(), {});
  assert.deepEqual(buttons.map((b) => [b.provider, b.label, b.enabled]), [
    ['codex', 'Создать и открыть в ChatGPT', false],
    ['claude', 'Создать и открыть в Claude', false],
  ]);
  assert.equal(buttons[0]!.reason, 'Codex CLI не найден');
  assert.equal(buttons[1]!.reason, 'Сначала выберите ответ: «Внешние импорты CLAUDE.md»');
  assert.equal(buttonViews(preview(), { 'claude:imports': 'maybe' })[1]!.enabled, false, 'an answer outside the options does not count');
  buttons = buttonViews(preview(), { 'claude:imports': 'deny' });
  assert.equal(buttons[1]!.enabled, true);
  assert.deepEqual(validAnswers(preview(), { 'claude:imports': 'deny', other: 'x' }), { 'claude:imports': 'deny' });
  assert.equal(choiceViews(preview(), { 'claude:imports': 'deny' })[0]!.options[1]!.checked, true);
  const blocked = buttonViews(preview({ blocked: { code: 'GIT_IDENTITY_REQUIRED', message: 'Нет git-личности', commands: [] } }), { 'claude:imports': 'deny' });
  assert.ok(blocked.every((b) => !b.enabled && b.reason === 'Нет git-личности'));
});

test('run steps, cancel and the created session', () => {
  const run = {
    operationId: 'op1',
    provider: 'codex',
    projectId: 'p1',
    status: 'running',
    cancelRequested: false,
    steps: [
      { id: 'structure', title: 'Структура Kit', status: 'done', note: '70 файлов' },
      { id: 'session', title: 'Сессия', status: 'running', note: null },
      { id: 'trust-claude', title: 'Доверие Claude', status: 'skipped', note: null },
    ],
    session: null,
    error: null,
  };
  const state = { setup: { runs: [run] } };
  assert.equal(findRun(state, 'op1'), run);
  assert.equal(findRun(state, 'op2'), null);
  let view = runView(run);
  assert.equal(view.title, 'Готовим проект');
  assert.equal(view.canCancel, true);
  assert.deepEqual(view.steps.map((s) => s.mark), ['✓', '', '–']);
  assert.equal(runView({ ...run, cancelRequested: true }).canCancel, false);
  view = runView({ ...run, status: 'succeeded', session: { provider: 'codex', localId: 't9' } });
  assert.equal(view.title, 'Проект готов, сессия в ChatGPT создана');
  assert.equal(view.sessionKey, 'codex:t9');
  view = runView({ ...run, status: 'failed', error: { code: 'x', message: 'Не вышло', hint: 'Повторите' } });
  assert.deepEqual(view.error, { message: 'Не вышло', hint: 'Повторите' });
  assert.equal(view.canCancel, false);
});

test('the chat opens on this device: app links in place, web links in a new tab', () => {
  const links = { desktop: 'codex://threads/t1', mobile: 'https://chatgpt.com/codex/t1' };
  assert.deepEqual(chatTarget(links, 0), { href: 'codex://threads/t1', newTab: false });
  assert.deepEqual(chatTarget(links, 5), { href: 'https://chatgpt.com/codex/t1', newTab: true });
  assert.equal(chatTarget({ desktop: 'javascript:alert(1)' }, 0), null);
  assert.deepEqual(chatTarget({ web: 'https://claude.ai/code/s' }, 0), { href: 'https://claude.ai/code/s', newTab: true });
});
