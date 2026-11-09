# Модуль: agent-channel

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#agent-channel`.

## Назначение

Канал к агентам Claude и ChatGPT/Codex без собственного чата
(спецификация вехи 2, раздел 9.2). Выбор пользователя, автопилот и другие
указания панели доходят до агента ответом хука `Stop`
(`{"decision":"block","reason":…}` — агент продолжает с этим текстом) или
дополнительным контекстом хука `UserPromptSubmit`.

## Публичный интерфейс (`src/index.ts`)

- `parseHookInput(client, raw, projectDir?, dialects?) → HookInput | null` —
  `client` (`AgentClient`) — id провайдера; `dialects` (`HookDialects`:
  `(client) → HookDialect | undefined`) строит служба по реестру провайдеров
  (`Provider.hookDialect`, нет поля — `claude`), неизвестный клиент — `null`;
  без `dialects` годится любой id вида `[a-z][a-z0-9-]*` с диалектом `claude`.
  `HookInput.dialect` — формат входа и ответов клиента. Поля
  входа хука (проверено на Claude 2.1.318 и codex-cli 0.166.0):
  `session_id` (у Codex — id треда), `turn_id` (только Codex), `cwd`,
  `transcript_path`, `stop_hook_active`, `last_assistant_message`,
  `prompt`, `session_title` (`sessionTitle`: текущее имя сессии в Claude
  2.1.319, вход `UserPromptSubmit`); `projectDir` — `$CLAUDE_PROJECT_DIR`
  процесса хука. `prompt` массивом частей (Kimi Code 2.5.2:
  `[{ type: 'text', text }]`) читается как тексты частей через перевод строки.
  `sessionKey(client, sessionId)` — `<client>:<id>`.
- `blockAnswer(reason)`, `contextAnswer(text)` (`hookSpecificOutput.
  additionalContext` события `UserPromptSubmit`), `messageAnswer(text)`
  (`{ message }` диалекта `kimi`), `promptAnswer(dialect, text)` — ответ
  `UserPromptSubmit` в диалекте клиента (им отвечает `prompt` канала).
- `createAgentChannel({ resolveProject, decide?, holdMs?, now?, onChange?,
  log? }) → AgentChannel`:
  - `stop(input, signal?)`: сессия «ждёт»; есть сообщения в очереди —
    ответ `block` со всеми сообщениями (через пустую строку); иначе
    спрашивает решатель (`StopDecider`): `continue` — `block` с его текстом,
    `release` — без ответа, `hold` — держит хук (состояние `holding`,
    `holdReason`, `holdUntil`) до нового сообщения, `wake(key)`, отмены
    запроса (`signal`) или `STOP_HOLD_MS` (9 минут), затем отпускает без
    ответа; `hold` с `timeoutAnswer` по истечении срока отвечает `block` с
    этим текстом (напоминание, ход `reminder`; M4, раздел 4). Решатель по
    умолчанию — `release`.
  - `onStop(listener) → отписка`: каждый `Stop` до решателя — `StopEvent`
    (`key`, `client`, `sessionId`, `projectId`, полное
    `lastAssistantMessage`, `origin` — чем начат закончившийся ход:
    `delivery` (сообщения очереди ответом `Stop`, `sources` — их источники),
    `decider` (`continue`), `reminder`, `user` (`UserPromptSubmit`),
    `unknown`); ошибка слушателя — строка в журнале.
  - `prompt(input)`: сессия «работает» (`turnStartedAt`); сообщения,
    пропустившие `Stop`, уходят дополнительным контекстом.
  - Ответ — `HookReply` (`answer`, `ack()`, `nack()`): сообщения уходят из
    очереди только после `ack` (ответ отправлен); `nack` возвращает их в
    начало очереди. Повторной доставки нет.
  - `enqueue(key, text, source?)`, `wake(key)`, `setDecider(fn)`,
    `get(key)`, `list()`, `queued(key)`, `section()`, `close()` (отпускает
    все удержанные хуки).
- `SessionActivity`: `key`, `client`, `sessionId`, `projectId`, `state`
  (`working` | `waiting` | `holding`), `since`, `turnStartedAt`,
  `lastStopAt`, `lastAssistantMessage` (до 400 знаков), `pending`,
  `holdReason`, `holdUntil`.
- `registerChannelRoutes({ router, state, channel, dialects? })`:
  `POST /api/hooks/stop` и `POST /api/hooks/prompt` с телом
  `{ client, input, projectDir }` → `{ answer }` (только с loopback,
  иначе 403 `loopback-only`; клиент, которого нет в `dialects`, или вход без
  `session_id` — 400 `bad-hook-input`); доставка подтверждается событием `finish` ответа,
  обрыв соединения — `nack` и конец удержания; раздел `channel`
  (`{ sessions: SessionActivity[] }`) в `/api/state`.
  Опция `messages` — канал для сообщений панели (служба передаёт канал,
  который ещё и будит ожидающую сессию Claude).
- `POST /api/projects/:id/sessions/:sid/message { text }` → `{ queued }`:
  сообщение панели в очередь сессии (`queueSessionMessage`). Текст
  обрезается по краям, пустой — 400 `empty-message`, длиннее
  `MESSAGE_MAX_CHARS` (4000) — 400 `message-too-long`; сессия, неизвестная
  каналу или чужого проекта, — 404 `unknown-session`.
  Опция `owns(projectId, key)`: сессия, которую канал после перезапуска
  службы ещё не видел, принимает сообщение, если провайдер числит её за
  проектом; `enqueue(key, text, source, projectId)` записывает проект в
  новую запись канала, чтобы служба могла поднять и разбудить сессию (R9).

## Инварианты

- Одно сообщение доставляется один раз; неотправленный ответ возвращает
  сообщения в очередь.
- Повтор `Stop` с `stop_hook_active` без новых сообщений не зацикливает:
  решатель по умолчанию отпускает агента; продолжение решает только
  автопилот (со своими лимитами).
- Очередь и активность живут в памяти службы; перезапуск службы их
  сбрасывает.

## Зависимости

`#http-server` (`HttpError`, `classifyAddress`, типы реестров).
