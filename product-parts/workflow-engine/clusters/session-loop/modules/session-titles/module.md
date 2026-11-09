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
    время) или обратно (`null`); после сохранения вызывается опция
    `archived(projectId, key, archived)` (служба останавливает или поднимает
    сессию провайдера, раунд R10; ошибка пишется в журнал), панель
    прячет её из дерева и показывает в «Архиве» и на экране проекта с
    «Вернуть»;
  - `setForgotten(projectId, key)` — «Убрать из списка» в «Архиве»:
    `forgottenAt` — время; панель больше нигде не показывает сессию, чат в
    приложении не трогается;
  - `setTopic(folder, title, session?)` — тема от агента: проект по папке,
    сессия — `session` (`{ client, id }` из окружения агента), иначе
    единственная сессия проекта в состоянии `working` канала (`running`);
    отказы `TitleError`: `session-ambiguous`, `already-set` (тема задаётся один
    раз), `service-turn`, `project-not-found`, `bad-title` (длиннее 80 знаков или пусто);
  - `running(projectId) → Promise<key>` — единственная сессия проекта с идущим ходом по
    данным канала (из нескольких — та, что есть в `listed(projectId)`, списке провайдеров);
    ни одной или несколько — `TitleError` `session-ambiguous` (409) с
    `details.candidates` (`{ client, session, state, name }`, до 20: идущие сессии, а без
    них — все сессии проекта) и просьбой повторить с `--client <id> --session <id>`
    (`SESSION_FLAGS_HINT`); по времени Kit не угадывает (M8, раздел 5);
  - `name(projectId, key, providerTitle?) → SessionTitle` (`name`,
    `source`: `manual` | `agent` | `scope` | `provider` | `default`,
    `manual`, `topic`, `synced`, `note`, `archivedAt`, `forgottenAt`);
  - `onTurn(key)` — начало хода: повтор отложенного переименования;
  - `onStop(key)` — хук `Stop`: повтор переименования вне хода (провайдер с `promptTitle`);
  - `setServiceTurn(key, service)` — ход начат служебным приветствием панели
    (`SERVICE_MESSAGE_MARK`) или нет; в служебном ходе `setTopic` отказывает
    `service-turn` (тема — по задаче пользователя, не по приветствию);
  - `appTitle(key, current) → Promise<string | null>` — хук `prompt`
    сессии провайдера с `promptTitle` (Claude): ручное имя или тема агента, если оно отличается от
    `current` (`session_title` хука); одно имя отправляется один раз за
    работу службы (переименование в самом приложении не перебивается);
    совпадение `current` с именем — `synced: true`; для остальных провайдеров — `null`;
  - `section()` — `{ projects: { <id>: { <key>: SessionTitle } } }`.
- Синхронизация (`rename`, провайдер `renameSession`) — для сессии любого провайдера
  реестра (ключ `<id провайдера>:<id сессии>`): обычно сразу (Codex —
  `thread/name/set` демона, тред не загружается); у провайдера с опцией
  `promptTitle(client)` (свойство `Provider.promptTitle`, Claude) — `/rename` в
  терминале сессии панели, только вне хода (состояние канала не
  `working`), иначе `synced: false`, `NEXT_TURN_NOTE` и повтор в
  `onStop(key)` (пришёл хук `Stop`: хода и диалогов нет). Отказ —
  `synced: false` с причиной и повтор при следующем ходе или `Stop`; при
  `load()` (запуск службы) неотправленные имена отправляются заново в фоне.
  Запасной путь такого провайдера (сессии, начатые не панелью) — `appTitle` для хука
  `UserPromptSubmit` (`cli` кладёт имя в `hookSpecificOutput.sessionTitle`).
- `registerTitleRoutes({ router, state, titles, isClient? })` (`isClient` — id провайдера
  есть в реестре; `namedSession(input, isClient?)` разбирает `client`/`sessionId` запроса:
  пара известного клиента и id, ничего — поиск идущей сессии, иначе 400 `bad-session`):
  `POST /api/projects/:id/sessions/:sid/title { name }`,
  `POST /api/projects/:id/sessions/:sid/archive { archived }`,
  `POST /api/projects/:id/sessions/:sid/forget`,
  `POST /api/sessions/title { title, cwd, projectDir, client?, sessionId? }` (только loopback;
  команда `wfk session title`), раздел `titles`.
- `cleanTitle`, `titleFileName`, `DEFAULT_NAME`, `MAX_TITLE_LENGTH`,
  `SESSIONS_DIR`, `NEXT_TURN_NOTE`, `SESSION_FLAGS_HINT`.

## Инварианты

- Тема агента задаётся один раз; ручное имя всегда главнее.
- Служба не открывает простаивающий тред Codex ради имени (иначе ChatGPT
  минуту не открывает чат).

## Зависимости

`#data-store`, `#http-server`.
