// The text scanner of config.toml: tables by offsets, raw values, and what it refuses.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TomlScanError, scanToml, tomlValue } from '../src/toml-scan.ts';

const brief = (text: string): Array<[string, string, string[]]> => scanToml(text).map((section) => [section.kind, section.name, section.entries.map((entry) => `${entry.key}=${entry.raw}`)]);

test('the root part and the tables are split at header lines', () => {
  const text = ['# top', 'default_model = "a/b" # chosen', '', '[providers.kimi]', 'type = "kimi"', '', '[[hooks]]', 'event = "Stop"', 'timeout = 5', '', '# tail', ''].join('\n');
  assert.deepEqual(brief(text), [
    ['root', '', ['default_model="a/b"']],
    ['table', 'providers.kimi', ['type="kimi"']],
    ['array', 'hooks', ['event="Stop"', 'timeout=5']],
  ]);
  const [root, table, hooks] = scanToml(text);
  assert.equal(text.slice(root!.start, root!.end), '# top\ndefault_model = "a/b" # chosen\n\n');
  assert.equal(text.slice(table!.start, table!.contentEnd), '[providers.kimi]\ntype = "kimi"\n');
  assert.equal(text.slice(hooks!.start, hooks!.contentEnd), '[[hooks]]\nevent = "Stop"\ntimeout = 5\n');
  assert.equal(hooks!.end, text.length);
});

test('brackets inside strings, arrays over lines and multi-line strings are not headers', () => {
  const text = [
    'a = "[[hooks]] # not a comment"',
    "b = '[x]'",
    'list = [',
    '  "[[hooks]]", # a comment with ] inside',
    '  [1, 2],',
    ']',
    'long = """',
    '[[hooks]]',
    'quote \\""" still inside',
    '"""',
    "raw = '''",
    '[table]',
    "'''",
    'inline = { x = "]" }',
    '[real]',
    'k = 1',
  ].join('\n');
  const sections = scanToml(text);
  assert.deepEqual(sections.map((section) => section.name), ['', 'real']);
  assert.deepEqual(sections[0]!.entries.map((entry) => entry.key), ['a', 'b', 'list', 'long', 'raw', 'inline']);
  assert.equal(sections[1]!.contentEnd, text.length);
});

test('CRLF files and a header with a comment are read', () => {
  const text = '[[hooks]] # kit\r\nevent = "Stop"\r\ncommand = \'x\'\r\n';
  assert.deepEqual(brief(text), [['root', '', []], ['array', 'hooks', ['event="Stop"', "command='x'"]]]);
});

test('a text the scanner cannot follow is refused with its line', () => {
  for (const [text, line] of [
    ['a = "open', 1],
    ['ok = 1\n[[hooks]\n', 2],
    ['[x] y = 1', 1],
    ['just words', 1],
    ['a =', 1],
    ['a = [1,\n2', 1],
    ['a = """never', 1],
    ['a = 1]', 1],
  ] as const) {
    assert.throws(() => scanToml(text), (error: unknown) => error instanceof TomlScanError && error.message.includes(`строка ${line}`), text);
  }
});

test('values: strings of every kind and integers; anything else is undefined', () => {
  assert.equal(tomlValue("'C:\\Users\\a'"), 'C:\\Users\\a');
  assert.equal(tomlValue('"\\"C:\\\\Program Files\\\\node.exe\\" \\u0416 \\n"'), '"C:\\Program Files\\node.exe" Ж \n');
  assert.equal(tomlValue('"""\nline "one"\n"""'), 'line "one"\n');
  assert.equal(tomlValue("'''a\\b'''"), 'a\\b');
  assert.equal(tomlValue('30'), 30);
  assert.equal(tomlValue('+7'), 7);
  for (const raw of ['true', '1.5', '[1]', '{ a = 1 }', '2024-01-01']) assert.equal(tomlValue(raw), undefined, raw);
});
