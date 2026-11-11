// Trust of a folder, external CLAUDE.md imports and Claude's dialogs end to end on the fake claude
// (test/harness.ts). The machine mirrors the one verified on 2026-11-05: ~ is trusted and
// ~/CLAUDE.md imports ~/AGENTS.md. Kit writes ~/.claude.json itself and never presses a key in a
// dialog. Needs `expect`; skipped without it.
import assert from 'node:assert/strict';
import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { Project, ProviderError } from '#provider-registry';
import { ENVIRONMENT_START } from '../src/index.ts';
import { INHERITED_NOTE } from '../src/claude-config.ts';
import { code, createHarness, hasExpect, skip } from './harness.ts';
import type { Harness } from './harness.ts';

let h: Harness;
let alpha: Project;
let beta: Project;
let original = '';

const IMPORTS = 'external-imports';

before(async () => {
  if (!hasExpect) return;
  h = await createHarness((home) => ({
    numStartups: 3,
    projects: {
      [home]: { hasTrustDialogAccepted: true },
      [path.join(home, 'WorkflowKitProjects', 'Beta')]: { hasTrustDialogAccepted: true, allowedTools: [] },
      '/elsewhere': { hasTrustDialogAccepted: true },
    },
  }));
  await writeFile(path.join(h.home, 'CLAUDE.md'), '# Home\n\n@AGENTS.md\n\n`@ignored.md` and\n```\n@also-ignored.md\n```\n');
  await writeFile(path.join(h.home, 'AGENTS.md'), '# Agents\n');
  alpha = await h.project('Alpha');
  beta = await h.project('Beta');
  original = await readFile(h.configFile, 'utf8');
});

after(async () => {
  if (hasExpect) await h.cleanup();
});

test('a trusted parent folder is a separate mark: Remote Control still needs the folder key', { skip }, async () => {
  assert.deepEqual(await h.provider.trust(alpha), { trusted: false, inherited: { from: h.home, note: INHERITED_NOTE } });
  assert.deepEqual(await h.provider.trust(beta), { trusted: true });
  await assert.rejects(h.provider.createSession(alpha, { title: 'x' }), code('not-trusted'));
});

test('preview: imports of ~/CLAUDE.md are allowed without a question; an explicit deny still works', { skip }, async () => {
  const { provider } = h;
  const preview = await provider.previewTrust(alpha);
  assert.equal(preview.trusted, false);
  assert.deepEqual(preview.inherited, { from: h.home, note: INHERITED_NOTE });
  assert.deepEqual(preview.choices, [], 'the panel asks nothing');
  assert.equal(preview.writes.find((w) => w.key?.endsWith('hasClaudeMdExternalIncludesApproved'))?.value, true);
  assert.deepEqual(preview.writes.map((w) => w.key?.replace(`projects["${alpha.path}"].`, '')), [
    'hasTrustDialogAccepted',
    'hasClaudeMdExternalIncludesApproved',
    'hasClaudeMdExternalIncludesWarningShown',
  ]);

  await assert.rejects(provider.grantTrust(alpha, 'wrong', {}), code('invalid-token'));
  await assert.rejects(provider.grantTrust(alpha, (await provider.previewTrust(alpha)).token, { [IMPORTS]: 'maybe' }), code('invalid-choice'));
  const stale = await provider.previewTrust(alpha);
  await appendFile(path.join(h.home, 'CLAUDE.md'), '\n');
  await assert.rejects(provider.grantTrust(alpha, stale.token, { [IMPORTS]: 'deny' }), code('preview-changed'));
  assert.equal(await readFile(h.configFile, 'utf8'), original, 'refused grants write nothing');

  const fresh = await provider.previewTrust(alpha);
  const granted = await provider.grantTrust(alpha, fresh.token, { [IMPORTS]: 'deny' });
  assert.equal(granted.trusted, true);
  assert.match(granted.note ?? '', /запрещены/);
  assert.equal(await readFile(granted.backup!, 'utf8'), original);
  const text = await readFile(h.configFile, 'utf8');
  assert.ok(text.includes('\n  "numStartups": 3'), 'two-space indent');
  assert.equal((await stat(h.configFile)).mode & 0o777, 0o640, 'file mode kept');
  const config = await h.readConfig();
  assert.deepEqual(config.projects[alpha.path], {
    hasTrustDialogAccepted: true,
    hasClaudeMdExternalIncludesApproved: false,
    hasClaudeMdExternalIncludesWarningShown: true,
  });
  assert.equal(config['numStartups'], 3);
  assert.deepEqual(config.projects['/elsewhere'], { hasTrustDialogAccepted: true });
  assert.deepEqual(await h.fakeCalls(), [], 'no claude was started');
  assert.deepEqual(await provider.trust(alpha), { trusted: true, backup: granted.backup });
  const again = await provider.previewTrust(alpha);
  assert.deepEqual([again.trusted, again.writes, again.choices], [true, [], []]);
  assert.ok(again.notes?.some((n) => n.includes('решение уже записано — запрещены')));
});

test('createSession stops at the external-imports dialog without a key; the preview answer lets it start', { skip }, async () => {
  const provider = h.withEnv({ FAKE_CLAUDE_EXTERNAL_IMPORTS: path.join(h.home, 'AGENTS.md') });
  await assert.rejects(provider.createSession(beta, { title: 'Beta' }), (error: unknown) => {
    const e = error as ProviderError;
    assert.equal(e.code, 'imports-dialog');
    assert.match(e.message, /Allow external CLAUDE\.md file imports\?/);
    assert.match(e.message, /Yes, allow external imports/);
    assert.match(e.hint ?? '', /решите это в предпросмотре доверия/i);
    return true;
  });
  assert.deepEqual(await h.dialogKeys(), []);
  assert.equal((await h.supervisor.list({ provider: 'claude', kind: 'session' })).length, 0);
  assert.equal((await h.readConfig()).projects[beta.path]?.['hasClaudeMdExternalIncludesWarningShown'], undefined);

  const preview = await provider.previewTrust(beta);
  assert.equal(preview.trusted, true);
  assert.equal(preview.writes.length, 2);
  // No answer: the imports are allowed by default.
  const granted = await provider.grantTrust(beta, preview.token, {});
  assert.match(granted.note ?? '', /разрешены/);
  assert.deepEqual((await h.readConfig()).projects[beta.path], {
    hasTrustDialogAccepted: true,
    allowedTools: [],
    hasClaudeMdExternalIncludesApproved: true,
    hasClaudeMdExternalIncludesWarningShown: true,
  });
  const session = await provider.createSession(beta, { title: 'Beta' });
  assert.equal(session.state, 'running');
  await provider.stopSession!(beta, session.remoteId!);
});

test('trust and unknown dialogs stop claude with their text: sessions and the folder environment', { skip }, async () => {
  const trustDialog = h.withEnv({ FAKE_CLAUDE_MODE: 'trust-dialog' });
  await assert.rejects(trustDialog.createSession(beta, { title: 'b' }), (error: unknown) => {
    const e = error as ProviderError;
    return e.code === 'trust-dialog' && /Yes, I trust this folder/.test(e.message) && /предпросмотре доверия/.test(e.hint ?? '');
  });
  const unknown = h.withEnv({ FAKE_CLAUDE_MODE: 'unknown-dialog' });
  await assert.rejects(unknown.createSession(beta, { title: 'b' }), (error: unknown) => {
    const e = error as ProviderError;
    return e.code === 'unknown-dialog' && /New MCP server found/.test(e.message) && /предпросмотре доверия/.test(e.hint ?? '');
  });
  await assert.rejects(unknown.runAction(ENVIRONMENT_START, beta), code('unknown-dialog'));
  assert.deepEqual(await h.dialogKeys(), [], 'no key was pressed in any dialog');
  assert.equal((await h.supervisor.list({ provider: 'claude' })).length, 0);
  for (const call of (await h.fakeCalls()).slice(-3)) assert.throws(() => process.kill(call.pid, 0), 'the dialog process was stopped');
});

test('a feature offer gets "Not now" and the session starts; the theme picker stops claude at once (M15)', { skip }, async () => {
  const offering = h.withEnv({ FAKE_CLAUDE_MODE: 'offer' });
  const session = await offering.createSession(beta, { title: 'offer' });
  assert.match(session.remoteId ?? '', /^session_FAKE/);
  const answers = (await readFile(`${h.fakeLog}.offer`, 'utf8')).trim().split('\n').map((line) => (JSON.parse(line) as { keys: string }).keys);
  assert.deepEqual(answers, ['\u001b[B\r']);
  await offering.stopSession!(beta, session.remoteId!);

  const theme = h.withEnv({ FAKE_CLAUDE_MODE: 'theme' });
  const started = Date.now();
  await assert.rejects(theme.createSession(beta, { title: 'theme' }), code('onboarding-dialog'));
  assert.ok(Date.now() - started < 15_000, 'no wait for the link timeout');
  assert.deepEqual(await h.dialogKeys(), [], 'no key was pressed on the first-run screen');
});

test('a write lost to a concurrent save of Claude is repeated; three losses fail with trust-lost', { skip }, async () => {
  const gamma = await h.project('Gamma');
  let stale = await readFile(h.configFile, 'utf8');
  const attempts: number[] = [];
  const once = h.withEnv({}, {
    afterConfigWrite: async (attempt) => {
      attempts.push(attempt);
      if (attempt === 1) await writeFile(h.configFile, stale);
    },
  });
  const granted = await once.grantTrust(gamma, (await once.previewTrust(gamma)).token, { [IMPORTS]: 'allow' });
  assert.equal(granted.trusted, true);
  assert.deepEqual(attempts, [1, 2]);
  assert.equal((await h.readConfig()).projects[gamma.path]?.['hasTrustDialogAccepted'], true);

  const delta = await h.project('Delta');
  stale = await readFile(h.configFile, 'utf8');
  attempts.length = 0;
  const always = h.withEnv({}, {
    afterConfigWrite: async (attempt) => {
      attempts.push(attempt);
      await writeFile(h.configFile, stale);
    },
  });
  await assert.rejects(always.grantTrust(delta, (await always.previewTrust(delta)).token, { [IMPORTS]: 'deny' }), (error: unknown) => {
    const e = error as ProviderError;
    return e.code === 'trust-lost' && typeof e.details?.['backup'] === 'string' && /Копия до записи/.test(e.hint ?? '');
  });
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.equal((await h.readConfig()).projects[delta.path], undefined);
});
