import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { createEventLog, createKeyedMutex, createOperations } from '#data-store';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import type { Router } from '#http-server';
import { createProjectRegistry } from '#project-registry';
import type { Project } from '#project-registry';
import {
  CHAT_PAGE_LIMIT,
  CHAT_SYNC_GAPS_MAX,
  CHAT_SYNC_PARTIAL_REASON,
  CHAT_SYNC_RETRY_MAX_MS,
  CHAT_TEXT_CUT_NOTE,
  CHAT_TEXT_MAX_CHARS,
  ProviderError,
  createProviderRegistry,
  chatSyncOut,
  cutChatText,
  registerProviderRoutes,
} from '../src/index.ts';
import type { ChatMessage, ChatPage } from '../src/index.ts';
import { createFakeProvider } from './fake-provider.ts';
import type { FakeProvider } from './fake-provider.ts';

let tmp = '';
let router: Router;
let fake: FakeProvider;
let bare: FakeProvider;
let alpha: Project;

before(async () => {
  tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-chat-')));
  const events = createEventLog({ file: path.join(tmp, 'data', 'events.jsonl') });
  const mutex = createKeyedMutex();
  router = createRouter();
  const projects = createProjectRegistry({ file: path.join(tmp, 'data', 'projects.json'), projectsRoot: '~/P', homedir: tmp, platform: process.platform, events, mutex });
  const registry = createProviderRegistry({ readTimeoutMs: 100 });
  fake = createFakeProvider('fake');
  bare = createFakeProvider('bare', { withOptional: false });
  registry.register(fake);
  registry.register(bare);
  registerProviderRoutes({ router, state: createStateRegistry(), registry, projects, operations: createOperations(), mutex, events, platform: process.platform });
  alpha = await projects.create('Alpha');
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  for (const provider of [fake, bare]) {
    provider.calls.length = 0;
    provider.sessions = [{ provider: provider.id, localId: 's1', remoteId: 'r-1', title: 'S', createdAt: '2026-11-12T09:00:00.000Z', origin: 'panel', state: 'running', links: {}, cwd: alpha.path }];
    provider.chat = { messages: [], truncated: false };
    provider.chatError = null;
  }
});

async function get(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const match = router.match('GET', url);
  if (match.kind !== 'found') return { status: 404, body: {} };
  try {
    const value = await match.handler({ method: 'GET', path: url, query: new URLSearchParams(), params: match.params, body: undefined, req: {} as IncomingMessage, res: {} as ServerResponse });
    return { status: 200, body: value as Record<string, unknown> };
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, body: { error: { ...error.details, code: error.code, message: error.message } } };
    throw error;
  }
}

const url = (provider: string, sid: string, project = alpha.id): string => `/api/projects/${project}/providers/${provider}/sessions/${sid}/messages`;
const message = (id: string, text: string, role: ChatMessage['role'] = 'user'): ChatMessage => ({ id, role, text, at: '2026-11-12T10:00:00.000Z' });

test('a provider without readMessages answers supported false', async () => {
  const answer = await get(url('bare', 's1'));
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { supported: false, messages: [], truncated: false });
});

test('the page of the provider comes back with only the contract fields', async () => {
  fake.chat = { messages: [{ ...message('m1', 'привет'), extra: 1 } as ChatMessage, { id: 'm2', role: 'assistant', text: 'ответ', at: null }], truncated: true };
  const answer = await get(url('fake', 's1'));
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { supported: true, messages: [message('m1', 'привет'), { id: 'm2', role: 'assistant', text: 'ответ', at: null }], truncated: true });
  assert.deepEqual(fake.calls, [`readMessages:s1:${CHAT_PAGE_LIMIT}`]);
});

test('an empty session is an empty page', async () => {
  const answer = await get(url('fake', 's1'));
  assert.deepEqual(answer.body, { supported: true, messages: [], truncated: false });
});

test('the remote id finds the session and the provider gets its local id', async () => {
  const answer = await get(url('fake', 'r-1'));
  assert.equal(answer.status, 200);
  assert.deepEqual(fake.calls, [`readMessages:s1:${CHAT_PAGE_LIMIT}`]);
});

test('texts longer than CHAT_TEXT_MAX_CHARS are cut with the mark', async () => {
  const long = 'а'.repeat(CHAT_TEXT_MAX_CHARS + 5);
  const exact = 'б'.repeat(CHAT_TEXT_MAX_CHARS);
  fake.chat = { messages: [message('m1', long), message('m2', exact)], truncated: false };
  const answer = await get(url('fake', 's1'));
  const messages = answer.body['messages'] as ChatMessage[];
  assert.equal(messages[0]!.text, 'а'.repeat(CHAT_TEXT_MAX_CHARS) + CHAT_TEXT_CUT_NOTE);
  assert.ok(messages[0]!.text.endsWith('(обрезано, полный текст — в чате провайдера)'));
  assert.equal(messages[1]!.text, exact);
});

test('a cut never splits a surrogate pair', () => {
  const text = 'x'.repeat(9) + '😀' + 'y';
  assert.equal(cutChatText(text, 10), 'x'.repeat(9) + CHAT_TEXT_CUT_NOTE);
  assert.equal(cutChatText('short', 10), 'short');
});

test('more messages than the limit keep the newest ones and mark truncated', async () => {
  const many = Array.from({ length: CHAT_PAGE_LIMIT + 3 }, (_, i) => message(`m${i}`, `t${i}`));
  fake.chat = { messages: many, truncated: false };
  const answer = await get(url('fake', 's1'));
  const messages = answer.body['messages'] as ChatMessage[];
  assert.equal(messages.length, CHAT_PAGE_LIMIT);
  assert.equal(messages[0]!.id, 'm3');
  assert.equal(answer.body['truncated'], true);
});

test('a session of another provider or project is 404 unknown-session', async () => {
  const answer = await get(url('fake', 'other'));
  assert.equal(answer.status, 404);
  assert.deepEqual(answer.body['error'], { code: 'unknown-session', message: 'Сессия не найдена' });
  assert.deepEqual(fake.calls, []);
});

test('a ProviderError of reading is 502 with its code and text', async () => {
  fake.chatError = new ProviderError('chat-unavailable', 'Codex не отдал переписку: нет демона', { hint: 'запустите демон' });
  const answer = await get(url('fake', 's1'));
  assert.equal(answer.status, 502);
  assert.deepEqual(answer.body['error'], { code: 'chat-unavailable', message: 'Codex не отдал переписку: нет демона', hint: 'запустите демон' });
});

test('an unknown provider or project is 404, an invalid session id 400', async () => {
  assert.equal((await get(url('nope', 's1'))).status, 404);
  assert.deepEqual(((await get(url('nope', 's1'))).body['error'] as { code: string }).code, 'unknown-provider');
  assert.deepEqual(((await get(url('fake', 's1', 'missing'))).body['error'] as { code: string }).code, 'not-found');
  assert.deepEqual(((await get(url('fake', 'bad%20id'))).body['error'] as { code: string }).code, 'invalid-session');
});

test('the fake provider has sendDirect', async () => {
  assert.equal(await fake.sendDirect!(alpha, 's1', 'текст'), true);
  assert.deepEqual(fake.direct, ['s1:текст']);
  assert.equal(bare.sendDirect, undefined);
});

test('cutChatText is idempotent: 19 999 letters, an emoji on the boundary and a tail', () => {
  const text = 'я'.repeat(CHAT_TEXT_MAX_CHARS - 1) + '😀' + 'хвост';
  const once = cutChatText(text);
  assert.equal(once, 'я'.repeat(CHAT_TEXT_MAX_CHARS - 1) + CHAT_TEXT_CUT_NOTE);
  assert.equal(cutChatText(once), once);
  assert.equal(cutChatText(cutChatText(once)), once);
  assert.equal(once.split(CHAT_TEXT_CUT_NOTE).length, 2);
  // No lone surrogate is left at the cut.
  assert.equal(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(once), false);
  // The emoji fits whole when the boundary allows it.
  const fits = 'я'.repeat(CHAT_TEXT_MAX_CHARS - 2) + '😀' + 'хвост';
  assert.equal(cutChatText(fits), 'я'.repeat(CHAT_TEXT_MAX_CHARS - 2) + '😀' + CHAT_TEXT_CUT_NOTE);
  assert.equal(cutChatText(cutChatText(fits)), cutChatText(fits));
});

test('a provider may cut before caching: the route does not mark the text twice', async () => {
  const cached = cutChatText('ж'.repeat(CHAT_TEXT_MAX_CHARS + 50));
  fake.chat = { messages: [message('m1', cached)], truncated: false };
  const messages = (await get(url('fake', 's1'))).body['messages'] as ChatMessage[];
  assert.equal(messages[0]!.text, cached);
});

test('sync passes with only the contract fields; an answer without sync keeps the M18 shape', async () => {
  fake.chat = {
    messages: [message('m1', 'привет')],
    truncated: false,
    sync: { state: 'partial', reason: 'Часть диалога Codex недоступна', gaps: [{ turnId: 't1', reason: 'codex-history-item-too-large', itemId: 'i1', extra: 'x' } as never, { turnId: 't2', reason: 'диапазон', beforeItemId: 'a', afterItemId: 'b' }], gapCount: 5, secret: '/Users/x' } as never,
  };
  const answer = await get(url('fake', 's1'));
  assert.deepEqual(answer.body['sync'], {
    state: 'partial',
    reason: 'Часть диалога Codex недоступна',
    gaps: [{ turnId: 't1', reason: 'codex-history-item-too-large', itemId: 'i1' }, { turnId: 't2', reason: 'диапазон', beforeItemId: 'a', afterItemId: 'b' }],
    gapCount: 5,
  });
  fake.chat = { messages: [], truncated: false };
  assert.equal('sync' in (await get(url('fake', 's1'))).body, false);
});

test('sync normalization: unknown state, gaps bound, gapCount, retryAfterMs, partial reason, text safety', () => {
  assert.equal(chatSyncOut({ state: 'fresh' }), undefined);
  assert.equal(chatSyncOut('ready'), undefined);
  assert.deepEqual(chatSyncOut({ state: 'loading' }), { state: 'loading' });
  const gaps = Array.from({ length: CHAT_SYNC_GAPS_MAX + 6 }, (_, i) => ({ turnId: `t${i}`, reason: 'r' }));
  const many = chatSyncOut({ state: 'partial', reason: 'x', gaps: [...gaps, { turnId: '', reason: 'r' }, { turnId: 't', reason: 7 }] })!;
  assert.equal(many.gaps!.length, CHAT_SYNC_GAPS_MAX);
  assert.equal(many.gaps![0]!.turnId, 't6');
  assert.equal(many.gapCount, CHAT_SYNC_GAPS_MAX + 6);
  assert.deepEqual(chatSyncOut({ state: 'ready', gaps: [{ turnId: 't', reason: 'r' }] }), { state: 'partial', reason: CHAT_SYNC_PARTIAL_REASON, gaps: [{ turnId: 't', reason: 'r' }], gapCount: 1 });
  assert.deepEqual(chatSyncOut({ state: 'partial' }), { state: 'partial', reason: CHAT_SYNC_PARTIAL_REASON });
  assert.equal(chatSyncOut({ state: 'reconnecting', retryAfterMs: 999_999 })!.retryAfterMs, CHAT_SYNC_RETRY_MAX_MS);
  assert.equal(chatSyncOut({ state: 'reconnecting', retryAfterMs: 1234.6 })!.retryAfterMs, 1235);
  assert.equal('retryAfterMs' in chatSyncOut({ state: 'reconnecting', retryAfterMs: -1 })!, false);
  assert.equal('retryAfterMs' in chatSyncOut({ state: 'reconnecting', retryAfterMs: Number.NaN })!, false);
  const reason = chatSyncOut({ state: 'unavailable', reason: 'строка\nвторая\u0007' + 'ё'.repeat(400) })!.reason!;
  assert.equal(reason.includes('\n'), false);
  assert.equal(reason.includes('\u0007'), false);
  assert.ok(reason.length <= 301 && reason.endsWith('…'));
  assert.equal(chatSyncOut({ state: 'partial', gaps: [{ turnId: 'x'.repeat(201), reason: 'r' }] })!.gaps, undefined);
});

test('codex-reconnecting and codex-unavailable are 503 with normalized sync and retryAfterMs; other codes stay 502', async () => {
  fake.chatError = new ProviderError('codex-reconnecting', 'Восстанавливаем подключение к Codex…', { details: { sync: { state: 'reconnecting', retryAfterMs: 2500, junk: 1 }, retryAfterMs: 2500 } });
  let answer = await get(url('fake', 's1'));
  assert.equal(answer.status, 503);
  assert.deepEqual(answer.body['error'], { code: 'codex-reconnecting', message: 'Восстанавливаем подключение к Codex…', sync: { state: 'reconnecting', retryAfterMs: 2500 }, retryAfterMs: 2500 });

  fake.chatError = new ProviderError('codex-unavailable', 'Нет подключения к Codex. Проверьте демон в настройках провайдера', { details: { sync: { state: 'unavailable', retryAfterMs: 50_000 }, retryAfterMs: 50_000 } });
  answer = await get(url('fake', 's1'));
  assert.equal(answer.status, 503);
  assert.deepEqual(answer.body['error'], { code: 'codex-unavailable', message: 'Нет подключения к Codex. Проверьте демон в настройках провайдера', sync: { state: 'unavailable', retryAfterMs: CHAT_SYNC_RETRY_MAX_MS }, retryAfterMs: CHAT_SYNC_RETRY_MAX_MS });

  fake.chatError = new ProviderError('codex-history-unsupported', 'Codex не поддерживает чтение истории', { details: { sync: { state: 'unavailable', reason: 'совместимость' } } });
  answer = await get(url('fake', 's1'));
  assert.equal(answer.status, 502);
  assert.deepEqual(answer.body['error'], { code: 'codex-history-unsupported', message: 'Codex не поддерживает чтение истории', sync: { state: 'unavailable', reason: 'совместимость' } });

  fake.chatError = new ProviderError('chat-unavailable', 'нет', { details: { sync: { state: 'bogus' }, retryAfterMs: 'soon', files: 1 } });
  answer = await get(url('fake', 's1'));
  assert.equal(answer.status, 502);
  assert.deepEqual(answer.body['error'], { code: 'chat-unavailable', message: 'нет', files: 1 });
});

test('ChatPage stays assignable without sync (Claude and Kimi pages)', () => {
  const page: ChatPage = { messages: [], truncated: false };
  assert.equal(page.sync, undefined);
});
