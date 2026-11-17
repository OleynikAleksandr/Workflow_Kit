import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { SpeechResampler } from '../src/resampler.js';
type Message = { type: string; pcm?: Float32Array; sequence?: number };
function fixture() {
  const messages: Message[] = []; let make!: new () => { port: { onmessage: (e: { data: unknown }) => void }; process(input: Float32Array[][]): boolean };
  class Processor { port = { onmessage: () => {}, postMessage: (message: Message) => messages.push(message) }; }
  const source = readFileSync(new URL('../src/worklet.js', import.meta.url), 'utf8').replace(/^import[^\n]*\n/, '');
  runInNewContext(source, { SpeechResampler, sampleRate: 48000, AudioWorkletProcessor: Processor, registerProcessor: (_name: string, ctor: typeof make) => { make = ctor; } });
  return { worklet: new make(), messages };
}
test('a stalled main thread queues at most eight PCM packets, then one overload and stops', () => {
  const { worklet, messages } = fixture(); let active = true;
  for (let i = 0; i < 48000 * 3 / 128; i++) active = worklet.process([[new Float32Array(128)]]);
  assert.equal(active, false);
  assert.equal(messages.filter(m => m.type === 'audio').length, 8);
  assert.equal(messages.filter(m => m.type === 'overload').length, 1);
  assert.ok(messages.reduce((sum, m) => sum + (m.pcm?.byteLength ?? 0), 0) <= 102400);
  worklet.port.onmessage({ data: { type: 'ack', sequence: 0 } });
  assert.equal(worklet.process([[new Float32Array(128)]]), false, 'overload cannot silently resume');
});
test('acknowledged packets keep flowing and finish preserves exact sample count', () => {
  const { worklet, messages } = fixture(); let consumed = 0;
  function ack() {
    while (consumed < messages.length) { const m = messages[consumed++]!; if (m.type === 'audio') worklet.port.onmessage({ data: { type: 'ack', sequence: m.sequence } }); }
  }
  for (let offset = 0; offset < 48000; offset += 128) {
    assert.equal(worklet.process([[new Float32Array(Math.min(128, 48000 - offset))]]), true); ack();
  }
  worklet.port.onmessage({ data: 'finish' }); ack();
  assert.equal(messages.reduce((sum, m) => sum + (m.pcm?.length ?? 0), 0), 16000);
  assert.equal(messages.at(-1)?.type, 'flushed'); assert.ok(!messages.some(m => m.type === 'overload'));
  assert.equal(worklet.process([[new Float32Array(128)]]), false);
});
