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
  - `inspect(root)` и `install(root, { update?, name? })` — бандлом
    приложения (`appBundle()`); `install` всегда с `--host harness`.
  - `run(root, args)`, `status(root)`, `proposal(root)` (`scope:proposal`) —
    бандлом проекта `.harness/workflow/runtime/workflow.mjs`
    (`projectBundlePath`); `installed(root)` — есть ли он. Чтения службы
    `status` и `proposal` идут с `readEnv(env)` (`GIT_OPTIONAL_LOCKS=0`): их
    `git status` не берёт `.git/index.lock`, и одновременный коммит агента в том
    же проекте не падает с `COMMIT_FAILED` (CI macOS, M6 R1).
- Результат — `KitOutcome<T>`: `{ ok: true, command, result }` или
  `{ ok: false, code, message, nextAction, details }`; не бросается.
  Коды — коды Kit из его конверта или свои: `KIT_NO_BUNDLE` (бандл
  приложения недоступен), `KIT_NOT_INSTALLED` (нет бандла проекта),
  `KIT_SPAWN` (node не запустился), `KIT_TIMEOUT`, `KIT_OUTPUT` (не JSON
  или конверт без `ok`).
- `parseEnvelope(stdout, stderr)` — разбор конверта.
- Типы `KitInspect`, `KitInstall` (поля, которые читает служба).

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
  `execution`, `paused`, `proposal`, `plan`, `choice`, `error`
  (`code`, `message`, `nextAction`), `updatedAt`, `refreshing`.
- Раздел `workflow`: `{ projects: { <id>: ProjectWorkflow } }`.
- `nodeWatch` — `fs.watch` (не держит процесс); `WatchFactory` для тестов.

## Инварианты

- `section()` и опрос панели команд Kit не запускают.
- Файлы `.harness/**` не читаются: состояние — только из команд Kit.
- Ошибка команды хранится в `error`; прошлые `plan` и `choice` остаются.

## Зависимости

`#plan-view` (модели и типы результатов Kit), `#process-supervisor`
(тип `CommandRunner`). Тесты используют `#kit-bundle` и настоящий бандл на
временных git-репозиториях (HOME и глобальный git-конфиг — во временной
папке).
