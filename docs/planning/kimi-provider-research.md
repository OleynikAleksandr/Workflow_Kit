# Исследование: Kimi как третий провайдер Workflow Kit (2026-11-09)

Вопрос пользователя: можно ли подключить Kimi к Workflow Kit полноценным третьим
провайдером рядом с Claude и ChatGPT/Codex. Это исследование, не спецификация: кода и плана
нет. Факты проверены на машине пользователя (macOS) и по документации
<https://moonshotai.github.io/kimi-code/>; **П** — предположение, не проверено.

## 1. Что установлено

| Что | Где | Версия | Роль |
| --- | --- | --- | --- |
| Kimi Code CLI | `~/.kimi-code/bin/kimi` (один бинарник, без Node) | 2.5.2 | агент для кода — аналог Claude Code и Codex |
| Kimi (десктоп) | `/Applications/Kimi.app`, `com.moonshot.kimichat`, Electron | 3.2.25 | общий чат Kimi и агент «Daimon» с работой в папках проектов; ссылки `kimi://`, `kimi-work://` |
| Kimi Code desktop | не установлен; `KimiCode-*.dmg/.exe/.AppImage/.deb/.rpm` с cdn.kimi.com | — | приложение-пара к CLI: сессии по проектам, его открывает `kimi app` |
| KimiCU | `/Applications/KimiCU.app` | — | MCP-сервер управления компьютером (`kimi-cu mcp`) |
| kimi-cli (старый) | `~/.local/bin/kimi-cli` (Python, uv) | — | прежняя версия, данные перенесены в `~/.kimi-code` |

Главный вывод о десктопе: **установленный Kimi.app — не «Kimi Code desktop»**. Он тоже
работает в папках проектов (у пользователя — сессии в `harness-ai`, `MyTeslaApp`,
`Workflow_Pilot`), но через свой агент Daimon со своим встроенным kimi-code и своим хранилищем
(`~/Library/Application Support/kimi-desktop/daimon-share/daimon/runtime/kimi-code/home`,
id сессий `conv-…`, свой ключ и модель). Сессии CLI (`~/.kimi-code`, id `session_…`) он не
видит, а CLI не видит его сессий; о `~/.kimi-code` в коде приложения нет ни одной ссылки.
Чаты Kimi.app открываются ссылками `kimi-work://chat/<id>`, а создаются через закрытый
протокол Daimon (`ws://127.0.0.1:<порт>/control` с токеном, код обфусцирован).

«Kimi Code desktop» — отдельное приложение `KimiCode` (kimi.com/code, кнопка «Download for
macOS»): `https://cdn.kimi.com/kimi-code/desktop/download/KimiCode-mac-arm64.dmg`, 135 402 873
байт, опубликован 2026-11-06 (проверено по заголовкам, не скачивалось); в коде страницы есть
и сборки macOS x64, Windows x64, Linux AppImage/deb/rpm. Kimi.app — другой продукт: 1,0 ГБ,
обновляется из `kimi-img.moonshot.cn/app/upgrade/` (`kimi-desktop-updater`).

Образ скачан и осмотрен без установки (2026-11-09, sha256 `f0bd00a8…6ffa`): внутри
`Kimi Code.app`, `com.kimi.code.desktop` 1.3.2, Electron, подпись Developer ID «Beijing
Moonshot Technology Co., Ltd (2J9472RW75)», нотаризован. Регистрирует только `kimi-code://`.
Каталог данных — `KIMI_CODE_HOME` или `~/.kimi-code`, **тот же, что у CLI**; внутри тот же
сервер Kimi Code (порт 58627, `server/instances`, `rc.json` Remote Control). Ссылки: только
`kimi-code://open?root=<абсолютный путь>[&new=1]` (папка проекта, `new=1` — новый черновик)
и `kimi-code://auth/success`; ссылки на конкретную сессию нет.

Живая проверка Kimi Code.app (2026-11-09, установил пользователь): в боковой панели проект
Test_md с двумя сессиями «Запомнить слово ЯБЛОКО» из терминала и проект `oleksandroliinyk`
с сессиями CLI («привет.», «ghbdtn», «/update-config»); переписка сессии CLI открывается
целиком. Внизу — аккаунт с тарифом Allegretto. Приложение запускает **свой встроенный
сервер** Kimi Code (движок 2.5.1, у CLI 2.5.2) на 127.0.0.1 со случайным портом и
регистрирует его в `~/.kimi-code/server/instances/<id>.json` (`pid`, `port`, `host_version`,
`heartbeat_at`). Значит, Kit может либо подключаться к этому серверу, либо держать свой
`kimi web`: несколько серверов на одном каталоге документация допускает, запись в одну
сессию разделяют блокировки (`40931`). На сайте у него боковая
панель «Sessions» по проектам, как у Claude Desktop. Команда `kimi app` открывает именно его
ссылкой `kimi-code://open?root=<папка>`; на машине оно не установлено, эту ссылку сейчас не
обслуживает ни одно приложение.

Живая проверка (2026-11-09, пользователь и агент), папка `~/VSCODE/Test_md`:

- сессия из терминала (`kimi`, «запомни слово ЯБЛОКО») есть в `kimi session list --cwd`
  (`session_6c5706d8-…`, `session_5c65372a-…`), а в Kimi.app её нет;
- проект Test_md, добавленный в Kimi.app, и сессия в нём легли только в хранилище
  Kimi.app (`…/kimi-code/home/sessions/wd_test_md_e0d24b39f29e/conv-8670a7dc…`); CLI её не
  видит. Id папки (`wd_test_md_e0d24b39f29e`) в обоих хранилищах одинаковый — движок один,
  каталоги разные.

Подставлять Kit каталог Kimi.app (`KIMI_CODE_HOME`) не стоит: это закрытые данные другого
приложения со своей версией движка, а его список чатов ведёт Daimon (`conv-…`), а не сам
kimi-code.

## 2. Что под капотом Kimi Code CLI

- **Сессии.** Id вида `session_<uuid>`; хранятся в
  `~/.kimi-code/sessions/wd_<имя>_<хеш>/session_<uuid>/`, индекс `session_index.jsonl`.
  `kimi session list --all --json` даёт `id, title, workDir, createdAt, updatedAt, archived,
  lastTurnReason`. Продолжение: `kimi -S <id>`, `kimi -c`.
- **Локальный сервер `kimi web`** (аналог app-server Codex): один процесс, REST
  `/api/v1` (+ `/api/v2/sessions`) и WebSocket `/api/v1/ws`, 105 путей в `/openapi.json`,
  только 127.0.0.1, токен в заголовке `Authorization: Bearer`. Проверено вживую (чтение):
  `healthz`, `meta`, список сессий с `busy`, `pending_interaction`, `metadata.cwd`.
  Есть создание сессии (`POST /api/v1/sessions { metadata.cwd }`), отправка сообщения
  (`POST …/prompts`), имя (`…/profile`), `:archive`, `:restore`, `:delete`, `:abort`,
  поток событий хода (`turn.started` … `turn.ended`). API помечен как экспериментальный.
- **ACP** (`kimi acp`): JSON-RPC по stdio для IDE — запасной путь управления сессиями.
- **Remote Control** (`kimi rc`, `kimi web --remote-control`, `POST /api/v1/remote-control
  { enabled }`): туннель через сервис Kimi, вход на iPad или телефоне **в браузере** по
  `https://code-rc.kimi.ai/devices/<id>/` под тем же аккаунтом. Нужна платная подписка;
  один экземпляр на машину (`~/.kimi-code/server/rc.json`); до ~3 устройств на аккаунт.
- **Хуки.** События как у Claude: `SessionStart`, `UserPromptSubmit`, `Stop`, `SessionEnd`,
  `PreToolUse`, `PostToolUse` и др. Данные — JSON в stdin (`session_id`, `cwd`,
  `hook_event_name`). `Stop` и `UserPromptSubmit` блокирующие: код 2 или ответ
  останавливают ход и добавляют сообщение — то, что нужно `agent-channel` для удержания хода
  и доставки сообщений. Отличие: хуки задаются **только** в пользовательском
  `~/.kimi-code/config.toml` (`[[hooks]]`: `event`, `matcher`, `command`, `timeout`),
  проектных хуков нет.
- **Доверие к папке.** Файл `~/.kimi-code/workspace-trust/<wd-id>` с `{ root, trustedAt }`;
  в API `POST /api/v1/workspaces/{id}/trust` и `…/untrust`; переменная
  `KIMI_CODE_TRUST_WORKSPACE=1` для одного процесса.
- **Инструкции проекта.** Читает `AGENTS.md` (следит за изменениями) и
  `<проект>/.kimi-code/AGENTS.md`; навыки — `~/.agents/skills`, `<проект>/.agents/skills`.
- **Вход.** OAuth Kimi (`kimi login`, device code), регион `kimi.com` или `kimi.ai`.

## 3. Сопоставление с контрактом провайдера Kit

| Возможность Kit | Claude | Codex | Kimi Code |
| --- | --- | --- | --- |
| Статус и версия программы | `claude --version` | `codex --version` | `kimi --version` |
| Доверие к папке проекта | `~/.claude.json` | `config.toml` | API `…/workspaces/{id}/trust` или файл `workspace-trust` |
| Хук Kit (SessionStart, Stop, UserPromptSubmit) | проектный `.claude/settings` | проектный, одобрение | **один глобальный** `[[hooks]]` в `~/.kimi-code/config.toml`; скрипт Kit сам отбрасывает чужие папки по `cwd` |
| Создать сессию с первым сообщением | `claude --remote-control` | тред через демон | `POST /api/v1/sessions` + `…/prompts` через `kimi web` |
| Список сессий проекта | журнал хука | `thread/list` | `kimi session list --cwd <папка> --json` или API |
| Имя, архив, удаление | есть | есть | `…/profile`, `:archive`, `:restore`, `:delete` |
| Открыть чат на Mac | Claude Desktop | приложение ChatGPT | Kimi Code desktop (проверено: видит сессии CLI): ссылка открывает папку проекта (`kimi-code://open?root=`), не конкретную сессию; запасные пути — терминал `kimi -S <id>`, браузер; Kimi.app сессии CLI не открывает |
| Чат на iPad | приложение Claude | приложение ChatGPT | браузер через Remote Control (подписка пользователя Allegretto — платная) |
| Удержание хода и сообщения агенту | Stop/UserPromptSubmit | Stop/UserPromptSubmit | Stop/UserPromptSubmit — совместимы |
| Перекрёстное ревью | да | да | **П**: ревьюер через API сервера |

## 4. Вывод

Подключить можно: **Kimi Code CLI** по устройству ближе всего к связке «Codex-демон +
хуки Claude» и даёт всё, что нужно провайдеру Kit. Опора — сервер `kimi web` как фоновый
процесс службы (как демон Codex) и глобальный хук Kit в `~/.kimi-code/config.toml`
(запись с предпросмотром и согласием, как у Codex).

Чем Kimi будет отличаться от двух нынешних провайдеров:

1. Сессии Kit открываются в Kimi Code desktop (общий с CLI каталог, проверено), но ссылка
   ведёт в папку проекта, а не в конкретную сессию — нужную сессию пользователь выбирает в
   боковой панели. Kimi.app их не видит (у него своё хранилище). Запасные пути — терминал
   `kimi -S <id>` и браузер. На iPad — браузер через Remote Control (тариф Allegretto).
2. Хуки глобальные: скрипт Kit срабатывает во всех папках и должен молча выходить вне
   проектов Kit.
3. API сервера экспериментальный: адаптер привязывается к `/openapi.json` своей версии и
   проверяет версию программы, как у Codex.

## 5. Открытые вопросы (проверить до спецификации)

- Ссылка веб-интерфейса на конкретную сессию (локально и через Remote Control) — **П**.
- Kimi Code desktop видит сессии CLI — проверено. Осталось: что открывает
  `kimi-code://open?root=<папка>` без `new=1` (последнюю сессию папки или черновик); сессия,
  созданная сервером Kit, сразу появляется в открытом приложении или после обновления; разные
  версии движка (приложение 2.5.1, CLI 2.5.2) на одном `~/.kimi-code`.
- Одновременная работа: сессия открыта в TUI или десктопе и в сервере Kit (код `40931`
  «сессия занята другим клиентом»).
- Как хук на Windows запускает команду (оболочка) — **П**.
- Подписка: у пользователя Allegretto (платная) — Remote Control доступен; проверить вживую.
- Перекрёстное ревью Kimi ↔ Claude/ChatGPT: роль ревьюера через API.

## 6. Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Kimi Code CLI | бинарник `~/.kimi-code/bin/kimi` (проверено) | `install.sh`, тот же путь (**П**) | `install.ps1`, `~/.kimi-code/bin/kimi.exe` (**П**) |
| Сервер `kimi web`, API, хуки | одинаково по документации; проверено только на macOS | одинаково (**П**) | одинаково (**П**), оболочка хука — **П** |
| Открытие чата | Kimi Code desktop (**П**), терминал, браузер | Kimi Code desktop (AppImage/deb/rpm, **П**), терминал, браузер | Kimi Code desktop (сборка win-x64, **П**), терминал, браузер |
| Remote Control | браузер на iPad (**П**: не проверено, нужна подписка) | то же | то же |

## 7. Что изменилось на машине при исследовании

- Первый запуск `kimi session list` новой версией 2.5.2 перенёс `~/.kimi-code/workspaces.json`
  в `projects.json` (копия `workspaces.json.pre-projects-migration-….bak`, старый файл на
  месте) — это обычная миграция Kimi при первом запуске новой версии.
- Сервер `kimi web --no-open --port 58700` запускался на минуту для чтения API и остановлен;
  Remote Control не включался, конфиги Kimi не менялись.
