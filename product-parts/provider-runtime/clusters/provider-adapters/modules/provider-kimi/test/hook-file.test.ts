// The Kit blocks inside a config.toml text: status, the file Kit would write and what stays.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kimiHookBlocks, kimiHooksSection } from '#kit-structure';
import type { KimiHookBlock } from '#kit-structure';
import { hookFingerprint, planHookFile } from '../src/hook-file.ts';

function blocksOf(platform: NodeJS.Platform): KimiHookBlock[] {
  const plan = kimiHookBlocks({ platform, node: 'C:\\Program Files\\nodejs\\node.exe', launcher: "C:\\Users\\O'Neil Имя\\AppData\\Local\\Workflow Kit\\wfk.mjs" });
  assert.ok(plan.ok);
  return plan.blocks;
}
const BLOCKS = blocksOf('darwin');
const SECTION = kimiHooksSection(BLOCKS);
const OTHER = ['# my settings', 'default_model = "a/b"', '', '[[hooks]]', 'event = "Stop"', "command = 'python3 log.py' # mine", 'timeout = 5', '', '[providers.x]', 'type = "kimi"', ''].join('\n');

test('no Kit block: pending, the blocks go to the end and the rest stays byte for byte', () => {
  const plan = planHookFile(OTHER, BLOCKS);
  assert.equal(plan.status, 'pending');
  assert.equal(plan.target, `${OTHER}\n${SECTION}`);
  assert.equal(plan.cleaned, OTHER);
  assert.deepEqual(plan.found, []);
  assert.equal(plan.section, SECTION);
});

test('a missing or empty file becomes the Kit blocks alone', () => {
  assert.equal(planHookFile('', BLOCKS).target, SECTION);
  assert.equal(planHookFile('\n\n', BLOCKS).target, SECTION);
  assert.equal(planHookFile('a = 1', BLOCKS).target, `a = 1\n\n${SECTION}`);
});

test('the written file is approved; removing the blocks gives the file back', () => {
  for (const start of [OTHER, '', 'a = 1\n', `${OTHER}\n\n`]) {
    const written = planHookFile(start, BLOCKS).target!;
    const plan = planHookFile(written, BLOCKS);
    assert.equal(plan.status, 'approved');
    assert.equal(plan.target, written);
    assert.equal(plan.cleaned, start);
    assert.deepEqual(plan.found.map((hook) => hook.event), ['SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure', 'Interrupt']);
  }
});

test('Windows blocks (basic strings with escapes) are recognised as written', () => {
  const blocks = blocksOf('win32');
  const written = planHookFile(OTHER, blocks).target!;
  assert.match(written, /command = "\\"C:\\\\Program Files\\\\nodejs\\\\node\.exe\\" \\"C:\\\\Users\\\\O'Neil Имя/);
  assert.equal(planHookFile(written, blocks).status, 'approved');
  // The same file read on another machine: its Kit blocks are not the wanted ones.
  assert.equal(planHookFile(written, BLOCKS).status, 'modified');
});

test('part of the blocks, an edited block or an extra key is modified; the target has fresh blocks once', () => {
  const written = planHookFile(OTHER, BLOCKS).target!;
  const edits: Array<[string, string]> = [
    ['one block removed', written.replace(/\[\[hooks\]\]\nevent = "Interrupt"[^]*$/, '')],
    ['timeout changed', written.replace('timeout = 30', 'timeout = 31')],
    ['extra key', written.replace('event = "StopFailure"', 'event = "StopFailure"\nmatcher = "x"')],
    ['event changed', written.replace('event = "StopFailure"', 'event = "Stop"')],
    ['a sixth block', `${written}\n[[hooks]]\nevent = "Stop"\ncommand = '"$HOME/.local/bin/wfk" hook turn-end --client kimi'\n`],
  ];
  // The marker comment is for the reader: the blocks count without it.
  assert.equal(planHookFile(written.replace('# Workflow Kit\n', ''), BLOCKS).status, 'approved');
  for (const [name, text] of edits) {
    const plan = planHookFile(text, BLOCKS);
    assert.equal(plan.status, 'modified', name);
    assert.equal(planHookFile(plan.target!, BLOCKS).status, 'approved', name);
    assert.equal(plan.target!.split('--client kimi').length - 1, 5, name);
    assert.ok(plan.target!.includes("command = 'python3 log.py' # mine"), name);
  }
});

test('a Kit block in the middle is cut out with its blank lines; comments of the neighbours stay', () => {
  const kit = "[[hooks]]\nevent = \"Stop\"\ncommand = '\"$HOME/.local/bin/wfk\" hook turn-end --client kimi'\ntimeout = 30\n";
  const text = `a = 1\n\n${kit}\n# about the next table\n[next]\nb = 2\n`;
  const plan = planHookFile(text, BLOCKS);
  assert.equal(plan.status, 'modified');
  assert.equal(plan.cleaned, 'a = 1\n\n# about the next table\n[next]\nb = 2\n');
  assert.equal(plan.target, `${plan.cleaned}\n${SECTION}`);
});

test('a CRLF file gets CRLF blocks and is approved afterwards', () => {
  const text = 'a = 1\r\n\r\n[t]\r\nb = 2\r\n';
  const plan = planHookFile(text, BLOCKS);
  assert.equal(plan.section, kimiHooksSection(BLOCKS, '\r\n'));
  assert.equal(plan.target, `${text}\r\n${plan.section}`);
  assert.ok(!plan.target!.replace(/\r\n/g, '').includes('\n'));
  const after = planHookFile(plan.target!, BLOCKS);
  assert.deepEqual([after.status, after.cleaned], ['approved', text]);
});

test('hooks written another way or a broken file: unknown, nothing to write, the text to paste is kept', () => {
  for (const [text, reason] of [
    ['hooks = [{ event = "Stop", command = "x" }]\n', 'массивом'],
    ['[hooks]\nx = 1\n', 'таблицей'],
    ['[hooks.stop]\nx = 1\n', 'таблицей'],
    ['a = "open\n', 'не разбирается'],
  ] as const) {
    const plan = planHookFile(text, BLOCKS);
    assert.deepEqual([plan.status, plan.target, plan.cleaned], ['unknown', null, null], text);
    assert.ok(plan.reason?.includes(reason), `${text}: ${plan.reason}`);
    assert.equal(plan.section, SECTION);
  }
});

test('the fingerprint covers the current file and the target', () => {
  const target = planHookFile(OTHER, BLOCKS).target!;
  const hash = hookFingerprint(OTHER, target);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, hookFingerprint(`${OTHER} `, target));
  assert.notEqual(hash, hookFingerprint(OTHER, `${target} `));
  assert.notEqual(hookFingerprint('ab', 'c'), hookFingerprint('a', 'bc'));
});
