# Workflow Kit для Harness AI — спецификация

Статус: действующая спецификация scope `workflow-kit-2026-11-03`; режимы
выполнения добавлены scope `execution-modes-2026-11-04`. Решение
принято пользователем 2026-11-03, объём — «всё сразу». Журнал решений,
которые агент принимал самостоятельно, ведётся вне репозитория, на рабочем
столе пользователя («Workflow Kit — журнал решений.md»).

**В одной строке.** Workflow Kit — кластер Core Runtime на TypeScript,
который устанавливает в любой проект единый процесс разработки:
- план, задачи и транзакционные коммиты;
- ограниченный контекст восстановления;
- профиль качества;
- git hooks.

Kit работает с любым провайдером и в любой ОС. Тот же код, собранный в один
файл, лежит внутри проекта и работает без Harness: из git hooks и из
терминала агента.

## 1. Происхождение

Kit выведен из двух систем:

- правил разработки Harness AI (`AGENTS.md`, `scripts/plan.mjs`, `.husky/**`);
- Workflow Kit 1.x из Workflow Pilot (`packages/workflow-kit`).

Из Kit 1.x взяты:
- транзакционный коммит задачи;
- trailers;
- отбор файлов задачи;
- repair;
- служебная задача `DOCS`;
- запрет прямого коммита.

Из Harness взяты:
- отдельная приёмка;
- закрытие scope только по прямой команде пользователя;
- контракты модулей рядом с кодом;
- набор проверок качества.

Новое, чего не было ни там, ни там:
- раунды и их сводки;
- ограниченный по размеру контекст восстановления;
- профиль качества с каталогом инструментов и задачей `QUALITY`;
- привязки провайдеров;
- автопилот Core;
- кроссплатформенный слой.

Проекты Workflow Pilot (Kit 1.x) не поддерживаются: рабочих проектов на нём
нет.

## 2. Документы спецификации

| Документ | Содержание |
|---|---|
| `WorkflowKitProcess.md` | алгоритм: scope, задачи, коммит, раунды, приёмка, закрытие, документация, выпуск |
| `WorkflowKitRecovery.md` | ограниченный контекст восстановления, карта документов, схема следующего шага, сводки раундов, автопилот и пауза |
| `WorkflowKitQuality.md` | профиль качества: определение стека, каталог, этапы проверок |
| `WorkflowKitInstallation.md` | файлы в проекте, установщик, Доктор, интеграция с Harness, провайдеры, Windows/Linux, перевод репозитория Harness; миграция плана — `WorkflowKitPlanMigration.md` |
| `WorkflowKitExecutionModes.md` | режимы `sequential`/`orchestrated`, метки `parallelSafe`, карточка выбора режима, Git-идентичность, роли агента, план в сайдбаре Harness |
| `WorkflowKitOrchestration.md` | назначения исполнителям в worktree, порядок работы оркестратора, интеграция результатов в main |
| `WorkflowKitCommands.md` | справочник команд `scripts/workflow`: использование, поведение, текстовый вывод и отказы |
| `WorkflowKitCoreRpc.md` | маршруты Core для проекта: подготовка, статус, автопилот, пауза, карточка режима, наблюдатель, модель плана |

## 3. Кластер `core-runtime/clusters/project-workflow`

Фасад кластера — модуль `workflow-kit` с классом `WorkflowKitFacade`. У каждого
модуля свой класс-фасад `src/<module>-facade.ts` и одиночный экземпляр.
Модули кластера, кроме `workflow-host`, не импортируют ничего вне кластера и
не используют npm-зависимостей. Это нужно, чтобы бандл работал в любом
проекте.

| Модуль | Фасад | Ответственность |
|---|---|---|
| `workflow-kit` | `WorkflowKitFacade` | фасад кластера: операции процесса (status, scope и предложение scope, task, commit, accept, close, carryover, repair, назначения, интеграция), git hooks, CLI-диспетчер; точка входа бандла |
| `workflow-platform` | `WorkflowPlatformFacade` | пути POSIX/Windows, атомарная запись, блокировка, запуск процессов без shell, поиск Node, тексты запускателей |
| `workflow-plan` | `WorkflowPlanFacade` | модель плана, валидация, проекция Markdown, переходы состояний, раунды, служебные задачи |
| `workflow-git` | `WorkflowGitFacade` | git-команды, история и trailers, Git-идентичность (валидатор, локальная и глобальная запись), транзакция коммита (в том числе двухродительский коммит интеграции), сверка задач с коммитами по первым родителям, repair |
| `workflow-quality` | `WorkflowQualityFacade` | конфигурация, определение стека, каталог, применение профиля, запуск проверок, встроенные проверки (в том числе `kit:conflict-markers`) |
| `workflow-recovery` | `WorkflowRecoveryFacade` | пакет восстановления с бюджетом, роль агента и её шаг, сводки раундов, ответ SessionStart |
| `workflow-execution-mode` | `WorkflowExecutionModeFacade` | запись предложения scope, варианты карточки режима, проверка выбора пользователя |
| `workflow-assignment` | `WorkflowAssignmentFacade` | записи назначений, планировщик, текст поручения, сторона исполнителя (worktree, план, контракт), установка зависимостей, очистка |
| `workflow-integration` | `WorkflowIntegrationFacade` | доказательство источника исполнителя, слияние в main с журналом, `continue`, статус |
| `workflow-autopilot` | `WorkflowAutopilotFacade` | чистое решение «продолжать или остановиться», в том числе для оркестратора |
| `workflow-installer` | `WorkflowInstallerFacade` | файлы установки, inspect, install (Git-идентичность, метка `host`), doctor, миграция плана Harness `harness-ai-plan-v1` |
| `workflow-host` | `WorkflowHostFacade` | только для Core: поиск бандла и среды выполнения, асинхронный запуск команд Kit дочерним процессом с обменом в JSON |

Зависимости между модулями:

```text
platform ◀── plan ◀── git ◀── quality ◀── recovery ◀── kit ──▶ installer
                                              autopilot ◀── kit
execution-mode (plan, git)              ◀── kit, recovery
assignment (plan, git, quality)         ◀── kit, recovery, integration
integration (git, plan, quality, assignment) ◀── kit
host ──(дочерний процесс)──▶ бандл kit
```

## 4. Файлы Kit в проекте

| Путь | Вид | Назначение |
|---|---|---|
| `.harness/plans/todo-plan.md` | состояние | план: JSON между `<!-- harness-workflow:begin -->` и `<!-- harness-workflow:end -->` плюс проекция |
| `.harness/workflow/config.json` | состояние | профиль качества, политика документации, бюджеты, автопилот |
| `.harness/workflow/manifest.json` | owned | версия Kit, список установленных файлов и их хеши |
| `.harness/workflow/runtime/workflow.mjs` | owned | бандл Kit |
| `.harness/workflow/hooks/*` | owned | git hooks, если в проекте не задан свой `core.hooksPath` |
| `.harness/workflow/local/**` | игнорируется Git | журнал транзакции, снимки задач, доказательства проверок, блокировка, путь к среде выполнения, пауза пользователя (`pause.json`); предложение scope (`scope-proposal.json`), назначения (`assignments/*.json`), журнал интеграции (`integration.json`), в worktree исполнителя — `assignment.json` |
| `scripts/workflow`, `scripts/workflow.cmd`, `scripts/workflow.ps1` | owned | запускатели для POSIX и Windows |
| `AGENTS.md` | управляемая секция | правила процесса для агента на английском |
| `CLAUDE.md` | управляемая строка | `@AGENTS.md` |
| `.codex/hooks.json` | управляемый JSON | SessionStart → `scripts/workflow hook session-start --client codex` с `additionalContextLimit` 65536 |
| `.claude/settings.json` | управляемый JSON | SessionStart → шесть групп `scripts/workflow hook session-start --client claude --part K/6` |
| `.gitignore`, `.gitattributes` | управляемые секции | исключения (`.harness/workflow/local/`, `.harness/runtime/`, `.harness/sessions/`, `.claude/worktrees/`) и переводы строк |
| `README.md`, `docs/architecture/OVERVIEW.md` | создаются, если их нет | минимальный контекст проекта |

## 5. Команды (`scripts/workflow <command>`)

| Группа | Команды |
|---|---|
| Состояние | `status`, `autopilot:status`, `validate`, `recover`, `show-task`, `history`, `pause:set` |
| Входы и документы | `schema [<command>]` (схема входного JSON), `context <path>[#Heading] … \| --list` (документы текстом) |
| Scope | `scope:create`, `scope:propose`, `scope:choose`, `scope:proposal`, `plan:extend`, `task:update`, `accept`, `close`, `carryover` |
| Задача | `task:start`, `task:block`, `task:unblock`, `commit`, `docs:commit` |
| Назначения | `assignment:next`, `assignment:create`, `assignment:attach`, `assignment:status`, `assignment:setup`, `assignment:cleanup`, `assignment:cancel` |
| Интеграция | `integration:start`, `integration:continue`, `integration:status` |
| Качество | `quality:detect`, `quality:apply`, `quality:status` |
| Обслуживание | `repair`, `doctor`, `install`, `inspect`, `migrate:harness-plan`, `identity:set --global` (глобальная Git-идентичность, без проекта) |
| Hooks | `hook session-start`, `git-hook <name>` |

Каждая команда выводит JSON (`--format text` — для человека; `context` —
текст по умолчанию). Полный справочник —
[WorkflowKitCommands.md](WorkflowKitCommands.md). Ошибка
возвращает `{ok:false, code, message, nextAction}` и ненулевой код выхода.
В worktree исполнителя работает только часть команд (остальные —
`ASSIGNMENT_READ_ONLY`, см. `WorkflowKitOrchestration.md`, раздел 5.3).

## 6. Фазы реализации

1. Спецификация и план.
2. Платформа и модель плана.
3. Git и транзакции.
4. Профиль качества.
5. Контекст восстановления и решение автопилота.
6. Фасад кластера, hooks, CLI и бандл.
7. Установщик, Доктор, миграция плана Harness.
8. `workflow-host`, Electron host, Core RPC.
9. Доставка контекста восстановления в сессии провайдеров.
10. Автопилот в Core.
11. Интерфейс: новый и открытый проект, Доктор, статус и автопилот.
12. Перевод репозитория Harness AI на новый Kit.
13. DOCS, сборка пакета macOS, приёмка пользователя.
