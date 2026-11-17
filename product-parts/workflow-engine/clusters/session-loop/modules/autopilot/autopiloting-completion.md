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
   - `READY_FOR_ACCEPTANCE` и `accept` — фаза `accepting` и снимок `completion`
     `{ ci, publication, finalSha: null }`: политика CI из разрешения и адресат публикации
     (после закрытия разрешения в Kit уже нет);
   - без `accept` (ручной критерий) — только `nextAction` `COMPLETE_TEXTS.manual`; после
     настоящей ручной приёмки (`ACCEPTED`) и `close` — фаза `closing`.
2. `accepting`:
   - `ACCEPTED` по факту — квитанция `accept:<scope>` без команды Kit;
   - нет доказательств (`evidenceMissing`) — `blocked`;
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
   - другой отказ — `blocked` с кодом Kit.
3. `closing`:
   - scope `NONE` и в истории есть `chore: close scope … (autopilot run <id>)` — квитанция по
     факту, иначе запуск закончен: `finished` `closed-manually` (M40,
     [run-end.md](run-end.md)); раньше — `blocked` `closed-elsewhere`;
   - иначе `close --scope <id> --autopilot-run <id> --expected-revision N` через тикет.
     `DIRTY_TREE` — `blocked`: чужие файлы не удаляются и не коммитятся.
   - `finalSha` — коммит закрытия; фаза `publishing`.
4. `publishing` (scope `NONE` сохраняет запуск; открыт другой scope — `scope-changed`; нет
   адресата — `no-upstream`):
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
  - ручной критерий, отзыв, пауза, другой scope, нет upstream, нет доказательств, отказ Kit;
  - CI другого SHA;
  - повторы push и отказ учётных данных;
  - красный CI после закрытия.
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
