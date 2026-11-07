# Модуль: project-setup

Часть `backend-core`, кластер `projects`. Алиас импорта: `#project-setup`.

## Назначение

Мастер проекта с одним согласием (спецификация вехи 2, раздел 7):
предпросмотр только на чтение и затем, по нажатию «Создать и открыть в
ChatGPT / Claude», все шаги без вопросов — папка, git, структура Kit,
процесс Kit 2.2.2, доверие Claude и Codex, одобрение хуков Kit, первая
сессия с первым сообщением агенту, ссылка.

## Публичный интерфейс (`src/index.ts`)

- `createProjectSetup(deps) → ProjectSetup` (`deps`: `projects`,
  `providers`, `kit`, `workflow`, `operations`, `runCommand`, `env`,
  `homedir`, `platform`, `now`, `log?`, `hooksPollMs?`):
  - `preview({ mode: 'create', name } | { mode: 'open', path })` →
    `SetupPreview`: `token` (15 минут), `name`, `path` (реальный путь),
    `exists`, `git` (`repository`, `identity`), `kit` (`action`: `install` |
    `update` | `open`, по `inspect` бандлом приложения), `actions`
    (структура, Kit, git, доверие Claude, доверие Codex, хуки Codex),
    `changes` (`count`, `files`: файлы структуры к записи, манифест и файлы
    установки Kit `KIT_INSTALL_FILES`), `choices` (выборы доверия
    провайдеров, например внешние импорты `CLAUDE.md`, id
    `<провайдер>:<id>`), `blocked` (нет git-личности —
    `GIT_IDENTITY_REQUIRED` и команды `IDENTITY_COMMANDS`; Kit личность не
    задаёт), `providers` (доступность кнопок по `createSession`), `notes`.
    Ничего не пишет. Новая папка — внутри текущей папки проектов; уже
    существующая — отказ `exists` с подсказкой открыть её.
  - `apply({ token, provider, choices? })` → `{ operationId }` (операция
    `project.setup`, D10). Перед стартом предпросмотр строится заново: другой
    отпечаток — `preview-stale`; устаревший токен — `preview-expired`;
    `blocked` и недоступный провайдер — отказ; обязательный выбор без ответа
    — `choice-required`. Шаги (`SetupStep`: `pending` → `running` → `done` |
    `skipped` | `failed`, заметка): `project` (create / open реестра) →
    `git` (`git init`, если нужно) → `structure` (`installStructure`; пока
    Kit не управляет репозиторием, файлы структуры коммитятся обычным git
    отдельным коммитом «chore: add Workflow Kit structure» — Kit затем
    коммитит только свои файлы) → `kit` (`install --host harness`,
    `--update` или пропуск) → `trust-claude` и `trust-codex` (свежий
    `previewTrust` и `grantTrust` с ответами пользователя; для Codex затем
    `approveHooks` хука Kit по хешу из `hooks`, до 15 попыток; доверие
    выбранному провайдеру обязательно, другому — по возможности: если он
    недоступен или запись не удалась, шаг `skipped` с заметкой «можно дать
    позже в «Настройках»») → `session`
    (`createSession` выбранного провайдера с `firstMessage`).
  - `cancel(operationId)` — остановка перед следующим шагом; операция
    завершается с кодом `cancelled`, сделанное остаётся.
  - `get(operationId)`, `section()` — `SetupRun`: `operationId`, `name`,
    `path`, `provider`, `projectId`, `status` (`running` | `succeeded` |
    `failed` | `cancelled`), `steps`, `session`, `links` (панель открывает
    ссылку своего устройства), `error`.
- `SERVICE_MESSAGE_MARK` («создан панелью Workflow Kit») — метка служебного
  первого хода (тема сессии в нём не задаётся).
- `firstMessage(name)` — «Проект «…» создан панелью Workflow Kit. Прочитай
  AGENTS.md и выполни `scripts/workflow recover --format text`, затем
  коротко поздоровайся и спроси, какую задачу будем решать.»
- `registerSetupRoutes({ router, state, setup })` — `POST
  /api/setup/preview`, `POST /api/setup/apply` (202), `POST
  /api/setup/:op/cancel`, раздел `setup`.
- `buildPreview`, `resolveTarget`, `draftProject`, `realFolder`,
  `SetupError`, `SETUP_PROVIDERS`, `PREVIEW_TTL_MS`.

## Инварианты

- Предпросмотр только читает; всё пишется одним согласием в `apply`.
- Чужие конфиги (`~/.claude.json`, `~/.codex/config.toml`) пишут сами
  провайдеры с копией до записи и проверкой после.
- Git-личность мастер не задаёт.

## Зависимости

`#kit-runner`, `#kit-structure`, `#project-registry`, `#provider-registry`
(типы), `#process-supervisor` (тип), `#data-store` (операции),
`#http-server`. Тесты: временный HOME, настоящие git и бандл Kit,
подставные провайдеры.
