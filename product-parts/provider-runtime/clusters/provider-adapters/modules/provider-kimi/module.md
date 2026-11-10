# Модуль: provider-kimi

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-kimi`.

## Назначение

Провайдер Kimi Code по контракту `provider-registry`
([спецификация M8](../../../../../../docs/planning/M8-kimi-provider.md),
[протокол](../../../../../../docs/planning/M8-kimi-protocol.md)): программа
`kimi`, свой сервер `kimi web` на 127.0.0.1, рабочая область папки,
доверие папке, хук Kit в `config.toml`, сессии, доставка сообщений, ссылки
в приложение Kimi Code и Remote Control. Имя — «Kimi Code», `label` «Kimi»,
`mark` K, диалект хука `kimi`. В списке провайдеров идёт третьим (после
ChatGPT и Claude).

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — провайдер для службы; `cli`
  регистрирует его в `PROVIDER_ENTRIES`.
- `createKimiProvider(context, deps?)`, `createKimiRuntime(context, deps?)`
  → `{ runtime, provider }`. `KimiDeps`: `fetch`, `startWaitMs` (15 с),
  `stopWaitMs` (5 с), `pollMs`, `freePort`, `tokenNow`, а для хука —
  `hookHost`, `liveness`, `beforeRename`, для доставки — `retryDelaysMs`,
  для ссылок — `appFound`. `KimiRuntime` (`context`, `paths`, `server`,
  `workspaces`, `program()`, `requireReady()`, `requireServer()`,
  `requireProgram()`, `appFound()`, `appRestart()`, `remote`) — общая часть
  для хука и сессий.
- Константы: `PROVIDER_ID` = `kimi`, `PROVIDER_TITLE`, `RESTART_ACTION` =
  `restart-kimi-server`, `LOGIN_NOTE`, `MODEL_NOTE`, `UNTESTED_OS_NOTE`,
  `ON_DEMAND_NOTE`, `MIN_KIMI_VERSION` = `2.5.2`, `KIMI_HOME_ENV` =
  `KIMI_CODE_HOME`, `LOCK_SWITCH` = `KIMI_CODE_SESSION_LOCK`,
  `SERVER_OWNER`, `KIMI_CODES`, `KIMI_TIMEOUT_MS` (10 с).
- Пути: `kimiHome(env, homedir, platform)`, `kimiPaths(home, platform)`,
  `pathApi`, `envValue`, `envWithout`, `sameFolder`,
  `inFolder(folder, parent, platform)`.
- Программа: `readProgram(context, paths)`, `findKimiProgram`,
  `parseVersion`, `compareVersions`, `testedVersion`.
- Клиент: `createKimiClient({ port, tokenFile, fetch?, timeoutMs? })`,
  `KimiError`, `describeKimiError`, `shapeError`.
- Формы ответов: `parseMeta`, `parseAuth`, `parseConfig`, `parseWorkspace`,
  `parseWorkspaces`, `parseTrusted`, `parseInstance`, `parseSessionPage`,
  `parseSession`, `parseMessages`, `parsePrompt`, `parseBatch`.
- Сервер: `createKimiServer(deps)` → `{ current(), ensure(), stop(), used,
  startedWith(), startedAt(), foreign() }` (`deps.snapshot` — отпечаток
  блоков Kit перед запуском, `deps.liveness`), `freeLocalPort()`,
  `readInstances(dir)`; `KimiInstance { serverId, pid, port, startedAt }`.
- Рабочие области и доверие: `createKimiWorkspaces(platform)` →
  `{ find, ensure }`, `pickWorkspace`, `workspaceKey`, `realFolder`,
  `folderTrusted(paths, folder, platform)`, `createKimiTrust(deps)`.
- Хук: `createKimiHooks(options)` → `{ hooks, approveHooks, action, remove,
  syncServer, kitKey, appRestart }`, `REMOVE_HOOK_ACTION` = `remove-kimi-hook`,
  `HOOK_SCOPE_NOTE`, `APP_RESTART_NOTE`, `HOOK_RECORD` (`kimi-hook`); `planHookFile(current, blocks)` → `HookFilePlan
  { status, reason, section, target, cleaned, found }`, `hookFingerprint`;
  `changeConfig(deps, build)`, `readConfig`, `KEPT_BACKUPS` (3),
  `UNREADABLE_LOCK_MS` (30 с); `scanToml`, `tomlValue`, `TomlScanError`;
  `parseConfigHooks`.
- Замки: `liveSessionLocks(dir, live)`, `holderAlive`, `lockTime`,
  `defaultLiveness()` → `Liveness { pidAlive(pid), bootTime(), hostname() }`.
- Сессии: `createKimiSessions(runtime, deps?)` (методы сессий провайдера),
  `createKimiSessionList`, `enumerateSessions`, `createSessionNotes`,
  `createKimiMessages`, `createKimiStore(context)` → записи панели и
  намерения удаления; `SESSION_ID`, `DELETE_KEEP_MS` (7 дней),
  `LIST_PAGE_LIMIT` (20), `LIST_CACHE_MS` (5 с), `ANSWER_PAGE_LIMIT` (10),
  `FOREIGN_RETRY_MS` (4, 8, 16 с) и тексты пометок (`ARCHIVED_NOTE`,
  `WAITING_NOTE`, `GONE_NOTE`, `PARTIAL_NOTE`, `ARCHIVE_STALE_NOTE`,
  `FOREIGN_RENAME_NOTE`, `SERVER_DOWN`, `unavailableNote`, `deliveryNote`).
- Ссылки и приложение: `kimiProjectLink`, `parseKimiProjectLink`,
  `resumeNote`, `kimiAppFound(check)`, `KIMI_LINK_PREFIX`, `KIMI_APP_NAME`,
  `KIMI_SCHEME_KEYS`, `KIMI_SCHEME_MIME`, `sessionLinks(runtime, project)`.
- Remote Control: `createKimiRemote(options)` → `{ mobile, enabled, set,
  note, reset }`, `REMOTE_ON_ACTION` = `kimi-remote`, `REMOTE_OFF_ACTION` =
  `kimi-remote-off`, `REMOTE_BUSY_NOTE`, `REMOTE_CACHE_MS`, `parseRemote`.

## Файлы Kimi

Каталог Kimi — `KIMI_CODE_HOME`, иначе `<home>/.kimi-code`. Kit читает в нём:

| Файл | Зачем |
| --- | --- |
| `bin/kimi` (`bin\kimi.exe`) | программа, если путь не сохранён в `config.programs.kimi` |
| `server.token` | токен сервера; читается перед каждым запросом |
| `server/instances/<id>.json` | `{ server_id, pid, host, port, … }` работающих серверов |
| `workspace-trust/*` | файлы доверия `{ root, trustedAt }` |
| `config.toml` | блоки `[[hooks]]` хука Kit |
| `locks/sessions/*` | замки идущих ходов (`pid`, `startedAt`) |

Сам Kit пишет в каталоге Kimi только хук: `config.toml`, на время записи —
`config.toml.wfk-lock` и `config.toml.wfk-tmp-<pid>`, копии прежнего файла
`config.toml.wfk-backup-<время>` (хранятся три последние). Рабочую область
(`projects.json`) и файл доверия создаёт сервер Kimi по запросу Kit.

В каталоге состояния службы модуль ведёт три файла: `sessions/kimi-hook.json`
— `{ version: 1, changedAt }` (когда Kit последний раз менял свои блоки в
`config.toml`; для блоков, записанных раньше этой версии, — время изменения
файла при первой проверке),
`sessions/kimi.json` — `{ version: 1, sessions: [{ sessionId, projectId,
projectPath, workspaceId, title, createdAt }], projectArchives? }` (сессии,
созданные из панели, и id сессий, которые Kit отправил в архив Kimi вместе
с проектом) и `sessions/kimi-deletes.json` — `{ version: 1, intents:
[{ root, real?, since, sessionIds }] }` (незавершённые удаления).

## Поведение

### Статус

`status()` не делает ввода-вывода: отвечает по последней проверке.
`refresh()` (при старте службы и по «Перепроверить») запускает
`kimi --version` и спрашивает сервер — только если он уже работает или у
Kit есть записи сессий Kimi; сам сервер ради статуса не запускается.

| Условие | `state` | Подпись |
| --- | --- | --- |
| проверки ещё не было | `unknown` | «не проверялся» |
| программы нет | `not-installed` | «Kimi Code не найден» |
| версия ниже 2.5.2 | `unavailable` | «нужна версия Kimi Code не ниже 2.5.2» |
| версия не прочитана | `error` | «версия не определена» |
| сервер не запустился | `error` | «сервер Kimi не запустился» (причина — в `note`) |
| программа есть, сервер не спрашивали | `ready` | «готов», `note` «сервер Kimi запускается по требованию» |
| `backend` сервера не `v2` | `error` | «сервер Kimi работает с backend …, нужен v2» |
| `models_ready: false` или код `40110` | `unavailable` | «нужен вход: `kimi login`» |
| `default_model` пуст или отсутствует | `unavailable` | «в Kimi не выбрана модель» |
| ответ неизвестной формы | `error` | «неизвестный ответ Kimi <версия> (<поле>)» |
| всё на месте | `ready` | «готов» |

К `note` добавляются: «версия X не проверялась с Workflow Kit» (версия не
2.5.x, но формы ответов известны — провайдер остаётся `ready`), «на этой
ОС не проверялся» (Linux и Windows) и `APP_RESTART_NOTE` (см. «Хук Kit»). `details.kimiHome` — каталог Kimi.

`requireReady()` — вход создания сессии, доставки и доверия: перечитывает
программу, если прошлой проверкой она не найдена или не подошла, запускает
сервер, перезапускает его для нового хука (`syncServer`), проверяет вход и
модель; иначе `ProviderError` (`not-installed`,
`unsupported-version`, `kimi-program`, `kimi-server`, `kimi-not-ready`).
`requireServer()` — то же без проверки входа и модели: для имени, архива,
удаления и чтения ответа.

### Сервер Kit

- Запуск: `kimi web --no-open --port <свободный порт>` через
  `process-supervisor` с владельцем `{ provider: 'kimi', project: null,
  kind: 'server' }`, `logFile: null` (вывод отбрасывается: в нём ссылка с
  токеном), рабочий каталог — домашний, из окружения убран
  `KIMI_CODE_SESSION_LOCK`. Готовность: запись `server/instances` с pid
  процесса (или его портом) и ответ `GET /api/v1/healthz`, не дольше 15 с;
  иначе процесс завершается и операция отказывает `kimi-server`.
- Запуск по требованию (`requireReady()`); в `autostart()` — только при
  записях сессий Kimi; `maintain()` поднимает упавший сервер, если он уже
  использовался этой службой или есть записи сессий. Одновременные запросы
  делят один запуск.
- После перезапуска службы сервер находится по записи учёта процессов
  (`check` → `alive`) и записи `server/instances`; исчезнувший или чужой
  процесс из учёта убирается.
- Действие `restart-kimi-server` (область `provider`): при работающем
  сервере — «Перезапустить сервер Kimi» с подтверждением
  (`POST /api/v1/shutdown`, через 5 с — завершение процесса, затем новый
  запуск); при неработающем — «Запустить сервер Kimi».

### Клиент

Только `http://127.0.0.1:<порт>` и пути `/api/…`; `redirect: 'error'`;
таймаут 10 с (вызов может задать свой). Токен читается из `server.token`
перед каждым запросом и идёт только в заголовке `Authorization`. Отказ
авторизации (HTTP 401 или код `40101`) — один повтор с перечитанным
токеном. Ответ — конверт `{ code, msg, data }`; из ошибки берутся только
`code` и `msg`, поля `stack`, `data`, `details` отбрасываются. Ответ не той
формы — `KimiError` вида `shape`, в тексте — версия Kimi и поле.
`healthz` спрашивается без токена.

### Рабочая область и доверие

- `workspaces.ensure(client, folder)`: среди `GET /api/v1/workspaces`
  ищется область папки (или её realpath); из нескольких — с большим числом
  сессий, затем с меньшим id. Нет — `POST /api/v1/workspaces
  { root, idempotency_key }` с ключом `workflow-kit:<sha256 пути>`.
  Одновременные вызовы для одной папки делят один запрос.
- `trust(project)` читает только файлы `workspace-trust` и сервер не
  запускает.
- `previewTrust` сервер не запускает: показывает записи, которые сделает
  сервер Kimi (`projects.json` — если область не найдена или не проверена;
  каталог `workspace-trust`), `autorun: []`, причину неготовности в `notes`.
- `grantTrust`: токен предпросмотра (`invalid-token`, `preview-stale`),
  `requireReady()`, область, `POST …/workspaces/<id>/trust {}`, затем
  чтение файла доверия; нет файла — `not-recorded`. Ошибка Kimi —
  `kimi-trust` с кодом и текстом без подробностей.

### Хук Kit

Хуки Kimi общие для всех проектов: пять блоков `[[hooks]]` в `config.toml`
(`SessionStart`, `UserPromptSubmit`, `Stop`, `StopFailure`, `Interrupt`,
`timeout` 30). Их текст строит `kit-structure` (`kimiHookBlocks`,
`kimiHooksSection`); здесь — чтение и запись файла.

- `planHookFile` разбирает файл построчно (`scanToml`: заголовки таблиц и
  ключи, многострочные строки и массивы) и находит блоки Kit по команде
  (`isKimiKitCommand`). Статус: `approved` — пять блоков с нужными событием,
  командой и таймаутом; `pending` — блоков Kit нет; `modified` — есть, но не
  те; `unknown` — файл нельзя менять безопасно: не UTF-8, не разбирается,
  `hooks` задан массивом в строке или таблицей `[hooks]`, либо команду
  нельзя записать для этой машины.
- `hooks()` читает файл без сервера и без программы. `kitHook.command` —
  добавляемый текст (комментарий `# Workflow Kit` и блоки, с переводами
  строк файла), `kitHook.hash` = sha256(текущий текст, `\0`, итоговый
  текст), `writes` — запись в `config.toml` (пусто при `approved` и
  `unknown`), `note` — что хук общий для всех проектов, при `unknown` —
  причина и просьба добавить текст вручную.
- `approveHooks(project, { command, hash })` пишет только показанное: под
  замком файл читается заново, другой текст или хеш — `hooks-changed`.
  Прежние блоки Kit (с комментарием и пустой строкой над ним) убираются,
  свежие дописываются в конец; остальной текст — байт в байт.
- Запись (`changeConfig`): замок `config.toml.wfk-lock` с `pid` и
  `startedAt` (создание `wx`; замок мёртвого процесса или процесса,
  начатого до загрузки ОС, перехватывается; нечитаемый — через 30 с), копия
  прежнего файла с его правами, временный файл рядом, сверка текста перед
  `rename` (изменился — `hooks-changed`), затем `kimi doctor config`. Отказ,
  сбой запуска или таймаут проверки — откат: прежний текст возвращается,
  только если в файле всё ещё запись Kit (созданный файл удаляется);
  ошибка `hooks-invalid` называет копию. Новый файл создаётся с правами
  0600.
- Коды ошибок (все 409): `hooks-busy`, `hooks-changed`, `hooks-unknown`,
  `hooks-invalid`. Запись и удаление требуют программу (`not-installed`,
  `unsupported-version`), сервер им не нужен.
- Действие `remove-kimi-hook` «Убрать хук Kit из Kimi» (область `provider`,
  второе после перезапуска сервера, с подтверждением) убирает только блоки
  Kit. Выключено с причиной, когда блоков нет, файл в состоянии `unknown`
  или нет программы.
- Сервер Kimi берёт хуки только при своём запуске (M9, раздел 1);
  `GET /api/v1/config` после создания сессии показывает новые хуки, но они не
  выполняются, поэтому Kit на него не опирается. Перед запуском своего
  сервера Kit запоминает отпечаток блоков Kit в файле (`kitKey`: событие и
  команда). `syncServer` (после записи и удаления, в `requireReady()` и в
  `maintain()`) перезапускает сервер, когда отпечаток в файле другой; у
  сервера, подхваченного после перезапуска службы, отпечаток неизвестен —
  решает `startedAt` записи `server/instances` против `changedAt`.
  Перезапуск — только без живых замков ходов; строка `[kimi] …` — в журнал.
- Приложение Kimi Code и открытые в терминале `kimi` Kit не перезапускает.
  Живая запись `server/instances`, не принадлежащая Kit (`foreign()`), с
  `startedAt` раньше `changedAt` при блоках Kit в файле — пометка
  `APP_RESTART_NOTE` «Перезапустите приложение Kimi Code: хук Kit
  заработает в его сессиях только после перезапуска…» в статусе, в `note`
  состояния хука (шаг мастера) и у сессий проекта.

### Сессии

Создание, список, имя, архив, удаление, состояние хода, последний ответ и
доставка сообщений описаны в [sessions.md](sessions.md). Коротко: одно
правило принадлежности (папка сессии — папка проекта или внутри неё);
список сервер не запускает и при недоступном сервере строится по записям
панели и журналу хука; архив панели зеркалится в Kimi; незавершённое
удаление остаётся намерением и повторяется; сообщение идёт с `prompt_id`
`kit-<id доставки>`.

### Ссылки, приложение, Remote Control

Описаны в [links.md](links.md). Коротко: `links.desktop` —
`kimi-code://open?root=<папка>`, только когда приложение Kimi Code найдено
(иначе пометка с `kimi -S <id>`); `links.mobile` — адрес Remote Control
сервера Kit; действия `kimi-remote` и `kimi-remote-off`; код `40928` —
пометка статуса.

## Поведение на ОС

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Проверка приложения Kimi Code | папка `Kimi Code.app` | `xdg-mime query default` | `reg query` ключа `kimi-code` |
| Команда хука | строка `/bin/sh` с `~/.local/bin/wfk` | то же | `"<node.exe>" "<wfk.mjs>" hook …` для `cmd.exe`; путь с `"`, `%` или переводом строки — `unknown` |
| Права `config.toml` и копий | сохраняются (новый — 0600) | то же | не задаются |
| Переводы строк блоков | как в файле | как в файле | как в файле (`\r\n` сохраняется) |
| Каталог Kimi | `~/.kimi-code` | `~/.kimi-code` | `%USERPROFILE%\.kimi-code` |
| Программа | `bin/kimi` | `bin/kimi` | `bin\kimi.exe` |
| Имена переменных окружения | с учётом регистра | с учётом регистра | без учёта регистра |
| Сравнение папок, «папка внутри проекта» | точное | точное | без регистра, любой слеш |
| Замок хода | pid и `startedAt` из файла, хост — `os.hostname()` | то же | то же |
| Пометка «на этой ОС не проверялся» | нет | есть | есть |
| Живая проверка | пользователь | нет, только CI | проверяющий на Windows (**П**) |

Программы одной ОС вызывает только проверка приложения (`xdg-mime`, `reg` —
`src/app-link.ts`, запись в `tools/platform-guard/allowlist.json`); процесс
сервера запускает и завершает `process-supervisor`.

## Факты Kimi 2.5.2 (стенд, отдельный `KIMI_CODE_HOME`)

- `kimi --version` печатает `2.5.2`; pid записи `server/instances` равен pid
  запущенного процесса; времена в записи — миллисекунды.
- Отказ авторизации: HTTP 401 и конверт `{ code: 40101, msg: "Unauthorized" }`.
- Без входа: `auth` → `models_ready: false`; в `config` ключа
  `default_model` нет вовсе; `workspaces` → `{ items: [] }`.
- `POST /workspaces` дважды с одним ключом возвращает ту же область
  (`wm_<uuid>`); области хранятся в `<home>/projects.json`.
- `POST …/trust {}` → `{ trusted: true }` и файл
  `workspace-trust/wd_<имя>_<hash12>`; неизвестный id → `40001`.
- `POST /api/v1/shutdown {}` → `{ ok: true }`, запись `instances` исчезает.
- Сессии: `GET /api/v2/sessions` → `items[{ id, workspace { id, cwd },
  meta { title, created_at (мс), archived }, activity { status, model } }]`,
  `has_more`, `next_page_token`; `POST /api/v1/sessions` → `id
  session_<uuid>`, `created_at` ISO, `pending_interaction`; нет сессии —
  `40401`; `:archive`/`:restore` → `{ results: [{ id, ok, error? }] }`;
  `:delete {}` → `{ deleted: true }`; ответ `prompts` → `status`
  `running` или `queued`; у сообщений `assistant` поля `metadata` нет.
- `kimi doctor config`: код 0 для файла с пятью блоками Kit (строка POSIX и
  строка Windows) и для пустого файла, код 1 для битого TOML;
  `GET /api/v1/config` → `hooks: [{ event, command, timeout }]`.
- Хуки выполняются только те, что были в `config.toml` при запуске сервера;
  `GET /api/v1/config` перечитывает файл при создании сессии (стенд 2.5.2).
  Приложение Kimi Code держит свой сервер внутри процесса (запись
  `server/instances`, `started_at` в мс).

## Инварианты

- Тесты работают с подставным сервером и временным каталогом Kimi;
  настоящий `~/.kimi-code` не читается и не меняется. Ответы подставного
  сервера — захваты 2.5.2 из `test/fixtures` (см.
  [захваты](../../../../../../docs/evidence/M8-kimi-captures.md)).
- Токен не попадает в URL, журнал, ошибки и ответы панели.
- Провайдер не импортирует другие провайдеры.

## Сценарные тесты

`test/scenarios.test.ts` проверяет цепочку целиком (спецификация M8, раздел
7): настоящая служба (`createApp` и `main` из `#cli` — зависимость только
тестов), настоящий провайдер Kimi на подставном сервере, настоящий Kit во
временном git-репозитории, хуки в том виде, как их шлют приложения
(`test/scenario-world.ts`). Ход Kimi имитируется замком сессии, хуком
`prompt`, сообщениями на сервере и хуком `turn-end` при живом замке.

- Автопилот: предложение плана → выбор режима → запуск → QUALITY → T001 →
  DOCS; выбор, запуск и два продолжения подряд приходят в сессию как
  prompt со своим `prompt_id`; `Stop` подагента посреди хода ничего не
  доставляет; тексты последовательного режима говорят, что из Kimi
  оркестрация не запускается.
- Ревью Kimi → ChatGPT → Kimi: сессия во второй рабочей области той же
  папки описывает план, служба создаёт сессию ChatGPT с брифом, замечания
  и ответы ходят два круга до `REVIEW: AGREED`, после чего план ждёт выбора
  режима.

На всех ОС сценарии одинаковы; они идут в CI на macOS, Linux и Windows.
Закрытая подставная машина (`test/helpers.ts`) серверов больше не запускает:
запоздалая работа службы не оставляет слушающий сервер, из-за которого
процесс тестов не завершался бы.
