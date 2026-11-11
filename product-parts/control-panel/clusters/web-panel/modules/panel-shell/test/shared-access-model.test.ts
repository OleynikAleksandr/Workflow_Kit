// Model of the «Общий доступ к чатам» card (spec M12 section 2.2; Windows: M13 section 2.3).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REMOVE_CONFIRM,
  REMOVE_CONFIRM_WINDOWS,
  adminNote,
  operationNote,
  removeConfirm,
  sharedAccessOf,
  sharedAccessProviders,
  sharedButtons,
  sharedOperation,
  sharedSummary,
  sharedTone,
} from '../src/shared-access-model.js';

const shared = (state: string, over: Record<string, unknown> = {}) => ({
  state, label: state, reason: `причина ${state}`, hint: `что делать ${state}`, configured: false, connectionSeenAt: null, connected: null, alias: 'wfk-local', manualProfile: null, ...over,
});

function panelState(value: unknown, operations: unknown[] = []): Record<string, unknown> {
  return {
    providers: {
      providers: [
        { id: 'claude', label: 'Claude', status: { details: {} } },
        { id: 'codex', label: 'ChatGPT', status: { details: { sharedAccess: value } } },
      ],
    },
    operations: { operations },
  };
}

test('only a provider whose status has a shared access gets the card, also before the first check', () => {
  assert.deepEqual(sharedAccessProviders(panelState(null)), [{ id: 'codex', label: 'ChatGPT' }]);
  assert.equal(sharedAccessOf(panelState(null), 'codex'), null);
  assert.equal(sharedAccessOf(panelState(shared('active')), 'codex')?.state, 'active');
  assert.equal(sharedAccessOf(panelState(shared('active')), 'claude'), null);
});

test('buttons follow the state, the main one first; unsupported has none', () => {
  const ids = (value: ReturnType<typeof shared> | null) => sharedButtons(value as never).map((b) => b.id);
  assert.deepEqual(ids(null), ['recheck']);
  assert.deepEqual(ids(shared('unsupported')), []);
  assert.deepEqual(ids(shared('not-configured')), ['setup']);
  assert.deepEqual(ids(shared('needs-remote-login')), ['remote-login', 'recheck', 'remove']);
  assert.deepEqual(ids(shared('needs-connection')), ['connections', 'recheck', 'remove']);
  assert.deepEqual(ids(shared('active')), ['recheck', 'remove']);
  assert.deepEqual(ids(shared('broken')), ['setup', 'recheck', 'remove']);
  assert.equal(sharedButtons(shared('broken') as never)[0]?.label, 'Настроить ещё раз');
});

test('tone and summary: active says what works, the others say why and what to do', () => {
  assert.equal(sharedTone(shared('active') as never), 'ok');
  assert.equal(sharedTone(shared('broken') as never), 'warn');
  assert.equal(sharedTone(shared('unsupported') as never), 'muted');
  assert.match(sharedSummary(shared('active', { connected: true }) as never), /iPad.*подключено сейчас/);
  assert.match(sharedSummary(shared('active', { connected: false }) as never), /не подключено/);
  assert.equal(sharedSummary(shared('broken') as never), 'причина broken что делать broken');
  assert.equal(sharedSummary(null), 'Ещё не проверено.');
});

test('the newest setup operation of the provider is found and explained', () => {
  const ops = [
    { id: 'o1', kind: 'provider.shared-access.apply', scope: { provider: 'codex' }, status: 'failed', startedAt: '2026-11-11T10:00:00Z', error: { message: 'ssh-keygen: нет' } },
    { id: 'o2', kind: 'provider.shared-access.remove', scope: { provider: 'codex' }, status: 'running', startedAt: '2026-11-11T10:05:00Z' },
    { id: 'o3', kind: 'provider.trust', scope: { provider: 'codex' }, status: 'running', startedAt: '2026-11-11T10:09:00Z' },
  ];
  const op = sharedOperation(panelState(null, ops), 'codex');
  assert.deepEqual(op, { id: 'o2', kind: 'remove', status: 'running', error: null });
  assert.deepEqual(operationNote(op), { tone: 'muted', text: 'Удаление настройки выполняется…' });
  const failed = sharedOperation(panelState(null, ops.slice(0, 1)), 'codex');
  assert.deepEqual(operationNote(failed), { tone: 'error', text: 'Настройка не удалась: ssh-keygen: нет' });
  assert.equal(operationNote({ id: 'x', kind: 'apply', status: 'succeeded', error: null }), null);
  assert.equal(sharedOperation(panelState(null, ops), 'claude'), null);
});

test('Windows: the administrator step gets copy and show, the main one first; the rollback too', () => {
  const step = { purpose: 'setup', file: 'C:\\d\\shared-access-admin.ps1', command: 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\d\\shared-access-admin.ps1"', text: '# Workflow Kit' };
  const ids = (value: unknown) => sharedButtons(value as never).map((b) => b.id);
  const needs = shared('needs-admin-setup', { admin: step, configured: true });
  assert.deepEqual(ids(needs), ['copy-command', 'show-script', 'recheck', 'remove']);
  assert.equal(sharedButtons(needs as never)[0]?.primary, true);
  assert.equal(sharedTone(needs as never), 'warn');
  assert.match(adminNote(needs as never) ?? '', /от имени администратора/);
  assert.deepEqual(ids(shared('broken', { admin: step })), ['setup', 'copy-command', 'show-script', 'recheck', 'remove']);
  const undo = shared('not-configured', { admin: { ...step, purpose: 'rollback' } });
  assert.deepEqual(ids(undo), ['setup', 'copy-command', 'show-script']);
  assert.equal(sharedButtons(undo as never)[2]?.label, 'Показать скрипт отката');
  assert.match(adminNote(undo as never) ?? '', /откатить/);
  assert.equal(adminNote(shared('active') as never), null);
  assert.equal(removeConfirm(needs as never), REMOVE_CONFIRM_WINDOWS);
  assert.equal(removeConfirm(shared('active') as never), REMOVE_CONFIRM);
});
