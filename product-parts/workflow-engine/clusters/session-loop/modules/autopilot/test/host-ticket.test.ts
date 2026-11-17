// M39 T002: one-time host tickets and the real Kit bundle forked with an IPC channel (runHost).
// HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, type KitRunner } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { createHostTickets, type HostBinding, hostInputDigest } from '../src/index.ts';

let tmp = '';
let root = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
let digest = '';

const CI = 'name: CI\non:\n  push:\njobs:\n  test:\n    name: ${{ matrix.name }}\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        include:\n          - name: Linux x64\n            os: ubuntu-latest\n    steps:\n      - run: npm test\n';

const SCOPE = {
  id: 'auto',
  objective: 'Explain the feature',
  acceptance: ['The note explains the feature'],
  approval: 'User approved the automated scope',
  spec: 'docs/spec.md',
  automation: {
    acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['docs/evidence/result.md'] }],
    ci: { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64'], exactSha: true },
    delivery: [{ taskId: 'D1', effects: ['write the release note'] }],
    publication: { branch: 'main', upstream: 'origin/main' },
  },
  tasks: [
    { id: 'N', title: 'Note', commitMessage: 'docs: note', acceptance: ['a'], files: ['docs/note.md'] },
    { id: 'D1', title: 'Release', commitMessage: 'chore: release', acceptance: ['b'], files: ['docs/release.md'], kind: 'delivery', dependencies: ['N'] },
  ],
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
}

async function revision(): Promise<number> {
  const status = await runner.status(root);
  assert.ok(status.ok);
  return status.result.revision;
}

function grant(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: 'run-1',
    scopeId: 'auto',
    ownerSession: 's-1',
    mode: 'after-start',
    source: 'panel-start',
    note: 'User started the plan with the after-start autopilot',
    proposalDigest: digest,
    deliveryTaskIds: ['D1'],
    accept: true,
    close: true,
    ci: SCOPE.automation.ci,
    publication: SCOPE.automation.publication,
    acceptancePolicy: 'automatic',
    ...fields,
  };
}

async function binding(input: unknown, fields: Partial<HostBinding> = {}): Promise<HostBinding> {
  return {
    operation: 'autopilot:authorize',
    root,
    runId: 'run-1',
    scopeId: 'auto',
    ownerSession: 's-1',
    expectedRevision: await revision(),
    inputDigest: hostInputDigest(input),
    ...fields,
  };
}

async function writeInput(name: string, value: unknown): Promise<string> {
  await writeFile(path.join(root, '.harness', 'inputs', name), JSON.stringify(value));
  return `.harness/inputs/${name}`;
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-host-ticket-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  root = path.join(tmp, 'project');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  git(root, 'init', '-q');
  await writeFile(path.join(root, 'README.md'), '# Demo\n');
  await writeFile(path.join(root, 'docs', 'spec.md'), '# Spec\n');
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), CI);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  const installed = await runner.install(root);
  assert.ok(installed.ok, JSON.stringify(installed));
  await mkdir(path.join(root, '.harness', 'inputs'), { recursive: true });
  const scope = await writeInput('scope.json', SCOPE);
  const proposed = await runner.run(root, ['scope:propose', '--input', scope, '--recommended', 'sequential', '--reason', 'One note and one release']);
  assert.ok(proposed.ok, JSON.stringify(proposed));
  const reviewed = await runner.run<{ proposalDigest: string }>(root, ['scope:proposal', '--digest']);
  assert.ok(reviewed.ok);
  digest = reviewed.result.proposalDigest;
  const chosen = await runner.run(root, ['scope:choose', '--generation', '1', '--option', 'sequential', '--session', 's-1', '--note', 'User chose sequential', '--expected-digest', digest]);
  assert.ok(chosen.ok, JSON.stringify(chosen));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('tickets: one use, expiry, payload digest and every bound field', () => {
  let clock = 1_000;
  const redeemed: string[] = [];
  const tickets = createHostTickets({ now: () => clock, ttlMs: 100, onRedeem: (item) => redeemed.push(item.ticketId) });
  const bound: HostBinding = { operation: 'close', root: '/p', runId: 'r', scopeId: 's', ownerSession: 'o', expectedRevision: 5, inputDigest: 'd' };
  const verifier = tickets.issue(bound);
  const request = (payload: unknown, ticket: unknown = verifier.ticket) => ({ payload, payloadDigest: hostInputDigest(payload), ticket });
  assert.deepEqual(verifier.verify(request(bound, 'forged')), { ok: false, reason: 'unknown ticket' });
  assert.deepEqual(verifier.verify({ ...request(bound), payloadDigest: 'x' }), { ok: false, reason: 'payload digest' });
  for (const field of ['operation', 'runId', 'scopeId', 'ownerSession', 'expectedRevision', 'inputDigest', 'root'] as const) {
    const verdict = verifier.verify(request({ ...bound, [field]: field === 'expectedRevision' ? 6 : 'other' }));
    assert.deepEqual(verdict, { ok: false, reason: `ticket bound to another ${field}` });
  }
  assert.deepEqual(verifier.verify(request(bound)), { ok: true });
  assert.deepEqual(redeemed, [verifier.ticketId]);
  assert.deepEqual(verifier.verify(request(bound)), { ok: false, reason: 'ticket already used' });
  const late = tickets.issue(bound);
  clock += 101;
  assert.deepEqual(late.verify({ payload: bound, payloadDigest: hostInputDigest(bound), ticket: late.ticket }), { ok: false, reason: 'ticket expired' });
  // M40: the ticket of a user decision is bound to its request; a run operation carries none.
  const decision: HostBinding = { ...bound, operation: 'accept', runId: null, decisionId: 'dec-0123456789ab' };
  const decided = tickets.issue(decision);
  const ask = (payload: unknown) => ({ payload, payloadDigest: hostInputDigest(payload), ticket: decided.ticket });
  assert.deepEqual(decided.verify(ask({ ...decision, decisionId: 'dec-ffffffffffff' })), { ok: false, reason: 'ticket bound to another decisionId' });
  assert.deepEqual(decided.verify(ask({ ...decision, decisionId: undefined })), { ok: false, reason: 'ticket bound to another decisionId' });
  assert.deepEqual(decided.verify(ask({ ...decision, runId: 'r' })), { ok: false, reason: 'ticket bound to another runId' });
  assert.deepEqual(decided.verify(ask(decision)), { ok: true });
  const plain = tickets.issue(bound);
  assert.deepEqual(plain.verify({ payload: { ...bound, decisionId: 'dec-0123456789ab' }, payloadDigest: hostInputDigest({ ...bound, decisionId: 'dec-0123456789ab' }), ticket: plain.ticket }), { ok: false, reason: 'ticket bound to another decisionId' });
  // A restart restores the redeemed ids from the journal.
  const restarted = createHostTickets({ now: () => clock });
  restarted.restore(tickets.redeemed());
  assert.deepEqual(restarted.redeemed(), [verifier.ticketId, decided.ticketId]);
  assert.ok(!verifier.ticket.includes('\n'));
});

test('runHost: the real bundle asks this parent; plain runs and forged bindings write nothing', async () => {
  const input = grant();
  const file = await writeInput('grant.json', input);
  const rev = await revision();
  const args = ['autopilot:authorize', '--input', file, '--expected-revision', String(rev)];
  // Without the IPC channel: HOST_AUTH_REQUIRED, whatever the environment says.
  const plain = await runner.run(root, args);
  assert.equal(plain.ok ? 'ok' : plain.code, 'HOST_AUTH_REQUIRED');
  const spoofed = createKitRunner({ runCommand, appBundle: async () => '', env: { ...env, WFK_HOST: '1', WFK_HOST_TICKET: 'x' } });
  const spoof = await spoofed.run(root, args);
  assert.equal(spoof.ok ? 'ok' : spoof.code, 'HOST_AUTH_REQUIRED');
  assert.equal(await revision(), rev);
  // A ticket bound to another revision or operation is refused before the write.
  const tickets = createHostTickets();
  for (const fields of [{ expectedRevision: rev + 1 }, { operation: 'close' as const }, { inputDigest: hostInputDigest(grant({ accept: false })) }]) {
    const refused = await runner.runHost(root, args, tickets.issue(await binding(input, fields)));
    assert.equal(refused.ok ? 'ok' : refused.code, 'HOST_AUTH_INVALID');
  }
  assert.equal(await revision(), rev);
  // The bound ticket: the grant is written once; the same ticket again is refused.
  const verifier = tickets.issue(await binding(input));
  const done = await runner.runHost<{ changed: boolean; grant: { runId: string } }>(root, args, verifier);
  assert.ok(done.ok, JSON.stringify(done));
  assert.equal(done.result.grant.runId, 'run-1');
  assert.equal(JSON.stringify(done).includes(verifier.ticket), false);
  assert.equal(git(root, 'log', '-1', '--format=%s').trim(), 'chore: authorize autopilot run run-1');
  const replay = await runner.runHost(root, ['autopilot:authorize', '--input', file, '--expected-revision', String(rev + 1)], verifier);
  assert.equal(replay.ok ? 'ok' : replay.code, 'HOST_AUTH_INVALID');
  // revoke through the same path: settings-off is resumable.
  const revokeRev = await revision();
  const revokeInput = { note: 'Settings: off', reason: 'settings-off', runId: 'run-1' };
  const revoked = await runner.runHost<{ grant: { revoked: { resumable: boolean } } }>(
    root,
    ['autopilot:revoke', '--run', 'run-1', '--reason', 'settings-off', '--note', 'Settings: off', '--expected-revision', String(revokeRev)],
    tickets.issue(await binding(revokeInput, { operation: 'autopilot:revoke' })),
  );
  assert.ok(revoked.ok, JSON.stringify(revoked));
  assert.equal(revoked.result.grant.revoked.resumable, true);
  // The delivery start of the agent uses the grant only while it is live.
  const start = await runner.run(root, ['task:start', 'D1', '--autopilot-run', 'run-1']);
  assert.equal(start.ok ? 'ok' : start.code, 'AUTOPILOT_REVOKED');
});
