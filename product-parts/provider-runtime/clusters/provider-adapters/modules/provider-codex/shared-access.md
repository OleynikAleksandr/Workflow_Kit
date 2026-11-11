# provider-codex: общий доступ к чатам (M12, раздел 2.2)

`src/shared-access.ts` (и чистые функции текста в `src/shared-files.ts`), поле провайдера `sharedAccess` (контракт `SharedAccess`). Приложение
ChatGPT подключается к этому Mac по SSH (`wfk-local`) и через `codex app-server proxy`
становится клиентом демона Kit; Kit пишет всё, что может, после предпросмотра.

- `state(force)` по порядку: ОС не macOS → `unsupported`; нет `codex` или
  `/Applications/ChatGPT.app` → `unsupported`; в предпросмотре есть записи →
  `not-configured`; порт 22 на 127.0.0.1 молчит → `needs-remote-login`; проверка
  `ssh -F ~/.ssh/config -o BatchMode=yes wfk-local` с `SSH_CHECK_COMMAND` (та же
  login-оболочка `$SHELL -l -i -c`, что запускает приложение) не нашла `codex` или
  `CODEX_SSH_SKIP_APP_SERVER_BOOT=true` → `broken`; приложение ни разу не было подключено →
  `needs-connection`; иначе `active`. Подключение — строка `ps` с `ssh`, `wfk-local` и
  `app-server proxy` (`isSharedConnection`); первый раз записывается в
  `<state>/codex-shared-access.json` (`connectionSeenAt`). Результат живёт
  `SHARED_TTL_MS` (60 с); `maintain()` после передачи управления обновляет его, статус
  провайдера отдаёт `details.sharedAccess` (`cached()`), без новых проверок.
- `preview()` → записи, токен (`shared-access`, отпечаток — содержимое всех файлов) и
  заметки: ключ `~/.ssh/wfk_local` (`ssh-keygen -t ed25519 -N ""`, есть — не трогается),
  строка `from="127.0.0.1,::1" ssh-ed25519 … workflow-kit` в `authorized_keys` (строки того
  же ключа без ограничения убираются), блок `Host wfk-local` в начале `~/.ssh/config`
  (`HostKeyAlias wfk-local`, `StrictHostKeyChecking accept-new`), блок профиля в конце:
  zsh — `~/.zshenv`, bash — первый из `~/.bash_profile`, `~/.bash_login`, `~/.profile`
  (нет ни одного — `~/.bash_profile`), другая оболочка — `manualProfile` для ручной
  вставки. Блоки — между `# >>> workflow-kit >>>` и `# <<< workflow-kit <<<`. Ручной `Host
  wfk-local` и блок `# Workflow Kit probe:` пробы 2026-11-11 заменяются (заметка).
- `apply(token)`: токен и отпечаток (иначе `invalid-token` / `preview-stale`), `~/.ssh`
  700, ключ, копии (`backupFile`) и запись с правами 600, проверка, что записей больше нет
  (`verify-failed`), затем `state(true)`. Повтор ничего не пишет.
- `remove()`: копии, блоки и строки ключа убираются, файлы ключа удаляются,
  `connectionSeenAt` сбрасывается. Подключение в ChatGPT и «Удалённый вход» пользователь
  выключает сам.
- `open(target)`: `open codex://settings/connections/ssh` (страница «Подключения → SSH»;
  приложение само находит `wfk-local` в `~/.ssh/config`) или
  `open x-apple.systempreferences:com.apple.Sharing-Settings.extension`.

Проба ссылок 2026-11-11 (ChatGPT 26.1106): `codex://settings/connections/ssh/add?alias=…`
только выводит приложение на передний план (настройки с параметрами внешняя ссылка не
открывает), форма `https://chatgpt.com/codex/open-app` цели `settings` не знает; работает
только `codex://settings/connections/ssh` — Kit открывает её, дальше пользователь включает
`wfk-local`. Приложение запускает по SSH `sh -c` → `exec "$SHELL" -l -i -c …`.

## Сессии в режиме общего демона (раздел 2.3)

`createSharedMode(shared)`: `active()` — последняя проверка доступа дала `active`,
`refresh()` — проверка, если прошлой больше `SHARED_TTL_MS`. В режиме:

- ссылки — `sharedThreadLinks(id)`: `desktop` =
  `codex://threads/<id>?hostId=remote-ssh-discovered%3Awfk-local` (без `hostId` Mac открывает
  локальную копию, где ввод заблокирован), `mobile` — без `hostId`;
- `createSession`: `thread/start`, имя, первый ход, `thread/unsubscribe` — и всё: ни ожидания
  `turn/completed`, ни `thread/archive` + `unarchive`, ни `thread/loaded/list`; заметки
  `HELD_NOTE` и `BUSY_NOTE` нет (чат открывается и во время хода);
- `wakeSession(project, id)` → `wakeThread`: `thread/resume`, если демон не держит тред,
  `turn/start` с `WAKE_TEXT`, `thread/unsubscribe`; очередь отдаёт хук `UserPromptSubmit`. Вне
  режима — `false` (бэкенд будит только простаивающую сессию);
- `reviewBrief: 'first-message'` всегда: ревьюер получает задание первым сообщением
  (`detached`, M4 11.1), хотя `wakeSession` есть;
- передача управления (`handover.ts`) пропускается: удалённое управление остаётся у демона. Если
  его держит приложение (`remoteOwner: 'app'`), статус провайдера даёт `appOwnerNote` →
  `SHARED_APP_OWNER_REASON` («закройте ChatGPT, дождитесь «подключён» и откройте снова»);
- самопроверка: `maintain()` раз в минуту обновляет состояние; второй app-server приложения
  (`isSecondAppServer`: `app-server --listen` с `code_mode_host` вне `ChatGPT.app`) или любая
  неудачная проверка дают `broken` — режим выключается сам, сессии идут прежним путём, и
  включается снова, когда проверки проходят.

| macOS | Linux | Windows |
|---|---|---|
| полная настройка | `unsupported`: приложения ChatGPT нет; ничего не пишется | `unsupported`: OpenSSH-сервер и `$SHELL` не проверены; ничего не пишется |
