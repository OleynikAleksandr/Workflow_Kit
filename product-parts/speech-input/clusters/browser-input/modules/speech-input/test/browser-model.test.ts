import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SpeechResampler } from '../src/resampler.js';
import { beginRange, applySnapshot, browserCapability } from '../src/field-model.js';
function convert(input: Float32Array, chunks: number) {
  const r = new SpeechResampler(48000), result = [];
  for (let i = 0; i < input.length; i += chunks) result.push(...r.push(input.subarray(i, i + chunks)));
  result.push(...r.finish()); assert.deepEqual(r.finish(), []);
  return Float32Array.from(result.flatMap(p => Array.from(p)));
}
test('resampling has exact duration and remains continuous across arbitrary block boundaries', () => {
  const audio = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / 48000));
  const one = convert(audio, 48000), chunks = convert(audio, 127);
  assert.equal(one.length, 16000); assert.deepEqual(chunks, one);
  assert.ok(Math.max(...one.subarray(100, 500)) > .95);
  assert.throws(() => new SpeechResampler(8000));
  assert.throws(() => new SpeechResampler(48000).push(new Float32Array([NaN])));
});
test('anti-alias filter suppresses out-of-band audio instead of folding it into speech', () => {
  const audio = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 18000 * i / 48000));
  const out = convert(audio, 256).subarray(200, 15000);
  assert.ok(Math.sqrt(out.reduce((sum, v) => sum + v * v, 0) / out.length) < .01);
});
test('snapshots replace one range, preserve selection until first text, retain suffix and do not duplicate committed text', () => {
  const range = beginRange('До старый текст после', 3, 15);
  assert.equal(applySnapshot(range, '', '').text, range.original);
  assert.equal(applySnapshot(range, 'новый ', 'текс').text, 'До новый текс после');
  assert.equal(applySnapshot(range, 'новый ', 'текст').text, 'До новый текст после');
  assert.equal(applySnapshot(beginRange('начало', 6, 6), 'слово', '').text, 'начало слово');
  const clipped = applySnapshot(beginRange('aa', 2, 2), '😀😀', '', 5);
  assert.ok(clipped.clipped); assert.ok(clipped.text.length <= 6); assert.ok(!/[\uD800-\uDBFF]$/.test(clipped.text));
});
test('mobile, remote, Linux and Windows browsers remain unavailable; Mac loopback is permitted', () => {
  const good = { platform: 'MacIntel', userAgent: 'Mac', maxTouchPoints: 0, secure: true, hostname: 'localhost', audioWorklet: true, media: true };
  assert.equal(browserCapability(good), true);
  for (const platform of ['Linux x86_64', 'Win32']) assert.equal(browserCapability({ ...good, platform }), false);
  assert.equal(browserCapability({ ...good, userAgent: 'iPhone' }), false);
  assert.equal(browserCapability({ ...good, maxTouchPoints: 5 }), false);
  assert.equal(browserCapability({ ...good, hostname: 'mac.ts.net' }), false);
  assert.equal(browserCapability({ ...good, secure: false }), false);
});
