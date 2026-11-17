# Workflow Kit — обзор архитектуры

Состояние: вехи M1–M35 приняты (приёмки — [docs/evidence/](../evidence/)), версия 0.14.3. Документ
ведёт задача DOCS каждого раунда; подробности — в `module.md` модулей, спецификации вех и
факты о провайдерах — в `docs/planning/`. M24 включена в поставку 0.10.0.

M26 включена в 0.12.1: нативные карточка усилия, список моделей и отдельный доступ
ChatGPT. QA и приёмка пройдены —
[доказательства M26](../evidence/M26-native-controls.md).

M27 в 0.13.0: Claude native model/Effort/Ultracode/Mode, guarded host и nested menus.
Native macOS и visual QA пройдены, веха принята.

M29: Stop не держит сессию Claude, которую запустила панель, пока автопилот ждёт решения;
выбор параметров Claude ставится в очередь Kit и применяется хостом в фоне —
[доказательства M29](../evidence/M29-claude-controls-instant.md).

M30: усилие Claude читается и меняется в меню `/model`, меню закрывается `s`; в ленте Claude
Desktop нет служебных `/effort` и «Kept model as» — [доказательства M30](../evidence/M30-claude-feed-quiet.md).

M32: лента Codex читается порциями (`thread/turns/list`, `thread/items/list`) в бюджете 8 страниц,
32 МиБ и 5 с на опрос, большой элемент — ограниченный пробел; координатор соединения в runtime
восстанавливает чтение после исчезновения сокета (backoff 250 мс…10 с, одна проба, 200 со
снимком или 503); Stop и `thread/resume` не читают историю —
[доказательства M32](../evidence/M32-codex-history-recovery.md). WebSocket-клиент декодирует байты из
ответа рукопожатия и следующие куски сокета строго по порядку прихода (F001, дефект найден CI Linux).

M38: «Обновить Kit» обновляет и структуру Kit (`wfk`). `kit-update` проверяет структуру
проекта с Kit (`kitUpdate.structure`, `action: update` и ради одной структуры), перед
`install --update` записывает фрагменты `missing` и `outdated` (`installStructure`) и передаёт их
файлы Kit 2.2.7 опцией `--with`: Kit коммитит их вместе со своими файлами одной транзакцией
`kit-update` (пути только из `.workflow-kit/manifest.json`, иначе `WITH_NOT_MANAGED`). Файлы с
изменениями вне коммитов не трогаются (по `status.changes`), отказ Kit возвращает их прежний
текст. Карточка Kit показывает «Структура Kit 3 → 4», изменённые вручную файлы и итог.
Поводом стал вопрос Claude, не появившийся в панели в проекте со структурой 3 —
[спецификация M38](../planning/M38-kit-structure-update.md).

M37 (поставка 0.14.4 установлена; первый CI покраснел на Windows из-за уборки теста `flow.test.ts`, исправлено F001 в scope `M37-plan-close-flow-fix`):
`autopilot` после «Принять план» и «Закрыть план» ставит сессии-владельцу сообщение
(`acceptedMessage`, `closedMessage`) и отпускает удержанный `Stop`; `tidy`
(`POST …/workflow/tidy`) просит владельца убрать пути вне коммитов; `PlanView.dirty` отдаёт их
в фазах `acceptance` и `accepted`, панель показывает предупреждение и кнопку «Попросить агента
убрать»; отказ `close` на грязном дереве — `dirty-tree` по-русски; метки `accepted` и `closed`;
карточка «Ревью плана» — только для открытого предложения или активного scope. Kit 2.2.6
называет папку входных JSON `.harness/inputs/` (git-ignored), пути вне коммитов в `next` и в
отказе `close` — [спецификация M37](../planning/M37-plan-close-flow.md).

M36: вопрос о плане помнит активный scope (`scopeId`); устаревший вопрос (`agent` — открыто
предложение новее вопроса или активен другой scope, `proposal` — открытого предложения нет)
`cross-review` закрывает `dismiss` при `Stop` сессии или выборе пути, без решения о ревью и без
сообщения агенту. Освобождённое (M29) и detached (M8) удержание после хода, начатого только
напоминанием, идёт без второго напоминания; удерживаемый хук `Stop` напоминает к каждому сроку —
[спецификация M36](../planning/M36-plan-question-stale.md).

## Что это

Бэкенд-служба пользователя (Node 24, TypeScript без сборки, без
runtime-зависимостей) и веб-панель для Mac и iPad. Служба ведёт реестр
проектов, ставит структуру Kit и процесс Harness Workflow Kit 2.4.4 (собирается здесь из
`kit-core`, M22; с M40 — с `decisions: host`: решения пользователя пишут операции хоста) в папку проекта, показывает версию Kit проекта и обновляет устаревший Kit и
устаревшую структуру Kit кнопкой «Обновить Kit» (M38), работает с Claude, ChatGPT/Codex и Kimi Code через общий контракт провайдера
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
  Тест, который подставляет чужую ОС вместе с настоящей папкой данных службы, идёт только на
  своём семействе ОС: путь `win32` вне Windows превращается в имя с `\` в текущей папке, то
  есть в корне репозитория (M35, `cli/test/auto-compact-context.test.ts`).

## Части, кластеры, модули

| Часть | Кластер | Модуль | Обязанность |
| --- | --- | --- | --- |
| [backend-core](../../product-parts/backend-core/product-part.md) | [runtime](../../product-parts/backend-core/clusters/runtime/cluster.md) | [cli](../../product-parts/backend-core/clusters/runtime/modules/cli/module.md) | `bin/wfk.mjs`, команды `wfk` (в том числе `link` и `hook`), `createApp`, раздел `system`, прямой путь сообщения |
| | | [data-store](../../product-parts/backend-core/clusters/runtime/modules/data-store/module.md) | каталоги по ОС, `config.json`, атомарная запись, журнал событий, мьютексы, операции, копии чужих конфигов |
| | [http-api](../../product-parts/backend-core/clusters/http-api/cluster.md) | [http-server](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md) | HTTP, фильтр доступа (D8), реестр маршрутов и разделов `/api/state`, раздача панели |
| | [projects](../../product-parts/backend-core/clusters/projects/cluster.md) | [project-registry](../../product-parts/backend-core/clusters/projects/modules/project-registry/module.md) | `projects.json`, проверка имён и путей, выбор папки |
| | | [kit-structure](../../product-parts/backend-core/clusters/projects/modules/kit-structure/module.md) | структура Kit (v4) в папке проекта, хуки агентов (в том числе хук вопроса Claude `PermissionRequest`/`PreToolUse`, M33), приём хука SessionStart |
| | | [git-publish](../../product-parts/backend-core/clusters/projects/modules/git-publish/module.md) | push при закрытом scope |
| | | [project-setup](../../product-parts/backend-core/clusters/projects/modules/project-setup/module.md) | мастер проекта: предпросмотр и одно согласие — git, структура, Kit 2.3.3, доверие, хуки, первая сессия |
| [provider-runtime](../../product-parts/provider-runtime/product-part.md) | [provider-contract](../../product-parts/provider-runtime/clusters/provider-contract/cluster.md) | [provider-registry](../../product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md) | контракт провайдера, реестр, журнал хука, токены предпросмотра, маршруты провайдеров и диалога, вопросы агента и журнал попыток ответа (M33) |
| | | [process-supervisor](../../product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor/module.md) | запуск, учёт и остановка процессов (D5, D9), исполнитель внешних программ |
| | | [pty-host](../../product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/module.md) | ConPTY на Windows (node-pty 1.1.0) |
| | [provider-adapters](../../product-parts/provider-runtime/clusters/provider-adapters/cluster.md) | [provider-claude](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md) | доверие (`~/.claude.json`, импорты CLAUDE.md), сессии Remote Control, окружение папки (pty), лента и вставка в терминал, вопросы `AskUserQuestion` и ожидания хука вопроса (M33) |
| | | [provider-codex](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md) | демон app-server, доверие, одобрение хуков Kit, сессии (треды; после служебного хода — `thread/unsubscribe`), лента порциями и прямой ход, восстановление подключения (M32), вопросы `request_user_input` (слушатель) и асинхронные вопросы (M33), ответ на асинхронный вопрос в идущий ход `turn/steer` и читаемый ответ в ленте (M34) |
| | | [provider-kimi](../../product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi/module.md) | сервер приложения или `kimi web`, доверие, хук, сессии, ссылки, лента |
| [workflow-engine](../../product-parts/workflow-engine/product-part.md) | [kit-host](../../product-parts/workflow-engine/clusters/kit-host/cluster.md) | [kit-bundle](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-bundle/module.md) | бандл Kit 2.3.3, собранный из `kit-core`, с проверкой хеша |
| | | [kit-runner](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-runner/module.md) | команды Kit проекта, установка, слежение за планом, раздел `workflow` |
| | | [plan-view](../../product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md) | модели карточек плана и выбора пути (порт правил Harness); пути вне коммитов `dirty` (M37) |
| | | [kit-update](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md) | версия Kit и структуры Kit проекта (раздел `kitUpdate`), «Обновить Kit» — Kit и структура одним коммитом (M38), одобрение хуков Kit Codex после обновления (M22) |
| | [session-loop](../../product-parts/workflow-engine/clusters/session-loop/cluster.md) | [agent-channel](../../product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md) | хуки `Stop`/`UserPromptSubmit`, маршрут хука вопроса (M33), очередь сообщений агенту (или `direct`), удержание и конец хода (одно напоминание подряд, M36), активность |
| | | [autopilot](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md) | «продолжать, держать или отпустить» после хода; действия с планом из панели; сообщения агенту о приёмке и закрытии, `tidy` (M37); автопилотирование M39 — настройки, журнал запусков, подготовка, ожидания CI, приёмка, закрытие и проверенная публикация |
| | | [plan-review](../../product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md) | решение о ревью и вопрос о плане (scope вопроса, закрытие без решения, M36) |
| | | [cross-review](../../product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md) | ревью плана сессией другого провайдера (M4), закрытие устаревшего вопроса о плане (M36) |
| | | [session-titles](../../product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md) | имена сессий, синхронизация с ChatGPT, архив сессий |
| [control-panel](../../product-parts/control-panel/product-part.md) | [web-panel](../../product-parts/control-panel/clusters/web-panel/cluster.md) | [panel-shell](../../product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md) | раскладка M24, маршруты, опрос, дерево проектов и сессий, «Настройки», слоты расширений, экран «Домой» iPad |
| | | [project-wizard](../../product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md) | мастер проекта в панели: предпросмотр, кнопки первой сессии, шаги подготовки, открытие чата |
| | | [session-view](../../product-parts/control-panel/clusters/web-panel/modules/session-view/module.md) | экран сессии: активность агента, выбор пути, карточка плана (файлы вне коммитов, M37), вопрос о плане |
| | | [session-chat](../../product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md) | диалог: лента, компактный ввод, отправка/очередь и Stop (M18/M24), состояние `sync` и восстановление (M32), карточка вопроса агента (M33; асинхронный вопрос — маршрутом ответа, M34) |
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
`kit-runner`, `kit-structure`, `provider-registry` (M22, M38).
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

Таблица возможностей по ОС и вехам — [OS-MATRIX.md](OS-MATRIX.md). Каждое изменение дополняет её
в том же коммите.

## Известные ограничения

Список перенесён дословно в [LIMITATIONS.md](LIMITATIONS.md).

## Документы

- Спецификации вех — `docs/planning/M<номер>-*.md` (список — `scripts/workflow context --list`):
  ядро [M1](../planning/M1-orchestrator-core.md), интерфейс [M2](../planning/M2-interface-and-process.md)
  (исторический макет [ui-mockup.html](../design/ui-mockup.html), актуальная раскладка — [M24](../planning/M24-interface-polish.md)), [M3](../planning/M3-fixes.md); контракт
  провайдера и факты о Claude и Codex — [M1-providers.md](../planning/M1-providers.md).
- [README.md](../../README.md), [установка по ОС](../installation.md), [CHANGELOG.md](../../CHANGELOG.md).
- Матрица ОС — [OS-MATRIX.md](OS-MATRIX.md). Основные контракты модулей — [CONTRACTS.md](CONTRACTS.md); процесс Kit —
  [workflow-kit/WorkflowKit.md](workflow-kit/WorkflowKit.md) и соседние документы.
