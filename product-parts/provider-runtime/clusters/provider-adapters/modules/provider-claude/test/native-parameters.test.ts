import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createAgentChannel, nativeControlHookReply, parseHookInput } from '#agent-channel';
import type { Project } from '#provider-registry';
import type { ClaudeRuntime } from '../src/runtime.ts';
import { applyNativeParameter, nativeControlHook, nativeParameterState, readNativeJson, writeNativeJson } from '../src/native-parameters.ts';
import { PARAMETER_CANCEL, PARAMETER_REQUEST, PARAMETER_RESULT, PARAMETER_STATE } from '../src/pty/parameter-protocol.ts';
import type { NativeParameterState } from '../src/pty/parameter-protocol.ts';
import { sendDirect } from '../src/direct.ts';
import { TURN_SUFFIX } from '../src/pty/turn-file.ts';

for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: a hook during a pending transaction cancels it and still reaches the channel (M28)`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-nparam-')); const sid = randomUUID(); const hostId = randomUUID();
  const project = { id: 'p', path: root } as Project; const debug = path.join(root, 'native');
  const record = { localId: sid, remoteId: 'session_fixture', projectPath: root, projectId: 'p', debugFile: debug, controlHostId: hostId, processId: 'proc', archived: false };
  const rt = { store: { read: async () => ({ sessions: [record] }) }, isAlive: async () => true, context: { platform, log() {} }, options: { directWaitMs: 20 } } as unknown as ClaudeRuntime;
  let state: NativeParameterState = { version: 1, hostId, sessionId: sid, epoch: hostId + ':1', at: Date.now(), cliVersion: '2.1.324', status: 'idle', inputEmpty: true,
    reason: null, model: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }, effort: 'high', mode: 'auto', fast: false, ultracode: false, models: [], efforts: ['high'], fastReason: 'credits', pending: null };
  const ch = createAgentChannel({ resolveProject: async () => ({ id: 'p' }) });
  const input = parseHookInput('claude', { session_id: sid, cwd: root, prompt: '/effort high' }, undefined, undefined, true)!;
  const key = `claude:${sid}`;
  try {
    await writeNativeJson(debug + PARAMETER_STATE, state);
    assert.equal(await nativeControlHook(rt, { ...input, event: 'prompt' }), false, 'prefix alone grants no privilege');
    ch.enqueue(key, 'sentinel-before');
    const operation = applyNativeParameter(rt, project, sid, 'mode', 'default');
    let request: any;
    for (let i = 0; i < 100 && !request; i++) { request = await readNativeJson(debug + PARAMETER_REQUEST); if (!request) await new Promise(r => setTimeout(r, 2)); }
    assert.ok(request);
    state = { ...state, at: Date.now(), status: 'control', pending: { id: request.id, sessionId: sid, epoch: request.epoch, expires: request.expires, field: 'mode', command: null } };
    await writeNativeJson(debug + PARAMETER_STATE, state);
    ch.enqueue(key, 'sentinel-during');
    const before = ch.get(key);
    assert.equal(await nativeControlHook(rt, { ...input, event: 'prompt' }), false, 'a real hook is never swallowed');
    assert.equal((await readNativeJson(debug + PARAMETER_CANCEL)).hostId, hostId);
    assert.equal((await readNativeJson(debug + TURN_SUFFIX)).state, 'working');
    const quarantined = nativeControlHookReply('prompt'); quarantined.ack(); quarantined.nack();
    assert.equal(quarantined.answer?.decision, 'block'); assert.deepEqual(ch.get(key), before);
    assert.equal(await nativeControlHook(rt, { ...input, event: 'stop' }), false);
    assert.equal((await readNativeJson(debug + TURN_SUFFIX)).state, 'idle');
    assert.equal(await nativeControlHook(rt, { ...input, sessionId: randomUUID(), event: 'prompt' }), false);
    assert.equal(await nativeControlHook(rt, { ...input, panelProcess: false, event: 'prompt' }), false);
    assert.deepEqual(ch.queued(key).map(m => m.text), ['sentinel-before', 'sentinel-during']);
    assert.equal(await sendDirect(rt, project, sid, 'ordinary direct text'), false, 'bounded admission returns to the queue during control');
    state = { ...state, at: Date.now(), epoch: hostId + ':2', status: 'idle', mode: 'default', pending: null };
    await writeNativeJson(debug + PARAMETER_STATE, state);
    await writeNativeJson(debug + PARAMETER_RESULT, { version: 1, id: request.id, hostId, sessionId: sid, status: 'applied', state });
    assert.equal((await operation).mode, 'default');
    assert.equal((await nativeParameterState(rt, project, sid))?.mode, 'default');
    assert.equal(await nativeControlHook(rt, { ...input, event: 'prompt' }), false);
    const reply = await ch.prompt(input); assert.match(JSON.stringify(reply.answer), /sentinel-before/); assert.match(JSON.stringify(reply.answer), /sentinel-during/); reply.ack();
    assert.equal(ch.queued(key).length, 0); const next = await ch.prompt(input); assert.equal(next.answer, null);
    state.at = 0; await writeNativeJson(debug + PARAMETER_STATE, state); assert.equal(await nativeParameterState(rt, project, sid), null);
    await assert.rejects(applyNativeParameter(rt, project, sid, 'mode', 'auto'), { status: 409 });
  } finally { ch.close(); await rm(root, { recursive: true, force: true }); }
});
