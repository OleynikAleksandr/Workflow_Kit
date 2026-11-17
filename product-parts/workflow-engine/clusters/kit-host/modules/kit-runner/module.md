# Модуль: kit-runner

Часть `workflow-engine`, кластер `kit-host`. Алиас импорта: `#kit-runner`.

## Назначение

Запуск команд Kit в проекте и кэш их результатов: раздел `workflow` в
`/api/state` (спецификация, разделы 8.1 и 8.2).

## Публичный интерфейс (`src/index.ts`)

### Команды

- `createKitRunner({ runCommand, appBundle, nodePath?, env?, timeoutMs? })
  → KitRunner`. Каждая команда — `node <bundle> <аргументы>` с `cwd` = папка
  проекта, без оболочки, тайм-аут 60 с (`KIT_TIMEOUT_MS`; `install` —
  180 с, `KIT_INSTALL_TIMEOUT_MS`), до 8 МиБ вывода.
  - `inspect(root)` и `install(root, { update?, name?, with? })` — бандлом
    приложения (`appBundle()`); `install` всегда с `--host harness`; непустой
    `with` (файлы структуры приложения, M38) уходит одним аргументом
    `--with <JSON-массив>`.
  - `runHost(root, args, verifier)` (M39, `src/host-run.ts`
    `runHostProcess`) — host-only команды Kit (`autopilot:authorize`,
    `autopilot:revoke`, `accept`/`close --autopilot-run`) бандлом проекта
    через `child_process.fork` с каналом `ipc` (stdout/stderr — отдельные
    pipe, сериализация JSON, `execPath` — `nodePath`). Обработчик канала
    создаётся вместе с процессом: на первое `wfk-host-hello` отвечает
    `wfk-host-ticket` с `verifier.ticket`, на `wfk-host-verify` того же
    `requestId` — один раз `wfk-host-verdict` по `verifier.verify(...)`;
    другие `requestId`, второй hello и чужой протокол без ответа. Тикет не
    попадает в окружение, аргументы и вывод. Конец — по `exit` и концу
    stdout/stderr (после отключения канала событие `close` бывает не всегда);
    тайм-аут — `KIT_TIMEOUT`. Протокол одинаков на macOS, Linux и Windows
    x64/ARM64, без shell, сокетов и программ ОС. Типы `HostVerifier`,
    `HostVerdict`, `HostPayload`, константа `HOST_PROTOCOL` (`wfk-host/1`).
  - `run(root, args)`, `status(root)`, `proposal(root)` (`scope:proposal`),
    `proposalDigest(root)` (M39 T006: `scope:proposal --digest` → `KitProposalDigest | null`,
    версия, к которой привязано согласие ревью и `scope:choose --expected-digest`) —
    бандлом проекта `.harness/workflow/runtime/workflow.mjs`
    (`projectBundlePath`); `installed(root)` — есть ли он. Чтения службы
    `status`, `proposal` и `proposalDigest` идут с `readEnv(env)` (`GIT_OPTIONAL_LOCKS=0`): их
    `git status` не берёт `.git/index.lock`, и одновременный коммит агента в том
    же проекте не падает с `COMMIT_FAILED` (CI macOS, M6 R1).
- Результат — `KitOutcome<T>`: `{ ok: true, command, result }` или
  `{ ok: false, code, message, nextAction, details }`; не бросается.
  Коды — коды Kit из его конверта или свои: `KIT_NO_BUNDLE` (бандл
  приложения недоступен), `KIT_NOT_INSTALLED` (нет бандла проекта),
  `KIT_SPAWN` (node не запустился), `KIT_TIMEOUT`, `KIT_OUTPUT` (не JSON
  или конверт без `ok`).
- `parseEnvelope(stdout, stderr)` — разбор конверта.
- Типы `KitInspect`, `KitInstall` (поля, которые читает служба; `with?` —
  пути `--with`, вошедшие в коммит, Kit 2.2.7).

### Состояние

- `createWorkflowState({ runner, listProjects, watch?, debounceMs?, syncMs?,
  now?, log?, onChange? }) → WorkflowState`:
  - `start()` — сверка со списком проектов и первое чтение; затем сверка
    каждые 10 с (`WORKFLOW_SYNC_MS`, только список, без команд Kit);
  - слежение: папка проекта (появление `.harness`) и `.harness`
    рекурсивно; изменения в `plans/` и `workflow/local/` (`isPlanChange`)
    после 300 мс тишины (`WORKFLOW_DEBOUNCE_MS`) запускают чтение;
  - чтение: без бандла проекта — `installed: false` без команд; иначе
    `status`, а при `status.scopeProposal` ещё `scope:proposal`; строятся
    `plan` (`buildPlanView`) и `choice` (`buildChoiceCard`);
  - `refresh(projectId)` — чтение сейчас; одновременные вызовы делят один
    запуск, изменения во время чтения дают ещё один;
  - `get(id)`, `status(id)` (последний успешный `status`), `section()`,
    `sync()`, `stop()`;
  - `release(id)` — закрывает наблюдатели проекта и забывает его до следующего
    `sync()`, где он есть в списке; Windows не даёт удалить папку, за которой
    следит `fs.watch`, поэтому служба вызывает его перед `deleteFolder`.
- `ProjectWorkflow`: `projectId`, `installed`, `revision`, `scope`,
  `execution`, `paused`, `decisionsMode`, `decisions`, `proposal`, `plan`, `choice`, `error`
  (`code`, `message`, `nextAction`), `updatedAt`, `refreshing`.
- Решения пользователя (M40 T005): `decisionsMode` (`host` | `agent`; нет поля в Kit 2.3.x —
  `agent`) и `decisions` — запросы решений `status.decisions` Kit (`KitDecision`). Запрос
  регистрирует Kit, когда агент в своём терминале вызывает ручную форму команды решения; реестр
  лежит в `.harness/workflow/local/`, за которой служба следит, поэтому карточка появляется в
  состоянии панели без сообщения агента.
- Раздел `workflow`: `{ projects: { <id>: ProjectWorkflow } }`.
- `nodeWatch` — `fs.watch` (не держит процесс); `WatchFactory` для тестов.

### Решения хоста (M40 T005)

- `install(root, { decisions: 'host' })` добавляет `--decisions host`: только приложение записывает
  решения пользователя в проекте (Kit 2.4.0+).
- `HostPayload` (`src/host-run.ts`): необязательный `decisionId` — запрос, который применяет
  решение пользователя; `runId` равен `null` у решения вне запуска автопилота.

## Поведение на ОС

Одинаково на macOS, Linux и Windows x64/ARM64: команды Kit запускает `node` с бандлом, операция
хоста идёт по каналу Node IPC родителя, программы ОС не вызываются. Слежение — `fs.watch`;
Windows не даёт удалить папку под наблюдением, поэтому перед удалением вызывается `release`.

## Инварианты

- `section()` и опрос панели команд Kit не запускают.
- Файлы `.harness/**` не читаются: состояние — только из команд Kit.
- Ошибка команды хранится в `error`; прошлые `plan` и `choice` остаются.

## Зависимости

`#plan-view` (модели и типы результатов Kit), `#process-supervisor`
(тип `CommandRunner`). Тесты используют `#kit-bundle` и настоящий бандл на
временных git-репозиториях (HOME и глобальный git-конфиг — во временной
папке).
`test/host-run.test.ts` — `SUPPORTED_HOST_PROTOCOL` панели (`plan-view`) равен `HOST_PROTOCOL`;
`runHostProcess` с маленьким дочерним скриптом: тикет на первый
hello, вердикт на его verify, отказ, verify чужого `requestId` без ответа, остановка зависшего
процесса по тайм-ауту.
