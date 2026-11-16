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
`AGENTS.md` (`KitRecoveryParts-2026-11-12.md`); 2.2.6 — `.harness/inputs/`
в `.gitignore` и пункт о папке входных JSON в блоке «Inputs and documents»
(M37); 2.2.7 — только среда выполнения (`install --update --with`, M38).
Поэтому более ранние
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

Перенесено в [WorkflowKitHostInstallation.md](WorkflowKitHostInstallation.md#5-интеграция-с-harness):
сборка и поставка, `workflow-host`, Core RPC, доставка контекста восстановления,
автопилот в Core и интерфейс.

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

Перенесено в [WorkflowKitHostInstallation.md](WorkflowKitHostInstallation.md#7-перевод-репозитория-harness-ai-на-kit).
