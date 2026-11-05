import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '#data-store';
import {
  buttonView,
  capabilityGate,
  chooseProject,
  detailRows,
  hookRows,
  isTouchDevice,
  operationKey,
  operationState,
  pickSessionLink,
  previewExpired,
  readErrors,
  safeLink,
  shortHash,
  statusTone,
  trustView,
  unavailableCapabilities,
} from '../src/model.js';

function op(partial: Partial<Operation> & Pick<Operation, 'id' | 'kind' | 'status'>): Operation {
  return {
    key: partial.id,
    title: partial.kind,
    scope: {},
    progress: null,
    startedAt: '2026-11-05T10:00:00.000Z',
    finishedAt: partial.status === 'running' ? null : '2026-11-05T10:00:05.000Z',
    ...partial,
  };
}

const links = {
  desktop: 'claude://claude.ai/code/session_1',
  mobile: 'https://claude.ai/code/session_1?m=1',
  web: 'https://claude.ai/code/session_1',
};

test('the session link is chosen by device: mobile on touch, desktop otherwise, web as fallback', () => {
  assert.equal(isTouchDevice(5), true);
  assert.equal(isTouchDevice(1), false);
  assert.equal(isTouchDevice(0), false);
  assert.equal(isTouchDevice(undefined), false);
  assert.deepEqual(pickSessionLink(links, 5), { kind: 'mobile', href: links.mobile, web: true });
  assert.deepEqual(pickSessionLink(links, 0), { kind: 'desktop', href: links.desktop, web: false });
  // iPad Safari reports a Mac user agent; maxTouchPoints > 1 is what counts.
  assert.equal(pickSessionLink(links, 1)?.kind, 'desktop');
  assert.deepEqual(pickSessionLink({ web: links.web }, 5), { kind: 'web', href: links.web, web: true });
  assert.deepEqual(pickSessionLink({ web: links.web }, 0), { kind: 'web', href: links.web, web: true });
  assert.equal(pickSessionLink({ desktop: links.desktop }, 5), null);
  assert.equal(pickSessionLink({ mobile: links.mobile }, 0), null);
  assert.equal(pickSessionLink({}, 0), null);
  assert.equal(pickSessionLink(undefined, 0), null);
});

test('unsafe or malformed links are never chosen', () => {
  assert.equal(safeLink('javascript:alert(1)'), null);
  assert.equal(safeLink(' JavaScript:alert(1)'), null);
  assert.equal(safeLink('data:text/html,x'), null);
  assert.equal(safeLink('file:///etc/passwd'), null);
  assert.equal(safeLink('/relative/path'), null);
  assert.equal(safeLink(''), null);
  assert.equal(safeLink(42), null);
  assert.deepEqual(safeLink('claude://claude.ai/code/session_1'), { href: 'claude://claude.ai/code/session_1', web: false });
  assert.equal(pickSessionLink({ desktop: 'javascript:alert(1)', web: links.web }, 0)?.kind, 'web');
});

test('capability gates: unavailable with reason, missing optional capabilities are hidden', () => {
  const caps = { trust: { available: false, reason: 'не реализовано (задача T006)' }, hooks: { available: true }, stopSession: { available: false } };
  assert.deepEqual(capabilityGate(caps, 'trust'), { shown: true, enabled: false, reason: 'не реализовано (задача T006)' });
  assert.deepEqual(capabilityGate(caps, 'hooks'), { shown: true, enabled: true, reason: null });
  assert.deepEqual(capabilityGate(caps, 'createSession'), { shown: true, enabled: true, reason: null });
  assert.deepEqual(capabilityGate(caps, 'resumeSession', true), { shown: false, enabled: false, reason: null });
  assert.deepEqual(capabilityGate(caps, 'stopSession', true), { shown: true, enabled: false, reason: 'недоступно' });
  assert.deepEqual(unavailableCapabilities(caps), [
    { name: 'trust', label: 'доверие к папке', reason: 'не реализовано (задача T006)' },
    { name: 'stopSession', label: 'остановка сессии', reason: 'недоступно' },
  ]);
  assert.deepEqual(unavailableCapabilities({ custom: { available: false, reason: 'нет expect' } }), [{ name: 'custom', label: 'custom', reason: 'нет expect' }]);
});

test('a running operation locks its button and shows progress; the latest failure shows its hint', () => {
  const match = { kind: 'provider.trust', provider: 'claude', project: 'p1' };
  const running = op({ id: 'op-1', kind: 'provider.trust', status: 'running', scope: { provider: 'claude', project: 'p1' }, progress: 'ожидание очереди' });
  const other = op({ id: 'op-2', kind: 'provider.trust', status: 'running', scope: { provider: 'codex', project: 'p1' } });
  const view = buttonView({ operations: [other, running], match });
  assert.equal(view.disabled, true);
  assert.equal(view.busy, true);
  assert.equal(view.progress, 'ожидание очереди');
  assert.equal(buttonView({ operations: [other], match }).disabled, false);

  const failed = op({
    id: 'op-3',
    kind: 'provider.trust',
    status: 'failed',
    scope: { provider: 'claude', project: 'p1' },
    error: { code: 'trust-failed', message: 'Диалог не прошёл', hint: 'Откройте claude в папке вручную' },
  });
  const failedView = buttonView({ operations: [failed], match });
  assert.equal(failedView.disabled, false);
  assert.deepEqual(failedView.error, { code: 'trust-failed', message: 'Диалог не прошёл', hint: 'Откройте claude в папке вручную' });
  assert.equal(failedView.failedId, 'op-3');
  assert.equal(buttonView({ operations: [failed], match, dismissed: ['op-3'] }).error, null);
  const later = op({ id: 'op-4', kind: 'provider.trust', status: 'succeeded', scope: { provider: 'claude', project: 'p1' }, finishedAt: '2026-11-05T10:01:00.000Z' });
  assert.equal(operationState([failed, later], match).failed, null);
  assert.equal(operationState([failed, running], match).failed, null, 'a running retry hides the old failure');
});

test('operations are matched by kind, provider, project and extra scope; sending requests lock too', () => {
  const stop = op({ id: 'op-1', kind: 'provider.session.stop', status: 'running', scope: { provider: 'claude', project: 'p1', session: 's1' } });
  const match = { kind: 'provider.session.stop', provider: 'claude', project: 'p1', scope: { session: 's1' } };
  assert.equal(operationState([stop], match).running, stop);
  assert.equal(operationState([stop], { ...match, scope: { session: 's2' } }).running, null);
  const refresh = op({ id: 'op-2', kind: 'providers.refresh', status: 'running' });
  assert.equal(operationState([refresh], { kind: 'providers.refresh' }).running, refresh);
  const action = { kind: 'provider.action', provider: 'codex', project: null, scope: { action: 'daemon-start' } };
  assert.equal(operationKey(action), 'provider.action|codex|-|action=daemon-start');
  const sending = buttonView({ operations: [], match: action, sending: [operationKey(action)] });
  assert.deepEqual([sending.disabled, sending.busy, sending.progress], [true, true, 'отправка…']);
  const gated = buttonView({ operations: [], match: action, gate: { shown: true, enabled: false, reason: 'демон не установлен' } });
  assert.deepEqual([gated.disabled, gated.busy, gated.reason], [true, false, 'демон не установлен']);
});

test('hook rows: Kit hook first with command and hash, approvable only when not approved', () => {
  const kit = { command: 'wfk hook session-start --client codex', hash: 'sha256:0123456789abcdef0123', kit: true, status: 'pending' as const, key: '/p/.codex/hooks.json:session_start:0:0' };
  const foreign = { command: 'echo hi', hash: 'abc', kit: false, status: 'unknown' as const };
  const rows = hookRows({ kitHook: kit, hooks: [foreign, kit], complete: false });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.kit, r.command, r.hash, r.shortHash, r.label, r.approvable]),
    [
      [true, kit.command, kit.hash, '0123456789ab…', 'ждёт одобрения', true],
      [false, 'echo hi', 'abc', 'abc', 'неизвестно', false],
    ],
  );
  assert.equal(hookRows({ kitHook: { ...kit, status: 'approved' }, hooks: [], complete: true })[0]?.approvable, false);
  assert.deepEqual(hookRows(null), []);
  assert.equal(shortHash('short'), 'short');
});

test('trust, status, details, read errors and preview expiry', () => {
  assert.deepEqual(trustView({ trusted: true, backup: '/b/claude.json' }), { label: 'доверено', tone: 'ok', note: null, backup: '/b/claude.json' });
  assert.equal(trustView({ trusted: false }).label, 'нет доверия');
  assert.equal(trustView({ trusted: null, note: 'не реализовано' }).note, 'не реализовано');
  assert.equal(trustView(null).label, 'неизвестно');
  assert.equal(statusTone('ready'), 'ok');
  assert.equal(statusTone('error'), 'error');
  assert.equal(statusTone('not-implemented'), 'muted');
  assert.equal(statusTone('something-new'), 'muted');
  assert.deepEqual(detailRows({ daemon: { running: true, pid: 42 }, login: false, models: ['a', 'b'], extra: null }), [
    ['daemon.running', 'да'],
    ['daemon.pid', '42'],
    ['login', 'нет'],
    ['models', 'a, b'],
    ['extra', '—'],
  ]);
  assert.deepEqual(readErrors({ sessions: { code: 'timeout', message: 'нет ответа', hint: 'Нажмите «Перепроверить»' } }), [
    { name: 'sessions', label: 'сессии', code: 'timeout', message: 'нет ответа', hint: 'Нажмите «Перепроверить»' },
  ]);
  const preview = { provider: 'claude', trusted: false, writes: [], autorun: [], token: 't', expiresAt: '2026-11-05T10:10:00.000Z' };
  assert.equal(previewExpired(preview, Date.parse('2026-11-05T10:09:59.000Z')), false);
  assert.equal(previewExpired(preview, Date.parse('2026-11-05T10:10:00.000Z')), true);
});

test('the shown project is the preferred one when listed, otherwise the first existing folder', () => {
  const projects = [
    { id: 'a', missing: true },
    { id: 'b', missing: false },
  ];
  assert.equal(chooseProject(projects, 'a'), 'a');
  assert.equal(chooseProject(projects, 'gone'), 'b');
  assert.equal(chooseProject(projects, null), 'b');
  assert.equal(chooseProject([{ id: 'x', missing: true }], null), 'x');
  assert.equal(chooseProject([], 'a'), null);
});
