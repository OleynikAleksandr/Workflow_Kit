# Приёмка M5 — Windows 11, релиз 0.5.0 (2026-11-09)

- Спецификация: [M5-windows.md](../planning/M5-windows.md); scope `m5-windows`, задачи T001–T008.
- Что сделано: ConPTY-хост сессий Claude (`pty-host`, node-pty 1.1.0 для win32-x64 и win32-arm64),
  управление процессами на Windows (CIM, `taskkill`), Codex через `codex app-server proxy`,
  хуки Kit и запускатели `wfk`/`wfk.mjs` на Windows, открытие чатов, штатная остановка службы,
  предупреждение о правах администратора, документация.

## Автоматические проверки (macOS)

- Полный прогон `npm test`: 391 тест, 391 пройден. Ветки Windows проверены с подставным
  терминалом, подставными командами ОС и путями Windows: маркеры хоста (`SESSION_URL`,
  `FIRST_MESSAGE_SENT`, `RENAMED`, `WOKEN`, `DIALOG`, `ENV_READY` и др.), ключи `.claude.json` и
  `config.toml`, FILETIME из `daemon.pid`, поиск `codex.exe`, хуки (exec-форма и
  `commandWindows`), установщик (`wfk`, `wfk.mjs`, остановка через API, предупреждение о правах),
  `open-link` и `POST /api/system/shutdown`.
- Проверка типов и проверки Kit (размер файлов и документов, контракты модулей) — при каждом коммите.
- Транспорт `codex app-server proxy`: на этом Mac WebSocket-клиент Kit поверх stdio прокси прошёл
  `initialize` с настоящим демоном Codex 0.167 и получил `remoteControl/status/changed`
  (`connected`). Это подтверждает, что прокси пересылает байты, и наш клиент работает поверх него.
- `node bin/wfk.mjs install` и `wfk doctor --installed` на macOS: итог «всё в порядке», служба 0.5.0;
  в установленной копии есть `vendor/node-pty-1.1.0` с обеими сборками и Windows-хост.

## Живая проверка Windows

Решение пользователя от 9 ноября: проверка на ВМ откладывается, релиз публикуется, и таблицу
паритета (раздел 9 спецификации) проверяет пользователь со знакомым на реальном компьютере с
Windows. Пункты **П** спецификации ещё не подтверждены:

- какой ключ проекта Claude Code пишет в `.claude.json` на Windows;
- передача входа хука Codex через PowerShell (`[Console]::In.ReadToEnd() | & node …`);
- открытие `claude://…/session_…` в Claude Desktop и `codex://threads/…` через приложение `OpenAI.Codex`;
- показ тредов демона приложением ChatGPT на Windows, пути `logs_<N>.sqlite` и `sqlite\codex.db`;
- задержка запуска ConPTY и экран Claude под ConPTY (шаблоны ссылки и диалогов).

Найденные проблемы становятся раундом исправлений этого или следующего scope.
