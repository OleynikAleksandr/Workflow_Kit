# autopilot: настройки и запуски автопилотирования (M39)

Часть контракта модуля [autopilot](module.md). Спецификация —
[M39-autopiloting-runtime.md](../../../../../../docs/planning/M39-autopiloting-runtime.md),
разделы 1–2, и [контракт управления](../../../../../../docs/planning/M39-autopiloting-controls.md#3-after-start-и-неполный-план).

## Разделение исходников (T005)

`autopilot.ts` и `decide.ts` разделены без изменения публичного API:
`decide-model.ts` — типы решателя (`StopReason`, `AutopilotState`, `AutopilotProjectStatus`,
`AutopilotTurn`, `AutopilotDecision` и др.), `decide-orchestration.ts` — решение
оркестрированного scope (`decideOrchestration`, `KIT_COMMAND`, `PAUSED_DETAIL`),
`autopilot-types.ts` — типы службы (`Autopilot`, `AutopilotOptions`, `ReviewDecider`,
`SessionAutopilot`, `ChooseRequest`, `WorkflowActionError`); `decide.ts` и `autopilot.ts`
реэкспортируют их.

## Настройки (`src/settings.ts`)

- `createSettingsStore({ configDir, platform? }) → SettingsStore`: файл
  `autopiloting.json` (`SETTINGS_FILE`) в `DataDirs.configDir` —
  `{ version: 1, revision, mode: off | after-start | full, review }`.
- `read()` → `{ settings, error }`. Нет файла — `DEFAULT_SETTINGS` (`off`, `review=false`,
  revision 0) без ошибки. Повреждённый JSON, другая версия, неизвестный режим, неверная
  ревизия или ревью — те же значения по умолчанию и текст ошибки: такой файл никогда не
  включает автопилот.
- `write({ expectedRevision, mode, review })`: записи идут по одной; ревизия сверяется с
  файлом, запись атомарная (`writeJsonAtomic`, 0600/0700), revision + 1, затем слушатели
  `onChange({ before, after })`. Отказы — `SettingsError`: `bad-request` (400, неизвестное
  значение или нет `expectedRevision`), `settings-stale` (409, `current` — сохранённые значения).
- Включение режима ничего не запускает: старые планы и их решения о ревью не мигрируют.

## Журнал запусков (`src/run-journal.ts`)

- `createRunJournal({ now?, platform? }) → RunJournal`: один версионированный JSON на
  запуск, `<проект>/.workflow-kit/local/autopiloting/<runId>.json` (`RUNS_DIR`; папку
  `.workflow-kit/local/` игнорирует управляемый блок `.gitignore` структуры приложения).
  Пишет только служба: атомарно, под замком проекта (`createKeyedMutex`); замок
  реентерабелен в одной цепочке вызовов (`AsyncLocalStorage`), другие ждут.
- `RunRecord`: `runId` (`run-<base64url>`, `newRunId`; другое имя — ошибка, путь не
  выходит из папки), `projectId`, `owner` (`key`, `client`, `sessionId`), `mode`
  (`after-start | full`), `review`, `revision` (растёт с каждой записью), `request`
  (`source`: `panel-start | user-command | plan-decision | panel-resume`, `quote`, `at`,
  `turnId`, `goal`), `proposal`, `scopeId`, `authority` (`grantRevision`,
  `deliveryTaskIds`, `accept`, `close`, `publication`, `acceptancePolicy`, `baseHead`,
  `revocation: { at, reason: settings-off | user-stop, resumable } | null`), `phase`
  (`preparing … publishing`, `completed`; `waiting`, `paused`, `blocked`, `stopped`),
  `pausedFrom`, `reason`, `nextAction`, `pendingAction`, `receipts` (`actionId`, `type`,
  `at`, `commit`, `detail`), `tickets` (погашенные тикеты хоста), `createdAt`, `updatedAt`;
  M41: `manualAcceptance`, `notice` — [autopiloting-completion.md](autopiloting-completion.md).
- `create`, `read`, `list` (по времени создания; битые файлы пропускаются), `active`
  (последний не `completed`/`stopped`, `FINAL_PHASES`), `update(root, runId, change)`
  (`change` возвращает новую запись или `null` — без записи), `advance` (M40 T006: запись
  автоматического шага, не снимает барьер пользователя — [run-words.md](run-words.md)),
  `locked(root, action)`.

## Kit запуска (`src/run-kit.ts`)

`createRunKit({ runner, tickets })`: `status` (`autopilot:status`), `supported`
(`autopilotSupport` из `#plan-view`), `scope` (`status`: id, `execution.ownerSession`,
`scope.automation`) и `host(root, step)` — host-only команда через
`KitRunner.runHost`: свежая ревизия из `autopilot:status`, тикет с привязкой (`operation`,
`realpath` корня, `runId`, `scopeId`, `ownerSession`, `expectedRevision`, `inputDigest`),
входной файл в `.harness/inputs/` только на время вызова; `REVISION_MISMATCH` (агент
закоммитил в это время) повторяется до трёх раз. Ответ — `HostStep` (`ok`, `code`,
`message`, `result`, `ticketId`, `redeemed`). `.harness/**` служба не читает.

## Запуски (`src/runs.ts`, `src/run-texts.ts`)

Разрешение запуска, журнал исходов, «Продолжить» без разрешения (M44) — [grant.md](grant.md).

`createRuns({ settings, journal, kit, tickets, userSource, projectPath, listProjects,
decideReview?, mutex?, log? }) → Runs`:

- `authorizePreparation(projectId, key, summary) → PreparationResult | null` — `wfk session plan`
  (под мьютексом `project:<id>`); решает служба, агент цитату не передаёт (M40 T007, раздел 2.3
  спецификации). `off`/`after-start` — `null` (обычная карточка вопроса). `full` со старым Kit —
  `policy: kit-update-required`, запуска нет, карточки нет. `full` с готовым Kit: источник —
  сообщение пользователя, доставленное в текущий ход (`userSource` = `agent-channel
  userSource`, правило контракта, раздел 3); его нет (продолжение автопилота, напоминание,
  ревью, служебное сообщение, сообщение в очереди, старый ход) или текст начинается с
  `Workflow Kit:` — `null`. Иначе `decideReview(settings.review)` (решение сессии, если уже
  есть, сохраняется) и запуск `user-command`, `phase=preparing`: `request.quote` — текст
  сообщения (до `RUN_QUOTE_MAX` = 500 символов), `request.turnId` — id сообщения, `at` — его
  время. Повтор той же сессии с тем же сообщением возвращает тот же `runId`; другой активный
  запуск проекта — 409 `run-active`. Ответ `PreparationResult`: `action: prepare`, `runId`,
  `mode: full`, `review`, `policy` (`full` или `kit-update-required`), `instruction`
  (`preparationText`, английский). Сообщение, зарегистрировавшее запуск, больше не источник
  решений (`Decisions` опция `sourceTaken`, [decisions.md](decisions.md)).
- `planDecision(projectId, key, choice, summary)` — ответ на карточке вопроса о плане: в
  `full` `review`/`plan` регистрируют запуск (`plan-decision`, ревью по ответу), `talk` — нет.
- `policy(projectId)` → `StartPolicy` (`off`, `automatic`, `manual-acceptance` с номерами
  ручных критериев, `legacy` без automation, `kit-update-required`) и точный текст
  `POLICY_TEXTS` для карточки до нажатия «Начать выполнение плана».
- `beginExecution(projectId, key)` — ручной старт (`authority.beforeStart` автопилота, под
  мьютексом маршрута): `off`, legacy и старый Kit — `null` (прежний старт без прав M39).
  Иначе берёт активный запуск этого scope или создаёт `after-start` (`panel-start`) и до
  первого рабочего сообщения пишет разрешение `autopilot:authorize` через тикет хоста:
  поставки из `automation.delivery`, `accept=false` при ручном критерии, `close=true`,
  publication и CI плана, `proposalDigest` из `autopilot:status`. Запись получает
  `authority`, `phase=executing`, квитанцию `authorize:<revision>` и тикет. Живое
  разрешение этого запуска — повтор без записи; запуск другого scope — 409 `run-active`;
  пауза из Settings — 409 `run-paused`; отказ Kit — `phase=blocked` и ошибка, сообщение не уходит.
- `resume(projectId, key)` — «Продолжить» запуска, остановленного Settings off
  (`authority.beforeResume`): новая ревизия разрешения того же `runId` в прежних границах
  (`panel-resume`); другой scope — 409 `scope-changed`.
- `settingsChanged({ before, after })` — переход в `off`: каждый активный запуск — `paused`,
  `reason=settings-off`, `pausedFrom`; живое разрешение отзывается
  (`autopilot:revoke --reason settings-off`, `resumable=true`). Повторное включение
  запуски не возобновляет.
- `load()` — при старте службы: краткие записи и погашенные тикеты (`tickets.restore`).
- `section()` → `{ projects: { <id>: RunBrief } }` (`runId`, `mode`, `phase`, `reason`,
  `source`, `scopeId`, `review`, `updatedAt`) — без цитат пользователя.

## Подготовка полного запуска (`src/run-prepare.ts`, T006)

M40: предложение без `automation`, запуск плана один раз и конец запуска —
[run-end.md](run-end.md).

`createPreparation({ journal, kit, projectPath, review, reviewOn, orchestration?, actions,
mutex?, log?, now? })` → `{ reconcile(projectId) }`. Один шаг под мьютексом `project:<id>`
(с кнопками панели), не больше одного действия; ошибки пишутся в журнал службы:

- действует только активный запуск `full` в фазах `preparing`, `reviewing`, `choosing`,
  `starting`; `after-start`, `paused`, `blocked`, `stopped`, `executing` и поздние события не
  выбирают и не запускают план. После каждого ожидания запуск перечитывается.
- Выбранный scope: только своего владельца (`execution.ownerSession`) и своего предложения,
  иначе `blocked` (`PREPARE_TEXTS.scopeChanged`); живое разрешение этого запуска — `executing`,
  иначе `start` (повтор после перезапуска запускает один раз).
- Нет предложения — `preparing`. Ревью сессии выключено (`reviewOn` — действующее решение
  `plan-review`) — выбор текущей версии с квитанцией ревью `skipped-by-setting` (не «ревью
  пройдено»). Включено: ревью нет, идёт или другого scope — `reviewing`; `failed`,
  `disagreed`, `cancelled` — `blocked` с причиной; `agreed`, но `reviewedProposal` не равен
  текущей версии (`scope:proposal --digest`: digest и generation) — `blocked`
  (`PREPARE_TEXTS.changed`): изменённая спецификация отменяет допуск.
- Выбор: рекомендованный способ `scope:proposal`; `orchestrated` без capability провайдера —
  `sequential` с записанной причиной, если план его допускает, иначе `blocked`
  (`noOption`). `actions.choose` (тот же `autopilot.choose`, что кнопка) с `expectedDigest`
  выбранной версии и `automatic` (`Автоматический выбор по поручению <runId>: …` в заметке
  выбора, без сообщения «ждите кнопку»); отказ Kit `PROPOSAL_CHANGED` (гонка изменения
  между чтением согласия и выбором) — `blocked` `changed`. Перед вызовом — `pendingAction`
  (`choose:<generation>:<digest>`), после — квитанция `choose`, `scopeId`, фаза `starting`.
- Старт: `actions.start(projectId, owner)` — тот же старт, что кнопка; разрешение пишет
  `authority.beforeStart` (`beginExecution`) до первого сообщения, примечание разрешения —
  `grantNote` по источнику поручения (`user-command`, `plan-decision`, `panel-start`).

`autopilot.choose` (`ChooseRequest`) принимает `expectedDigest` (`scope:choose
--expected-digest`) и `automatic: { runId, note }`; автоматический выбор дожидается
обновления `workflow`, чтобы следующий `start` видел выбранное выполнение.

## Выполнение начатого запуска (T007)

Полный текст раздела — [run-execution.md](run-execution.md).

## Завершение запуска (T008)

Приёмка, закрытие, CI финального SHA и проверенная публикация — в
[autopiloting-completion.md](autopiloting-completion.md) (`createRunCompletion`,
`COMPLETE_TEXTS`, снимок `RunRecord.completion`, ожидания `stage: 'service'`,
`HostStep.details`).

## Сводка для панели (T009, `src/run-brief.ts`)

`RunJournal.onChange(listener)` вызывается после каждой записи журнала, кто бы ни писал (ходы,
управление, ожидания, завершение). `createRuns` обновляет по нему сводку проекта: запись
старого законченного запуска не прячет новый. `brief(run)` (экспорт `runBrief`) → `RunBrief`:
- `runId`, `revision` (для `expectedRevision` кнопок), `owner`, `mode`, `phase`, `pausedFrom`;
- `reason`, `nextAction`, `source`, `scopeId`, `review`;
- `wait { reason, detail, sha, since }`;
- M41: `manualAcceptance { reason, since }` (только в `accepting`) и `notice`;
- `publication { upstream, finalSha, published, commits, already, detail }`. `commits` и
  `already` берутся из `RunCompletion.published`, его записывает завершение при публикации.
Цитат пользователя в сводке нет.
`GET /api/projects/:id/autopiloting/policy` → `StartPolicy` (`runs.policy`) — политика старта
до нажатия.

## Маршруты (`src/runs-routes.ts`)

`registerAutopilotingRoutes({ router, state, settings, runs })`:
`GET /api/settings/autopiloting` → настройки и `error`;
`POST /api/settings/autopiloting { expectedRevision, mode, review }` → сохранённые
настройки, 400 `bad-request`, 409 `settings-stale` с `current`; раздел `autopiloting` в
`/api/state` — `{ settings, error, projects }`. `registerRunControlRoutes({ router, control })`
(T007): `POST /api/projects/:id/autopiloting/pause|resume|stop { runId, expectedRevision }`.
`registerSessionRunRoutes({ router, locate, waits, control })` (только loopback):
`POST /api/sessions/progress { …сессия, progress }` и `POST /api/sessions/run { …сессия,
action: pause | stop }`. `runHttp` переводит `WorkflowActionError` в `HttpError` с
`nextAction` и `details`.

## Поведение на ОС

Одинаково на macOS, Linux и Windows x64/ARM64: пути через `path`, атомарная запись
`#data-store` (платформа передаётся параметром), запуск Kit через `KitRunner` без shell;
вызовов программ ОС нет.

## Тесты

`test/settings.test.ts` — настройки (умолчания, ревизия, гонка двух записей, битые файлы,
маршруты и раздел состояния без цитат) и журнал (запись, список, `active`, ревизии,
реентерабельный замок); `test/runs.test.ts` — с подставным Kit: нет источника, чужие
слова, `full` идемпотентен и `run-active`, `off`/`after-start`/старый Kit без запуска,
ответ на карточке, политики до старта; `test/runs-real.test.ts` — настоящий бандл:
legacy-план без прав, разрешение после ручного старта проверено бандлом, повтор без
коммита, Settings off отзывает, повторное включение не возобновляет, «Продолжить» —
новая ревизия; `test/start.test.ts` — разрешение до сообщения старта;
`test/prepare.test.ts` — подготовка с подставным Kit: без ревью (digest, `skipped-by-setting`,
повтор), ожидание ревью и согласие на той же версии, изменённая версия, неуспешные ревью,
отказ `PROPOSAL_CHANGED`, `after-start`/пауза/остановка/конкурирующие события, чужой
владелец и старт после перезапуска, оркестрация и последовательный fallback;
`test/prepare-real.test.ts` — настоящий бандл, канал и автопилот: поручение → предложение →
выбор с digest Kit → старт с разрешением без карточек; изменённая после согласия
спецификация отменяет допуск, и Kit сам отклоняет старый digest;
`test/decide-matrix.test.ts` — общая матрица решателя ядра и порта; `test/run-turns.test.ts` —
45 продолжений, три хода без прогресса, ожидания без попыток, барьер, вопрос «Как идёт?»,
Stop + resume — одно сообщение, текст ожидания CI; `test/run-control.test.ts` — пауза,
продолжение и остановка нужного запуска, команды агента, восстановление после перезапуска,
progress и политика CI, зелёный и красный CI, повторы 5/15/45 с, вопросы;
`test/runs-ci-real.test.ts` — настоящий бандл: поставка, подтверждённая разрешением
(`--autopilot-run`), ожидание CI с digest закреплённой политики, красный CI → настоящий
`task:defer-delivery`, stop → отзыв `user-stop`.
