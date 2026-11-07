# Workflow Kit — обзор архитектуры

Состояние: веха 2 (`m2-interface-and-process`: процесс Kit 2.2.2 в
проектах, мастер, автопилот, новый интерфейс) принята; веха 3
(`m3-fixes`) — раунды исправлений; R7 — оркестрация подагентами
Claude и ChatGPT, R8 — «Сообщение агенту»
([M3-orchestration.md](../planning/M3-orchestration.md)). Веха 1 (`m1-orchestrator-core`) — с
исправлениями D1–D3 первой приёмки
([M1-acceptance.md](../evidence/M1-acceptance.md)). Документ
поддерживает задача DOCS каждого раунда; подробности — в контрактах модулей
(`module.md`), на которые он ссылается. Спецификация вехи и проверенные
факты о провайдерах пока лежат в `docs/planning/` (после приёмки вехи
действующее содержание переносится сюда, а временные документы удаляются).

## Что это

Бэкенд-служба пользователя (Node 24, TypeScript без сборки, без
runtime-зависимостей) и веб-панель для Mac и iPad. Служба ведёт реестр
проектов, ставит структуру Kit и процесс Harness Workflow Kit 2.2.2 в папку
проекта, работает с Claude и ChatGPT/Codex через общий контракт провайдера
и сама устанавливается как служба с автозапуском. Своего чата нет: сессии
открываются в родных приложениях по ссылкам, а связь с агентом идёт через
хуки `Stop` и `UserPromptSubmit` (карточки выбора пути и плана, автопилот).

## Устройство кода

- Дерево `product-parts/<часть>/clusters/<кластер>/modules/<модуль>/`:
  `module.md` (контракт), `src/` (код), `test/*.test.ts` (тесты). У части —
  `product-part.md`, у кластера — `cluster.md`.
- Модули видят друг друга только через `src/index.ts` по `#`-алиасам поля
  `imports` в `package.json`. Контракт модуля меняется в том же коммите,
  что и его код. Лимит файла — 400 строк.
- Точка входа `bin/wfk.mjs` (модуль `cli`) проверяет Node ≥ 24 и загружает
  `#cli`. Панель — статические ES-модули из `src/` модулей `control-panel`,
  их JS проверяется `tsc` через JSDoc.
- Проверки: `npm run typecheck`, `npm test`
  (`node --test "product-parts/**/test/*.test.ts"`).

## Части, кластеры, модули

| Часть | Кластер | Модуль | Обязанность |
| --- | --- | --- | --- |
| [backend-core](../../product-parts/backend-core/product-part.md) | [runtime](../../product-parts/backend-core/clusters/runtime/cluster.md) | [cli](../../product-parts/backend-core/clusters/runtime/modules/cli/module.md) | `bin/wfk.mjs`, команды `wfk` (в том числе `link` и `hook`), `createApp`, раздел `system` |
| | | [data-store](../../product-parts/backend-core/clusters/runtime/modules/data-store/module.md) | каталоги по ОС, `config.json`, атомарная запись, журнал событий, мьютексы, операции, копии чужих конфигов |
| | [http-api](../../product-parts/backend-core/clusters/http-api/cluster.md) | [http-server](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md) | HTTP, фильтр доступа (D8), реестр маршрутов и разделов `/api/state`, раздача панели |
| | [projects](../../product-parts/backend-core/clusters/projects/cluster.md) | [project-registry](../../product-parts/backend-core/clusters/projects/modules/project-registry/module.md) | `projects.json`, проверка имён и путей, выбор папки |
| | | [kit-structure](../../product-parts/backend-core/clusters/projects/modules/kit-structure/module.md) | структура Kit v2 в папке проекта (хуки SessionStart, Stop, UserPromptSubmit), приём хука SessionStart |
| | | [project-setup](../../product-parts/backend-core/clusters/projects/modules/project-setup/module.md) | мастер проекта: предпросмотр и одно согласие — git, структура, Kit 2.2.2, доверие, хуки, первая сессия |
| [provider-runtime](../../product-parts/provider-runtime/product-part.md) | [provider-contract](../../product-parts/provider-runtime/clusters/provider-contract/cluster.md) | [provider-registry](../../product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md) | контракт провайдера, реестр, журнал хука, токены предпросмотра, маршруты провайдеров |
| | | [process-supervisor](../../product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md) | запуск, учёт и остановка процессов (D5, D9), исполнитель внешних программ |
| | [provider-adapters](../../product-parts/provider-runtime/clusters/provider-adapters/cluster.md) | [provider-claude](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md) | доверие (прямая запись `~/.claude.json`, выбор о внешних импортах CLAUDE.md), сессии Remote Control, окружение папки (pty через `expect`) |
| | | [provider-codex](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md) | демон app-server, доверие, одобрение хука Kit, сессии (треды; после служебного хода — `thread/unsubscribe`) |
| [workflow-engine](../../product-parts/workflow-engine/product-part.md) | [kit-host](../../product-parts/workflow-engine/clusters/kit-host/cluster.md) | [kit-bundle](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md) | вендорный бандл Kit 2.2.2 с проверкой хеша |
| | | [kit-runner](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md) | команды Kit проекта, установка, слежение за планом, раздел `workflow` |
| | | [plan-view](../../product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md) | модели карточек плана и выбора пути (порт правил Harness) |
| | [session-loop](../../product-parts/workflow-engine/clusters/session-loop/cluster.md) | [agent-channel](../../product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md) | хуки `Stop`/`UserPromptSubmit`, очередь сообщений агенту, удержание хода, активность |
| | | [autopilot](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md) | «продолжать, держать или отпустить» после хода; действия с планом из панели |
| | | [plan-review](../../product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md) | переключатель «Ревью плана» сессии (без самой функции ревью) |
| | | [session-titles](../../product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md) | имена сессий (ручное, тема агента, цель плана), синхронизация с ChatGPT, архив сессий |
| [control-panel](../../product-parts/control-panel/product-part.md) | [web-panel](../../product-parts/control-panel/clusters/web-panel/cluster.md) | [panel-shell](../../product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md) | раскладка по макету, маршруты, опрос, дерево проектов и сессий, «Настройки», слоты расширений, экран «Домой» iPad |
| | | [project-wizard](../../product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md) | мастер проекта в панели: предпросмотр, кнопки первой сессии, шаги подготовки, открытие чата |
| | | [session-view](../../product-parts/control-panel/clusters/web-panel/modules/session-view/module.md) | экран сессии: активность агента, выбор пути, карточка плана, «Ревью плана» |
| [system-service](../../product-parts/system-service/product-part.md) | [deployment](../../product-parts/system-service/clusters/deployment/cluster.md) | [service-installer](../../product-parts/system-service/clusters/deployment/modules/service-installer/module.md) | `install`/`uninstall`, автозапуск, запускатель и значок, `service`, `open`, `doctor`, статус службы |

Зависимости (по импортам `#…`): `data-store` и `http-server` ни от кого не
зависят; `process-supervisor` → `data-store`; `project-registry` →
`data-store`, `http-server`; `kit-structure` → они же и `project-registry`;
`provider-registry` → они же и `kit-structure`, `process-supervisor`;
провайдеры → `provider-registry`, `process-supervisor`, `kit-structure`,
`data-store`; `service-installer` → `data-store`, `process-supervisor`.
Веха 2: `plan-view` ни от кого не зависит; `kit-bundle` → `data-store`;
`kit-runner` → `plan-view`, `process-supervisor`; `agent-channel` →
`http-server`; `autopilot` → `agent-channel`, `kit-runner`, `plan-view`,
`data-store`, `http-server`; `plan-review` и `session-titles` →
`data-store`, `http-server`; `project-setup` → `kit-runner`,
`kit-structure`, `project-registry`, `provider-registry`,
`process-supervisor`, `data-store`, `http-server`.
Модули панели серверного кода не импортируют. Только `cli` знает обо всех и
собирает их.

## Основные контракты

### Сборка приложения (`cli`)

`createApp(options?)` создаёт каталоги данных (0700), читает конфиг и
собирает: реестр маршрутов и реестр разделов состояния (`http-server`),
HTTP-сервер с панелью (`panelShellMount()` в корне,
`providerCardsMount()`, `projectWizardMount()`, `sessionViewMount()` под
своими префиксами), журнал событий, мьютекс,
реестр проектов, операции, учёт процессов и реестр провайдеров из фабрик
`DEFAULT_PROVIDERS` (`createProvider` модулей `provider-claude` и
`provider-codex`). `start()` пишет событие `service.started` и запускает
операцию `providers.refresh`. Новые возможности подключаются регистрацией в
`app.router` и `app.state` внутри `createApp`. Команды службы `cli`
передаёт в `runServiceCommand` (`service-installer`). Контракт —
[cli/module.md](../../product-parts/backend-core/clusters/runtime/modules/cli/module.md).

### Реестр маршрутов и разделов состояния (`http-server`)

`createRouter()` — маршруты с `:name`, ответ — JSON, ошибки
`{ error: { code, message, ...details } }` через `HttpError`.
`createStateRegistry()` — разделы `GET /api/state`; упавший раздел даёт
`{ error }`, остальные отдаются. Разделы вехи 1: `system` (`cli`),
`projects` (`project-registry`), `structure` (`kit-structure`),
`providers` (`provider-registry`), `operations` (`data-store`); вехи 2:
`workflow` (`kit-runner`), `channel` (`agent-channel`), `autopilot`,
`review` (`plan-review`), `titles` (`session-titles`), `setup`
(`project-setup`). Фильтр
доступа D8: только loopback и Tailscale (адрес клиента и локальный адрес),
`Host` из списка, для изменяющих запросов — `Origin` и JSON. Контракт —
[http-server/module.md](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md).

### Контракт провайдера (`provider-registry`)

Интерфейс `Provider` (`status`, `capabilities`, `trust`, `previewTrust`,
`grantTrust`, `hooks`, `approveHooks?`, `listSessions`, `createSession`,
`resumeSession?`, `stopSession?`, `actions`, `runAction`, `refresh?`,
`removeBlockers?`) и фабрика `createProvider(context)` из `src/index.ts`
модуля провайдера. Методы чтения дёшевы и только читают (D11). Запись в
чужие конфиги — по одноразовому токену предпросмотра, связанному с
отпечатком показанного (D7). Предпросмотр (`TrustPreview`) может содержать
выборы `choices` — решения пользователя до «Доверять», без ответа по
умолчанию; ответы приходят в `grantTrust(project, token, choices)`
(`POST …/trust { token, choices }`), и панель не отправляет «Доверять» без
обязательного ответа. Пометка `inherited` (в предпросмотре и в состоянии
доверия) говорит, что доверена только родительская папка. Модуль даёт маршруты провайдеров, раздел
`providers` и чтение журнала хука `.workflow-kit/local/sessions.jsonl`.
Сервер и панель о конкретных провайдерах не знают. Контракт —
[provider-registry/module.md](../../product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md);
факты о Claude и Codex — `docs/planning/M1-providers.md`.

### Операции (D10, `data-store`)

`createOperations()` — долгие действия в памяти: POST сразу отвечает 202
`{ operationId, operation, existing }`, ход и итог видны в разделе
`operations`; повтор с тем же ключом возвращает идущую операцию. Действия
идут под мьютексами `provider:<p>` и `project:<id>`, итог пишется в
`events.jsonl`. Контракт —
[data-store/module.md](../../product-parts/backend-core/clusters/runtime/modules/data-store/module.md).

### Процессы (`process-supervisor`)

`createProcessSupervisor({ file })` над `<state>/processes.json`:
`spawn` (своя группа, вывод в файл, окружение без `CLAUDE*`, D5), `track`,
`check`/`quickCheck`, `stop` (сверка pid, времени старта, командной строки
и boot id; TERM, ожидание, KILL; без `pkill`, D9), `reconcile` при старте и
по `/api/refresh`. `runCommand` — внедряемый исполнитель внешних программ
без shell. Контракт —
[process-supervisor/module.md](../../product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md).

### Служба (`service-installer`)

`runServiceCommand(command, context, args)` выполняет `install`,
`uninstall`, `start`, `stop`, `status`, `open`, `doctor [--installed]` и
никогда не бросает (`{ ok, exitCode, message }`); эффекты (`fs`, `run`,
`spawnDetached`, `health`) внедряются. `getServiceStatus(platform,
context)` только читает файлы и наполняет `system.service` для карточки
«Система». `install` копирует `bin`, `product-parts`, `package.json` в
`app/<версия>/`, пишет `app/current.json`, пути программ и login PATH в
`config.json` (D12), ставит запускатель, значок и автозапуск. Контракт —
[service-installer/module.md](../../product-parts/system-service/clusters/deployment/modules/service-installer/module.md).

### Структура Kit и хук (`kit-structure`)

`checkStructure`/`installStructure` — управляемые фрагменты (раздел
`AGENTS.md` между `<!-- wfk:begin -->` и `<!-- wfk:end -->`, хуки
SessionStart Claude и Codex, блок `.gitignore`, шаблоны, манифест
`.workflow-kit/manifest.json`) со статусами `ok`, `missing`, `modified`,
`outdated`, `newer`. `wfk hook session-start` → `recordSessionStart`
дописывает строку в журнал хука и всегда выходит с кодом 0. Контракт —
[kit-structure/module.md](../../product-parts/backend-core/clusters/projects/modules/kit-structure/module.md).

### Процесс Kit в проекте (`workflow-engine`, веха 2)

Kit 2.2.2 ставится в проект своим бандлом (`install --host harness`), его
команды выполняются отдельным процессом с JSON-ответом (`kit-runner`);
файлы `.harness/**` служба не читает и не пишет. Раздел `workflow` даёт
модели карточки плана и выбора пути (`plan-view`). Хуки агента `wfk hook
stop|prompt` идут в `agent-channel` (`POST /api/hooks/stop|prompt`, только
loopback): `Stop` может держаться до 9 минут, пока пользователь решает в
панели (выбор пути, запуск плана, подтверждение выпуска); `autopilot`
решает, продолжать ли агента, по `autopilot:status` и правилам Harness, а
кнопки панели (`POST /api/projects/:id/workflow/…`) выполняют команды Kit
и сообщают агенту. Имена и архив сессий, переключатель ревью хранятся в
папке проекта (`.workflow-kit/local/sessions/<клиент>.<id>.json`).
Контракты — `module.md` модулей части
[workflow-engine](../../product-parts/workflow-engine/product-part.md).

### Мастер проекта (`project-setup`, веха 2)

`POST /api/setup/preview` только читает и возвращает токен; `POST
/api/setup/apply` по одному согласию делает всё: папку, git, структуру
(отдельный коммит до Kit), Kit 2.2.2, доверие Claude и Codex (выбранному
провайдеру — обязательно, другому — по возможности), одобрение хуков Kit,
первую сессию с первым сообщением агенту. Ход — раздел `setup` и операция
`project.setup`; отмена — перед следующим шагом. Контракт —
[project-setup/module.md](../../product-parts/backend-core/clusters/projects/modules/project-setup/module.md).

### Панель (`panel-shell` и расширения)

Вид — по макету `docs/design/ui-mockup.html`: боковая панель 270 px с
деревом «проект → сессии» и экран справа (уже 680 px — друг под другом),
служебные карточки — в «Настройках», экран «Домой» iPad (manifest,
значки). Опрос `GET /api/state` раз в 3 с. Расширения других каталогов
подключаются через `PANEL_EXTENSIONS` и `install(shell)`: карточки —
`registerCard`/`registerCardGroup`, мастер и экран сессии — слоты
`registerSlot`. Карточек провайдеров и «Структуры Kit» в «Настройках»
нет (решение пользователя 2026-11-06): архив проектов и сессий —
карточка «Архив», действия провайдеров (например, «Запустить демон»)
показывает мастер проекта. Контракты —
[panel-shell/module.md](../../product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md),
[project-wizard/module.md](../../product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md),
[session-view/module.md](../../product-parts/control-panel/clusters/web-panel/modules/session-view/module.md).

## Данные на диске

Каталоги (`data-store`): macOS `~/Library/Application Support/Workflow Kit`;
Linux `$XDG_CONFIG_HOME`, `$XDG_STATE_HOME`, `$XDG_DATA_HOME` +
`workflow-kit`; Windows `%LOCALAPPDATA%\Workflow Kit`; `WFK_DATA_DIR`
переопределяет всё (экземпляр разработки). Файлы: `config.json` (порт 4747,
корень проектов, `programs`, `loginPath`), `projects.json`, `events.jsonl`
(ротация 5 МиБ), `processes.json`, `sessions/claude.json`,
`sessions/codex.json`, `logs/`, `backups/` (последние 10 копий на файл),
`app/<версия>/` и `app/current.json`. Права каталогов 0700, файлов 0600.
В папке проекта (веха 2): `.workflow-kit/local/sessions/<клиент>.<id>.json`
(имя, тема, архив, ревью сессии), журнал хука
`.workflow-kit/local/sessions.jsonl`, среда Kit `.harness/**` (ею
управляют только команды Kit).

## Матрица ОС

| Возможность | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Бэкенд, панель, проекты, структура | да | да | да |
| Автозапуск | LaunchAgent `ai.workflowkit.backend` | systemd user, без systemd — XDG autostart | `HKCU\…\Run` → `WorkflowKit` |
| Запускатель и значок | `~/.local/bin/wfk`, `~/Applications/Workflow Kit.app` | `~/.local/bin/wfk`, `.desktop` | `wfk.cmd` и PATH, ярлык в «Пуске» |
| Claude: доверие (запись `~/.claude.json`) | да | да | нет (Q1) |
| Claude: сессии, окружение (pty) | да | если есть `expect` | нет (Q1) |
| Codex: демон, доверие, хуки, сессии | да | да | нет (Q2) |
| Запуск и остановка процессов сессий | да | да | нет (`unsupported`) |
| Проверено на устройстве в вехе 1 | при приёмке | нет | нет |

## Известные ограничения

- Codex: служебный ход идёт без `sandboxPolicy` и `approvalPolicy` (тред
  сохраняет настройки пользователя), после него — `thread/unsubscribe`
  (дефект D1); что ChatGPT сразу открывает новую сессию на Mac и iPad,
  проверяется при повторной приёмке. Запись доверия и одобрение хука через
  `config/value/write` проверены только на подставных программах
  ([provider-codex](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md)).
- Claude: доверие пишется в `~/.claude.json` напрямую, без запуска
  `claude` (D2, D3); что Claude Code принимает такую запись без диалогов,
  текст настоящего диалога доверия (на машине пользователя он подавлен
  доверием `~`), набор файлов-источников внешних импортов, готовность
  окружения по тексту `environment=<id>` (иначе — через 20 с) и формат
  `bridge-session` в транскрипте проверяются при приёмке. Сессии и
  окружение при любом диалоге Claude останавливаются с ошибкой
  (`trust-dialog`, `imports-dialog`, `unknown-dialog`), клавиши не
  нажимаются
  ([provider-claude](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md)).
- Установщик на macOS (`launchctl bootstrap/bootout`, значок из Finder и
  Dock, окно `--app`) проверяется при приёмке.
- Windows и Linux проверены только тестами на подставных программах (R3):
  `systemctl --user`, XDG autostart, `reg add`, PowerShell. pty Claude на
  Windows (Q1) и демон Codex на Windows (Q2) не поддержаны.
- Сессии Claude после перезагрузки сами не восстанавливаются
  («остановлена» и «Возобновить», Q3); у Codex нет `thread/resume` и
  состояния сессий (`state: unknown`).
- Действий со службой в панели нет (только команды `wfk`); операции
  хранятся в памяти и пропадают при перезапуске службы.
- Доступ к панели — только loopback и Tailscale, без авторизации.
- Веха 2 проверена тестами на настоящем бандле Kit и подставных
  провайдерах; при приёмке проверяются: как приложения показывают
  удерживаемый `Stop`, формат `additionalContext` у Codex, набор первого
  сообщения в TUI Claude, имена сессий в приложениях (Claude — `/rename`
  в терминале сессии вне хода, запасной путь — `sessionTitle` хука;
  ChatGPT — `thread/name/set`), автоматическое
  открытие чата на iPad (браузер может не дать открыть вкладку без
  нажатия — тогда кнопка «Открыть чат»). Функции ревью плана нет — только
  переключатель. «Перезапустить службу» и «Диагностика» в «Настройках»
  пока не сделаны.

## Документы

- Спецификация вехи 1: [docs/planning/M1-orchestrator-core.md](../planning/M1-orchestrator-core.md).
- Спецификация вехи 3: [docs/planning/M3-fixes.md](../planning/M3-fixes.md).
- Спецификация вехи 2: [docs/planning/M2-interface-and-process.md](../planning/M2-interface-and-process.md);
  макет: [docs/design/ui-mockup.html](../design/ui-mockup.html).
- Контракт провайдера и факты о Claude и Codex: [docs/planning/M1-providers.md](../planning/M1-providers.md).
- Первая приёмка на Mac и найденные дефекты: [docs/evidence/M1-acceptance.md](../evidence/M1-acceptance.md).
- Запуск и установка: [README.md](../../README.md).
