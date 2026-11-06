# Модуль: agent-channel

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#agent-channel`.

## Назначение

Канал к агентам Claude и ChatGPT/Codex без собственного чата
(спецификация вехи 2, раздел 9.2). Выбор пользователя, автопилот и другие
указания панели доходят до агента ответом хука `Stop`
(`{"decision":"block","reason":…}` — агент продолжает с этим текстом) или
дополнительным контекстом хука `UserPromptSubmit`.

## Публичный интерфейс (`src/index.ts`)

- `parseHookInput(client, raw, projectDir?) → HookInput | null` — поля
  входа хука (проверено на Claude 2.1.318 и codex-cli 0.166.0):
  `session_id` (у Codex — id треда), `turn_id` (только Codex), `cwd`,
  `transcript_path`, `stop_hook_active`, `last_assistant_message`,
  `prompt`, `session_title` (`sessionTitle`: текущее имя сессии в Claude
  2.1.319, вход `UserPromptSubmit`); `projectDir` — `$CLAUDE_PROJECT_DIR`
  процесса хука.
  `sessionKey(client, sessionId)` — `<client>:<id>`.
- `blockAnswer(reason)`, `contextAnswer(text)` (`hookSpecificOutput.
  additionalContext` события `UserPromptSubmit`).
- `createAgentChannel({ resolveProject, decide?, holdMs?, now?, onChange?,
  log? }) → AgentChannel`:
  - `stop(input, signal?)`: сессия «ждёт»; есть сообщения в очереди —
    ответ `block` со всеми сообщениями (через пустую строку); иначе
    спрашивает решатель (`StopDecider`): `continue` — `block` с его текстом,
    `release` — без ответа, `hold` — держит хук (состояние `holding`,
    `holdReason`, `holdUntil`) до нового сообщения, `wake(key)`, отмены
    запроса (`signal`) или `STOP_HOLD_MS` (9 минут), затем отпускает без
    ответа. Решатель по умолчанию — `release`.
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
- `registerChannelRoutes({ router, state, channel })`:
  `POST /api/hooks/stop` и `POST /api/hooks/prompt` с телом
  `{ client, input, projectDir }` → `{ answer }` (только с loopback,
  иначе 403 `loopback-only`; без `client` или `session_id` — 400
  `bad-hook-input`); доставка подтверждается событием `finish` ответа,
  обрыв соединения — `nack` и конец удержания; раздел `channel`
  (`{ sessions: SessionActivity[] }`) в `/api/state`.

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
