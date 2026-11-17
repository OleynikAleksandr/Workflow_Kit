import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createModelStore } from '../src/index.ts';
import type { SpeechModel } from '../src/index.ts';
const bytes = new Uint8Array([1, 2, 3, 4]);
const model: SpeechModel = { id: 'test', name: 'Test', quantization: 'Q8_0', repository: 'owner/model', revision: 'a'.repeat(40), filename: 'test.gguf', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), languages: ['ru'], streaming: true, license: 'MIT', licenseUrl: 'https://example.org/license', source: 'https://example.org' };
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`verified download, selection survives restart, tampering is refused: ${platform}`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-models-'));
  try {
    const options = { root, settingsFile: path.join(root, 'settings.json'), catalog: [model], platform, fetch: (async (url: string | URL | Request) => {
      assert.equal(String(url), `https://huggingface.co/owner/model/resolve/${model.revision}/test.gguf`);
      return new Response(bytes);
    }) as typeof fetch };
    const store = await createModelStore(options);
    assert.equal((await store.list())[0]!.state, 'missing');
    await assert.rejects(store.verify('../foreign'), { code: 'unknown-model' });
    await store.download('test');
    assert.equal((await store.list())[0]!.state, 'installed');
    await store.select('test');
    assert.equal((await createModelStore(options)).selected(), 'test');
    await writeFile(await store.verify('test'), 'bad!');
    await assert.rejects(store.verify('test'), { code: 'model-checksum' });
    await store.remove('test');
    assert.equal((await store.list())[0]!.state, 'missing');
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
});
test('bad checksum never installs; partial is removed; symlink and active-model deletion are refused', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-models-'));
  try {
    let busy = false;
    const store = await createModelStore({ root, settingsFile: path.join(root, 'settings.json'), catalog: [model], inUse: () => busy, fetch: (async () => new Response(new Uint8Array([4, 3, 2, 1]))) as typeof fetch });
    await assert.rejects(store.download('test'), { code: 'model-checksum' });
    await assert.rejects(readFile(path.join(root, 'test.gguf.partial')), { code: 'ENOENT' });
    assert.equal((await store.list())[0]!.state, 'error');
    busy = true; await assert.rejects(store.remove('test'), { code: 'speech-busy' }); busy = false;
    const foreign = path.join(root, 'foreign.gguf'); await writeFile(foreign, bytes);
    await symlink(foreign, path.join(root, 'test.gguf'));
    await assert.rejects(store.remove('test'), { code: 'unsafe-model-path' });
    assert.deepEqual(new Uint8Array(await readFile(foreign)), bytes);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
});
test('cancellation aborts one shared download and never marks partial as installed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-models-'));
  try {
    let ready!: () => void; const started = new Promise<void>(resolve => ready = resolve);
    const store = await createModelStore({ root, settingsFile: path.join(root, 'settings.json'), catalog: [model], fetch: (async (_url, init) => new Promise<Response>((_resolve, reject) => { init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))); ready(); })) as typeof fetch });
    const first = store.download('test'); const second = store.download('test'); assert.equal(first, second);
    await started; await store.cancel('test'); await first;
    assert.equal((await store.list())[0]!.state, 'missing');
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
});
