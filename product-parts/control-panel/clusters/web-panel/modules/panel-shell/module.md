# Модуль: panel-shell

Часть `control-panel`, кластер `web-panel`. Алиас импорта: `#panel-shell`.

## Назначение

Каркас веб-панели по согласованному макету (`docs/design/ui-mockup.html`,
спецификация вехи 2, раздел 6): боковая панель и экран справа, маршруты в
`location.hash`, опрос `GET /api/state` раз в 3 с, реестр служебных
карточек и сами карточки «Система» и «Структура Kit» (в «Настройках»),
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
- Боковая панель: логотип, версия, шестерёнка («Настройки»); строка
  подготовки (спиннер и таймер идущего мастера из раздела `setup`); меню
  «Ваши проекты» (поиск по имени и пути, список с «В архив», «Создать
  проект», «Открыть папку проекта», «Обновить сессии» — `POST
  /api/refresh`, «Архив проектов…»); «Свернуть все»; дерево; «Ревью плана»
  выбранной сессии (слот `sessionReview`); индикаторы связи (служба,
  ChatGPT, Claude — по `status.state` провайдера, iPad · Tailscale — есть
  ли адрес Tailscale).
- Дерево: проект — имя, число сессий (или «папка не найдена»), свёртка
  (на устройстве, `wfk.tree.collapsed`), «⋯»: новая сессия ChatGPT /
  Claude, скопировать путь, в архив. Сессия — имя (из раздела `titles`, иначе
  имя провайдера, иначе «Новая сессия»), время, «новая» (до часа после
  создания, пока агент не закончил ход), метка ChatGPT / Claude, спиннер,
  пока агент работает (раздел `channel`, `working`); «⋯»: открыть чат,
  переименовать (`POST …/sessions/:key/title`), в архив (`POST
  …/sessions/:key/archive`; сессии в архиве — на экране проекта с
  «Вернуть»).
- Экраны: первый запуск и «выберите проект»; новый проект и «Открыть папку
  проекта» (слот `newProject` — мастер `project-wizard`; без него — простая
  форма `new-project.js`); проект (сессии, кнопки новой сессии, сессии в
  архиве); сессия (заголовок, проект, провайдер, время, «Открыть чат» по
  ссылке устройства; тело — слот `sessionBody`, модуль `session-view`;
  узел тела постоянный, введённый текст переживает опрос); архив проектов (вернуть, убрать из
  списка — папки остаются); «Настройки» (внешний вид, папка для проектов —
  `POST /api/settings/projects-root`, и служебные карточки).
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
| `controls.css` | кнопки и поля (44 px на сенсорных экранах), сообщения, выбор папки, карточка «Структура» |
| `app.js` | состояние и маршрут, опрос `/api/state` (следующий запрос — через 3 с после ответа, таймаут 8 с, сразу при возврате на вкладку, тик таймера строки подготовки раз в секунду), экраны и слоты; загрузка расширений `PANEL_EXTENSIONS` (`/provider-cards/provider-cards.js`, `/project-wizard/project-wizard.js`, `/session-view/session-view.js`) до первого опроса: `install(shell)` с помощниками `registerCard`, `registerCardGroup`, `registerSlot`, `requestRefresh`, `api`, `ApiError`, `dom`, `createFolderPicker`, `showError` |
| `actions.js` | `createActions({ navigate, render, route })` → `{ handlers, toast, say, collapsed }`: архив и возврат проектов, убрать из списка, новая сессия, обновить сессии, копировать путь, открыть чат, переименовать и архивировать сессию; сообщения над экраном; свёрнутые проекты |
| `slots.js` | слоты раскладки для расширений: `registerSlot('newProject' \| 'sessionBody' \| 'sessionReview', definition)`, `slots`; типы `SlotContext` (`navigate`, `requestRefresh`, `say`), `SessionContext` (`project`, `session`, `link`) |
| `view-model.js` | чистые модели без DOM: `parseRoute`/`routeHash` (`#/`, `#/settings`, `#/new`, `#/open`, `#/archive`, `#/p/<id>`, `#/s/<id>/<ключ>`), `projectLists`, `filterProjects`, `projectTree`, `sessionKey` (`<провайдер>:<localId>` — ключ разделов `channel`, `titles`, `review`), `indicators`, `statusLine`, `deviceLink`, `formatWhen`, `formatElapsed`, `sessionsLabel`, `shortPath`, `themeAttribute`, `PROVIDER_LABELS` |
| `sidebar.js` | боковая панель: `createSidebar(handlers) → { element, render(model), setReview(node) }` |
| `menus.js` | всплывающие меню «⋯»: `openMenu(anchor, items)`, `closeMenu()` |
| `screens.js` | экраны из состояния: `homeScreen`, `projectScreen`, `sessionHeader`, `archiveScreen`, `missingScreen` |
| `new-project.js` | запасной экран «Новый проект» / «Открыть папку проекта», если мастер не загрузился |
| `settings.js` | «Настройки»: внешний вид (`THEME_KEY`, `savedTheme`, `applyTheme`), папка для проектов, сетка служебных карточек |
| `card-grid.js` | `renderCards(container, state)` — карточки и элементы групп по `order`, перерисовка только изменившихся |
| `cards.js` | реестр карточек: `registerCard`, `registerCardGroup`, `expandCards(state)`, `requestRefresh()` |
| `dom.js` | помощники `h`, `facts`, `pill`, `code`, `notice`, `plainInput`; текст только через `textContent` |
| `api.js` | `api(method, url, body?)`, `apiGet(url)`, `ApiError` (`status`, `code`, `message`, `hint`, `blockers`) |
| `folder-picker.js` | выбор папки внутри домашней (`GET /api/folders`); `pickLabel`, `idPrefix` |
| `structure-card.js` | карточка «Структура Kit» (по проектам: статус, установка, обновление, перезапись) |
| `system-card.js` | карточка «Система» (версия, ОС, служба, автозапуск, запускатель, значок, программы, адреса) |
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
