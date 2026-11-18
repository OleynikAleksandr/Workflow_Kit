# M44: разрешение запуска автопилота и знание агента — доказательства

Спецификация: [M44](../planning/M44-autopilot-grant-and-agent-state.md).

## Причина (T001, воспроизведено 18.11.2026 на бандле Kit 2.4.5)

- Запуск M43 `run-khg6_dmzVg8_` и запуск этого плана `run-grGmd5VPjbzn`: квитанции только
  `review` и `choose`, `authority: null`, `scope.authorization: null`; в журнале службы после
  `decisions: choose … applied` — ни одной строки старта или разрешения.
- Служба просила `autopilot:authorize` с `mode: full`, `accept: false`,
  `acceptancePolicy: manual` (в плане ручной критерий — живая проверка пользователя). Kit 2.4.5
  отказывал: `AUTOPILOT_MANUAL_REQUIRED` (правило M39 в `checkAuthorizeInput` допускало ручной
  критерий только не в полном режиме). У M41 ручных критериев не было — поэтому он работал.
- Отказ ставил `blocked`, затем `start()` останавливал запуск второй раз (`pausedFrom: blocked`),
  а «Продолжить» возвращал его в `blocked` без причины и без новой попытки.

## Исправление по задачам

| Задача | Коммит | Что сделано |
| --- | --- | --- |
| T001 | `5807b005` | Kit 2.4.6: полный автопилот с ручным критерием (accept=false, policy manual); журнал исходов старта и разрешения; повтор до 3 раз; «Продолжить» без разрешения просит его снова |
| T002 | `2d20a437` | `wfk hook session-start` печатает строку `Workflow Kit autopilot: mode=…, review=…; run=…` в диалекте клиента; без службы — `unknown (service not reachable)` |
| T003 | `719875c4` | Смена Settings и состояния запуска — строка в очередь сессии без пробуждения; «autopilot» в текстах хода только при живом разрешении Kit |
| T004 | `b97c22f8` | Панель: «Автопилот не получил разрешения Kit», причина и «Повторить» (`POST …/autopiloting/retry`) |

## Автоматические проверки (macOS ARM64, Node 24)

| Команда | Результат |
| --- | --- |
| `npm run typecheck` | без ошибок |
| `npm run test:app` | 1437 из 1437 (после T004) |
| `npm run test:kit` | 78 из 78 (после T001) |
| `npm run check:platforms` | `platform-guard: ok` |
| сценарии M44 (список ниже) | 45 из 45, 58 с |
| `node …/session-view/test/m44-run-card.browser.mjs` | 4 из 4 (тёмная и светлая тема, 1280 и 390 px), 9 проверок в каждом |

Сценарии M44 (`node --test`):

- `autopilot/test/m44-manual-full-real.test.ts` — настоящий бандл 2.4.6, «Полный автопилот»,
  ревью выключено, ручной критерий: квитанции `review`, `choose`, `authorize`, `start`;
  разрешение в плане (`mode full`, `accept false`); поставка запущена по разрешению (источник
  `grant`, не кнопка); на `READY_FOR_ACCEPTANCE` запуск ждёт «Принять план»; после приёмки
  (источник `button`) сам закрывает (источник `grant`) и публикует SHA закрытия.
- `autopilot/test/m40-full-real.test.ts` — полный автопилот без ручных критериев проходит до
  публикации без кнопок (все решения — источник `grant`).
- `autopilot/test/m41-acceptance-real.test.ts` — проверки поставки и ожидание приёмки (M41) не
  сломаны.
- `autopilot/test/runs-grant.test.ts` — отказ разрешения: строка журнала, `blocked` с кодом
  Kit, `pausedFrom` сохраняется; «Продолжить» записывает разрешение; «Повторить» (`run-stale`,
  `run-not-found`, `already`).
- `autopilot/test/prepare-retry.test.ts` — повтор старта, `blocked authorization-missing: <код>`
  после трёх отказов, повторная запись разрешения запущенного плана.
- `autopilot/test/agent-notices.test.ts`, `autopilot/test/run-turns.test.ts` — строки о смене
  Settings и запуска, без дублей; тексты без разрешения — ручные, без «autopilot».
- `cli/test/m44-agent-state.test.ts` — служба на loopback: строка SessionStart для Claude,
  Codex и Kimi; запуск «executing» без разрешения Kit — `NOT authorized`; смена Settings доходит
  до владельца хуком `UserPromptSubmit` один раз; без службы — `unknown`.
- `cli/test/session-start-line.test.ts` — диалекты, недоступная служба, нехватка бюджета,
  URL службы при подставленной платформе `win32` и `linux`.
- `agent-channel/test/session-start-route.test.ts` — маршрут: loopback, 400, нет опции — нет
  маршрута.
- `session-view/test/run-model.test.ts` — модель «не получил разрешения» и «Повторить».

## Ограничение этого плана

Проект Workflow_Kit на Kit 2.4.5: запуск M44 разрешения не получит, поставки T006 и T007,
приёмка и закрытие M44 — кнопками. Полный автопилот с ручным критерием заработает после выпуска
0.20.0 и «Обновить Kit» проекта до 2.4.6.

## Живые проверки по ОС

| ОС | Кто | Что |
| --- | --- | --- |
| macOS | пользователь | новая сессия видит строку `Workflow Kit autopilot: …`; переключение режима в Settings доходит до агента к следующему ходу; следующий план под «Полным автопилотом» проходит поставку, приёмку (кнопкой при ручном критерии) и закрытие |
| Windows x64/ARM64 | проверяющий Windows | строка SessionStart в сессии Claude и ChatGPT (`wfk.cmd`), ASCII без искажений |
| Linux | CI | typecheck, тесты, platform-guard |

Поставка (T006) и CI четырёх платформ (T007) — ниже, по мере выполнения.

## T006 — выпуск 0.20.0

18.11.2026, macOS ARM64: `npm ci` (lock-файл), затем `node bin/wfk.mjs install` — «Workflow
Kit 0.20.0 установлен … (обновление с 0.19.0)», LaunchAgent, служба работает (pid 83767,
версия 0.20.0), «диктовка: helper установлен», удалена старая версия 0.18.0.

`wfk doctor --installed` — «итог: всё в порядке»: установка 0.20.0, зависимости копии `ws`,
helper диктовки 0.20.0, LaunchAgent загружен, `/api/health` — pid 83767, версия 0.20.0,
«ChatGPT: общий доступ к чатам: Работает».

Живой ответ установленной службы на `POST /api/hooks/session-start` для этого проекта (запуск
M44 на Kit 2.4.5 без разрешения):

- Claude: `additionalContext` — `Workflow Kit autopilot: mode=full, review=on;
  run=run-grGmd5VPjbzn NOT authorized (phase executing without a Kit grant). Without a live Kit
  grant every user decision stays manual: follow the next line of the Kit recovery packet.`
- Kimi: та же строка в `{ message }`.

## T007 — CI четырёх платформ

Первая попытка (iteration 1), `bc55f778`, [run 44310031268](https://github.com/OleynikAleksandr/Workflow_Kit/actions/runs/44310031268):
Linux x64, Windows x64 и Windows ARM64 — success; macOS ARM64 — failure дважды (вторая
попытка — повтор упавшего задания): `hook-link.test.ts` «the hook command from settings runs
the linked launcher end to end» — 2982 и 2415 мс при лимите 2000 (до M44 на macOS CI —
0,8–0,9 с). Поставка отложена (`task:defer-delivery`), раунд исправлений R2: T008 (`ac392e05`)
— тест направляет хук не на порт 1, а на свою заглушку на loopback, которая сразу рвёт
соединение; причина медленного хука (`WFK_HOOK_DEBUG`) — в тексте ошибки. DOCS-R2 —
`0be629fb`.

Вторая попытка (iteration 2), `0be629fb`, [run 44361495710](https://github.com/OleynikAleksandr/Workflow_Kit/actions/runs/44361495710):
macOS ARM64, Linux x64, Windows x64, Windows ARM64 — success, точный SHA
`0be629fbcfaffaa926a398d8528c5888c49cc1e0` на `ci/M44-autopilot-grant`.

Замечание: тест хука на macOS CI прошёл за 1884 мс (Linux — 602 мс), запас до лимита 2000 мс
мал. Хук M44 дольше прежнего на macOS CI и без зависшего порта — вероятно, загрузка модулей
строки SessionStart на медленном раннере; разобрать отдельно.
