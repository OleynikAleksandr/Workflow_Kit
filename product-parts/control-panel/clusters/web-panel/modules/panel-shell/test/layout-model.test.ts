import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyboardWidth, sidebarWidth, widthRange } from '../src/layout-model.js';

test('the sidebar leaves room for the dialogue at every desktop width', () => {
  for (const viewport of [681, 768, 1024, 1280, 1920]) {
    for (const requested of [-100, 240, 320, 560, 9000]) {
      const width = sidebarWidth(requested, viewport);
      assert.ok(width >= 240 && width <= 560);
      assert.ok(viewport - width - 8 >= 360);
    }
  }
  assert.deepEqual(widthRange(768), { min: 240, max: 400 });
  assert.equal(sidebarWidth(560, 681), 313, 'a smaller window constrains a stored desktop width');
});

test('invalid saved sizes use the default, valid storage strings retain the size', () => {
  for (const value of [null, undefined, '', ' ', 'oops', Infinity, NaN, {}, []]) {
    assert.equal(sidebarWidth(value, 1280), 320);
  }
  assert.equal(sidebarWidth('432', 1280), 432);
  assert.equal(sidebarWidth(432.8, 1280), 433);
  assert.equal(sidebarWidth('9000', 1280), 560);
});

test('keyboard resizing clamps at either edge and unrelated keys are not handled', () => {
  assert.equal(keyboardWidth(320, 'ArrowLeft', 1280), 304);
  assert.equal(keyboardWidth(320, 'ArrowRight', 1280), 336);
  assert.equal(keyboardWidth(320, 'Home', 1280), 240);
  assert.equal(keyboardWidth(320, 'End', 768), 400);
  assert.equal(keyboardWidth(240, 'ArrowLeft', 1280), 240);
  assert.equal(keyboardWidth(560, 'ArrowRight', 1280), 560);
  assert.equal(keyboardWidth(320, 'Enter', 1280), null);
});
