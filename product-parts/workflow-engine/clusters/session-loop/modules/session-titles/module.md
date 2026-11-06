# Модуль: session-titles

Часть `workflow-engine`, кластер `session-loop`. Алиас импорта: `#session-titles`.

## Назначение

Имена сессий (спецификация вехи 2, раздел 11). Приоритет: ручное имя из
панели → тема агента (`wfk session title`) → цель плана (`objective`, только
у сессии-владельца) → собственное имя провайдера (например, имя треда
ChatGPT) → «Новая сессия».

## Публичный интерфейс (`src/index.ts`)

- `createSessionTitles({ listProjects, resolveProject, sessions, scope,
  listed?, rename?, log? }) → SessionTitles`:
  - `load()` — читает имена из
    `<проект>/.workflow-kit/local/sessions/<client>.<id>.json` (поля
    `title` — ручное, `topic` — тема агента, `synced`, `archivedAt`, `forgottenAt`; другие поля файла,
    например `review`, сохраняются при записи);
  - `setManual(projectId, key, name)` — ручное имя; пустое удаляет его;
  - `setArchived(projectId, key, archived)` — сессия в архив (`archivedAt` —
    время) или обратно (`null`); сессия провайдера не трогается, панель
    прячет её из дерева и показывает в «Архиве» и на экране проекта с
    «Вернуть»;
  - `setForgotten(projectId, key)` — «Убрать из списка» в «Архиве»:
    `forgottenAt` — время; панель больше нигде не показывает сессию, чат в
    приложении не трогается;
  - `setTopic(folder, title, session?)` — тема от агента: проект по папке,
    сессия — `session` (`{ client, id }` из окружения агента), иначе
    единственная сессия проекта в состоянии `working` канала (ход идёт;
    из нескольких — та, что есть в `listed(projectId)`, списке провайдеров);
    отказы `TitleError`: `no-running-turn`, `ambiguous` (несколько ходов —
    подсказка переименовать в панели), `already-set` (тема задаётся один
    раз), `project-not-found`, `bad-title` (длиннее 80 знаков или пусто);
  - `name(projectId, key, providerTitle?) → SessionTitle` (`name`,
    `source`: `manual` | `agent` | `scope` | `provider` | `default`,
    `manual`, `topic`, `synced`, `note`, `archivedAt`, `forgottenAt`);
  - `onTurn(key)` — начало хода: повтор отложенного переименования;
  - `appTitle(key, current) → Promise<string | null>` — хук `prompt`
    сессии Claude: ручное имя или тема агента, если оно отличается от
    `current` (`session_title` хука); одно имя отправляется один раз за
    работу службы (переименование в самом приложении не перебивается);
    совпадение `current` с именем — `synced: true`; для Codex — `null`;
  - `section()` — `{ projects: { <id>: { <key>: SessionTitle } } }`.
- Синхронизация: для сессий Codex ручное имя и тема уходят в ChatGPT через
  `rename` (провайдер `renameSession`: `thread/name/set` демона, тред не
  загружается); отказ — `synced: false` с причиной и повтор при следующем
  ходе; при `load()` (запуск службы) имена Codex со `synced` не `true`
  отправляются заново в фоне. Для сессий Claude имя ждёт хука `UserPromptSubmit` (`synced: false`,
  `CLAUDE_NEXT_NOTE` «Имя уйдёт в Claude со следующим сообщением»): `cli`
  добавляет его в ответ хука как `hookSpecificOutput.sessionTitle`.
- `registerTitleRoutes({ router, state, titles })`:
  `POST /api/projects/:id/sessions/:sid/title { name }`,
  `POST /api/projects/:id/sessions/:sid/archive { archived }`,
  `POST /api/projects/:id/sessions/:sid/forget`,
  `POST /api/sessions/title { title, cwd, projectDir, client?, sessionId? }` (только loopback;
  команда `wfk session title`), раздел `titles`.
- `cleanTitle`, `titleFileName`, `DEFAULT_NAME`, `MAX_TITLE_LENGTH`,
  `SESSIONS_DIR`.

## Инварианты

- Тема агента задаётся один раз; ручное имя всегда главнее.
- Служба не открывает простаивающий тред Codex ради имени (иначе ChatGPT
  минуту не открывает чат).

## Зависимости

`#data-store`, `#http-server`.
