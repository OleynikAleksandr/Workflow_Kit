// End to end (spec M22 2.8): a session archived or removed from the list in the panel leaves the
// Kit process. The service is createApp with stub providers; the hooks go through wfk hook.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { sessionKey } from '#agent-channel';
import { createStubProvider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let env: Record<string, string> = {};
let folder = '';
let projectId = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-excluded-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    providers: [() => createStubProvider({ id: 'codex', title: 'codex', task: 'T' })],
  });
  const bound = await app.start();
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  projectId = (await app.projects.open(folder)).project.id;
  await app.titles.load();
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function hook(event: string, input: object): Promise<string> {
  let out = '';
  await main(['hook', event, '--client', 'codex'], {
    stdout: (text) => (out += text),
    stderr: () => undefined,
    app: { env, homedir: tmp },
    readStdin: async () => JSON.stringify(input),
    hookClients: ['codex'],
  });
  return out;
}

test('an archived session drops out of the channel at once; its hooks and messages are ignored until it returns', async () => {
  const id = '01a1afe3-05b5-75b0-a8b6-59bad1d13140';
  const key = sessionKey('codex', id);
  await hook('prompt', { session_id: id, cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'задача' });
  assert.equal(app.channel.get(key)?.state, 'working');

  await app.titles.setArchived(projectId, key, true);
  assert.equal(app.channel.get(key), undefined, 'gone without waiting for a hook');
  assert.equal(app.channel.excluded(key, projectId), true);

  app.channel.enqueue(key, 'Workflow Kit: выбран путь.', 'panel', projectId);
  const stop = await hook('stop', { session_id: id, cwd: folder, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'готово' });
  assert.equal(stop, '', 'the Stop of an archived session gets no answer and no message');
  assert.equal(app.channel.get(key), undefined);

  await app.titles.setArchived(projectId, key, false);
  await hook('prompt', { session_id: id, cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'снова' });
  assert.equal(app.channel.get(key)?.state, 'working', 'a returned session takes part again');

  await app.titles.setForgotten(projectId, key);
  assert.equal(app.channel.get(key), undefined, 'a removed session leaves for good');
});
