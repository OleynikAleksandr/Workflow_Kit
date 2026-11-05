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
- `createOperations({ now?, newId?, keepFinished?, keepMs? }) → Operations`
  — долгие действия (D10) в памяти: `start({ key, kind, title, scope?, run,
  onFinish? })` сразу возвращает `{ operation, existing }` и выполняет
  `run(handle)` в фоне; пока операция с тем же `key` идёт, повторный
  `start` возвращает её (`existing: true`) и второй раз ничего не
  запускает. `Operation`: `id` (operationId), `key`, `kind`, `title`,
  `scope`, `status` (`running` | `succeeded` | `failed`), `progress`
  (`handle.progress(note)`), `startedAt`, `finishedAt`, `result?`,
  `error?` (`{ code, message, hint?, ...details }` из
  `toOperationError`). `onFinish(operation)` вызывается один раз после
  завершения (ошибки игнорируются; так пишется журнал). `get`,
  `active(key)`, `list()` (идущие первыми, затем новые), `wait(id)`,
  `section()` → `{ operations }` (раздел `/api/state`). Хранятся последние
  50 завершённых не дольше 15 мин; после перезапуска службы операций нет.
- `backupFile(file, { backupsDir, keep?, now? }) → string | null` — копия
  чужого конфига перед записью (D7) в
  `<backups>/<имя>-<sha256 пути, 10 знаков>/<время>.<расширение>` (0600,
  каталоги 0700); остаются последние `BACKUPS_KEPT` (10); нет файла —
  `null`. `backupDirFor(backupsDir, file)`.

## Инварианты

- Модуль не зависит от других модулей и не знает об HTTP.
- Свои JSON пишутся только через `writeJsonAtomic` (D10).
- Тесты используют `WFK_DATA_DIR` во временном каталоге и подставные
  `platform`/`env`/`homedir`; настоящий HOME не трогается.

## Потребители

- `cli` создаёт каталоги, читает конфиг, ведёт журнал событий, мьютекс и
  операции (`createOperations`) и отдаёт раздел `operations`.
- Атомарная запись: `project-registry` — `projects.json`, `process-supervisor`
  — `processes.json`, `provider-claude` и `provider-codex` — свои записи
  сессий `<state>/sessions/<провайдер>.json` (`writeJsonAtomic`);
  `kit-structure` — файлы в папке проекта, `service-installer` — файлы
  развёртывания и `config.json` (`writeFileAtomic`).
- Копии чужих конфигов (D7) через `backupFile`: `provider-claude` —
  `~/.claude.json` перед записью доверия, `provider-codex` —
  `~/.codex/config.toml` перед записью доверия и одобрением хука.
- `service-installer` при `install` дописывает в `config.json` `programs`
  (пути `node`, `claude`, `codex`, `expect`) и `loginPath` (D12), сохраняя
  остальные ключи. `loadConfig` читает `programs` (по ним провайдеры
  находят `claude` и `codex`); `loginPath` он не читает: PATH служба
  получает от автозапуска.

## Дальше

В вехе 1 новых обязанностей у модуля нет.
