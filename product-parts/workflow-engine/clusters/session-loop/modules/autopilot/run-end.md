# Модуль autopilot: план без `automation`, один запуск плана, конец запуска (M40 T004A)

Часть [контракта модуля](module.md) и [автопилотирования M39](autopiloting.md).
Спецификация — [M40: конец запуска](../../../../../../docs/planning/M40-autopilot-run-end.md).

Служба знает требование и состояние сама и применяет их сама, не дожидаясь правильных
действий агента.

## Требование названо заранее (`src/run-texts.ts`)

- `AUTOMATION_REQUIRED` — фраза о блоке `automation` (вид каждого критерия приёмки, эффекты
  задач delivery, CI, публикация; поля — `scripts/workflow schema scope:propose`; без блока
  полный автопилот план не запускает). `preparationText('full', …)` содержит её; тексты
  `after-start`, `off` и `kit-update-required` не менялись.
- `automationReturnText(runId)` — сообщение автору предложения без блока.
- `RUN_STOP_NEXT` (`RunStopReason`: `automation-missing`, `authorization-missing`) — что
  делать пользователю после остановки запуска службой (по-русски, в `nextAction`).

## Проверка предложения (`src/run-proposal.ts`)

`createProposalGate({ journal, kit, projectPath, now?, log? })` → `{ check(projectId, key) }`.
Автопилот вызывает `check` в `decide` (опция `runs.proposal`) при открытом предложении, **до**
ревью и до удержания Stop карточкой выбора:

- действует только для активного запуска `full` этой сессии-владельца в фазах `preparing` и
  `reviewing`; читает `scope:proposal` (`kit.proposal`), поле `automation` (Kit 2.4.4);
- `automation: false` — первое такое предложение: счётчик `RunRecord.automationMissing` = 1,
  квитанция `automation-missing:<generation>` (тип `return`), ответ хука Stop — продолжение
  `Workflow Kit: autopilot. <automationReturnText>`: агент получает требование одним
  сообщением; ревью не спрашивается;
- второй конец хода владельца с предложением без блока — новое предложение или прежнее,
  которое агент не исправил (`AUTOMATION_ATTEMPTS` = 2): `stopRun(…, 'automation-missing')`
  — фаза `stopped`, `pausedFrom`, `reason`, `nextAction` из `RUN_STOP_NEXT`; `check` возвращает
  null, и ход идёт обычным путём: ревью и карточка выбора работают как без автопилота;
- блок есть, Kit не сообщает поле (до 2.4.4), нет запуска, другая сессия, запуск
  `after-start` или уже начатый — null.

`proposalLacksAutomation(kit, folder)` — тот же факт для шага подготовки: `run-prepare.ts`
для такого предложения не начинает ревью, не выбирает режим и не запускает план (фаза
`preparing`). `stopRun(journal, folder, run, reason, more?)` — остановка запуска службой:
финальная фаза, поэтому ручная работа с планом идёт без барьера запуска.

## План запускается один раз (`src/run-prepare.ts`)

Шаг запуска (`start`) выбранного плана:

- scope без блока `automation` (Kit до 2.4.4 не сообщил об этом до выбора или план выбран
  вручную) — `stopRun(…, 'automation-missing')`, сообщение о запуске не отправляется;
- есть квитанция `start:<scope id>`, а разрешения запуска нет — `stopRun(…,
  'authorization-missing')`: повторного сообщения нет;
- иначе действие «Начать выполнение плана» (`actions.start`) и квитанция `start:<scope id>`
  (тип `start`, `detail` — scope и ревизия плана). Отказ действия — `blocked` с кодом, как
  раньше; «Продолжить» повторяет попытку.

Сообщение о запуске плана агент получает один раз на scope: несколько сверок подряд
(конец каждого хода, конец ревью, старт службы) его не повторяют.

## Конец запуска вместе со scope (`src/run-end.ts`)

`settleRunEnd({ journal, kit, log? }, folder, run)` вызывается первым действием шага
подготовки (`run-prepare.ts`) и завершения (`run-complete.ts`, в том числе по таймеру):

- запуск, у которого был scope (`scopeId` задан), заканчивается, когда `autopilot:status`
  сообщает `scope: NONE` либо открыт scope с другим идентификатором: `finishRun` — фаза
  `finished`, `reason: closed-manually` (`RUN_END_REASON`), `pausedFrom` — прежняя фаза,
  `nextAction`, `pendingAction` и `wait` очищены;
- не трогает: финальные фазы; запуск без scope (подготовка — обычное состояние до выбора);
  запуск, который закрыл scope сам (квитанция `close:<scope>` или `completion.finalSha`) —
  ему предстоит публикация; фазу `closing` — её решает завершение по истории git: коммит
  закрытия этого запуска ведёт к публикации, иначе `finishRun` (раньше — `blocked`
  `closed-elsewhere`); молчащий Kit и Kit без поля `scope` — не факт;
- `finished` входит в `FINAL_PHASES`: `journal.active` такой запуск не возвращает, ничего
  автоматического он не делает и ничего не публикует — кнопка «Опубликовать на GitHub»
  остаётся пользователю;
- `runs.section()` не отдаёт запуск в фазе `finished`: карточки автопилота в состоянии
  панели нет (и после перезапуска службы).

Ручная приёмка без закрытия запуск не заканчивает: завершение видит `ACCEPTED` как факт и
закрывает scope само, повторной приёмки нет (M39).

## План без публикации (M48 T004)

План с `automation.publication: null` (результат локальный — так разрешает схема Kit) после
закрытия заканчивается `completed` с `completion.local: true` и строкой
`COMPLETE_TEXTS.local` «Результат остаётся локальным: публикация в плане не предусмотрена.» вместо
`blocked` `no-upstream` (B001, 20.11.2026). Сводка панели — `RunBrief.local`, строка агенту —
`completed (the result stays local: the plan has no publication)`. Подробно —
[autopiloting-completion.md](autopiloting-completion.md).

## Подключение (`cli`)

`autopiloting-wiring.ts` создаёт `createProposalGate` и отдаёт автопилоту
`turns = { …createRunTurns(…), proposal: gate.check }` (опция `runs`).

## Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Проверка предложения, квитанция запуска, конец запуска | общий Node-код, атомарная запись журнала запуска | то же | то же, x64 и ARM64 |
| Тексты агенту и причины остановки | одинаковы | одинаковы | одинаковы |

Программы ОС не вызываются, пути не сравниваются.

## Тесты

`test/run-end.test.ts` — подставной Kit, настоящие журнал и канал:

- текст подготовки `full` содержит требование, остальные тексты равны прежним дословно;
- `full`, предложение без `automation`: одно сообщение автору, ревью не спрошено, выбора и
  запуска нет при нескольких сверках; второе предложение — `stopped` `automation-missing`,
  ревью спрашивается как без запуска;
- шлюз не действует для предложения с блоком, старого Kit, чужой сессии, `after-start`,
  начатого и приостановленного запуска;
- план запускается один раз при четырёх сверках; без разрешения — один запуск, затем
  `stopped` `authorization-missing`; выбранный план без блока не запускается;
- scope принят и закрыт вручную (фазы `starting`, `executing`, `paused`, `blocked`,
  `waiting`) или заменён другим — `finished` `closed-manually`, публикации нет;
- запуск без scope, свой открытый scope, молчащий Kit и запуск, закрывший scope сам,
  не меняются;
- `runs.section()` без запуска `finished`, в том числе после перезапуска; запуск,
  остановленный службой, остаётся с причиной.

`test/prepare.test.ts`, `test/prepare-real.test.ts` (квитанция `start`) и
`test/complete.test.ts` (scope закрыт не запуском — `finished`) обновлены.
