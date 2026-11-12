# Установка Workflow Kit шаг за шагом

Пошаговая установка для новичка. Краткое описание приложения — в [README](../README.md),
справочник по службе, каталогам данных, обновлению и диагностике — в
[руководстве по установке](installation.md); что делать после установки —
[работа с Workflow Kit](usage.md).

Пройдите шаги по порядку. **Сначала ставятся программы провайдеров, потом сам Workflow Kit**:
при установке Kit запоминает, какие программы нашёл. Займёт около получаса.

## Как это устроено

Задачу вы даёте агенту в чате его сессии в родном приложении провайдера: на компьютере — в
Claude Desktop, ChatGPT или Kimi Code, на iPad и телефоне — в приложениях Claude и ChatGPT или
в браузере для Kimi. Панель Kit создаёт сессию, открывает её в приложении и показывает план,
ревью, кнопки решений и диалог сессии.

Сам агент работает на компьютере **программой командной строки** провайдера: `claude`,
`codex` или `kimi`. Приложения её **не ставят**, а их встроенной копией Kit пользоваться не
может. Поэтому ставьте **и программу, и приложение** и войдите в обе под одним аккаунтом; Kit
их не скачивает и не авторизует.

## Как пользоваться терминалом

Почти все шаги — команды в терминале:

- **macOS:** нажмите `Cmd + Пробел`, введите «Терминал», нажмите Enter.
- **Windows 11:** меню «Пуск» → введите «PowerShell» → откройте **Windows PowerShell**. Не
  выбирайте «Запуск от имени администратора».
- **Linux:** откройте терминал вашего дистрибутива.

Вводите команды по одной и нажимайте Enter. **После установки каждой программы закройте
терминал и откройте новый**: новая команда видна только в новом окне. Не ставьте ничего
через `sudo`, кроме пакетов Linux в шаге 2.

## Шаг 1. Выберите провайдеров

Нужен хотя бы один провайдер с подходящей подпиской:

| Провайдер | Аккаунт | Программа | Приложение на компьютере | iPad и телефон |
| --- | --- | --- | --- | --- |
| Claude | подписка Pro, Max, Team, Enterprise или аккаунт Console | Claude Code (`claude`) 2.1.0+ | [Claude Desktop](https://claude.com/download) | приложение Claude: [App Store](https://apps.apple.com/app/claude-by-anthropic/id6473753684), [Google Play](https://play.google.com/store/apps/details?id=com.anthropic.claude) |
| ChatGPT | подписка ChatGPT Plus, Pro, Business, Edu или Enterprise | Codex (`codex`) 0.160+ | [ChatGPT](https://chatgpt.com/download) | приложение ChatGPT: [App Store](https://apps.apple.com/app/chatgpt/id6448311069), [Google Play](https://play.google.com/store/apps/details?id=com.openai.chatgpt) |
| Kimi | аккаунт Kimi Code | Kimi Code CLI (`kimi`) 2.5.2+ | [Kimi Code](https://www.kimi.com/code) — **не** «Kimi» | браузер через Remote Control (нужен платный тариф Kimi Code) |

Для перекрёстного ревью нужна пара провайдеров: лучше Claude и ChatGPT, Kimi — по желанию.

## Шаг 2. Node.js и Git

Они нужны в любом случае.

**macOS**

1. Установите инструменты командной строки Apple (в них есть Git, а установщик Kit с ними
   соберёт окно приложения):

   ```sh
   xcode-select --install
   ```

   В открывшемся окне нажмите «Установить» и дождитесь конца.
2. Скачайте установщик **Node.js LTS** с [nodejs.org](https://nodejs.org) (`.pkg`) и пройдите
   его с настройками по умолчанию.

**Windows 11**

1. Скачайте и поставьте **Node.js LTS** с [nodejs.org](https://nodejs.org) (`.msi`), настройки
   по умолчанию.
2. Скачайте и поставьте **Git for Windows** с
   [git-scm.com/downloads/win](https://git-scm.com/downloads/win), настройки по умолчанию. Его
   Git Bash нужен Claude Code и Kimi Code.
3. Контроль учётных записей (UAC) должен быть включён, как по умолчанию: без него демон
   ChatGPT не запускается. Kit называет эту причину в мастере проекта, в карточке общего доступа
   и в `wfk doctor`.

**Linux (Debian, Ubuntu)**

1. `sudo apt install git expect`
2. Node.js 24 или новее — по инструкции для вашего дистрибутива на
   [nodejs.org/download](https://nodejs.org/en/download): пакет из репозитория дистрибутива
   часто слишком старый.

**Проверка** (в новом терминале):

```sh
node --version
git --version
```

`node` должен показать `v24` или выше, `git` — любую версию.

**Ваше имя для коммитов Git.** Kit делает коммиты задач от вашего имени и сам его не задаёт.
Один раз выполните, подставив свои данные:

```sh
git config --global user.name "Имя Фамилия"
git config --global user.email "you@example.com"
```

## Шаг 3. Claude

Пропустите шаг, если Claude не нужен.

1. **Программа.** Инструкция провайдера — [code.claude.com/docs/en/setup](https://code.claude.com/docs/en/setup).
   - macOS и Linux:

     ```sh
     curl -fsSL https://claude.ai/install.sh | bash
     ```

   - Windows (PowerShell):

     ```powershell
     irm https://claude.ai/install.ps1 | iex
     ```

   Если установщик просит добавить папку в PATH, выполните его подсказку.
2. **Вход.** В новом терминале запустите `claude`. Выберите тему, затем способ входа
   **Claude account with subscription** (или Console, если у вас он), подтвердите вход в
   открывшемся браузере. Когда появится приглашение для ввода, введите `/exit`.
3. **Проверка:** `claude --version` — 2.1.0 или новее.
4. **Приложение.** Поставьте [Claude Desktop](https://claude.com/download) и войдите тем же
   аккаунтом. На iPad или телефоне — приложение Claude, тот же аккаунт.

Kit управляет Claude через `expect`: на macOS он есть, на Linux поставлен в шаге 2, Windows
обходится без него.

## Шаг 4. ChatGPT (Codex)

Пропустите шаг, если ChatGPT не нужен.

1. **Программа.** Инструкция провайдера — [github.com/openai/codex](https://github.com/openai/codex).
   - macOS и Linux:

     ```sh
     curl -fsSL https://chatgpt.com/codex/install.sh | sh
     ```

   - Windows (PowerShell):

     ```powershell
     powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
     ```

   - Или на любой ОС: `npm install -g @openai/codex`.
2. **Вход.** В новом терминале запустите `codex`, выберите **Sign in with ChatGPT** и
   подтвердите вход в браузере. Затем выйдите: `Ctrl + C`.
3. **Проверка:** `codex --version` — 0.160 или новее.
4. **Приложение.** Поставьте [ChatGPT](https://chatgpt.com/download) и войдите тем же
   аккаунтом. На iPad или телефоне — приложение ChatGPT, тот же аккаунт. Свой Codex приложения
   команду `codex` не ставит.
5. **Общий доступ к чатам (macOS и Windows, рекомендуется).** С ним один чат ChatGPT работает
   одновременно в Kit, в ChatGPT на компьютере, на iPad и телефоне, а чат ревьюера ChatGPT
   можно открыть. Почти всё настраивает Kit после установки (шаг 7), от вас — три действия:
   1. Панель Kit → «Настройки» → карточка «Общий доступ к чатам · ChatGPT» → **«Настроить»**,
      проверьте список записей → «Записать».
   2. Сервер SSH. macOS: Системные настройки → Основные → Общий доступ → **«Удалённый вход»**,
      доступ — только своему пользователю. Windows (нужен Git for Windows из шага 2):
      **«Скопировать команду запуска»** и выполните её в PowerShell, открытом от имени
      администратора, — скрипт Kit ставит сервер OpenSSH (текст — «Показать скрипт»).
   3. **«Открыть подключения ChatGPT»** → включите `wfk-local`, закройте ChatGPT и откройте
      снова. В карточке должно стать «Работает».

   Убрать — «Убрать настройку», затем выключите `wfk-local` и «Удалённый вход» (на Windows —
   выполните так же команду скрипта отката). Что пишет Kit — в
   [руководстве](installation.md#общий-доступ-к-чатам-chatgpt).

## Шаг 5. Kimi Code

Пропустите шаг, если Kimi не нужен.

1. **Программа.** Инструкция провайдера — [moonshotai.github.io/kimi-code](https://moonshotai.github.io/kimi-code/).
   На Windows сначала нужен Git for Windows из шага 2.
   - macOS и Linux:

     ```sh
     curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
     ```

   - Windows (PowerShell):

     ```powershell
     irm https://code.kimi.com/kimi-code/install.ps1 | iex
     ```

2. **Вход.** В новом терминале выполните `kimi login` и подтвердите вход в браузере. Если вход
   не проходит, укажите сайт вашего аккаунта: `kimi login --region mainland-cn` для kimi.com,
   `kimi login --region global` для kimi.ai.
3. **Модель.** Запустите `kimi`, введите `/model`, выберите модель, затем `/exit`. Без
   выбранной модели Kit покажет «в Kimi не выбрана модель».
4. **Проверка:** `kimi --version` — 2.5.2 или новее.
5. **Приложение Kimi Code.** У Moonshot два настольных приложения, нужно именно **Kimi Code**:
   - **Kimi Code** (`Kimi Code.app`) — пара к программе `kimi`: видит её сессии, в нём Kit
     открывает проекты. Страница — [kimi.com/code](https://www.kimi.com/code), её же открывает
     `kimi install-desktop`. Прямые ссылки:
     [macOS Apple Silicon](https://cdn.kimi.com/kimi-code/desktop/download/KimiCode-mac-arm64.dmg),
     [macOS Intel](https://cdn.kimi.com/kimi-code/desktop/download/KimiCode-mac-x64.dmg),
     [Windows x64](https://cdn.kimi.com/kimi-code/desktop/download/KimiCode-win-x64.exe),
     [Linux AppImage](https://cdn.kimi.com/kimi-code/desktop/download/KimiCode-linux-x86_64.AppImage).
   - **Kimi** (`Kimi.app`) — общий чат Kimi. Сессий программы `kimi` оно не видит, Kit с ним
     не работает.

   Войдите в Kimi Code тем же аккаунтом.

## Шаг 6. Проверьте программы

В **новом** терминале:

```sh
node --version
git --version
claude --version
codex --version
kimi --version
```

Для выбранных провайдеров каждая команда должна напечатать версию. Команда не найдена —
откройте новый терминал; не помогло — повторите шаг этого провайдера.

## Шаг 7. Установите Workflow Kit

1. **Скачайте Workflow Kit.** С Git:

   ```sh
   git clone https://github.com/OleynikAleksandr/Workflow_Kit.git
   cd Workflow_Kit
   ```

   Или на [странице репозитория](https://github.com/OleynikAleksandr/Workflow_Kit) нажмите
   **Code → Download ZIP**, распакуйте архив и откройте терминал в папке `Workflow_Kit-main`.
   Путь с пробелами в команде `cd` берите в кавычки.
2. **Установите** — в папке, где лежат `package.json` и `bin`:

   ```sh
   node bin/wfk.mjs install
   ```

   Установщик скопирует приложение, создаст команду `wfk`, значок **Workflow Kit** и
   автозапуск при входе в систему, запустит службу и напечатает найденные программы. Проверьте,
   что в строке «программы» есть все выбранные провайдеры. `npm ci` не нужен.
3. **Проверьте установку** в новом терминале:

   ```sh
   wfk doctor --installed
   ```

   Все строки должны быть `[ok]`, итог — «всё в порядке». Если `wfk` не найдена (на Windows
   сначала закройте Windows Terminal целиком), см.
   [запускатель и PATH](installation.md#запускатель-и-path).
4. **Откройте панель** значком **Workflow Kit** или командой `wfk open`. В «Настройках» → «Система»
   видно, какие программы найдены; готовность провайдеров покажет мастер проекта. На Windows панель
   открывается в Chrome, если он установлен.
5. **ChatGPT:** сразу настройте общий доступ к чатам — шаг 4, п. 5.

## Шаг 8. Панель на iPad и телефоне (по желанию)

Поставьте [Tailscale](https://tailscale.com/download) на компьютер и на устройство, войдите в
обоих одним аккаунтом. Откройте на устройстве адрес компьютера в Tailscale с портом 4747
(не `127.0.0.1`). Входа в панели нет: её и переписку сессий видит любое
устройство вашей сети Tailscale. Подробно — [удалённый доступ](installation.md#панель-и-удалённый-доступ).

## Если что-то не так

- **Провайдер поставлен после Kit** или Kit его не видит: снова выполните
  `node bin/wfk.mjs install` в папке Workflow Kit — установщик заново найдёт программы.
- **Kit пишет, что Git не знает вашего имени** — выполните команды `git config` из шага 2.
- **Провайдер недоступен в панели** — причина написана в мастере проекта под кнопками первой
  сессии; ненайденная программа помечена в «Системе». Исправьте её (вход, версия, модель Kimi) и выберите «↻ Обновить сессии» в меню боковой панели.
- **Claude «не завершил первый запуск»** — запустите `claude` в терминале, выберите тему и
  войдите, затем «Повторить». Windows без `claude` в PATH: `& "$env:USERPROFILE\.local\bin\claude.exe"`.
  На предложения новых функций Claude («Try the new …?») Kit сам отвечает «Not now».
- **Агент не находит `wfk`** — на экране проекта выберите «ChatGPT: Перезапустить демон», когда
  чаты ChatGPT не работают.
- **Kimi просит перезапустить приложение** — Kit дописал свой хук в `~/.kimi-code/config.toml`,
  а Kimi читает хуки только при запуске. Закройте Kimi Code и откройте снова.
- **ChatGPT: «Этот чат открыт в другом приложении»** — открыта копия чата без значка глобуса
  (например, из «Недавних»). Откройте чат из панели Kit.
- **iPad: «Эта задача используется в другом сеансе Codex»** — удалённое управление держит
  ChatGPT на Mac (он запустился раньше Kit). Закройте ChatGPT на Mac и откройте снова через минуту.
- Остальное — в разделе [«Если что-то не работает»](installation.md#если-что-то-не-работает)
  руководства.

## Что дальше

- [Работа с Workflow Kit](usage.md): первый проект, диалог с агентом, особенности провайдеров.
- [Руководство по установке](installation.md): подробности для каждой ОС, каталоги данных,
  обновление, удаление и диагностика.
