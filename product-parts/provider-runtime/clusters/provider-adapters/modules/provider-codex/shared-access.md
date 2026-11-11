# provider-codex: общий доступ к чатам (M12, раздел 2.2)

`src/shared-access.ts` (и чистые функции текста в `src/shared-files.ts`), поле провайдера `sharedAccess` (контракт `SharedAccess`). Приложение
ChatGPT подключается к этому Mac по SSH (`wfk-local`) и через `codex app-server proxy`
становится клиентом демона Kit; Kit пишет всё, что может, после предпросмотра.

- `state(force)` на macOS по порядку (Windows — раздел ниже, Linux — `unsupported`): нет `codex` или
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

## Windows (M13)

Проверки — `src/shared-windows.ts`, `diagnoseWindows` (только чтение): один вызов PowerShell
(`WINDOWS_PROBE_SCRIPT`: служба `sshd`, `HKLM\SOFTWARE\OpenSSH\DefaultShell`, пакет
`OpenAI.Codex`, процессы `ssh.exe` и `codex.exe` через CIM), `ssh.exe` в PATH, `sh.exe` Git for
Windows (рядом с `git.exe` или в Program Files), `Host wfk-local`, SSH-проверка
(`SSH_CHECK_COMMAND`) при работающем `sshd`, оболочке Git и `Host`, подключение приложения
(`isWindowsSharedConnection`) и второй app-server. `windowsVerdict` по порядку: нет `codex`,
приложения, `ssh.exe` или Git → `unsupported`; PowerShell молчит → `broken`; есть записи →
`not-configured`; `sshd` не работает или `DefaultShell` не Git → `needs-admin-setup`;
администратору отказано в ключе (`Permission denied`) → `needs-admin-setup`; иная неудача
SSH-сеанса или второй app-server → `broken`; иначе подключение решает, как на macOS
(`needs-connection` / `active`). Подсказка заканчивается `checksText`: «Проверено: … Не
прошло: … Не проверено: …» (её же печатает `wfk doctor`). Шаги пробы —
`docs/evidence/M13-windows-probe.md`.

Настройка — `src/shared-plan.ts` (общий план) и `src/shared-windows-setup.ts`: ключ, блок
`Host` и профиль Git Bash (`~/.bash_profile` или первый существующий login-профиль; `PATH` в
записи Git Bash, `toGitBashPath`); строка в `~/.ssh/authorized_keys` — только у обычного
пользователя. Администратор определяется по `whoami /groups` (S-1-5-32-544, кешируется): ему
ключ дописывает скрипт. Скрипт `<state>/shared-access-admin.ps1` (`adminScript`, UTF-8 с BOM,
CRLF, только ASCII) Kit пишет, но не запускает: `Add-WindowsCapability OpenSSH.Server`, если
службы нет; автозапуск и запуск `sshd`; `DefaultShell` = `sh.exe` Git; у администратора —
строка ключа в `%ProgramData%\ssh\administrators_authorized_keys` и `icacls` (только
`Administrators` и `SYSTEM`). Поле состояния `admin` (`SharedAccessAdminStep`): `purpose`,
`file`, `command` (`powershell -NoProfile -ExecutionPolicy Bypass -File "…"`), `text`.
`remove()` убирает записи Kit и скрипт, а вместо него пишет `shared-access-admin-undo.ps1`
(`adminRollbackScript`: снимает `DefaultShell`, если он тот же, и строку ключа; `sshd`
остаётся); новая настройка удаляет скрипт отката. `open('connections')` — PowerShell и пакет
`OpenAI.Codex` (`openInAppScript`), `open('remote-login')` → `not-supported`.

Сессии на Windows — общий код M12 без веток ОС: режим включает то же состояние `active`
(`createSharedMode`), ссылки с `hostId` открывает служба (`open-link`, ссылка целиком одним
аргументом PowerShell), создание без выгрузки, `wakeSession`, ревьюер первым сообщением.
`isSecondAppServer` разбирает и командные строки CIM (пути в кавычках); собственный
app-server приложения — в пакете `WindowsApps\OpenAI.Codex…` — вторым не считается.

| macOS | Linux | Windows |
|---|---|---|
| полная настройка, «Удалённый вход» — пользователь | `unsupported`: приложения ChatGPT нет; ничего не пишется | проверки, настройка Kit и скрипт администратора, который запускает пользователь; `active` после проверок |
