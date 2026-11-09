# M5: подготовка ВМ Windows 11 ARM в UTM для проверки

Порядок для машины «WebPilot-Test-Windows11» (QEMU ARM). Перед началом — снимок ВМ в UTM, чтобы
вернуться к чистому состоянию. Всё ставится от обычного пользователя, **без** «Запуск от имени
администратора» (демон Codex не работает из процесса с повышенными правами).

## 1. Общая папка Mac ↔ Windows

UTM передаёт папку в Windows-гостя через SPICE WebDAV.

1. Mac, UTM: ВМ выключена → «Изменить» → «Общий доступ» → режим «SPICE WebDAV» → «Общая папка» —
   выбрать папку обмена (например, `~/VMShare`). Не давать в общий доступ сам репозиторий.
2. Windows: установить **UTM Guest Tools** (образ `utm-guest-tools-*.iso` со страницы
   https://mac.getutm.app/guest-support/ или из меню UTM «CD/DVD» → «Установить гостевые
   инструменты Windows»), перезагрузить. В составе — драйверы SPICE и служба WebDAV.
3. Windows: проверить, что служба «Spice webdav proxy» запущена; папка появится сетевым диском
   (обычно `Z:`). Если диска нет — запустить «map drive» из меню «Пуск» → UTM, либо подключить
   вручную `\\localhost@9843\DavWWWRoot`.
4. Код с сетевого диска **не запускать**: копировать в локальную папку, например
   `robocopy Z:\Workflow_Kit %USERPROFILE%\src\Workflow_Kit /MIR /XD node_modules .git\objects`
   (или, проще, архив `git archive` на Mac → распаковать в Windows).

Запасной путь без общей папки: на Mac включить «Удалённый вход» (SSH) и в Windows выполнить
`git clone ssh://<пользователь>@<IP Mac>/Users/<пользователь>/VSCODE/Workflow_Kit` — Git for
Windows включает SSH-клиент. Ветку с непроверенной работой на GitHub не публикуем (публикация —
после закрытия scope).

## 2. Программы (ARM64-версии)

| Программа | Как поставить | Проверка |
| --- | --- | --- |
| Node.js 24 ARM64 | MSI `node-v24.*-arm64.msi` с nodejs.org | `node -p "process.arch"` → `arm64` |
| Git for Windows ARM64 | установщик с git-scm.com (ARM64) | `git --version` |
| Claude Code | PowerShell: `irm https://claude.ai/install.ps1 \| iex` | `claude --version`, вход `claude` → `/login` |
| Claude Desktop ARM64 | установщик с claude.ai/download | вход в аккаунт, раздел Code |
| Codex CLI | PowerShell: `irm https://chatgpt.com/codex/install.ps1 \| iex` | `codex --version` (≥ 0.160), `codex login` |
| Приложение ChatGPT/Codex | Microsoft Store (`OpenAI.Codex`) | вход в аккаунт |

После установки — новый терминал (PATH обновляется). Git: `git config --global user.name` и
`user.email` — личность задаёт пользователь сам.

## 3. Workflow Kit

```powershell
cd $env:USERPROFILE\src\Workflow_Kit
npm ci
node bin/wfk.mjs install
wfk doctor --installed
```

Панель откроется в окне Edge (`http://127.0.0.1:4747`). Для проверки с Mac по сети ВМ панель
доступна только при включённом удалённом доступе в настройках Workflow Kit.

## 4. Что проверяем

Таблица раздела 9 [спецификации](M5-windows.md): мастер с Claude и с ChatGPT, сессии, вопрос о
плане и ревью в обе стороны, выполнение плана, автопилот, архив. Пункты, помеченные в
спецификации **П**, — отдельно, с записью результата в `docs/evidence/M5-acceptance.md`.

Если что-то не так — журналы службы: `%LOCALAPPDATA%\Workflow Kit\…\logs` (путь покажет
`wfk doctor --installed`).
