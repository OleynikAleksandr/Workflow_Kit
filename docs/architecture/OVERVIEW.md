# Workflow Kit — обзор архитектуры

Состояние: вехи M1–M18 приняты (приёмки — [docs/evidence/](../evidence/)), версия 0.13.0. Документ
ведёт задача DOCS каждого раунда; подробности — в `module.md` модулей, спецификации вех и
факты о провайдерах — в `docs/planning/`. M24 включена в локальную поставку 0.10.0; пользовательская приёмка ещё не выполнена.

M26 включена в 0.12.1: нативные карточка усилия, список моделей и отдельный доступ
ChatGPT. QA passed; CI точного SHA и живая приёмка отдельно —
[доказательства M26](../evidence/M26-native-controls.md).

M27 в 0.13.0: Claude native model/Effort/Ultracode/Mode, guarded host и nested menus.
Native macOS и visual QA пройдены; CI точного SHA и пользовательская приёмка отдельно.

## Что это

Бэкенд-служба пользователя (Node 24, TypeScript без сборки, без
runtime-зависимостей) и веб-панель для Mac и iPad. Служба ведёт реестр
проектов, ставит структуру Kit и процесс Harness Workflow Kit 2.2.4 (собирается здесь из
`kit-core`, M22) в папку проекта, показывает версию Kit проекта и обновляет устаревший Kit
кнопкой «Обновить Kit», работает с Claude, ChatGPT/Codex и Kimi Code через общий контракт провайдера
и сама устанавливается как служба с автозапуском. Своего чата нет: сессии
открываются в родных приложениях по ссылкам, панель показывает переписку провайдера (M18),
связь с агентом — хуки `Stop` и `UserPromptSubmit` (карточки пути и плана, автопилот) или
прямая реплика.

## Устройство кода

- Дерево `product-parts/<часть>/clusters/<кластер>/modules/<модуль>/`: `module.md`
  (контракт), `src/`, `test/*.test.ts`; у части — `product-part.md`, у кластера — `cluster.md`.
  Исключение — исходники Kit (`kit-core`, M22): вход модуля — `src/<модуль>-facade.ts`,
  импорты — относительные `../../<модуль>/src/*.js`, тесты — `test/*.test.mjs`.
- Модули видят друг друга только через `src/index.ts` по `#`-алиасам поля
  `imports` в `package.json`. Контракт модуля меняется в том же коммите,
  что и его код. Лимит файла — 400 строк.
- `bin/wfk.mjs` (модуль `cli`) проверяет Node ≥ 24 и загружает `#cli`. Панель — статические
  ES-модули из `src/` модулей `control-panel`, JS проверяет `tsc` через JSDoc.
- Бандл Kit собирает `npm run build:kit` (`tools/kit-build`, esbuild): из исходников `kit-core` —
  `kit-bundle/vendor/workflow-kit-<версия>.mjs.gz`, `PROVENANCE` и `bundle-meta.ts`; тест
  `tools/kit-build` не пропускает правку исходников Kit без пересборки.
- Проверки: `npm run typecheck`, `npm test` (сначала `test:app`, потом `test:kit`, до 4 процессов в группе — тесты Kit
  и сборки отдельной группой), `npm run check:platforms`
  (`tools/platform-guard`: платформа параметром, программы ОС в `allowlist.json`,
  раздел «Поведение на ОС» в спецификациях); CI — macOS, Linux, Windows x64 и ARM64.

## Части, кластеры, модули

| Часть | Кластер | Модуль | Обязанность |
| --- | --- | --- | --- |
| [backend-core](../../product-parts/backend-core/product-part.md) | [runtime](../../product-parts/backend-core/clusters/runtime/cluster.md) | [cli](../../product-parts/backend-core/clusters/runtime/modules/cli/module.md) | `bin/wfk.mjs`, команды `wfk` (в том числе `link` и `hook`), `createApp`, раздел `system`, прямой путь сообщения |
| | | [data-store](../../product-parts/backend-core/clusters/runtime/modules/data-store/module.md) | каталоги по ОС, `config.json`, атомарная запись, журнал событий, мьютексы, операции, копии чужих конфигов |
| | [http-api](../../product-parts/backend-core/clusters/http-api/cluster.md) | [http-server](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md) | HTTP, фильтр доступа (D8), реестр маршрутов и разделов `/api/state`, раздача панели |
| | [projects](../../product-parts/backend-core/clusters/projects/cluster.md) | [project-registry](../../product-parts/backend-core/clusters/projects/modules/project-registry/module.md) | `projects.json`, проверка имён и путей, выбор папки |
| | | [kit-structure](../../product-parts/backend-core/clusters/projects/modules/kit-structure/module.md) | структура Kit v2 в папке проекта, хуки агентов, приём хука SessionStart |
| | | [git-publish](../../product-parts/backend-core/clusters/projects/modules/git-publish/module.md) | push при закрытом scope |
| | | [project-setup](../../product-parts/backend-core/clusters/projects/modules/project-setup/module.md) | мастер проекта: предпросмотр и одно согласие — git, структура, Kit 2.2.4, доверие, хуки, первая сессия |
| [provider-runtime](../../product-parts/provider-runtime/product-part.md) | [provider-contract](../../product-parts/provider-runtime/clusters/provider-contract/cluster.md) | [provider-registry](../../product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md) | контракт провайдера, реестр, журнал хука, токены предпросмотра, маршруты провайдеров и диалога |
| | | [process-supervisor](../../product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md) | запуск, учёт и остановка процессов (D5, D9), исполнитель внешних программ |
| | | [pty-host](../../product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md) | ConPTY на Windows (node-pty 1.1.0) |
| | [provider-adapters](../../product-parts/provider-runtime/clusters/provider-adapters/cluster.md) | [provider-claude](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md) | доверие (`~/.claude.json`, импорты CLAUDE.md), сессии Remote Control, окружение папки (pty), лента и вставка в терминал |
| | | [provider-codex](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md) | демон app-server, доверие, одобрение хуков Kit, сессии (треды; после служебного хода — `thread/unsubscribe`), лента и прямой ход |
| | | [provider-kimi](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md) | сервер приложения или `kimi web`, доверие, хук, сессии, ссылки, лента |
| [workflow-engine](../../product-parts/workflow-engine/product-part.md) | [kit-host](../../product-parts/workflow-engine/clusters/kit-host/cluster.md) | [kit-bundle](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md) | бандл Kit 2.2.4, собранный из `kit-core`, с проверкой хеша |
| | | [kit-runner](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md) | команды Kit проекта, установка, слежение за планом, раздел `workflow` |
| | | [plan-view](../../product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md) | модели карточек плана и выбора пути (порт правил Harness) |
| | | [kit-update](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md) | версия Kit проекта (раздел `kitUpdate`), «Обновить Kit», одобрение хуков Kit Codex после обновления (M22) |
| | [session-loop](../../product-parts/workflow-engine/clusters/session-loop/cluster.md) | [agent-channel](../../product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md) | хуки `Stop`/`UserPromptSubmit`, очередь сообщений агенту (или `direct`), удержание и конец хода, активность |
| | | [autopilot](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md) | «продолжать, держать или отпустить» после хода; действия с планом из панели |
| | | [plan-review](../../product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md) | решение о ревью и вопрос о плане |
| | | [cross-review](../../product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md) | ревью плана сессией другого провайдера (M4) |
| | | [session-titles](../../product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md) | имена сессий, синхронизация с ChatGPT, архив сессий |
| [control-panel](../../product-parts/control-panel/product-part.md) | [web-panel](../../product-parts/control-panel/clusters/web-panel/cluster.md) | [panel-shell](../../product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md) | раскладка M24, маршруты, опрос, дерево проектов и сессий, «Настройки», слоты расширений, экран «Домой» iPad |
| | | [project-wizard](../../product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md) | мастер проекта в панели: предпросмотр, кнопки первой сессии, шаги подготовки, открытие чата |
| | | [session-view](../../product-parts/control-panel/clusters/web-panel/modules/session-view/module.md) | экран сессии: активность агента, выбор пути, карточка плана, вопрос о плане |
| | | [session-chat](../../product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md) | диалог: лента, компактный ввод, отправка/очередь и Stop (M18/M24) |
| [kit-core](../../product-parts/kit-core/product-part.md) | [project-workflow](../../product-parts/kit-core/clusters/project-workflow/cluster.md) | 12 модулей `workflow-*` (список — в `cluster.md`) | исходники Kit: план, коммиты задач, пакет восстановления, качество, установка и доктор, режимы выполнения; из них собирается бандл |
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
`process-supervisor`, `data-store`, `http-server`; `kit-update` → `http-server`, `kit-bundle`,
`kit-runner`, `provider-registry` (M22).
Модули панели серверного кода не импортируют. Только `cli` знает обо всех и
собирает их. Модули `kit-core` служба не импортирует: Kit работает бандлом отдельным
процессом; между собой модули Kit связаны относительными импортами.

## Основные контракты

Вынесены в [CONTRACTS.md](CONTRACTS.md): Сборка приложения (`cli`); Реестр маршрутов и разделов
состояния (`http-server`); Контракт провайдера (`provider-registry`); Операции (D10,
`data-store`); Процессы (`process-supervisor`); Служба (`service-installer`); Структура Kit и
хук (`kit-structure`); Процесс Kit в проекте (`workflow-engine`, веха 2); Мастер проекта
(`project-setup`, веха 2); Панель (`panel-shell` и расширения).

## Результат M24 в поставке 0.10.0

T001–T006 и fixes T008/T009 завершены; последний функциональный коммит — `2662cb88`.
Диалог ограничен viewport, карточки процесса слева, ввод поддерживает Enter/Stop,
очередь и IME. Подтверждённый Stop завершает только свой ход, канал сам переходит
в waiting без нового хука; барьер удерживает очередь/автопилот/ревью. Явная реплика
снимает барьер доставки, продолжение плана требует штатного «Продолжить».

Адаптеры реализованы: Claude — управляемый pty без диалога, Codex — доступный демон
и точный native turn id (схема 0.167.2), Kimi — сервер Kit с подтверждением idle.
Тесты транспорта и изолированный Chromium не подтверждают живой Stop: macOS/iPad —
пользователь, Windows x64/ARM64 — проверяющий, Linux — CI. Удалённая CI M24 ещё не
запускалась. Пользователь подтвердил спецификацию M24 как основной образец вместо недоступного
второго скриншота. Историческая сверка с изображением не заявляется выполненной.
Подробные [результаты, SHA и снимки](../evidence/M24-acceptance.md).

## Данные на диске

Полная таблица файлов и каталогов — [CONTRACTS.md](CONTRACTS.md#данные-на-диске).

## Матрица ОС

| Возможность | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Бэкенд, панель, проекты, структура | да | да | да |
| Автозапуск | LaunchAgent `ai.workflowkit.backend` | systemd user, без systemd — XDG autostart | `HKCU\…\Run` → `WorkflowKit` |
| Запускатель (его каталог — в PATH службы, M17) и значок | `~/.local/bin/wfk`, `~/Applications/Workflow Kit.app` | `~/.local/bin/wfk`, `.desktop` | `wfk.cmd`, `wfk`, `wfk.mjs`, PATH, «Пуск» |
| Claude: доверие (запись `~/.claude.json`) | да | да | да |
| Claude: сессии, окружение (pty) | да | если есть `expect` | да, ConPTY (`pty-host`) |
| Codex: демон, доверие, хуки, сессии | да | да | да, Codex 0.160+, через `proxy` |
| Codex: управление — приложению ChatGPT | да, `ps`; не в режиме общего демона | нет приложения | CIM codex.exe (**П**) |
| Codex: общий демон (M12/M13, SSH `wfk-local`) | да, Kit настраивает | `unsupported` | Kit + скрипт администратора; нужен UAC (M14) |
| Kimi: серверы, сессии, исполнители | да | тесты (**П**) | тесты (**П**) |
| Kimi: хук Kit в `config.toml` | `/bin/sh` | то же, тесты | `cmd.exe`, тесты (**П**) |
| Kimi: приложение, проект в нём | `open -a`, `--workspace` | `xdg-mime`, `xdg-open` | `reg`, `--workspace` (**П**) |
| Запуск и остановка процессов сессий | да | да | да (CIM, `taskkill`) |
| Kit в проекте (`kit-core`, M22): запускатель, режимы файлов | `scripts/workflow` (sh), 0755 | то же | `workflow.cmd` → `workflow.ps1` (`powershell`), `.cmd` через `cmd.exe`, без режимов |
| Сборка бандла Kit (`npm run build:kit`, M22) | esbuild darwin; проверка через `scripts/workflow` | esbuild linux; то же | esbuild win32 x64/ARM64; проверка — `node` runtime проекта |
| «Обновить Kit» (M22): `install --update`, одобрение хука Codex | да | да | да, хук Codex по `commandWindows` |
| Корни папки проектов (M14) | дом, `/Volumes/*` | дом, `/media/<u>/*`, `/run/media/<u>/*`, `/mnt/*` | дом и диски, кроме системного |
| Диалог (M18): лента; прямая отправка | да; Claude `expect`, ChatGPT при общем доступе | да; Claude `expect`, ChatGPT нет | да, ChatGPT через `proxy`; Claude ConPTY (**П**), ChatGPT при общем доступе |
| Раскладка панели M24: изменяемый сайдбар с карточками, диалог в viewport | одинаковая, браузер | то же | то же, x64/ARM64 |
| Ввод M24: Enter/Stop, очередь, IME, фактическая модель и нейтральные параметры | одинаковые ES-модули; изолированный Chromium, живая проверка macOS/iPad ожидается | тот же код; CI после публикации | тот же код, x64/ARM64; живая проверка ожидается |
| Stop M24 адаптеров: Claude marker, Kimi abort/lock, Codex turn id | expect/HTTP/WebSocket; проверки в evidence M24 | общий код, injected linux; без ChatGPT | ConPTY/proxy/HTTP, injected win32; live ожидается |
| Прерывание ответа M24: API, поколения, барьер очереди/ревью/автопилота | общий контракт реализован; адаптеры T003–T005 отдельно | то же | то же, x64/ARM64 |
| Тайм-аут адаптера Stop (T008): HTTP 504 с подсказкой, барьер сохраняется | общий API, локальный HTTP-тест | тот же код | тот же код, x64/ARM64 |
| Тайм-аут Kimi: типизированный 504, общий deadline; R3 готовит options до запросов | общий HTTP-код, тест гонки | то же, injected linux | то же, injected win32, x64/ARM64 |
| Параметры M25: контракт, очередь, снимки, JSONL | общий Node-код; снимки сериализованы, busy-retry | то же | то же; пути win32 |
| ChatGPT M25: чтение | WebSocket + JSONL, живая проба | то же, injected linux | proxy + JSONL, injected win32 |
| ChatGPT M25: изменение | каталоги и общий доступ, живая проба | то же; общий доступ unsupported | proxy, injected win32 |
| Claude M25: statusline | sh, байты, группа; ожидание close | то же | Git Bash/PowerShell; taskkill /T /F и close |
| Claude M25: запуск и чтение | --settings на запуск, снимок/транскрипт/лимиты | то же, expect | ConPTY --settings, снимки |
| Access M26: preset + policy/reviewer, свежие ограничения | общий RPC, injected darwin | то же, injected linux | proxy, injected win32 |
| Контролы M26/R2: native drag, тихий success; QA passed | общий ES-код, visualViewport | то же | то же, x64/ARM64 |
| Строка M25 и меню параметров | браузер; изолированный Chromium и скриншоты | тот же код | тот же код, x64/ARM64 |
| Живые проверки | есть, `docs/evidence/` | нет, только тесты | установка, общий доступ, путь до запуска плана (M13–M16) |
| Claude M27: native parameters/API/UI | FIFO, expect; native roundtrip/QA passed; nested menus | тот же engine и ES/CSS | ConPTY; UI тот же; live ожидается |
| Claude M28: ход по хукам и прерыванию, доставка без ожидания | expect, фикстуры | injected linux | ConPTY, injected win32 |
| Claude M28: окно по `autoCompactWindow` | managed `/Library/Application Support/ClaudeCode`, `/context` сверен | `/etc/claude-code`, injected linux | `C:\Program Files\ClaudeCode`, injected win32 |

## Известные ограничения

- Основная проверенная ОС — macOS; Linux и Windows — тесты и CI с подставными программами,
  Windows и вживую (M13–M16). На Linux Claude требует `expect`, чаты ChatGPT и Claude служба не открывает.
- macOS: установка проверена в M3/M4; окно значка собирает `swiftc`, без сборки — браузер. Windows/Linux открывают окно браузера (Windows — сначала
  Chrome, M14).
- Прерванные сессии Claude поднимаются при старте службы и открытии экрана (внешняя — кнопкой
  «Продолжить», M19), архивные и остановленные — нет. Сессия Codex бывает `unknown`; Kit будит её (`thread/resume`) только в
  режиме общего демона (M12/M13, macOS и Windows; опирается на
  недокументированное поведение ChatGPT, Kit проверяет его раз в минуту).
- Сессии канала живут в памяти службы: после перезапуска команды панели будят их снова;
  карточку выбора прячут только сессии проекта у провайдера (M16).
- Демон Codex переживает обновления Kit с PATH своего запуска: устаревший панель предлагает
  перезапустить, AGENTS.md новых проектов даёт полный путь `wfk` (M17).
- Доверие Claude записывается в `~/.claude.json`; неожиданный диалог останавливает сессию с
  ошибкой без нажатий, только на предложение новой функции Kit отвечает «Not now» (M15). Codex сохраняет пользовательские политики служебного хода.
- Панель доступна через loopback и Tailscale, без отдельной авторизации, и с M18 отдаёт
  переписку сессий целиком.
  Публичное размещение не предусмотрено. В выборе папки видны имена папок домашней папки и
  других дисков (M14). Удалённому клиенту нужны работающий компьютер и Tailscale.
- Диалог: ChatGPT без общего доступа (на Linux его нет) и сессия Claude вне панели (и под
  сценарием 0.9.0 и старше) получают сообщения только очередью; Claude изредка получает
  сообщение дважды, если управляющий файл забран ровно в тайм-аут; вставка через ConPTY и диалог Kimi вживую не проверены.
- Окно контекста Claude (M28) считается от `autoCompactWindow` из переменной окружения и файлов
  настроек; порог из MDM (plist, реестр) и серверных настроек организации Kit не читает —
  тогда показывается окно модели.
- iPad может не открыть чат сам: щёлкните карточку сессии.
- «Перезапустить службу» и «Диагностика» в панели нет — `wfk service`, `wfk doctor`.
  Операции в памяти пропадают при перезапуске; остановка службы процессы провайдеров не
  завершает.

Раскладка панели реализована в M24: карточки процесса под деревом, независимая прокрутка,
ресайзер и узкий drawer. Классический `docs/design/ui-mockup.html` — исторический макет,
по размещению областей актуальна [спецификация M24](../planning/M24-interface-polish.md).

## Документы

- Спецификации вех — `docs/planning/M<номер>-*.md` (список — `scripts/workflow context --list`):
  ядро [M1](../planning/M1-orchestrator-core.md), интерфейс [M2](../planning/M2-interface-and-process.md)
  (исторический макет [ui-mockup.html](../design/ui-mockup.html), актуальная раскладка — [M24](../planning/M24-interface-polish.md)), [M3](../planning/M3-fixes.md); контракт
  провайдера и факты о Claude и Codex — [M1-providers.md](../planning/M1-providers.md).
- [README.md](../../README.md), [установка по ОС](../installation.md), [CHANGELOG.md](../../CHANGELOG.md).
- Основные контракты модулей — [CONTRACTS.md](CONTRACTS.md); процесс Kit —
  [workflow-kit/WorkflowKit.md](workflow-kit/WorkflowKit.md) и соседние документы.
