# Модуль: plan-review

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#plan-review`.

## Назначение

Переключатель «Ревью плана» у каждой сессии (спецификация вехи 2,
раздел 10). В вехе 2 — только переключатель: значение хранится и
показывается. С вехи 4 переключатель запускает перекрёстное ревью
(`#cross-review`): агенту он ничего не передаёт, служба читает его, когда
приходит `Stop` хода с открытым предложением плана (M4, раздел 10).
С раунда R2 вехи 4 решение о ревью принимается ответом на вопрос о плане
(M4, раздел 12): агент задаёт его командой `wfk session plan`, служба — при
предложении плана без решения; ответ записывает то же значение `review`.

## Публичный интерфейс (`src/index.ts`)

- `createReviewToggles({ listProjects, pathChosen, locked?, onChange? }) →
  ReviewToggles` (`locked(projectId, key)` — причина, по которой значение
  больше не меняется: ревью идёт или этот план уже прошёл ревью;
  `onChange` — после записи, служба запускает или отменяет ревью):
  - `load()` — читает сохранённые значения всех проектов;
  - `get(projectId, key)` — значение (по умолчанию `false`);
  - `set(projectId, key, on)` — пишет
    `<проект>/.workflow-kit/local/sessions/<client>.<id сессии>.json`
    (`{ "review": true|false }`, другие поля файла сохраняются, права 0600)
    и возвращает `ProjectReview`; после выбора пути (`pathChosen`) —
    `ReviewToggleError` `review-closed` (409); заблокировано (`locked`) —
    `review-locked` (409); неверный ключ сессии —
    `bad-session` (400); нет проекта — `project-not-found` (404);
  - `decided(projectId, key)` — у сессии есть решение (значение записано);
  - `ask(projectId, key, kind, summary)` — открывает (или заменяет) вопрос
    `{ kind: 'agent' | 'proposal', summary (до 500 знаков), askedAt }` в поле
    `question` файла сессии; `question(projectId, key)`, `asking(projectId)`;
  - `answer(projectId, key, choice)` — `review | plan | talk`: закрывает
    вопрос; `review`/`plan` пишут `review: true|false` (если путь ещё не
    выбран), `talk` — ничего; `talk` на вопрос `proposal` и неизвестный
    выбор — `bad-choice` (400), нет вопроса — `no-question` (409); затем
    слушатели `onAnswer(listener)` (служба шлёт агенту `ANSWER_MESSAGES` и
    будит сессию);
  - `section()` — `{ projects: { <id>: { visible, sessions, questions } } }`:
    `visible` — пока путь не выбран; `sessions` — ключ сессии → значение;
    `questions` — ключ сессии → открытый вопрос.
- `ANSWER_MESSAGES` — сообщения `Workflow Kit:` агенту на каждый ответ.
- `registerPlanQuestionRoute({ router, toggles, resolveProject })` —
  `POST /api/sessions/plan { summary, cwd, projectDir, client, sessionId }`
  (только loopback; без id сессии — 400 `bad-session`, папка не проекта —
  404 `project-not-found`).
- `sessionFileName(key)` — имя файла по ключу `claude|codex:<id>`
  (`[A-Za-z0-9._-]`), иначе `null`; `SESSIONS_DIR`.
- `registerReviewRoutes({ router, state, toggles })` —
  `POST /api/projects/:id/sessions/:sid/review { on }`,
  `POST /api/projects/:id/sessions/:sid/plan-decision { choice }` и раздел
  `review`.

## Инварианты

- Ничего, кроме файла сессии в `.workflow-kit/local/` (вне git), не пишется.
- Модуль не запускает CLI и сам не шлёт сообщений агенту: это делают
  слушатели ответа.

## Зависимости

`#data-store` (`readJsonFile`, `writeJsonAtomic`), `#http-server`.
