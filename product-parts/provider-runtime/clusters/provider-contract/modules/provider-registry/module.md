# Модуль: provider-registry

Часть `provider-runtime`, кластер `provider-contract`. Алиас импорта:
`#provider-registry`.

## Назначение

Общий контракт провайдера (`docs/planning/M1-providers.md`, раздел 1),
реестр провайдеров по строковому id, чтение журнала хука SessionStart,
маршруты провайдеров (спецификация, раздел 10) и раздел `providers` в
`/api/state`. Сервер и панель знают провайдеров только через этот контракт;
о Claude и Codex модуль ничего не знает.

## Публичный интерфейс (`src/index.ts`)

### Контракт (`contract.ts`)

- `Provider` — `id`, `title`, `label?` (короткое имя на кнопках, значках и в сообщениях;
  `providerLabel(provider)` даёт его или `title`), `mark?` (буква на кнопках;
  `providerMark(provider)` даёт её или первую букву короткого имени), `hookDialect?` (`HookDialect`: `'claude'` — Claude и Codex,
  `'kimi'` — `prompt` массивом частей и ответ `{ message }`; нет поля — `'claude'`; канал
  `agent-channel` читает вход и строит ответ хука по нему), `promptTitle?` (приложение берёт
  имя сессии из ответа хука `UserPromptSubmit`, а `renameSession` безопасен только вне хода:
  имя, заданное в ходе, ждёт хука `Stop` или следующего сообщения; так у Claude),
  `marksPanelProcess?` (процессы, которые запускает панель, получают `WFK_PANEL_SESSION=1`,
  хуки передают метку `panelProcess`; сессия, чей последний хук пришёл без метки, — внешняя,
  M19 раздел 2.2; так у Claude, у ChatGPT и Kimi поля нет),
  `capabilities()`, `status()`, `refresh?()`,
  `previewTrust(project)`, `grantTrust(project, token, choices?)`,
  `trust(project)`,
  `hooks(project)`, `approveHooks?(project, { command, hash })`,
  `listSessions(project)`, `createSession(project, { title, firstMessage?, detached? })`
  (`firstMessage` — первое сообщение агенту вместо служебного хода; веха 2;
  `detached` — вернуть сессию, как только ход начался, не дожидаясь его; ревьюер
  M4, раздел 11.1),
  `resumeSession?(project, sid)`, `stopSession?(project, sid)`,
  `renameSession?(project, sid, name) → RenameResult` (`synced`, `note?`:
  имя в приложении провайдера, если это безопасно сейчас; веха 2),
  `wakeSession?(project, sid) → boolean` (разбудить простаивающую сессию,
  чтобы хук отдал ей очередь панели; Claude — ввод в терминал сессии
  панели; веха 3),
  `sessionIdle?(project, sid) → boolean`, `lastAnswer?(project, sid) → string | null`,
  `sendMessage?(project, sid, text, { id }) → boolean` и свойство `lockSwitch?` —
  для провайдера, чей хук `Stop` нельзя удержать (M8, раздел 3): в сессии нет
  хода (нет живого замка); текст последнего ответа (`null` — ход без текста,
  сбой чтения — отказ); сообщение промптом (`true` — принят; `id` один на все
  повторы); имя настройки, отключающей замки сессий (для пометки в панели),
  `readMessages?(project, sid, { limit }) → ChatPage` и
  `sendDirect?(project, sid, text) → boolean` — диалог сессии (M18): последние
  сообщения и реплика агенту прямо сейчас (`false` — в очередь); типы `ChatMessage`,
  `ChatPage` (необязательный `sync` M32: `ChatSync`, `ChatGap`, `chatSyncOut`), константы
  `CHAT_PAGE_LIMIT`, `CHAT_TEXT_MAX_CHARS`, идемпотентная `cutChatText` — в `chat.ts`,
  503 `CHAT_TRANSIENT_CODES` — в `chat-routes.ts`, подробности — [chat.md](chat.md),
  `answerQuestion?(project, sid, qid, attempt, commit)` и `ChatPage.questions?` — вопросы
  агента, маршрут ответа и журнал попыток (M33) — [questions.md](questions.md),
  `actions(project | null)`, `runAction(id, project | null)`,
  `removeBlockers?(project)`.
  Расширения раздела 1: `trust(project)` — текущее доверие для панели
  (только чтение); `refresh?()` — перечитать версии и демоны внешними
  программами (старт службы и `POST /api/refresh`, D11);
  `removeBlockers?(project)` — причины не убирать проект (окружение).
  `forgetProjects?(keep)` — стереть записи (сессии, окружения) проектов, чьих id нет
  в `keep`; ответ — сколько записей стёрто (раунд R9).
  `resumeInterrupted?(project)` — поднять сессии, процесс которых завершился без намеренной
  остановки (перезагрузка, сбой); ответ — id поднятых (раунд R9, старт службы).
  `archiveSessions?(project, sessionId | null)` / `restoreSessions?(…)` — архив
  проекта (`null`) или одной сессии в Kit: остановить и не поднимать / снять
  пометку и сразу поднять; ответ — id (раунд R10).
  `deleteSessions?(project)` — удаление проекта с диска: удалить его сессии в приложении
  (Codex — `thread/delete`); ответ — удалённые id (M3-autostart R5); отказанные
  приложением ждут `retryDeletes?()` — повтор, ответ — удалённые сейчас id (R6).
  `autostart?()` — при старте службы поднять нужное на весь Mac (Codex — демон);
  ответ — строка для журнала или `null` (скоуп M3-autostart).
  `maintain?()` — обслуживание раз в минуту (Codex — передача удалённого управления
  запущенному приложению ChatGPT, M7 замечание 2); ответ — строка для журнала или `null`.
  Методы чтения (`status`, `capabilities`, `trust`, `hooks`,
  `listSessions`, `actions`) обязаны быть дешёвыми и только читать: их
  вызывает каждый опрос `/api/state`.
- Типы: `ProviderStatus` (`implemented`, `state` — `ready` |
  `not-implemented` | `not-installed` | `unavailable` | `error` | `unknown`,
  `label`, `installed`, `version`, `path`, `note?`, `checkedAt`,
  `details?`), `Capabilities` (`{ [имя]: { available, reason? } }`; имена
  `trust`, `hooks`, `sessions`, `createSession`, `resumeSession`,
  `stopSession`, `environment`, `daemon` и свои; `orchestration` — сессия провайдера ведёт
  скоуп с исполнителями, `reviewer` — сессия провайдера бывает ревьюером плана; провайдер,
  который их не называет, их имеет; `providerCapability(provider, имя)` читает одну
  возможность по этому правилу, без провайдера — недоступна), `TrustPreview`
  (`provider`, `trusted` — доверие самой папки, `writes: TrustWrite[]`,
  `autorun: AutorunPoint[]`, `choices?: TrustChoice[]`, `inherited?`,
  `token`, `expiresAt`, `notes?`), `TrustChoice` (`id`, `title`,
  `description`, `options: TrustChoiceOption[]` — `{ id, title,
  description? }`, `required` — без ответа «Доверять» не отправляется,
  ответа по умолчанию нет), `TrustChoices` (`{ <id выбора>: <id ответа> }`),
  `TrustInherited` (`{ from, note }` — доверена только родительская папка;
  `note` провайдера объясняет, что это значит), `TrustState`
  (`trusted: boolean | null`, `note?`, `inherited?`, `backup?`),
  `HookState` (`kitHook`, `hooks: HookEntry[]`,
  `complete` — `false`, если список сессий неполон, `note?`, `writes?:
  TrustWrite[]` — что запишет `approveHooks`: файл и добавляемый текст;
  мастер показывает их до согласия и одобряет хук показанными `command` и
  `hash`), `HookEntry`
  (`command`, `hash`, `kit`, `status` — `approved` | `pending` | `modified`
  | `unknown`, `key?`), `SessionInfo` (`provider`, `localId`, `remoteId?`,
  `title`, `createdAt`, `origin` — `panel` | `hook`, `state` — `running` |
  `stopped` | `unknown`, `links { desktop?, mobile?, web? }`, `note?`,
  `cwd?`, `model?`), `ProviderAction` (`id`, `title`, `scope` — `provider`
  | `project`, `enabled`, `reason?`, `confirm?`), `ProjectProviderState`
  (`provider`, `trust`, `hooks`, `sessions`, `actions`, `errors` — ошибки
  отдельных чтений по имени метода), `ProviderErrorInfo`
  (`{ code, message, hint? }`), `Project` (из `project-registry`).
- `ProviderError(code, message, { hint?, status?, details? })` — ошибка
  провайдера; `status` — HTTP-статус для синхронных маршрутов (по умолчанию
  409), в операциях `code`, `message`, `hint` и `details` переходят в
  `operation.error`.
- `ProviderContext` — что бэкенд передаёт фабрике: `platform`, `env`
  (окружение службы, PATH из D12), `homedir`, `dirs` (`DataDirs`),
  `config` (`WfkConfig`, пути программ), `events` (`EventLog`),
  `supervisor` (`ProcessSupervisor`), `runCommand` (`CommandRunner`), `now`,
  `log`.
- `ProviderFactory = (context) => Provider` — модуль провайдера экспортирует
  `createProvider: ProviderFactory` из своего `src/index.ts`; `cli`
  регистрирует фабрики `DEFAULT_PROVIDERS`. Замена заглушки на реализацию не
  требует правок вне каталога провайдера.
- `providerSessionsFile(dirs, id)` — `<state>/sessions/<id>.json` (записи
  панели); `providerLogsDir(dirs, id)` — `<logs>/<id>`.

Задание ревьюеру (M12): `Provider.reviewBrief?: 'queue' | 'first-message'` — как ревьюер этого
провайдера получает задание; без поля — `queue`, если есть `wakeSession`, иначе первым
сообщением.

Общий доступ к чатам (M12): необязательное поле `Provider.sharedAccess: SharedAccess` —
`state(force?)`, `cached()`, `preview()`, `apply(token)`, `remove()`, `open(target)`; типы
`SharedAccessState` (`state`: `unsupported` | `not-configured` | `needs-remote-login` |
`needs-admin-setup` | `needs-connection` | `active` | `broken`, `label`, `reason`, `hint`,
`configured`, `connectionSeenAt`, `connected`, `alias`, `manualProfile`, `admin`, `checkedAt`),
`SharedAccessAdminStep` (M13, Windows: `purpose` — `setup` | `rollback`, `file`, `command`,
`text` — скрипт, который пользователь запускает от имени администратора; Kit его не запускает),
`SharedAccessPreview`, `SharedAccessTarget` (`remote-login` | `connections`).

### Журнал хука (`hook-sessions.ts`)

- `readHookSessions(project, client, { includeService?, maxBytes? }) →
  HookSession[]` — сессии клиента из
  `<проект>/.workflow-kit/local/sessions.jsonl` (пишет `wfk hook`, модуль
  `kit-structure`), новые первыми. Строки одной `session_id` сливаются:
  `firstSeen`, `lastSeen`, `sources` (startup, resume, clear, compact),
  поля последней строки (`transcriptPath`, `cwd`, `model`,
  `permissionMode`), `service`. Сессии с меткой `WFK_SERVICE_SESSION`
  пропускаются (кроме `includeService`). Нет журнала — пустой список;
  битые строки пропускаются; читается хвост до 4 МиБ
  (`HOOK_JOURNAL_MAX_BYTES`); результат кэшируется по mtime и размеру файла
  (D11), `clearHookSessionsCache()` сбрасывает кэш (`/api/refresh`).
- `isHelperFork(session)` — скрытый служебный форк Codex Desktop
  (`source` только `fork`, нет `transcript_path`); `readHookSessions` его
  всегда пропускает.
- `parseHookJournal(text)`, `hookJournalFile(projectPath)`.
- `hookSessionInfo(provider, session, extra?) → SessionInfo` — `origin:
  'hook'`, `state: 'unknown'`, без ссылок; провайдер дополняет `remoteId`
  и ссылки.
- Итоговый список сессий строит сам провайдер (журнал + свои записи);
  реестр и маршруты ничего не фильтруют.

### Токены предпросмотра (`tokens.ts`, D7)

`createTokenStore({ ttlMs?, now?, newToken? }) → TokenStore`:
`issue(scope, fingerprint) → { token, expiresAt }` (новый токен того же
`scope` отменяет старый), `consume(scope, token) → fingerprint |
undefined` — одноразово, с проверкой срока (`PREVIEW_TOKEN_TTL_MS` =
10 мин). Провайдер связывает токен с отпечатком показанного и сверяет его
перед записью.

### Заглушка (`stub.ts`)

`createStubProvider({ id, title, task, client? })` — статус
`not-implemented` с меткой «не реализовано» (`NOT_IMPLEMENTED_LABEL`), все
возможности (`STUB_CAPABILITIES`) недоступны с причиной, действий нет,
`trust`/`hooks` — пустые с пометкой; изменяющие методы бросают
`ProviderError('not-implemented', …, { status: 501, hint })`. Сессии — из
журнала хука (`hookSessionInfo`, без ссылок), поэтому сессии, начатые в
родном приложении, видны уже до реализации провайдера.

### Реестр (`registry.ts`)

`createProviderRegistry({ readTimeoutMs? }) → ProviderRegistry`:
`register(provider)` (id — `[a-z][a-z0-9-]{0,31}`, повтор — ошибка),
`get`, `list`, `ids`, `summary(provider)`, `projectState(provider,
project)`, `section(projects)`, `removeBlockers(project)` (живые сессии
`state: 'running'` и `removeBlockers?` провайдера, с названием провайдера).
`forgetProjects(keep)` → `{ dropped, errors }` — опрашивает `forgetProjects?` всех
провайдеров; ошибка одного попадает в `errors[id]`, остальные выполняются.
`resumeInterrupted(projects)` → `{ resumed, errors }` — то же для `resumeInterrupted?`;
`resumed` — `<провайдер>:<id сессии>`, ошибка — в `errors['<провайдер>:<проект>']`.
`setArchived(project, key | null, archived)` → `{ changed, errors }` — архив или
возврат проекта (`null`: все провайдеры) или сессии (`'<провайдер>:<id>'`: только
её провайдер) через `archiveSessions?` / `restoreSessions?`; ошибка — в `errors[id]`.
`deleteSessions(project)` → `{ deleted, errors }` — `deleteSessions?` всех провайдеров;
`deleted` — `'<провайдер>:<id>'`, ошибка — в `errors[id]`; `retryDeletes()` — то же
для `retryDeletes?`.
`autostart()` → `{ started, errors }` — `autostart?` всех провайдеров; `started` —
`'<провайдер>: <строка>'`, ошибка — в `errors[id]`. `maintain()` → `{ done, errors }` —
так же для `maintain?`.
Каждое чтение ограничено `STATE_READ_TIMEOUT_MS` (3 с): упавшее или
зависшее чтение попадает в `errors` (`timeout` и т. п.), остальные данные
отдаются. `errorInfo(error)` — `{ code, message, hint? }`.

### Маршруты (`routes.ts`)

Полный раздел — [routes.md](routes.md).

## Инварианты

- Сервер и панель не фильтруют сессии и не знают о конкретных провайдерах.
- Опрос `/api/state` только читает (D11); внешние программы — в
  `refresh` и действиях.
- Действия над проектом и провайдером не перекрываются (D10).
- Зависимости: `#data-store`, `#http-server`, `#project-registry`,
  `#kit-structure` (путь журнала), `#process-supervisor` (типы контекста).
- Тесты работают на подставном провайдере во временном HOME.

## Дальше

T005 рисует карточки провайдеров из раздела `providers` и `operations`;
T006 и T007 заменяют заглушки `provider-claude` и `provider-codex`.

## Прерывание ответа (M24)

Публичные `InterruptTarget`, `InterruptResult`, `InterruptAvailability` экспортируются из
`src/index.ts`; их точные поля и подтверждения заданы в
[контракте M24](../../../../../../docs/design/M24-turn-interruption.md#1-общий-контракт-и-канал-t002).
`INTERRUPT_TIMEOUT_MS = 10000`. Необязательные `Provider.interruptAvailability(project, id)`
и `interruptTurn(project, id, target)` работают только при явной capability `interruptTurn`.
Отсутствующий ключ capability означает отсутствие поддержки этого действия.
`interruptAvailability` синхронно читает кэш адаптера, без RPC и запуска процессов.
`stopped: true` требует подтверждения конкретного хода; запись команды сама по себе
не является подтверждением. `stopSession` остаётся отдельной остановкой всей сессии.

`ProviderRegistry.cachedProjects()` возвращает копии последнего собранного состояния:
`{ project, providerId, sessions, capabilities, failed }[]`. Ждёт уже идущий `section`,
не запускает новых чтений. Ошибка listing помечает `failed`; ошибка capabilities даёт
пустые возможности. `section` удаляет кэш проектов, которых больше нет в его входе.
Этот снимок используется для `channel.interruptions`, без второго опроса провайдеров.

## Поведение на ОС

Контракт прерывания, кэш реестра и контракт ленты (`sync`, 503, обрезка M32) одинаковы на
macOS, Linux и Windows x64/ARM64.
Фактическое управление ходом и ограничения ОС принадлежат адаптерам провайдеров;
общий контракт не запускает программы ОС и не объявляет возможности за адаптер.


## Параметры сессии (M25)

Общий контракт, методы, маршруты, очередь изменений, снимки и чтение JSONL —
[parameters.md](parameters.md). Контракт одинаков на macOS, Linux и Windows x64/ARM64;
программы ОС не запускает. Публичный вход — `src/index.ts`.
R2/T010: атомарная запись снимка сериализуется по назначению и имеет ограниченный повтор
при занятости файла; старое назначение не удаляется. Подробности — parameters.md.

M26: optional presentation effort-card и opaque ParameterChange.access описаны в
parameters.md; PARAMETER_CHANGE_IDS включает access, смешанный legacy запрос отклоняется.
Аудит пишет фактические старые/новые поля пресета. Поведение одинаково на трёх ОС.

M27/T003: optional `ProviderContext.nativeStatuslineCommand({file,hostId})`
создаёт per-host обёртку, сохраняя старый statusline. `NativeHookEvent` и optional
`Provider.nativeControlHook(input)` возвращают true только при проверенной pending
транзакции собственного host. CLI вызывает guard до channel, titles и autopilot;
это не exemption по тексту команды. Общий контракт одинаков на трёх ОС.

M27/T004: discriminated presentation `effort-card | claude-controls`, Ultracode,
opaque option selection и явные HTTP 409/504 — [parameters.md](parameters.md).

M28/T002: `ContextUsage` получил необязательное `modelWindowTokens` (см. parameters.md).

M28/T004: `Provider.turnState?(project, sid)` → `ProviderTurnState | null` (`state`, `at`,
`source: 'hook' | 'interrupt'`) — граница хода, увиденная провайдером; `NativeHookEvent.event`
получил `continue` (удержанный Stop ответил block, ход идёт без prompt-хука).

M28/T014: `ProviderContext.autoCompactWindow?` — порог Claude для снимков старых host (parameters.md).

M29/T003: `ParameterItem.pending?` (`ParameterPending { value, label, note }`) — выбор, который
провайдер применит позже; строка показывает его с пометкой `note`, `value` остаётся
подтверждённым. `SessionParameters.failures?` (`ParameterFailure { field, value, reason, at }`)
— выборы, от которых провайдер отказался. Маршрут параметров запоминает последние
подтверждённые значения сессии и пишет `provider.parameters.changed`, когда значение
изменилось, также при GET; POST сверяет состояние до изменения. Одинаково на всех ОС.
