# Модуль: cli

Часть `backend-core`, кластер `runtime`. Алиас импорта: `#cli`.

## Назначение

Точка входа `wfk` и сборка бэкенда. Модулю принадлежит `bin/wfk.mjs`:
обычный JavaScript, который сначала проверяет Node.js >= 24 (иначе понятная
ошибка и код 1) и только потом загружает `#cli` (TypeScript через type
stripping).

## Публичный интерфейс (`src/index.ts`)

- `main(argv, deps?) → Promise<number>` — разбор команды, возвращает код
  выхода. `deps` (`stdout`, `stderr`, `app`, `waitForShutdown`) внедряются в
  тестах.
- `createApp(options?) → Promise<App>` — сборка бэкенда: каталоги данных
  (создаются с правами 0700), конфиг, реестр маршрутов, реестр разделов
  состояния, HTTP-сервер с панелью, журнал событий, мьютекс и реестр
  проектов. `App`: `dirs`, `config`, `version`, `os`, `router`, `state`,
  `server`, `events` (`events.jsonl`), `mutex` (D10), `projects`
  (`ProjectRegistry`), `start()` (пишет событие `service.started`), `stop()`. Опции: `env`, `platform`,
  `homedir`, `getInterfaces`, `osInput`, `log`.
- `detectOs(input)`, `panelUrls(port, interfaces)`, `readPackageVersion()`.
- Константы `COMMANDS`, `EXIT_USAGE` (64), `EXIT_NOT_IMPLEMENTED` (2).
- Типы `CliDeps`, `App`, `AppOptions`, `SystemSection`, `OsInfo`,
  `DetectOsInput`.

## Команды

| Команда | Поведение в T001 |
| --- | --- |
| `serve` | собирает приложение, слушает `config.port` (4747, `WFK_PORT`), печатает адреса панели, останавливается по SIGINT/SIGTERM |
| `install`, `uninstall`, `service start/stop` | передаются в `service-installer` (заглушка: «не реализовано», код 2) |
| `service status` | статус из `service-installer` (заглушка: «не установлена») |
| `open`, `doctor` | «не реализовано (задача T008)», код 2 |
| `link` | «не реализовано (задача T003)», код 2 |
| `hook` | «не реализовано (задача T003)» в stderr, всегда код 0 и пустой stdout |
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

## Инварианты

- Модули подключаются только через их `src/index.ts` (`#data-store`,
  `#http-server`, `#panel-shell`, `#project-registry`, `#service-installer`).
- Новые возможности добавляются регистрацией в `app.router` и `app.state`
  внутри `createApp` до `start()`.
- `hook` никогда не завершается ошибкой и ничего не печатает в stdout.

## Дальше

T003–T007 регистрируют свои маршруты и разделы состояния в `createApp`;
T003 реализует `link` и `hook`; T008 — `open`, `doctor` и службу.
