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
  `loadApp` — загрузка серверного модуля для `serve` (по умолчанию
  `import('./app.ts')`); тесты подставляют отсутствующую зависимость.
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
  состояния плана), версия и обновление Kit и его структуры (`registerKitUpdateRoutes` из
  `kit-update`, M22, M38: `structure` — `checkStructure`, `installStructure`; M41:
  `deferral` — `kitDeferral` по `kit.status` и `active` журнала запусков (`createRunJournal`
  только для чтения файлов запусков), `mutex` — общий `KeyedMutex`). `App`: `dirs`,
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
  `orchestration` и `reviewer` (`providerCapability`). Перекрёстное ревью (`src/review-wiring.ts`)
  получает `createdAt` открытого предложения и `turnStartedAt(key)` из канала (автор
  предложения, M31), а вопросы о плане — через `questionDeps(toggles, workflow)`: вопрос
  сессии, вопросы проекта, `dismissQuestion` и id активного scope (M36). Переключатели ревью
  получают `scopeOf` — id активного scope из состояния Kit — для `scopeId` нового вопроса. Путь без удержания `Stop` (`detached`)
  и прямой путь сообщения панели (`createDirectMessage`, `src/direct-message.ts`, опция
  `direct` маршрутов канала; `sendDirect` только для `waiting` и неизвестной каналу сессии,
  не `ledOutside`) и сессии вне процесса Kit — в [session-chat.md](session-chat.md). M45 T002:
  сессии, чьи хуки канал видел, `directTurn` ждёт хук вставки `DIRECT_CONFIRM_MS` (8 с);
  `'unconfirmed'` — строка журнала `channel: message to <key> was pasted, but no prompt hook
  took it within 8000 ms` (тест `test/m45-direct-message.test.ts`). M46 T002: отказ провайдера
  `{ refused }` (терминал не свободен) возвращается маршруту с причиной, резерв хода видит `false`,
  строка журнала `channel: message to <key> refused, not queued: <причина>` (тест
  `test/m46-direct-refused.test.ts`).
- `detectOs(input)`, `panelUrls(port, interfaces)`, `readPackageVersion()`.
- Константы `COMMANDS`, `EXIT_USAGE` (64), `EXIT_NOT_IMPLEMENTED` (2).
- Типы `CliDeps`, `App`, `AppOptions`, `SystemSection`, `OsInfo`,
  `DetectOsInput`.

## Команды

Таблица команд `wfk` — в [commands.md](commands.md#команды).

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
Kit, ссылки и остановка службы, журнал попыток ответа на вопросы агента M33, автопилотирование
M39 — `src/autopiloting-wiring.ts`, `src/autopiloting-links.ts`, `wfk session plan`
(M40 T007: решает служба, `--authorized` не нужен), `wfk session progress|run` в `src/session-run-command.ts`, T008 — общий
`createPublisher` кнопки и запусков, сервис завершения; M40 T004A — `createProposalGate`:
опция `runs` автопилота получает `proposal`, возврат автору предложения без блока
`automation`; M40 T005 — команда `wfk decision` (`src/decision-command.ts`, `COMMANDS` получает
`decision`), сервис решений `createDecisions` в `wireAutopiloting` и маршруты решений; M40 T006 —
сервис слов `createRunWords`: «стоп» и «пауза» пользователя в маршруте сообщений панели и в хуке
UserPromptSubmit; M44 T001 — подготовка запуска получает `authorize` (`runs.beginExecution`)
для повторной записи разрешения, минутный `tick` делает шаг подготовки каждого проекта, чтобы
отказанный старт повторялся без следующего хода; M44 T002 — `agentState(projectId)` автопилотирования
и опция `sessionStart` маршрутов канала: строка автопилота новой сессии, `src/autopilot-line.ts`,
`src/session-start-line.ts`; M44 T003 — `createAgentNotices`: строки о смене Settings и
состояния запуска в очередь сессии без пробуждения) — в [connected-modules.md](connected-modules.md) и [commands.md](commands.md).

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

## Строка автопилота при старте сессии и ОС (M44 T002)

`wfk hook session-start` после записи сессии спрашивает службу (`POST /api/hooks/session-start`)
в остатке бюджета 1,5 с и печатает её ответ; без службы — `unknown (service not reachable)`.
macOS и Linux — sh-запуск хука, Windows — `wfk.cmd`/`wfk.mjs`; строка только ASCII, поэтому
кодовая страница консоли и CRLF на неё не влияют; URL службы — из конфигурации подставленной
платформы (`test/session-start-line.test.ts`: `win32` и `linux`). Программ ОС нет.

## Снимок строки состояния Claude (M25)

`wfk statusline --client <id>` сохраняет параметры сессии/лимиты и передаёт stdin/stdout
пользовательской команды байт в байт. Всегда код 0, служба не нужна. Контракт и матрица
ОС — [statusline.md](statusline.md); Windows — Git Bash, затем PowerShell, завершение
дерева через публичный taskkill; macOS/Linux — sh и своя группа процессов.
R2/T011: тайм-аут statusline ждёт и close процесса, и окончание завершения дерева;
раннее возвращение до освобождения cwd исключено на всех трёх ОС (statusline.md).

M28/T002: `auto-compact-window.ts` (`resolveAutoCompactWindow`, `managedSettingsFile`) находит
порог автосжатия Claude для `model.id`: `CLAUDE_CODE_AUTO_COMPACT_WINDOW` → managed-файл
(macOS `/Library/Application Support/ClaudeCode`, Linux `/etc/claude-code`, Windows
`C:\Program Files\ClaudeCode`, `path.win32`) → `.claude/settings.local.json` →
`.claude/settings.json` → `~/.claude/settings.json`; внутри слоя модель (точный id, затем
алиас семейства) важнее общего ключа, `"auto"` останавливает поиск, число вне
100 000–1 000 000 пропускается. Снимок statusline получает `auto_compact_window` и
`auto_compact_source`; ошибка чтения — порога нет, вывод и код 0 прежние. Только чтение.

M27/T003: `native-statusline.ts` добавляет per-host nonce и bounded native metadata,
после чего `runStatusline` получает прежние stdin/stdout. Пути внутри base64 data,
без интерполяции shell. `session-wiring` вызывает provider nativeControlHook перед
каналом, titles и autopilot; quarantined hook не начинает ход и не получает очередь.
macOS/Linux/Windows используют один контракт, shell delegation прежний.

M28/T004: `reconcileTurns` (`session-wiring.ts`, каждые `TURN_RECONCILE_MS` = 2 с) завершает
ход канала в `working`, если `Provider.turnState` дал `idle` позже начала хода и не раньше
`TURN_SETTLE_MS` = 1,5 с назад: `confirmInterrupted` → `resumeDelivery` без барьера, очередь
будится сразу. После Stop с ответом block провайдер получает хук `continue`.

M28/T010: барьер Stop больше не держит ход в `working`. `reconcileTurns` завершает ход и после
неподтверждённого Stop (`interrupt-timeout`); пропускается только Stop в процессе (`pending`).
Барьер остаётся: автоматическое продолжение не запускается. `deliverAfterInterruption`
(`turn-interruption.ts`) после конца хода будит очередь; под барьером — только если в ней есть
сообщение пользователя (`USER_MESSAGE_SOURCE`), которое снимает барьер, как новое сообщение.
Тот же шаг выполняет подтверждённый Stop (опция `wake` у `createTurnInterruption`). Поведение
одинаково на macOS, Linux и Windows.

M29/T001: `releasable(provider, activity)` (`session-wiring.ts`) — сессию запустила панель
(`marksPanelProcess`, `external === false`), провайдер умеет `wakeSession` и не имеет
`sendMessage`. Для неё канал получает опцию `release`: решение `hold` не держит хук Stop,
сессия свободна для Desktop и терминала. `wakeReleased` будит её через `automaticWake` и
`wakeSession`, когда в очереди появилось сообщение или решатель ответил `continue`; ход в
`working` и барьер Stop не будятся. Сессия вне панели держится, как раньше. Поведение
одинаково на macOS, Linux и Windows.

M28/T014: `app.ts` передаёт провайдерам `autoCompactWindow(modelId, cwd)` —
`resolveAutoCompactWindow` без окружения службы (детям `CLAUDE*` не передаются); пути managed
по подставленной платформе. Тест `auto-compact-context.test.ts` для darwin, linux и win32.

## Speech Input

createApp wires public #speech-service with models under stateDir/speech/models
and atomic configDir/speech.json, installed helper at appDir/speech/wfk-speech-helper
or source debug helper in development. WFK_SPEECH_HELPER overrides the executable
for isolated testing. stop closes speech sockets, downloads and worker before HTTP.
macOS ARM64 enables native recognition; Linux/Windows/Intel expose unavailable.
The speech API never calls a provider, changes its turn or sends an agent message.

Speech Input T004: createApp mounts public #speech-input at /speech-input/ for
AudioWorklet and dictation.js. CSP remains self-only; no inline scripts added.

### Загрузка без серверных зависимостей (speech-integration)

`app.ts` тянет зависимости времени выполнения (`ws` через `#speech-service`), поэтому
он загружается только для `serve` (`src/commands.ts`): `loadCreateApp(load?)` →
`{ok: true, createApp}` или `{ok: false, message}` для `ERR_MODULE_NOT_FOUND`
пакета («зависимость <имя> не найдена: переустановите Workflow Kit (npm ci в клоне,
затем node bin/wfk.mjs install)»; `serve` печатает её и выходит с кодом 1);
`missingPackage(error)` — имя пакета такой ошибки. `index.ts` экспортирует
`createApp` обёрткой с динамическим импортом, поэтому `bin/wfk.mjs → #cli` не
загружает сервер: `install`, `doctor`, `hook`, `session`, `--version` работают в
копии без `node_modules`. `test/missing-dependency-process.test.ts` проверяет это
отдельными процессами во временной копии источника (`WFK_DATA_DIR`, `HOME`,
свободный `WFK_PORT`): `--version`; `install` — `DEPENDENCY_MISSING` и
отсутствующий каталог данных; `serve` — сообщение без трассировки; `doctor
--installed` копии без `ws` — `[ошибка] зависимости копии`.
