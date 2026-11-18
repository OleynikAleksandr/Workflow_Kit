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
