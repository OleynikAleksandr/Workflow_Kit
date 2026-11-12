# Workflow Kit — профиль качества

Статус: спецификация scope `workflow-kit-2026-11-03`. Модуль-владелец —
`workflow-quality` кластера `core-runtime/clusters/project-workflow`.

## 1. Задача

Kit не навязывает конкретных инструментов. В проекте есть **профиль
качества**: какие проверки существуют, когда они запускаются и как их
выполнить. Профиль появляется отдельным шагом плана — служебной задачей
`QUALITY`, — когда архитектура проекта уже определена, но функционального
кода ещё нет. Тогда понятно, что ставить, а ставить уже есть куда.

## 2. Состояния профиля

- `DISCOVERY` — профиль не настроен. Документацию и план можно коммитить, а
  задачу с функциональными файлами начать нельзя. Перед ней Kit сам вставляет
  задачу `QUALITY`.
- `CONFIGURED` — стеки определены, проверки записаны, инструменты
  установлены.

Профиль хранится в `.harness/workflow/config.json` (раздел `quality`). Меняет
его только команда `quality:apply`: служебный коммит с ролью `quality`.

## 3. Определение стека (`quality:detect`)

Детерминированные признаки в корне проекта и в подкаталогах первого уровня:

| Экосистема | Признаки |
|---|---|
| `node` (JS/TS) | `package.json`, `tsconfig.json`, `deno.json` |
| `python` | `pyproject.toml`, `requirements*.txt`, `setup.py` |
| `go` | `go.mod` |
| `rust` | `Cargo.toml` |
| `dotnet` | `*.csproj`, `*.sln`, `global.json` |
| `swift` | `Package.swift`, `*.xcodeproj` |
| `jvm` | `pom.xml`, `build.gradle*` |

Если манифестов ещё нет, стек передаётся явно (`--stack node`). Агент берёт
его из архитектурного документа, а задача `QUALITY` создаёт манифест.

Результат — **предложение**: найденные экосистемы, менеджер пакетов (по
lock-файлам: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`,
`uv.lock`, `poetry.lock`) и набор проверок из каталога с командами установки.
Предложение ничего не меняет.

## 4. Каталог наборов

Для каждой экосистемы каталог описывает роли и кандидатов в порядке
предпочтения. Агент выбирает из каталога, учитывая уже установленные
инструменты, и может добавить свою команду (роль `custom`).

| Роль | node | python | go | rust | dotnet | swift |
|---|---|---|---|---|---|---|
| `format` (prepare) | ultracite fix / biome format | ruff format | gofmt -w | cargo fmt | dotnet format | swift-format |
| `lint` | ultracite check / biome check / eslint | ruff check | go vet | cargo clippy | dotnet build -warnaserror | swiftlint |
| `typecheck` | tsc --noEmit | pyright / mypy | — (compiler) | cargo check | — | — |
| `test` | node --test / vitest / jest | pytest | go test ./... | cargo test | dotnet test | swift test |
| `audit` | npm audit / pnpm audit | pip-audit | govulncheck | cargo audit | dotnet list package --vulnerable | — |

**Встроенные проверки Kit** не зависят от языка и не требуют установки:

- `kit:file-lines` — лимит строк в файле кода (`policy.maxFileLines`).
- `kit:doc-size` — лимит размера изменённого Markdown-документа (кроме
  плана), `budget.documentBytes` (28 000 байт). То же правило
  (`oversizedDocuments`) использует проверка `doc-size` доктора, но для
  всех Markdown-файлов проекта, без `.harness/plans/archive/**`
  (`WorkflowKitInstallation.md`). JSON дерева продукта `.harness/product-tree/**` считается
  документацией для задачи DOCS и `docs:commit`, но этой проверкой и
  `kit:md-links` не проверяется.
- `kit:docs-contracts` — гибридная политика документации (контракт меняется
  вместе с кодом).
- `kit:md-links` — относительные ссылки в Markdown указывают на существующие
  файлы.
- `kit:conflict-markers` — маркеры конфликта Git в добавляемых текстовых
  файлах: строка, начинающаяся с `<<<<<<< ` или `>>>>>>> `, отклоняет
  коммит; в таком файле сообщается и строка ровно `=======`, а одиночная
  `=======` (подчёркивание заголовка Markdown) проходит. Файлы с байтом NUL
  пропускаются, вывод — `<файл>: line(s) <n, …>`.

Пути, которые коммит удаляет из индекса (`removed`: вне индекса и нет на
диске или игнорируются git, например `node_modules` после
`git rm -r --cached`), не попадают в дерево коммита. Проверки содержимого
`kit:file-lines`, `kit:doc-size`, `kit:md-links` и `kit:conflict-markers`
их пропускают, а аргумент `{files}` их не получает. `kit:docs-contracts`
удаления учитывает: удаление кода модуля — изменение модуля. `appliesTo`
видит все пути кандидата (`KitFixes-2026-11-05.md`, раздел 6).

Новая конфигурация (`defaultConfig`) содержит обязательные builtins этапа
`commit`: `kit:doc-size`, `kit:md-links`, `kit:file-lines`,
`kit:docs-contracts` и `kit:conflict-markers`. Конфигурация, записанная до
`kit:conflict-markers`, получает эту проверку неявно: выбор этапа `commit`
добавляет её последней, если ни одна проверка не имеет того же id или
builtin. Файл конфигурации при этом не переписывается.

### 4.1. Бюджеты

Раздел `budget` конфигурации:

- `recoveryBytes` — пакет восстановления (32 000, допустимо 8 000–120 000);
- `documentBytes` — размер одного Markdown-документа (28 000);
- `briefBytes` — текст документов в поручении исполнителю и проверка
  `context` задач при создании плана (`CONTEXT_TOO_LARGE`): 60 000,
  допустимо 8 000–200 000. Конфигурация, записанная до этого поля,
  получает значение по умолчанию без перезаписи файла. Карта документов
  поручения (4 000 байт) в этот бюджет не входит.

## 5. Применение (`quality:apply --input <file.json>`)

Вход — выбранный профиль:

```json
{
  "stacks": ["node"],
  "packageManager": "npm",
  "install": [{"executable": "npm", "args": ["install", "-D", "@biomejs/biome"]}],
  "checks": [
    {"id": "format", "role": "format", "stage": "prepare",
     "command": {"executable": "npx", "args": ["biome", "format", "--write", "{files}"]}},
    {"id": "lint", "role": "lint", "stage": "commit", "required": true,
     "command": {"executable": "npx", "args": ["biome", "check"]}},
    {"id": "tests", "role": "test", "stage": "commit", "required": true,
     "command": {"executable": "npm", "args": ["test"]}, "timeoutMs": 600000}
  ],
  "approval": "Пользователь согласовал установку Biome"
}
```

Форму входа печатает `scripts/workflow schema quality:apply` (поля, лимиты,
коды отказов, пример); отказы называют поле в `details.field`
(`checks[0].role`, `install[0].args`, `approval`).

Шаги:

1. Валидирует профиль (раздел 7) и команды `install` до запуска чего-либо.
2. Выполняет команды `install`. Для этого нужно непустое `approval`:
   установка зависимостей — изменение проекта, согласованное с
   пользователем.
3. Записывает профиль и переводит его в `CONFIGURED`.
4. Делает служебный коммит с ролью `quality`: профиль, манифесты и
   lock-файлы, изменённые установкой.

## 6. Этапы и моменты срабатывания

| Этап | Когда | Что можно |
|---|---|---|
| `prepare` | в `commit --task` до фиксации кандидата | менять выбранные файлы (форматтеры, автоисправление); `{files}` заменяется списком выбранных файлов |
| `commit` | в pre-commit hook транзакции | только читать; изменение кандидата — ошибка |
| `push` | в pre-push hook | только читать |
| `delivery` | в задачах `delivery` | собирать артефакты вне Git |

- Проверка выполняется на этапе `commit`, если она `required` или назначена
  задаче (`task.checks`). `task.checks` — id проверок профиля, а не ручные
  проверки (их пишут в `acceptance`). `scope:create`, `scope:propose`,
  `scope:choose`, `plan:extend` и `task:update` проверяют id новых задач и
  изменённых `checks` (`CHECK_UNKNOWN`, `details {taskId, field, checks,
  known}`): при профиле `CONFIGURED` — среди проверок профиля и неявных
  защит Kit; до QUALITY — форма id без пробелов, `kit:*` — только
  встроенные проверки, остальные id задаст QUALITY, и `task:start` сверит
  их с профилем. Проверки этапа `push` выполняются все, у которых
  `required: true`.
- Для коммита задачи с функциональными файлами нужен хотя бы один проверочный
  этап `commit` (`NOT_CONFIGURED`).
- Служебные коммиты (`scope-plan`, `acceptance`, `close`, `docs`, `quality`)
  выполняют только встроенные проверки документации (`kit:doc-size`,
  `kit:md-links`, `kit:docs-contracts`) и `kit:conflict-markers`. Набор
  тестов приложения для них не запускается.
- Результаты сохраняются в `.harness/workflow/local/verification/<sha>.json`
  и выводятся в `status` и recovery.

## 7. Модель проверки

```text
id          — уникальный идентификатор
role        — format | lint | typecheck | test | audit | duplication | links |
              architecture | custom | package | installed
stage       — prepare | commit | push | delivery
required    — запускать без явного назначения задаче
command     — {executable, args[], cwd?}; builtin — {builtin: "kit:..."}
timeoutMs   — до 600000
appliesTo   — glob-фильтр: проверка запускается, только если в кандидате есть
              подходящие файлы
evidence    — обязателен для package | installed
```

Команды запускаются без shell, массивом аргументов. На Windows
исполняемые файлы `.cmd` и `.bat` (`npm`, `npx`) запускаются через платформенный
модуль (`WorkflowKitInstallation.md`, раздел 6).

## 8. Дрейф профиля

Доктор сравнивает профиль с результатом `quality:detect`. Если появилась новая
экосистема (например, в TS-проекте появился `pyproject.toml`), он предлагает
расширить профиль новой задачей `QUALITY` в текущем раунде.

Стек профиля без манифеста считается дрейфом (`missing`), только если его
проверкам нужен манифест: исполняемый файл проверки — инструмент манифеста
стека (для `node` — `npm`, `npx`, `pnpm`, `yarn`, `bun`, `bunx`; для
`python` — `uv`, `poetry` и т. д.). Команды самого инструментария вроде
`node --test` или `python -m pytest` манифеста не требуют, поэтому проект
без `package.json` с проверкой `node --test` дрейфа не имеет.

## 9. Профиль репозитория Harness AI

| id | роль | этап | команда |
|---|---|---|---|
| `ultracite-fix` | format | prepare | `npx ultracite fix {files}` |
| `architecture` | architecture | commit | `node scripts/check-architecture.mjs` |
| `lint` | lint | commit | `npm run -s lint` |
| `knip` | custom | commit | `npm run -s check:knip` |
| `typecheck` | typecheck | commit | `npm run -s typecheck` |
| `tests` | test | commit | `npm test` |
| `docs-contracts` | builtin | commit | `kit:docs-contracts` |
| `dup` | duplication | push | `npm run -s check:dup` |
| `security` | audit | push | `npm run -s check:security` |
| `links` | links | push | `npm run -s check:links` |
| `package-mac` | package | delivery | `npm run package:mac` |

Кроме них профиль содержит builtins `kit:doc-size`, `kit:md-links` и
`kit:file-lines`; `kit:conflict-markers` действует неявно (раздел 4).
