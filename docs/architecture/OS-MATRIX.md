# Матрица ОС

Что Workflow Kit умеет на macOS, Linux и Windows 11 (x64 и ARM64), по вехам. Каждое изменение
дополняет эту таблицу в том же коммите (правило «Three operating systems» в `AGENTS.md`).
Обзор архитектуры — [OVERVIEW.md](OVERVIEW.md), подробности по модулю — раздел ОС его
`module.md`.

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
| M28: ход Claude по хукам, Stop по кадру и до движка; ввод без строк, «в очереди» | expect, фикстуры | injected linux | ConPTY, injected win32 |
| Claude M28: окно по `autoCompactWindow`, и для старых host | managed `/Library/Application Support/ClaudeCode`, `/context` сверен | `/etc/claude-code`, injected linux | `C:\Program Files\ClaudeCode`, injected win32 |
| M29: Stop-хук не держит сессию, которую запустила панель Claude; её будит хост | общий код канала | то же | то же |
| M32 F001: WebSocket Codex — байты из ответа рукопожатия и следующие куски декодируются по порядку | Unix-сокет; детерминированный тест | Unix-сокет; дефект найден CI run 43708900530, тест детерминирован | proxy stdio, тот же код; CI x64/ARM64 |
| M32 T005: сквозные сценарии — история и элемент > 16 МиБ, замена сокета, вкладки, Stop после переподключения; браузерный сценарий | тесты и Chromium пройдены; живая проверка pending | CI pending | injected win32 через proxyStream; CI x64/ARM64 и проверяющий pending |
| M32 T004: панель — `sync` ленты (загрузка, пробел, восстановление), сохранение ввода, прокрутки и очереди | браузер, также iPad; Chromium в тестах | браузер | браузер, x64/ARM64 |
| M32 T003: восстановление подключения к демону Codex — backoff 250 мс…10 с, одна проба, epoch и идентичность сервера, 200/503 ленты | Unix-сокет, realpath на каждую попытку | то же, CI | новый `codex app-server proxy`, код выхода и безопасный stderr; injected win32, CI x64/ARM64 |
| M32 T002c: Stop — свои свежие `thread/read` и `turns/list` без истории, противоречия до deadline; все `thread/resume` с `excludeTurns` | Unix-сокет демона; тесты | тот же код, CI | proxy stdio, тот же код; injected win32 и CI x64/ARM64 |
| M32 T002b2: лента Codex порциями (`turns/list`, `items/list`), бюджет опроса, ограниченные gaps, LRU-кэш, снимок Stop из метаданных | Unix-сокет демона; тесты на настоящем WebSocket | тот же код, CI | proxy stdio, тот же код; именованный канал в тестах, CI x64/ARM64 |
| M32 T002b1: контракт ленты `sync`, 503 для временных кодов, идемпотентная обрезка | общий код маршрута | то же | то же, x64/ARM64 |
| M32 T002a: WebSocket Codex — кадр и сообщение ≤ 16 МиБ, типизированные ошибки транспорта | Unix-сокет; тесты и настоящий сокет | тот же код, CI | proxy stdio, тот же код; именованный канал в тестах, CI x64/ARM64 |
| M29: хост применяет желаемые параметры Claude в фоне, каталог на версию CLI | expect-хост | expect-хост, injected linux | ConPTY, `rename` с повтором при `EPERM` |
| M29: служба отвечает на выбор Claude сразу, кэш каталога в `stateDir` | общий Node-код | то же, injected linux | то же, injected win32 |
| M29: меню Claude открыто во время ответа, выбор сразу с пометкой, откат при отказе | общий ES-код | то же | то же |
| M30: усилие Claude читается и меняется в меню `/model`, выход клавишей `s`, без `/effort`; модель без усилия — причина в меню | expect-хост | то же, injected linux | ConPTY, те же `NATIVE_KEYS` |
| M29: диалог «Switch model?», подтверждение модели строкой Claude, опрос занятого хоста раз в 100 мс | expect-хост, темп в Node-помощнике | то же | ConPTY, `runHost` спит 100 мс |
| M31: `scope:owner` Kit 2.2.5 — владелец неначатого плана переходит к сессии, где нажали кнопку | общий Node-код Kit | то же | то же, x64/ARM64 |
| M31: автор предложения по `turnStartedAt` закончившегося хода; ревью и вопрос о нём только у автора | общий Node-код канала и ревью | то же | то же |
| M31: выбор способа и «Начать выполнение плана» из любой сессии проекта; прежний держатель `Stop` будится | общий Node-код автопилота | то же | то же |
| M31: карточки выбора и неначатого плана в любой сессии; чужой начатый план — краткая карточка «Открыть сессию» | общий ES-код панели | то же | то же, x64/ARM64 |
| M33 T003: вопрос агента в ленте, маршрут ответа с `attemptId`, журнал попыток `question-attempts.json` в `stateDir` | общий Node-код, `writeJsonAtomic` | то же, injected linux | то же, путь `path.win32`, x64/ARM64 |
| M33 T004: вопросы `AskUserQuestion` из транскрипта Claude; `sendDirect` и пробуждение не пишут файлы при открытом вопросе | общий Node-код, файлы для `session.exp` | то же, `session.exp` | то же, файлы для `pty/host.ts`, x64/ARM64 |
| M33 T005: хук `PermissionRequest` вопроса (`wfk hook question`, `POST /api/hooks/question`), ожидания и ответ панели | POSIX-команда хука `~/.local/bin/wfk` | то же | exec-форма `node.exe wfk.mjs hook question`, x64/ARM64 |
| M33 T011: хук `PreToolUse` вопроса (`wfk hook question` выходит сразу), закрытие ожидания без привязки | POSIX-команда хука `~/.local/bin/wfk` | то же | exec-форма `node.exe wfk.mjs hook question`, x64/ARM64 |
| M33 T006: вопросы Codex — флаг `waitingOnUserInput`, слушатель (долгое соединение), ответ результатом запроса; соединения Kit не отвечают на запросы сервера | сокет управления демона | то же | долгий процесс `codex app-server proxy`, x64/ARM64 |
| M33 T012: асинхронный вопрос Codex (`agentMessage.questions` истории, `reply: 'message'`) | опрос ленты через сокет демона | то же | через `codex app-server proxy`, x64/ARM64 |
| M34 T001: ответ на асинхронный вопрос Codex маршрутом ответа — `turn/steer` в идущий ход или `turn/start` обёрткой `<send_user_message_question_reply>` | сокет управления демона | то же | через `codex app-server proxy`, x64/ARM64 |
| M33 T007, T013: карточка вопроса в диалоге; асинхронный вопрос отвечается сообщением панели | общий ES-код панели | то же | то же, x64/ARM64 |
| M33 T008, T014: живые проверки вопросов Claude и Codex ([результаты](../evidence/M33-acceptance.md)) | проверено: пользователь и агент | только CI | не проверено: проверяющий на Windows |
| M37 T001: Kit 2.2.6 — папка входных JSON `.harness/inputs/` (`.gitignore`, `AGENTS.md`, правило схем), шаг `next` и отказ `close` называют пути вне коммитов | общий Node-код Kit, пути `git status` через `/` | то же | то же, x64/ARM64 |
| M37 T002: «Принять план» и «Закрыть план» сообщают сессии-владельцу и отпускают удержанный `Stop`; `tidy` (`POST …/workflow/tidy`), `PlanView.dirty`, отказ `dirty-tree`, метки «План принят» и «План закрыт» | общий Node-код службы; доставка — канал (Claude PTY, демон Codex, Kimi) | то же | то же (ConPTY, `codex app-server proxy`), x64/ARM64 |
| M37 T003: предупреждение карточки плана о файлах вне коммитов и кнопка «Попросить агента убрать», карточка «Ревью плана» только для открытого предложения или активного scope, метки «План принят» и «План закрыт» | общий ES-код панели (`session-view`), пути от службы через `/` | то же | то же, x64/ARM64 |
| M37 F001: тест `autopilot/test/flow.test.ts` удаляет временный проект с повторами (`rm` с `maxRetries`) | удаление проходит с первого раза | то же | папку, где ещё работает команда Kit, Windows не удаляет (`EBUSY`): повторы до освобождения; x64/ARM64 |
| M38 T002: Kit 2.2.7 — `install --update --with` коммитит файлы структуры приложения (`.workflow-kit/manifest.json` и его пути) в той же транзакции `kit-update`, другие пути — `WITH_NOT_MANAGED` | общий Node-код Kit, пути канонические через `/` | то же | то же, x64/ARM64 |
