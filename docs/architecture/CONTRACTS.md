# Workflow Kit — основные контракты

Контракты между модулями приложения: сборка, маршруты и состояние, провайдеры, операции,
процессы, служба, структура и процесс Kit, мастер, панель. Раздел вынесен из
[OVERVIEW.md](OVERVIEW.md) без изменений текста (2026-11-12, M22: обзор упёрся в лимит
документа); подробности — в `module.md` модулей.

## Сборка приложения (`cli`)

`createApp(options?)` создаёт каталоги данных (0700), читает конфиг и собирает: реестры
маршрутов и разделов состояния (`http-server`), HTTP-сервер с панелью (`panelShellMount()` в
корне, `projectWizardMount()`, `sessionViewMount()`, `sessionChatMount()` под префиксами),
журнал событий, мьютекс, реестр проектов, операции, учёт процессов и реестр провайдеров из
`DEFAULT_PROVIDERS` (`provider-codex`, `provider-claude`, `provider-kimi`). `start()` пишет
`service.started` и запускает `providers.refresh`. Новое подключается регистрацией в
`app.router` и `app.state` внутри `createApp`; команды службы идут в `runServiceCommand`. Контракт —
[cli/module.md](../../product-parts/backend-core/clusters/runtime/modules/cli/module.md).

## Реестр маршрутов и разделов состояния (`http-server`)

`createRouter()` — маршруты с `:name`, ответ JSON, ошибки `{ error: { code, message,
...details } }` через `HttpError`. `createStateRegistry()` — разделы `GET /api/state`; упавший
даёт `{ error }`, остальные отдаются. Разделы: `system` (`cli`), `projects`
(`project-registry`), `structure` (`kit-structure`), `providers` (`provider-registry`),
`operations` (`data-store`), `workflow` (`kit-runner`), `channel` (`agent-channel`),
`autopilot`, `review` (`plan-review`), `reviews` (`cross-review`), `titles` (`session-titles`),
`setup` (`project-setup`), `publication` (`git-publish`). Фильтр
доступа D8: только loopback и Tailscale (адрес клиента и локальный адрес),
`Host` из списка, для изменяющих запросов — `Origin` и JSON. Контракт —
[http-server/module.md](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md).

## Контракт провайдера (`provider-registry`)

Интерфейс `Provider` (`status`, `capabilities`, `trust`, `previewTrust`,
`grantTrust`, `hooks`, `approveHooks?`, `listSessions`, `createSession`,
`resumeSession?`, `stopSession?`, `interruptAvailability?`, `interruptTurn?`, `readMessages?`, `sendDirect?`, `readParameters?`, `updateParameters?`, `marksPanelProcess?`, `actions`, `runAction`,
`refresh?`, `removeBlockers?` и другие) и фабрика `createProvider(context)` из `src/index.ts`
модуля провайдера. Чтение дёшево и ничего не меняет (D11); запись в чужие конфиги — по
одноразовому токену предпросмотра с отпечатком показанного (D7). `TrustPreview.choices` —
решения до «Доверять», ответы — в `grantTrust(project, token, choices)`; `inherited` — доверена
только родительская папка (в предпросмотре и в состоянии). Модуль даёт маршруты провайдеров,
раздел `providers` и чтение журнала хука `.workflow-kit/local/sessions.jsonl`; сервер и панель
провайдеров не называют. Контракт —
[provider-registry/module.md](../../product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md).

Диалог сессии (M18): лента — `GET /api/projects/:id/providers/:p/sessions/:sid/messages` → `{ supported, messages,
truncated }` (`readMessages?`); отправка — `POST …/sessions/:sid/message` → `{ sent: true }`
(`cli` отдал текст `sendDirect`) или `{ queued }`. Claude (M19): текст — в
`<debug>.text`; сессия, чей последний хук без `panelProcess` (`SessionActivity.external`),
получает их только очередью и не будится. Подробно — `chat.md`
провайдеров, `cli/session-chat.md`.

## Операции (D10, `data-store`)

`createOperations()` — долгие действия в памяти: POST сразу отвечает 202 `{ operationId,
operation, existing }`, ход и итог — в разделе `operations`, повтор с тем же ключом даёт идущую.
Мьютексы `provider:<p>` и `project:<id>`, итог — в `events.jsonl`.

## Процессы (`process-supervisor`)

`createProcessSupervisor({ file })` над `<state>/processes.json`:
`spawn` (своя группа, вывод в файл, окружение без `CLAUDE*`, D5), `track`,
`check`/`quickCheck`, `stop` (сверка pid, времени старта, командной строки
и boot id; TERM, ожидание, KILL; без `pkill`, D9), `reconcile` при старте и
по `/api/refresh`. `runCommand` — внедряемый исполнитель программ без shell.

## Служба (`service-installer`)

`runServiceCommand(command, context, args)` (`install`, `uninstall`, `start`, `stop`,
`status`, `open`, `doctor [--installed]`) не бросает (`{ ok, exitCode, message }`), эффекты
(`fs`, `run`, `spawnDetached`, `health`) внедряются; `getServiceStatus(platform, context)`
только читает файлы для `system.service`. `install` копирует `bin`, `product-parts`,
`package.json` в `app/<версия>/`, пишет `app/current.json`, пути программ и login PATH в
`config.json` (D12), ставит запускатель, значок и автозапуск при входе, запускает службу.
Контракт —
[service-installer/module.md](../../product-parts/system-service/clusters/deployment/modules/service-installer/module.md).

## Структура Kit и хук (`kit-structure`)

`checkStructure`/`installStructure` — управляемые фрагменты (раздел `AGENTS.md` между
`<!-- wfk:begin -->` и `<!-- wfk:end -->`, хуки SessionStart Claude и Codex, блок `.gitignore`,
шаблоны, `.workflow-kit/manifest.json`) со статусами `ok`, `missing`, `modified`, `outdated`,
`newer`. `wfk hook session-start` (`recordSessionStart`) дописывает строку в журнал хука, код
выхода всегда 0.

## Процесс Kit в проекте (`workflow-engine`, веха 2)

Kit 2.2.4 ставится в проект бандлом (`install --host harness`; бандл собирается из `kit-core`
`npm run build:kit`, M22), команды — отдельным процессом
с JSON-ответом (`kit-runner`); `.harness/**` служба не читает и не пишет. Раздел `workflow` даёт модели
карточек плана и выбора пути (`plan-view`). Хуки `wfk hook stop|prompt|turn-end` идут в
`agent-channel` (`POST /api/hooks/…`, только loopback): `Stop` держится до 9 минут, пока
пользователь решает; провайдеру без удержания `Stop` (`turn-end`) сообщение уходит промптом,
когда сессия свободна; `autopilot` решает, продолжать ли агента, по `autopilot:status` и
правилам Harness; кнопки панели (`POST /api/projects/:id/workflow/…`) выполняют команды Kit и
сообщают агенту. Имена, архив и ревью сессий — в папке проекта (раздел «Данные на диске»).
Версия Kit проекта — раздел `kitUpdate` (`kit-update`, M22: `inspect` при старте, после
изменения плана и раз в 60 с); `POST /api/projects/:id/kit/update` (202, 409 `busy`) —
`install --update`, затем одобрение хуков Kit Codex в доверенной папке; новый Kit старым не
заменяется. Архивные и убранные сессии в процессе Kit не участвуют (M22 2.8).
Контракты — `module.md` модулей части
[workflow-engine](../../product-parts/workflow-engine/product-part.md).

## Мастер проекта (`project-setup`, веха 2)

`POST /api/setup/preview` только читает и даёт токен; `POST /api/setup/apply` по одному
согласию делает всё: папку, git, структуру (коммит до Kit), Kit 2.2.4, доверие Claude и Codex
(выбранному провайдеру — обязательно, другому — по возможности), одобрение хуков Kit, первую
сессию с первым сообщением. Ход — раздел `setup` и операция `project.setup`; отмена — перед
следующим шагом.

## Панель (`panel-shell` и расширения)

Вид — по M24; прежний макет `docs/design/ui-mockup.html` исторический по раскладке:
изменяемый сайдбар 320 px по умолчанию с деревом и карточками процесса, диалог справа, служебные карточки в «Настройках», экран «Домой» iPad. Опрос
`GET /api/state` раз в 3 с. Расширения подключаются через `PANEL_EXTENSIONS` и `install(shell)`:
карточки — `registerCard`/`registerCardGroup`, мастер и экран сессии — слоты `registerSlot`
(карточки — `sessionSidebar` под деревом, диалог — `sessionChat` в правой области;
`sessionBody` сохранён для совместимости). Разделитель — мышь/touch/клавиатура; ширина
хранится на устройстве. До 680 px — выдвижной сайдбар. Окно ограничено viewport,
лента и сайдбар имеют собственную прокрутку, другие экраны прокручиваются внутри main. Действия провайдеров — в
мастере и на экране проекта, архив — карточка «Архив». Контракты — `module.md` модулей кластера
[web-panel](../../product-parts/control-panel/clusters/web-panel/cluster.md).

Компактный ввод M24 принадлежит `session-chat`: Enter при waiting/holding/unknown,
Stop только при working; Ctrl/⌘+Enter и touch «В очередь» сохраняют M18. В M25 параметры приходят через GET/POST parameters; fallback без поддержки —
SessionInfo.model и прочерки M24. Отсутствующая телеметрия не выдумывается.
Stop использует channel.interruptions, не угадывает работу по HTTP-отправке. Подтверждение
и поздние ответы привязаны к поколению; stale-turn обновляет цель без повторного Stop.
Черновик защищён ревизией от позднего результата отправки. Подробности —
[session-chat/module.md](../../product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md).

## Прерывание ответа (M24)

Общий протокол: [M24-turn-interruption](../design/M24-turn-interruption.md).
`Provider` имеет необязательные interruptAvailability/interruptTurn и явную capability
interruptTurn. Успех требует подтверждения конкретной native-цели, а не отправки команды.
`cli` проверяет принадлежность и допустимость, ставит барьер, координирует подтверждение,
паузу плана его владельца и failed-ревью; ошибки/idle/stale барьер не снимают.
`agent-channel` владеет уникальным turnRef, pending/result и очередью; подтверждённое
прерывание само переводит его в waiting без провайдерского Stop hook. События прежнего
поколения не меняют новый ход, собственный prompt не удваивает принятую отправку.
Публичное состояние — `channel.interruptions[projectId][sessionKey]`, из кэша реестра
без дополнительных RPC; после рестарта unknown до события хода. Новая явная отправка
снимает барьер доставки; штатное «Продолжить» снимает также паузу плана. Kit не отменяет
назначения. Общий контракт одинаков на macOS, Linux, Windows x64/ARM64; реальные
адаптеры реализованы T003–T005; живые проверки остаются отдельной приёмкой.
Claude допускает Esc только при свежем подтверждённом рабочем экране, без диалогов;
Codex адресует конкретный native turn и ждёт terminal status; Kimi использует только
сервер Kit, тот же prompt и стабильный idle/свободный замок, без takeover.
Тайм-аут адаптера и типизированный HTTP timeout Kimi становятся HTTP 504 с подсказкой
(T008/T009); обычный сбой — 502. Изменения включены в локальную поставку 0.10.0; живая приёмка отдельно.
Проверенные факты и границы — [M24 evidence](../evidence/M24-acceptance.md).

## Параметры сессии (M25)

`Provider.readParameters?` и `updateParameters?` обмениваются `SessionParameters` /
`ParameterChange` через публичный вход `provider-registry`. Порядок, подписи, стиль,
контекст, лимиты и варианты принадлежат провайдеру. `options` — доступные изменения,
`reason` — причина отсутствия вариантов; `editable` означает наличие вариантов хотя бы
у одного параметра. Capabilities `sessionParameters` / `updateParameters` — явные.

GET/POST `…/sessions/:sid/parameters` сначала находят сессию проекта по localId или remoteId;
адаптер получает localId. Без метода GET возвращает `{ supported: false }`, POST — 404
`parameters-unsupported`. POST проверяет `{ change }` (известные поля, строки ≤128,
хотя бы один параметр), сериализует изменения одной сессии и пишет эффективные old/new
в `provider.parameters.changed`. Ошибки: 400 `parameter-invalid`, 409
`confirmation-required` с confirm, 503 `parameters-unavailable` с hint.

Общие `snapshotFile`/`limitsFile`, `readSnapshot`/`writeSnapshot` хранят атомарные снимки
под `<state>/session-parameters/`, проверяя идентификаторы. `createJsonlTail` читает
новейшие записи блоками 1 МиБ до 256 МиБ, затем дописанное, сохраняя редкие значения;
неполная строка ждёт дописывания. Контракт одинаков на macOS, Linux и Windows x64/ARM64;
программ ОС не вызывает. Подробности — `provider-registry/module.md`.

M28: `ContextUsage.modelWindowTokens?` — окно модели, когда провайдер считает контекст от
меньшего порога. Claude: `wfk statusline` добавляет в снимок `context_window.auto_compact_window`
и `auto_compact_source` (`env`, `managed`, `project-local`, `project`, `user`);
`windowTokens` — порог, `usedPercent = round(total_input_tokens / порог × 100)`. Подсказка
панели — вторая строка «Окно модели: … · автосжатие: …». Codex поле не заполняет.

M28/T003: границы хода сессии панели Claude — `<debug>.turn` `{ version: 1, state:
'working' | 'idle', at, source: 'hook' | 'interrupt' }`; пишут провайдер (prompt- и Stop-хуки)
и хост (подтверждённое экраном прерывание, Stop-хука после Esc нет), побеждает новейший
`at`. `Provider.nativeControlHook` больше не возвращает `true`: хук во время транзакции
параметров отменяет её и доходит до канала.

## Данные на диске

Каталоги (`data-store`): macOS `~/Library/Application Support/Workflow Kit`; Linux
`$XDG_CONFIG_HOME`, `$XDG_STATE_HOME`, `$XDG_DATA_HOME` + `workflow-kit`; Windows
`%LOCALAPPDATA%\Workflow Kit`; `WFK_DATA_DIR` — всё (экземпляр разработки). Файлы: `config.json` (порт 4747,
корень проектов, `programs`, `loginPath`), `projects.json`, `events.jsonl`
(ротация 5 МиБ), `processes.json`, `sessions/claude.json`,
`sessions/codex.json`, `logs/`, `backups/` (последние 10 копий на файл),
`app/<версия>/` и `app/current.json`. Права каталогов 0700, файлов 0600.
В папке проекта (веха 2): `.workflow-kit/local/sessions/<клиент>.<id>.json`
(имя, тема, архив, ревью сессии), журнал хука
`.workflow-kit/local/sessions.jsonl`, `.harness/**` (только команды Kit).

## Нативные контролы M26

Общий SessionParameters.presentation описывает effort-card, speedHint и отдельный access;
клиент не проверяет имя провайдера. ParameterChange.access — opaque id; смешивать с
legacy permissions нельзя. Codex проверяет профили, policy, reviewer и feature перед
записью, подтверждает результат по полному набору метаданных. Аудит содержит старые/новые
поля. Старые провайдеры и клиенты сохраняют API M25. Подробности — parameters.md модулей.

Панель M26: один native popup одновременно, отдельные access/effort якоря;
модели открываются отдельным списком под editor. Один POST по завершении жеста,
Esc/pointercancel отменяют preview, polling и старые GET не перезаписывают его.
Confirm выполняется до POST полного доступа; все изменения блокируются на время
записи. Общий код трёх ОС, 44px для touch; эталоны/ограничения — [Design QA](../../design-qa.md).

## Native host admission (M27/T002)

#pty-host экспортирует NativeControlArbiter: независимый FIFO по opaque key, очередь
освобождается после результата/ошибки action. AbortSignal отменяет admission, но не
освобождает начатую lease до завершения native операции. Provider Claude держит
один экземпляр на runtime; debugFile объединяет local/remote aliases. Stop имеет
исходный deadline и epoch: ожидание не продлевает timeout и не меняет целевой ход.
Клавиши/ACK/барьер/файлы управления прежние; новые parameter setters — отдельная T003.
Поведение одинаково macOS/Linux/Windows; injected tests не называются Windows live.

## Claude native parameters (M27/T003)

`controlHostId` привязывает per-launch statusline и bounded request/state/result
к живому собственному процессу. UUID/session/epoch/expires, floor + frame, пустой
idle и native ACK/read-back обязательны. Команды закрытого набора, model/effort
только `s`; fast без доказанного session-local пути отказывает. Общий engine через
expect и ConPTY не меняет defaults, не вызывает inference и не перезапускает Claude.
Provider.nativeControlHook проверяется до канала/autopilot; неожиданные control hooks
не получают очередь и не начинают ход. Send/Stop используют общий арбитр T002.

M27/T004: ParameterPresentation — discriminated effort-card/claude-controls;
Ultracode on/off только Claude. Opaque model options отмечаются selected/group,
item.value остаётся effective id. POST Claude — одно поле, native read-back всего
набора; 400/409/503/504 явно сохраняются. Codex отклоняет чужой ключ до RPC.

M27/T005: claude-controls выбирает собственные nested model/Effort/More models и
Mode menus; keyed DOM, один popup, границы visualViewport, touch 44px. Нет slider
Claude; M26 effort-card/drag остаётся отдельным представлением. Успех без подстрочника.

M27/T006: stable frame200мс; statusline событийный и bound to host; model/effort
ACK требует новый report. Discovery понимает singular hidden row, setter не портит
полный каталог, внешняя смена модели инвалидирует связанные опции; no-op без ввода.
