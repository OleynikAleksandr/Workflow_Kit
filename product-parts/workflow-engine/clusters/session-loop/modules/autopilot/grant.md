# autopilot: разрешение запуска (M44)

Спецификация: [M44](../../../../../../docs/planning/M44-autopilot-grant-and-agent-state.md),
раздел 3.1. Общее устройство запусков — [autopiloting.md](autopiloting.md).

## Ручной критерий под полным автопилотом

`grant()` (`src/runs.ts`) просит у Kit `autopilot:authorize` с `accept: !manual`,
`acceptancePolicy: manual|automatic` и `mode` запуска. Kit до 2.4.6 отказывал полному
автопилоту с ручным критерием (`AUTOPILOT_MANUAL_REQUIRED`, правило M39), хотя служба по M41
ждёт приёмки пользователя: так M43 остался без разрешения, и поставки, приёмка и закрытие шли
кнопками. С Kit 2.4.6 разрешение записывается: запуск сам выполняет задачи, поставки и CI, на
`READY_FOR_ACCEPTANCE` ждёт «Принять план» (`nextAction` = `COMPLETE_TEXTS.manual`, фаза
`delivering`), после приёмки сам закрывает и публикует.

## Исходы старта и разрешения

Каждый исход пишется в журнал службы:

| Где | Строка |
| --- | --- |
| `grant()`, отказ Kit | `autopiloting: <run> grant refused for scope <id>: <код>: <текст>` |
| `grant()`, запись | `autopiloting: <run> grant written for scope <id>: revision N (<source>)` |
| `start()`, пропуск | `autopiloting: <run> start skipped: <причина>` (следующий шаг подготовки повторяет) |
| `start()`, старт | `autopiloting: <run> started scope <id> (plan revision N)` |
| `block()` подготовки | `autopiloting: <run> blocked: <причина>` |

Повторная остановка уже остановленного запуска (`grant()` записал `blocked`, затем `start()`
поймал ошибку) сохраняет `pausedFrom` — фазу, из которой запуск пришёл, и причину последнего
отказа; раньше `pausedFrom` становился `blocked`, а «Продолжить» оставлял запуск в `blocked`
без причины.

## Повтор старта и разрешения (`src/run-prepare.ts`)

- Отказ `actions.start` (обычно отказ разрешения внутри него) — `retry(…, 'start')`: фаза
  `starting`, `pausedFrom: null`, причина `<код>: <текст> (attempt N/3)`, счётчик
  `retries.start`. Следующий шаг подготовки (конец хода, ревью, старт службы, минутный `tick`
  службы — M44) стартует снова.
- Квитанция `start:<scope>` есть, а разрешения запуска в Kit нет — при ссылке `authorize`
  (служба: `runs.beginExecution`) разрешение записывается снова без повторного сообщения
  старта; счётчик `retries.grant`. Без ссылки — остановка `authorization-missing` (M40).
- `START_ATTEMPTS` = 3: третий отказ — `blocked`, причина `authorization-missing: <код>: <текст>`,
  `nextAction` = `PREPARE_TEXTS.retry`. Успешный старт или разрешение очищает `retries` и причину.

## «Продолжить» запуска без разрешения

`resume()`: запуск в `blocked`/`paused`, у которого план выбран (`scopeId`), а `authority`
нет, снова просит разрешение (`grant()` с исходным `source`, не `panel-resume`: Kit принимает
`panel-resume` только для запуска с разрешением). Отказ — снова `blocked` с новой причиной и
прежним `pausedFrom`. Запуск с разрешением и паузой Settings — как прежде (`panel-resume`).

## Тесты

- `test/runs-grant.test.ts` — отказ с кодом Kit и строкой журнала, вход полного автопилота с
  ручным критерием (`full`, `accept: false`, `manual`), «Продолжить» записывает разрешение,
  второй отказ сохраняет фазу.
- `test/prepare-retry.test.ts` — повтор отказанного старта, `blocked` после трёх отказов,
  повторная запись разрешения запущенного плана, остановка без ссылки `authorize`.
- `test/m44-manual-full-real.test.ts` — настоящий бандл 2.4.6: квитанции `review`, `choose`,
  `authorize`, `start`, поставка по разрешению, ожидание «Принять план», закрытие и публикация
  запуском.

## Знание агента: уведомления и тексты (M44 T003)

- `createAgentNotices({ journal, settings, kit, listProjects, sessions, enqueue, log? })`
  (`src/agent-notices.ts`, служба — `cli/autopiloting-wiring.ts`) ставит строки в очередь
  сессии без пробуждения; их доставляет ближайший хук `UserPromptSubmit` или `Stop`.
- Смена режима или ревью в Settings: `Workflow Kit: settings changed: autopilot mode=<…>,
  review=<on|off>.` — владельцу активного запуска и сессии-владельцу открытого плана Kit
  (`scope.ownerSession` среди сессий канала проекта). Без смены — ничего.
- Смена состояния запуска (`runNoticeState`): `Workflow Kit: autopilot run <id>: <состояние>.`
  владельцу — `authorized: the Kit grant is live` (есть `authority` без отзыва), `authorized;
  waiting for the user's acceptance`, `blocked (<причина>)`, `paused`, `stopped (<причина>)`,
  `completed (published)`, `finished (the plan was closed)`. Подготовка без разрешения и смена
  фазы при живом разрешении — не новость. Причина — только ASCII (`asciiNoticeReason`: русская
  подсказка обрезается, пустое — «see the Workflow Kit panel»).
- Одна и та же строка подряд одной сессии в очередь второй раз не ставится.
- Тексты хода (M44 3.4, `autopilot.ts`, `run-turns.ts`): «Workflow Kit: autopilot. …» и
  подсказки «pause/stop the autopilot», ожидания CI — только при живом разрешении Kit этого
  запуска (`liveGrant(status).runId` = запуск). Без него — `Workflow Kit: <текст Kit>` с
  `TURN_TEXTS.noGrant` (решения пользователя остаются ручными, следовать пакету Kit) и
  `TURN_TEXTS.userMessageManual`. Продолжения без запуска (M2) не меняются.
- Тесты: `test/agent-notices.test.ts`, `test/run-turns.test.ts` (M44).

## «Повторить» в панели (M44 T004)

- `runs.retryGrant(projectId, { runId, expectedRevision })` под мьютексом `project:<id>`,
  маршрут `POST /api/projects/:id/autopiloting/retry`: другой или исчезнувший запуск — 404
  `run-not-found`, другая ревизия — 409 `run-stale`, запуск с живым `authority` — сам запуск с
  `already: true` (Kit не спрашивается), план не выбран или изменился — 409 `scope-changed`;
  иначе `grant()` с исходным `source` (отказ — `blocked` с причиной Kit и ошибка с кодом Kit).
- Сводка панели (`RunBrief.authorized`, `src/run-brief.ts`): есть `authority` без отзыва —
  разрешение Kit записано для этого запуска (служба зеркалит его при записи и отзыве).
- Тест — `test/runs-grant.test.ts` (M44 T004).
