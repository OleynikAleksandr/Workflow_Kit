# autopilot: нажатия пользователя ждут занятый Kit (M48 T004)

Часть контракта [module.md](module.md). Спецификация —
[M48](../../../../../../docs/planning/M48-session-autopilot.md), раздел 3.4.

## Зачем

Пока агент выполняет команду Kit (например, `commit --task` с проверками), Kit держит свою
блокировку и отказывает другим командам кодом `LOCKED` («Another workflow operation is
running.»). Раньше нажатие пользователя в это время («Подтвердить выпуск», 19.11.2026) получало
отказ и пропадало.

## Ожидание (`src/kit-waits.ts`)

- `createKitWaits({ now?, schedule?, retryMs?, limitMs?, log? }) → KitWaits`; один список на службу
  (`cli/autopiloting-wiring.ts`, раздел состояния `kitWaits`).
- `run(projectId, action, signature, act)`: выполняет нажатие; отказ `LOCKED` (`kitLocked`: код
  `LOCKED` или текст блокировки) — ожидание и ответ 202 `{ pending: true, wait }`; другой отказ —
  как раньше. Пока ожидание того же решения (`signature`) идёт, новое нажатие не выполняется и
  получает то же 202.
- Повтор каждые `KIT_WAIT_RETRY_MS` (2 с) тем же действием маршрута (с тем же мьютексом проекта и
  проверкой того, что показывала карточка); успех — `done`, другой ответ Kit — `failed` с его текстом,
  `KIT_WAIT_LIMIT_MS` (15 мин) — `failed` с `KIT_WAIT_TEXTS.expired`; после `failed` следующее
  нажатие выполняется заново. Нажатие применяется один раз.
- `pressSignature(action, body)` — действие и тело запроса без `requestId` (у каждого нажатия свой).
- `section()` → `{ projects: { <id>: KitWait[] } }`: `{ id, projectId, action, since, attempts,
  state: waiting | done | failed, error, text, finishedAt }`; законченные видны 10 минут.

## Какие кнопки

- `registerAutopilotRoutes({ …, waits? })`: `choose`, `start`, `accept`, `close`,
  `confirm-delivery` (`action` — имя кнопки).
- `registerDecisionRoutes({ …, waits? })`: кнопка карточки решения
  `POST /api/projects/:id/workflow/decision` (`decision:<kind>`); команда агента `wfk decision`
  не ждёт (её выполняет агент).
- `registerRunControlRoutes({ …, waits? })`: «Пауза», «Продолжить», «Остановить» запуска
  (`run:<action>`).

## Поведение на ОС

Общий таймер службы на macOS, Linux и Windows; ветки ОС нет.

## Тесты

`test/m48-kit-waits.test.ts`: распознавание `LOCKED` и подпись, ожидание с повтором и одно
применение, присоединение второго нажатия, другой отказ и истечение, кнопки карточки решения,
запуска и «Подтвердить выпуск» плана через маршруты.
