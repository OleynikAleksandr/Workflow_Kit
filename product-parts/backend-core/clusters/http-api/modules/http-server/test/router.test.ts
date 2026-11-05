import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRouter, createStateRegistry } from '../src/index.ts';

test('routes match by method and :params', () => {
  const router = createRouter();
  const handler = (): string => 'ok';
  router.get('/api/projects/:id', handler);
  router.delete('/api/projects/:id', handler);
  const found = router.match('GET', '/api/projects/abc');
  assert.equal(found.kind, 'found');
  if (found.kind === 'found') assert.deepEqual(found.params, { id: 'abc' });
  assert.equal(router.match('HEAD', '/api/projects/abc').kind, 'found');
  const wrong = router.match('POST', '/api/projects/abc');
  assert.deepEqual(wrong, { kind: 'method-not-allowed', allow: ['GET', 'DELETE'] });
  assert.deepEqual(router.match('GET', '/api/projects'), { kind: 'not-found' });
  assert.deepEqual(router.list(), ['GET /api/projects/:id', 'DELETE /api/projects/:id']);
});

test('duplicate routes and relative patterns are rejected', () => {
  const router = createRouter();
  router.get('/api/x', () => 1);
  assert.throws(() => router.get('/api/x', () => 2), /already registered/);
  assert.throws(() => router.get('api/y', () => 2), /must start/);
});

test('state registry collects sections and isolates failures', async () => {
  const state = createStateRegistry();
  state.add('system', () => ({ version: '1' }));
  state.add('slow', async () => 42);
  state.add('broken', () => {
    throw new Error('boom');
  });
  assert.throws(() => state.add('system', () => null), /already registered/);
  assert.deepEqual(state.names(), ['system', 'slow', 'broken']);
  assert.deepEqual(await state.collect(), { system: { version: '1' }, slow: 42, broken: { error: 'boom' } });
});
