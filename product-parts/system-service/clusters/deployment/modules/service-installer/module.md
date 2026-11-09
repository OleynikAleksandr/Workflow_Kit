# Модуль: service-installer

Часть `system-service`, кластер `deployment`. Алиас импорта:
`#service-installer`.

## Назначение

Развёртывание и управление службой Workflow Kit (спецификация, раздел 9):
копия приложения в `app/<версия>/`, `app/current.json`, пути программ и PATH
login-shell (D12), запускатель `wfk`, значок «Workflow Kit», автозапуск
после входа пользователя, `service start/stop/status`, `wfk open`,
`wfk doctor [--installed]` и статус службы для карточки «Система».

## Публичный интерфейс (`src/index.ts`)

- `runServiceCommand(command, context?, args?) → Promise<ServiceCommandResult>`
  — `{ ok, exitCode, message }`, никогда не бросает (ошибка — код 1 и
  текст `wfk <команда>: …`). `command`: `install`, `uninstall`, `start`,
  `stop`, `status`, `open`, `doctor` (`args` с `--installed` — проверка
  установленной службы). `context` (`ServiceDeps`): `platform`, `env`,
  `homedir`, `serving` и внедряемые эффекты `fs` (`InstallerFs`), `run`
  (`CommandRunner`), `spawnDetached`, `health`, `kill`, `sleep`, `now`,
  `uid`, `sourceRoot` (что устанавливать, по умолчанию корень этого кода
  `SOURCE_ROOT`), `nodePath` (по умолчанию `process.execPath`),
  `readyTimeoutMs` (20 с), `stopTimeoutMs` (10 с). Без `context` вызов
  ничего не трогает: `status` — «не установлена» (код 0), остальное —
  «не реализовано» (код 2). `cli` всегда передаёт контекст (T010).
- `getServiceStatus(platform?, context?) → ServiceStatus` — синхронно,
  только файлы (D11): `implemented`, `installed` (есть валидный
  `app/current.json`), `running` (= `context.serving`: статус строит сама
  служба), `autostart`, `mechanism` (`launchagent` / `systemd-user` /
  `xdg-autostart` / `hkcu-run`), `note`, `instance` (`default` /
  `development`), `version`, `installedAt`, `appPath`,
  `fromInstalledCopy` (код запущен из `app/<версия>`, а не из клона),
  `autostartEntry`, `launcher` и `icon` (`{ path, present }`), `programs`
  (`node`, `claude`, `codex`, `expect` из `config.json`), `loginPath`.
  Без `context` — заглушка (`implemented: false`), ничего не читает.
  Значение HKCU Run на Windows опрос не проверяет (это внешняя программа):
  его сверяет `doctor --installed`.
- `autostartMechanism(platform)`, `serviceLayout({ platform, env, homedir })`
  (все пути по ОС), `browserPlan(input)` (чистый выбор окна панели;
  `input.macApp` — собранное приложение macOS, вид `mac-app`),
  `fetchHealth(port)`, `spawnDetachedProcess`, `nodeFs`, `ServiceError`,
  `NOT_IMPLEMENTED`, `PROGRAMS`, `APP_PARTS` (`bin`, `product-parts`,
  `package.json`), `COPY_EXCLUDED_DIRS` (`test`, `node_modules`, `.git`),
  константы `LAUNCH_AGENT_LABEL` (`ai.workflowkit.backend`),
  `SYSTEMD_UNIT` (`workflow-kit.service`), `RUN_KEY`, `RUN_VALUE_NAME`
  (`WorkflowKit`), `ICON_BUNDLE_ID` (`ai.workflowkit.launcher`), метки
  `LAUNCHER_MARK` (та же строка, что у `cli`), `DESKTOP_MARK`, `UNIT_MARK`.
- `InstallerFs` включает `realpath(file) → string | null` (разрешение
  символьных ссылок; нужен выбору `node`, см. «Установка», п. 3).
- Типы `ServiceStatus`, `ServiceCommand`, `ServiceCommandResult`,
  `ServiceContext`, `ServiceDeps`, `InstallerFs`, `HealthInfo`,
  `HealthProbe`, `DetachedSpawner`, `ManagedItem`, `CurrentRecord`,
  `ServiceLayout`, `BrowserPlan`, `BrowserPlanInput`, `DoctorCheck`,
  `DoctorReport`, `AutostartMechanism`.

## Раскладка по ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| копии | `<данные>/app/<версия>` | `$XDG_DATA_HOME/workflow-kit/app/<версия>` | `%LOCALAPPDATA%\Workflow Kit\app\<версия>` |
| запускатель | `~/.local/bin/wfk` (0755) | `~/.local/bin/wfk` | `wfk.cmd` в каталоге данных + PATH пользователя; рядом `wfk` (sh для Git Bash) и `wfk.mjs` для хуков Kit (`layout.companions`, M5 раздел 6) |
| значок | `~/Applications/Workflow Kit.app` | `$XDG_DATA_HOME/applications/workflow-kit.desktop` | `…\Start Menu\Programs\Workflow Kit.lnk` |
| автозапуск | `~/Library/LaunchAgents/ai.workflowkit.backend.plist` | `$XDG_CONFIG_HOME/systemd/user/workflow-kit.service`, без systemd — `$XDG_CONFIG_HOME/autostart/workflow-kit.desktop` | `HKCU\…\Run` → `WorkflowKit` |
| журналы | `<состояние>/logs/service.log`, `open.log` | то же | то же |

## Установка (`install`)

1. Проверка: чужой файл на месте запускателя или значка — отказ до
   любых изменений. Своим значком считается бандл с идентификатором
   `ai.workflowkit.launcher` или `com.workflowkit.launcher` (апплет
   прототипа): он заменяется.
2. Версия из `package.json` источника; копия `bin`, `product-parts`,
   `package.json` (без `test/`) во временный каталог и `rename` в
   `app/<версия>`. Запуск из самой установленной копии ничего не копирует.
3. PATH login-shell: `$SHELL -i -l -c`, затем `-l -c` (маркеры
   `__WFK_PATH__`), объединяется с каталогом `node` (первым) и PATH
   процесса. Пути `claude`, `codex`, `expect` ищутся по нему.
   `node` службы устойчив к обновлению Homebrew: `process.execPath` —
   версионный путь `…/Cellar/node@24/24.x.y/bin/node`, который исчезает
   после `brew upgrade`, поэтому берётся первый `node` из login PATH (затем
   PATH процесса) с тем же `realpath`, например `/opt/homebrew/bin/node`;
   если такого нет — ссылка Homebrew `<префикс>/opt/<формула>/bin/node`
   (`homebrewOptNode`) с тем же `realpath`; иначе сам `process.execPath`.
   Windows оставляет `process.execPath`. Каталог выбранного `node` идёт в
   PATH службы первым. Этот же `node` пишется в `config.json`
   (`programs.node`), `app/current.json`, запускатель, значок и
   автозапуск. В `config.json` пишутся `programs` и `loginPath`, остальные
   ключи сохраняются; невалидный JSON — отказ.
4. Запускатель (метка `# Workflow Kit launcher`; `wfk link` с той же меткой
   заменяется), значок, автозапуск:
   - macOS: LaunchAgent с `RunAtLoad`, `KeepAlive`, `AbandonProcessGroup`,
     `ThrottleInterval` 10, PATH из п. 3, абсолютный `node`, вывод в
     `service.log`. Значок — приложение «Workflow Kit» (с вехи 2):
     `/usr/bin/xcrun swiftc -O` собирает `assets/macos/WorkflowKitApp.swift`
     установленной копии (`MAC_APP_SOURCE`) в
     `Contents/MacOS/workflow-kit` (таймаут 5 мин). `Info.plist`
     (`macAppInfoPlist`) — обычное приложение без `LSUIElement`, поэтому
     оно видно в Dock и его можно закрепить; ключи `WFKNode` и `WFKEntry`
     — установленные `node` и `bin/wfk.mjs`, `NSAllowsLocalNetworking`,
     `CFBundleIconFile` `AppIcon`. Приложение открывает панель в своём
     окне (WKWebView): запускает `wfk open --url-only`, грузит адрес;
     ссылки вне панели (`codex://`, `claude://`, веб) отдаёт macOS; меню
     «Правка» (копировать, вставить), ⌘R — обновить; закрытое окно
     возвращается щелчком по значку. Картинка: `workflow-kit
     --make-iconset <dir>` рисует левую половину значка установленного
     Claude.app и правую — ChatGPT.app (без одного из них — «WK»),
     `iconutil` собирает `AppIcon.icns`, `lsregister -f` обновляет
     значок; неудача картинки не мешает (стандартная иконка, пояснение в
     отчёте). Нет исходника или `swiftc` не собрал — прежний бандл:
     `Info.plist` с `LSUIElement` и `/bin/sh`-скрипт, запускающий
     `wfk open` (вывод в `open.log`); причина в строке «значок» отчёта
     `install`. `writeIcon` возвращает `IconResult { kind: 'app' |
     'script', note }`, отчёт — `InstallReport.icon`.
   - Linux: если `systemctl --user show-environment` отвечает — unit с
     `KillMode=process`, `Restart=on-failure`, `Environment="PATH=…"`,
     `daemon-reload`, `enable`; иначе XDG autostart
     (`node entry service start`). Значок — `.desktop` с `wfk open`.
   - Windows: `wfk.cmd`; `wfk-service.vbs` и `wfk-open.vbs` (WScript.Shell
     `Run …, 0` — без окна консоли); `reg add HKCU\…\Run /v WorkflowKit`
     со значением `"%SystemRoot%\System32\wscript.exe" "…\wfk-service.vbs"`;
     PATH пользователя и ярлык в «Пуске» — через PowerShell. Прав
     администратора не нужно.
5. `app/current.json` (0600): `version`, `appPath`, `entry`, `node`,
   `installedAt`, `integrated`, `mechanism`, `autostartEntry`, `launcher`,
   `icon`. Без симлинков.
6. Перезапуск на новой версии: macOS — `launchctl bootout`, ожидание
   выгрузки старой службы (`unloadLaunchAgent`, см. «Инварианты»), затем
   `bootstrap gui/<uid>`; systemd — `restart`; иначе остановка старого
   процесса и отсоединённый запуск. Ожидание `/api/health`.
7. Остаются текущая и одна предыдущая версия; остальные удаляются.

Повторный `install` обновляет всё перечисленное. Экземпляр разработки
(`WFK_DATA_DIR`) получает копию, `current.json`, пути программ и
отсоединённую службу, но не запускатель, значок и автозапуск — они
принадлежат обычному экземпляру; `launchctl` и `systemctl` не вызываются.

## Удаление (`uninstall`)

Останавливает службу, снимает автозапуск (`bootout` и plist; `disable`,
unit, `daemon-reload`; XDG-файл; `reg delete`, `.vbs`, PATH пользователя),
запускатель и значок (только с метками Workflow Kit) и каталог `app/`.
`config.json`, `projects.json`, журналы, сессии и копии чужих конфигов
остаются. Для экземпляра разработки снимается только `app/`.

## Служба, `open`, `doctor`

- `start`: если `/api/health` уже отвечает — «уже работает». Иначе
  LaunchAgent (`print` → `kickstart` или `bootstrap`), systemd (`start`)
  или отсоединённый `node entry serve` (своя группа, stdin закрыт, вывод в
  `service.log`, окружение без `CLAUDE*` и с PATH из `config.json`).
  Ожидание `/api/health` до 20 с, иначе ошибка с путём журнала.
- `stop`: `launchctl bootout` с ожиданием выгрузки или
  `systemctl --user stop`; если бэкенд
  всё ещё отвечает (или служба отсоединённая) — TERM процессу с pid,
  который только что сообщил сам `/api/health`, ожидание до 10 с. Шаблонов
  `pkill` нет (D9).
- `status`: служба (`/api/health`, pid, версия, порт), установка,
  автозапуск, запускатель, значок, пути программ.
- `open`: `start` при необходимости, затем окно панели
  `http://127.0.0.1:<порт>/`: macOS — собранное приложение
  (`/usr/bin/open <Workflow Kit.app>`, если его `Info.plist` содержит
  `WFKEntry`), иначе `open -na "<Chrome|Edge|Chromium>.app"
  --args --app=… --user-data-dir=<состояние>/panel-browser`; Linux —
  первый из `google-chrome`, `microsoft-edge`, `chromium` в PATH; Windows —
  `msedge.exe` или `chrome.exe` из Program Files; иначе браузер по
  умолчанию (`open`, `xdg-open`, `rundll32 url.dll`). Порт 0 — отказ.
  `open --url-only` (его вызывает приложение macOS) только запускает
  службу при необходимости и выводит `панель: <адрес>`; другой аргумент —
  ошибка.
- `doctor`: Node 24+, каталог данных, `config.json`, программы,
  `/api/health` (предупреждение). `--installed` дополнительно:
  `current.json`, точка входа, `node` службы, запускатель указывает на
  копию, значок, автозапуск (файл содержит точку входа; `launchctl print`,
  `systemctl --user is-enabled`, `reg query` совпадает с ожидаемым),
  `/api/health` отвечает версией установки. Ошибка — код 1.

## Инварианты

- Внешние программы — только через внедряемый `run`, файлы — через
  `InstallerFs`; тесты идут на подставном HOME (в памяти для трёх ОС и на
  временном каталоге для macOS) и никогда не трогают настоящие
  `~/Library/LaunchAgents`, `~/.local/bin`, `~/Applications`, реестр и
  systemd.
- Файлы, созданные не Workflow Kit, не заменяются и не удаляются.
- Опрос панели (`getServiceStatus`) только читает файлы.
- launchd выгружает службу асинхронно: сразу после `launchctl bootout`
  `print` ещё находит старую службу, `kickstart` попадает в уходящую, а
  `bootstrap` отвечает ошибкой 5. Поэтому после каждого `bootout`
  (переустановка, `stop`) `unloadLaunchAgent` опрашивает `print`, пока
  служба не исчезнет (до `stopTimeoutMs`, 10 с), иначе ошибка «launchd не
  выгрузил ai.workflowkit.backend … повторите wfk service start». Найдено
  при переустановке 2026-11-05 (T014): без ожидания `wfk install` оставлял
  службу выгруженной. Подставной `launchctl` тестов умеет такую выгрузку
  (`unloadPolls`), тест `launchd-unload.test.ts`.
- `uninstall` не трогает данные пользователя.
- Зависимости: `#data-store` (каталоги, порт, атомарная запись),
  `#process-supervisor` (`runCommand`, `cleanEnv`).

## Подключение к `cli` и панели (T010)

- `cli` передаёт `runServiceCommand(command, { env, platform, homedir,
  ...deps.service }, args)` для `install`, `uninstall`,
  `service start|stop|status`, `open [--url-only]` и `doctor [--installed]`; тесты
  `cli` подставляют эффекты через `CliDeps.service`.
- Раздел `system` бэкенда вызывает `getServiceStatus(platform, { env,
  homedir, serving: true })`.
- Карточка «Система» (`panel-shell`) показывает службу и установленную
  версию, экземпляр, способ и состояние автозапуска, запускатель, значок и
  пути программ.

## Проверить при приёмке (на устройстве)

- macOS: `launchctl bootstrap/bootout gui/<uid>` с этим plist, запуск
  значка-скрипта из Finder и Dock (без подписи и карантина), окно
  `--app` Chrome с отдельным профилем.
- Linux и Windows проверяются только тестами (R3): `systemctl --user`,
  XDG autostart, `reg add`, PowerShell-скрипты PATH и ярлыка.

## Windows: запускатели рядом с wfk.cmd (M5, раздел 6)

`layout.companions` на Windows — `wfk` (`gitBashLauncher`: sh-скрипт с путями через `/` для
инструмента Bash Claude Code) и `wfk.mjs` (`hookLauncherScript`: `await import(<file URL копии>)`,
его запускают хуки Kit). Оба несут метку `Workflow Kit launcher`, пишутся вместе с `wfk.cmd`,
проверяются `checkConflicts` (чужой файл — отказ), `doctor --installed` и удаляются `uninstall`.
Шаблоны экспортируются для `wfk link` (`windowsLauncher`, `gitBashLauncher`, `hookLauncherScript`,
`isOwnLauncher`).
