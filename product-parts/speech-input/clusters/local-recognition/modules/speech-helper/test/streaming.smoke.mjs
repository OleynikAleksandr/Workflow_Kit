// Real model check, deliberately opt-in: node streaming.smoke.mjs helper model wav [seconds].
// Does not capture a microphone, modify Handy, or save audio/transcripts in app state.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
const [helper, model, wav, seconds] = process.argv.slice(2);
if (!helper || !model || !wav) throw new Error('helper model wav [seconds] required');
const audio = readFileSync(wav);
assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
let pcm;
for (let offset = 12; offset + 8 <= audio.length;) {
  const size = audio.readUInt32LE(offset + 4);
  if (audio.toString('ascii', offset, offset + 4) === 'data') { pcm = audio.subarray(offset + 8, offset + 8 + size); break; }
  offset += 8 + size + (size % 2);
}
assert.ok(pcm?.length);
const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'ignore'] });
let bytes = Buffer.alloc(0), pending;
const exit = new Promise(resolve => child.once('exit', resolve));
child.on('error', error => pending?.reject(error));
child.on('exit', code => pending?.reject(new Error(`helper exited: ${code}`)));
child.stdout.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk]);
  while (bytes.length >= 4) {
    const n = bytes.readUInt32LE(0);
    assert.ok(n <= 131072);
    if (bytes.length < n + 8) return;
    const p = bytes.readUInt32LE(n + 4);
    if (bytes.length < n + p + 8) return;
    const message = JSON.parse(bytes.subarray(4, n + 4));
    bytes = bytes.subarray(n + p + 8);
    clearTimeout(pending?.timer);
    if (message.type === 'error') pending?.reject(new Error(message.message));
    else pending?.resolve(message);
    pending = null;
  }
});
function request(message, pcm = Buffer.alloc(0)) {
  assert.equal(pending, null);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('helper timeout')); }, 90000);
    pending = { resolve, reject, timer };
    const json = Buffer.from(JSON.stringify(message)), header = Buffer.alloc(4), tail = Buffer.alloc(4);
    header.writeUInt32LE(json.length); tail.writeUInt32LE(pcm.length);
    child.stdin.write(Buffer.concat([header, json, tail, pcm]));
  });
}
pending = null;
try {
  const coldStart = performance.now();
  const hello = await request({ type: 'hello' }); assert.equal(hello.protocolVersion, 1);
  const loaded = await request({ type: 'load', path: model });
  const loadMs = performance.now() - coldStart;
  const begin = performance.now(); await request({ type: 'begin' });
  const warmStartMs = performance.now() - begin;
  const duration = seconds ? Number(seconds) : pcm.length / 64000;
  const blocks = Math.ceil(duration / .2), started = performance.now();
  let firstTextMs, changedBeforeEOF = 0, maxLagMs = 0, maxFeedMs = 0, text = '';
  for (let i = 0; i < blocks; i++) {
    const offset = (i * 12800) % pcm.length;
    const deadline = started + i * 200;
    await sleep(Math.max(0, deadline - performance.now()));
    maxLagMs = Math.max(maxLagMs, performance.now() - deadline);
    const before = performance.now();
    const response = await request({ type: 'feed' }, pcm.subarray(offset, Math.min(offset + 12800, pcm.length)));
    maxFeedMs = Math.max(maxFeedMs, performance.now() - before);
    if (response.changed && response.committed + response.tentative !== text) {
      text = response.committed + response.tentative;
      if (text) { changedBeforeEOF++; firstTextMs ??= performance.now() - started; }
    }
  }
  const before = performance.now(), final = await request({ type: 'finish' });
  const finalizeMs = performance.now() - before;
  assert.equal(final.type, 'final'); assert.equal(final.truncated, false);
  assert.ok(/[а-яё]/iu.test(final.committed + final.tentative), 'Russian output required');
  assert.ok(changedBeforeEOF >= 2, 'Several updates before EOF required');
  assert.ok(maxLagMs < 3000, 'Unbounded real-time lag');
  console.log(JSON.stringify({ runtime: hello.runtime, backend: loaded.backend, duration, loadMs, warmStartMs, firstTextMs, changedBeforeEOF, maxLagMs, maxFeedMs, finalizeMs, rssPeakBytes: loaded.rssPeakBytes, final: final.committed + final.tentative }, null, 2));
} finally {
  child.stdin.end();
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  await exit; clearTimeout(timer);
}
