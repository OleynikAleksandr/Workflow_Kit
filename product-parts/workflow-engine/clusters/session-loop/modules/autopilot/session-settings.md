# autopilot: настройки автопилота сессии (M48 T001)

Часть контракта [module.md](module.md). Спецификация —
[M48](../../../../../../docs/planning/M48-session-autopilot.md), раздел 3.1.

## Правило

Settings («Автопилотирование», «Ревью спецификации и плана») — значения по умолчанию. Сессия
берёт их один раз, когда начинается для службы, и дальше живёт со своими режимом и ревью;
смена Settings на начатую сессию не влияет. Пользователь меняет режим и ревью сессии на её
карточке в любой момент.

## Хранилище (`src/session-settings.ts`)

- `createSessionSettings({ settings, journal, projectPath, platform?, now?, log? }) →
  SessionSettingsStore`. Файл сессии — `<проект>/.workflow-kit/local/autopiloting/sessions/<client>.<id>.json`
  (`SESSION_SETTINGS_DIR`, `sessionSettingsFile`, `sessionSettingsName`): `{ version: 1, revision,
  key, mode: off | after-start | full, review, source: defaults | user | run, at }`. В имени
  нет `:` и других знаков, которые не принимает Windows (недопустимые знаки — `_`); путь — через
  `path`; запись — `writeJsonAtomic` (0600/0700, временный файл и `rename` с повтором на Windows,
  платформа внедряется).
- `validSessionKey(key)` — `<client>:<id>`: клиент `[a-z][a-z0-9-]*`, id из `[A-Za-z0-9._-]`;
  другой ключ — `SettingsError` `bad-request`.
- `ensure(projectId, key)` — запись сессии; её нет — она создаётся сейчас: владелец активного
  запуска проекта берёт режим и ревью запуска (`source: run`, переход со старых версий), любая
  другая сессия — Settings этого момента (`source: defaults`). Есть — возвращается без
  изменений (возобновление сессии, повторный хук). Неизвестный проект — `project-not-found` (404).
- `get(projectId, key)` — запись или `null`, ничего не создаёт.
- `write(projectId, key, { expectedRevision, mode?, review? })` — изменение на карточке сессии:
  нужен хотя бы один из `mode`/`review`; ревизия сверяется с файлом (запись по одной на файл);
  `revision + 1`, `source: user`, затем слушатели `onChange({ projectId, folder, key, before,
  after })`. Отказы — `SettingsError`: `bad-request` (400), `project-not-found` (404),
  `settings-stale` (409, `current` — сохранённая запись сессии).
- `load(projects)` — при старте службы читает записи всех проектов для раздела состояния;
  `section()` → `{ <projectId>: { <key>: запись } }`; раздел состояния `autopiloting.sessions`
  (`runs-routes.ts`, M48 T005) добавляет к каждой записи `reviewState` (опция `review`) и `effect`
  (последнее переключение, опция `switcher`) для карточки сессии панели.

## Где читается

- `createRuns({ …, sessions? })` (`runs.ts`): `authorizePreparation`, `planDecision`,
  `beginExecution` и `policy(projectId, key)` берут режим и ревью сессии (`ensure`); без опции
  `sessions` — Settings, как раньше. `policy(projectId)` без ключа — режим Settings.
- `runs.sessionChanged(change)` — переход сессии в `off` ставит на паузу запуск, владелец
  которого — эта сессия (`paused`, `reason=settings-off`, живое разрешение отзывается
  `autopilot:revoke --reason settings-off --note "Session card: autopiloting off"`,
  `resumable=true`; `pauseForSessionOff` в `src/session-pause.ts`, `SESSION_OFF_NOTE`); «Продолжить» —
  новая ревизия разрешения, как раньше. Карточка другой
  сессии запуск не трогает. Смена Settings ничего не ставит на паузу.
- `createAgentNotices({ journal, sessions?, enqueue, log? })`: смена карточки сессии —
  `Workflow Kit: the autopilot of this session changed: mode=<…>, review=<on|off>.` только этой
  сессии (без пробуждения, одна строка подряд один раз); смена Settings — никому.
- Служба (`cli/autopiloting-wiring.ts`): `sessions` в `AutopilotingWiring`, `sessions.load` при
  `recoverAll`, `agentState(projectId, key)` — ответ хука `SessionStart` (`mode=…, review=…`)
  по записи сессии; первый `SessionStart` сессии создаёт её запись из Settings, возобновление
  её не меняет.

## Маршруты (`src/runs-routes.ts`)

- `GET /api/projects/:id/sessions/:sid/autopiloting` → `{ settings: запись }` (`ensure`).
- `POST /api/projects/:id/sessions/:sid/autopiloting { expectedRevision, mode?, review? }` →
  `{ settings }`; 400, 404, 409 `settings-stale` с `current`.
- `GET /api/projects/:id/autopiloting/policy?session=<key>` — политика по режиму сессии.
- Раздел `autopiloting` состояния — плюс `sessions: { <projectId>: { <key>: запись } }`.
- Этап задания и строка последствия (`stage`, `effect`) — T002, [session-switch.md](session-switch.md).

## Поведение на ОС

Общий код на macOS, Linux и Windows; ветки ОС нет. Имя файла без `:` (тест имён), запись через
`writeJsonAtomic` с внедрённой платформой (тест записи с `win32`).

## Тесты

`test/m48-session-settings.test.ts`: имена файлов и ключи, значения по умолчанию при начале и
неизменность при смене Settings, переход владельца запуска, запись с ревизией и отказы
(платформа `win32`), чтение после перезапуска, точки решения по сессии, маршруты и раздел
состояния. `test/runs-real.test.ts` (настоящий Kit): Settings `off` ничего не ставит на паузу,
карточка другой сессии запуск не трогает, `off` своей сессии отзывает разрешение, «Продолжить»
пишет новую ревизию. `test/agent-notices.test.ts`: строка карточки только этой сессии.
