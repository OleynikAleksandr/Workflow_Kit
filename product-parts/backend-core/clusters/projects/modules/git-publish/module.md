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
- `runGit` — `execFile('git')` с `gitExecOptions`: `GIT_TERMINAL_PROMPT=0`, предел 60 с и `windowsHide` (M14: на Windows без этого каждый вызов открывал окно консоли, и Windows Terminal мелькал); `GitRunner` для тестов.

- Публикация запуска автопилотирования (M39 T008, `src/publication.ts`):
  `publish(git, folder, scopeOpen, expected?)` → `Published { from, to, sha, commits,
  already }`. С `ExpectedPublication { sha, branch, upstream }`:
  - ветка и upstream должны совпасть (`publication-target-changed`), HEAD — равняться `sha`
    (`head-changed`);
  - после `fetch` удалённая ветка, уже равная `sha`, — проверенный успех без push
    (`already: true`; грязное дерево всё равно `worktree-dirty`);
  - после push всегда `fetch`: ошибка push при SHA на удалённой ветке — успех, иначе ошибка.
  Без `expected` поведение кнопки прежнее. Ошибка push — `push-auth` (отказ учётных данных)
  или `push-failed` (`PushFailure`; маршрут отвечает 502 на оба).
  `stageCi(git, folder, { sha, remote, branch })` отправляет точный SHA на
  `refs/heads/<branch>` без `--force` и читает его обратно через `ls-remote`: SHA уже там —
  `already`, отказ fast-forward — `remote-ahead`, неполный SHA — `head-changed`.
  `createPublisher({ git }) → Publisher { publish, stageCi }` — один сервис на кнопку и
  запуски; вызывающий держит мьютекс проекта. `registerPublicationRoutes` принимает
  `publisher?` и `mutex?`: кнопка выполняется под `project:<id>`, как шаги запуска.
- CI автопилотирования (M39 T007, `src/github-ci.ts`): `createGitHubCi({ gh?, git? }) →
  GitHubCi`, `read(root, sha, policy)` — `CiPolicy` (`remote`, `branch`, `requiredChecks`,
  `exactSha`) из разрешения запуска. Репозиторий — `githubRepo(git remote get-url <remote>)`
  (https, ssh, scp); затем `gh api --method GET repos/<o>/<r>/commits/<sha>/check-runs -f
  per_page=100`. Для каждой обязательной проверки берётся последний запуск с тем же именем
  и (при `exactSha`) тем же `head_sha`: другой SHA не считается. `CiVerdict`: `success`
  (все `completed`/`success`), `pending` (`missing`, `running`), `failed` (любое иное
  завершение — failure, cancelled, timed_out…), `unavailable` (`reason`; `transient` — сбой
  GitHub или ответа, иначе блокер возможности: нет `gh` — код 127, нет входа, не GitHub,
  неполный SHA, пустой список проверок). `runGh` — `execFile('gh')` без shell, 30 с,
  `windowsHide`, `GH_PROMPT_DISABLED=1`; `gh` не устанавливается и не настраивается;
  `GhRunner` для тестов. `gh` — кроссплатформенная программа, не программа ОС: одинаково на
  macOS, Linux и Windows x64/ARM64 (на Windows `execFile` находит `gh.exe` по `PATH`).

## Инварианты

- Раздел состояния только читает кэш (D11); git запускается в `refresh()`: при старте, раз в
  `intervalMs` (30 с), после изменения плана Kit (`onChange` состояния `workflow`) и после публикации.
- Удалённый репозиторий опрашивается (`fetch`) только при публикации.
- Никакого `--force`, удаления веток или изменения настроек и учётных данных git.

## Зависимости

`http-server` (маршруты, раздел состояния), `project-registry` (типы проектов). Тест M39 —
`test/github-ci.test.ts`, `test/publish-expected.test.ts` (T008: ожидаемый SHA, восстановление
после push, учётные данные, `stageCi`, кнопка и запуск под одним мьютексом). Служба (`cli`)
передаёт `scopeOpen` — у проекта есть scope в состоянии `workflow`.
