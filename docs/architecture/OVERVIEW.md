# Workflow Kit — обзор архитектуры

Состояние после вехи 1 (`m1-orchestrator-core`, раунд R2 — исправления
дефектов D1–D3 первой приёмки на Mac, см.
[M1-acceptance.md](../evidence/M1-acceptance.md); повторная приёмка
впереди). Документ
поддерживает задача DOCS каждого раунда; подробности — в контрактах модулей
(`module.md`), на которые он ссылается. Спецификация вехи и проверенные
факты о провайдерах пока лежат в `docs/planning/` (после приёмки вехи
действующее содержание переносится сюда, а временные документы удаляются).

## Что это

Бэкенд-служба пользователя (Node 24, TypeScript без сборки, без
runtime-зависимостей) и веб-панель для Mac и iPad. Служба ведёт реестр
проектов, ставит структуру Kit в папку проекта, работает с Claude и
ChatGPT/Codex через общий контракт провайдера и сама устанавливается как
служба с автозапуском. Своего чата нет: сессии открываются в родных
приложениях по ссылкам.

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
| | | [kit-structure](../../product-parts/backend-core/clusters/projects/modules/kit-structure/module.md) | структура Kit v1 в папке проекта, приём хука SessionStart |
| [provider-runtime](../../product-parts/provider-runtime/product-part.md) | [provider-contract](../../product-parts/provider-runtime/clusters/provider-contract/cluster.md) | [provider-registry](../../product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md) | контракт провайдера, реестр, журнал хука, токены предпросмотра, маршруты провайдеров |
| | | [process-supervisor](../../product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md) | запуск, учёт и остановка процессов (D5, D9), исполнитель внешних программ |
| | [provider-adapters](../../product-parts/provider-runtime/clusters/provider-adapters/cluster.md) | [provider-claude](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md) | доверие (прямая запись `~/.claude.json`, выбор о внешних импортах CLAUDE.md), сессии Remote Control, окружение папки (pty через `expect`) |
| | | [provider-codex](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md) | демон app-server, доверие, одобрение хука Kit, сессии (треды; после служебного хода — `thread/unsubscribe`) |
| [control-panel](../../product-parts/control-panel/product-part.md) | [web-panel](../../product-parts/control-panel/clusters/web-panel/cluster.md) | [panel-shell](../../product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md) | каркас панели, опрос, реестр карточек, «Система», «Проекты», «Структура Kit» |
| | | [provider-cards](../../product-parts/control-panel/clusters/web-panel/modules/provider-cards/module.md) | карточки провайдеров только из контракта и операций |
| [system-service](../../product-parts/system-service/product-part.md) | [deployment](../../product-parts/system-service/clusters/deployment/cluster.md) | [service-installer](../../product-parts/system-service/clusters/deployment/modules/service-installer/module.md) | `install`/`uninstall`, автозапуск, запускатель и значок, `service`, `open`, `doctor`, статус службы |

Зависимости (по импортам `#…`): `data-store` и `http-server` ни от кого не
зависят; `process-supervisor` → `data-store`; `project-registry` →
`data-store`, `http-server`; `kit-structure` → они же и `project-registry`;
`provider-registry` → они же и `kit-structure`, `process-supervisor`;
провайдеры → `provider-registry`, `process-supervisor`, `kit-structure`,
`data-store`; `service-installer` → `data-store`, `process-supervisor`.
Модули панели серверного кода не импортируют. Только `cli` знает обо всех и
собирает их.

## Основные контракты

### Сборка приложения (`cli`)

`createApp(options?)` создаёт каталоги данных (0700), читает конфиг и
собирает: реестр маршрутов и реестр разделов состояния (`http-server`),
HTTP-сервер с панелью (`panelShellMount()` в корне,
`providerCardsMount()` под `/provider-cards/`), журнал событий, мьютекс,
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
`providers` (`provider-registry`), `operations` (`data-store`). Фильтр
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

### Панель (`panel-shell`, `provider-cards`)

Опрос `GET /api/state` раз в 3 с; карточки регистрируются
`registerCard`/`registerCardGroup`; расширения других каталогов
подключаются через `PANEL_EXTENSIONS` и `install(shell)`. Карточки
провайдеров строятся только из контракта и раздела `operations`, без
условий по id провайдера. Контракты —
[panel-shell/module.md](../../product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md),
[provider-cards/module.md](../../product-parts/control-panel/clusters/web-panel/modules/provider-cards/module.md).

## Данные на диске

Каталоги (`data-store`): macOS `~/Library/Application Support/Workflow Kit`;
Linux `$XDG_CONFIG_HOME`, `$XDG_STATE_HOME`, `$XDG_DATA_HOME` +
`workflow-kit`; Windows `%LOCALAPPDATA%\Workflow Kit`; `WFK_DATA_DIR`
переопределяет всё (экземпляр разработки). Файлы: `config.json` (порт 4747,
корень проектов, `programs`, `loginPath`), `projects.json`, `events.jsonl`
(ротация 5 МиБ), `processes.json`, `sessions/claude.json`,
`sessions/codex.json`, `logs/`, `backups/` (последние 10 копий на файл),
`app/<версия>/` и `app/current.json`. Права каталогов 0700, файлов 0600.

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
- Доступ к панели — только loopback и Tailscale, без авторизации (веха 2).

## Документы

- Спецификация вехи 1: [docs/planning/M1-orchestrator-core.md](../planning/M1-orchestrator-core.md).
- Контракт провайдера и факты о Claude и Codex: [docs/planning/M1-providers.md](../planning/M1-providers.md).
- Первая приёмка на Mac и найденные дефекты: [docs/evidence/M1-acceptance.md](../evidence/M1-acceptance.md).
- Запуск и установка: [README.md](../../README.md).
