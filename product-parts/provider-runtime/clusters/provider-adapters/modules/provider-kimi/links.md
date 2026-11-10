# provider-kimi: ссылки, приложение и Remote Control

Часть контракта модуля [provider-kimi](module.md), спецификация M8, раздел
2.6. Код — `src/app-link.ts`, `src/remote.ts`, `sessionLinks` в
`src/session-list.ts`.

## Ссылки сессии

Ссылки на одну сессию у Kimi нет, поэтому сессия ведёт к своему проекту.

- `links.desktop` = `kimi-code://open?root=<папка проекта>`
  (`kimiProjectLink(folder, fresh)`, папка — `project.path`,
  `encodeURIComponent`; `fresh` добавляет `&new=1`). Ссылка есть только
  когда приложение Kimi Code найдено.
- Приложения нет — ссылки нет, а пометка сессии заканчивается строкой
  `resumeNote(id)`: «продолжить: `kimi -S <id>` в терминале проекта»
  (после остальных пометок, через «; »).
- `links.mobile` — адрес Remote Control сервера, с которым говорит Kit
  (сервер приложения Kimi Code или сервер Kit, [server.md](server.md)), и только точного вида
  `https://code-rc.kimi.com/devices/<id>/` (`parseRemote`); другой адрес в
  ответе Kimi ссылкой не становится.
- `parseKimiProjectLink(url)` → `{ root, fresh } | null`: ровно один `root`,
  необязательный `new=1`, без других параметров, `#` и управляющих знаков,
  не длиннее 4096 знаков. Им пользуется `cli` (`POST /api/open-link`).

## Проверка приложения

`kimiAppFound(check)` не бросает; внешние программы запускаются только
здесь и только из `refresh()` провайдера («Перепроверить», запуск службы).
До первого `refresh()` ответ неизвестен (`runtime.appFound()` → `null`): ни
ссылки, ни пометки. Подмена для тестов — `KimiDeps.appFound`.

| | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Признак приложения | папка `Kimi Code.app` в `/Applications` или `~/Applications` (`stat`, без программы) | непустой ответ `xdg-mime query default x-scheme-handler/kimi-code` | `%SystemRoot%\System32\reg.exe query` ключа `HKCU\Software\Classes\kimi-code`, затем `HKCR\kimi-code` (код 0) |
| Программы нет, таймаут 5 с, ненулевой код | — | приложения нет | приложения нет |

## Remote Control

Пока работает сервер приложения Kimi Code, действия ниже выключены
(`APP_SERVER_REASON`), а состояние только читается у него.

`createKimiRemote({ current, requireServer, now, version })`:

- Состояние читается только у уже работающего сервера Kit:
  `GET /api/v1/remote-control` (таймаут 3 с), ответ хранится
  `REMOTE_CACHE_MS` (5 с). Сервера нет, маршрута нет (старый Kimi) или
  ответ не разобран — Remote Control считается выключенным, ссылки нет.
- Действия провайдера (`scope: 'provider'`, с подтверждением):
  `kimi-remote` «Включить Remote Control Kimi» и `kimi-remote-off`
  «Выключить Remote Control Kimi» — `POST /api/v1/remote-control
  { enabled }`. Оба всегда в списке; доступно то, что меняет состояние
  (причины «Remote Control Kimi уже включён» / «…выключен»). Включение
  запускает сервер, если он не работает; выключение без сервера недоступно.
- Код `40928` → `ProviderError` `kimi-remote-busy` (409) и пометка статуса
  провайдера `REMOTE_BUSY_NOTE` «Remote Control уже ведёт другое приложение
  Kimi» — до удачного включения или «Перепроверить». Поле `conflict` в
  ответе `GET` даёт ту же пометку, пока конфликт длится. Другой отказ —
  `kimi-remote` с текстом Kimi.
- Порядок действий провайдера: `restart-kimi-server`, `kimi-remote`,
  `kimi-remote-off`, `remove-kimi-hook`.
- Вход в Kimi и Remote Control приложения пользователя Kit не меняет: речь
  только о сервере, который запустил Kit.
