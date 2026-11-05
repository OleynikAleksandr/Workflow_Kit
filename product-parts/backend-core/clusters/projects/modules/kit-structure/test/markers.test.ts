import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findKitHook, findMarkedSection, isKitHookCommand, normalizeHook, withKitHook } from '../src/index.ts';

test('findMarkedSection finds one section and ignores Harness markers', () => {
  const text = '<!-- workflow-kit:begin -->\nH\n<!-- workflow-kit:end -->\n<!-- wfk:begin -->\r\nA\r\nB\n<!-- wfk:end -->\n';
  const section = findMarkedSection(text, '<!-- wfk:begin -->', '<!-- wfk:end -->');
  assert.equal(section.kind, 'found');
  if (section.kind === 'found') {
    assert.equal(section.body, 'A\nB\n');
    assert.equal(text.slice(section.end), '\n');
  }
  assert.deepEqual(findMarkedSection('plain', '<!-- wfk:begin -->', '<!-- wfk:end -->'), { kind: 'none' });
  assert.equal(findMarkedSection('<!-- wfk:end -->\n<!-- wfk:begin -->', '<!-- wfk:begin -->', '<!-- wfk:end -->').kind, 'broken');
  assert.equal(findMarkedSection('<!-- wfk:begin --><!-- wfk:begin --><!-- wfk:end -->', '<!-- wfk:begin -->', '<!-- wfk:end -->').kind, 'broken');
});

test('the Kit hook is found by its command and replaced in place', () => {
  assert.equal(isKitHookCommand('"$HOME/.local/bin/wfk" hook session-start --client claude'), true);
  assert.equal(isKitHookCommand('scripts/workflow recover'), false);
  const config: { hooks: { SessionStart: Array<{ hooks: Array<Record<string, unknown>> }> } } = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: 'other' }] },
        { hooks: [{ type: 'command', command: '"$HOME/.local/bin/wfk" hook session-start --client codex', timeout: 5 }] },
      ],
    },
  };
  const lookup = findKitHook(config);
  assert.equal(lookup.kind, 'found');
  if (lookup.kind === 'found') assert.deepEqual([lookup.group, lookup.index], [1, 0]);
  const updated = withKitHook(config, 'codex') as typeof config;
  assert.equal(updated.hooks.SessionStart.length, 2);
  assert.equal(updated.hooks.SessionStart[0]?.hooks[0]?.command, 'other');
  assert.equal(config.hooks.SessionStart[1]?.hooks[0]?.timeout, 5, 'the input is not mutated');
  assert.equal(normalizeHook({ type: 'command', command: 'x' }), normalizeHook({ command: 'x', type: 'command' }));
  assert.throws(() => findKitHook([]), /JSON object/);
});
