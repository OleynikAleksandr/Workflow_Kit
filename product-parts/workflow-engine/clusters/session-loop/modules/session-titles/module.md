# Модуль: session-titles

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#session-titles`.

## Назначение

Имена сессий (спецификация вехи 2, раздел 11). Приоритет: ручное имя из
панели → тема агента (`wfk session title`) → цель плана (`objective`, только
у сессии-владельца) → собственное имя провайдера (например, имя треда
ChatGPT) → «Новая сессия».

## Публичный интерфейс (`src/index.ts`)

- `createSessionTitles({ listProjects, resolveProject, sessions, scope,
  rename?, log? }) → SessionTitles`:
  - `load()` — читает имена из
    `<проект>/.workflow-kit/local/sessions/<client>.<id>.json` (поля
    `title` — ручное, `topic` — тема агента, `synced`, `archivedAt`; другие поля файла,
    например `review`, сохраняются при записи);
  - `setManual(projectId, key, name)` — ручное имя; пустое удаляет его;
  - `setArchived(projectId, key, archived)` — сессия в архив (`archivedAt` —
    время) или обратно (`null`); сессия провайдера не трогается, панель
    прячет её из дерева и показывает на экране проекта с «Вернуть»;
  - `setTopic(folder, title)` — тема от агента: проект по папке, сессия —
    единственная сессия проекта в состоянии `working` канала (ход идёт);
    отказы `TitleError`: `no-running-turn`, `ambiguous` (несколько ходов —
    подсказка переименовать в панели), `already-set` (тема задаётся один
    раз), `project-not-found`, `bad-title` (длиннее 80 знаков или пусто);
  - `name(projectId, key, providerTitle?) → SessionTitle` (`name`,
    `source`: `manual` | `agent` | `scope` | `provider` | `default`,
    `manual`, `topic`, `synced`, `note`, `archivedAt`);
  - `onTurn(key)` — начало хода: повтор отложенного переименования;
  - `section()` — `{ projects: { <id>: { <key>: SessionTitle } } }`.
- Синхронизация: для сессий Codex ручное имя и тема уходят в ChatGPT через
  `rename` (провайдер `renameSession`: `thread/name/set` только для треда,
  который демон и так держит); иначе `synced: false` с заметкой и повтор при
  следующем ходе. Имена Claude хранятся только в Workflow Kit.
- `registerTitleRoutes({ router, state, titles })`:
  `POST /api/projects/:id/sessions/:sid/title { name }`,
  `POST /api/projects/:id/sessions/:sid/archive { archived }`,
  `POST /api/sessions/title { title, cwd, projectDir }` (только loopback;
  команда `wfk session title`), раздел `titles`.
- `cleanTitle`, `titleFileName`, `DEFAULT_NAME`, `MAX_TITLE_LENGTH`,
  `SESSIONS_DIR`.

## Инварианты

- Тема агента задаётся один раз; ручное имя всегда главнее.
- Служба не открывает простаивающий тред Codex ради имени (иначе ChatGPT
  минуту не открывает чат).

## Зависимости

`#data-store`, `#http-server`.
