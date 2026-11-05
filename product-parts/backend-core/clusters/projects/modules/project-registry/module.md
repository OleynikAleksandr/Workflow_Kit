# Модуль: project-registry

Часть `backend-core`, кластер `projects`. Алиас импорта: `#project-registry`.

## Назначение

Реестр проектов пользователя (`projects.json`), проверка имён и путей,
выбор папки списком (спецификация, разделы 6 и 10). Проект — папка внутри
домашней папки пользователя; из списка его можно убрать, папка при этом
остаётся на диске.

## Публичный интерфейс (`src/index.ts`)

- `createProjectRegistry(options) → ProjectRegistry`. Опции: `file`
  (`projectsFile(dirs)` = `<config>/projects.json`), `projectsRoot`
  (из `config.json`; `~` и `~/…` раскрываются), `homedir`, `platform`,
  `events?` (`EventLog`), `mutex?` (`KeyedMutex`), `fs?`, `now?`, `newId?`.
  Методы:
  - `list()`, `get(id)`;
  - `create(name)` — проверяет имя, создаёт корень проектов при
    необходимости и папку `<корень>/<имя>` (существующая папка — ошибка
    `exists`), регистрирует проект (`source: 'created'`);
  - `open(path)` — папка внутри домашней по `realpath`, именно папка,
    читаемая (проба `readdir` ловит macOS TCC); уже зарегистрированная папка
    возвращается как есть (`existing: true`); имя — имя папки (NFC);
  - `remove(id)` — убирает только запись; перед этим опрашивает
    `addRemoveGuard(guard)`: если охранники вернули причины (работающие
    сессии, окружение папки), ошибка `busy` с `details.blockers`;
  - `section()` — раздел состояния `projects`: `root`, `home`, `projects`
    (с флагом `missing`, если папки больше нет), `error` при повреждённом
    `projects.json`.
  Изменения выполняются под мьютексом `projects` (D10); `create`, `open`,
  `remove` пишут события `project.created|opened|removed` (`id`, `name`,
  `path`) в журнал.
- `checkProjectName(raw) → { ok, name } | { ok: false, reason }` — NFC и
  обрезка пробелов; запрещены: пустое имя, длиннее
  `MAX_PROJECT_NAME_LENGTH` (100), `/`, `\`, `.` и `..` в любом месте,
  ведущий `-`, управляющие символы и `< > : " | ? *`, точка в конце,
  зарезервированные имена Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM0–9`,
  `LPT0–9`, `¹²³`, `CONIN$`, `CONOUT$`, в том числе с расширением, без учёта
  регистра). Правила одинаковы на всех ОС.
- `resolveInsideHome(path, scope, allowHome?)` — абсолютный путь →
  `realpath`; результат должен лежать внутри `realpath` домашней папки
  (`..` и символические ссылки раскрываются до проверки, выход наружу —
  `outside-home`). Сама домашняя папка допустима только с `allowHome`.
- `isInside(child, parent, platform, allowEqual?)`, `samePath(a, b,
  platform)` — сравнение реальных путей; на Windows без учёта регистра.
- `listFolders(path?, scope, { showHidden?, limit? }) → FolderListing` —
  подкаталоги папки внутри домашней (по умолчанию — сама домашняя):
  `path`, `parent` (`null` у домашней — выше подняться нельзя), `home`,
  `entries` (`name`, `path`; ссылки на папки включаются, скрытые — только
  с `showHidden`), `truncated` (больше `FOLDER_LIST_LIMIT` = 500).
- `ProjectError(code, message, details?)`, `PROJECT_ERROR_STATUS`,
  `accessHint(platform)` — подсказка для ошибки доступа (на macOS — TCC:
  «Системные настройки → Конфиденциальность и безопасность → Файлы и
  папки»).
- `registerProjectRoutes(router, state, registry, scope)` — маршруты и
  раздел `projects` в `/api/state`.
- `expandHome`, `nodeFs`, `PROJECTS_FILE_VERSION`; типы `Project`,
  `ProjectView`, `ProjectsSection`, `RemoveGuard`, `HomeScope`,
  `RegistryFs`, `FolderEntry`, `FolderListing`.

## HTTP API

| Маршрут | Ответ |
| --- | --- |
| `GET /api/folders?path=&hidden=1` | `FolderListing` |
| `GET /api/projects` | `{ projects }` |
| `POST /api/projects` `{name}` | 201 `{ project }` |
| `POST /api/projects/open` `{path}` | 201 `{ project, existing: false }` или 200 `{ project, existing: true }` |
| `DELETE /api/projects/:id` | `{ removed, folderKept: true }` |

Ошибки — `{ error: { code, message, ...details } }`: 400 `invalid-name`,
`invalid-path`, `outside-home`, `not-directory`, `invalid-body`; 403
`access-denied` (с `hint`); 404 `not-found`; 409 `exists`,
`registry-invalid`, `busy` (с `blockers`).

## Данные

`projects.json`: `{ "version": 1, "projects": [{ id, name, path, source,
createdAt }] }`; `path` — реальный абсолютный путь. Файл пишется атомарно
(`writeJsonAtomic`, права 0600). Невалидный JSON не перезаписывается:
действия отвечают `registry-invalid`, раздел состояния показывает ошибку.
Список хранится в памяти после первого чтения; служба — единственный
писатель.

## Инварианты

- Любой путь проекта или папки выбора проверяется по `realpath` внутри
  домашней папки; на Windows сравнение без учёта регистра.
- Удаление проекта никогда не трогает папку на диске.
- Модуль зависит только от `#data-store` и `#http-server`.
- Тесты работают во временном каталоге (подставной HOME), ошибки TCC
  имитируются подставным `fs`.

## Потребители

- `cli` создаёт реестр (`projectsFile`, корень из `config.json`),
  подключает маршруты и регистрирует охранник удаления
  `providers.removeBlockers(project)`: работающие сессии всех провайдеров
  и окружение папки Claude.
- `kit-structure` и `provider-registry` находят проект по `id` (`get`) и
  показывают подсказку `accessHint` при ошибке доступа.

## Дальше

В вехе 1 новых обязанностей у модуля нет.
