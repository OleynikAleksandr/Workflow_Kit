import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { runStatusline } from '#cli';
import { createClaudeProvider } from '../src/index.ts';
import { createHarness, skip } from './harness.ts';
for (const platform of ['darwin', 'linux'] as const) test(`${platform}: simultaneous native launches pass distinct settings; snapshot reader and original line integrate`, { skip }, async () => {
  const h = await createHarness(() => ({}));
  try {
    const projects = await Promise.all([h.project('ParametersA'), h.project('ParametersB')]);
    await writeFile(h.configFile, JSON.stringify({ projects: Object.fromEntries(projects.map(p => [p.path, { hasTrustDialogAccepted: true }])) }));
    for (const [i, p] of projects.entries()) await writeFile(path.join(p.path, '.claude', 'settings.local.json'), JSON.stringify({ statusLine: { type: 'command', command: "printf 'User line: Юникод\\n'", padding: i + 2, refreshInterval: 300 + i } }));
    const provider = createClaudeProvider({ ...h.context, platform });
    const sessions = await Promise.all(projects.map(p => provider.createSession(p, { title: p.name })));
    const calls = (await h.fakeCalls()).filter(c => c.argv.includes('--remote-control'));
    assert.equal(calls.length, 2); const files: string[] = [];
    for (const [i, p] of projects.entries()) {
      const call = calls.find(c => c.argv.includes(p.name))!; assert.ok(call);
      const file = call.argv[call.argv.indexOf('--settings') + 1]!; files.push(file);
      const settings = JSON.parse(await readFile(file, 'utf8')); assert.equal(settings.statusLine.padding, i + 2); assert.equal(settings.statusLine.refreshInterval, 300 + i);
      const session = (await provider.listSessions(p)).find(s => s.remoteId === sessions[i]!.remoteId)!;
      let output: Buffer = Buffer.alloc(0);
      await runStatusline(['--client', 'claude'], { platform, homedir: h.home, cwd: p.path, dirs: h.context.dirs, env: { ...process.env, HOME: h.home },
        input: Buffer.from(JSON.stringify({ session_id: session.localId, model: { id: 'claude-fable-5-2', display_name: 'Fable 5.2' }, effort: { level: 'high' }, context_window: { used_percentage: 10, context_window_size: 200000 } })), write: bytes => { output = bytes; } });
      assert.deepEqual(output, Buffer.from('User line: Юникод\n'));
      const parameters = await provider.readParameters!(p, session.localId);
      assert.equal(parameters.items[0]?.label, 'Fable 5.2'); assert.equal(parameters.items[1]?.label, 'High'); assert.equal(parameters.context?.usedPercent, 10);
    }
    assert.notEqual(files[0], files[1]);
  } finally { await h.cleanup(); }
});
