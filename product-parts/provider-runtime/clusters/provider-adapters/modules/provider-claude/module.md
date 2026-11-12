# Модуль: provider-claude

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-claude`.

## Назначение

Провайдер Claude по контракту `provider-registry`
(`docs/planning/M1-providers.md`, раздел 2): доверие к папке, сессии Remote
Control (создание, список, возобновление, остановка) и окружение папки
(`claude remote-control --spawn=same-dir`) как особое действие проекта.
Интерактивный `claude` работает под pty через `expect` (скрипты
`src/pty/*.exp` и общий `src/pty/dialogs.tcl` с `handle_dialog`, M15), на Windows — через ConPTY-хост
`src/pty/win-host.ts` с тем же контрактом (раздел «Windows»); процессы сессий и окружений
запускает `process-supervisor` (своя группа, вывод в файл, без `CLAUDE*`,
D5) и останавливает только по своим записям (D9). Kit не нажимает клавиш в
диалогах Claude: доверие и ответ про внешние импорты он записывает в `~/.claude.json` сам
после предпросмотра и подтверждения пользователя. Единственное исключение — «Not now» на
предложение новой функции (M15, [dialogs.md](dialogs.md)).

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — фабрика с настройками по умолчанию;
  бэкенд (`cli`, `DEFAULT_PROVIDERS`) регистрирует её результат.
- `createClaudeProvider(context, options?) → Provider` — то же с
  настройками для тестов (`ClaudeProviderOptions`: `scripts`,
  `sessionTimeoutMs` 120 с, `debugGraceMs` 10 с, `environmentTimeoutMs`
  45 с, `pollMs` 250 мс, `stopGraceMs` 5 с, `directWaitMs` 5 с, `afterConfigWrite(attempt)` —
  вызывается после каждой записи `~/.claude.json` до проверки чтением;
  только для тестов параллельной записи).
- `PROVIDER_ID` — `claude` (ключ реестра и клиент журнала хука).
- `ENVIRONMENT_START` (`environment-start`), `ENVIRONMENT_STOP`
  (`environment-stop`) — id особых действий проекта.
- `sessionLinks(remoteId)`, `normalizeRemoteId(id)` — ссылки и
  нормализация `cse_X` → `session_X`; `MIN_CLAUDE_VERSION` (2.1.0);
  `PTY_SCRIPTS` (пути `session.exp`, `environment.exp`; оба подключают
  `dialogs.tcl` из своей папки).

## Поведение

### Статус и возможности (D4, D11)

- Программы: `claude` — `config.programs.claude` (D12), затем PATH
  окружения службы, затем `~/.local/bin`, `~/.claude/local`; `expect` —
  `config.programs.expect`, PATH, `/usr/bin` (на Windows не ищется: `claude.exe`
  и ConPTY-хост). Поиск — только проверка
  файлов, результат кэшируется до `refresh`.
- `status()` только читает: пути, версия из последнего `refresh`,
  `~/.claude.json` (кэш по mtime и размеру) — вход (`oauthAccount`);
  `details`: `expect` (на Windows — «не нужен (ConPTY)»), `account`, `config`. Состояния: `not-installed`
  («не установлен»), `unavailable` («недоступно», с причиной), `ready`
  («готов»; без входа — `note` с подсказкой `/login`).
- `refresh()` (старт службы и «Перепроверить») заново ищет программы и
  выполняет `claude --version` (без `CLAUDE*`).
- `capabilities()`: `createSession`, `resumeSession`, `environment`
  недоступны без `claude`, без `expect` на macOS и Linux (на Linux —
  подсказка установить пакет), на Windows — без сборки node-pty для
  архитектуры (`ptyUnavailable` из `#pty-host`), и при версии ниже
  `MIN_CLAUDE_VERSION`; `trust` (запись файла, pty не нужен) недоступна
  только без `claude`; `stopSession`, `sessions` и `hooks` доступны всегда.

### Windows (спецификация M5, раздел 4)

- Запуск: `runtime.requirePty()` возвращает `{ claude, launcher }`; `ptyCommand(launcher,
  scripts, kind, args)` даёт `expect <скрипт>.exp <args>` или на Windows
  `node <scripts.host> session|environment <args>` с теми же аргументами (`PtyScripts.host`).
- `pty/win-host.ts` — вход хоста: разбор аргументов (`parseHostArgs`; `claudeEnv` — окружение claude
  без `WFK_FIRST_MESSAGE`, у сессии `WFK_PANEL_SESSION=1`), `loadNodePty` и `startTerminal`
  из `#pty-host`, `uncaughtException` → `HOST_ERROR`. `pty/host.ts` (`runHost`) повторяет
  `session.exp` и `environment.exp`: те же маркеры и коды выхода (5 — не доверено, 4 — claude
  завершился до ссылки, 6 — диалог), размеры 160×40 и 120×40, ожидания 90 с и 20 с, экран
  копируется в журнал до ссылки, файлы `<debug>.rename`, `.text`, `.message` раз в 1 с,
  первое сообщение — 1,5 с, текст, 0,5 с, `\r`. Шаблоны (`pty/screen.ts`) — те же, что в
  `dialogs.tcl`, на тексте без escape-последовательностей; при диалоге — до 1 с тишины
  (не дольше 5 с), затем ответ «Not now» на предложение или маркер и остановка claude
  без нажатий ([dialogs.md](dialogs.md)).
- Ключи `~/.claude.json` (`folder-key.ts`): путь Windows совпадает с ключом без учёта регистра
  и вида косой черты (`folderKey`); запись идёт в уже существующий ключ (`findFolderKey`),
  новый — как пишет Claude: `/` и заглавная буква диска (`claudeFolderKey`). `rename` при
  `EPERM`/`EBUSY`/`EACCES` повторяется до 5 раз (`renameRetrying`), `chmod` на Windows не
  выполняется. Пути POSIX сравниваются точно, как раньше.

### Доверие (D7)

- `trust(project)` — `~/.claude.json` → `projects["<путь>"].
  hasTrustDialogAccepted`: для Remote Control считается только точный ключ
  папки. Если доверена родительская папка (например, `~`), а сама папка —
  нет: `{ trusted: false, inherited: { from: <родитель>, note:
  'интерактивный Claude не спросит, Remote Control требует доверия папки' } }`
  (`INHERITED_NOTE`; ближайший доверенный родитель вверх до `/`). Нет файла
  — `false` с пометкой, битый JSON — `null`; после `grantTrust` — путь
  копии (`backup`) до перезапуска службы.
- `previewTrust(project)` — записываемые ключи, `inherited`, точки
  автозапуска папки (хуки `.claude/settings.json` и
  `.claude/settings.local.json` — хук Kit помечен, разрешения
  `permissions.allow` и `bypassPermissions`, MCP
  `enableAllProjectMcpServers`, `enabledMcpjsonServers`, серверы
  `.mcp.json`, команды `statusLine`, `apiKeyHelper`, …, чужие хуки
  `.codex/hooks.json`; нечитаемый JSON — точка `invalid`) и внешние импорты
  CLAUDE.md (`imports.ts`; `\ ` в `@путь` — пробел, иной `\` — часть пути Windows). Если внешние импорты есть, а в записи папки нет
  `hasClaudeMdExternalIncludesWarningShown: true`, — в `writes` ключи
  `hasClaudeMdExternalIncludesApproved: true` и
  `hasClaudeMdExternalIncludesWarningShown: true`: импорты разрешаются по
  умолчанию, вопроса нет (`choices: []`; решение пользователя 2026-11-06 —
  настройка принадлежит приложению Claude). Явный ответ
  `{ 'external-imports': 'deny' }` в `grantTrust` по-прежнему запрещает их;
  другой ответ — `invalid-choice`. Решённый раньше выбор — заметка
  «решение уже записано».
  Токен (`claude:<id проекта>`) привязан к отпечатку: содержимое файлов
  автозапуска, тексты файлов памяти и импортов, список импортов, доверие и
  решение об импортах.
- Внешние импорты (`scanExternalImports(папка, home)`): файлы памяти
  проекта — `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md`,
  `.claude/rules/**/*.md` самой папки и всех родительских папок до `/`
  (пользовательские `~/.claude/CLAUDE.md` и `~/.claude/rules` пропускаются);
  ссылки `@путь` вне блоков и строк кода (`@~/…` — от дома, остальные — от
  файла со ссылкой, `\ ` — пробел, `#…` отбрасывается), рекурсивно до
  глубины 5; внешний импорт — существующий файл вне папки проекта
  (например, `~/CLAUDE.md` → `~/AGENTS.md`).
- `grantTrust(project, token, choices)` диалогов не проходит и `claude` не
  запускает. Токен одноразовый (`invalid-token`); изменение папки,
  импортов, доверия или решения после показа — `preview-changed`; битый
  файл — `config-broken`; нет ответа на обязательный выбор —
  `choice-required` (400), неизвестный выбор или ответ — `invalid-choice`
  (400); записывать нечего — `{ trusted: true, note }`. Иначе: копия
  `~/.claude.json` (`backupFile`, `<backups>/.claude.json-<hash>/`), затем
  `patchProjectEntry` (`config-writer.ts`) сливает в
  `projects["<папка>"]` ключи `hasTrustDialogAccepted: true` и (если
  импорты ждали решения) `hasClaudeMdExternalIncludesApproved: <не deny>`,
  `hasClaudeMdExternalIncludesWarningShown: true`; остальное содержимое
  файла не меняется. Запись атомарна: временный файл рядом с теми же
  правами (новый файл — 0600), JSON с отступом 2, перед `rename` файл
  сверяется с прочитанным (если Claude успел записать — начать заново с
  его версии), после — читается и проверяется. Потеря записи из-за
  параллельной записи Claude — повтор, всего до 3 попыток
  (`CONFIG_WRITE_ATTEMPTS`), затем `trust-lost` (`details: { backup }`,
  подсказка с путём копии). Символическая ссылка `~/.claude.json`
  сохраняется (пишется её цель). Итог — `{ trusted: true, backup, note? }`
  (`note` — «внешние импорты CLAUDE.md разрешены/запрещены»).

### Сессии

- `createSession(project, { title, firstMessage? })` — нужны pty и доверие
  (`not-trusted` с подсказкой). `expect session.exp <папка> <claude>
  <имя> <debug-файл>` под `supervisor.spawn` (owner `{ provider: 'claude',
  project, kind: 'session', ref }`), журнал pty —
  `<logs>/claude/session-*.log`, debug — `…debug.log`. Скрипт печатает
  `CLAUDE_PID <pid>` и `SESSION_URL session_<id>` (основной источник);
  с `firstMessage` (передаётся скрипту переменной `WFK_FIRST_MESSAGE` в одну
  строку и убирается из окружения claude; claude получает `WFK_PANEL_SESSION=1` —
  метку хуков, у провайдера `marksPanelProcess: true`, M19) скрипт после ссылки набирает
  сообщение, Enter, печатает `FIRST_MESSAGE_SENT`;
  при `NO_SESSION_URL` или по истечении ожидания id берётся из debug-файла
  (`Created session cse_<id>`). Pid дочернего `claude` добавляется в
  запись (`supervisor.track`) после появления id. Ошибки: `not-trusted`,
  `session-exited`, `no-session-url` (хвост журнала, подсказка с путём),
  диалоги (ниже); процесс неудачной попытки останавливается. Имя по
  умолчанию даёт сервер (`<проект> · ГГГГ-ММ-ДД ЧЧ:ММ`).
- Диалоги Claude до ссылки: виды `trust`, `imports`, `onboarding`, `unknown` останавливают
  `claude` без нажатий (`DIALOG <вид>`, код 6, ошибка `<вид>-dialog` из `dialogError`, что
  сделать — `DIALOG_HINTS`: первый запуск и незнакомый диалог — в терминале, M15); на
  предложение новой функции (`promo`, M15) Kit выбирает «Not now» и ждёт ссылку дальше.
  Шаблоны, правила ответа и тесты — [dialogs.md](dialogs.md).
- `listSessions(project)` — записи панели этой папки (состояние
  `running`/`stopped` по `supervisor.quickCheck`, без внешних программ) и
  сессии журнала хука (`readHookSessions`, служебные скрыты). `remoteId`
  сессии из хука — отложенно, по последней записи
  `{"type":"bridge-session","bridgeSessionId":"cse_<X>"}` в её
  `transcript_path` (только путь из журнала; каталог транскриптов не
  вычисляется; файл читается с места прошлого чтения). Без записи —
  без ссылок, `note` «без Remote Control — ссылки нет». Запись панели и
  сессия хука с тем же локальным id или `remoteId` показываются одной
  строкой (`localId` — из журнала, пока его нет — `session_<id>`).
  Смотрятся 100 новых сессий журнала.
- Ссылки: `desktop` — `claude://claude.ai/code/session_<id>`, `mobile` и
  `web` — `https://claude.ai/code/session_<id>`.
- `resumeSession(project, sid)` (`sid` — локальный id или `session_<id>`)
  — живой процесс возвращается как есть; иначе `session.exp … <localId>`
  (`claude --resume <localId> --remote-control <имя>`), тот же
  `session_<id>`; другой id — `note` и строка в журнале службы. Без
  локального id — `local-id-unknown`. Сессия из хука после возобновления
  получает запись (`origin: 'hook'`).
  Повторный вызов для той же сессии, пока идёт первый, ждёт его и не
  запускает второй процесс. Проверено перезагрузкой Mac (2.1.319): процесс
  возвращается в тот же канал («Reattaching to persisted bridge session
  cse_…»), архивная сессия на claude.ai оживает сама (раунд R9).
- `resumeInterrupted(project)` — поднимает прерванные сессии проекта:
  запись панели с `processId` и без `stoppedAt`, процесс не жив
  (перезагрузка, сбой); намеренно остановленные (`stoppedAt`) не трогает;
  ответ — поднятые id, ошибка одной сессии пишется в журнал. Так же
  поднимается прерванное окружение папки (`resumeEnvironment` в
  `environment.ts`: запись с `processId`, без `stoppedAt`, процесс не жив) —
  в ответе `environment` (скоуп M3-autostart).
- `deleteSessions(project)` (`src/purge.ts`, M3-autostart раунд R7) — удаление проекта
  с диска: `claude purge <папка> -y` (транскрипты, память, история ввода, запись проекта в
  `~/.claude.json` — только на этом Mac; сессии claude.ai остаются); ответ `['local-data']`
  (`PURGED`); без claude — `not-installed`, неудача — `purge-failed` с причиной (служба
  пишет её в журнал, удаление идёт дальше).
- `archiveSessions(project, sid | null)` / `restoreSessions(project, sid |
  null)` (`src/archive.ts`, раунд R10): архив проекта (`null`) останавливает
  его работающие и прерванные сессии и ставит записи `archived: 'project'`;
  архив одной сессии — `archived: 'session'` (и остановку, если процесс есть).
  Пометка пишется до остановки. Сессия с пометкой не поднимается:
  `resumeSession` отвечает `archived` (409), `wakeSession` и
  `resumeInterrupted` её не трогают. Возврат проекта снимает пометку
  `project` и сразу поднимает эти сессии (убранные по одной остаются);
  возврат сессии поднимает её, а если проект ещё в архиве — переводит
  пометку на проект. Ответ — id, которые видит панель.
- `stopSession(project, sid)` — только сессии с записью панели
  (`not-own-session` для остальных); `supervisor.stop` сверяет pid, время
  старта, командную строку и boot id (TERM, ожидание, KILL); `mismatch` —
  сигналов нет, запись закрывается; `still-running` — `stop-failed`.
- `renameSession(project, sid, name)` — сессия с записью панели и живым
  процессом: пишет `<debug-файл>.rename`; `session.exp` раз в секунду
  проверяет файл, вводит `/rename <имя>` (команда `immediate` Claude
  2.1.319, меняет и заголовок Remote Control) и печатает `RENAMED`;
  ожидание до `RENAME_WAIT_MS` (5 с) → `{ synced: true }`, имя попадает в
  `title` записи. Иначе `{ synced: false, note: RENAME_BY_HOOK_NOTE }` —
  имя уйдёт хуком со следующим сообщением. Вне хода сессию держит
  вызывающий (свойство `promptTitle: true`): ввод в ходе мог бы ответить
  на диалог разрешения.
- `wakeSession(project, sid)` — то же для очереди панели: пишет
  `<debug-файл>.message` (`wake`; не при ждущем `.text` и `.message`), `session.exp` вводит «Workflow Kit: новое
  сообщение из панели.» и печатает `WOKEN`; хук `UserPromptSubmit` отдаёт
  агенту очередь. Прерванная сессия сначала поднимается
  (`resumeSession`); `false` — сессию держит не панель или её остановили
  намеренно.
- Диалог (M18): `readMessages` — лента из транскрипта, `sendDirect` — вставка текста в
  терминал (`<debug>.text`, `MESSAGE_SENT`); правила и ОС — [chat.md](chat.md).

### Окружение папки (особое действие проекта)

- `actions(project)` — «Окружение папки: запустить» и «…: остановить»
  (с `confirm`); выключенная кнопка показывает состояние: «работает с
  ГГГГ-ММ-ДД ЧЧ:ММ», «остановлено», «не запущено», нет доверия или
  причина недоступности pty. `actions(null)` — пусто.
- `runAction('environment-start', project)` — `expect environment.exp
  <папка> <claude> <имя проекта> <debug-файл>` (`claude remote-control
  --name <имя> --spawn=same-dir`) под `supervisor.spawn` (kind
  `environment`); ждёт `ENV_READY <id>` (`environment=<id>` на экране) или
  `ENV_STARTED` (20 с без id — процесс жив); ошибки `not-trusted`,
  `environment-exited`, `environment-timeout` и диалоги (как у сессий,
  процесс останавливается по записи). Остановка — только по
  своей записи (D9). После перезагрузки (другой boot id) — «остановлено».
  Возвращает `ProjectProviderState`.
- `removeBlockers(project)` — «работает окружение папки».

### Хуки

`hooks(project)` — хук Kit из `.claude/settings.json` (`findKitHook`) и
остальные хуки обоих файлов настроек с хешем (`sha256(normalizeHook)`),
все `approved` (одобрения у доверенной папки нет). Команда — `hookText` (с `args` exec-формы
Windows), признак Kit — `isKitHookEntry`. Без хука Kit — `complete: false`.

## Данные

`<state>/sessions/claude.json` (`providerSessionsFile`, атомарно, 0600):
`{ version: 1, sessions: SessionRecord[], environments:
EnvironmentRecord[] }`. `SessionRecord`: `localId | null`, `remoteId`,
`title`, `projectId`, `projectPath`, `origin`, `createdAt`, `startedAt`,
`processId` (id записи `processes.json`, `null` после остановки),
`claudePid`, `logFile`, `debugFile`, `stoppedAt`. `EnvironmentRecord`
(одна на папку): `projectId`, `projectPath`, `name`, `processId`,
`claudePid`, `environmentId`, `startedAt`, `stoppedAt`, `logFile`,
`debugFile`. Хранятся последние 200 остановленных сессий. Журналы —
`<logs>/claude/`.

## Инварианты

- Чтения (`status`, `capabilities`, `trust`, `hooks`, `listSessions`,
  `actions`) не запускают программ и читают файлы с кэшем (D11).
- `~/.claude.json` пишет только `grantTrust` и только после предпросмотра,
  токена и ответов пользователя: три ключа записи папки, копия до записи,
  атомарная замена, проверка чтением. Решения за пользователя Kit не
  принимает: ни ответа по умолчанию, ни нажатий клавиш в диалогах (кроме «Not now» на
  предложение новой функции, M15).
- Сигналы — только процессам своих записей после сверки (D9); никаких
  `pkill`. Дочерние процессы — без `CLAUDE*`.
- Служебные сессии (`WFK_SERVICE_SESSION`) в список не попадают.
- Зависимости: `#provider-registry`, `#process-supervisor`, `#data-store`
  (`backupFile`, атомарная запись, мьютекс), `#kit-structure` (поиск хука
  Kit), `#pty-host` (ConPTY на Windows).
- Тесты: подставной `claude` (`test/fixtures/fake-claude.mjs`: диалоги
  доверия, внешних импортов и неизвестный печатаются со сдвигами курсора
  вместо пробелов; нажатые в диалоге клавиши пишутся в `<лог>.keys`) под
  настоящими expect-скриптами, временные HOME и `WFK_DATA_DIR`
  (`test/harness.ts`), фикстуры транскриптов; без `expect`
  интеграционные тесты пропускаются. `windows.test.ts`: хост с подставным
  терминалом и ключи Windows в `~/.claude.json`; тесты идут и в CI на Windows. `trust.test.ts` повторяет машину
  пользователя: `~` доверена, `~/CLAUDE.md` импортирует `~/AGENTS.md`.

## Проверить при приёмке

- Предпросмотр доверия проекта под `~`: пометка «доверена родительская
  папка», выбор про внешние импорты (`~/AGENTS.md` из `~/CLAUDE.md`);
  после «Доверять» — «доверено», в `~/.claude.json` ключ проекта с тремя
  ключами, копия до записи в `backups`.
- Что Claude Code принимает запись папки без остальных полей, которые он
  сам заводит (`allowedTools` и т. п.), и не показывает после неё ни
  диалога доверия, ни диалога импортов.
- Текст настоящего диалога доверия (на машине пользователя подавлен
  доверием `~`): узнаётся ли он по фразам `dialogs.tcl`; иначе он попадёт в
  `unknown-dialog` — тоже без нажатия клавиш.
- Набор файлов памяти, которые Claude считает источником внешних импортов
  (родительские `CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules`).
- Текст `environment=<id>` на экране `claude remote-control`: если его нет,
  окружение считается запущенным через 20 с (`ENV_STARTED`).
- `MIN_CLAUDE_VERSION` (2.1.0) — нижняя граница, проверено на 2.1.318.
- Формат записи `bridge-session` в транскрипте (поле `bridgeSessionId`).

## Дальше

Пути `claude` и `expect` в `config.json` (`programs`, D12) записывает
`wfk install` (`service-installer`); провайдер читает их первыми.
Автовосстановление сессий после перезагрузки — Q3 (сейчас «остановлена» и
«Возобновить»).

## Записи удалённых проектов (раунд R9)

`forgetProjects(keep)` стирает записи панели (`sessions/claude.json`: сессии и окружения) проектов, чьих id нет в
`keep`, и отвечает, сколько стёрто; файл переписывается только при изменении.
