# Workflow Kit — установка, Доктор, интеграция с Harness и платформы

Статус: спецификация scope `workflow-kit-2026-11-03`. Модули-владельцы:
`workflow-installer`, `workflow-host` и `workflow-platform`. Интеграция в Core,
Electron host и интерфейс описана в разделах 4–7.

## 1. Классификация папки (`inspect <path>`)

| Состояние | Признак | Предлагаемое действие |
|---|---|---|
| `MISSING` | папки нет | создать (только «Новый проект») |
| `EMPTY` | папка пуста | установить с `git init` |
| `NOT_GIT` | есть файлы, нет репозитория | установить с `git init`; существующие файлы не меняются |
| `GIT_NO_KIT` | репозиторий без Kit | установить |
| `LEGACY_HARNESS_PLAN` | `.harness/plans/todo-plan.md` в формате `harness-ai-plan-v1` | установить и мигрировать план (раздел 3) |
| `PILOT_KIT` | `.harness/kit-manifest.json` Workflow Pilot | не поддерживается: объяснить и ничего не менять |
| `KIT_OK` | манифест совпадает с файлами, версия текущая | открыть |
| `KIT_OUTDATED` | версия в манифесте старее текущей (`KIT_VERSION` 2.2.3) | обновить (`install --update`) |
| `KIT_DAMAGED` | файлы отличаются от манифеста или отсутствуют | Доктор с исправлением |

Ответ `inspect` содержит состояние, найденные экосистемы, наличие Git и его
identity (`user.name`, `user.email`), а также незавершённую транзакцию, если
она есть. Сам `inspect` ничего не меняет.

## 2. Установка (`install <path> [--name <projectName>] [--update] [--host harness]`)

1. До любой записи определяет Git-идентичность: настоящую из локального
   конфига существующего репозитория, иначе из глобального. Заглушки
   (`Your Name`, `Ваше Имя`, `you@example.com`, почта без `@`, домены
   `example.*`, `invalid`, `localhost`) и недопустимые значения (кавычки,
   угловые скобки, почта не вида `x@домен.зона`; `isUsableIdentity`)
   пропускаются. Если настоящей нет, установка останавливается с
   `GIT_IDENTITY_REQUIRED` (`details.placeholder`): сообщение называет
   проблему один раз, а две команды `git config --global
   user.name/user.email` и `scripts/workflow doctor --fix` есть только в
   `nextAction`. Ничего не создано и не записано.
   Подробно — `WorkflowKitExecutionModes.md`, раздел 8.
2. Создаёт папку, если её нет. Если репозитория нет, выполняет `git init`
   (ветка `main`). Затем пишет найденную идентичность в локальный конфиг
   репозитория, если там нет настоящей (заглушка или недопустимая
   заменяется). Этот конфиг
   общий для всех worktree, им подписан и коммит установки.
3. Записывает файлы из таблицы `WorkflowKit.md`, раздел 4. Способ записи
   зависит от вида файла:
   - **owned** — перезаписывается целиком;
   - **управляемая секция** — заменяется только блок между
     `workflow-kit:begin` и `workflow-kit:end`; остальной текст сохраняется
     байт в байт;
   - **управляемый JSON** — добавляется или заменяется только запись Kit;
     чужие хуки и настройки сохраняются;
   - **создаётся, если нет** — существующий файл не трогается.
4. Git hooks:
   - если задан `core.hooksPath`, в каждый hook-файл этого каталога
     добавляется секция Kit; у Harness это `.husky`;
   - иначе Kit пишет hooks в `.harness/workflow/hooks/` и выполняет
     `git config core.hooksPath .harness/workflow/hooks`.

   Каждый hook вызывает
   `"$(git rev-parse --show-toplevel)/scripts/workflow" git-hook <name> "$@"`.
5. Записывает пустой план (`NONE`) и конфигурацию: профиль качества
   `DISCOVERY`, стандартные бюджеты. `--host harness` добавляет
   `"host": "harness"` в новую конфигурацию или в существующую без метки
   (единственная правка существующей конфигурации); без флага метка
   сохраняется. Другое значение — `USAGE`. В проекте с меткой scope
   создаётся через выбор режима (`WorkflowKitExecutionModes.md`, раздел 4).
6. Записывает манифест: версия, файлы, виды и SHA-256.
7. Делает служебный коммит с ролью `bootstrap` через транзакцию Kit. Если в
   рабочем дереве уже были изменения, они в коммит не входят и
   перечисляются в ответе.

`install --update` перезаписывает owned-файлы и секции текущей версией.
Изменение управляемого текста или среды выполнения повышает
`KIT_VERSION`: 2.1.0 — в `.gitignore` `.harness/sessions/` и
`.claude/worktrees/`, в `AGENTS.md` блок «Execution modes»; 2.1.1 — в
`.gitignore` `.DS_Store`; 2.2.0 — блок «Inputs and documents» в
`AGENTS.md` (`schema`, `context`, служебные файлы Kit не читать); 2.2.1 —
`node_modules/`, `.venv/`, `__pycache__/` в `.gitignore`; 2.2.2 — только
среда выполнения (`KitFixes-2026-11-05.md`, разделы 1 и 6); 2.2.3 — шесть
групп хука SessionStart для Claude (`--part K/6`), одна запись Codex с
`"additionalContextLimit": 65536` и правило о неполном пакете в
`AGENTS.md` (`KitRecoveryParts-2026-11-12.md`). Поэтому более ранние
установки читаются как `KIT_OUTDATED`.
План, конфигурация и пользовательский текст остаются нетронутыми. Коммит
делается с ролью `kit-update`.

### 2.1 Глобальная идентичность (`identity:set --name <имя> --email <почта> --global`)

Команда работает в любой папке, проект не нужен; без `--global` — `USAGE`.
Валидатор `isUsableIdentity` отклоняет пустое имя, кавычки любого вида и
угловые скобки, почту не вида `локальная-часть@домен.зона`
(`GIT_IDENTITY_INVALID`), затем заглушки (`GIT_IDENTITY_PLACEHOLDER`); оба
отказа несут `details.field`. Иначе обрезанные значения пишутся через
`git config --global`, результат — `{name, email, scope: "global"}`.
Harness вызывает команду из формы Git-идентичности (раздел 5.6).

## 3. Миграция плана Harness (`migrate:harness-plan`)

Перевод плана `harness-ai-plan-v1` на план Kit:
[WorkflowKitPlanMigration.md](WorkflowKitPlanMigration.md).

## 4. Доктор (`doctor [--fix]`)

Проверки дают статус `ok`, `warn` или `fail`, а также `fixable` и
`nextAction`:

- манифест и хеши owned-файлов;
- целостность управляемых секций и JSON;
- `core.hooksPath` и секции Kit в hooks;
- исполняемый бит запускателей (POSIX);
- доступность среды выполнения (раздел 6);
- валидность плана и сверка задач с коммитами;
- незавершённая транзакция (`nextAction: repair`);
- `git-identity` — локальная идентичность репозитория (ею подписаны коммиты
  Kit) отсутствует, заглушка или недопустима: `fail`; `fixable`, если глобальная
  идентичность настоящая;
- дрейф профиля качества относительно `quality:detect`;
- `doc-size` — `warn` со списком всех Markdown-файлов проекта (git, без
  `node_modules`, `.harness/workflow/**` и `.harness/plans/archive/**`)
  больше `budget.documentBytes`: их нужно разделить. На `ok` не влияет;
- секции `.gitignore` и `.gitattributes`.

`doctor --fix` исправляет только `fixable`-пункты. Сначала `git-identity`
копирует настоящую глобальную идентичность в локальный конфиг (отчёт
`identityFix`); без неё `nextAction` называет команды `git config --global`
(в Harness вместо них — форма Git-идентичности, раздел 5.6),
а остальные исправления не выполняются, потому что они коммитят. Затем
перезаписывает owned-файлы и секции, восстанавливает `core.hooksPath` и
исполняемый бит. Изменения
фиксируются служебным коммитом `kit-update`. План, конфигурацию и чужие
файлы Доктор не меняет.

## 5. Интеграция с Harness

### 5.1 Сборка и поставка

- `scripts/build-workflow-kit.mjs` (Vite, второй конфиг в режиме
  SSR-библиотеки) собирает `dist/workflow-kit/workflow.mjs` из точки входа
  `workflow-kit/src/workflow-kit-cli.ts`. Шаг включён в `npm run build` и в
  `scripts/dev-electron.mjs`.
- electron-builder кладёт бандл обычным файлом:
  `extraResources: dist/workflow-kit → Resources/workflow-kit`.
- Electron host передаёт процессу Core переменные окружения:
  - `HARNESS_WORKFLOW_KIT_BUNDLE` — путь к бандлу; в dev — `dist/workflow-kit`
    репозитория;
  - `HARNESS_ELECTRON_NODE` — `process.execPath`, используется с
    `ELECTRON_RUN_AS_NODE=1`.

### 5.2 `workflow-host` (Core)

Асинхронно запускает бандл дочерним процессом (`execFile` без shell, таймаут,
JSON на stdout). Для `install` и `inspect` берётся бандл приложения, для
остальных команд — бандл, установленный в проект. Если установленного нет,
используется бандл приложения. Открывая проект, Core записывает
`.harness/workflow/local/runtime`: путь к Electron и режим `electron`. Так
запускатели в проекте работают даже без системного Node.

`setIdentity({name, email})` запускает бандл приложения в домашнем
каталоге без проекта: `identity:set --name=<имя> --email=<почта> --global`
(форма `--флаг=значение` сохраняет значение, начинающееся с `--`).

Процессы Kit и провайдеров получают PATH login-оболочки пользователя: Core
читает его один раз при старте (`core-login-path.ts`,
[ReleaseFixes-2026-11-04-2.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ReleaseFixes-2026-11-04-2.md), раздел 6).

Процессы агентов Claude и Kimi (`HOME` — папка провайдера) получают
`GIT_CONFIG_GLOBAL=<настоящий home>/.gitconfig` от `withRealGitConfig`
(`provider-home-manager`), если переменная не задана и файл есть: Kit внутри
агента видит идентичность пользователя
([ReleaseFixes-2026-11-04-3.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ReleaseFixes-2026-11-04-3.md), раздел 5).

Ответ всегда имеет форму конверта Kit. Сбои самого хоста приходят в той же
форме с кодами `HOST_NO_BUNDLE`, `HOST_SPAWN`, `HOST_TIMEOUT` и
`HOST_OUTPUT`, поэтому Core обрабатывает один формат.

### 5.3 Core RPC (`core-project-workflow-rpc.ts`)

| Метод | Назначение |
|---|---|
| `workflow-inspect` `{path}` | классификация папки |
| `workflow-prepare-project` `{path, name?, mode: "new"\|"open", install?}` | установка (всегда с `--host harness`) и добавление workspace |
| `workflow-identity-set` `{name, email}` | глобальная Git-идентичность через `identity:set --global`; конверт Kit без изменений |
| `workflow-status` `{workspaceId?}` | статус Kit workspace и модель плана `planView`; без проекта — `NO_WORKSPACE` |
| `workflow-doctor` `{workspaceId?, fix?}` | Доктор |
| `workflow-autopilot-get` `{sessionId}` | состояние автопилота, `pauseState` и последняя причина остановки |
| `workflow-autopilot-set` `{sessionId, enabled}` | внутренний вызов Core, без моста и preload |
| `workflow-pause-set` `{sessionId, paused}` | пауза или продолжение плана: Kit `pause:set`, затем оценка автопилота |
| `workflow-mode-choice-get` `{workspaceId}` | карточка выбора режима workspace или `null` |
| `workflow-mode-choose` `{workspaceId, sessionId, generation, option}` | выбор пользователя на карточке |

Для `mode: "new"` поле `path` — родительская папка, а `name` — имя новой
папки проекта. Целевая папка должна отсутствовать или быть пустой. Для
`mode: "open"` поле `path` — сама папка, `name` не передаётся: проект
называется по папке. Что делает Core, зависит от
`action` результата `inspect`:
- `create`, `install`, `install-migrate` — установка;
- `update` — обновление;
- `open`, `doctor` — ничего не устанавливается;
- `unsupported` — отказ.

`install: false` с `mode: "open"` («Открыть без Kit») регистрирует любую
существующую папку, ничего не устанавливая. Так сохраняется прежнее
поведение «Add Workspace».

Отказ `GIT_IDENTITY_REQUIRED` ничего не записывает. После успешного
`workflow-identity-set` клиент повторяет тот же запрос; Core прерванную
подготовку не хранит.

Затем папка регистрируется как workspace. Методы `workflow-*` обрабатывает
`CoreProjectWorkflowRpc` (`core-project-workflow-rpc.ts`).

Событие `workflow:status` (`{workspaceId, path, planView, status}`)
публикуется после каждой операции Kit и при изменении плана или
`.harness/workflow/local` проекта (наблюдатель Core, без открытого UI).
Событие `workflow:autopilot` публикуется при каждом решении автопилота,
`workflow:mode-choice` — при каждом изменении карточки режима
(`WorkflowKitExecutionModes.md`, разделы 4.2 и 10).

### 5.4 Доставка контекста восстановления в сессии

- Контракт адаптера расширяется полем
  `ProviderSessionStartOptions.workspaceContext?: string`. Core вычисляет
  пакет в `bindProviderSession` и передаёт его в `createSession` и
  `resumeSession`. Для новой сессии провайдера используется событие
  `startup`, для возобновления — `resume`. Таймаут — 20 секунд. Пакет
  получают только основные сессии. Субагенты и сессии Profile Creator его не
  получают. Если Kit не установлен или вернул ошибку, сессия стартует без
  контекста.
- Как адаптеры используют поле:
  - **Claude** — добавляет его к системному промпту (native: `append` к
    пресету `claude_code`; managed и legacy: в конец строки);
  - **Codex** — `developerInstructions` в `thread/start` и `thread/resume`;
  - **клиенты OpenRouter, GLM, Local Models, Kimi-client** — системное
    сообщение в начале истории.
- **Kimi native и Grok** в этом выпуске поле не используют. Агент получает
  правила из `AGENTS.md` и вызывает `scripts/workflow recover`.
- Процессам провайдеров Harness передаёт `HARNESS_WORKFLOW_RECOVERY=host`.
  Если проектные хуки (`.claude/settings.json` в native-профиле,
  `.codex/hooks.json`) всё же сработают, они вернут пустой контекст и не
  будут его дублировать.
- Ход автопилота несёт свежий пакет в тексте сообщения. Поэтому длинная
  сессия, у которой системный контекст фиксируется при старте, всегда видит
  актуальное состояние.

### 5.5 Автопилот в Core

Исполнитель автопилота — `session-request-handler`
(`session-workflow-autopilot.ts`). Он работает рядом с обработчиком
`turn_completed` в `session-provider-event-router.ts`. После завершения хода:

1. Пропускает ход, если:
   - сессия — субагент или Profile Creator;
   - ход был остановлен пользователем;
   - ход закончился ошибкой;
   - ожидается ответ на запрос провайдера.
2. Получает статус через `workflow-host`.
3. Вызывает `WorkflowAutopilotFacade.decide`.
4. При `continue` отправляет ход через `SessionRequestHandlerFacade.sendMessage`.

Состояние автопилота хранится в памяти Core для каждой сессии. По умолчанию
автопилот включён для каждой подходящей сессии; пауза Kit останавливает его
перед следующей задачей (`paused`), текущая задача доводится до конца.
Решения для scope `orchestrated` и причины
`waiting-for-mode-choice`/`waiting-for-executors` описаны в
`WorkflowKitRecovery.md`, раздел 6.

Как работает исполнитель:
- Статус проекта берётся командой Kit `autopilot:status`.
- Когда ход начинается, исполнитель запоминает исходную точку: ревизию плана
  и HEAD. По ней решение определяет `no-progress`.
- `user-message` означает, что пользователь написал во время уже идущего
  хода. Ход, который начал сам пользователь, автопилот продолжает обычным
  образом.
- Включение автопилота (внутренний вызов) или снятие паузы
  (`refreshPause`) в простаивающей сессии сразу оценивает проект и
  запускает следующую задачу. Исключение — выбор `sequential`/`orchestrated`
  на карточке режима: Core включает автопилот с `evaluate: false` до
  сообщения выбора, и решение принимает конец этого хода.
- Ход автопилота проходит тем же путём, что сообщение пользователя.
- Stop, `turn_failed` и `stream_error` завершают цепочку с причиной
  `turn-error`.

### 5.6 Интерфейс

- Новый кластер Application Shell `project-workflow-ui`:
  - `project-setup-dialog` — «Новый проект»: родительская папка и имя;
    «Открыть проект»: папка (без поля имени), результат `inspect` и кнопка
    установки. При `GIT_IDENTITY_REQUIRED` — форма Git-идентичности: имя,
    почта и «Сохранить и продолжить» (`workflow-identity-set`, затем тот
    же запрос подготовки);
  - `project-doctor-panel` — проверки Доктора и «Исправить»; для
    неисправимой `git-identity` — та же форма, затем `doctor --fix`;
  - `workflow-status-strip` — scope, задача, прогресс и причина остановки
    автопилота (только отображение, переключателя нет);
  - `execution-mode-card` — карточка выбора режима в левом сайдбаре под
    карточкой сессии-владельца, на месте плана;
  - `project-plan-panel` — активный план в боковой панели под карточкой
    сессии-владельца (`WorkflowKitExecutionModes.md`, раздел 10.2) и
    кнопка паузы по `pauseState` Core: «Pause», «Pausing after the current
    task» (неактивна), «Continue» (`workflow-pause-set`).
- В меню workspace в боковой панели — «Новый проект», «Открыть проект»,
  «Доктор проекта». Прежний пункт «Add Workspace» становится «Открыть
  проект». Обычную папку без Kit открывает кнопка «Open Without Kit».
- Строка статуса стоит над поверхностью сессии в окне сессий и в отдельном
  окне. Она показывается только для workspace с установленным Kit.
- Electron host получает IPC `pick-project-folder` (только выбор папки и
  возврат пути) и `pick-project-parent`.
- Все строки интерфейса проходят через `source-dictionaries`. Нативные
  `alert`, `confirm` и `prompt` не используются.

## 6. Платформы (macOS, Windows, Linux)

- Пути внутри плана, манифеста и конфигурации всегда в формате POSIX. На
  границе с ФС они переводятся в формат ОС. Абсолютные пути, `..` и
  выход за корень отклоняются. На ФС без учёта регистра сравнение путей тоже
  идёт без учёта регистра.
- Процессы запускаются без shell, аргументы передаются массивом. На Windows
  `.cmd` и `.bat` (`npm`, `npx`) запускаются через `cmd.exe /d /s /c` с
  экранированием аргументов. Исполняемые файлы ищутся по `PATH` и `PATHEXT`.
- Запись атомарна: временный файл в том же каталоге, затем `rename`. На
  Windows при `EPERM`, `EBUSY` и `EACCES` выполняется до 5 повторов с
  нарастающей задержкой.
- Блокировка — эксклюзивное создание файла (`wx`) с PID и временем. Блокировка
  считается устаревшей, если процесса нет или она старше 10 минут.
- Запускатели:
  - `scripts/workflow` — POSIX `sh`;
  - `scripts/workflow.cmd` — CMD;
  - `scripts/workflow.ps1` — PowerShell.

  Все три ищут среду выполнения в одном порядке:
  1. `HARNESS_WORKFLOW_NODE`;
  2. `.harness/workflow/local/runtime`;
  3. `node` из `PATH` версии 22 и выше;
  4. стандартные пути ОС.
- `.gitattributes`: `scripts/workflow` и hooks — `eol=lf`, `*.cmd` и
  `*.ps1` — `eol=crlf`, `.harness/**` — `eol=lf`.
- Git hooks — POSIX `sh`. Git for Windows выполняет их своим `sh`.
- В этом выпуске собирается только пакет macOS. Проверки Windows и Linux
  выполняются тестами платформенного модуля с подменой `platform`.

## 7. Перевод репозитория Harness AI на Kit

1. Профиль качества Harness (`WorkflowKitQuality.md`, раздел 9) и политика
   контрактов: `module.md` меняется вместе с `src/**` модуля.
2. `install` в самом репозитории (секции в `.husky/*`) и
   `migrate:harness-plan` для активного плана.
3. Переписать `AGENTS.md` (процесс — из секции Kit), обновить
   `CLAUDE.md`, индекс и шаблон плана; удалить `scripts/plan.mjs`,
   `scripts/check-docs-sync.mjs`, их тесты и npm-скрипты `plan:*`.
4. Оставшиеся задачи scope (DOCS, сборка, приёмка) выполняются уже
   командами нового Kit.
