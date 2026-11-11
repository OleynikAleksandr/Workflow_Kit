# M17: команда `wfk` доступна агентам после обновлений

## Цель и согласование

Живая проверка 0.8.3 на Windows (2026-11-11, проект S002, ChatGPT — агент): Codex не смог
вызвать `wfk session plan` — PowerShell ответил «The term 'wfk' is not recognized», а
`Get-Command wfk*` ничего не нашёл. В терминале пользователя `wfk` находится
(`C:\Users\Pilot\AppData\Local\Workflow Kit\wfk.cmd`), у службы Kit эта папка в PATH есть.

Причина: команды агента выполняет демон Codex (`codex remote-control start`), а он переживает
перезапуски и обновления службы и хранит PATH того момента, когда его запустили. Демон был
запущен в 16:06, раньше папки Kit в PATH службы. При первой установке Kit запоминает PATH
службы (`detectPrograms`) до того, как добавляет каталог `wfk` в PATH пользователя, поэтому
программы, которые запускает такая служба, `wfk` не знают до переустановки. После
`codex remote-control stop` и перезапуска службы демон поднялся заново, и агент пошёл дальше.

Решение пользователя, 2026-11-11: «Да, именно так… А ты начинай. Без остановки.» — три слоя
исправления из обсуждения, `wfk service restart`, выпуск 0.8.4.

## 1. Принципы

- Агент вызывает Kit командой `wfk` (раздел AGENTS.md); хуки по-прежнему вызывают
  запускатель по полному пути.
- Kit не обрывает ходы агентов сам: демон Codex перезапускается только по действию
  пользователя.
- Экземпляр разработки (`WFK_DATA_DIR`) запускателя не имеет — его PATH не меняется.

## 2. Решение

### 2.1. PATH службы всегда содержит каталог `wfk` (`service-installer`, `cli`)

- `launcherDir(layout)` — каталог запускателя (`~/.local/bin`; Windows — каталог данных с
  `wfk.cmd`), `null` у экземпляра разработки.
- Установка добавляет его в конец сохранённого PATH службы (`config.json` `loginPath`,
  LaunchAgent, unit systemd): `mergePath(loginPath, launcherDir)`.
- `wfk serve` при старте дописывает его в конец PATH своего окружения, если его там нет
  (`withLauncherDir(env, platform, homedir)`): так его получают демон Codex, хост Claude и
  сервер Kimi, как бы служба ни была запущена (автозапуск, `wfk service start`, старый
  `config.json`).
- `wfk service restart` — `stop`, затем `start`; печатает оба результата, код выхода — `start`.

### 2.2. Агент вызывает `wfk` и по полному пути (`kit-structure`)

Раздел AGENTS.md получает пункт: если оболочка не находит `wfk`, вызвать его по полному
пути — macOS и Linux `"$HOME/.local/bin/wfk"`; Windows PowerShell
`& "$env:LOCALAPPDATA\Workflow Kit\wfk.cmd"`, Git Bash `"$LOCALAPPDATA/Workflow Kit/wfk"`.
Пути не зависят от компьютера. Существующие проекты получают пункт обновлением структуры в
мастере проекта (раздел `outdated`).

### 2.3. Устаревший демон Codex виден и перезапускается (`provider-codex`)

- После своего `remote-control start` Kit пишет `codex-daemon.json` в каталог состояния:
  `pid` демона и PATH, с которым он запущен.
- Демон устарел, если запись есть и её `pid` не совпадает с работающим демоном (его запустил
  не Kit) или PATH записи не совпадает с текущим PATH службы. Нет записи — не устарел (Kit не
  знает и не мешает).
- Статус ChatGPT для устаревшего демона: подсказка «Демон Codex запущен с прежним окружением:
  агенты могут не находить wfk. Перезапустите демон, когда чаты ChatGPT не работают.» и
  действие «Перезапустить демон» с подтверждением «Перезапустить демон Codex? Ходы ChatGPT,
  которые идут сейчас, прервутся.» (`remote-control stop`, затем `start`).
- Автоматически Kit демон не перезапускает: протокол не даёт надёжного признака, что ни один
  тред не работает.

## 3. Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Каталог `wfk` в PATH службы | `~/.local/bin` | `~/.local/bin` | `%LOCALAPPDATA%\Workflow Kit` (x64 и ARM64) |
| Полный путь в AGENTS.md | `"$HOME/.local/bin/wfk"` | то же | PowerShell и Git Bash |
| Устаревший демон Codex | подсказка и действие | то же | то же |
| `wfk service restart` | `stop` + `start` | то же | то же |

## 4. Проверка

- `service-installer`: `launcherDir` по ОС (ветки `win32` и `linux` с подставленной
  платформой), установка дописывает каталог в `loginPath`, экземпляр разработки — нет.
- `cli`: `withLauncherDir` дописывает каталог один раз (Windows — без учёта регистра, ключ
  `Path`); `wfk service restart` вызывает `stop` и `start`.
- `kit-structure`: раздел AGENTS.md содержит полные пути; старый раздел — `outdated`.
- `provider-codex`: запись после запуска; чужой `pid` или другой PATH — подсказка и
  действие; действие останавливает и запускает демон.
- CI: macOS, Linux, Windows x64 и ARM64.
- Живая проверка на Windows (проверяющий): обновление до 0.8.4, ChatGPT-агент в новом
  проекте вызывает `wfk session plan`; `wfk service restart`.

## 5. Границы

- Приложения, которые пользователь запускает сам (ChatGPT, Kimi Code), получают окружение от
  системы; для них работает полный путь из AGENTS.md.
- Ходы, начатые до обновления раздела AGENTS.md в проекте, видят старый текст.

## 6. План

| Задача | Содержание | Файлы |
| --- | --- | --- |
| T001 | каталог `wfk` в PATH службы, `wfk service restart` | `service-installer`, `cli/src/commands.ts`, `cli/src/service-path.ts`, `module.md` |
| T002 | полный путь `wfk` в AGENTS.md | `kit-structure/src/templates.ts`, тесты, `module.md` |
| T003 | устаревший демон Codex: подсказка и «Перезапустить демон» | `provider-codex`, `module.md` |
| T004 | Выпуск 0.8.4 | версии, `CHANGELOG.md`, `docs/evidence/M17-acceptance.md` |
