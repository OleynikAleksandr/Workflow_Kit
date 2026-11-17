// M40 T005 (contract sections 3–5) with a scripted Kit: the decision service records a decision
// by a host operation bound to the request; a double press, a repeated command, a lost answer
// and a restart of the service give one decision; a message decision needs the user's delivered
// message of the current turn; a run decides only while it is live.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { TurnUserSource } from '#agent-channel';
import type { HostVerifier, KitOutcome, KitRunner } from '#kit-runner';
import type { KitDecision } from '#plan-view';
import { DECISION_NOTE_MAX, DECISION_TEXTS, WorkflowActionError, createDecisionJournal, createDecisions, createHostTickets, hostInputDigest, realRoot } from '../src/index.ts';
import type { DecisionAsk, Decisions } from '../src/index.ts';

let tmp = '';
let count = 0;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-decisions-'));
});
after(() => rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

const ok = <T>(result: T): KitOutcome<T> => ({ ok: true, result }) as KitOutcome<T>;
const refuse = <T>(code: string, details: unknown = null): KitOutcome<T> => ({ ok: false, code, message: code, nextAction: null, details }) as unknown as KitOutcome<T>;
const flagOf = (args: readonly string[], name: string): string | null => (args.includes(name) ? args[args.indexOf(name) + 1]! : null);

/** A Kit that registers requests for manual forms and applies a decision id at most once. */
function world(mode: 'agent' | 'host' = 'host') {
  const root = path.join(tmp, `p${(count += 1)}`);
  const kit = {
    revision: 7,
    /** Changes when the data a request covers changes (a new commit, another proposal). */
    subject: 'v1',
    owner: null as string | null,
    requests: new Map<string, KitDecision>(),
    history: [] as { decisionId: string; source: string; note: string; messageId: string | null; session: string | null; runId: string | null }[],
    manual: [] as string[][],
    hosted: [] as string[][],
    /** One-time behaviours of the next host call. */
    loseAnswer: false,
    staleRevision: 0,
    refuseTicket: null as string | null,
    /** Runs once right before Kit handles the next host call (a change that races the ticket). */
    beforeHost: null as (() => void) | null,
  };
  const live = { value: true };
  const source: { value: TurnUserSource | null } = { value: null };
  const runner = {
    installed: () => true,
    status: async () => ok({ decisionsMode: mode, decisions: [...kit.requests.values()].filter((r) => r.state === 'pending') }),
    run: async (_root: string, args: readonly string[]) => {
      if (args[0] === 'autopilot:status') return ok({ revision: kit.revision, authorization: kit.owner ? { ownerSession: kit.owner } : null });
      kit.manual.push([...args]);
      const kind = ({ accept: 'accept', close: 'close', 'scope:choose': 'choose', 'task:start': 'confirm-delivery', 'task:unblock': 'unblock', 'commits:adopt': 'adopt-commits' } as Record<string, KitDecision['kind']>)[args[0]!]!;
      const taskId = kind === 'confirm-delivery' ? args[1]! : null;
      const inputDigest = hostInputDigest({ args, subject: kit.subject });
      const id = `dec-${inputDigest.slice(0, 12)}`;
      for (const other of kit.requests.values()) if (other.kind === kind && other.id !== id && other.state === 'pending') other.state = 'stale';
      const view: KitDecision = kit.requests.get(id) ?? { id, kind, scopeId: kind === 'choose' ? null : 'S1', taskId, proposal: null, params: {}, inputDigest, revision: kit.revision, createdAt: 'now', state: 'pending' };
      kit.requests.set(id, view);
      return refuse('USER_DECISION_REQUIRED', { decision: { ...view } });
    },
    runHost: async (_root: string, args: readonly string[], verifier: HostVerifier) => {
      kit.hosted.push([...args]);
      kit.beforeHost?.();
      kit.beforeHost = null;
      const request = kit.requests.get(flagOf(args, '--decision')!);
      if (!request) return refuse('DECISION_UNKNOWN');
      const meta = { kind: flagOf(args, '--source')!, messageId: flagOf(args, '--message-id'), runId: flagOf(args, '--autopilot-run'), session: flagOf(args, '--decision-session') };
      const note = flagOf(args, '--note')!;
      const payload = {
        decisionId: request.id, expectedRevision: Number(flagOf(args, '--expected-revision')), inputDigest: hostInputDigest({ decision: request.inputDigest, note, source: meta }),
        operation: args[0], ownerSession: kit.owner, root: kit.refuseTicket ?? realRoot(root), runId: meta.runId, scopeId: request.scopeId ?? 'NONE',
      };
      kit.refuseTicket = null;
      const verdict = verifier.verify({ payload, payloadDigest: hostInputDigest(payload), ticket: verifier.ticket });
      if (!verdict.ok) return refuse('HOST_AUTH_INVALID', { reason: verdict.reason });
      if (kit.staleRevision > 0) {
        kit.staleRevision -= 1;
        kit.revision += 1;
        return refuse('REVISION_MISMATCH');
      }
      if (request.state === 'applied') return ok({ already: true, decisionId: request.id, kind: request.kind, result: { stored: true } });
      if (request.state !== 'pending' || request.inputDigest !== hostInputDigest({ args: kit.manual.find((m) => `dec-${hostInputDigest({ args: m, subject: kit.subject }).slice(0, 12)}` === request.id) ?? [], subject: kit.subject })) {
        request.state = 'stale';
        return refuse('DECISION_STALE');
      }
      request.state = 'applied';
      kit.revision += 1;
      kit.history.push({ decisionId: request.id, source: meta.kind, note, messageId: meta.messageId, session: meta.session, runId: meta.runId });
      if (kit.loseAnswer) {
        kit.loseAnswer = false;
        return refuse('KIT_TIMEOUT');
      }
      return ok({ already: false, decisionId: request.id, kind: request.kind, result: { stored: true } });
    },
  } as unknown as KitRunner;
  const service = (): Decisions =>
    createDecisions({ runner, tickets: createHostTickets(), journal: createDecisionJournal(), userSource: () => source.value, runLive: async () => live.value });
  const journal = () => createDecisionJournal().list(root);
  return { root, kit, live, source, decisions: service(), restart: service, journal };
}

const button = (kind: DecisionAsk['kind'], more: Partial<DecisionAsk> = {}): DecisionAsk => ({ kind, origin: { kind: 'button', session: 's-1' }, ...more });
const refused = (code: string) => (error: unknown) => error instanceof WorkflowActionError && error.code === code;
const said = (text: string, id = 'm-1'): TurnUserSource => ({ id, text, at: '2026-11-17T10:00:00.000Z', via: 'prompt', turnRef: 't-1' });

test('the agent mode gives null: the caller keeps the Kit 2.3 form', async () => {
  const w = world('agent');
  assert.equal(await w.decisions.apply(w.root, 'p', button('accept')), null);
  assert.deepEqual([w.kit.manual, w.kit.hosted, await w.journal()], [[], [], []]);
});

test('a button records the decision by a host operation bound to the request, its note and source', async () => {
  const w = world();
  const done = await w.decisions.apply(w.root, 'p', button('accept', { note: 'Принимаю, всё хорошо' }));
  const [request] = [...w.kit.requests.values()];
  assert.deepEqual(done, { decisionId: request!.id, kind: 'accept', already: false, note: 'Принимаю, всё хорошо', result: { stored: true } });
  assert.deepEqual(w.kit.manual, [['accept']], 'the request is the one Kit registers for the manual form');
  // The host form names only the request: no words of the agent, no other argument.
  assert.deepEqual(w.kit.hosted, [['accept', '--decision', request!.id, '--source', 'button', '--note', 'Принимаю, всё хорошо', '--expected-revision', '7', '--decision-session', 's-1']]);
  assert.deepEqual(w.kit.history.map((h) => [h.source, h.note, h.session]), [['button', 'Принимаю, всё хорошо', 's-1']]);
  const [record] = await w.journal();
  assert.deepEqual([record!.state, record!.decisionId, record!.sourceId, record!.kind], ['applied', request!.id, 'button:-', 'accept']);
  // A press without words gets the note of the button; a too short text too.
  const other = world();
  assert.equal((await other.decisions.apply(other.root, 'p', button('close', { scopeId: 'S1', note: 'ok' })))!.note, DECISION_TEXTS.button);
  assert.deepEqual(other.kit.manual, [['close', '--scope', 'S1']]);
});

test('a double press and a repeated request give one record in the Kit history', async () => {
  const w = world();
  const [first, second] = await Promise.all([w.decisions.apply(w.root, 'p', button('accept')), w.decisions.apply(w.root, 'p', button('accept'))]);
  assert.equal(first!.decisionId, second!.decisionId, 'one key — one decision id');
  assert.deepEqual([first!.already, second!.already].sort(), [false, true]);
  assert.equal(w.kit.history.length, 1);
  // A later press of the same card: the stored result, Kit applies nothing.
  const hosted = w.kit.hosted.length;
  const third = await w.decisions.apply(w.root, 'p', button('accept'));
  assert.deepEqual([third!.already, third!.decisionId, w.kit.hosted.length, w.kit.history.length], [true, first!.decisionId, hosted, 1]);
  assert.equal((await w.journal()).length, 1);
});

test('the card data changed after it was shown: DECISION_STALE, nothing is recorded', async () => {
  const w = world();
  await assert.rejects(w.decisions.apply(w.root, 'p', button('accept', { expected: { id: 'dec-000000000000', inputDigest: 'old' } })), refused('DECISION_STALE'));
  assert.deepEqual([w.kit.hosted, w.kit.history, await w.journal()], [[], [], []]);
  // The id is the same but the digest the user saw is another one.
  const [request] = [...w.kit.requests.values()];
  await assert.rejects(w.decisions.apply(w.root, 'p', button('accept', { expected: { id: request!.id, inputDigest: 'old' } })), refused('DECISION_STALE'));
  // Kit itself refuses a request whose data changed between the registration and the ticket.
  const raced = world();
  raced.kit.beforeHost = () => {
    raced.kit.subject = 'v2';
  };
  await assert.rejects(raced.decisions.apply(raced.root, 'p', button('accept')), refused('DECISION_STALE'));
  assert.equal(raced.kit.history.length, 0);
  assert.equal((await raced.journal())[0]!.state, 'failed');
  // The new card gives a new key: the next press records the decision.
  const next = await raced.decisions.apply(raced.root, 'p', button('accept'));
  assert.equal(next!.already, false);
  assert.equal(raced.kit.history.length, 1);
});

test('a message decision takes the note from the user\'s delivered message; the agent passes no words', async () => {
  const w = world();
  // No delivered message of the current turn: nothing is asked of Kit and nothing is written.
  await assert.rejects(w.decisions.apply(w.root, 'p', { kind: 'accept', origin: { kind: 'message', key: 'claude:s-1' } }), refused('decision-source-missing'));
  assert.deepEqual([w.kit.manual, w.kit.hosted, await w.journal()], [[], [], []]);
  w.source.value = said(`  Принимаю результат. ${'я'.repeat(600)}`);
  const done = await w.decisions.apply(w.root, 'p', { kind: 'accept', origin: { kind: 'message', key: 'claude:s-1' }, note: 'the words an agent would pass are ignored' });
  assert.equal(done!.note.length, DECISION_NOTE_MAX);
  assert.ok(done!.note.startsWith('Принимаю результат.'));
  assert.deepEqual(w.kit.history.map((h) => [h.source, h.messageId, h.session, h.note === done!.note]), [['message', 'm-1', 's-1', true]]);
  const args = w.kit.hosted[0]!;
  assert.deepEqual([flagOf(args, '--source'), flagOf(args, '--message-id'), flagOf(args, '--decision-session'), flagOf(args, '--autopilot-run')], ['message', 'm-1', 's-1', null]);
  // The same command of the same message again: the stored result, Kit is not called.
  const calls = [w.kit.manual.length, w.kit.hosted.length];
  const again = await w.decisions.apply(w.root, 'p', { kind: 'accept', origin: { kind: 'message', key: 'claude:s-1' } });
  assert.deepEqual([again!.already, again!.decisionId, w.kit.manual.length, w.kit.hosted.length], [true, done!.decisionId, ...calls]);
  // One message — one decision: the acceptance message does not close the plan too.
  await assert.rejects(w.decisions.apply(w.root, 'p', { kind: 'close', scopeId: 'S1', origin: { kind: 'message', key: 'claude:s-1' } }), refused('decision-source-used'));
  assert.equal(w.kit.history.length, 1);
  // The next message of the user is a new source.
  w.source.value = said('Закрывай план', 'm-2');
  assert.equal((await w.decisions.apply(w.root, 'p', { kind: 'close', scopeId: 'S1', origin: { kind: 'message', key: 'claude:s-1' } }))!.note, 'Закрывай план');
  assert.deepEqual(w.kit.history.map((h) => h.messageId), ['m-1', 'm-2']);
});

test('a lost answer and a restart of the service: the issued record is reconciled by its decision id', async () => {
  const w = world();
  w.kit.loseAnswer = true; // Kit applied the decision, the answer never came
  await assert.rejects(w.decisions.apply(w.root, 'p', button('confirm-delivery', { taskId: 'T9' })), refused('KIT_TIMEOUT'));
  assert.equal(w.kit.history.length, 1);
  assert.equal((await w.journal())[0]!.state, 'issued');
  // The service restarts: the journal is read from the disk, the same decision id is asked again.
  const restarted = w.restart();
  const done = await restarted.apply(w.root, 'p', button('confirm-delivery', { taskId: 'T9', origin: { kind: 'button', requestId: 'press-2' } }));
  assert.deepEqual([done!.already, done!.decisionId], [true, w.kit.history[0]!.decisionId]);
  assert.equal(w.kit.history.length, 1, 'no second decision');
  assert.deepEqual((await w.journal()).map((r) => r.state), ['applied']);
  assert.deepEqual(w.kit.manual, [['task:start', 'T9']], 'the reconciliation registers no second request');
  // A ticket bound to another root: Kit refuses it and applies nothing.
  const crashed = world();
  crashed.kit.refuseTicket = '/another/root';
  await assert.rejects(crashed.decisions.apply(crashed.root, 'p', button('accept')), refused('HOST_AUTH_INVALID'));
  assert.deepEqual([(await crashed.journal())[0]!.state, crashed.kit.history.length], ['failed', 0], 'a ticket of another root applies nothing');
});

test('a plan revision that moved meanwhile is retried with a fresh ticket', async () => {
  const w = world();
  w.kit.staleRevision = 2;
  const done = await w.decisions.apply(w.root, 'p', button('unblock'));
  assert.equal(done!.already, false);
  assert.deepEqual(w.kit.hosted.map((args) => flagOf(args, '--expected-revision')), ['7', '8', '9']);
  assert.equal(w.kit.history.length, 1);
  // The retries end: the record stays issued for the next request.
  const stuck = world();
  stuck.kit.staleRevision = 5;
  await assert.rejects(stuck.decisions.apply(stuck.root, 'p', button('unblock')), refused('REVISION_MISMATCH'));
  assert.equal((await stuck.journal())[0]!.state, 'issued');
});

test('a run decides by its grant only while it is live; a repeated step makes no second decision', async () => {
  const w = world();
  const choice = { generation: 2, option: 'sequential' as const, session: 's-1', expectedDigest: 'abc' };
  const ask: DecisionAsk = { kind: 'choose', origin: { kind: 'grant', runId: 'run-1' }, note: 'Автоматический выбор по поручению run-1: sequential', choice };
  // Paused, stopped or revoked before the ticket: no ticket, nothing applied, no user message used.
  w.live.value = false;
  await assert.rejects(w.decisions.apply(w.root, 'p', ask), refused('run-not-live'));
  assert.deepEqual([w.kit.hosted, w.kit.history], [[], []]);
  w.live.value = true;
  const done = await w.decisions.apply(w.root, 'p', ask);
  assert.deepEqual(w.kit.manual.at(-1), ['scope:choose', '--generation', '2', '--option', 'sequential', '--session', 's-1', '--expected-digest', 'abc']);
  const args = w.kit.hosted.at(-1)!;
  assert.deepEqual([args[0], flagOf(args, '--source'), flagOf(args, '--autopilot-run'), flagOf(args, '--message-id'), flagOf(args, '--decision-session')], ['scope:choose', 'grant', 'run-1', null, null]);
  assert.deepEqual(w.kit.history.map((h) => [h.source, h.runId, h.note]), [['grant', 'run-1', 'Автоматический выбор по поручению run-1: sequential']]);
  // The step repeats after a restart of the service: the journal answers, Kit is not asked.
  const calls = [w.kit.manual.length, w.kit.hosted.length];
  const again = await w.restart().apply(w.root, 'p', ask);
  assert.deepEqual([again!.already, again!.decisionId, w.kit.manual.length, w.kit.hosted.length, w.kit.history.length], [true, done!.decisionId, ...calls, 1]);
});
