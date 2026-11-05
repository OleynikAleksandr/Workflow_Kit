import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PROJECT_NAME_LENGTH, checkProjectName, isInside, samePath } from '../src/index.ts';

function rejected(name: unknown): boolean {
  return !checkProjectName(name).ok;
}

test('valid names are trimmed and normalized to NFC', () => {
  assert.deepEqual(checkProjectName('  my-app '), { ok: true, name: 'my-app' });
  assert.deepEqual(checkProjectName('Проект 1'), { ok: true, name: 'Проект 1' });
  const decomposed = 'Cafe\u0301';
  const result = checkProjectName(decomposed);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.name, 'Caf\u00e9');
  assert.ok(checkProjectName('.config-like').ok);
  assert.ok(checkProjectName('a.b').ok);
});

test('separators, "..", leading dash and bad characters are rejected', () => {
  for (const name of ['a/b', 'a\\b', '..', '.', 'a..b', '../x', '-rf', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b', 'tab\there', 'dot.']) {
    assert.ok(rejected(name), name);
  }
  assert.ok(rejected(''));
  assert.ok(rejected('   '));
  assert.ok(rejected(42));
  assert.ok(rejected('x'.repeat(MAX_PROJECT_NAME_LENGTH + 1)));
  assert.ok(checkProjectName('я'.repeat(MAX_PROJECT_NAME_LENGTH)).ok);
});

test('Windows reserved names are rejected in any case and with extensions', () => {
  for (const name of ['CON', 'con', 'Prn', 'AUX', 'nul', 'COM1', 'com9', 'LPT1', 'lpt¹', 'NUL.txt', 'con.tar.gz', 'CONIN$']) {
    assert.ok(rejected(name), name);
  }
  for (const name of ['console', 'COM', 'LPT10', 'auxiliary', 'nullable']) assert.ok(checkProjectName(name).ok, name);
});

test('isInside compares real paths, case-insensitively on Windows only', () => {
  assert.equal(isInside('/home/u/a', '/home/u', 'linux'), true);
  assert.equal(isInside('/home/u', '/home/u', 'linux'), false);
  assert.equal(isInside('/home/u', '/home/u', 'linux', true), true);
  assert.equal(isInside('/home/user2/a', '/home/u', 'linux'), false);
  assert.equal(isInside('/home/U/a', '/home/u', 'linux'), false);
  assert.equal(isInside('/home/u/../v', '/home/u', 'linux'), false);
  assert.equal(isInside('C:\\Users\\Me\\Proj', 'c:\\users\\me', 'win32'), true);
  assert.equal(isInside('C:\\USERS\\ME', 'c:\\users\\me', 'win32'), false);
  assert.equal(isInside('C:\\Users\\Me2\\x', 'C:\\Users\\Me', 'win32'), false);
  assert.equal(isInside('D:\\Users\\Me\\x', 'C:\\Users\\Me', 'win32'), false);
  assert.equal(samePath('C:\\Users\\Me\\A', 'c:\\users\\me\\a', 'win32'), true);
  assert.equal(samePath('/a/B', '/a/b', 'darwin'), false);
});
