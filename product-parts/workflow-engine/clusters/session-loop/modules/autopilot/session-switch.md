# autopilot: переключение автопилота сессии на любом этапе (M48 T002)

Часть контракта [module.md](module.md). Спецификация —
[M48](../../../../../../docs/planning/M48-session-autopilot.md), раздел 3.2; настройки сессии —
[session-settings.md](session-settings.md).

## Этап задания (`src/session-switch.ts`)

`createSessionSwitch({ journal, kit, runs, sessions, gate, projectPath, question, decideReview,
send, wake, reconcile, mutex?, log?, now? }) → SessionSwitch`. `stage(projectId, key)` →
`SessionStage`, по порядку проверки:

| Этап | Что видит служба |
| --- | --- |
| `other-run` | в проекте активный запуск другой сессии |
| `paused` | запуск этой сессии на паузе или остановлен (`paused`, `blocked`) |
| `run` | запуск этой сессии идёт (до старта плана или после) |
| `executing` | план Kit начат или выбран (`autopilot:status` `scope` — `ACTIVE`/`BLOCKED`), владелец — эта сессия или ещё не назначен |
| `other-plan` | план Kit ведёт другая сессия |
| `proposed` | открыто предложение плана (`scope:proposal`) |
| `question` | открыт вопрос о плане этой сессии (plan-review) |
| `writing` | пользователь ответил на вопрос «спецификация и план», предложения ещё нет (пометка `preparing` записи сессии) |
| `idle` | ничего из этого: агент думает над заданием или разговаривает |

Пометка `preparing` ставится ответом `review`/`plan` на вопрос агента вне полного режима
(`answered`) и снимается, когда Kit показывает предложение или план (`settle` на каждый `Stop`
проекта и минутный `tick`, а также при чтении этапа).

## Что делает переключение (`changed`, слушатель записи сессии)

Смена только ревью — не переключение режима (T003). `off` — пауза запуска сессии
(`runs.sessionChanged`, [session-settings.md](session-settings.md)); строка карточки — «на паузе»
или «выключен». Включение (`full` или `after-start`) под мьютексом `project:<id>`:

| Этап | `full` | `after-start` |
| --- | --- | --- |
| `other-run`, `other-plan` | ничего, строка о другой сессии | то же |
| `paused` | пауза карточки (`settings-off`) — `runs.resume` (новая ревизия разрешения того же `runId`); иная пауза — «нажмите «Продолжить»» | то же |
| `run` до старта плана | `mode` запуска становится `full`, после замка — шаг подготовки (`reconcile`) | `mode` — `after-start`: подготовка его больше не ведёт, способ и старт — кнопками |
| `run` после старта | ничего («уже идёт») | то же |
| `executing` с `automation` | запуск `session-card` (`phase=starting`, `scopeId`) и разрешение Kit через `runs.beginExecution` (источник гранта `session-card`); без разрешения запуск останавливается `authorization-missing` | то же с `mode=after-start` |
| `executing` без `automation`, legacy, старый Kit | ничего: «этот план доводите вы» | то же |
| `proposed` | запуск `session-card` (`preparing`), решение ревью сессии (`decideReview` закрывает карточку вопроса); без блока `automation` — возврат агенту (`gate.check`, M40); с блоком: ревью — разбудить владельца (ревью начнётся на его `Stop`), без ревью — шаг подготовки | ничего: «включится после «Начать выполнение плана»» |
| `question` | Kit проекта не умеет автопилот (`supported`) — ничего, строка «обновите Kit» (так же для `writing` и `proposed`); иначе запуск `session-card`, вопрос закрыт (`decideReview`), агенту — `preparationText(…, 'session-card')`, сессия разбужена | то же, что `proposed` |
| `writing` | запуск `session-card`, агенту — та же инструкция, пометка снята | то же |
| `idle` | ничего сразу: ближайший `wfk session plan` получает `prepare` по режиму сессии | то же |

Запуск `session-card`: `request.quote` — «Включён полный автопилот сессии» (или «…после ручного
запуска»), `turnId: null`, владелец — сессия карточки. `effect(projectId, key)` — строка последнего
переключения (`SWITCH_TEXTS`, русский текст для карточки). Ошибка шага — её текст в `effect` и
строка журнала службы.

## Ответ на вопрос о плане (`answered`)

`answered(projectId, key, choice, summary)` вызывает служба на ответ вопроса агента (слушатель
`toggles.onAnswer` ждёт его, поэтому инструкция стоит в очереди раньше сообщения ответа и
пробуждения): полный режим сессии — `runs.planDecision` регистрирует запуск (`plan-decision`) и
агент получает `preparationText('full', review, runId, 'plan-decision')` с требованием блока
`automation`; иначе `review`/`plan` ставят пометку `preparing`, `talk` — ничего.

## Связанные изменения

- `RunSource` — плюс `session-card`; `grantNote` — «the user switched the autopilot of the
  session to «…» on its card»; `PRE_START` (`run-journal.ts`) — фазы до старта плана.
- `preparationText(policy, review, runId, by = 'user-command')`: `by` — кто записал запуск
  (сообщение хода, ответ на карточке вопроса, карточка сессии); для двух последних — «Go on without
  the plan question … (finish the ones you are writing, if any)». Ревью — «the session setting».
- `authorizePreparation`: полный запуск этой сессии до старта с источником `session-card` или
  `plan-decision` возвращается как `prepare` без сообщения пользователя в ходе.
- Маршруты `GET/POST …/sessions/:sid/autopiloting` отвечают `{ settings, stage, effect }`.

## Поведение на ОС

Общий код на macOS, Linux и Windows; ветки ОС и программ ОС нет.

## Тесты

`test/m48-session-switch.test.ts` (Kit по сценарию, настоящие журнал и записи сессий): каждый
этап таблицы, режим запуска до старта, пауза и продолжение, ответ на вопрос и пометка.
`test/m48-session-switch-real.test.ts` (настоящий бандл): начатый план с блоком `automation`
берётся с разрешением источника `session-card`, `off` отзывает его, включение возобновляет тот же
запуск; план без блока остаётся ручным; карточка другой сессии план не трогает.
