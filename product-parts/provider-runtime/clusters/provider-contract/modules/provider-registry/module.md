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

Общий доступ к чатам (M12): необязательное поле `Provider.sharedAccess: SharedAccess` —
`state(force?)`, `cached()`, `preview()`, `apply(token)`, `remove()`, `open(target)`; типы
`SharedAccessState` (`state`: `unsupported` | `not-configured` | `needs-remote-login` |
`needs-connection` | `active` | `broken`, `label`, `reason`, `hint`, `configured`,
`connectionSeenAt`, `connected`, `alias`, `manualProfile`, `checkedAt`),
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

`registerProviderRoutes({ router, state, registry, projects, operations,
mutex, events?, platform, now?, onRefresh? }) → { refresh() }` регистрирует
маршруты и раздел `providers`.

| Маршрут | Ответ |
| --- | --- |
| `GET /api/providers` | `{ providers: ProviderSummary[] }` |
| `GET /api/projects/:id/providers/:p` | `ProjectProviderState` |
| `GET /api/projects/:id/providers/:p/trust/preview` | `TrustPreview` (синхронно) |
| `POST …/providers/:p/trust` `{token, choices?}` | 202, операция `provider.trust` → `grantTrust(project, token, choices)`; `choices` — объект `{ <id>: <id ответа> }` (id — `[A-Za-z0-9._:-]{1,64}`, до 16 пар), без него — `{}`; иначе 400 `invalid-body`. Обязательность ответов проверяет провайдер |
| `POST …/providers/:p/hooks/approve` `{command, hash}` | 202, `provider.hooks.approve` → `approveHooks` |
| `POST …/providers/:p/sessions` `{title?}` | 202, `provider.session.create`; имя по умолчанию `<проект> · ГГГГ-ММ-ДД ЧЧ:ММ` (`defaultSessionTitle`) |
| `POST …/sessions/:sid/resume`, `…/sessions/:sid/stop` | 202, `provider.session.resume` / `provider.session.stop` |
| `POST /api/providers/:p/actions/:a` | 202, `provider.action` → `runAction(a, null)` |
| `POST /api/projects/:id/providers/:p/actions/:a` | 202, `provider.action` → `runAction(a, project)` |
| `GET /api/providers/:p/shared-access` | `SharedAccessState` (`state(false)`, M12) |
| `POST /api/providers/:p/shared-access/recheck` | `SharedAccessState` после всех проверок (`state(true)`) |
| `GET /api/providers/:p/shared-access/preview` | `SharedAccessPreview` (`writes`, `token`, `expiresAt`, `notes`) |
| `POST /api/providers/:p/shared-access/apply` `{token}` | 202, `provider.shared-access.apply` → `apply(token)` |
| `POST /api/providers/:p/shared-access/remove` | 202, `provider.shared-access.remove` → `remove()` |
| `POST /api/providers/:p/shared-access/open` `{target}` | `{ opened }`; `target` — `remote-login` или `connections`, иначе 400 |
| `POST /api/refresh` | 202, `providers.refresh`: сброс кэша журнала, `onRefresh` (сверка процессов), `refresh?()` каждого провайдера |

Долгий POST отвечает 202 `{ operationId, operation, existing }`; ход и
итог — в разделе `operations` `/api/state`. Ключ операции — вид, провайдер,
проект и (для сессий и действий) id: повтор во время операции возвращает ту
же операцию (`existing: true`) и второе действие не запускает. Действие
выполняется под мьютексом `provider:<p>`, затем `project:<id>` (тот же
ключ, что у установки структуры); пока ключ занят, `progress` — «ожидание
очереди». Итог пишется в `events.jsonl` (`OPERATION_EVENTS`):
`provider.trust.granted`, `provider.hooks.approved`,
`provider.session.created|resumed|stopped`, `provider.action.completed`,
`provider.shared-access.applied|removed`,
`providers.refreshed`; неудача — `provider.operation.failed` (`kind`,
`error`). В событии — `operationId`, `provider`, `project`,
`projectName`, `projectPath` и краткий итог (id сессии, `trusted`,
`backup`).

Ошибки до запуска операции — `{ error: { code, message, ...details } }`:
400 `invalid-body`, `invalid-session`; 403 `access-denied` (с `hint`); 404
`unknown-provider`, `not-found`, `unknown-action`; 409 `project-missing`,
`not-supported` (нет необязательного метода или `sharedAccess`), `action-disabled` (с
`hint` = `reason`); `ProviderError` предпросмотра — со своим статусом
(у заглушки 501 `not-implemented`).

Раздел `/api/state` → `providers`: `{ providers: ProviderSummary[]
(id, title, label, mark, status, capabilities, resume — есть ли у провайдера
`resumeSession`, actions(null), errors), projects: {
<projectId>: { <providerId>: ProjectProviderState } } }`.

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
