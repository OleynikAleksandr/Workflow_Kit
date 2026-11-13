import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionParameters } from '#provider-registry';
import { effortChoice, effortOptions } from '../src/effort-model.js';
test('slider orders only model-supported choices and does not fabricate unavailable levels', () => {
  const data = { items: [{ id: 'effort', options: [{ value: 'max', label: 'Max' }, { value: 'low', label: 'Low' }, { value: 'high', label: 'High', disabled: true }] }] } as SessionParameters;
  const options = effortOptions(data);
  assert.deepEqual(options.map(o => o.value), ['low', 'high', 'max']);
  assert.equal(effortChoice(0, options)?.value, 'low');
  for (const index of [-1, 1, 3, 0.5, 'bogus']) assert.equal(effortChoice(index, options), null);
  assert.equal(effortChoice(2, options)?.value, 'max');
  assert.deepEqual(effortOptions(null), []);
});
