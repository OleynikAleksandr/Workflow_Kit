// M39 T009 (validation 1.5): the run of the session shows its mode, the actual stage, what it
// waits for, why it stopped, the control buttons and, after the close, the publication; another
// session, a stopped run and the completed run of an earlier plan show nothing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MODE_LABELS, NO_GRANT_DETAIL, NO_GRANT_LABEL, PHASE_LABELS, STOP_CONFIRM, STOP_REASONS, USER_ACCEPTANCE_LABEL, runView } from '../src/run-model.js';
import { planView } from '../src/plan-cards.js';

const KEY = 'claude:s-1';
const state = (run: Record<string, unknown>, plan: Record<string, unknown> | null = null, settings: Record<string, unknown> = { mode: 'after-start', review: false, revision: 2 }) => ({
  autopiloting: { settings, projects: { p: { runId: 'run-abcdef', revision: 7, owner: KEY, mode: 'after-start', phase: 'executing', pausedFrom: null, reason: null, nextAction: null, scopeId: 'auto', wait: null, publication: null, ...run } } },
  workflow: { projects: { p: plan ? { plan } : {} } },
});

test('the exact mode names and the stages of a run', () => {
  assert.deepEqual(MODE_LABELS, { 'after-start': 'После ручного запуска Плана', full: 'Полный автопилот' });
  const run = runView(state({}), 'p', KEY)!;
  assert.deepEqual([run.modeLabel, run.phaseLabel, run.tone, run.revision], ['После ручного запуска Плана', PHASE_LABELS['executing'], 'working', 7]);
  assert.deepEqual(run.buttons.map((b) => b.action), ['pause', 'stop']);
  assert.equal(runView(state({}), 'p', 'codex:other'), null, 'only the owner session');
  assert.equal(runView(state({ phase: 'stopped' }), 'p', KEY), null);
});

test('waits, the expired question and stops are shown from the facts', () => {
  const ci = runView(state({ phase: 'waiting', pausedFrom: 'delivering', wait: { reason: 'ci', detail: 'Ждёт CI для abcdef', sha: 'a'.repeat(40), since: 'x' } }), 'p', KEY)!;
  assert.deepEqual([ci.phaseLabel, ci.detail, ci.tone], ['Ждёт CI', 'Ждёт CI для abcdef', 'waiting']);
  const question = runView(state({ phase: 'waiting', wait: { reason: 'question', detail: 'Агент ждёт ответа на вопрос', sha: null, since: 'x' } }), 'p', KEY)!;
  assert.equal(question.phaseLabel, 'Ждёт ответа на вопрос агента');
  const expired = runView(state({ phase: 'blocked', reason: 'question-expired', nextAction: 'Нужны данные: …' }), 'p', KEY)!;
  assert.deepEqual([expired.phaseLabel, expired.tone, expired.nextAction], ['Нужны данные', 'warn', 'Нужны данные: …']);
  assert.deepEqual(expired.buttons.map((b) => b.action), ['resume', 'stop']);
  const paused = runView(state({ phase: 'paused', reason: 'user-pause' }), 'p', KEY)!;
  assert.deepEqual([paused.phaseLabel, paused.detail, paused.buttons.map((b) => b.action)], ['На паузе', 'user-pause', ['resume', 'stop']]);
  assert.match(STOP_CONFIRM, /План останется/u);
});

test('after the close: «Публикует», then the SHA, the upstream and the commits, or why it did not publish', () => {
  const sha = 'f'.repeat(40);
  const publishing = runView(state({ phase: 'waiting', pausedFrom: 'publishing', wait: { reason: 'ci', detail: 'Ждёт CI', sha, since: 'x' }, publication: { upstream: 'origin/main', finalSha: sha, published: null, commits: null, already: false } }), 'p', KEY)!;
  assert.equal(publishing.publication?.text, 'Публикует fffffff в origin/main: ждёт CI этого коммита');
  const done = runView(state({ phase: 'completed', publication: { upstream: 'origin/main', finalSha: sha, published: sha, commits: 3, already: false } }), 'p', KEY)!;
  assert.deepEqual([done.phaseLabel, done.publication?.text, done.buttons], ['Опубликовано', 'fffffff → origin/main · коммитов: 3', []]);
  const refused = runView(state({ phase: 'blocked', pausedFrom: 'publishing', reason: 'push-auth: Удалённый репозиторий отклонил учётные данные', publication: { upstream: 'origin/main', finalSha: sha, published: null } }), 'p', KEY)!;
  assert.deepEqual([refused.publication?.tone, refused.publication?.text], ['warn', 'Публикация не выполнена: push-auth: Удалённый репозиторий отклонил учётные данные']);
  assert.equal(runView(state({ phase: 'completed' }, { scopeId: 'next' }), 'p', KEY), null, 'a new plan replaces the old result');
});

test('M40: a run that ended with its scope shows no card; a run the service stopped names the reason', () => {
  assert.equal(runView(state({ phase: 'finished', pausedFrom: 'starting', reason: 'closed-manually' }), 'p', KEY), null, 'closed by hand: no card');
  assert.equal(runView(state({ phase: 'finished', reason: 'closed-manually' }, { scopeId: 'auto' }), 'p', KEY), null);
  // Stopped in the preparation: no scope yet, the card names the reason and has no buttons.
  const next = 'Полный автопилот этот план не запускает. Продолжайте вручную.';
  const missing = runView(state({ mode: 'full', phase: 'stopped', pausedFrom: 'preparing', scopeId: null, reason: 'automation-missing', nextAction: next }), 'p', KEY)!;
  assert.deepEqual([missing.phaseLabel, missing.detail, missing.nextAction, missing.tone, missing.buttons], ['Автопилот остановлен', STOP_REASONS['automation-missing'], next, 'warn', []]);
  assert.match(missing.detail!, /нет блока automation/u);
  assert.equal(missing.publication, null);
  // The user went on by hand (a plan is chosen): the card is gone.
  assert.equal(runView(state({ phase: 'stopped', scopeId: null, reason: 'automation-missing' }, { scopeId: 'auto' }), 'p', KEY), null);
  // Stopped at the start of the chosen plan: shown while that plan is open, gone after its close.
  const started = { phase: 'stopped', pausedFrom: 'starting', scopeId: 'auto', reason: 'authorization-missing' };
  assert.equal(runView(state(started, { scopeId: 'auto' }), 'p', KEY)?.detail, STOP_REASONS['authorization-missing']);
  assert.equal(runView(state(started), 'p', KEY), null);
  assert.equal(runView(state({ phase: 'stopped', scopeId: 'auto', reason: 'user-stop' }, { scopeId: 'auto' }), 'p', KEY), null, 'the user stopped it: no card');
});

test('an unstarted plan carries the mode of the settings for its policy line; started — none', () => {
  const ready = { scopeId: 'auto', phase: 'ready', ownerSession: null, actions: ['start'], tasks: [], progress: { done: 0, total: 2 } };
  assert.equal(planView(state({}, ready), 'p', KEY)?.autopilotingMode, 'after-start');
  assert.equal(planView(state({}, { ...ready, phase: 'running', actions: ['pause'] }), 'p', KEY)?.autopilotingMode, null);
});

test('the sidebar shows the run card and the panel loads its stylesheet', async () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sidebar = await readFile(path.join(dir, '..', 'src', 'sidebar-view.js'), 'utf8');
  assert.match(sidebar, /\['run', data\.run\]/u);
  const card = await readFile(path.join(dir, '..', 'src', 'run-card.js'), 'utf8');
  assert.match(card, /autopiloting\/\$\{action\}`, \{ runId: run\.runId, expectedRevision: run\.revision \}/u);
  assert.match(card, /autopiloting\/policy/u);
  const html = await readFile(path.join(dir, '..', '..', 'panel-shell', 'src', 'index.html'), 'utf8');
  assert.match(html, /session-view\/run-card\.css/u);
});

test('M41: a run that waits for the user\'s acceptance names why; the early notice is a warning only', () => {
  const reason = 'Нет закоммиченных доказательств приёмки: docs/evidence/r.md';
  const next = 'Автоприёмка не смогла доказать результат: … Проверьте результат и нажмите «Принять план» — запуск сам закроет план и опубликует.';
  const waits = runView(state({ phase: 'accepting', manualAcceptance: { reason, since: 'x' }, nextAction: next }), 'p', KEY)!;
  assert.deepEqual([waits.phaseLabel, waits.tone, waits.detail, waits.nextAction], [USER_ACCEPTANCE_LABEL, 'waiting', reason, next]);
  assert.equal(USER_ACCEPTANCE_LABEL, 'Ждёт вашей приёмки');
  assert.deepEqual(waits.buttons.map((b) => b.action), ['pause', 'stop'], 'never «Продолжить»: the plan card accepts');
  const automatic = runView(state({ phase: 'accepting', manualAcceptance: null }), 'p', KEY)!;
  assert.deepEqual([automatic.phaseLabel, automatic.tone, automatic.detail], [PHASE_LABELS['accepting'], 'working', null]);
  const notice = 'Автоприёмка не сможет доказать: installed-service (критерий 3) — в конце понадобится ваша приёмка.';
  const warned = runView(state({ phase: 'executing', notice }), 'p', KEY)!;
  assert.deepEqual([warned.phaseLabel, warned.tone, warned.notice], [PHASE_LABELS['executing'], 'working', notice]);
  assert.equal(runView(state({ phase: 'executing' }), 'p', KEY)!.notice, null);
  assert.equal(runView(state({ phase: 'completed', notice }), 'p', KEY)!.notice, null, 'no warning after the publication');
});

test('M44: a working run without the Kit grant says so and offers «Повторить»; an older service changes nothing', () => {
  assert.equal(NO_GRANT_LABEL, 'Автопилот не получил разрешения Kit');
  for (const phase of ['executing', 'delivering']) {
    const run = runView(state({ phase, authorized: false }), 'p', KEY)!;
    assert.deepEqual([run.phaseLabel, run.tone, run.detail], [NO_GRANT_LABEL, 'warn', NO_GRANT_DETAIL], phase);
    assert.deepEqual(run.buttons.map((b) => [b.action, b.label, b.primary]), [['retry', 'Повторить', true], ['pause', 'Пауза', false], ['stop', 'Остановить автопилот', false]], phase);
  }
  const reason = 'AUTOPILOT_MANUAL_REQUIRED: Acceptance criteria 5 need a manual check.';
  assert.equal(runView(state({ authorized: false, reason }), 'p', KEY)!.detail, reason, 'the Kit reason when there is one');
  const granted = runView(state({ authorized: true }), 'p', KEY)!;
  assert.deepEqual([granted.phaseLabel, granted.buttons.map((b) => b.action)], [PHASE_LABELS['executing'], ['pause', 'stop']]);
  const older = runView(state({}), 'p', KEY)!;
  assert.equal(older.phaseLabel, PHASE_LABELS['executing'], 'no field: no claim either way');
  const preparing = runView(state({ phase: 'starting', authorized: false }), 'p', KEY)!;
  assert.equal(preparing.phaseLabel, PHASE_LABELS['starting'], 'before the start no grant is expected');
});
