# Приёмка M17 — команда `wfk` у агентов после обновлений, релиз 0.8.4 (2026-11-11)

- Спецификация: [M17-wfk-on-agent-path.md](../planning/M17-wfk-on-agent-path.md); scope
  `m17-wfk-on-agent-path`, режим `sequential`.
- Причина: живая проверка 0.8.3 на Windows (проект S002, ChatGPT — агент). Codex не нашёл
  `wfk` («The term 'wfk' is not recognized», `Get-Command wfk*` пуст): демон Codex, запущенный
  в 16:06, пережил обновление службы и хранил PATH без каталога Kit. После
  `codex remote-control stop` и перезапуска службы демон поднялся заново, агент продолжил —
  причина подтверждена.
- Пользователь, 2026-11-11: «Да, именно так… А ты начинай. Без остановки. Если нужно будет, я
  тебя остановлю.»
- Что сделано:
  - T001 `bd9a586` — `launcherDir`, каталог `wfk` в PATH службы при установке и в `wfk serve`,
    `wfk service restart`.
  - T002 `fd85a1f` — раздел AGENTS.md называет полный путь `wfk` (macOS/Linux, PowerShell,
    Git Bash).
  - T003 `647ca04` — запись `codex-daemon.json`; устаревший демон — подсказка и «Перезапустить
    демон».
  - DOCS `1a5eb81` — OVERVIEW, спецификация, README, дайджест.

## Проверки релиза

- Локально (macOS): `npm test` — 651 тест, 650 прошли, 1 пропущен (не для macOS); проверка
  типов и `check:platforms` — ok.
- Тесты: `withLauncherDir` на macOS, Linux и Windows (`Path`, без учёта регистра), экземпляр
  разработки без каталога; установка пишет каталог в `loginPath`, LaunchAgent и `config.json`
  Windows; `wfk service restart`; раздел AGENTS.md и его обновление из `outdated`; устаревший
  демон: чужой `pid`, прежний PATH, перезапуск пишет новую запись, без записи — не устарел.
- `node bin/wfk.mjs install` (обновление с 0.8.3) и `wfk doctor --installed` — «всё в
  порядке», служба 0.8.4; PATH LaunchAgent содержит `~/.local/bin`.
- CI ветки `ci/m17-wfk-on-agent-path`, коммит `a9af920`, запуск 43076995815 — зелёный с первой
  попытки: macOS ARM64, Linux x64, Windows x64, Windows ARM64.

## Живые проверки по ОС

| ОС | Кто | Что проверить | Результат |
| --- | --- | --- | --- |
| Windows 11 | проверяющий на Windows | обновление до 0.8.4; ChatGPT-агент в новом проекте вызывает `wfk session plan`; `wfk service restart` | ожидается |
| macOS | пользователь | то же для ChatGPT и Claude | ожидается |
| Linux | CI | тесты | см. CI |
