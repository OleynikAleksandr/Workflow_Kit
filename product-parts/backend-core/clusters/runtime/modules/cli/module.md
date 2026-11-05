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
  `readStdin`) внедряются в тестах; `app.env`, `app.platform`,
  `app.homedir` служат и командам `link` и `hook`.
- `runHook(args, deps) → Promise<0>`, `readProcessStdin(timeoutMs)`,
  `HOOK_BUDGET_MS` (1500), тип `HookDeps`.
- `linkLauncher(options) → LinkResult`, `launcherPath(homedir)`,
  `launcherScript(node, entry)`, `LAUNCHER_MARK`, `REPO_ROOT`, `LinkError`,
  типы `LinkOptions`, `LinkResult`.
- `createApp(options?) → Promise<App>` — сборка бэкенда: каталоги данных
  (создаются с правами 0700), конфиг, реестр маршрутов, реестр разделов
  состояния, HTTP-сервер с панелью (`panelShellMount()` в корне и
  `providerCardsMount()` под `/provider-cards/`), журнал событий, мьютекс, реестр
  проектов, операции, учёт процессов и реестр провайдеров. `App`: `dirs`,
  `config`, `version`, `os`, `router`, `state`, `server`, `events`
  (`events.jsonl`), `mutex` (D10), `projects` (`ProjectRegistry`),
  `operations` (`Operations`, D10), `providers` (`ProviderRegistry`),
  `supervisor` (`ProcessSupervisor`, `<state>/processes.json`), `start()`
  (пишет событие `service.started` и запускает операцию
  `providers.refresh`: сверка записей процессов и `refresh?()` провайдеров,
  D11), `stop()`. Опции: `env`, `platform`, `homedir`, `getInterfaces`,
  `osInput`, `log`, `providers` (фабрики вместо `DEFAULT_PROVIDERS`),
  `runCommand` (исполнитель внешних программ для провайдеров), `supervisor`.
- `DEFAULT_PROVIDERS` — фабрики `createProvider` из `#provider-claude` и
  `#provider-codex`, в порядке панели.
- `detectOs(input)`, `panelUrls(port, interfaces)`, `readPackageVersion()`.
- Константы `COMMANDS`, `EXIT_USAGE` (64), `EXIT_NOT_IMPLEMENTED` (2).
- Типы `CliDeps`, `App`, `AppOptions`, `SystemSection`, `OsInfo`,
  `DetectOsInput`.

## Команды

| Команда | Поведение |
| --- | --- |
| `serve` | собирает приложение, слушает `config.port` (4747, `WFK_PORT`), печатает адреса панели, останавливается по SIGINT/SIGTERM |
| `install`, `uninstall`, `service start/stop` | передаются в `service-installer` (заглушка: «не реализовано», код 2) |
| `service status` | статус из `service-installer` (заглушка: «не установлена») |
| `open`, `doctor` | «не реализовано (задача T008)», код 2 |
| `link [--force]` | пишет запускатель `~/.local/bin/wfk` (0755, `#!/bin/sh`, строка-метка `# Workflow Kit launcher`), который запускает `bin/wfk.mjs` этого клона абсолютным `node`; чужой файл заменяется только с `--force`; предупреждает, если каталога нет в PATH; на Windows — отказ, код 1 |
| `hook session-start --client <claude\|codex>` | читает JSON хука из stdin (до 1 с, терминал — пусто) и передаёт `recordSessionStart` из `kit-structure`; весь бюджет 1,5 с; stdout пуст, код всегда 0; другие подкоманды `hook` игнорируются |
| `--help`, `--version` | справка и версия из `package.json` |

Неизвестная команда — сообщение и справка в stderr, код 64.

## Раздел состояния «system»

`GET /api/state` → `system`: `version`, `os` (`label` вида
«macOS 26.1 (arm64)»; версия ОС читается из
`SystemVersion.plist` / `/etc/os-release` / `os.version()` один раз при
старте, без внешних программ), `node`, `hostname`, `pid`, `startedAt`,
`port`, `dataDir` (каталог конфига), `dataDirOverridden`, `dataDirs`,
`addresses` (URL панели: loopback и адреса Tailscale), `service` (статус из
`service-installer`). `GET /api/health` → `{ ok, version, pid, startedAt }`.

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
- `provider-cards` (T005): статика карточек провайдеров
  (`providerCardsMount()`, префикс `/provider-cards/`).
- `process-supervisor` (T004): `createProcessSupervisor` над
  `<state>/processes.json`, `runCommand`.

## Инварианты

- Модули подключаются только через их `src/index.ts` (`#data-store`,
  `#http-server`, `#kit-structure`, `#panel-shell`, `#process-supervisor`,
  `#provider-cards`,
  `#project-registry`, `#provider-claude`, `#provider-codex`,
  `#provider-registry`, `#service-installer`).
- Провайдер подключается фабрикой `createProvider` своего модуля; его
  реализация меняется без правок `cli`.
- Новые возможности добавляются регистрацией в `app.router` и `app.state`
  внутри `createApp` до `start()`.
- `hook` никогда не завершается ошибкой и ничего не печатает в stdout.
- Тесты `link` работают на подставном HOME; настоящий
  `~/.local/bin/wfk` не трогается.

## Дальше

T006 и T007 меняют только свои модули провайдеров; T008 — `open`, `doctor`, служба и установка запускателя `install`
(с той же меткой `LAUNCHER_MARK`).
