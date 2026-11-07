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
| `agents-section` | `AGENTS.md` | текст между `<!-- wfk:begin -->` и `<!-- wfk:end -->`: работа с панелью (тема сессии через `wfk session title` в первом ходе с задачей, не в служебном приветствии; оркестрация встроенными подагентами приложения — Claude: Agent с `isolation: "worktree"`, ChatGPT/Codex: своя `git worktree add --detach .workflow-kit/local/worktrees/<id> <baseCommit>` и `spawn_agent`; выбор пути и запуск плана кнопками, сообщения `Workflow Kit:`) и соглашение product-parts |
| `claude-md` | `CLAUDE.md` | `@AGENTS.md`, создаётся только если файла нет; не хешируется (дальше файл пользователя) |
| `claude-hook` | `.claude/settings.json` | по группе в `hooks.SessionStart`, `hooks.Stop` (`timeout` 600 с) и `hooks.UserPromptSubmit` (`timeout` 30 с) |
| `codex-hook` | `.codex/hooks.json` | то же, тайм-аут в поле `timeoutSec`; новая группа — только в конец списка события (одобрение Codex позиционное) |
| `gitignore-block` | `.gitignore` | `.workflow-kit/local/` между `# wfk:begin` и `# wfk:end` |
| `product-parts-readme` | `product-parts/README.md` | создаётся, только если каталога `product-parts` нет |
| `template-product-part`, `template-cluster`, `template-module` | `.workflow-kit/templates/*.md` | файлы целиком (разделы Purpose, Public interface, Invariants, Dependencies) |

Команда хука (не зависит от машины):
`[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook <session-start|stop|prompt> --client <claude|codex>; exit 0`.
Свой хук события находится по команде (`/.local/bin/wfk` и `hook <подкоманда> `).

Управляемый текст хуков файла — нормализованный объект
`{ SessionStart, Stop, UserPromptSubmit }` найденных записей Kit; если
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
  `missing`), `version` (`STRUCTURE_VERSION` = 2), `installedVersion`
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
  сохраняются (новые — 0644, каталоги — 0755). Повтор ничего не пишет.
- `recordSessionStart({ client, stdin, env, cwd, now? }) →
  SessionStartResult` — проект: первая папка с `.workflow-kit/manifest.json`
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
  `withKitHook(config, client, event?)`, `withKitHooks(config, client)`,
  `kitHookEntry(client, event?)`, `isKitHookCommand` (SessionStart),
  `isKitEventCommand(command, event)`, `kitHooksText`,
  `expectedKitHooksText`, `STOP_HOOK_TIMEOUT_S` (600),
  `PROMPT_HOOK_TIMEOUT_S` (30), `normalizeHook`, `HOOK_EVENT`,
  `findMarkedSection`, `FRAGMENTS`, `sha256`.
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
  `findKitHook`, `normalizeHook`, `sha256` и `isKitHookCommand`.

## Дальше

В вехе 1 изменений не запланировано. Веха 3: product-parts как стандарт
Kit — команды создания частей, кластеров и модулей и проверки раскладки
(спецификация, раздел 13).
