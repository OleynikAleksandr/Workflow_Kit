# Модуль: provider-kimi

Часть `provider-runtime`, кластер `provider-adapters`. Алиас импорта:
`#provider-kimi`.

## Назначение

Провайдер Kimi Code по контракту `provider-registry`
([спецификация M8](../../../../../../docs/planning/M8-kimi-provider.md),
[протокол](../../../../../../docs/planning/M8-kimi-protocol.md)): программа
`kimi`, свой сервер `kimi web` на 127.0.0.1, рабочая область папки и
доверие папке. Имя — «Kimi Code», `label` «Kimi», `mark` K, диалект хука
`kimi`. В списке провайдеров идёт третьим (после ChatGPT и Claude).

Хук Kit в `config.toml` и сессии подключаются следующими задачами плана M8:
до них `hooks()` отвечает `complete: null`, `listSessions()` — пустым
списком, `createSession()` — отказом `not-implemented` (501), а возможности
`hooks` и `createSession` недоступны с причиной.

## Публичный интерфейс (`src/index.ts`)

- `createProvider: ProviderFactory` — провайдер для службы; `cli`
  регистрирует его в `PROVIDER_ENTRIES`.
- `createKimiProvider(context, deps?)`, `createKimiRuntime(context, deps?)`
  → `{ runtime, provider }`. `KimiDeps`: `fetch`, `startWaitMs` (15 с),
  `stopWaitMs` (5 с), `pollMs`, `freePort`, `tokenNow`. `KimiRuntime`
  (`context`, `paths`, `server`, `workspaces`, `program()`,
  `requireReady()`, `requireProgram()`) — общая часть для хука и сессий.
- Константы: `PROVIDER_ID` = `kimi`, `PROVIDER_TITLE`, `RESTART_ACTION` =
  `restart-kimi-server`, `LOGIN_NOTE`, `MODEL_NOTE`, `UNTESTED_OS_NOTE`,
  `ON_DEMAND_NOTE`, `MIN_KIMI_VERSION` = `2.5.2`, `KIMI_HOME_ENV` =
  `KIMI_CODE_HOME`, `LOCK_SWITCH` = `KIMI_CODE_SESSION_LOCK`,
  `SERVER_OWNER`, `KIMI_CODES`, `KIMI_TIMEOUT_MS` (10 с).
- Пути: `kimiHome(env, homedir, platform)`, `kimiPaths(home, platform)`,
  `pathApi`, `envValue`, `envWithout`, `sameFolder`.
- Программа: `readProgram(context, paths)`, `findKimiProgram`,
  `parseVersion`, `compareVersions`, `testedVersion`.
- Клиент: `createKimiClient({ port, tokenFile, fetch?, timeoutMs? })`,
  `KimiError`, `describeKimiError`, `shapeError`.
- Формы ответов: `parseMeta`, `parseAuth`, `parseConfig`, `parseWorkspace`,
  `parseWorkspaces`, `parseTrusted`, `parseInstance`.
- Сервер: `createKimiServer(deps)` → `{ current(), ensure(), stop(), used }`,
  `freeLocalPort()`, `readInstances(dir)`.
- Рабочие области и доверие: `createKimiWorkspaces(platform)` →
  `{ find, ensure }`, `pickWorkspace`, `workspaceKey`, `realFolder`,
  `folderTrusted(paths, folder, platform)`, `createKimiTrust(deps)`.

## Файлы Kimi

Каталог Kimi — `KIMI_CODE_HOME`, иначе `<home>/.kimi-code`. Kit читает в нём:

| Файл | Зачем |
| --- | --- |
| `bin/kimi` (`bin\kimi.exe`) | программа, если путь не сохранён в `config.programs.kimi` |
| `server.token` | токен сервера; читается перед каждым запросом |
| `server/instances/<id>.json` | `{ server_id, pid, host, port, … }` работающих серверов |
| `workspace-trust/*` | файлы доверия `{ root, trustedAt }` |

Kit сам в каталог Kimi не пишет: рабочую область (`projects.json`) и файл
доверия создаёт сервер Kimi по запросу Kit.

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
2.5.x, но формы ответов известны — провайдер остаётся `ready`) и «на этой
ОС не проверялся» (Linux и Windows). `details.kimiHome` — каталог Kimi.

`requireReady()` — вход всех операций, которым нужен сервер: перечитывает
программу, если прошлой проверкой она не найдена или не подошла, запускает
сервер, проверяет вход и модель; иначе `ProviderError` (`not-installed`,
`unsupported-version`, `kimi-program`, `kimi-server`, `kimi-not-ready`).

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

## Поведение на ОС

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Каталог Kimi | `~/.kimi-code` | `~/.kimi-code` | `%USERPROFILE%\.kimi-code` |
| Программа | `bin/kimi` | `bin/kimi` | `bin\kimi.exe` |
| Имена переменных окружения | с учётом регистра | с учётом регистра | без учёта регистра |
| Сравнение папок | точное | точное | без регистра, любой слеш |
| Пометка «на этой ОС не проверялся» | нет | есть | есть |
| Живая проверка | пользователь | нет, только CI | проверяющий на Windows (**П**) |

Вызовов программ одной ОС в модуле нет; процесс сервера запускает и
завершает `process-supervisor`.

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

## Инварианты

- Тесты работают с подставным сервером и временным каталогом Kimi;
  настоящий `~/.kimi-code` не читается и не меняется. Ответы подставного
  сервера — захваты 2.5.2 из `test/fixtures` (см.
  [захваты](../../../../../../docs/evidence/M8-kimi-captures.md)).
- Токен не попадает в URL, журнал, ошибки и ответы панели.
- Провайдер не импортирует другие провайдеры.

## Дальше

Хук Kit в `config.toml` (T008), сессии и сообщения (T009), ссылки и панель
(T010), сценарии автопилота и ревью (T011).
