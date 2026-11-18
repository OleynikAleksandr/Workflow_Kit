// M44 T002: the autopilot line of a new session — the text by Settings and the run, the answer in
// every client's dialect, the fallback without the service or without time, and the service URL
// of win32 and linux with the platform injected.
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { AUTOPILOT_UNKNOWN_LINE, asciiReason, autopilotLine } from '../src/autopilot-line.ts';
import { SESSION_START_RESERVE_MS, fallbackDialect, printSessionStartLine } from '../src/session-start-line.ts';

const RUN = { runId: 'run-1', phase: 'executing', reason: null, authorized: true };

test('the line names the mode, the review and the run state from the Kit grant', () => {
  assert.equal(autopilotLine({ mode: 'full', review: false, run: RUN }), 'Workflow Kit autopilot: mode=full, review=off; run=run-1 authorized (phase executing).');
  assert.equal(autopilotLine({ mode: 'off', review: true, run: null }), 'Workflow Kit autopilot: mode=off, review=on; run=none.');
  const manual = ' Without a live Kit grant every user decision stays manual: follow the next line of the Kit recovery packet.';
  assert.equal(autopilotLine({ mode: 'full', review: true, run: null }), `Workflow Kit autopilot: mode=full, review=on; run=none.${manual}`);
  assert.equal(autopilotLine({ mode: 'full', review: false, run: { ...RUN, authorized: false, reason: 'AUTOPILOT_MANUAL_REQUIRED: Acceptance criteria 5 need a manual check.' } }),
    `Workflow Kit autopilot: mode=full, review=off; run=run-1 NOT authorized (AUTOPILOT_MANUAL_REQUIRED: Acceptance criteria 5 need a manual check.).${manual}`);
  assert.equal(autopilotLine({ mode: 'full', review: false, run: { ...RUN, authorized: false } }), `Workflow Kit autopilot: mode=full, review=off; run=run-1 NOT authorized (phase executing without a Kit grant).${manual}`);
  assert.equal(autopilotLine({ mode: 'full', review: false, run: { ...RUN, phase: 'starting', authorized: false } }), `Workflow Kit autopilot: mode=full, review=off; run=run-1 NOT authorized yet (phase starting).${manual}`);
  assert.equal(autopilotLine({ mode: 'after-start', review: false, run: { ...RUN, phase: 'paused' } }), `Workflow Kit autopilot: mode=after-start, review=off; run=run-1 paused.${manual}`);
  assert.equal(autopilotLine({ mode: 'full', review: false, run: { ...RUN, phase: 'blocked', reason: 'authorization-missing: AUTOPILOT_PLAN_CHANGED: x' } }),
    `Workflow Kit autopilot: mode=full, review=off; run=run-1 blocked (authorization-missing: AUTOPILOT_PLAN_CHANGED: x).${manual}`);
  assert.equal(autopilotLine({ mode: 'full', review: false, run: { ...RUN, phase: 'completed' } }), `Workflow Kit autopilot: mode=full, review=off; run=none.${manual}`);
});

test('the reason stays ASCII: a Russian hint is cut, an empty rest names the panel, a long one is cut', () => {
  assert.equal(asciiReason('run-not-live: Запуск остановлен'), 'run-not-live');
  assert.equal(asciiReason('Ревью плана не согласовано'), 'see the Workflow Kit panel');
  assert.equal(asciiReason(null), 'see the Workflow Kit panel');
  assert.equal(asciiReason('x'.repeat(400)).length, 160);
  assert.ok(/^[\x20-\x7e]+$/u.test(autopilotLine({ mode: 'full', review: false, run: { ...RUN, phase: 'blocked', reason: 'Повторите ревью' } })));
});

/** Runs the printer with a fake service; returns the printed answer and the posted URL. */
async function print(client: string, options: { platform?: NodeJS.Platform; env?: Record<string, string>; reply?: unknown; fail?: boolean; now?: number } = {}) {
  let out = '';
  let url = '';
  let timeout = 0;
  await printSessionStartLine(client, {
    stdout: (text) => (out += text),
    stderr: () => undefined,
    env: options.env ?? { WFK_PORT: '4999' },
    homedir: path.join(path.sep, 'home', 'u'),
    platform: options.platform ?? 'darwin',
    stdin: JSON.stringify({ session_id: 's-1', cwd: '/p' }),
    now: () => options.now ?? 0,
    post: async (target, _body, ms) => {
      url = target;
      timeout = ms;
      if (options.fail) throw new Error('connect ECONNREFUSED');
      return options.reply ?? null;
    },
  }, 1500);
  return { answer: out === '' ? null : JSON.parse(out), url, timeout, lines: out.split('\n').filter(Boolean).length };
}

test('the service answer is printed as it is, in the client dialect the service chose', async () => {
  const claude = { continue: true, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'Workflow Kit autopilot: mode=off, review=off; run=none.' } };
  const got = await print('claude', { reply: { answer: claude } });
  assert.deepEqual([got.answer, got.url, got.timeout, got.lines], [claude, 'http://127.0.0.1:4999/api/hooks/session-start', 1500 - SESSION_START_RESERVE_MS, 1]);
  const kimi = { message: 'Workflow Kit autopilot: mode=off, review=off; run=none.' };
  assert.deepEqual((await print('kimi', { reply: { answer: kimi } })).answer, kimi);
});

test('no service, no answer or no time left: the unknown line in the client dialect', async () => {
  const context = { continue: true, hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: AUTOPILOT_UNKNOWN_LINE } };
  for (const client of ['claude', 'codex']) assert.deepEqual((await print(client, { fail: true })).answer, context, client);
  assert.deepEqual((await print('kimi', { fail: true })).answer, { message: AUTOPILOT_UNKNOWN_LINE });
  assert.deepEqual((await print('codex', { reply: {} })).answer, context);
  const late = await print('claude', { now: 1450 });
  assert.deepEqual([late.answer, late.url], [context, ''], 'no request without time');
  assert.deepEqual([fallbackDialect('kimi'), fallbackDialect('codex'), fallbackDialect('claude')], ['kimi', 'claude', 'claude']);
});

test('win32 and linux: the service URL comes from the config of the injected platform', async () => {
  for (const platform of ['win32', 'linux'] as const) {
    const got = await print('codex', { platform, env: { WFK_PORT: '4888', LOCALAPPDATA: path.join(path.sep, 'nowhere', 'Local'), XDG_CONFIG_HOME: path.join(path.sep, 'nowhere', 'config') }, fail: true });
    assert.equal(got.url, 'http://127.0.0.1:4888/api/hooks/session-start', platform);
    assert.equal(got.answer.hookSpecificOutput.additionalContext, AUTOPILOT_UNKNOWN_LINE, platform);
  }
});
