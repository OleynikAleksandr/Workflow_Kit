// Opt-in real GGUF/runtime validation. No microphone and no installed app changes.
// node runtime-switch.smoke.mjs <helper> <Q8 model> <Q4 model> <float32 mono16k wav> [Q6 model]
import assert from 'node:assert/strict';
import { mkdtemp, link, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createHelperClient, createSpeechService } from '../src/index.ts';
const [helper, q8, q4, wav, q6] = process.argv.slice(2), root = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-real-switch-'));
const loads = [], results = [];
let speech;
try {
  await link(q8, path.join(root, 'voxtral-q8.gguf')); await link(q4, path.join(root, 'voxtral-q4.gguf'));
  if (q6) await link(q6, path.join(root, 'voxtral-q6.gguf'));
  const ids = q6 ? ['voxtral-q8', 'voxtral-q4', 'voxtral-q6'] : ['voxtral-q8', 'voxtral-q4'];
  const audio = await readFile(wav); let pcm;
  for (let i = 12; i + 8 <= audio.length;) { const size = audio.readUInt32LE(i + 4); if (audio.toString('ascii', i, i + 4) === 'data') { pcm = audio.subarray(i + 8, i + 8 + size); break; } i += 8 + size + size % 2; }
  assert.ok(pcm?.length);
  speech = await createSpeechService({ root, settingsFile: path.join(root, 'speech.json'), appDir: root, helperPath: path.resolve(helper), helperFactory(file) {
    const client = createHelperClient(file);
    return { ...client, request(m, bytes) { if (m.type === 'load') loads.push(path.basename(m.path)); return client.request(m, bytes); } };
  } });
  for (const id of ids) {
    await speech.select(id); const events = [], start = performance.now();
    const lease = speech.begin(`validation-${id}`, message => events.push(message)); await lease.ready;
    const preparedMs = performance.now() - start, begun = performance.now();
    let sequence = 0, changedBeforeEOF = 0, firstTextMs;
    for (let offset = 0; offset < pcm.length; offset += 12800) {
      await sleep(Math.max(0, begun + offset / 64 - performance.now()));
      const before = events.length; await lease.feed(pcm.subarray(offset, offset + 12800), sequence++);
      const event = events.at(-1);
      if (events.length > before && event.changed && event.committed + event.tentative) { changedBeforeEOF++; firstTextMs ??= performance.now() - begun; }
    }
    const before = performance.now(); await lease.finish();
    const final = events.at(-1), status = await speech.status();
    assert.equal(final.type, 'final'); assert.equal(final.truncated, false);
    assert.match(final.committed + final.tentative, /[а-яё]/iu); assert.ok(changedBeforeEOF > 1);
    results.push({ id, backend: status.backend, preparedMs, firstTextMs, changedBeforeEOF, finalizeMs: performance.now() - before, final: final.committed + final.tentative });
  }
  assert.deepEqual(loads, ids.map(id => `${id}.gguf`));
  console.log(JSON.stringify({ loads, results }, null, 2));
} finally { await speech?.close(); await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
