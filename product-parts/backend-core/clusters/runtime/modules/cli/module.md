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
  `/project-wizard/`, `sessionViewMount()` под `/session-view/`, `sessionChatMount()` под `/session-chat/`), журнал событий, мьютекс, реестр
  проектов, операции, учёт процессов и реестр провайдеров, публикация в git (`registerPublicationRoutes`
  из `git-publish`: `scopeOpen` — у проекта есть scope в `workflow`, обновление после `onChange`
  состояния плана), версия и обновление Kit проектов (`registerKitUpdateRoutes` из
  `kit-update`, M22). `App`: `dirs`,
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
  автопилот, переключатели ревью, имена и перекрёстное ревью. Имён провайдеров нет:
  различия — из реестра: `hookDialect`, `wakeSession`, `sendDirect`, `promptTitle`, возможности
  `orchestration` и `reviewer` (`providerCapability`). Путь без удержания `Stop` (`detached`)
  и прямой путь сообщения панели (`createDirectMessage`, `src/direct-message.ts`, опция
  `direct` маршрутов канала; `sendDirect` только для `waiting` и неизвестной каналу сессии,
  не `ledOutside`) и сессии вне процесса Kit — в [session-chat.md](session-chat.md).
- `detectOs(input)`, `panelUrls(port, interfaces)`, `readPackageVersion()`.
- Константы `COMMANDS`, `EXIT_USAGE` (64), `EXIT_NOT_IMPLEMENTED` (2).
- Типы `CliDeps`, `App`, `AppOptions`, `SystemSection`, `OsInfo`,
  `DetectOsInput`.

## Команды

| Команда | Поведение |
| --- | --- |
| `serve` | дописывает `launcherDir` в PATH своего окружения (`service-path.ts` `withLauncherDir`, M17), собирает приложение, слушает `config.port` (4747, `WFK_PORT`), печатает адреса панели, останавливается по SIGINT/SIGTERM |
| `install`, `uninstall`, `service start/stop/restart/status` (`restart` — `stop`, затем `start`), `open [--url-only]` | передаются в `runServiceCommand` из `service-installer` с контекстом `{ env, platform, homedir, ...deps.service }` (по умолчанию — текущий процесс и `os.homedir()`); сообщение — в stdout (успех) или stderr (ошибка), код выхода — из результата |
| `doctor [--installed]` | то же, `--installed` передаётся аргументом; другие аргументы — справка, код 64 |
| `link [--force]` | пишет запускатель `~/.local/bin/wfk` (0755, `#!/bin/sh`, строка-метка `# Workflow Kit launcher`), который запускает `bin/wfk.mjs` этого клона абсолютным `node`; чужой файл заменяется только с `--force`; предупреждает, если каталога нет в PATH; на Windows пишет те же три запускателя, что `wfk install` (`wfk.cmd`, `wfk` для Git Bash, `wfk.mjs` для хуков), в `%LOCALAPPDATA%\Workflow Kit` (M5, раздел 6) |
| `hook session-start --client <id провайдера>` | клиент не из `PROVIDER_IDS` (`CliDeps.hookClients` в тестах) — ничего не пишет; читает JSON хука из stdin (до 1 с, терминал — пусто) и передаёт `recordSessionStart` из `kit-structure`; весь бюджет 1,5 с; stdout пуст, код всегда 0; неизвестные подкоманды `hook` игнорируются |
| `session title "<тема>" [--client <id> --session <id>]` | отправляет `{ title, cwd, projectDir, client, sessionId }` на `POST /api/sessions/title`. Сессия: флаги `--client` и `--session` (`sessionFlags`; оба сразу, иначе справка и код 64), иначе переменная окружения из `SESSION_ENV` (`callingSession`), иначе служба берёт единственную сессию проекта с идущим ходом (M8, раздел 5). Успех — «Имя сессии в Workflow Kit: …», код 0; отказ службы — причина в stderr, код 1; отказ `session-ambiguous` (409) дополнительно печатает кандидатов строками `--client <id> --session <id>  (состояние, «имя»)` (`candidateLines`); без темы — справка, код 64 |
| `session plan "<что делаем>" [--client <id> --session <id>]` | вопрос о спецификации и плане (M4, раздел 12): `{ summary, cwd, projectDir, client, sessionId }` на `POST /api/sessions/plan`; сессия выбирается так же, как у `session title`, клиент — любой провайдер реестра (неизвестный — 400 `bad-session`); успех — `PLAN_ASKED` («вопрос показан… закончи ход»), код 0; отказ — stderr (и кандидаты при `session-ambiguous`), код 1; без текста — справка, код 64 |
| `project publish` | публикация проекта текущей папки (publication-order 3.3, `src/project-command.ts`): проект — самый глубокий активный из `GET /api/projects`, содержащий папку (`projectOfFolder`); `POST /api/projects/:id/publish` (тайм-аут 120 с); успех — «Опубликовано: коммитов N, <sha>», код 0; отказ службы (scope открыт, грязное дерево, нет upstream, удалённая ветка впереди) или ошибка git — stderr с выводом git, код 1; другие аргументы — справка, код 64 |
| `hook stop\|prompt --client <id провайдера>` | клиент не из `PROVIDER_IDS` — отказ: ничего не отправляет и не печатает; служба принимает хук только зарегистрированного провайдера (иначе 400 `bad-hook-input`) и читает вход и строит ответ по его `hookDialect` (нет поля — `claude`; `kimi` — `prompt` массивом частей, ответ `{ message }`); читает JSON хука из stdin и отправляет `{ client, input, projectDir, panelProcess }` (по `$CLAUDE_PROJECT_DIR` и `WFK_PANEL_SESSION=1`) на `POST /api/hooks/stop\|prompt` службы; печатает в stdout поле `answer` ответа (JSON для агента) или ничего; ответ `prompt` сессии провайдера с `promptTitle` (Claude) несёт `hookSpecificOutput.sessionTitle` из `titles.appTitle` — имя Workflow Kit уходит в приложение; служба недоступна, вход не JSON — без вывода; код всегда 0; `WFK_HOOK_DEBUG` — причина в stderr |
| `hook turn-end --client <id провайдера>` | конец хода без удержания (хуки `Stop`, `StopFailure`, `Interrupt` провайдера с `sendMessage`): читает из stdin `session_id`, `hook_event_name`, `cwd` и отправляет `{ client, sessionId, cwd, event, panelProcess }` на `POST /api/hooks/turn-end` (ожидание до 3 с); ничего не печатает, код 0 и при недоступной службе, и при входе не JSON |
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

Что `createApp` подключает и с какими опциями (реестры, Kit, сессии, публикация, обновление
Kit, ссылки и остановка службы) — в [connected-modules.md](connected-modules.md).

## Инварианты

- Модули подключаются только через их `src/index.ts` (`#data-store`,
  `#agent-channel`, `#autopilot`, `#http-server`, `#plan-review`, `#project-setup`, `#session-titles`, `#kit-bundle`, `#kit-runner`, `#kit-structure`, `#kit-update`, `#git-publish`,
  `#panel-shell`, `#process-supervisor`,
  `#project-wizard`, `#session-view`, `#session-chat`,
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

## Остановка текущего ответа и ОС (M24)

`turn-interruption.ts` связывает общий контракт провайдера, канал, паузу владельца
плана и прерванное ревью. `POST /api/projects/:id/sessions/:key/interrupt { turnRef }`
после проверок принадлежности, архива и поддержки ставит барьер до проверки поколения.
Повтор pending разделяет один запрос к адаптеру; успешный результат кэшируется.
Устаревшая цель даёт 409 `stale-turn` с текущим `InterruptView`, не останавливает новый
ход. Подтверждённый stopped переводит канал в waiting без Stop hook; HTTP 200 требует
также успешной обязательной паузы. Ошибка — 502 `interrupt-failed`, предел ожидания
запроса 10 с — 504 `interrupt-timeout`; поздний результат не переписывает состояние.
Пока native RPC не завершился, повтор не создаёт второе прерывание. Барьер сохраняется
при idle, stale, ошибке и тайм-ауте; история, черновик и очередь не удаляются.

Раздел `channel.interruptions[projectId][sessionKey]` собирается из существующего
кэша реестра и дешёвого interruptAvailability: дополнительных RPC при опросе нет.
Неизвестная после рестарта сессия имеет unknown/null ref и видимую причину; ошибки
listing не объявляют Stop доступным. Архивные/убранные сессии исключаются.
Явная валидная отправка разрешает доставку; directTurn учитывает её поколение.
Фоновые пробуждения очереди и ревью проходят automaticWake и проверяют барьер.
Полные типы/ошибки — [M24](../../../../../../docs/design/M24-turn-interruption.md).
Поведение общего API одинаково на macOS, Linux и Windows x64/ARM64; доступность реального
Stop задаёт адаптер. Здесь не вызываются программы ОС, stopSession или отмена назначений.

Уточнение T008 (исправление T002): `ProviderError` с кодом `interrupt-timeout` из
native-вызова адаптера также становится HTTP 504 `interrupt-timeout`, с его сообщением
и подсказкой (при отсутствии — общая подсказка о сохранённом барьере). Прочие ошибки
адаптера остаются HTTP 502 `interrupt-failed`; результаты unavailable/stale — прежние
409. Общий лимит запроса 10 с, очередь, поколения, дедупликация и барьер не меняются.
После завершившегося тайм-аута адаптера явный повтор разрешён; незавершённый native RPC
по-прежнему не дублируется. Тест проходит через настоящий HTTP-сервер с подставным
провайдером; правила одинаковы на macOS, Linux и Windows x64/ARM64.

## Снимок строки состояния Claude (M25)

`wfk statusline --client <id>` сохраняет параметры сессии/лимиты и передаёт stdin/stdout
пользовательской команды байт в байт. Всегда код 0, служба не нужна. Контракт и матрица
ОС — [statusline.md](statusline.md); Windows — Git Bash, затем PowerShell, завершение
дерева через публичный taskkill; macOS/Linux — sh и своя группа процессов.
R2/T011: тайм-аут statusline ждёт и close процесса, и окончание завершения дерева;
раннее возвращение до освобождения cwd исключено на всех трёх ОС (statusline.md).
