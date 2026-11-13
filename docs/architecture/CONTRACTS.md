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
`resumeSession?`, `stopSession?`, `readMessages?`, `sendDirect?`, `marksPanelProcess?`, `actions`, `runAction`,
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
адаптеры и живые проверки поставляются отдельными задачами T003–T005.
