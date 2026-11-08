# Модуль: cross-review

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#cross-review`.

## Назначение

Перекрёстное ревью плана (спецификация M4): при включённом «Ревью плана» и открытом
предложении плана служба запускает сессию другого провайдера ревьюером (у Claude — ChatGPT, у
ChatGPT — Claude) и пересылает законченные ходы сторон через `agent-channel`, пока ревьюер не
одобрит, а основной агент не согласится, или не кончатся 5 кругов.

## Публичный интерфейс (`src/index.ts`)

- `createCrossReview(deps) → CrossReview`. Зависимости `CrossReviewDeps`: `listProjects`,
  `createSession(projectId, provider, { title, firstMessage })` (как «Новая сессия»),
  `resolveReviewer(projectId, provider, ref)` (ключ канала созданной сессии: у Claude id хука
  известен не сразу), `enqueue(key, text, projectId)` (очередь и пробуждение), `wake(key)`
  (переспросить удержанный `Stop`), `toggle(projectId, key)`, `proposal(projectId)` (открытое
  предложение `{ generation, scopeId }` или `null`), `sessionTitle`, `now`, `log`.
- `CrossReview`:
  - `load()` — ревью проектов из `.workflow-kit/local/reviews/<client>.<id>.json`.
  - `onStop(event)` — слушатель канала: ход ревьюера пересылается основной, если ревью
    `starting` (первый ход) или `reviewing` и ход начат доставкой ревью (`origin: delivery`,
    источник `review`); ход основной — ревьюеру, если ревью `answering` и ход начат доставкой
    ревью. Напоминания и ходы пользователя не пересылаются.
  - `decide(context, canStart?)` — решение `Stop`: ревьюеру — держать `waiting-for-main`
    (активно) или отпустить (закончено); основной с активным ревью — держать
    `waiting-for-review`; предложение закрыто — `cancelled`; нет движения дольше
    `REVIEW_STALL_MS` (60 мин) — `failed`. Удержания — с напоминанием `REMINDER` по таймауту.
    `canStart` (сессия иначе ждала бы выбора режима): переключатель включён, ревью этого
    scope ещё не было, другого активного ревью в проекте нет → старт и `waiting-for-review`.
    Неизвестная сессия провайдера ревьюера при `starting` узнаётся через `resolveReviewer`.
    Остальное — `null` (решает автопилот).
  - `toggled(projectId, key, on)` — включение будит удержанный `Stop` (старт), выключение
    отменяет; `cancel(projectId, key, reason)`; `isReviewer(key)`; `get(projectId, key)` —
    ревью сессии как основной или ревьюера; `section()` — `{ projects: { [id]:
    ReviewSummary[] } }` (тексты журнала до 400 знаков, `statusLabel`, `active`).
- Состояния: `starting` → `answering` ↔ `reviewing` → `agreed` | `disagreed` | `failed` |
  `cancelled` (`FINISHED`). Круг — замечания ревьюера (`round` +1) и ответ основной. Согласие —
  последний ответ ревьюера с `REVIEW: APPROVED` и ответ основной с `REVIEW: AGREED`; после
  `MAX_ROUNDS` (5) ответов без согласия — `disagreed`. По окончании ревьюер получает
  заключительное сообщение, основная будится (`wake`).
- Тексты (`texts.ts`): `reviewerBrief` (роль, правила «только читай», команды контекста
  `recover`, `scope:proposal`, `context`, формат ответа), `toMain`, `toReviewer` (пересылаемый
  текст до 12000 знаков), `REMINDER`, `STATUS_LABELS`, `PROVIDER_NAMES`.
- `registerCrossReviewRoutes({ router, state, review })`: раздел `reviews` в `/api/state`,
  `GET /api/projects/:id/reviews/:key` (полное ревью, 404 `review-not-found`),
  `POST /api/projects/:id/reviews/:key/cancel` («Прервать ревью», 409 `review-not-active`).

## Инварианты

- Работа одного ревью выполняется по очереди (`queue`), решение `Stop` ждёт её.
- Ревьюер файлы не меняет — это правило его первого сообщения; служба ничего не пишет в
  репозиторий, кроме файла ревью в `.workflow-kit/local`.
- Второе ревью того же scope не запускается.

## Зависимости

`#agent-channel` (типы), `#data-store`, `#http-server`.
