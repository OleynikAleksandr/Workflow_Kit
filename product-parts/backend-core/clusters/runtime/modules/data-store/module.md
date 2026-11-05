# Модуль: data-store

Часть `backend-core`, кластер `runtime`. Алиас импорта: `#data-store`.

## Назначение

Данные Workflow Kit на диске: выбор каталогов по ОС, их создание с правами
0700, чтение `config.json`, атомарная запись JSON, журнал событий
`events.jsonl` и мьютексы по ключу.

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
  Опции: `mode` (права файла), `dirMode` (права создаваемых каталогов,
  по умолчанию 0700).
- `writeFileAtomic(file, text, { mode?, dirMode? })` — та же атомарная
  запись для текста (права выставляются точно, независимо от umask);
  `kit-structure` пишет так файлы в папку проекта (0644, каталоги 0755).
- `readJsonFile(file)` — `undefined`, если файла нет;
  `InvalidJsonFileError` при невалидном JSON (файл не перезаписывается).
- `loadConfig({ dirs, env, homedir? }) → WfkConfig` — `port` (4747,
  `WFK_PORT` важнее файла; 0 — любой свободный порт), `projectsRoot`
  (`~/WorkflowKitProjects`), `programs` (пути программ, D12). Ошибка значения
  — `ConfigError`.
- `parsePort(value, source)`, `configFile(dirs)`, `DEFAULT_PORT`.
- `createEventLog({ file, maxBytes?, now?, mode? }) → EventLog` — журнал
  JSON Lines: `append(type, fields?)` дописывает строку
  `{ ...fields, time, type }` (записи идут строго по очереди). Если строка
  сделает файл больше `maxBytes` (`EVENTS_MAX_BYTES` = 5 МиБ), файл сначала
  переименовывается в `events.1.jsonl` (предыдущая копия заменяется) и
  начинается новый. Права файла 0600.
- `eventsFile(dirs)` — `<state>/events.jsonl`; `rotatedEventsFile(file)`.
- `createKeyedMutex() → KeyedMutex` — `run(key, action)` выполняет действия
  с одним ключом по очереди (D10), ошибка действия освобождает ключ;
  `busy(key)`.

## Инварианты

- Модуль не зависит от других модулей и не знает об HTTP.
- Свои JSON пишутся только через `writeJsonAtomic` (D10).
- Тесты используют `WFK_DATA_DIR` во временном каталоге и подставные
  `platform`/`env`/`homedir`; настоящий HOME не трогается.

## Дальше

T004 — операции (D10: `operationId`, ход в `/api/state`); T008 — запись
путей программ в `config.json` (D12). Файл `projects.json` ведёт модуль
`project-registry` через `writeJsonAtomic`.
