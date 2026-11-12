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
  CHAT_TEXT_CUT_NOTE,
  CHAT_TEXT_MAX_CHARS,
  ProviderError,
  createProviderRegistry,
  cutChatText,
  registerProviderRoutes,
} from '../src/index.ts';
import type { ChatMessage } from '../src/index.ts';
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
