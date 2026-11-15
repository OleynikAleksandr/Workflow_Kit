// wfk hook question (spec M33 section 2.3): one waiterId for all requests, asks again on wait, prints
// a decision, exits silently on release, a refusal or no service, retries a break for the recovery
// time only after the service answered, and never asks for another tool or on PreToolUse (live check
// T008). darwin, linux and win32.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { runHook } from '../src/hook.ts';
import type { RequestJson } from '../src/hook-service.ts';
import { QUESTION_RECOVERY_MS, QUESTION_REQUEST_MS, runQuestionHook } from '../src/question-hook.ts';

let tmp = '';
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-question-hook-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const INPUT = { session_id: 's1', transcript_path: '/t/s1.jsonl', cwd: '/p', hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Q?' }] } };
const DECISION = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput: { questions: [{ question: 'Q?' }], answers: { 'Q?': 'A' } } } } };

type Step = { status: number; body: unknown } | Error;

function run(steps: Step[], options: { stdin?: string; platform?: NodeJS.Platform; clock?: { t: number } } = {}) {
  const out: string[] = [];
  const calls: Array<{ url: string; body: Record<string, unknown>; timeoutMs: number }> = [];
  const clock = options.clock ?? { t: 0 };
  const request: RequestJson = async (url, body, timeoutMs) => {
    calls.push({ url, body: body as Record<string, unknown>, timeoutMs });
    const step = steps.shift() ?? new Error('no more steps');
    if (step instanceof Error) throw step;
    return step;
  };
  const done = runQuestionHook('claude', {
    stdout: (text) => void out.push(text),
    stderr: () => undefined,
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '4999', CLAUDE_PROJECT_DIR: '/p', WFK_PANEL_SESSION: '1' },
    homedir: tmp,
    platform: options.platform ?? 'darwin',
    stdin: options.stdin ?? JSON.stringify(INPUT),
    request,
    now: () => clock.t,
    sleep: async (ms) => void (clock.t += ms),
    waiterId: '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b',
  });
  return { done, out, calls };
}

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`${platform}: wait, wait, decision — one waiterId, the decision is printed once`, async () => {
    const { done, out, calls } = run([{ status: 200, body: { wait: true } }, { status: 200, body: { wait: true } }, { status: 200, body: { decision: DECISION } }], { platform });
    await done;
    assert.deepEqual(out, [`${JSON.stringify(DECISION)}\n`]);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => c.url === 'http://127.0.0.1:4999/api/hooks/question' && c.timeoutMs === QUESTION_REQUEST_MS));
    assert.deepEqual(new Set(calls.map((c) => c.body['waiterId'])), new Set(['0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b']));
    assert.deepEqual(calls[0]!.body, { client: 'claude', input: INPUT, projectDir: '/p', panelProcess: true, waiterId: '0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b' });
  });
}

test('release, a refusal and no service: exit without output; no service is asked only once', async () => {
  for (const steps of [[{ status: 200, body: { release: true } }], [{ status: 400, body: { code: 'bad-hook-input' } }], [{ status: 200, body: null }], [new Error('ECONNREFUSED')]] as Step[][]) {
    const { done, out, calls } = run(steps);
    await done;
    assert.deepEqual(out, []);
    assert.equal(calls.length, 1);
  }
});

test('a break after the service answered is retried for the recovery time, then the hook exits silently', async () => {
  const back = run([{ status: 200, body: { wait: true } }, new Error('ECONNRESET'), new Error('ECONNREFUSED'), { status: 200, body: { decision: DECISION } }]);
  await back.done;
  assert.deepEqual(back.out, [`${JSON.stringify(DECISION)}\n`], 'the service came back');
  const steps: Step[] = [{ status: 200, body: { wait: true } }, ...Array.from({ length: 200 }, () => new Error('ECONNREFUSED'))];
  const clock = { t: 0 };
  const gone = run(steps, { clock });
  await gone.done;
  assert.deepEqual(gone.out, []);
  assert.ok(clock.t >= QUESTION_RECOVERY_MS && clock.t < QUESTION_RECOVERY_MS + 5000, 'gives up after the recovery time');
});

test('another tool, broken input, PreToolUse and an unknown client ask nothing', async () => {
  for (const stdin of [JSON.stringify({ ...INPUT, tool_name: 'Bash' }), 'not json', '[]', JSON.stringify({ ...INPUT, hook_event_name: 'PreToolUse', tool_use_id: 'toolu_1' })]) {
    const { done, calls } = run([{ status: 200, body: { decision: DECISION } }], { stdin });
    await done;
    assert.equal(calls.length, 0);
  }
  const out: string[] = [];
  let asked = 0;
  const code = await runHook(['question', '--client', 'stranger'], {
    stdout: (t) => void out.push(t), stderr: () => undefined, env: {}, cwd: tmp, clients: ['claude'],
    readStdin: async () => JSON.stringify(INPUT), request: async () => { asked += 1; return { status: 200, body: { decision: DECISION } }; },
  });
  assert.equal(code, 0);
  assert.equal(asked, 0);
  assert.deepEqual(out, []);
});

test('runHook question dispatches to the question hook and exits 0', async () => {
  const out: string[] = [];
  const code = await runHook(['question', '--client', 'claude'], {
    stdout: (t) => void out.push(t), stderr: () => undefined, env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '4999' }, homedir: tmp, cwd: tmp, clients: ['claude'],
    readStdin: async () => JSON.stringify(INPUT), request: async () => ({ status: 200, body: { decision: DECISION } }),
  });
  assert.equal(code, 0);
  assert.deepEqual(out, [`${JSON.stringify(DECISION)}\n`]);
});

test('the PreToolUse hook exits 0 at once without output on darwin, linux and win32', async () => {
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    const out: string[] = [];
    let asked = 0;
    const code = await runHook(['question', '--client', 'claude'], {
      stdout: (t) => void out.push(t), stderr: () => undefined, env: { WFK_PORT: '4999' }, cwd: tmp, clients: ['claude'], platform,
      readStdin: async () => JSON.stringify({ ...INPUT, hook_event_name: 'PreToolUse', tool_use_id: 'toolu_1' }),
      request: async () => { asked += 1; return { status: 200, body: { decision: DECISION } }; },
    });
    assert.equal(code, 0, platform);
    assert.equal(asked, 0, platform);
    assert.deepEqual(out, [], platform);
  }
});
