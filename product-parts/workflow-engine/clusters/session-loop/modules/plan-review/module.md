# Модуль: plan-review

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#plan-review`.

## Назначение

Переключатель «Ревью плана» у каждой сессии (спецификация вехи 2,
раздел 10). В вехе 2 — только переключатель: значение хранится и
показывается. С вехи 4 переключатель запускает перекрёстное ревью
(`#cross-review`): агенту он ничего не передаёт, служба читает его, когда
приходит `Stop` хода с открытым предложением плана (M4, раздел 10).

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
  - `section()` — `{ projects: { <id>: { visible, sessions } } }`:
    `visible` — пока путь не выбран; `sessions` — ключ сессии → значение.
- `sessionFileName(key)` — имя файла по ключу `claude|codex:<id>`
  (`[A-Za-z0-9._-]`), иначе `null`; `SESSIONS_DIR`.
- `registerReviewRoutes({ router, state, toggles })` —
  `POST /api/projects/:id/sessions/:sid/review { on }` и раздел `review`.

## Инварианты

- Ничего, кроме файла сессии в `.workflow-kit/local/` (вне git), не пишется.
- Функции ревью нет: модуль не запускает CLI и не шлёт сообщений агенту.

## Зависимости

`#data-store` (`readJsonFile`, `writeJsonAtomic`), `#http-server`.
