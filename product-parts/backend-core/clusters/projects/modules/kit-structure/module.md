# Модуль: kit-structure

Часть `backend-core`, кластер `projects`. Алиас импорта: `#kit-structure`.

## Назначение

Структура Kit v2 в папке проекта (спецификация вехи 1, раздел 7; вехи 2,
раздел 9.1): шаблоны, установка и проверка управляемых фрагментов, хуки
SessionStart, Stop и UserPromptSubmit, приём хука SessionStart.
Тексты, которые Kit пишет в чужие проекты (раздел `AGENTS.md`, README
`product-parts`, шаблоны), — на английском: их читают агенты любых проектов.

## Управляемые фрагменты

| id | Файл | Как хранится |
| --- | --- | --- |
| `agents-section` | `AGENTS.md` | текст между `<!-- wfk:begin -->` и `<!-- wfk:end -->`: работа с панелью (полный путь `wfk`, если оболочка его не находит: macOS и Linux `"$HOME/.local/bin/wfk"`, Windows PowerShell `& "$env:LOCALAPPDATA\Workflow Kit\wfk.cmd"`, Git Bash `"$LOCALAPPDATA/Workflow Kit/wfk"`, M17 2.2; тема сессии через `wfk session title` в первом ходе с задачей, не в служебном приветствии; вопрос о плане `wfk session plan` перед спецификацией задачи разработки — не для разговоров и исследований, M4 раздел 12; публикация на GitHub — не задача плана: только по просьбе пользователя после приёмки и закрытия scope, кнопкой панели или `wfk project publish`, publication-order 3.3; оркестрация встроенными подагентами приложения — Claude: Agent с `isolation: "worktree"`, ChatGPT/Codex: своя `git worktree add --detach .workflow-kit/local/worktrees/<id> <baseCommit>` и `spawn_agent`, Kimi Code: явное разрешение инструмента `Agent`, свой `git worktree add`, `Agent` на переднем плане с worktree в `cwd` каждого `Bash`, без `AgentSwarm`, а в последовательном режиме — помощники в основной папке без коммитов (M10, раздел 2.3; новый текст меняет хеш фрагмента, и проект показывает `outdated` до обновления структуры); выбор пути и запуск плана кнопками, сообщения `Workflow Kit:`) и соглашение product-parts |
| `claude-md` | `CLAUDE.md` | `@AGENTS.md`, создаётся только если файла нет; не хешируется (дальше файл пользователя) |
| `claude-hook` | `.claude/settings.json` | по группе в `hooks.SessionStart`, `hooks.Stop` (`timeout` 600 с), `hooks.UserPromptSubmit` (`timeout` 30 с) и, с версии 4 (M33), `hooks.PreToolUse` — группа `{ matcher: "AskUserQuestion" }`, команда `hook question`, `timeout` 30 с (`QUESTION_PRETOOL_TIMEOUT_S`; Claude пишет строку вызова в транскрипт перед этим хуком, поправка T008) и `hooks.PermissionRequest` — такая же группа, `timeout` 43 200 с (`QUESTION_HOOK_TIMEOUT_S`); события с matcher — `QUESTION_HOOK_EVENTS` |
| `codex-hook` | `.codex/hooks.json` | то же без `PreToolUse` и `PermissionRequest`, тайм-аут в поле `timeoutSec`; новая группа — только в конец списка события (одобрение Codex позиционное) |
| `gitignore-block` | `.gitignore` | `.workflow-kit/local/` между `# wfk:begin` и `# wfk:end` |
| `product-parts-readme` | `product-parts/README.md` | создаётся, только если каталога `product-parts` нет |
| `template-product-part`, `template-cluster`, `template-module` | `.workflow-kit/templates/*.md` | файлы целиком (разделы Purpose, Public interface, Invariants, Dependencies) |

Команда хука (не зависит от машины):
`[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook <session-start|stop|prompt|question> --client <claude|codex>; exit 0`
(`question` — только Claude).
Свой хук события находится по команде (`/.local/bin/wfk` и `hook <подкоманда> `).

Управляемый текст хуков файла — нормализованный объект
`{ SessionStart, Stop, UserPromptSubmit, PreToolUse, PermissionRequest }` найденных записей Kit (события
клиента — `kitHookEvents(client)`: Claude — `CLAUDE_HOOK_EVENTS`, Codex — `KIT_HOOK_EVENTS`;
`STRUCTURE_VERSION` 5 (M39 T004) меняет только текст раздела `AGENTS.md`: публикация `git push`
основной ветки — не задача плана, только после приёмки и закрытия по просьбе пользователя или
живым запуском автопилота этого scope; поставка пушит только CI-ветку, названную планом; при живом
запуске агент заканчивает ход без вопроса «продолжать?», а приёмку, закрытие, публикацию и команды
`autopilot:*`, `accept`/`close --autopilot-run` выполняет только приложение; вопрос о статусе не
останавливает запуск, «стоп», «пауза» и выключение режима — останавливают. Проект версии 4 получает
`outdated` по `agents-section`. Тот же текст правила публикации — в управляемом разделе Kit
(`workflow-installer`), согласованность проверяет `kit-update/test/kit-update-instructions.test.ts`.
`STRUCTURE_VERSION` 4: проект версии 3 получает `outdated` по `claude-hook`, обновление
дописывает группы `PreToolUse` и `PermissionRequest` в конец их списков, `.codex/hooks.json` не
меняется; проект v4 без `PreToolUse`, записанный до поправки T008, тоже получает `outdated`); если
найден только SessionStart, текст — одна запись (форма v1), поэтому
проект v1 получает статус `outdated`, и обновление дописывает Stop и
UserPromptSubmit в конец их списков.

`.workflow-kit/manifest.json` (права 0644, в git):
`{ kit: "workflow-kit", version, fragments: { <id>: { path, sha256, version } } }`;
`sha256` — от нормализованного управляемого текста: тело раздела или блока
(LF), запись хука (JSON с отсортированными ключами), файл целиком.

## Публичный интерфейс (`src/index.ts`)

- `checkStructure(root) → StructureReport` — только читает. Отчёт:
  `status` (общий: самый серьёзный из фрагментов, порядок
  `modified > newer > outdated > missing > ok`; без манифеста не выше
  `missing`), `version` (`STRUCTURE_VERSION` = 3), `installedVersion`
  (из манифеста или `null`), `fragments` (`id`, `path`, `kind`, `status`,
  `error?`), `warnings` (CLAUDE.md без `@AGENTS.md`, повреждённый манифест),
  `notes` (каталог product-parts уже есть), `installable` (установка без
  `force` что-то запишет).
  Статус фрагмента: нет — `missing`; совпадает с шаблоном Kit — `ok`;
  совпадает с хешем манифеста, но не с шаблоном — `outdated` (версия
  записи меньше текущей) или `newer` (больше); иначе — `modified`.
  Невалидный JSON, повреждённые маркеры, неожиданная форма хуков —
  `modified` с `error`.
- `installStructure(root, { force? }) → InstallResult` (`written`,
  `skipped`, `report`) — пишет `missing` и `outdated`; `modified` и
  `newer` — только с `force`. Невалидный JSON (в том числе манифест),
  повреждённые маркеры, неожиданная форма — `StructureError`
  (`code`: `invalid-json` | `bad-markers` | `bad-shape`, `files`) до любой
  записи. Запись атомарная (`writeFileAtomic`), права существующего файла
  сохраняются (новые — 0644, каталоги — 0755). Повтор ничего не пишет. В
  проекте с Kit обе функции вызывает и «Обновить Kit» (`kit-update`, M38):
  записанные файлы коммитит Kit (`install --update --with`).
- `recordSessionStart({ client, clients?, stdin, env, cwd, now? }) →
  SessionStartResult` — `client` не из `clients` (id провайдеров вызывающего; по
  умолчанию `HOOK_CLIENTS`) — ничего не пишет; проект: первая папка с `.workflow-kit/manifest.json`
  вверх от `$CLAUDE_PROJECT_DIR`, затем от `cwd` из входа хука, затем от
  `cwd` процесса; дописывает одну строку в
  `.workflow-kit/local/sessions.jsonl` (права 0600): `time`, `client`,
  `session_id`, `transcript_path`, `cwd`, `source`, `model`,
  `permission_mode`, `service` (значение `WFK_SERVICE_SESSION` или `null`).
  Невалидный вход терпится (поля `null`); вне проекта и с неизвестным
  клиентом ничего не пишет. Не печатает.
- `findProjectRoot(start)`, `SESSIONS_JOURNAL_PATH`, `SERVICE_SESSION_ENV`.
- `registerStructureRoutes({ router, state, projects, platform, mutex?,
  events? })` — маршруты и раздел `structure` в `/api/state`.
- `hookCommand(client, event = 'SessionStart')`, `HOOK_CLIENTS`,
  `KIT_HOOK_EVENTS`, `STRUCTURE_VERSION`, `MANIFEST_PATH`, маркеры
  `AGENTS_BEGIN/END`, `GITIGNORE_BEGIN/END`; `findKitHook(config, event?)`,
  `withKitHook(config, client, event?, host?)`, `withKitHooks(config, client, host?)`,
  `kitHookEntry(client, event?, host?)`, `isKitHookCommand` (SessionStart),
  `isKitEventCommand(command, event)`, `isKitHookEntry(hook)`, `kitHooksText`,
  `expectedKitHooksText(client, host?)`, `STOP_HOOK_TIMEOUT_S` (600),
  `PROMPT_HOOK_TIMEOUT_S` (30), `QUESTION_HOOK_TIMEOUT_S` (43 200), `CLAUDE_HOOK_EVENTS`,
  `kitHookEvents(client)`, `QUESTION_HOOK_MATCHER` (`AskUserQuestion`), `normalizeHook`, `HOOK_EVENT`,
  `findMarkedSection`, `FRAGMENTS`, `sha256`.
- Хуки на Windows (`src/hook-host.ts`, спецификация M5, раздел 6): `HookHost { platform, node,
  launcher }`, `defaultHookHost()` — `node` службы и `%LOCALAPPDATA%\Workflow Kit\wfk.mjs`
  (`WINDOWS_HOOK_LAUNCHER`; не `WFK_DATA_DIR`, как `~/.local/bin/wfk` на macOS). На Windows хук
  Claude — exec-форма без оболочки `{ command: <node.exe>, args: [<wfk.mjs>, 'hook', <событие>,
  '--client', 'claude'] }`, хук Codex сохраняет POSIX `command` и получает `commandWindows`
  (`powershellHookCommand`: вход хука читается в UTF-8 и передаётся `node` конвейером, `exit 0`).
  Пути — через `/` (`forwardSlashes`). `wfk.mjs` пишут `wfk install` и `wfk link`, он запускает
  текущую копию, поэтому хуки не меняются при обновлении; смена `node` даёт «устарело».
  Свой хук узнаётся по `hookText(hook)` (command, args и commandWindows вместе): `hook <событие> `
  и `/.local/bin/wfk` или `wfk.mjs`. На macOS и Linux хуки прежние.
- Хук Kimi (`src/kimi-hook.ts`, спецификация M8, раздел 2.3): `kimiHookBlocks(host)` →
  `{ ok, blocks }` или `{ ok: false, reason }` — пять блоков `KimiHookBlock { event, command,
  timeout }` по `KIMI_HOOK_EVENTS` (`SessionStart` → `session-start`, `UserPromptSubmit` →
  `prompt`, `Stop`, `StopFailure`, `Interrupt` → `turn-end`), `KIMI_HOOK_TIMEOUT_S` (30),
  `KIMI_HOOK_CLIENT`. Kimi выполняет команду оболочкой ОС: `kimiHookCommand` даёт строку POSIX
  прочих клиентов, на Windows — `"<node.exe>" "<wfk.mjs>" hook <событие> --client kimi` для
  `cmd.exe` (пути как есть, с `\`); путь с `"`, `%` или переводом строки — отказ с причиной.
  `kimiHooksSection(blocks, eol)` — текст для `config.toml` (комментарий `KIMI_HOOKS_MARKER`
  и блоки `[[hooks]]`), `tomlString` (строка в `'…'`, с апострофом — в `"…"`),
  `isKimiKitCommand`. Файл `config.toml` читает и пишет `provider-kimi`.
- Типы `StructureReport`, `FragmentReport`, `StructureStatus`,
  `InstallResult`, `FragmentId`, `FragmentKind`, `HookClient`, `KitHookEvent`,
  `SessionStartInput`, `SessionStartRecord`, `SessionStartResult`,
  `StructureSection`, `StructureEntry`, `StructureRoutesOptions`.

## HTTP API

| Маршрут | Ответ |
| --- | --- |
| `GET /api/projects/:id/structure` | `{ project: { id, name, path }, structure: StructureReport }` |
| `POST /api/projects/:id/structure` `{ force? }` | `{ project, written, skipped, report }` |

Раздел `/api/state` → `structure`: `{ projects: { <id>: StructureReport |
{ error, code } } }`. Ошибки: 400 `invalid-body`; 403 `access-denied`
(с `hint`); 404 `not-found`; 409 `project-missing`, `invalid-json`,
`bad-markers`, `bad-shape` (с `files`; файлы не изменены). Установка идёт
под мьютексом `project:<id>` (D10) и пишет событие `structure.installed`
(`id`, `name`, `path`, `written`, `force`), если что-то записано.

## Инварианты

- Текст вне своих маркеров, чужие разделы (`workflow-kit:begin/end`
  Harness) и чужие записи хуков не меняются; своя группа хука Codex
  только дописывается в конец.
- Изменённое пользователем без `force` не перезаписывается; файлы, которые
  нельзя прочитать безопасно, не перезаписываются никогда.
- Существующий код и существующий каталог `product-parts` не меняются.
- Модуль зависит от `#data-store`, `#http-server`, `#project-registry`.
- Тесты работают во временных папках.

## Потребители

- `cli` подключает `registerStructureRoutes`; команда `wfk hook
  session-start` вызывает `recordSessionStart`; `wfk hook stop|prompt`
  передают вход хука службе (модуль `agent-channel`).
- `provider-registry` читает `.workflow-kit/local/sessions.jsonl`
  (`readHookSessions` по `SESSIONS_JOURNAL_PATH`); из него провайдеры
  Claude и Codex строят списки сессий.
- `provider-codex` сверяет хук Kit с `hookCommand('codex')`
  (`isKitHookCommand`) и одобряет его по команде и хешу
  (`POST .../hooks/approve`); `provider-claude` находит свой хук через
  `findKitHook`, `normalizeHook`, `sha256`, `hookText` и `isKitHookEntry`;
  `provider-kimi` берёт блоки хука из `kimiHookBlocks` и `kimiHooksSection`.

## Дальше

В вехе 1 изменений не запланировано. Веха 3: product-parts как стандарт
Kit — команды создания частей, кластеров и модулей и проверки раскладки
(спецификация, раздел 13).
