# autopilot: выполнение начатого запуска (M39 T007)

Раздел перенесён без изменений из [autopiloting.md](autopiloting.md) (перед M48), чтобы контракт
оставался в пределах размера документа.

## Выполнение начатого запуска (T007)

Решатель службы (`decide.ts`, `decide-orchestration.ts`) перенесён из ядра Kit 2.3.3 без
изменений логики: живое разрешение (`liveGrant` — не отозвано, для текущего digest
предложения) подтверждает заранее свои поставки (`grantedDelivery`: `task:start <ID>
--autopilot-run <runId>`, в оркестрации — когда исполнители и интеграция свободны);
`READY_FOR_ACCEPTANCE` с `accept` и `ACCEPTED` с `close` — остановка `host-transition`
(приёмку и закрытие выполняет служба, T008). Тест `test/decide-matrix.test.ts` прогоняет одну
матрицу входов через решатель ядра (исходник `workflow-autopilot/src/autopilot-decision.ts`,
только импорты типов) и порт службы: решения совпадают.

`createRunTurns({ journal, projectPath, log? })` (`src/run-turns.ts`, опция `runs`
автопилота): `live(projectId, key)` — начатый запуск владельца (`executing`, `delivering`,
`verifying`, `accepting`, `closing`, `publishing`, `waiting`, `paused`, `blocked`) или
`null`; `turn(live, decision, status, userMessage)` — слово запуска о решении:

- в `decide` автопилота запуск владельца включает сессию и после перезапуска службы; барьер
  `paused`/`blocked` (`run-paused`, `run-blocked`) отпускает `Stop` без продолжения;
- предела 40 продолжений нет (`maxContinues` — бесконечность); три законченных хода подряд
  без прогресса (`NO_PROGRESS_LIMIT`: ни ревизия плана, ни HEAD, ни назначения) — первые два
  продолжаются текстом `TURN_TEXTS.noProgress`, третий — `blocked`, `agent-no-progress`;
  прогресс обнуляет `noProgress`; фаза — `delivering` у поставки, иначе `executing`;
- ожидание `wait` (CI, вопрос) — `waiting-for-ci`/`waiting-for-question`, попытка не
  тратится;
- сообщение пользователя («Как идёт?») не останавливает запуск: продолжение начинается с
  `TURN_TEXTS.userMessage` (ответь; просьба о паузе/остановке — `wfk session run
  pause|stop`); продолжение поставки с политикой CI — с `TURN_TEXTS.ciWait` (готовый JSON
  `wfk session progress` с `ciPolicyDigest` = `hostInputDigest(grant.ci)`).

Единственный отправитель: `autopilot.resume` не ставит сообщение, если сессия-владелец запуска
работает или у неё в очереди уже есть сообщение (продолжение после перезапуска). Совпавшие
`Stop`, перезапуск и resume дают один ход (F001). `runs.resume` идущего запуска (`executing`,
`delivering`, `verifying`, `accepting`, `closing`, `publishing`, `waiting`) возвращает его без
записи, поэтому `beforeResume` называет `runId`. Повторное нажатие старта во время отправки
отвечает `{ already: true, runId }` того же запуска; `confirm-delivery` для
поставки, подтверждённой разрешением, — факт без сообщения; `fixes` при начатой поставке
живого запуска сначала `task:defer-delivery`. `workflow/pause` и остановка ответа (M24)
вызывают `authority.onPause` — барьер запуска до команды Kit; `autopilot.halt(projectId)`
выключает автоматическое продолжение проекта (остановленный запуск).

`createRunControl({ journal, kit, projectPath, listProjects, actions, activity,
unreachable?, send, mutex?, log? })` (`src/run-control.ts`): `pause|resume|stop(projectId,
{ runId, expectedRevision })` — только этот запуск (404 `run-not-found`, 409 `run-stale` с
`current`); пауза пишет барьер, затем `pause:set`; resume — тот же `autopilot.resume`
(после Settings off — новая ревизия разрешения, после паузы или блокировки — с прежнего
этапа); stop — `phase=stopped`, `halt`, `autopilot:revoke --reason user-stop` через тикет
(`resumable=false`). `byOwner(projectId, key, pause|stop)` — команда агента (403
`not-owner`). `onPause` — барьер прежних кнопок. `recoverAll()` после старта: начатый запуск
с живым разрешением и свободным владельцем получает одно продолжение
(`CONTROL_TEXTS.recover`, `pendingAction` `recover:<revision>:<head>` — повтор в том же
состоянии Kit ничего не шлёт); работающей сессии — ничего; недоступный владелец
(`unreachable`: провайдер не подключён, сессия в архиве, будить нечем) — `blocked`
`owner-unreachable: …`, новая сессия не создаётся.

`createRunWaits({ journal, kit, ci, projectPath, listProjects, send, mutex?, now?, log? })`
(`src/run-waits.ts`):

- `progress(projectId, key, input)` — `wfk session progress`: `runId`, `actionId`
  (`[A-Za-z0-9:._-]`), `stage` (`pushed | waiting`), `targetSha` (40 hex), `ciPolicyDigest`,
  `waitReason`; только владелец (403), только живое разрешение с CI, digest равен
  `hostInputDigest(grant.ci)` — меньший `requiredChecks` или другая ветка дают 409
  `ci-policy-mismatch`; законченное действие — 409 `action-done`. Записывает `wait` и фазу
  `waiting`; ответ говорит, что это не результат CI.
- `pollAll()` (таймер службы): `ci.read(root, sha, grant.ci)` — политика только из
  разрешения. `pending` — ждать; `success` — квитанция `ci`, прежняя фаза и сообщение
  `WAIT_TEXTS.green`; `failed` при начатой поставке — `task:defer-delivery <ID> --reason …
  --outcome … --expected-revision N` (публичная команда Kit), квитанция `ci-failed`,
  `executing` и сообщение о раунде исправлений (`plan:extend`); иначе `blocked`;
  `unavailable` без `transient` (нет gh, нет входа, не GitHub) — `blocked`
  `ci-unavailable: …`; с `transient` — повторы через `RETRY_DELAYS_MS` (5/15/45 с,
  `retries[actionId]`), затем `blocked`.
- `questionStarted(projectId, key)` / `questionEnded(projectId, key, answered | expired)` —
  вопрос владельца (хук вопроса M33): `waiting` с `wait.reason=question`; ответ возвращает
  прежнюю фазу (тот же ход), истёкший хук — `blocked`, `question-expired`, «Нужны данные:
  ожидание ответа у провайдера завершилось». Поздний ответ после stop запуск не продолжает.
