# Модуль: panel-shell

Часть `control-panel`, кластер `web-panel`. Алиас импорта: `#panel-shell`.

## Назначение

Каркас веб-панели по согласованному макету (`docs/design/ui-mockup.html`,
спецификация вехи 2, раздел 6): боковая панель и экран справа, маршруты в
`location.hash`, опрос `GET /api/state` раз в 3 с, реестр служебных
карточек и карточка «Система» (в «Настройках»; карточек «Структура Kit» и
провайдеров нет с 2026-11-06 — решение пользователя), архив,
экран «Домой» iPad. Файлы панели — статические ES-модули без сборки (D3),
лежат в `src/` и отдаются сервером в корне сайта.

## Публичный интерфейс для бэкенда (`src/index.ts`)

- `PANEL_ASSETS_DIR` — абсолютный путь к `src/` модуля.
- `panelShellMount() → { prefix: '/', dir }` — монтирование для
  `http-server`.
- `STATE_POLL_MS` — 3000.

## Вид

- Размеры: основной текст 13 px, второстепенный 11–12 px, заголовок экрана
  17 px, название и «Ваши проекты» 15 px. Тема: светлая и тёмная по
  системе; выбор «Как в системе / Светлая / Тёмная» в «Настройках»
  хранится на устройстве (`localStorage` `wfk.theme`, атрибут
  `data-theme`).
- Раскладка: боковая панель 270 px и экран; уже 680 px — столбцы друг под
  другом. Отступы учитывают safe-area (вырез, полоска «Домой» iPad). На
  сенсорных экранах кнопки и поля не ниже 44 px, шрифт поля 16 px (iPad не
  масштабирует страницу).
- Боковая панель: логотип, версия, шестерёнка («Настройки»; на экране
  «Настройки» она нажата и выводит из них, как и кнопка «✕» в шапке
  «Настроек», — на экран, с которого их открыли, иначе на главный:
  `settingsExit(before)` в `view-model.js`); строка
  подготовки (спиннер и таймер идущего мастера из раздела `setup`); меню
  «Ваши проекты» (поиск по имени и пути, список с «В архив», «Создать
  проект», «Открыть папку проекта», «Обновить сессии» — `POST
  /api/refresh`); стрелка у «Ваши проекты» смотрит вверх, пока меню
  открыто; «Свернуть все»; дерево; «Ревью плана»
  выбранной сессии (слот `sessionReview`); индикаторы связи (служба,
  каждый провайдер раздела `providers` — по его `status.state`, iPad ·
  Tailscale — есть ли адрес Tailscale).
- Провайдеры панель берёт только из состояния (`providers.js`, M8): названия
  (`label`, иначе `title`, иначе id), буква метки (`mark`), кнопки и пункты
  «Новая сессия», тексты подтверждений («Чаты в ChatGPT и Claude
  останутся…» — `providerNames`), индикаторы. Своего списка провайдеров в
  панели нет; у провайдера без своих цветов в `tree.css` метка нейтральная (свои — у
  ChatGPT, Claude и Kimi, токен `--kimi`).
- Дерево показывает только выбранный проект: проект маршрута, иначе
  выбранный последним (`wfk.current-project` на устройстве; мастер
  выбирает новый проект — `SlotContext.selectProject`), если он среди
  активных (`currentProjectId` в `selection.js`); остальные — в меню
  «Ваши проекты»; без выбранного дерево пусто (список, «Проектов пока нет» и
  создание — в меню «Ваши проекты»).
  Проект — имя, число сессий (или «папка не найдена»), свёртка
  (на устройстве, `wfk.tree.collapsed`), «⋯»: новая сессия каждого
  провайдера, скопировать путь, в архив. Сессия — имя (из раздела `titles`, иначе
  цель плана у сессии-владельца, иначе имя провайдера, иначе «Новая сессия»), время, «новая» (до часа после
  создания, пока агент не закончил ход), метка провайдера, спиннер,
  пока агент работает (раздел `channel`, `working`); «⋯»: открыть чат,
  переименовать (`POST …/sessions/:key/title`), в архив (`POST
  …/sessions/:key/archive`; сессии в архиве — в «Архиве» и на экране
  проекта с «Вернуть»). Сессии с `forgottenAt` (раздел `titles`, «Убрать
  из списка» в архиве) нигде не показываются.
- Экраны: первый запуск и «выберите проект»; новый проект и «Открыть папку
  проекта» (слот `newProject` — мастер `project-wizard`; без него — простая
  форма `new-project.js`); проект (сессии, кнопки новой сессии, сессии в
  архиве); сессия (заголовок, проект, провайдер, время и строка состояния
  вместо «Открыть чат»: у провайдера с подъёмом сессий (`resume` в его
  сводке — есть `resumeSession`; сейчас Claude, `SessionRow.resumable`) —
  состояние процесса («открыта в <провайдер>» и примечание сессии,
  `runningText`), а открытие экрана поднимает остановленную сессию через
  `POST …/providers/<id>/sessions/:sid/resume`, повтор после ошибки — через
  `REVIVE_RETRY_MS` (30 с), раунд R9; у остальных (ChatGPT, Kimi) — `chatStatus`:
  «чат открывается щелчком по карточке сессии» (у ссылки `kimi-code://` —
  «проект открывается в Kimi Code щелчком по карточке сессии»; пометка сессии
  дописывается через « — », без ссылки показывается только она); щелчок или Enter по карточке
  такой сессии в дереве открывает её чат по ссылке устройства
  (`deviceLink`); ссылку `kimi-code://` на компьютере щелчок отдаёт службе
  (`clickOpensThroughService`, `POST /api/open-link`: проект без пустого чата,
  M9 раздел 8.1), при отказе — переход по ссылке; открытие экрана без щелчка чат не открывает; пункта
  «Открыть чат» в меню сессий нет, M3-autostart R4. Новая сессия
  открывается сама, как щелчком, когда появилась в дереве (R5): «Новая
  сессия» ждёт сессию этого провайдера, созданную не раньше запроса, мастер —
  по ключу (`SlotContext.openSession`); ожидание — `ARRIVAL_WAIT_MS` (3 мин),
  поиск — `arrivedSession(tree, pending)`; чат без щелчка на Mac открывает
  служба (`POST /api/open-link`), на сенсорном устройстве или при отказе —
  переход по ссылке; новую сессию Claude на Mac служба открывает в Claude
  Desktop (`claude://…`, `openInDesktop`), когда у неё появилась ссылка
  (экран сессии — сразу, `PendingSession.shown`), M3-autostart R9; щелчок по
  карточке Claude тоже открывает её в Claude Desktop, на сенсорном устройстве —
  https-ссылку в новой вкладке (R10); http(s)-ссылка на сенсорном устройстве
  (Remote Control Kimi) сама не открывается никогда — только нажатием
  (`opensByItself(link, maxTouchPoints)`, M8 2.6); сессия-ревьюер (раздел `reviews`, M4)
  в дерево и в число сессий проекта не входит (M4, раздел 13.4: её работа — в журнале ревью основной сессии); тело — слот `sessionBody`, модуль `session-view`;
  узел тела постоянный, введённый текст переживает опрос); «Настройки»
  (внешний вид, папка для проектов — `POST /api/settings/projects-root`,
  карточка «Архив» с одной кнопкой, служебная карточка «Система»);
  «Архив» (`#/archive`, `archive.js`, по образцу Workflow Pilot): проекты и
  сессии в двух колонках; щелчок выбирает строку, ⌘/Ctrl — добавляет,
  Shift — диапазон (`selectRows`); проекты — «Вернуть в активные»
  (`POST …/restore`), «Убрать из списка» (`DELETE /api/projects/:id`,
  папка остаётся), «Удалить с диска…» (один проект, панель с вводом
  точного имени, `POST /api/projects/:id/delete-folder`); сессии —
  «Вернуть» (`…/archive { archived: false }`), «Убрать из списка»
  (`…/forget`, чат в приложении остаётся); «✕» возвращает в «Настройки».
- Кнопки: три состояния — обычное, наведение, нажатие (`buttons.css`);
  `press.js` держит `.is-pressed` ещё 180 мс после отпускания и после
  щелчка (и с клавиатуры) рисует кольцо `.just-pressed` 0,45 с; работает
  для кнопок всех расширений через делегирование.
- Экран «Домой» iPad: `manifest.webmanifest` (standalone, start_url `/`,
  значки 192 и 512, maskable), `apple-touch-icon` 180, тема строки
  состояния, `viewport-fit=cover`.

## Файлы панели

| Файл | Содержание |
| --- | --- |
| `index.html` | метаданные (manifest, значки, standalone, цвет темы), стили, `app.js`; без встроенных скриптов и стилей (CSP) |
| `styles.css` | токены темы (светлая, тёмная по системе и по `data-theme`), прежние имена токенов для карточек, базовый текст 13 px, стили служебных карточек |
| `layout.css` | раскладка макета: боковая панель (бренд, строка подготовки, заголовок «Ваши проекты»), экраны, панели, сетка карточек «Настроек», перестройка уже 680 px, safe-area |
| `tree.css` | меню «Ваши проекты» и «⋯», дерево проектов и сессий, метки провайдеров, индикаторы связи |
| `controls.css` | кнопки и поля (44 px на сенсорных экранах), сообщения, выбор папки |
| `buttons.css` | состояния кнопок: наведение, нажатие, кольцо щелчка; стрелка «Ваши проекты» |
| `archive.css` | экран «Архив» в две колонки, панель удаления с диска |
| `archive.js` | `createArchiveScreen(handlers) → { element, render(projects, sessions, home) }` |
| `selection.js` | чистые функции: `currentProjectId(route, remembered, activeIds)`, `archivedSessions(tree)`, `selectRows(ids, selected, anchor, id, mods)` |
| `press.js` | `installPressFeedback()`, `STICKY_MS` (180), `RING_MS` (450) |
| `publication.js` | строка «GitHub» экрана проекта (publication-order 3.2): `publicationView(state, projectId)` из раздела `publication` — «Опубликовано…», «Неопубликованных коммитов: N» с кнопкой «Опубликовать на GitHub (N коммитов)» или причина ожидания; без upstream — `null`; `commitsLabel(n)`. Кнопка (`screens.js`) вызывает `handlers.publish` → `POST /api/projects/:id/publish` (тайм-аут 120 с), результат — сообщение с коротким SHA |
| `reviewers.js` | `reviewerMatcher(state)` — сессии ревьюеров плана, которых нет в дереве: по `reviewerKey` ревью, а пока ключа нет — по `reviewerRef` (локальный id или id Remote Control) провайдера ревьюера, для обоих провайдеров (M4 13.4, 13.9) |
| `reload.js` | `shouldReload(loaded, current, reloadedFor)` — нужна ли перезагрузка: версия службы известна, отличается от версии при загрузке и для неё перезагрузки ещё не было (M4 13.5) |
| `app.js` | состояние и маршрут, опрос `/api/state` (следующий запрос — через 3 с после ответа, таймаут 8 с, сразу при возврате на вкладку, тик таймера строки подготовки раз в секунду), самоперезагрузка страницы, когда служба отвечает другой версией, чем при загрузке (один раз на версию, `sessionStorage`, M4 13.5), экраны и слоты; загрузка расширений `PANEL_EXTENSIONS` (`/project-wizard/project-wizard.js`, `/session-view/session-view.js`) до первого опроса: `install(shell)` с помощниками `registerCard`, `registerCardGroup`, `registerSlot`, `requestRefresh`, `api`, `ApiError`, `dom`, `createFolderPicker`, `showError` |
| `actions.js` | `createActions({ navigate, render, route })` → `{ handlers, toast, say, collapsed }`: в архив; для «Архива» — `restoreProjects`, `forgetProjects`, `deleteProject`, `restoreSessions`, `forgetSessions`; новая сессия, обновить сессии, копировать путь, открыть чат, переименовать и архивировать сессию; сообщения над экраном; свёрнутые проекты |
| `slots.js` | слоты раскладки для расширений: `registerSlot('newProject' \| 'sessionBody' \| 'sessionReview', definition)`, `slots`; типы `SlotContext` (`navigate`, `requestRefresh`, `say`, `selectProject`), `SessionContext` (`project`, `session`, `link`) |
| `view-model.js` | чистые модели без DOM: `parseRoute`/`routeHash` (`#/`, `#/settings`, `#/new`, `#/open`, `#/archive`, `#/p/<id>`, `#/s/<id>/<ключ>`), `projectLists`, `filterProjects`, `projectTree`, `ownerObjective`, `sessionKey` (`<провайдер>:<localId>` — ключ разделов `channel`, `titles`, `review`), `runningText`, `statusLine`, `chatStatus`, `opensByItself`, `deviceLink`, `formatWhen`, `formatElapsed`, `sessionsLabel`, `shortPath`, `themeAttribute`; в строке сессии — `providerLabel` и `resumable` из сводки провайдера |
| `providers.js` | провайдеры из раздела `providers` состояния: `providerViews(state)` (`id`, `label`, `mark`, `resume`, `ready`, `statusLabel`), `providerNamer(state)`, `providerNames(state)` («ChatGPT и Claude»), `indicators(state, linked)` |
| `sidebar.js` | боковая панель: `createSidebar(handlers) → { element, render(model), setReview(node) }` |
| `menus.js` | всплывающие меню «⋯»: `openMenu(anchor, items)`, `closeMenu()` |
| `screens.js` | экраны из состояния: `homeScreen` (только приветствие; создание и выбор проекта — в меню «Ваши проекты»), `projectScreen` (сессии, «GitHub», блок «Провайдеры» с действиями уровня провайдера), `sessionHeader`, `missingScreen` |
| `provider-actions.js` | `providerActionRows(state)` — включённые действия `scope: 'provider'` каждого провайдера раздела `providers`, готового тоже (`{ provider, id, label, confirm }`); обработчик `runProviderAction` в `actions.js`: вопрос `confirm`, `POST /api/providers/:p/actions/:a`, отказ `action-disabled` ошибкой не показывается |
| `new-project.js` | запасной экран «Новый проект» / «Открыть папку проекта», если мастер не загрузился |
| `settings.js` | «Настройки»: внешний вид (`THEME_KEY`, `savedTheme`, `applyTheme`), папка для проектов, карточка «Архив» (`onArchive`), сетка служебных карточек |
| `card-grid.js` | `renderCards(container, state)` — карточки и элементы групп по `order`, перерисовка только изменившихся |
| `cards.js` | реестр карточек: `registerCard`, `registerCardGroup`, `expandCards(state)`, `requestRefresh()` |
| `dom.js` | помощники `h`, `facts`, `pill`, `code`, `notice`, `plainInput`; текст только через `textContent` |
| `api.js` | `api(method, url, body?)`, `apiGet(url)`, `ApiError` (`status`, `code`, `message`, `hint`, `blockers`) |
| `folder-picker.js` | выбор папки внутри домашней (`GET /api/folders`); `pickLabel`, `idPrefix` |
| `shared-access-model.js` | модель карточки «Общий доступ к чатам» (M12 раздел 2.2), без DOM: `sharedAccessProviders(state)` — провайдеры, у статуса которых есть `details.sharedAccess` (и `null` до первой проверки), `sharedAccessOf`, `sharedOperation` (последняя операция `provider.shared-access.apply|remove` провайдера из раздела `operations`), `sharedTone`, `sharedButtons` (по состоянию: `not-configured` — «Настроить»; `needs-remote-login` — «Открыть настройки macOS»; `needs-connection` — «Открыть подключения ChatGPT»; `active` — «Перепроверить», «Убрать настройку»; `broken` — «Настроить ещё раз»; `unsupported` — ничего; до проверки — «Проверить»; Windows, M13: `needs-admin-setup` — «Скопировать команду запуска» (главная), «Показать скрипт», «Перепроверить», «Убрать настройку»; при поле `admin` в `not-configured` и `broken` — те же две кнопки, у отката — «Показать скрипт отката»), `adminNote` (что сделать со скриптом администратора), `sharedSummary`, `operationNote`, `REMOVE_CONFIRM`, `REMOVE_CONFIRM_WINDOWS`, `removeConfirm` |
| `shared-access-card.js` | группа карточек «Общий доступ к чатам · <провайдер>» в «Настройках» (`order` 5): состояние, что работает или чего не хватает, блок для ручной вставки (`manualProfile`), кнопки модели. «Настроить» → `GET …/shared-access/preview` → список записей и заметки → «Записать» → `POST …/apply { token }`; «Открыть …» → `POST …/open { target }`; «Перепроверить» → `POST …/recheck`; «Убрать настройку» — с подтверждением (`removeConfirm`) → `POST …/remove`. Windows (M13): блок шага администратора — `adminNote` и команда (`admin.command`); «Показать скрипт» раскрывает путь и текст (`admin.file`, `admin.text`), «Скопировать команду запуска» — `navigator.clipboard`; Kit скрипт не запускает. Пока идёт операция, кнопки выключены; ошибка — в карточке. Узел карточки один на провайдера: открытый предпросмотр переживает опрос |
| `system-card.js` | карточка «Система» (версия, ОС, служба, автозапуск, запускатель, значок, программы, адреса); «Программы» — имена из `system.service.programNames` службы (найденные — с путём, остальные — «не найдена»), у службы без этого поля — найденные |
| `manifest.webmanifest`, `icons/` | экран «Домой»: `icon.svg` (источник) и `icon-180/192/512.png` |

## Как добавить карточку «Настроек»

Модуль JS вызывает `registerCard` и импортируется из `app.js`; карточки,
число которых зависит от состояния, регистрируются группой
(`registerCardGroup`). Модуль другого каталога подключается как
расширение: сервер монтирует его статику под своим префиксом, URL его
входного файла добавляется в `PANEL_EXTENSIONS`. `select(state)` выбирает
данные карточки; карточка перерисовывается только при их изменении.
Карточка с собственным состоянием возвращает из `render` один и тот же
узел, чтобы ввод и фокус пережили опрос.

## Инварианты

- JS проверяется `tsc` через JSDoc и `// @ts-check`; модели — `node --test`.
- Данные вставляются в DOM только через `textContent`; положение
  всплывающих меню — через CSSOM (CSP запрещает атрибут `style`).
- Панель только читает `/api/state`; изменения — POST/DELETE с JSON.
- Ссылки чатов проходят `deviceLink` (без `javascript:`, `data:`, `file:`).

## Дальше

Кнопки «Перезапустить службу» и «Диагностика» в «Настройках» ждут API
службы.
