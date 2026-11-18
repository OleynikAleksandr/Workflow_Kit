# M43: удалённое управление ChatGPT у демона Kit — доказательства

Спецификация: [M43](../planning/M43-codex-remote-owner.md).

## Диагностика (18.11.2026, macOS, ChatGPT 26.1106, демон Codex 0.170.0)

- Процессы: демон `95747` (`codex app-server --remote-control --listen unix:// --managed-daemon`,
  запущен 05:02 самообновлением `pid-update-loop`), встроенный сервер ChatGPT `33076`
  (`/Applications/ChatGPT.app/…/codex … app-server`, с 15.11), SSH-подключение `wfk-local`
  (`codex app-server proxy`).
- `~/.codex/logs_2.sqlite`, демон: `HTTP error: 409 Conflict … "Remote app server already
  online"` — 472 попытки переподключения; у предыдущего демона `82581` (с 04:40) — то же.
- Сервер ChatGPT, 07:49:36: клиент `codex_chatgpt_ios_remote`, `thread/resume` треда
  `01a1ed6a…` (создан Kit в демоне в 07:49:30) → `thread-store conflict: thread … already has
  an active writer` — надпись iPad «Эта задача используется в другом сеансе Codex».
- Bundle id ChatGPT для Mac: `com.openai.codex` (`CFBundleIdentifier`).

## T001 — возврат удалённого управления демону

Команды (macOS, Node 24):

| Команда | Результат |
| --- | --- |
| `npm run typecheck` | без ошибок |
| `node --test …/provider-codex/test/reclaim.test.ts` | 11 из 11 |
| `node --test …/provider-codex/test/*.test.ts` | 235 из 235 |
| `npm run test:app` | 1416 пройдено, 0 провалов (1418 всего) |
| `npm run test:kit` | 78 из 78 |
| `npm run check:platforms` | `platform-guard: ok` |

Покрыто тестами (`reclaim.test.ts`, `provider-reclaim.test.ts`, `shared-mode.test.ts`):

- darwin: штатный выход, толчок демона, `connected`, новый запуск — `reclaimed`; команды по
  умолчанию — `osascript -e tell application id "com.openai.codex" to quit`,
  `codex remote-control start --json`, `open -g -b com.openai.codex`;
- приложение не вышло — `app-kept`, без толчка и без нового запуска, повтор только для нового
  pid; демон не подключился — `not-connected`, приложение всё равно открыто снова, попытки
  стоят до свободного демона; лимит 3 за час, ручной вызов его сбрасывает; один возврат
  одновременно; без приложения, без codex, при остановленном демоне — ничего;
- `createSession` при `remoteOwner: 'app'` создаёт тред и запускает возврат без ожидания
  (`quit`, `nudge`, `open` на подставной системе); статус `APP_OWNER_NOTE`, действие
  `reclaim-remote` «Вернуть управление Kit» с подтверждением;
- win32 и linux с подставленной платформой: ни одной команды; `reclaimAction` — выключено с
  причиной на Windows, нет на Linux; `appOwnerNote` — подсказка закрыть вручную.

Тесты не трогают настоящее приложение: системные шаги подставлены (после прогона ChatGPT
работает с тем же pid).

## Живые проверки по ОС

| ОС | Кто | Что | Статус |
| --- | --- | --- | --- |
| macOS + iPad | пользователь | ChatGPT держит управление → создать сессию ChatGPT в панели → ≤ 2 мин ChatGPT перезапускается, «демон подключён», чат Kit открывается и пишется на iPad | ожидает |
| Windows x64/ARM64 | проверяющий | при занятом приложением слоте — подсказка закрыть вручную, действие выключено | ожидает |
| Linux | CI | только автоматические тесты | пройдено (T003) |

## T002 — выпуск 0.19.0

18.11.2026, macOS ARM64: `npm ci` (lock-файл), затем `node bin/wfk.mjs install` — «Workflow
Kit 0.19.0 установлен … (обновление с 0.18.0)», LaunchAgent, служба работает (pid 63500,
версия 0.19.0), «диктовка: helper установлен», удалена старая версия 0.17.0.

`wfk doctor --installed` — «итог: всё в порядке»: установка 0.19.0, зависимости копии `ws`,
helper диктовки 0.19.0, LaunchAgent загружен, `/api/health` — версия 0.19.0, «ChatGPT: общий
доступ к чатам: Работает».

Сразу после установки статус провайдера ChatGPT: «через приложение ChatGPT», note
`APP_OWNER_NOTE`, демон `95747` `remoteControl: errored` (слот с утра у сервера ChatGPT `33076`,
приложение `32807`).

Живой возврат установленной службой 0.19.0 (минутная проверка, без действий пользователя):

| Время | Что |
| --- | --- |
| 09:05:21 | «через приложение ChatGPT», демон `errored` |
| 09:06:02 | статус «возвращает управление Kit» |
| 09:06:06 | приложение `32807` вышло |
| 09:06:07 | демон `95747` «демон подключён» (`connected`), ChatGPT снова запущен — pid `64596`, его сервер `64678` |
| 09:06:14 | сервер приложения `64678`: `409 Conflict … "Remote app server already online"` — слот у демона |

Итого от начала возврата до подключения демона — 5 секунд. Проверка на iPad (критерий 4) —
за пользователем.

## T003 — CI четырёх платформ

Ветка `ci/M43-codex-remote-owner`, точный SHA `56478f28411a5aeb950d3e7def1272a76d5b68e4`
(выпуск 0.19.0), запуск
[44265081796](https://github.com/OleynikAleksandr/Workflow_Kit/actions/runs/44265081796) —
`success`:

| Задание | Результат |
| --- | --- |
| macOS ARM64 | success |
| Linux x64 | success |
| Windows x64 | success |
| Windows ARM64 | success (≈ 23 мин, как в M41) |
