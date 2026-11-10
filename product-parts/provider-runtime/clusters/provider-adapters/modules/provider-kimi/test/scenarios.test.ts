// Scenarios of spec M8 section 7 on the whole chain (scenario-world.ts): the autopilot continues a
// Kimi session twice in a row, and a plan of Kimi goes through a full review round with ChatGPT.
// Since M10 a Kimi session may orchestrate: the start carries the Kimi executor procedure.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { sessionKey } from '#agent-channel';
import { EXECUTOR_HOWTO } from '#autopilot';
import { PLAN_REQUEST } from '#cross-review';
import { PLAN, withScenario } from './scenario-world.ts';

const ONLY_SEQUENTIAL = /Sessions of this app \(kimi\) run a scope only sequentially: orchestration is not started from here/;
const PROPOSE = ['--recommended', 'sequential', '--reason', 'Одна небольшая задача, параллелить нечего'];

test('the autopilot runs a plan in a Kimi session: two continuations in a row, a subagent Stop delivers nothing', async () => {
  await withScenario(async (world) => {
    const { app, projectId } = world;
    const session = world.session('План');
    const key = sessionKey('kimi', session.id);
    const hold = (): string | null | undefined => app.channel.get(key)?.holdReason;
    await app.review.set(projectId, key, false);

    // The user asks for a plan; the turn that proposed it waits for the choice of the mode.
    await world.turn(session, 'Напиши спецификацию и предложи план', 'План предложен.', async () => {
      await world.kit('scope:propose', '--input', await world.input('plan.json', PLAN), ...PROPOSE);
    });
    await world.until(() => hold() === 'waiting-for-mode-choice', 'the proposing session waits for the mode');
    assert.equal(app.autopilot.get(key)?.origin, 'user');
    assert.deepEqual(world.sent(), [], 'nothing is sent while the user decides');

    // The choice of the panel goes as a prompt; since M10 nothing forbids subagents to Kimi.
    await app.autopilot.choose(projectId, { session: key, generation: 1, option: 'sequential' });
    const chosen = await world.prompts(1);
    assert.match(chosen.text, /execution mode chosen: sequential/);
    assert.doesNotMatch(chosen.text, ONLY_SEQUENTIAL);
    await world.turn(session, chosen.text, 'План создан, жду запуска.');
    await world.until(() => hold() === 'waiting-for-plan-start', 'the plan waits for the start button');
    assert.equal(app.autopilot.get(key)?.origin, 'kit', 'the prompt of the service is not a turn of the user');

    await app.autopilot.start(projectId);
    const started = await world.prompts(2);
    assert.match(started.text, /Execution mode: sequential/);
    assert.doesNotMatch(started.text, ONLY_SEQUENTIAL);

    // QUALITY; a subagent of Kimi ends in the middle of the turn: its Stop sends nothing.
    await world.turn(session, started.text, 'Проверки выбраны.', async () => {
      await world.kit('task:start', 'QUALITY');
      const checks = { stacks: ['node'], checks: [{ id: 'noop', role: 'custom', stage: 'commit', required: true, command: { executable: 'true', args: [] } }] };
      await world.kit('quality:apply', '--input', await world.input('quality.json', checks));
      await world.subagentStop(session);
      await new Promise((resolve) => setTimeout(resolve, 1300)); // More than one look of the watcher at the lock.
      assert.equal(world.sent().length, 2, 'the Stop of a subagent delivers nothing while the turn runs');
      assert.equal(app.channel.get(key)?.state, 'working');
    });
    const first = await world.prompts(3);
    assert.match(first.text, /autopilot\. Continue the workflow: run `scripts\/workflow task:start T001`/);

    // The first continuation is done; the second follows without the user.
    await world.turn(session, first.text, 'T001 готова.', async () => {
      await world.kit('task:start', 'T001');
      await mkdir(path.join(world.root, 'src'), { recursive: true });
      await writeFile(path.join(world.root, 'src', 'a.txt'), 'a\n');
      await world.kit('commit', '--task', 'T001');
    });
    const second = await world.prompts(4);
    assert.match(second.text, /autopilot\. Continue the workflow: run `scripts\/workflow task:start DOCS-R1`/);
    assert.equal(app.autopilot.get(key)?.continues, 2, 'two continuations in a row');

    await world.turn(session, second.text, 'Документы сведены.', async () => {
      await world.kit('task:start', 'DOCS-R1');
      const digest = { result: 'Файл добавлен', decisions: [], contracts: [], references: ['docs/spec.md'] };
      await world.kit('commit', '--task', 'DOCS-R1', '--digest', await world.input('digest.json', digest));
    });
    await world.until(() => app.autopilot.get(key)?.last?.reason === 'ready-for-acceptance', 'the plan waits for the acceptance');
    assert.equal(hold(), 'ready-for-acceptance');

    const sent = world.sent();
    assert.equal(sent.length, 4, 'four prompts in all: the choice, the start and two continuations');
    assert.ok(sent.every((prompt) => prompt.sessionId === session.id && /^kit-[0-9a-f-]{36}$/.test(prompt.id)), 'every prompt has the id of its delivery');
    assert.equal(new Set(sent.map((prompt) => prompt.id)).size, 4);
    assert.equal(app.channel.get(key)?.note ?? null, null, 'the session lock was seen at every Stop');
  });
});

test('a Kimi session orchestrates (spec M10): the orchestrated choice and start reach it with the Kimi executor procedure', async () => {
  await withScenario(async (world) => {
    const { app, projectId } = world;
    const session = world.session('Параллельно');
    const key = sessionKey('kimi', session.id);
    const hold = (): string | null | undefined => app.channel.get(key)?.holdReason;
    await app.review.set(projectId, key, false);
    const plan = {
      ...PLAN,
      tasks: [
        { id: 'T001', title: 'Файл A', commitMessage: 'feat: add a', acceptance: ['a'], files: ['src/a.txt'], parallelSafe: true },
        { id: 'T002', title: 'Файл B', commitMessage: 'feat: add b', acceptance: ['b'], files: ['src/b.txt'], parallelSafe: true },
      ],
    };
    await world.turn(session, 'Напиши спецификацию и предложи план', 'План предложен.', async () => {
      await world.kit('scope:propose', '--input', await world.input('plan.json', plan), '--recommended', 'orchestrated', '--reason', 'Две независимые задачи');
    });
    await world.until(() => hold() === 'waiting-for-mode-choice', 'the proposing session waits for the mode');

    await app.autopilot.choose(projectId, { session: key, generation: 1, option: 'orchestrated' });
    const chosen = await world.prompts(1);
    assert.match(chosen.text, /execution mode chosen: orchestrated/);
    assert.doesNotMatch(chosen.text, ONLY_SEQUENTIAL);
    await world.turn(session, chosen.text, 'План создан, жду запуска.');
    await world.until(() => hold() === 'waiting-for-plan-start', 'the plan waits for the start button');

    await app.autopilot.start(projectId);
    const started = await world.prompts(2);
    assert.match(started.text, /Execution mode: orchestrated/);
    assert.ok(started.text.includes(EXECUTOR_HOWTO['kimi']!.text), 'the start carries the Kimi executor procedure');
  });
});

test('a plan of Kimi is reviewed by ChatGPT: Kimi → ChatGPT → Kimi until both agree', async () => {
  await withScenario(async (world) => {
    const { app, projectId } = world;
    // The folder already has a workspace on the Kimi server; the session lives in a second one.
    world.setup.workspace(world.root);
    const session = world.session('План с ревью');
    const key = sessionKey('kimi', session.id);
    const hold = (): string | null | undefined => app.channel.get(key)?.holdReason;
    const review = async (): Promise<Record<string, unknown>> => {
      const answer = await world.api(`/api/projects/${projectId}/reviews/${encodeURIComponent(key)}`);
      assert.equal(answer.status, 200);
      return (answer.body['review'] ?? answer.body) as Record<string, unknown>;
    };
    await app.review.set(projectId, key, true);

    // The proposing turn is continued: Kimi describes the plan for the reviewer.
    await world.turn(session, 'Напиши спецификацию и предложи план', 'План предложен.', async () => {
      await world.kit('scope:propose', '--input', await world.input('plan.json', PLAN), ...PROPOSE);
    });
    const request = await world.prompts(1);
    assert.equal(request.text, PLAN_REQUEST);
    const description = 'Спецификация: docs/spec.md. Задача T001 «Файл»: src/a.txt, критерий «a». Режим: sequential.';
    await world.turn(session, request.text, description);

    // The service creates the ChatGPT session with the brief; the Kimi session waits.
    await world.until(() => world.reviewerSessions.length === 1, 'the reviewer session is created');
    const reviewer = world.reviewerSessions[0]!;
    assert.match(reviewer.firstMessage ?? '', /Ты — ревьюер плана в проекте «app»/);
    assert.match(reviewer.firstMessage ?? '', /Основной агент — Kimi, сессия/);
    assert.ok(reviewer.firstMessage!.includes(description), 'the brief carries the plan as Kimi described it');
    await world.until(() => hold() === 'waiting-for-review', 'Kimi waits for the reviewer');
    assert.equal(world.sent().length, 1);

    // Round 1: the remarks of ChatGPT reach Kimi as a prompt; its Stop is held meanwhile.
    const codex = { session_id: reviewer.id, hook_event_name: 'Stop' };
    await world.hook('codex', 'prompt', { session_id: reviewer.id, hook_event_name: 'UserPromptSubmit', prompt: reviewer.firstMessage });
    const remarks = '1. У задачи T001 нет проверяемого критерия приёмки.\nREVIEW: CHANGES';
    const firstStop = world.hook('codex', 'stop', { ...codex, stop_hook_active: false, last_assistant_message: remarks });
    const round1 = await world.prompts(2);
    assert.match(round1.text, /ревью плана, ревьюер — ChatGPT, круг 1 из 5/);
    assert.ok(round1.text.includes(remarks));
    const fixed = 'Исправил: критерий T001 — «файл src/a.txt существует и содержит строку a».';
    await world.turn(session, round1.text, fixed);

    // The answer of Kimi continues the held turn of ChatGPT.
    const forwarded = JSON.parse(await firstStop) as { decision: string; reason: string };
    assert.equal(forwarded.decision, 'block');
    assert.match(forwarded.reason, /ответ основного агента \(Kimi\) на круг 1 из 5/);
    assert.ok(forwarded.reason.includes(fixed));
    assert.equal((await review())['status'], 'reviewing');

    // Round 2: ChatGPT approves, Kimi agrees.
    const approval = 'Замечаний больше нет.\nREVIEW: APPROVED';
    const secondStop = world.hook('codex', 'stop', { ...codex, stop_hook_active: true, last_assistant_message: approval });
    const round2 = await world.prompts(3);
    assert.match(round2.text, /круг 2 из 5/);
    assert.ok(round2.text.includes(approval));
    await world.turn(session, round2.text, 'Согласен с оценкой.\nREVIEW: AGREED');

    const finished = JSON.parse(await secondStop) as { decision: string; reason: string };
    assert.match(finished.reason, /ревью закончено — основной агент согласен/);
    const done = await review();
    assert.deepEqual([done['status'], done['round'], done['reviewerKey']], ['agreed', 2, `codex:${reviewer.id}`]);
    assert.equal(await world.hook('codex', 'stop', { ...codex, stop_hook_active: true, last_assistant_message: 'Принято.' }), '', 'the reviewer is let go');

    // The review is over: the plan of Kimi waits for the choice of the mode, nothing more is sent.
    await world.until(() => hold() === 'waiting-for-mode-choice', 'the mode choice is back');
    assert.equal(world.sent().length, 3, 'three prompts in all: the plan request and two rounds');
    assert.equal(app.channel.get(key)?.note ?? null, null);
  });
});
