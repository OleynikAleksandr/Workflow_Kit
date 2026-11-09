# Модуль: git-publish

Часть `backend-core`, кластер `projects`. Алиас импорта: `#git-publish`.

## Назначение

Публикация проекта в удалённый репозиторий git (спецификация `docs/planning/publication-order.md`,
раздел 3.1). Публикация — действие вне плана: только когда scope Kit закрыт, дерево чистое и у
ветки есть upstream; push без `--force`, после него SHA upstream сверяется с `HEAD`.

## Публичный интерфейс (`src/index.ts`)

- `readPublication(git, folder, scopeOpen, now?) → PublicationState` — только локальные данные git
  (без `fetch`): `status` (`none` — нет ветки или upstream; `up-to-date`; `ready`; `blocked`),
  `branch`, `upstream`, `ahead`, `behind`, `dirty`, `scopeOpen`, `code` и `reason` (по-русски из
  `REFUSALS`), `checkedAt`.
- `refusal(state)` — первая причина отказа: `no-upstream`, `remote-ahead`, `nothing-to-publish`,
  `scope-open`, `worktree-dirty` или `null`.
- `publish(git, folder, scopeOpen) → { from, to, sha, commits }` — `fetch` upstream, повторная
  проверка, `git push <remote> HEAD:<branch>` (хуки репозитория работают как обычно), повторный
  `fetch` и сверка SHA. Ошибка — `PublishError` (`code` — причина отказа или `push-failed`,
  `output` — вывод git).
- `registerPublicationRoutes({ router, state, projects, scopeOpen, git?, intervalMs?, log? }) →
  Publication` (`refresh(projectId?)`, `section()`, `stop()`):
  - раздел `publication` в `/api/state` — `{ projects: { <id>: PublicationState } }` из кэша;
    проекты без upstream в нём не появляются;
  - `POST /api/projects/:id/publish` — `{ published: true, from, to, sha, commits }`; отказы —
    409 с кодом причины, ошибка git — 502 `push-failed` с `details.output`; 404 — нет проекта;
    409 `publishing` — публикация проекта уже идёт; после попытки кэш проекта обновляется.
- `runGit` — `execFile('git')` с `GIT_TERMINAL_PROMPT=0` и пределом 60 с; `GitRunner` для тестов.

## Инварианты

- Раздел состояния только читает кэш (D11); git запускается в `refresh()`: при старте, раз в
  `intervalMs` (30 с), после изменения плана Kit (`onChange` состояния `workflow`) и после публикации.
- Удалённый репозиторий опрашивается (`fetch`) только при публикации.
- Никакого `--force`, удаления веток или изменения настроек и учётных данных git.

## Зависимости

`http-server` (маршруты, раздел состояния), `project-registry` (типы проектов). Служба (`cli`)
передаёт `scopeOpen` — у проекта есть scope в состоянии `workflow`.
