# Проба M13 — общий доступ ChatGPT на Windows (для проверяющего на Windows)

Цель — живая проверка [спецификации M13](../planning/M13-windows-shared-daemon.md) на Windows 11
(x64 или ARM64). Нужны Workflow Kit 0.8.0, Codex CLI 0.160+, приложение ChatGPT из Microsoft
Store и Git for Windows. Основной путь — раздел A: настройка средствами Kit. Если какой-то шаг
не проходит, ручные шаги 1–5 ниже помогают найти, что именно не работает. Результат каждого
шага запишите в таблицу в конце (вывод команды или снимок экрана).

## A. Настройка средствами Kit (0.8.0)

1. Обычный PowerShell: `wfk doctor`. Строка «ChatGPT: общий доступ к чатам» — «Не настроено»,
   строка «ChatGPT: проверки общего доступа» перечисляет, что прошло, что нет.
2. Панель → «Настройки» → «Общий доступ к чатам · ChatGPT» → «Настроить». В списке записей —
   `wfk_local`, `config`, `.bash_profile`, `shared-access-admin.ps1` и (если вы не
   администратор) `authorized_keys`. «Записать».
3. Карточка — «Нужен шаг администратора». «Показать скрипт» — прочитайте текст.
   «Скопировать команду запуска», откройте PowerShell **от имени администратора**, вставьте и
   выполните. Затем «Перепроверить».
4. Карточка — «Нужно подключение в ChatGPT». «Открыть подключения ChatGPT» → включите
   `wfk-local`; закройте ChatGPT и откройте снова. «Перепроверить» → «Работает».
5. Создайте в панели сессию ChatGPT, щёлкните её: чат открывается в ChatGPT на Windows (со
   значком глобуса). Напишите в нём, затем откройте тот же чат на iPad и напишите там.
6. Запустите ревью плана с ревьюером ChatGPT: кнопка «Открыть чат ревьюера» открывает его чат.
7. «Убрать настройку»: карточка — «Не настроено» и «Показать скрипт отката»; выполните команду
   отката от имени администратора; выключите `wfk-local` в ChatGPT.

## 0. Что видит Kit

В обычном PowerShell:

```powershell
wfk doctor
```

Строка «ChatGPT: проверки общего доступа» перечисляет, что прошло, что нет и что не проверено.
Её же показывает карточка «Настройки» → «Общий доступ к чатам · ChatGPT».

## 1. Есть ли SSH-подключения в приложении ChatGPT

Откройте ChatGPT → Настройки → Подключения. Есть ли вкладка **SSH** и кнопка «Добавить»?
Если нет — дальше идти незачем: запишите версию приложения и закончите пробу.

## 2. Сервер OpenSSH с оболочкой Git (PowerShell **от имени администратора**)

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Program Files\Git\bin\sh.exe' -PropertyType String -Force
```

Путь к `sh.exe` поправьте, если Git стоит в другом месте.

## 3. Ключ и подключение `wfk-local` (обычный PowerShell)

```powershell
ssh-keygen -t ed25519 -N '""' -C "wfk-local probe" -f $HOME\.ssh\wfk_local
Add-Content $HOME\.ssh\config "`nHost wfk-local`n  HostName 127.0.0.1`n  User $env:USERNAME`n  IdentityFile ~/.ssh/wfk_local`n  IdentitiesOnly yes`n"
```

Строку ключа добавьте:

- **обычный пользователь** — в `$HOME\.ssh\authorized_keys`:
  `Get-Content $HOME\.ssh\wfk_local.pub | Add-Content $HOME\.ssh\authorized_keys`;
- **администратор** (PowerShell от имени администратора) — в
  `C:\ProgramData\ssh\administrators_authorized_keys`, затем
  `icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"`.

Проверка:

```powershell
ssh wfk-local 'echo "$SHELL"; command -v codex; uname -s'
```

Запишите вывод: какая `$SHELL`, найден ли `codex`.

## 4. Переключатель для SSH-сеанса (Git Bash)

В Git Bash добавьте в `~/.bash_profile` (путь к папке `codex.exe` — из `where codex` в PowerShell,
в виде `/c/...`):

```sh
case "${SSH_CONNECTION:-}" in
  "127.0.0.1 "*|"::1 "*)
    export PATH="/c/Users/<вы>/AppData/Roaming/npm:$PATH"
    export CODEX_SSH_SKIP_APP_SERVER_BOOT=true
    ;;
esac
```

Проверка: `ssh wfk-local 'exec "$SHELL" -l -i -c "command -v codex; echo $CODEX_SSH_SKIP_APP_SERVER_BOOT"'`
— путь к `codex` и `true`.

## 5. Подключение в ChatGPT и общий чат

1. ChatGPT → Настройки → Подключения → SSH: виден ли `wfk-local` сам? Включите его.
2. Снова `wfk doctor`: «подключение ChatGPT» должно стать пройденным, «второй app-server» не
   должен появиться.
3. В панели Kit создайте сессию ChatGPT. Откройте в ChatGPT на Windows чат с её именем **со
   значком глобуса** и напишите в нём. Откройте тот же чат на iPad.
4. Запишите: видна ли переписка в обоих местах, можно ли писать с обоих.

## Откат пробы

PowerShell от имени администратора: `Stop-Service sshd; Set-Service sshd -StartupType Manual;
Remove-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell`. Удалите блок
`Host wfk-local` из `~/.ssh/config`, строку `wfk-local probe` из файла ключей, файлы
`~/.ssh/wfk_local*` и блок из `~/.bash_profile`; выключите `wfk-local` в ChatGPT.

## Результаты

| Шаг | Результат | Вывод или снимок |
| --- | --- | --- |
| A2. предпросмотр и запись | не проверено | |
| A3. скрипт администратора | не проверено | |
| A4. подключение, «Работает» | не проверено | |
| A5. общий чат Windows + iPad | не проверено | |
| A6. чат ревьюера | не проверено | |
| A7. удаление и откат | не проверено | |
| 0. `wfk doctor` | не проверено | |
| 1. SSH в ChatGPT для Windows | не проверено | |
| 2. sshd и DefaultShell | не проверено | |
| 3. `ssh wfk-local`: `$SHELL`, `codex` | не проверено | |
| 4. login-оболочка: `codex` и переключатель | не проверено | |
| 5. общий чат Windows + iPad | не проверено | |
