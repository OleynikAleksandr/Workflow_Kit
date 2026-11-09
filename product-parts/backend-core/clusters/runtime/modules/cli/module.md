# Модуль: cli

Часть `backend-core`, кластер `runtime`. Алиас импорта: `#cli`.

## Назначение

Точка входа `wfk` и сборка бэкенда. Модулю принадлежит `bin/wfk.mjs`:
обычный JavaScript, который сначала проверяет Node.js >= 24 (иначе понятная
ошибка и код 1) и только потом загружает `#cli` (TypeScript через type
stripping).

## Публичный интерфейс (`src/index.ts`)

- `main(argv, deps?) → Promise<number>` — разбор команды, возвращает код
  выхода. `deps` (`stdout`, `stderr`, `app`, `waitForShutdown`, `cwd`,
  `readStdin`, `service`) внедряются в тестах; `app.env`, `app.platform`,
  `app.homedir` служат командам `link`, `hook` и командам службы;
  `service` (`ServiceDeps` из `#service-installer`: `run`, `fs`, `health`,
  `spawnDetached`, `sleep`, `readyTimeoutMs` и др.) — подставные эффекты
  установщика.
- `runHook(args, deps) → Promise<0>`, `readProcessStdin(timeoutMs)`,
  `HOOK_BUDGET_MS` (1500), тип `HookDeps` (`stdout`, `stderr`, `env`,
  `cwd`, `readStdin`, `homedir?`, `platform?`, `post?`).
- `runServiceHook(event, client, deps)`, `serviceUrl(env, homedir,
  platform)` (`http://127.0.0.1:<config.port>`), `requestJson` (POST с
  `Origin` своего адреса → `{ status, body }`), `postJson` (то же, статус
  ≥ 300 — ошибка), `runSessionCommand(args, deps)`, `SESSION_USAGE`, `STOP_REQUEST_MS` (9 мин 30 с),
  `PROMPT_REQUEST_MS` (20 с), типы `PostJson`, `RequestJson`,
  `ServiceEvent`, `ServiceHookDeps`, `SessionCommandDeps`.
- `linkLauncher(options) → LinkResult`, `launcherPath(homedir)`,
  `launcherScript(node, entry)`, `LAUNCHER_MARK`, `REPO_ROOT`, `LinkError`,
  типы `LinkOptions`, `LinkResult`.
- `createApp(options?) → Promise<App>` — сборка бэкенда: каталоги данных
  (создаются с правами 0700), конфиг, реестр маршрутов, реестр разделов
  состояния, HTTP-сервер с панелью (`panelShellMount()` в корне,
  `projectWizardMount()` под
  `/project-wizard/`, `sessionViewMount()` под `/session-view/`), журнал событий, мьютекс, реестр
  проектов, операции, учёт процессов и реестр провайдеров, публикация в git (`registerPublicationRoutes`
  из `git-publish`: `scopeOpen` — у проекта есть scope в `workflow`, обновление после `onChange`
  состояния плана). `App`: `dirs`,
  `config`, `version`, `os`, `router`, `state`, `server`, `events`
  (`events.jsonl`), `mutex` (D10), `projects` (`ProjectRegistry`),
  `operations` (`Operations`, D10), `providers` (`ProviderRegistry`),
  `supervisor` (`ProcessSupervisor`, `<state>/processes.json`), `channel`
  (`AgentChannel`: канал к агентам через хуки), `autopilot`
  (`Autopilot`), `review` (`ReviewToggles`), `titles` (`SessionTitles`), `setup` (`ProjectSetup`), `kit`
  (`KitRunner`: команды Kit проектов), `workflow` (`WorkflowState`: кэш
  состояния Kit и раздел `workflow`; перед `deleteFolder` проекта —
  `workflow.release(id)`, чтобы Windows отпустила папку), `start()` (пишет событие
  `service.started`, запускает операцию `providers.refresh`: сверка записей
  процессов и `refresh?()` провайдеров, D11, и слежение `workflow.start()`),
  `stop()` (останавливает слежение и сервер). Опции: `env`, `platform`, `homedir`, `getInterfaces`,
  `osInput`, `log`, `providers` (фабрики вместо `DEFAULT_PROVIDERS`),
  `runCommand` (исполнитель внешних программ для провайдеров), `supervisor`.
- `PROVIDER_ENTRIES` (`src/provider-list.ts`) — провайдеры службы в порядке панели
  (ChatGPT, Claude, Kimi: так идут кнопки мастера и шаги доверия), `{ id, create }`: единственный список бэкенда, где они названы (`createProvider` из
  `#provider-codex`, `#provider-claude`, `#provider-kimi`); `DEFAULT_PROVIDERS` — их фабрики,
  `PROVIDER_IDS` — их id (по ним `wfk hook` проверяет `--client`; тест сверяет id с
  реестром); `SESSION_ENV` — таблица `{ client, variable }`: в какой переменной окружения
  агент оставляет id своей сессии (`CODEX_THREAD_ID`, `CLAUDE_CODE_SESSION_ID`).
- `wireSessions(options)` (`src/session-wiring.ts`) — проводка сессий для `createApp`: канал,
  автопилот, переключатели ревью, имена и перекрёстное ревью. Имён провайдеров в ней нет:
  различия читаются из реестра — `hookDialect`, `wakeSession`, `promptTitle`, возможности
  `orchestration` и `reviewer` (`providerCapability`). Провайдер с `sessionIdle` и
  `sendMessage` получает путь канала без удержания `Stop` (опция `detached`:
  `idle`/`lastAnswer`/`send` — методы провайдера по проекту сессии, `archived` — архив
  панели из `titles`, `names` — `providerLabel`, `title`, `lockSwitch`); `wakeIdle` для
  него зовёт `channel.flush`, `channel.onIdle` — `titles.onStop`, а промпт с
  `HookReply.own` автопилот считает ходом службы.
- `detectOs(input)`, `panelUrls(port, interfaces)`, `readPackageVersion()`.
- Константы `COMMANDS`, `EXIT_USAGE` (64), `EXIT_NOT_IMPLEMENTED` (2).
- Типы `CliDeps`, `App`, `AppOptions`, `SystemSection`, `OsInfo`,
  `DetectOsInput`.

## Команды

| Команда | Поведение |
| --- | --- |
| `serve` | собирает приложение, слушает `config.port` (4747, `WFK_PORT`), печатает адреса панели, останавливается по SIGINT/SIGTERM |
| `install`, `uninstall`, `service start/stop/status`, `open [--url-only]` | передаются в `runServiceCommand` из `service-installer` с контекстом `{ env, platform, homedir, ...deps.service }` (по умолчанию — текущий процесс и `os.homedir()`); сообщение — в stdout (успех) или stderr (ошибка), код выхода — из результата |
| `doctor [--installed]` | то же, `--installed` передаётся аргументом; другие аргументы — справка, код 64 |
| `link [--force]` | пишет запускатель `~/.local/bin/wfk` (0755, `#!/bin/sh`, строка-метка `# Workflow Kit launcher`), который запускает `bin/wfk.mjs` этого клона абсолютным `node`; чужой файл заменяется только с `--force`; предупреждает, если каталога нет в PATH; на Windows пишет те же три запускателя, что `wfk install` (`wfk.cmd`, `wfk` для Git Bash, `wfk.mjs` для хуков), в `%LOCALAPPDATA%\Workflow Kit` (M5, раздел 6) |
| `hook session-start --client <id провайдера>` | клиент не из `PROVIDER_IDS` (`CliDeps.hookClients` в тестах) — ничего не пишет; читает JSON хука из stdin (до 1 с, терминал — пусто) и передаёт `recordSessionStart` из `kit-structure`; весь бюджет 1,5 с; stdout пуст, код всегда 0; неизвестные подкоманды `hook` игнорируются |
| `session title "<тема>" [--client <id> --session <id>]` | отправляет `{ title, cwd, projectDir, client, sessionId }` на `POST /api/sessions/title`. Сессия: флаги `--client` и `--session` (`sessionFlags`; оба сразу, иначе справка и код 64), иначе переменная окружения из `SESSION_ENV` (`callingSession`), иначе служба берёт единственную сессию проекта с идущим ходом (M8, раздел 5). Успех — «Имя сессии в Workflow Kit: …», код 0; отказ службы — причина в stderr, код 1; отказ `session-ambiguous` (409) дополнительно печатает кандидатов строками `--client <id> --session <id>  (состояние, «имя»)` (`candidateLines`); без темы — справка, код 64 |
| `session plan "<что делаем>" [--client <id> --session <id>]` | вопрос о спецификации и плане (M4, раздел 12): `{ summary, cwd, projectDir, client, sessionId }` на `POST /api/sessions/plan`; сессия выбирается так же, как у `session title`, клиент — любой провайдер реестра (неизвестный — 400 `bad-session`); успех — `PLAN_ASKED` («вопрос показан… закончи ход»), код 0; отказ — stderr (и кандидаты при `session-ambiguous`), код 1; без текста — справка, код 64 |
| `project publish` | публикация проекта текущей папки (publication-order 3.3, `src/project-command.ts`): проект — самый глубокий активный из `GET /api/projects`, содержащий папку (`projectOfFolder`); `POST /api/projects/:id/publish` (тайм-аут 120 с); успех — «Опубликовано: коммитов N, <sha>», код 0; отказ службы (scope открыт, грязное дерево, нет upstream, удалённая ветка впереди) или ошибка git — stderr с выводом git, код 1; другие аргументы — справка, код 64 |
| `hook stop\|prompt --client <id провайдера>` | клиент не из `PROVIDER_IDS` — отказ: ничего не отправляет и не печатает; служба принимает хук только зарегистрированного провайдера (иначе 400 `bad-hook-input`) и читает вход и строит ответ по его `hookDialect` (нет поля — `claude`; `kimi` — `prompt` массивом частей, ответ `{ message }`); читает JSON хука из stdin и отправляет `{ client, input, projectDir }` (`projectDir` — `$CLAUDE_PROJECT_DIR`) на `POST /api/hooks/stop\|prompt` службы; печатает в stdout поле `answer` ответа (JSON для агента) или ничего; ответ `prompt` сессии провайдера с `promptTitle` (Claude) несёт `hookSpecificOutput.sessionTitle` из `titles.appTitle` — имя Workflow Kit уходит в приложение; служба недоступна, вход не JSON — без вывода; код всегда 0; `WFK_HOOK_DEBUG` — причина в stderr |
| `hook turn-end --client <id провайдера>` | конец хода без удержания (хуки `Stop`, `StopFailure`, `Interrupt` провайдера с `sendMessage`): читает из stdin `session_id`, `hook_event_name`, `cwd` и отправляет `{ client, sessionId, cwd, event }` на `POST /api/hooks/turn-end` (ожидание до 3 с); ничего не печатает, код 0 и при недоступной службе, и при входе не JSON |
| `--help`, `--version` | справка и версия из `package.json` |

Неизвестная команда — сообщение и справка в stderr, код 64.

## Раздел состояния «system»

`GET /api/state` → `system`: `version`, `os` (`label` вида
«macOS 26.1 (arm64)»; версия ОС читается из
`SystemVersion.plist` / `/etc/os-release` / `os.version()` один раз при
старте, без внешних программ), `node`, `hostname`, `pid`, `startedAt`,
`port`, `dataDir` (каталог конфига), `dataDirOverridden`, `dataDirs`,
`addresses` (URL панели: loopback и адреса Tailscale), `service` —
`getServiceStatus(platform, { env, homedir, serving: true })` из
`service-installer` (только файлы, D11): установленная версия, экземпляр
(`default` / `development` при `WFK_DATA_DIR`), способ и состояние
автозапуска, запускатель, значок, пути программ; плюс `programNames` —
имена всех программ, которые ищет установщик (`PROGRAMS`), чтобы панель
показывала и ненайденные. `GET /api/health` → `{ ok, version, pid, startedAt }`.

## Подключённые модули

- `project-registry` (T002): `registerProjectRoutes` — `GET /api/folders`,
  `GET|POST /api/projects`, `POST /api/projects/open`,
  `DELETE /api/projects/:id` и раздел `projects`; корень новых проектов —
  `config.projectsRoot`, домашняя папка — `homedir` из опций.
- `kit-structure` (T003): `registerStructureRoutes` —
  `GET|POST /api/projects/:id/structure` и раздел `structure` (с общими
  `mutex` и `events`); `recordSessionStart` для `wfk hook`.
- `provider-registry` (T004): `registerProviderRoutes` — маршруты
  провайдеров, `POST /api/refresh` и раздел `providers`; провайдеры
  регистрируются из фабрик (`ProviderContext`: `platform`, `env`,
  `homedir`, `dirs`, `config`, `events`, `supervisor`, `runCommand`, `now`,
  `log`); охранник удаления проекта `projects.addRemoveGuard` — живые сессии
  и `removeBlockers?` провайдеров.
- `data-store` (T004): раздел `operations` (`operations.section()`).
- `project-wizard`, `session-view` (веха 2, T008): статика мастера и экрана
  сессии (`projectWizardMount()`, `sessionViewMount()`).
- `process-supervisor` (T004): `createProcessSupervisor` над
  `<state>/processes.json`, `runCommand`.
- `agent-channel` (веха 2, T002): `createAgentChannel` (проект хука —
  самый глубокий зарегистрированный проект, содержащий `$CLAUDE_PROJECT_DIR`
  или `cwd`, пути сравниваются и после `realpath`), `registerChannelRoutes`
  — `POST /api/hooks/stop|prompt` и раздел `channel`; `stop()` отпускает
  ожидающие хуки.
- `plan-review` (веха 2, T004): `createReviewToggles` (путь выбран — у
  проекта есть `execution` в разделе `workflow`), `load()` при `start()`,
  `registerReviewRoutes` — `POST /api/projects/:id/sessions/:sid/review` и
  раздел `review`.
- `project-setup` (веха 2, T006): `createProjectSetup` (те же `runCommand`,
  `env`, реестры, `operations`), `registerSetupRoutes` — мастер и раздел
  `setup`; реестр проектов получает `saveRoot` (запись `projectsRoot` в
  `config.json` с сохранением других полей).
- `session-titles` (веха 2, T005): `createSessionTitles` (проект по папке
  — тот же поиск, что у канала, с `realpath` ближайшей существующей
  папки; сессии — из канала; цель плана — из раздела `workflow`;
  переименование — `renameSession` провайдера по префиксу ключа сессии),
  `load()` при `start()`, `onTurn`, `setServiceTurn` (приветствие панели — `SERVICE_MESSAGE_MARK` из `#project-setup`) и `appTitle` из хука `prompt` (опция `promptTitle` — свойство `promptTitle` провайдера), `onStop` из хука `stop`,
  `registerTitleRoutes` — маршруты имён и раздел `titles`; `isClient` — провайдер есть в реестре.
- `autopilot` (веха 2, T003): `createAutopilot` получает канал-обёртку,
  чей `enqueue` будит простаивающую (`waiting`) сессию через `wakeSession` её
  провайдера (есть метод — будит; сейчас он только у Claude); опция `orchestration` —
  возможность `orchestration` провайдера сессии (недоступна — скоуп только
  последовательно); решатель `Stop` канала
  (`channel.setDecider`); маршруты хуков получают канал-обёртку, чей
  `prompt` сообщает автопилоту, кто начал ход (`onPrompt`);
  сообщения панели (`POST …/sessions/:sid/message`) идут через ту же
  будящую обёртку (опция `messages` маршрутов канала, раунд R8);
- `POST /api/open-link { url }` (`src/open-link.ts`, M3-autostart раздел 7): служба
  открывает ссылку чата ChatGPT (`codex://threads/<id>`) или сессии Claude Desktop
  (`claude://claude.ai/code/session_<id>`, раздел 11), `OPENABLE_LINK`, командой `open` —
  только с этого компьютера (loopback, иначе 403), только macOS и Windows (иначе 501
  `not-supported`); другая ссылка — 400 без запуска, неудача всех команд — 502 и строка в
  журнале. Windows (`openCommands`, M5 раздел 7): `claude://` — `rundll32
  url.dll,FileProtocolHandler`; `codex://` — приложение из AppX-пакета `OpenAI.Codex`
  (`codexAppxScript`, PowerShell `shell:AppsFolder\<семейство>!<id>` с адресом; без пакета —
  выход 3), затем `rundll32`. Ссылка проекта Kimi Code (M8, раздел 2.6):
  `kimi-code://open?root=<папка>` с необязательным `new=1` (`parseKimiProjectLink`) — только
  для папки зарегистрированного проекта (`sameFolder`, иначе 400 `bad-link`) и только когда
  приложение найдено (`kimiAppFound`, подмена — `AppOptions.kimiApp`; иначе 501 `no-handler`
  с подсказкой `kimi -S <id>`); служба открывает ссылку, собранную заново из папки проекта:
  macOS — `open`, Linux — `xdg-open`, Windows — `rundll32`.
- `POST /api/system/shutdown` (там же, M5 раздел 7): только loopback (и Origin, как у любого
  изменения); отвечает `{ stopping: true }` и через 50 мс выполняет `app.shutdownRequested` —
  `wfk serve` останавливается так же, как по SIGTERM (на Windows сигналов нет; так службу
  останавливает установщик). Панель зовёт его для
  новой сессии: окно без щелчка пользователя ссылку приложения может не открыть;
- перекрёстное ревью плана (M4) собрано в `src/review-wiring.ts`:
  `lateReviewDecider()` — решатель ревью для автопилота (подключается после
  создания; передаёт и `choiceBlocked`), `wireCrossReview({ router, state, channel, messages, projects,
  providers, workflow, toggles, titles, resolveFolderProject, isClient, log })` — `createCrossReview` (с вопросом о плане:
  `question`, `asking`, `decided`, `askProposal` из `toggles`; `providerTitle` — название
  провайдера из реестра, `reviewerBlocked` — причина недоступной возможности `reviewer`,
  `briefByQueue` — у провайдера есть `wakeSession`; маршрут
  `registerPlanQuestionRoute` с проектом по папке (`resolveFolderProject`, как у канала) и
  сессией запроса (`sessionKey`: названная — `namedSession`, иначе `titles.running`; его
  `TitleError` уходит как `HttpError` с кандидатами); ответ — `ANSWER_MESSAGES` агенту через
  будящий канал и `wake`)
  (ревьюер — `createSession` провайдера с первым сообщением и `detached`, поиск по
  `listSessions`: `remoteId` или `localId`; сообщения — через будящий канал с
  источником `review`; задание ревьюеру — `deliverToSession` (M4 13.9): очередь канала и
  сразу `wakeSession` провайдера сессии (по префиксу ключа; нет метода — только очередь), не дожидаясь первого `Stop` новой сессии; открытое предложение — `workflow.proposal` без
  `execution`), слушатель `channel.onStop`, маршруты ревью; `toggleLock` —
  блокировка переключателя (ревью идёт или открытый план уже прошёл ревью);
  переключатель (`locked`, `onChange`) вызывает `crossReview.toggled`;
- жизненный цикл сессий провайдеров собран в `src/provider-lifecycle.ts`
  (`wireProviderLifecycle`): проверки удаления, хуки удаления и архива, подъём при
  запуске; архив проекта или сессии (`addArchivedHook`, опция `archived` заголовков)
  ждёт остановки сессий через `providers.setArchived`, возврат поднимает их в фоне
  (раунд R10); перед удалением папки проекта (`addBeforeDeleteHook`) —
  `providers.deleteSessions` (треды ChatGPT, M3-autostart R5), неудача — в журнал;
  `providers.retryDeletes()` при запуске и раз в `DELETE_RETRY_MS` (60 с) — треды,
  которые приложение не отдало сразу (R6); `providers.maintain()` раз в `MAINTAIN_MS`
  (60 с, опция `maintainMs`, `0` — выключено; одновременно идёт одно) — обслуживание
  провайдеров, строки — в журнал (Codex: удалённое управление — приложению ChatGPT, M7);
  при запуске `providers.autostart()` (демон Codex) — до
  `AUTOSTART_ATTEMPTS` (3) попыток с паузой `AUTOSTART_PAUSE_MS` (30 с), каждая
  неудача — в журнал; при остановке службы демон и процессы Claude не трогаются
  (скоуп M3-autostart);
- удалённый проект забирает с собой записи (раунд R9): `addRemovedHook` реестра
  проектов вызывает `providers.forgetProjects` с оставшимися проектами; при
  запуске то же для всего списка (архивные проекты остаются в списке);
- при запуске служба поднимает прерванные сессии проектов не из архива
  (`providers.resumeInterrupted`; Claude — в тот же канал Remote Control);
  маршрут сообщений панели получает `owns`: сессия, которую канал ещё не
  видел, принимает сообщение, если провайдер числит её за проектом, а
  будящая обёртка через `wakeSession` поднимает прерванную сессию Claude
  (раунд R9);
  `registerAutopilotRoutes` — `POST /api/projects/:id/workflow/…` и раздел
  `autopilot`.
- `kit-bundle` и `kit-runner` (веха 2, T001): `kitBundleProvider` над
  `dirs.appDir` (распаковка бандла Kit 2.2.2 при первой команде),
  `createKitRunner` (тот же `runCommand` и `env`), `createWorkflowState` над
  `projects.list()` и раздел `workflow` (`workflow.section()`; опрос панели
  команд Kit не запускает).

## Инварианты

- Модули подключаются только через их `src/index.ts` (`#data-store`,
  `#agent-channel`, `#autopilot`, `#http-server`, `#plan-review`, `#project-setup`, `#session-titles`, `#kit-bundle`, `#kit-runner`, `#kit-structure`,
  `#panel-shell`, `#process-supervisor`,
  `#project-wizard`, `#session-view`,
  `#project-registry`, `#provider-claude`, `#provider-codex`, `#provider-kimi`,
  `#provider-registry`, `#service-installer`).
- Провайдер подключается фабрикой `createProvider` своего модуля; его
  реализация меняется без правок `cli`.
- Новые возможности добавляются регистрацией в `app.router` и `app.state`
  внутри `createApp` до `start()`.
- `hook` никогда не завершается ошибкой и ничего не печатает в stdout.
- Тесты `link` работают на подставном HOME; настоящий
  `~/.local/bin/wfk` не трогается.
- Тесты команд службы передают подставной HOME, `WFK_DATA_DIR` во
  временном каталоге и подставные эффекты (`deps.service`): настоящие
  `launchctl`, LaunchAgents, `~/Applications` и автозапуск не трогаются.

## Дальше

Установщик подключён (T010): `install` ставит запускатель с той же меткой
`LAUNCHER_MARK`, что и `link`. `EXIT_NOT_IMPLEMENTED` (2) остаётся в
интерфейсе для команд следующих вех.
