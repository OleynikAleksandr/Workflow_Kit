# Модуль: project-setup

Часть `backend-core`, кластер `projects`. Алиас импорта: `#project-setup`.

## Назначение

Мастер проекта с одним согласием (спецификация вехи 2, раздел 7):
предпросмотр только на чтение и затем, по нажатию «Создать и открыть в
<провайдер>», все шаги без вопросов — папка, git, структура Kit, процесс
Kit (версия бандла приложения, `KIT_VERSION` из `#kit-bundle`, сейчас 2.2.4), доверие и хуки Kit каждого провайдера реестра, первая сессия с
первым сообщением агенту, ссылка. Имён провайдеров в модуле нет: кнопки,
действия и шаги строятся по `providers.list()` в порядке реестра.

## Публичный интерфейс (`src/index.ts`)

- `createProjectSetup(deps) → ProjectSetup` (`deps`: `projects`,
  `providers`, `kit`, `workflow`, `operations`, `runCommand`, `env`,
  `homedir`, `platform`, `now`, `log?`, `hooksPollMs?`):
  - `preview({ mode: 'create', name } | { mode: 'open', path })` →
    `SetupPreview`: `token` (15 минут), `name`, `path` (реальный путь; у
    `open` — папка внутри домашней или другого диска, `resolveInsideRoots`
    реестра, M14),
    `exists`, `git` (`repository`, `identity`), `kit` (`action`: `install` |
    `update` | `open`, по `inspect` бандлом приложения: `KIT_OUTDATED` или
    `KIT_OK` другой версии — `update`, `KIT_OK` версии `KIT_VERSION` —
    `open`, иначе `install`), `actions`
    (`structure`, `kit`, `git`, затем на каждого провайдера `trust-<id>` —
    «Доверие папке в <label>» с файлами из `writes` предпросмотра доверия —
    и, если у провайдера есть `approveHooks`, `hooks-<id>`),
    `changes` (`count`, `files`: файлы структуры к записи, манифест и файлы
    установки Kit `KIT_INSTALL_FILES`), `choices` (выборы доверия
    провайдеров, например внешние импорты `CLAUDE.md`, id
    `<провайдер>:<id>`), `blocked` (нет git-личности —
    `GIT_IDENTITY_REQUIRED` и команды `IDENTITY_COMMANDS`; Kit личность не
    задаёт), `providers` (массив кнопок в порядке реестра: `id`, `label`,
    `mark`, `available` по `createSession`, `reason`), `hooks` (хуки Kit
    провайдеров, ещё не одобренные и с известным хешем: `provider`, `label`,
    `status`, `command`, `hash`, `writes` — что запишет одобрение, `note`;
    хук, который провайдер пишет в файл, но сейчас записать не может —
    статус `unknown` при заданном `writes`, — показан с пустым `hash`,
    текстом для ручной правки и причиной в `note`),
    `notes`. Отпечаток предпросмотра включает доверие, статус и хеш хука
    каждого провайдера. Ничего не пишет. Новая папка — внутри текущей папки проектов; уже
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
    `--update` или пропуск) → `trust-<id>` каждого провайдера реестра
    (свежий `previewTrust` и `grantTrust` с ответами пользователя; затем, при
    `approveHooks`, одобрение хука Kit теми `command` и `hash`, что показал
    предпросмотр, без перечитывания: отказ провайдера `hash-changed` или
    `hooks-changed` — ошибка `hooks-changed` «Проверьте предпросмотр ещё
    раз». Если хеша в предпросмотре не было — Codex узнаёт его только после
    доверия папке, а хук новой папки пишет шаг `structure`, — хук читается
    до 15 раз и одобряется прочитанным. Хук, который провайдер пишет в файл
    (`writes` задан), одобряется только показанным: с пустым хешем шаг
    оставляет заметку «не записан: добавьте его вручную», не показанный в
    предпросмотре — «его не было в предпросмотре». Доверие выбранному провайдеру
    обязательно, остальным — по возможности: если провайдер недоступен или
    шаг не удался, он `skipped` с заметкой «можно дать позже в
    «Настройках»») → `session`
    (`createSession` выбранного провайдера с `firstMessage`).
  - `cancel(operationId)` — остановка перед следующим шагом; операция
    завершается с кодом `cancelled`, сделанное остаётся.
  - `get(operationId)`, `section()` — `SetupRun`: `operationId`, `name`,
    `path`, `provider`, `providerLabel`, `projectId`, `status` (`running` | `succeeded` |
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
  `SetupError`, `PREVIEW_TTL_MS`; типы `ProviderButton`, `HookPreview`,
  `SetupAction`, `SetupProvider` и `StepId` (строки).

## Инварианты

- Предпросмотр только читает; всё пишется одним согласием в `apply`.
- Чужие конфиги (`~/.claude.json`, `~/.codex/config.toml`) пишут сами
  провайдеры с копией до записи и проверкой после.
- Хук одобряется показанными пользователю командой и хешем; изменившийся
  после предпросмотра хук не одобряется, а запись хука в файл, которой не
  было в предпросмотре, не делается.
- Git-личность мастер не задаёт.

## Зависимости

`#kit-bundle` (`KIT_VERSION`), `#kit-runner`, `#kit-structure`, `#project-registry`, `#provider-registry`
(типы), `#process-supervisor` (тип), `#data-store` (операции),
`#http-server`. Тесты: временный HOME, настоящие git и бандл Kit,
подставные провайдеры (третий — с хуком, который пишется в файл).

## Поведение на ОС

Одинаково на macOS, Linux и Windows; какие диски допустимы для `open`,
решает `allowedRoots` модуля `project-registry` (там же таблица по ОС).
