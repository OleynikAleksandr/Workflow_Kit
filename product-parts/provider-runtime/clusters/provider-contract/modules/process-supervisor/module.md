# Модуль: process-supervisor

Часть `provider-runtime`, кластер `provider-contract`. Алиас импорта:
`#process-supervisor`.

## Назначение

Запуск, учёт и остановка процессов сессий и окружений (D5, D9) и
внедряемый исполнитель внешних программ. Процессы живут отдельно от службы
и переживают её перезапуск; остановить можно только процесс из своей
записи, после сверки личности.

## Публичный интерфейс (`src/index.ts`)

- `createProcessSupervisor({ file, platform?, inspect?, bootId?, signal?,
  graceMs?, killWaitMs?, pollMs? }) → ProcessSupervisor`; `file` —
  `processesFile(stateDir)` = `<state>/processes.json` (атомарная запись,
  0600). Методы:
  - `spawn({ owner, command, args, cwd, env, extraEnv?, logFile })` —
    `detached` (своя группа процессов, лидер группы — сам процесс), stdin
    закрыт, stdout и stderr дописываются в `logFile` (0600, каталоги 0700;
    `logFile: null` — вывод отбрасывается и файл не создаётся: так
    запускается программа, печатающая секрет, например сервер Kimi),
    окружение — `cleanEnv(env, { extra: extraEnv })` (без `CLAUDE*`),
    `unref()`. Сразу после старта через `ps` читаются группа, время старта
    и командная строка; запись `ProcessRecord`: `id`, `owner` (`provider`,
    `project`, `kind`, `ref`), `pid`, `pgid`, `command`, `args`, `cwd`,
    `logFile`, `startToken`, `startedAt`, `commandLine`, `bootId`,
    `children`, `renames` (только `true`). `SpawnSpec.renames` — процесс сам
    меняет своё имя после старта (`kimi web` виден как `kimi-code`, M9 раздел
    8.2): такую запись `check`, `stop` и `reconcile` узнают по pid и времени
    старта без сравнения командной строки. Процесс, завершившийся до проверки, — `ProcessError`
    `exited`. Windows (M5, раздел 3): `detached` + `windowsHide` (процесс
    переживает службу, его консоль скрыта), группы нет (`pgid: null`).
  - `track(id, pid)` — добавить проверенный pid к записи (например, pid
    дочернего `claude`, который сообщает `expect`); `stop` завершает и его.
  - `get(id)`, `list(filter?)` (по полям `owner`), `forget(id)`.
  - `check(id)` — полная проверка: другой boot id или нет процесса —
    `gone`; время старта или командная строка не совпали (pid занят другим
    процессом) — `mismatch`; совпали — `alive`. На Windows сверка — через CIM.
  - `quickCheck(id)` — для опроса без внешних программ: boot id и
    `kill(pid, 0)`.
  - `stop(id, { graceMs? })` — сверка; TERM группе (лидер совпал) и
    проверенным детям; ожидание (по умолчанию 5 с) с повторной сверкой;
    KILL только тем, кто снова прошёл сверку (или группе, пережившей
    лидера: в ней только потомки нашей записи); ожидание 2 с. Итог
    `outcome`: `stopped`, `killed`, `already-gone`, `mismatch` (сигналы не
    посылались, запись удалена), `unverifiable`, `still-running`.
    Остановленная запись удаляется.
  - `reconcile()` — удаляет записи `gone` и `mismatch` (после перезагрузки —
    все); вызывается при старте службы и по `POST /api/refresh`.
- `cleanEnv(env, { prefixes?, extra?, platform? })` — копия без
  переменных `CLAUDE*` (`STRIPPED_ENV_PREFIXES`; на Windows без учёта
  регистра) и без `undefined`.
- `runCommand(command, args, { cwd?, env?, input?, timeoutMs?, maxBytes? })
  → RunResult` (`code`, `signal`, `stdout`, `stderr`, `timedOut`,
  `startError`) — без shell, таймаут (`COMMAND_TIMEOUT_MS` = 15 с) с KILL,
  ограниченный вывод; никогда не бросает. Тип `CommandRunner` — для
  внедрения подставных программ.
- `psInspector({ platform?, run? })` — `ps -ww -o pgid= -o lstart= -o
  args= -p <pid>` с `LC_ALL=C`; `parsePsLine(pid, line)`.
- `systemBootId({ platform?, run?, readText? })` — Linux
  `/proc/sys/kernel/random/boot_id`, macOS `sysctl -n kern.boottime`
  (секунды загрузки), иначе `null`; значение кэшируется.
- `ProcessError` (`not-found` | `start-failed` | `exited` |
  `unsupported`); типы `ProcessRecord`, `ProcessOwner`, `TrackedPid`,
  `ProcessCheck`, `StopResult`, `SpawnSpec`, `ProcessInfo`,
  `ProcessInspector`, `BootIdReader`, `RunOptions`, `RunResult`.

## Инварианты

- Сигнал посылается только процессу из своей записи после сверки pid,
  времени старта, командной строки и boot id; никаких `pkill` по шаблону.
- Чужой процесс с тем же pid (`mismatch`) не получает ни одного сигнала.
- Дочерние процессы не наследуют `CLAUDE*`.
- Модуль зависит только от `#data-store`; о провайдерах не знает.
- Тесты запускают только свои `node -e` процессы; сверка и чужие pid
  проверяются на подставных `inspect` и `signal`.

## Потребители

- `cli` создаёт супервизор над `<state>/processes.json` и передаёт его
  провайдерам в контексте; `reconcile` вызывается обновлением провайдеров
  при старте службы и по `POST /api/refresh`.
- `provider-claude` запускает сессии и окружение папки под `expect`
  (`spawn`), добавляет pid дочернего `claude` через `track`, останавливает
  через `stop`.
- `provider-claude`, `provider-codex` и `service-installer` используют
  `cleanEnv`;
  `runCommand` — исполнитель внешних программ по умолчанию в `cli` и
  `service-installer`.

## Windows (`src/windows.ts`, спецификация M5, раздел 3)

- `cimInspector({ run? })` — личность процесса через Windows PowerShell
  (`Get-CimInstance Win32_Process`): `startToken` — `CreationDate` в UTC (ISO,
  7 знаков дробной части), `commandLine` — `CommandLine`; вывод в UTF-8
  (`parseCimLine`). `wmic` не используется (удалён в Windows 11 24H2).
- `windowsBootId({ run? })` — `win32:<LastBootUpTime UTC>`.
- `taskkill(run, pid, force)` — `taskkill /PID <pid> /T` (дерево процессов
  вместо группы), с `/F` — принудительно.
- `stop` на Windows: «TERM» — `taskkill /T`, ожидание по наличию pid (запрос
  CIM занимает около секунды), «KILL» — `taskkill /T /F` только после
  повторной сверки личности через CIM. Итоги те же: `stopped`, `killed`,
  `already-gone`, `mismatch`, `still-running`.
- Опция `run` диспетчера — исполнитель `taskkill` и PowerShell (тесты
  передают подделку).
- `renames` одинаков на macOS, Linux и Windows: сверяется `startToken`
  (`ps lstart` или `CreationDate`) без `commandLine`; тест — с подставленной
  платформой для всех трёх ОС.
