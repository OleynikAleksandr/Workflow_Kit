# Claude: полный контракт сессий

Вынесен из [module.md](module.md) в T003 без удаления прежних требований.
Дополнительный контракт прерывания ответа — [interrupt.md](interrupt.md).

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


M28/T004. `sendDirect` сначала отменяет транзакцию параметров (`cancelNativeParameters`) и
ждёт хост на 3 с дольше обычного. Хост (`session.exp` через `interrupt-worker.ts`, `host.ts`
на Windows) берёт `.text`, `.message`, `.rename` при любом состоянии движка: `yieldToUser`
отменяет транзакцию и даёт ей не больше 2 с на очистку. `turnState` (`claudeTurnState`)
отдаёт `<debug>.turn` сессии панели; хук `continue` (Stop с ответом block) снова пишет `working`.
