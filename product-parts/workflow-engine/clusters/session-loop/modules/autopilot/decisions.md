# Модуль autopilot: решения пользователя операциями хоста (M40 T005)

Часть контракта [модуля autopilot](module.md). Спецификация —
[M40](../../../../../../docs/planning/M40-user-decisions.md), раздел 2.2; точный контракт —
[контракт решений](../../../../../../docs/planning/M40-user-decisions-contract.md), разделы 3–5.

В проекте с `decisions: host` (Kit 2.4.0+) решение пользователя записывает в Kit только служба —
операцией хоста с одноразовым билетом. Агент решение не передаёт: его ручная форма команды
(`accept --note`, `task:start --confirmed`, `scope:choose --note`) отклоняется Kit кодом
`USER_DECISION_REQUIRED` и лишь регистрирует **запрос решения**. Проект в режиме `agent` и
проект на Kit 2.3.x работают по-прежнему: служба вызывает прежние формы.

## Источники решения

| Источник | Откуда | Примечание решения |
| --- | --- | --- |
| `button` | кнопка карточки панели; маршруты плана и `POST /api/projects/:id/workflow/decision` | слова из запроса (3 символа и больше), иначе «Решение пользователя в панели Workflow Kit» |
| `message` | `wfk decision <kind>` сессии | текст доставленного сообщения пользователя, которым начат текущий ход сессии (до 500 символов) |
| `grant` | действие запуска автопилота (автоматический выбор режима) | текст действия запуска, иначе «Автоматически, по предварительному поручению запуска `<runId>`» |

Источник `message` берётся из канала агента (`AgentChannel.userSource(key)`,
[agent-channel](../agent-channel/module.md)): нет доставленного сообщения пользователя, начавшего
текущее поколение хода, — отказ `decision-source-missing` без обращения к Kit и без записи.
Одно сообщение — одно решение: то же сообщение для другого вида или цели — `decision-source-used`.
Агент слов не передаёт: у `wfk decision` нет параметра для цитаты.

## Сервис решений (`src/decisions.ts`)

`createDecisions({ runner, tickets, journal, userSource, runLive?, now?, log? }) → Decisions`:

- `mode(root) → 'host' | 'agent'` — по `status.decisionsMode` Kit проекта; нет Kit, нет поля
  (Kit 2.3.x) или `agent` — `agent`.
- `apply(root, projectId, ask) → DecisionDone | null`. `ask` (`DecisionAsk`): `kind`, `origin`
  (`DecisionOrigin`: `button` с `requestId` и сессией, `message` с ключом сессии, `grant` с
  `runId`), `note`, `expected` (id и дайджест запроса, который показала карточка), `taskId`
  (`confirm-delivery`), `scopeId` (`close`), `choice` (`choose`: поколение, вариант, сессия,
  дайджест предложения). `null` — проект в режиме `agent`: вызывающий использует прежнюю форму.
  Порядок:
  1. источник: сообщение пользователя для `message`; для `grant` — `runLive(root, runId)`: запуск
     на паузе, остановлен, отозван или завершён — отказ `run-not-live` до обращения к Kit;
  2. запись `issued` той же команды (потерянный ответ, перезапуск службы) сверяется с Kit: операция
     повторяется с тем же `decisionId`, Kit применяет его не больше одного раза;
  3. повтор: та же карточка (`expected.id` уже применён), та же команда того же сообщения или
     запуска — сохранённый результат с `already: true`, Kit не вызывается;
  4. запрос: ручная форма команды без слов агента (`accept`, `close --scope`, `task:unblock`,
     `commits:adopt`, `task:start <ID>`, `scope:choose --generation --option --session
     [--expected-digest]`) — ожидаемый отказ `USER_DECISION_REQUIRED` с `details.decision`; для
     `approve-install` запрос берётся из `status.decisions` (его регистрирует `quality:apply`
     агента). Kit выполнил команду сам (delivery под живым разрешением) — `decisionId: null`;
  5. `expected` с другим id или дайджестом — `DECISION_STALE` без записи;
  6. запись `issued` в журнал решений, затем операция хоста `<команда> --decision <id> --source
     button|message|grant --note <текст> --expected-revision N [--message-id] [--decision-session]
     [--autopilot-run]` через `runner.runHost` с билетом. Привязка билета повторяет `HostRequest`
     ядра: `operation`, `decisionId`, `expectedRevision`, корень (`realRoot`), `scopeId` запроса
     (`"NONE"` до scope), `ownerSession` из разрешения scope, `runId` (только `grant`),
     `inputDigest = hostInputDigest({ decision: <дайджест запроса>, note, source })`;
  7. `REVISION_MISMATCH` — до трёх попыток со свежей ревизией и новым билетом (перед каждой для
     `grant` снова `runLive`); отказ Kit — запись `failed` (`DECISION_STALE` — с текстом «обновите
     панель»); нет ответа Kit (`KIT_TIMEOUT`, `KIT_OUTPUT`, `KIT_SPAWN`) — запись остаётся `issued`.
- `originOf(session, by)` и `DecisionBy` (`message`, `expected`, `requestId`, `taskId`) — как
  действие панели или `wfk decision` называет решение; `runMayDecide(journal)` — `runLive` по
  журналу запусков (не финальная фаза, не `paused`, не `blocked`, нет отзыва). `DECISION_TEXTS`,
  `DECISION_NOTE_MAX` (500).

## Журнал решений (`src/decision-journal.ts`)

`createDecisionJournal({ now?, platform? })`: `.workflow-kit/local/decisions.json` проекта (вне
git, атомарная запись, права 0600), `{ version: 1, records }`, последние `DECISIONS_KEPT` (200).
Запись `DecisionRecord`: `key` (sha256 проекта, вида, цели, `inputDigest` запроса и источника
`message:<id>` | `button:<id нажатия>` | `grant:<runId>`), `decisionId`, `kind`, `scopeId`, `taskId`,
`inputDigest`, `sourceId`, `source`, `note`, `args` (команда без флагов хоста), `state`
(`issued` | `applied` | `failed`), `result`, `error`, `at`, `updatedAt`. Одному ключу — один
`decisionId`; `put` заменяет запись с тем же ключом.

## Кнопки плана (`src/autopilot.ts`, `src/acceptance.ts`, `src/routes.ts`)

Маршруты `…/workflow/choose|accept|close|confirm-delivery` принимают необязательные `decision:
{ id, inputDigest }` (запрос, показанный карточкой) и `requestId` (`decisionBy`). Опция автопилота
`decisions` включает операции хоста; без неё и в режиме `agent` — прежние формы Kit 2.3.

- `accept`, `close` → `PlanEndResult { text, decision }`: решение `accept`/`close`; отказ
  `DIRTY_TREE` закрытия называет файлы по-русски, как раньше.
- `choose`: решение `choose` с поколением и дайджестом предложения; выбор запуска
  (`ChooseRequest.automatic`) идёт с источником `grant`. Ответ получает `text` — что сказано сессии.
- `confirmDelivery`: служба сама стартует задачу (`task:start <ID> --decision …`) и только потом
  пишет агенту `deliveryStartedMessage` («задача начата, выполните её», без `--confirmed`); ответ —
  `started: true`. В режиме `agent` — прежнее `deliveryMessage` со словами пользователя.
- Повтор (`already`, вторая кнопка той же карточки, уже начатая задача) второго сообщения агенту не
  шлёт. Сессия, вызвавшая `wfk decision`, читает ответ команды, а не сообщение из очереди.
- Приёмка и закрытие запуска автопилота остаются `accept|close --autopilot-run` (Kit сам пишет
  источник `grant`); перед билетом `run-complete` снова читает запуск (`runMayDecide`).

## `wfk decision` и карточки (`src/decision-commands.ts`)

`createDecisionCommands({ autopilot, decisions, workflow, projectPath, tell })`: `run(projectId,
{ kind, taskId?, option?, session?, by }) → DecisionAnswer { kind, decisionId, already, text }`.
Проект не в режиме `host` — отказ `decisions-agent-mode`. `accept`, `close`, `choose` (поколение —
из свежего предложения; нет предложения — `no-proposal`), `confirm-delivery` (`--task` другой
задачи — `task-mismatch`) идут через действия автопилота; `unblock`, `approve-install`,
`adopt-commits` — прямо через сервис решений; по кнопке панели названная сессия получает
сообщение `DECISION_DONE`.

`registerDecisionRoutes({ router, commands, locate, mutex? })`:

- `POST /api/sessions/decision { kind, task?, option?, cwd, projectDir, client?, sessionId? }` —
  только с этого компьютера (`loopback-only`); сессию находит `locate`, как `wfk session plan`;
  источник — сообщение пользователя текущего хода этой сессии.
- `POST /api/projects/:id/workflow/decision { kind, decision: { id, inputDigest }, requestId,
  session? }` — кнопка карточки решения.

Действия одного проекта идут по очереди (`mutex`, ключ `project:<id>`).

## Сообщение, зарегистрировавшее запуск (M40 T007)

Опция `sourceTaken(root, messageId) → Promise<boolean>`: сообщение пользователя, которым
`wfk session plan` зарегистрировал запуск полного автопилота (`request.turnId` запуска
`user-command` в журнале запусков), источником решения не становится — отказ
`decision-source-used` до обращения к Kit (контракт, раздел 5: исходное сообщение служит
только регистрации запуска). Кнопка — не сообщение и решает как прежде.

## Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Сервис решений, ключи, дайджесты | общий Node-код: JSON и sha256 | то же | то же, x64 и ARM64 |
| Журнал решений | `.workflow-kit/local/decisions.json`, атомарная запись | то же | то же; права файла не задаются |
| Билет и корень проекта | Node IPC родителя; корень — `realRoot`, сравнение `sameRoot` | то же | то же; `sameRoot` не учитывает регистр, `\` и `/`, раскрывает имена 8.3 |

Поведение одинаково на всех ОС, программы ОС не вызываются.

## Тесты

- `test/decisions.test.ts` — сценарный Kit: режим `agent`; кнопка и точная хостовая форма;
  двойное нажатие; устаревший дайджест и гонка с изменением данных; сообщение пользователя
  (нет источника, примечание из сообщения, одно сообщение — одно решение); потерянный ответ и
  перезапуск; повтор при `REVISION_MISMATCH`; источник `grant` и неживой запуск.
- `test/decisions-real.test.ts` — настоящий bundle Kit: отказ ручной формы даёт карточку в
  состоянии проекта, кнопка применяет показанный запрос, старый дайджест — `DECISION_STALE`;
  подтверждение поставки стартует задачу до сообщения агенту; `wfk decision` по сообщению текущего
  хода, отказ после автоматического продолжения и для сообщения в очереди; выбор запуска с
  источником `grant`; проект режима `agent` на прежних формах.
- `test/host-ticket.test.ts` — билет решения привязан к `decisionId`.
