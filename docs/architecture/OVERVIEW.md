# Workflow Kit — обзор архитектуры

Состояние: вехи M1–M15 приняты (приёмки — [docs/evidence/](../evidence/)), версия 0.8.2. Документ
поддерживает задача DOCS каждого раунда; подробности — в контрактах модулей
(`module.md`). Спецификации вех и факты о провайдерах — в `docs/planning/`.

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
- Проверки: `npm run typecheck`, `npm test`, `npm run check:platforms`
  (`tools/platform-guard`: платформа параметром, программы ОС в `allowlist.json`,
  раздел «Поведение на ОС» в спецификациях); CI — macOS, Linux, Windows x64 и ARM64.

## Части, кластеры, модули

| Часть | Кластер | Модуль | Обязанность |
| --- | --- | --- | --- |
| [backend-core](../../product-parts/backend-core/product-part.md) | [runtime](../../product-parts/backend-core/clusters/runtime/cluster.md) | [cli](../../product-parts/backend-core/clusters/runtime/modules/cli/module.md) | `bin/wfk.mjs`, команды `wfk` (в том числе `link` и `hook`), `createApp`, раздел `system` |
| | | [data-store](../../product-parts/backend-core/clusters/runtime/modules/data-store/module.md) | каталоги по ОС, `config.json`, атомарная запись, журнал событий, мьютексы, операции, копии чужих конфигов |
| | [http-api](../../product-parts/backend-core/clusters/http-api/cluster.md) | [http-server](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md) | HTTP, фильтр доступа (D8), реестр маршрутов и разделов `/api/state`, раздача панели |
| | [projects](../../product-parts/backend-core/clusters/projects/cluster.md) | [project-registry](../../product-parts/backend-core/clusters/projects/modules/project-registry/module.md) | `projects.json`, проверка имён и путей, выбор папки |
| | | [kit-structure](../../product-parts/backend-core/clusters/projects/modules/kit-structure/module.md) | структура Kit v2 в папке проекта, хуки агентов, приём хука SessionStart |
| | | [git-publish](../../product-parts/backend-core/clusters/projects/modules/git-publish/module.md) | push при закрытом scope |
| | | [project-setup](../../product-parts/backend-core/clusters/projects/modules/project-setup/module.md) | мастер проекта: предпросмотр и одно согласие — git, структура, Kit 2.2.2, доверие, хуки, первая сессия |
| [provider-runtime](../../product-parts/provider-runtime/product-part.md) | [provider-contract](../../product-parts/provider-runtime/clusters/provider-contract/cluster.md) | [provider-registry](../../product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md) | контракт провайдера, реестр, журнал хука, токены предпросмотра, маршруты провайдеров |
| | | [process-supervisor](../../product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md) | запуск, учёт и остановка процессов (D5, D9), исполнитель внешних программ |
| | | [pty-host](../../product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md) | ConPTY на Windows (node-pty 1.1.0) |
| | [provider-adapters](../../product-parts/provider-runtime/clusters/provider-adapters/cluster.md) | [provider-claude](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md) | доверие (`~/.claude.json`, импорты CLAUDE.md), сессии Remote Control, окружение папки (pty) |
| | | [provider-codex](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md) | демон app-server, доверие, одобрение хука Kit, сессии (треды; после служебного хода — `thread/unsubscribe`) |
| | | [provider-kimi](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md) | сервер приложения или `kimi web`, доверие, хук, сессии, ссылки |
| [workflow-engine](../../product-parts/workflow-engine/product-part.md) | [kit-host](../../product-parts/workflow-engine/clusters/kit-host/cluster.md) | [kit-bundle](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md) | вендорный бандл Kit 2.2.2 с проверкой хеша |
| | | [kit-runner](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md) | команды Kit проекта, установка, слежение за планом, раздел `workflow` |
| | | [plan-view](../../product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md) | модели карточек плана и выбора пути (порт правил Harness) |
| | [session-loop](../../product-parts/workflow-engine/clusters/session-loop/cluster.md) | [agent-channel](../../product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md) | хуки `Stop`/`UserPromptSubmit`, очередь сообщений агенту, удержание и конец хода, активность |
| | | [autopilot](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md) | «продолжать, держать или отпустить» после хода; действия с планом из панели |
| | | [plan-review](../../product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md) | решение о ревью и вопрос о плане |
| | | [cross-review](../../product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md) | ревью плана сессией другого провайдера (M4) |
| | | [session-titles](../../product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md) | имена сессий, синхронизация с ChatGPT, архив сессий |
| [control-panel](../../product-parts/control-panel/product-part.md) | [web-panel](../../product-parts/control-panel/clusters/web-panel/cluster.md) | [panel-shell](../../product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md) | раскладка по макету, маршруты, опрос, дерево проектов и сессий, «Настройки», слоты расширений, экран «Домой» iPad |
| | | [project-wizard](../../product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md) | мастер проекта в панели: предпросмотр, кнопки первой сессии, шаги подготовки, открытие чата |
| | | [session-view](../../product-parts/control-panel/clusters/web-panel/modules/session-view/module.md) | экран сессии: активность агента, выбор пути, карточка плана, вопрос о плане |
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
`projectWizardMount()` и `sessionViewMount()` под своими префиксами),
журнал событий, мьютекс, реестр проектов, операции, учёт процессов и реестр провайдеров из фабрик
`DEFAULT_PROVIDERS` (`provider-codex`, `provider-claude`,
`provider-kimi`). `start()` пишет событие `service.started` и запускает
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
выборы `choices` — решения пользователя до «Доверять»; ответы приходят в
`grantTrust(project, token, choices)`. Пометка `inherited` (в предпросмотре и в состоянии
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
`config.json` (D12), ставит запускатель, значок и автозапуск при входе
пользователя, запускает службу.
Установка по ОС — [руководство](../installation.md). Контракт —
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
stop|prompt|turn-end` идут в `agent-channel` (`POST /api/hooks/…`, только
loopback): `Stop` держится до 9 минут, пока пользователь решает в панели;
провайдеру, чей `Stop` не удержать (`turn-end`), следующее сообщение уходит
промптом, когда сессия свободна; `autopilot`
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
`registerSlot`. Карточек провайдеров и «Структуры Kit» в «Настройках» нет
(2026-11-06): действия провайдеров показывает мастер проекта, архив — карточка
«Архив». Контракты —
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
| Запускатель и значок | `~/.local/bin/wfk`, `~/Applications/Workflow Kit.app` | `~/.local/bin/wfk`, `.desktop` | `wfk.cmd`, `wfk`, `wfk.mjs`, PATH, «Пуск» |
| Claude: доверие (запись `~/.claude.json`) | да | да | да |
| Claude: сессии, окружение (pty) | да | если есть `expect` | да, ConPTY (`pty-host`) |
| Codex: демон, доверие, хуки, сессии | да | да | да, Codex 0.160+, через `proxy` |
| Codex: управление — приложению ChatGPT | да, `ps`; не в режиме общего демона | нет приложения | CIM codex.exe (**П**) |
| Codex: общий демон (M12/M13, SSH `wfk-local`) | да, Kit настраивает | `unsupported` | Kit + скрипт администратора; нужен UAC (M14) |
| Kimi: серверы, сессии, исполнители | да | тесты (**П**) | тесты (**П**) |
| Kimi: хук Kit в `config.toml` | `/bin/sh` | то же, тесты | `cmd.exe`, тесты (**П**) |
| Kimi: приложение, проект в нём | `open -a`, `--workspace` | `xdg-mime`, `xdg-open` | `reg`, `--workspace` (**П**) |
| Запуск и остановка процессов сессий | да | да | да (CIM, `taskkill`) |
| Корни папки проектов (M14) | дом, `/Volumes/*` | дом, `/media/<u>/*`, `/run/media/<u>/*`, `/mnt/*` | дом и диски, кроме системного |
| Живые проверки | есть, `docs/evidence/` | нет, только тесты | установка, общий доступ, путь до запуска плана (M13–M16) |

## Известные ограничения

- Основная проверенная ОС — macOS. Linux и Windows проверены тестами и CI с подставными
  программами; Windows проверен и вживую (M13–M16). На Linux Claude требует `expect`, чаты ChatGPT и Claude служба не открывает.
- macOS: установка проверена в M3/M4; окно значка собирается через `swiftc`,
  без сборки открывается браузер. Windows/Linux открывают окно браузера (Windows — сначала
  Chrome, M14).
- Прерванные сессии Claude поднимаются при старте службы и открытии, архивные и
  остановленные — нет. Состояние сессии Codex бывает `unknown`; будит её Kit
  (`thread/resume`) только в режиме общего демона (M12/M13, macOS и Windows; опирается на
  недокументированное поведение ChatGPT, Kit проверяет его раз в минуту).
- Сессии канала живут в памяти службы: после перезапуска команды панели будят их снова;
  карточку выбора прячут только сессии проекта у провайдера (M16).
- Доверие Claude записывается в `~/.claude.json`; при неожиданном диалоге
  сессия останавливается с ошибкой без нажатий, лишь на предложение новой функции Kit
  отвечает «Not now» (M15). Codex сохраняет пользовательские политики служебного хода.
- Панель доступна через loopback и Tailscale, без отдельной авторизации.
  Публичное размещение HTTP-панели не предусмотрено. В выборе папки видны имена папок
  домашней папки и других дисков (M14). Удалённый клиент
  зависит от работающего компьютера со службой и связи через Tailscale.
- iPad может не открыть чат сам: щёлкните карточку сессии.
- «Перезапустить службу» и «Диагностика» в панели нет — `wfk service`, `wfk doctor`.
  Операции в памяти пропадают при перезапуске; остановка службы не завершает
  процессы провайдеров.

## Документы

- Спецификации вех: `docs/planning/M*.md` — ядро
  [M1](../planning/M1-orchestrator-core.md), интерфейс [M2](../planning/M2-interface-and-process.md)
  (макет [ui-mockup.html](../design/ui-mockup.html)), [M3](../planning/M3-fixes.md); остальные
  вехи — `docs/planning/M<номер>-*.md`, список — `scripts/workflow context --list`.
- Контракт провайдера, факты о Claude и Codex: [M1-providers.md](../planning/M1-providers.md);
  первая приёмка: [M1-acceptance.md](../evidence/M1-acceptance.md).
- [README.md](../../README.md), [установка по ОС](../installation.md), [CHANGELOG.md](../../CHANGELOG.md).
