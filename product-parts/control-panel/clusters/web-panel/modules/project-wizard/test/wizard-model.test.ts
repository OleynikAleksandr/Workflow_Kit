import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { PROJECT_WIZARD_ASSETS_DIR, PROJECT_WIZARD_PREFIX, projectWizardMount } from '../src/index.ts';
import { actionsKey, buttonViews, chatTarget, choiceViews, filesLabel, findRun, listedSessionKey, previewView, providerActionViews, runView, validAnswers } from '../src/wizard-model.js';

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
  providers: [
    { id: 'codex', label: 'ChatGPT', mark: 'G', available: false, reason: 'Codex CLI не найден' },
    { id: 'claude', label: 'Claude', mark: 'C', available: true, reason: null },
    { id: 'kimi', label: 'Kimi', mark: 'K', available: true, reason: null },
  ],
  hooks: [],
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
  assert.deepEqual(buttons.map((b) => [b.provider, b.label, b.letter, b.enabled]), [
    ['codex', 'Создать и открыть в ChatGPT', 'G', false],
    ['claude', 'Создать и открыть в Claude', 'C', false],
    ['kimi', 'Создать и открыть в Kimi', 'K', false],
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
  // The buttons are the providers of the preview: no list of their own, names with a fallback.
  assert.deepEqual(buttonViews(preview({ providers: [{ id: 'next', available: false }] }), {}).map((b) => [b.label, b.letter, b.reason]), [
    ['Создать и открыть в next', 'N', 'next недоступен'],
  ]);
  assert.deepEqual(buttonViews(preview({ providers: undefined }), {}), []);
});

test('a hook of the preview shows the file, the added text and the hash the consent approves', () => {
  const hooks = [
    {
      provider: 'kimi',
      label: 'Kimi',
      status: 'pending',
      command: '[[hooks]]\nevent = "Stop"',
      hash: '0123456789abcdef0123',
      writes: [{ file: '/Users/u/.kimi-code/config.toml', description: 'хук конца хода', value: '[[hooks]]\nevent = "Stop"' }],
      note: 'Хук общий для всех проектов',
    },
    { provider: 'codex', label: 'ChatGPT', status: 'pending', command: 'node wfk hook', hash: 'ffff', writes: [], note: null },
  ];
  const view = previewView(preview({ hooks }), 0);
  assert.deepEqual(view.hooks, [
    {
      title: 'Хук Kit для Kimi',
      files: ['/Users/u/.kimi-code/config.toml'],
      text: '[[hooks]]\nevent = "Stop"',
      hash: '0123456789ab',
      meta: 'запись в /Users/u/.kimi-code/config.toml · хеш 0123456789ab',
      note: 'Хук общий для всех проектов',
    },
    { title: 'Хук Kit для ChatGPT', files: [], text: 'node wfk hook', hash: 'ffff', meta: 'хеш ffff', note: null },
  ]);
  assert.deepEqual(previewView(preview(), 0).hooks, []);
  // A hook Kit cannot write: no hash and no file, only the text for a manual edit and the reason.
  const manual = { provider: 'kimi', label: 'Kimi', status: 'unknown', command: '[[hooks]]\nevent = "Stop"', hash: '', writes: [], note: 'Workflow Kit не меняет config.toml: ключ hooks задан массивом' };
  assert.deepEqual(previewView(preview({ hooks: [manual, { ...manual, command: '' }] }), 0).hooks, [
    { title: 'Хук Kit для Kimi', files: [], text: '[[hooks]]\nevent = "Stop"', hash: '', meta: '', note: manual.note },
    { title: 'Хук Kit для Kimi', files: [], text: '', hash: '', meta: '', note: manual.note },
  ]);
});

test('provider actions: buttons for a provider that is not ready, the rest folded; only enabled provider-level ones', () => {
  const state = {
    providers: {
      providers: [
        {
          id: 'codex',
          title: 'ChatGPT (Codex)',
          label: 'ChatGPT',
          actions: [
            { id: 'start-daemon', title: 'Запустить демон', scope: 'provider', enabled: true },
            { id: 'stop-daemon', title: 'Остановить демон', scope: 'provider', enabled: false },
            { id: 'trust', title: 'Доверить папку', scope: 'project', enabled: true },
          ],
        },
        { id: 'kimi', title: 'Kimi Code', actions: [{ id: 'remove-kimi-hook', title: 'Убрать хук Kit', scope: 'provider', enabled: true, confirm: 'Убрать хук?' }] },
        { id: 'claude', title: 'Claude', actions: [] },
      ],
    },
  };
  const views = providerActionViews(state, buttonViews(preview(), { 'claude:imports': 'deny' }));
  assert.deepEqual(views.primary, [{ provider: 'codex', id: 'start-daemon', title: 'Запустить демон', label: 'ChatGPT: Запустить демон', confirm: null }]);
  assert.deepEqual(views.more, [{ provider: 'kimi', id: 'remove-kimi-hook', title: 'Убрать хук Kit', label: 'Kimi Code: Убрать хук Kit', confirm: 'Убрать хук?' }]);
  assert.deepEqual(providerActionViews({}, []), { primary: [], more: [] });
  assert.notEqual(actionsKey(state), actionsKey({}));
  assert.equal(actionsKey(state), actionsKey(JSON.parse(JSON.stringify(state))));
});

test('run steps, cancel and the created session', () => {
  const run = {
    operationId: 'op1',
    provider: 'codex',
    providerLabel: 'ChatGPT',
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
  assert.equal(view.errorCode, 'x');
  assert.equal(view.providerLabel, 'ChatGPT');
  assert.equal(runView({ status: 'succeeded', provider: 'kimi' }).title, 'Проект готов, сессия в kimi создана', 'the id stands in for a missing short name');
  assert.equal(view.canCancel, false);
});

test('the chat opens on this device: app links in place, web links in a new tab', () => {
  const links = { desktop: 'codex://threads/t1', mobile: 'https://chatgpt.com/codex/t1' };
  assert.deepEqual(chatTarget(links, 0), { href: 'codex://threads/t1', newTab: false });
  assert.deepEqual(chatTarget(links, 5), { href: 'https://chatgpt.com/codex/t1', newTab: true });
  assert.equal(chatTarget({ desktop: 'javascript:alert(1)' }, 0), null);
  assert.deepEqual(chatTarget({ web: 'https://claude.ai/code/s' }, 0), { href: 'https://claude.ai/code/s', newTab: true });
});

test('the run session is found in the tree by localId or remoteId (a Claude session gets its own id from the hook)', () => {
  const claude = runView({ status: 'succeeded', projectId: 'p', session: { provider: 'claude', localId: 'session_01Ab', remoteId: 'session_01Ab' } });
  assert.deepEqual(claude.session, { provider: 'claude', localId: 'session_01Ab', remoteId: 'session_01Ab' });
  const state = (sessions: unknown[]) => ({ providers: { projects: { p: { claude: { sessions }, codex: { sessions: [{ provider: 'codex', localId: 't9', remoteId: null }] } } } } });
  // Before the hook the tree lists the Remote Control id; after it, Claude's own id.
  assert.equal(listedSessionKey(state([]), 'p', claude.session!), null);
  assert.equal(listedSessionKey(state([{ provider: 'claude', localId: 'session_01Ab', remoteId: 'session_01Ab' }]), 'p', claude.session!), 'claude:session_01Ab');
  assert.equal(listedSessionKey(state([{ provider: 'claude', localId: '7f3c-uuid', remoteId: 'session_01Ab' }]), 'p', claude.session!), 'claude:7f3c-uuid');
  assert.equal(listedSessionKey(state([{ provider: 'claude', localId: 'other', remoteId: 'session_x' }]), 'p', claude.session!), null);
  const codex = runView({ status: 'succeeded', projectId: 'p', session: { provider: 'codex', localId: 't9' } });
  assert.equal(listedSessionKey(state([]), 'p', codex.session!), 'codex:t9');
  assert.equal(listedSessionKey(state([]), 'other', codex.session!), null);
  assert.equal(runView({ status: 'running' }).session, null);
});
