# autopilot: завершение запуска (M39 T008)

Часть контракта [autopiloting.md](autopiloting.md). Спецификация —
[M39-autopiloting-completion.md](../../../../../../docs/planning/M39-autopiloting-completion.md).

## Сервис завершения (`src/run-complete.ts`)

`createRunCompletion({ journal, kit, publisher, git, projectPath, listProjects, mutex?, now?,
log? }) → RunCompleter`:

- `advance(projectId)` — под мьютексом `project:<id>`, который берёт и кнопка «Опубликовать»,
  до шести шагов подряд; каждый шаг заново читает факты: `autopilot:status`, историю git и
  удалённый репозиторий. `advanceAll()` — по всем проектам.
- Действует только активный запуск с разрешением без отзыва в фазах `executing`,
  `delivering`, `accepting`, `closing`, `publishing`. Пауза, блокировка, остановка и
  ожидание ничего не начинают; остановка (`run-control`) держит тот же мьютекс.
- `publisher` — структурный тип `PublisherLike` (git-publish `createPublisher`, один на кнопку
  и запуски); `git` — `GitRead` (git-publish `runGit`). Модуль не импортирует `#git-publish`.

Шаги:

1. `executing`/`delivering`, scope `ACTIVE`, разрешение этого запуска:
   - M41: проверки, которых не запишет ни одна незавершённая задача (`checksUnreachable`
     автоматических критериев, Kit 2.4.5), — один раз `notice` записи запуска
     (`COMPLETE_TEXTS.notice`: «Автоприёмка не сможет доказать: <id> (критерий N) — в конце
     понадобится ваша приёмка.») и строка журнала службы `autopiloting: <run> notice: …`;
     запуск продолжает работу; Kit без поля — без предупреждения;
   - `READY_FOR_ACCEPTANCE` и `accept` — фаза `accepting` и снимок `completion`
     `{ ci, publication, finalSha: null }`: политика CI из разрешения и адресат публикации
     (после закрытия разрешения в Kit уже нет);
   - без `accept` (ручной критерий) — только `nextAction` `COMPLETE_TEXTS.manual`; после
     настоящей ручной приёмки (`ACCEPTED`) и `close` — фаза `closing`.
2. `accepting`:
   - `ACCEPTED` по факту — квитанция `accept:<scope>` без команды Kit, `manualAcceptance`
     снимается (вместе с его `nextAction`);
   - M41: ждёт приёмки пользователя (`manualAcceptance.head` равен HEAD) — Kit повторно не
     вызывается; новый HEAD (агент закоммитил доказательства) — новая автоматическая попытка;
   - нет доказательств (`evidenceMissing`) — ожидание приёмки пользователя (ниже);
   - идёт транзакция или интеграция — ждать;
   - есть политика CI, но нет квитанции `ci` — `stage(HEAD)`: кандидат уходит на CI-ветку
     до приёмки.
   Иначе `accept --autopilot-run <id> --input <evidence> --expected-revision N` через
   host-тикет. Evidence:
   - `head`;
   - `criteria`: каждый автоматический критерий со своими `evidence` и проверками — для
     каждого id все коммиты Kit (трейлер `Workflow-Transaction`, последние 200, новые первыми);
     Kit сам выбирает коммит с пройденной записью;
   - `ci {sha, checks}` — последняя зелёная квитанция и `requiredChecks` разрешения.
   Ответы Kit:
   - успех — квитанция `accept` с коммитом Kit, фаза `closing`;
   - `AUTOPILOT_EVIDENCE_REQUIRED` с `details.absent` (CI другого SHA, после которого
     менялись не только документы) — `stage(HEAD)`, служба сама проверяет HEAD;
   - другой `AUTOPILOT_EVIDENCE_REQUIRED` и `AUTOPILOT_MANUAL_REQUIRED` — ожидание приёмки
     пользователя;
   - другой отказ (ревизия, транзакция, разрешение) — `blocked` с кодом Kit и «Продолжить».
   Ожидание приёмки пользователя (M41, `awaitUser`): фаза остаётся `accepting`,
   `manualAcceptance { head, reason, since }`, `nextAction` `COMPLETE_TEXTS.awaitUser(reason)`
   («Автоприёмка не смогла доказать результат: <причина>. Проверьте результат и нажмите
   «Принять план» — запуск сам закроет план и опубликует.»), журнал службы
   `autopiloting: <run> awaits the user's acceptance: <причина>`. Приёмка пользователя
   (кнопка или сообщение, M40) даёт `ACCEPTED`: запуск закрывает план и публикует проверенный
   SHA; закрытие руками заканчивает запуск (`finished`, [run-end.md](run-end.md)).
3. `closing`:
   - scope `NONE` и в истории есть `chore: close scope … (autopilot run <id>)` — квитанция по
     факту, иначе запуск закончен: `finished` `closed-manually` (M40,
     [run-end.md](run-end.md)); раньше — `blocked` `closed-elsewhere`;
   - иначе `close --scope <id> --autopilot-run <id> --expected-revision N` через тикет.
     `DIRTY_TREE` — `blocked`: чужие файлы не удаляются и не коммитятся.
   - `finalSha` — коммит закрытия; фаза `publishing`.
4. `publishing` (scope `NONE` сохраняет запуск; открыт другой scope — `scope-changed`; M48 T004:
   в плане нет публикации (`automation.publication: null`) — сразу `completed` без push и без CI
   финального SHA, `completion.local: true`, `published: null`, квитанция `local:<sha>`,
   `COMPLETE_TEXTS.local`; запуск старой версии, вставший `blocked` `no-upstream` для такого плана,
   завершается так же следующим шагом; `no-upstream` остаётся только сбоем публикатора для плана с
   публикацией):
   - при `exactSha` и без зелёной квитанции `ci` для `finalSha` — `stage(finalSha)`;
   - затем `publisher.publish(folder, false, { sha: finalSha, branch, upstream })`:
     квитанция `publish` (`already` — SHA уже был на удалённой ветке и проверен после
     `fetch`), фаза `completed`.
   Сбои публикации:
   - `push-failed` — повторы 5/15/45 с (`RETRY_DELAYS_MS`), затем `blocked`;
   - `push-auth`, `remote-ahead`, `worktree-dirty`, `publication-target-changed`,
     `head-changed`, `no-upstream` — сразу `blocked` с отдельным `nextAction`.

`stage(sha)`:

1. Один раз вызывает `publisher.stageCi` на `remote`/`branch` из снимка и записывает
   квитанцию `ci-stage:<sha>`.
2. Ставит ожидание `wait { reason: ci, stage: 'service', sha, actionId: ci:<sha> }`: фаза
   `waiting`, `pausedFrom` — `accepting` или `publishing`.
3. Ожидание проверяет `createRunWaits.pollAll` с политикой из `completion.ci`, без
   разрешения Kit:
   - зелёный CI — квитанция `ci`, сообщений агенту нет;
   - красный CI — квитанция `ci-failed`, `blocked`; после закрытия — `nextAction`
     `COMPLETE_TEXTS.afterClose` (исправление — отдельный scope).

Доказательство CI хранится только в журнале запуска вне git: коммит доказательства не
создаёт новый непроверенный SHA. `main` получает именно проверенный `finalSha`. Перезапуск
службы после приёмки, закрытия или push повторяет шаг по фактам, без второго коммита и
без второго push.

## Подключение (`cli`)

- `wireAutopiloting` создаёт сервис.
- `tick`, таймер `AUTOPILOT_TICK_MS`: `waits.pollAll()`, затем `completion.advanceAll()`.
- `reconcile`, после `Stop` и окончания ревью: подготовка, затем `completion.advance`.
- `recoverAll`, при старте: восстановление ходов, затем `advanceAll`.
- `app.ts` создаёт один `createPublisher({ git: runGit })` и передаёт его маршруту
  публикации (с `mutex`) и запускам.

## Поведение на ОС

Одинаково на macOS, Linux и Windows x64/ARM64. `git` идёт через `execFile` без shell
(`runGit`, `GIT_TERMINAL_PROMPT=0`, `windowsHide`), Kit — через `KitRunner.run`/`runHost`
(Node IPC). Новых программ ОС нет.

## Тесты

- `test/complete.test.ts`:
  - снимок политики и CI кандидата до приёмки;
  - приёмка и закрытие тикетами;
  - восстановление после приёмки и закрытия по фактам;
  - ручной критерий, отзыв, пауза, другой scope, нет upstream; нет доказательств и отказ Kit
    о доказательствах ждут пользователя (M41), другой отказ Kit — `blocked`;
  - CI другого SHA;
  - повторы push и отказ учётных данных;
  - красный CI после закрытия.
- `test/manual-acceptance.test.ts` (M41): нет доказательств — ожидание без повторного вызова
  Kit при том же HEAD и причина в `runBrief`; отказ Kit о доказательствах — повтор только при
  новом HEAD, затем приёмка, закрытие и публикация; приёмка пользователем — закрытие, CI
  именно SHA закрытия и публикация этого SHA; `notice` один раз, без остановки, Kit без поля —
  без него.
- `test/complete-real.test.ts` — раздел 1.4 на настоящем бандле, временном проекте и bare
  upstream:
  - кандидат на `ci/auto`;
  - приёмка;
  - чужой файл блокирует закрытие и остаётся;
  - закрытие;
  - финальный SHA на `ci/auto`;
  - push, уже дошедший до remote, не повторяется;
  - `main` равен проверенному SHA;
  - история называет запуск, а не проверку пользователя.
