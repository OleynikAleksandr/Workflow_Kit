// M47 T001: Claude 2.1.328 reports a long pasted text in its UserPromptSubmit hook wrapped in
// <pasted_content id="…"> (recorded live on 19.11.2026, below). A direct paste is confirmed by the
// first prompt hook of the session while it is sent and confirmed, whatever the text; outside that
// window and for other reservations the text still decides.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput } from '../src/index.ts';

/** The panel text and the prompt of its hook, recorded from Claude 2.1.328 (bracketed paste, 7 lines). */
const PANEL_TEXT = 'Сделай маленькую утилиту на Node.js без зависимостей: `node wc.mjs <файл>` печатает число строк,\nслов и символов файла. Нужна спецификация и план из трёх задач:\n1) код утилиты;\n2) тест на node:test (пустой файл, файл с кириллицей, отсутствующий файл → код выхода 1);\n3) задача поставки (delivery): `npm pack` и запись имени архива в docs/release.md.\nПеред первой задачей спроси меня через AskUserQuestion, какое имя дать команде: «wc» или «счётчик».\nЭто проверка записи: ничего не делай, ответь одним словом: ок.';
const HOOK_PROMPT = `\n\n<pasted_content id="4ec3">\n${PANEL_TEXT}\n</pasted_content id="4ec3">\n`;
/** A one-line paste arrives unchanged (the same recording). */
const SHORT = 'Ответь одним словом: да.';

const key = 'codex:s';
const hook = (text: string, native: string | null) => parseHookInput('codex', { session_id: 's', cwd: '/p', prompt: text, turn_id: native })!;
function channel(lines: string[]) {
  return createAgentChannel({ resolveProject: async () => ({ id: 'p' }), decide: () => ({ kind: 'release' }), log: (line) => void lines.push(line) });
}
async function waiting(ch: ReturnType<typeof channel>): Promise<void> {
  await ch.prompt(hook('hello', 'n0'));
  await ch.stop(hook('hello', 'n0'));
}

test('the recorded wrapped hook confirms the paste: the turn is the panel message of the user, the log names the lengths only', async () => {
  const lines: string[] = [];
  const ch = channel(lines);
  try {
    await waiting(ch);
    const sent = await ch.directTurn(key, 'p', PANEL_TEXT, async () => {
      setTimeout(() => void ch.prompt(hook(HOOK_PROMPT, 'n1')), 30);
      return true;
    }, 2000);
    assert.equal(sent, true);
    assert.equal(ch.get(key)!.state, 'working');
    const line = lines.find((l) => l.includes('confirmed the pasted message by order'));
    assert.ok(line, lines.join('\n'));
    assert.match(line!, new RegExp(`\\(${HOOK_PROMPT.trim().length} vs ${PANEL_TEXT.length} chars\\)`));
    assert.ok(!line!.includes('утилиту'), 'no text of the user in the log');
    // The hook of the same turn arriving again is a duplicate, not a new turn.
    await ch.prompt(hook(HOOK_PROMPT, 'n1'));
    assert.equal(ch.get(key)!.state, 'working');
  } finally { ch.close(); }
});

test('a hook before the paste answer is taken too, and an equal text is confirmed without a log line', async () => {
  const lines: string[] = [];
  const ch = channel(lines);
  try {
    await waiting(ch);
    const early = await ch.directTurn(key, 'p', PANEL_TEXT, async () => { await ch.prompt(hook(HOOK_PROMPT, 'n1')); return true; }, 2000);
    assert.equal(early, true);
    await ch.stop(hook(HOOK_PROMPT, 'n1'));
    const short = await ch.directTurn(key, 'p', SHORT, async () => { setTimeout(() => void ch.prompt(hook(SHORT, 'n2')), 20); return true; }, 2000);
    assert.equal(short, true);
    assert.equal(lines.filter((l) => l.includes('by order')).length, 1, lines.join('\n'));
  } finally { ch.close(); }
});

test('no hook in the window stays unconfirmed; a later hook of another text is a turn of its own', async () => {
  const lines: string[] = [];
  const ch = channel(lines);
  try {
    await waiting(ch);
    assert.equal(await ch.directTurn(key, 'p', PANEL_TEXT, async () => true, 150), 'unconfirmed');
    assert.equal(ch.get(key)!.state, 'waiting');
    await ch.prompt(hook('typed in the app', 'n3'));
    assert.equal(ch.get(key)!.state, 'working');
    assert.ok(!lines.some((l) => l.includes('by order')), lines.join('\n'));
  } finally { ch.close(); }
});

test('a queued delivery still needs its own text: another prompt is the user\'s turn, the queue stays', async () => {
  const ch = channel([]);
  try {
    await waiting(ch);
    ch.enqueue(key, 'from the queue', 'panel', 'p');
    const answer = await ch.prompt(hook('typed by the user', 'n4'));
    assert.equal(ch.get(key)!.state, 'working');
    assert.ok(answer, 'the prompt hook answers');
  } finally { ch.close(); }
});
