# Модуль: data-store

Часть `backend-core`, кластер `runtime`. Алиас импорта: `#data-store`.

## Назначение

Данные Workflow Kit на диске: выбор каталогов по ОС, их создание с правами
0700, чтение `config.json`, атомарная запись JSON.

## Публичный интерфейс (`src/index.ts`)

- `resolveDataDirs({ platform, env, homedir }) → DataDirs` — чистая функция:
  - macOS: всё в `~/Library/Application Support/Workflow Kit`;
  - Linux (и прочие Unix): конфиг `$XDG_CONFIG_HOME/workflow-kit`,
    состояние `$XDG_STATE_HOME/workflow-kit`, приложение
    `$XDG_DATA_HOME/workflow-kit` (неабсолютные XDG-пути игнорируются,
    умолчания `~/.config`, `~/.local/state`, `~/.local/share`);
  - Windows: всё в `%LOCALAPPDATA%\Workflow Kit` (без переменной —
    `<профиль>\AppData\Local`);
  - `WFK_DATA_DIR` переопределяет все каталоги одним (`overridden: true`).
  `DataDirs`: `configDir`, `stateDir`, `appDir`, `logsDir`
  (`<state>/logs`), `backupsDir` (`<state>/backups`), `overridden`.
- `ensureDataDirs(dirs, platform?)` — создаёт каталоги и выставляет им 0700
  (кроме Windows); повторный вызов безопасен.
- `listDataDirs(dirs)` — уникальные каталоги раскладки.
- `dataPlatform(platform)` — `darwin` / `win32` / `linux`.
- `writeJsonAtomic(file, value, { mode? })` — JSON с отступом 2 и переводом
  строки: запись во временный файл рядом, `fsync`, `rename`; права файла по
  умолчанию 0600; при ошибке временный файл удаляется.
- `readJsonFile(file)` — `undefined`, если файла нет;
  `InvalidJsonFileError` при невалидном JSON (файл не перезаписывается).
- `loadConfig({ dirs, env, homedir? }) → WfkConfig` — `port` (4747,
  `WFK_PORT` важнее файла; 0 — любой свободный порт), `projectsRoot`
  (`~/WorkflowKitProjects`), `programs` (пути программ, D12). Ошибка значения
  — `ConfigError`.
- `parsePort(value, source)`, `configFile(dirs)`, `DEFAULT_PORT`.

## Инварианты

- Модуль не зависит от других модулей и не знает об HTTP.
- Свои JSON пишутся только через `writeJsonAtomic` (D10).
- Тесты используют `WFK_DATA_DIR` во временном каталоге и подставные
  `platform`/`env`/`homedir`; настоящий HOME не трогается.

## Дальше

T002 — `projects.json`; T004 — журнал событий `events.jsonl` (ротация
5 МБ), мьютексы и операции (D10); T008 — запись путей программ в
`config.json` (D12).
