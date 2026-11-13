# M27: исходные факты и неизвестные о контролах Claude

Дата: 13.11.2026. Это вход к [спецификации](../planning/M27-claude-native-controls.md),
не отчёт об уже реализованной функции. Источники: действующий код Kit, локальные
read-only команды и официальные материалы Claude Code. Старые заметки M25 не
принимаются за доказательство нового управляющего канала.

## 1. Проверено локально при подготовке плана

- Функциональная база — принятая/закрытая M26, Kit 0.12.1. Текущий HEAD проверять
  через workflow recover/git на каждом ходе: здесь он не объявляется неизменным.
  При подготовке предложения role planning, scope NONE; код не меняется.
- `claude --version`: 2.1.323. В `claude --help` есть --model, --effort,
  --permission-mode, --settings, --remote-control, --input-format/--output-format.
  Help усилия перечисляет low/medium/high/xhigh/max. Наличие флага запуска
  не является доказательством изменения уже работающего интерактивного процесса.
- `claude agents --help`: --json только выводит список; параметры model/effort/
  permission-mode относятся к запуску новых agents, не к обновлению выбранного pid.
  `agents --json --cwd <этот проект>` вернул один объект; показаны только имена полей:
  cwd,kind,name,pid,sessionId,startedAt,status. Каталога/эффективных настроек там нет.
  Содержимое имён/переписки/токенов не сохранялось.
- provider-claude/src/parameters.ts: только readParameters, editable=false;
  model/effort из statusline или последнего assistant, mode из записей permission-mode.
  Это последнее наблюдение, а не подтверждение будущего изменения.
- cli/src/statusline.ts уже сохраняет fast_mode, но Claude-reader его ещё не выводит;
  отдельного достоверного Ultracode-state в действующем контракте нет.
- Управляемые беседы — существующие expect PTY на macOS/Linux и ConPTY на Windows.
  direct.ts доставляет пользовательский текст, interrupt-control подтверждает Stop.
  Нового типизированного протокола смены параметров у этих host пока нет.
- Публичный список видимых окон CoreGraphics по Claude пуст. Снимки открытых меню
  Claude в этом ходе не получены; геометрия поповеров пока не измерена. Наличие
  приложения на диске или текст docs не считается скриншотом нужного состояния.

## 2. Документировано, но ещё не испытано управляющим каналом Kit

### Модель и усилие

[Model configuration](https://code.claude.com/docs/en/model-config), проверено 13.11.2026.
Каталог зависит от аккаунта/развёртывания/политик. Выбор модели может быть отклонён
PreModelSwitch-hook. Пять уровней effort и настройка Ultracode имеют разную семантику.
CLI может сохранять effort для модели в пользовательских настройках, тогда как
Remote Control применяет выбор effort к одной сессии. Обновление отдельного
процесса SDK также не доказывает обновления существующего TUI.

В M25 `ultra → Ultracode` было строковой подписью прочитанного значения;
её нельзя механически преобразовать ни в шестую точку, ни в отдельный boolean.
T001 устанавливает raw encoding, базовый effort и форму native UI. До этого raw ultra
сохраняется без догадок; невозможность определить базовый effort указана явно.

### Скорость

[Fast mode](https://code.claude.com/docs/en/fast-mode), проверено 13.11.2026.
Доступность зависит от модели, версии, аккаунта и политики. Ускорение имеет
отдельные последствия для расхода/usage credits. Включение на неподходящей модели
может также сменить модель; существуют настройки с разной областью сохранения.
Нельзя зашивать один множитель, считать fast_mode=false по отсутствию поля или
включать опцию без обязательного нативного подтверждения.

### Доступ

[Permission modes](https://code.claude.com/docs/en/permission-modes) и
[Desktop](https://code.claude.com/docs/en/desktop), проверено 13.11.2026.
Manual имеет canonical value default (CLI принимает manual как alias), Accept edits —
acceptEdits, Plan — plan, Auto — auto. dontAsk — отдельный режим CLI, не обычный
пункт Desktop. Bypass зависит от поверхности/политик; Remote Control не позволяет
выбрать его из приложения, даже если локальный терминал уже в этом режиме.
Auto проверяет действия штатным классификатором Claude, не логикой Kit.

### Каналы

[Agent SDK configuration](https://code.claude.com/docs/en/agent-sdk/configuration):
runtime setters setModel/setPermissionMode и applyFlagSettings относятся к
подключённому streaming run; updateSettings может менять defaults, не текущий run.
Это кандидат для проверки, а не готовый способ attach к действующему PTY Kit.

[Remote Control](https://code.claude.com/docs/en/remote-control): модель, effort и
скорость могут изменяться через нативные команды подключённой беседы. Наличие
этой функции в продукте не раскрывает публичный локальный attach API для Kit.
Нельзя выводить поддержку внешнего setter из этих двух разных источников.

## 3. Обязательные доказательства T001

Порядок: (1) собственный временный Kit-проект и дешёвая проверка канала/defaults/hooks,
(2) проверка минимального набора, (3) согласованные короткие model turns,
(4) запрос необходимых native PNG и обратной смены у пользователя, (5) очистка,
(6) заполнение таблицы/визуального контракта и только затем commit T001.
T001 может занимать несколько ходов; отсутствие ответа/снимка не считается согласием.

Временный проект создаётся и получает Kit/hooks штатными командами. Probe session
запускается public provider.createSession → существующий startSessionProcess:
те же expect/ConPTY, --settings statusline, Remote Control и hook host, что в продукте.
Допустимы локальные настройки только уникальной временной папки (Sonnet/fast=false).
Не заменять этот путь голым claude/SDK-run. До запуска учесть bootstrap по §6.

Для каждой команды записать native state/catalog/disabled, запрос/read-back, момент
применения, scope сохранения и реальные UserPromptSubmit/Stop/иные hooks с installed Kit.
Синтетические sentinel-сообщения очереди относятся только к пробной беседе. Если они
поглощаются командой, это наблюдаемый дефект для обязательного исправления T003,
а не доказательство доставки. Рабочие очереди/ревьюер не используются.

Обязательный минимум продолжения — session-local model И effort. Кроме того, все
native-доступные speed/mode/Ultracode должны иметь доказанный путь; отключать их
можно только по реальному native запрету/отсутствию, не из-за недописанного канала.
Иначе T001 НЕ коммитится, выполняется task:block --reason с точной причиной.
Дальше только решение пользователя и task:unblock после устранения причины либо
согласованный пересмотр scope: `task:update` ещё не выполненных задач по решению
пользователя либо `carryover`. Заглушка, гипотеза или SDK-копия не закрывают gate.

Исключение из запрета менять trust — scoped запись для собственного временного
Kit-проекта через штатный preview/apply. Прежние записи, defaults, hooks, statusline
и MCP рабочих/чужих проектов сохраняются. Нельзя восстанавливать весь ~/.claude.json
из старой копии. Cleanup: штатный archive, stop и purge только своего проекта,
проверка отсутствия живого процесса и временной trust-записи, затем удаление своей папки.
Код purgeProject вызывает claude purge и прямо сохраняет серверные беседы Anthropic;
Kit archive также не равен нативному archive. Тестовые Remote Control-карточки
пользователь архивирует штатно в Claude, если автоматического публичного пути нет;
их отсутствие в активном списке подтверждается отдельно. Без факта очистки T001 не DONE.

## 4. Таблица управления (заполняет T001)

Статус: **PASS** для доказанного native набора; fast — NATIVE_UNAVAILABLE аккаунта.
После AX_TRUSTED=true получены обязательные native PNG, обратные смены из GUI,
нормализованный PTY proof и подтверждение native archive собственных карточек.
[Канал и семантика](M27/claude-native-channel.md),
[визуальный контракт](M27/claude-visual-reference.md),
[полный отчёт](../evidence/M27-claude-native-controls.md).

| Поле | State/catalog | Setter/read-back | Scope/next turn | Hooks/ограничения | Итог |
| --- | --- | --- | --- | --- | --- |
| model | /model, More models + Enter to expand, прокрутка; Desktop четыре основные + More models | Точная строка → s, native session-only ACK + fresh model.id/display_name; GUI Opus→Sonnet и дополнительная Sonnet 5→Sonnet 5.5 | Та же identity/PID, defaults hash прежний; два прежних Sonnet OK подтверждают следующий ход | Kit prompt/Stop не вызываются; Default не заменяет явную модель; Enter на модели запрещён | PASS |
| effort | Native low/medium/high/xhigh/max; Desktop список Low/Medium/High/Extra/Max, не slider | /effort → стрелки → s; native session-only ACK, /effort status + statusline; GUI medium→high прочитан в Kit | medium→high, два OK на Sonnet/high; defaults hash прежний | Рекомендация зависит от модели, нельзя выдавать default за явный выбор | PASS |
| fast | CLI /fast: Fast mode requires usage credits; GUI не предлагает fast даже на Opus 5.5 | Нативное включение недоступно, только Esc; statusline fast_mode=false | Ни кредитов, ни платной генерации; global fast preference не менялась | Не обходить account restriction; нет editable setter по одному знанию CLI /fast | NATIVE_UNAVAILABLE |
| mode | Native RC: Auto/Manual/Accept edits/Plan; CLI footer auto/manual/accept edits/plan | Shift+Tab с проверкой каждого шага; GUI Manual меняет native footer; legacy reader отстаёт до prompt | Четыре режима пройдены и возврат Auto, defaults hash прежний | Manual canonical default; bypass native RC не предлагает; legacy transcript не немедленный ACK | PASS |
| ultra/Ultracode | Отдельный native switch и footer marker; statusline effort.level=high при on | /effort ultracode и /effort ultracode off, native session-only ответ; base high сохраняется | Отдельная подпись High · Ultracode на Desktop | В этой CLI raw ultra не воспроизведён; историческая подпись Ultracode сохраняется, base для legacy raw ultra явно неизвестен | PASS |

Для модели каталог может использовать opaque native row key: это идентификатор
выбора, не обещание effective model id. После смены model.id берётся только из
свежего native statusline. Состав primary/more не зашивается по PNG для других
аккаунтов; host получает реальное меню, включая прокручиваемые строки.
Для текущего native состояния effort и ultracode раздельны. В legacy raw ultra
не придумывать base effort или шестую точку: показывать Ultracode с неизвестным
base и прежним read-only режимом, пока новый host не дал независимый base/state.

Native primitives подтверждены без изменения кода продукта. T003 обязана воплотить
их в типизированной транзакции нового host: UUID/session/epoch/deadline, явный ACK,
свежий пустой idle и независимый read-back. Лабораторный observer не production API.

## 5. Совместимость версии и хуки (заполняет T001)

Статус: **PASS** исследовательского gate. Испытаны CLI 2.1.323, Desktop 5.11492.2.
Floor для нового канала — 2.1.323 плюс распознанная форма меню/idle и protocol host;
не точное равенство версии. Новый patch с известным frame допускается, unknown/
старый protocol/null/ниже floor — read-only «Версия или интерфейс Claude не распознаны».
Новая версия инвалидирует кэш. На Windows это CI/injected проверка, не live proof.

В реальном PTY найдены ASCII ESC ( B и служебные CSI r (только пустые параметры),
>0q, ?u, c, <u. Их точная нормализация в одноразовом observer дала valid=true на
idle, model/effort меню, Ultracode и всех mode. Исходный production TerminalScreen
без этого был invalid. T003 переносит поддержку в streaming parser, проверяет
разрыв последовательности между chunks и сохраняет отказ на unknown; regex на
отдельном chunk не является готовой реализацией. Детали/источники — канал T001.

Kit устанавливает только SessionStart/UserPromptSubmit/Stop. SessionStart один раз
сопоставил local/remote id. На исследованных native builtin/keys UserPromptSubmit/
Stop не пришли; оба обычных prompt дали пары hooks. На прямом provider native пути
очередь и autopilot не менялись. Sentinel до /effort status дошёл ровно один раз
со следующим обычным prompt. Дополнительные zero-inference пробы проверили sentinel
до model и во время effort menu, затем все controls: pending сохранялся, hooks не
появлялись. Тестовые sentinel последней пробы удалены штатным channel.forget при cleanup.

Обнаружен отдельный дефект обычного HTTP message route: /effort помечает turn working,
но native builtin не вызывает Stop, следующие команды остаются queued. Controls
не используют этот маршрут. T003 не вырезает slash-prefix у обычного prompt:
допуск определяется доверенной control-транзакцией. Вслед за ней реальный prompt
доставляется ровно один раз; T003/T006 сохраняют тесты очереди и barrier.

## 6. Бюджет генерации и согласие

Лимит M27: не более 2 коротких ходов T001 и 2 суммарно T006/T007 (4 всего), включая автоматические
bootstrap/приветствия. Модель только разрешённый аккаунтом Sonnet (alias sonnet,
resolved id записывается в evidence), fast=false; не Fable, без usage credits.
До первого запуска получить прямое разрешение пользователя на этот лимит либо
сослаться на уже данное применимое разрешение без повторного запроса. Сам выбор
спецификации/ревью не фиксирует такого разрешения. Если запуск сам посылает prompt,
он тоже расходует лимит, поэтому согласие проверяется до createSession.

Пример тестового запроса: «Ответь только OK, без инструментов». Ход ограничивается
коротким ответом, по рабочему проекту модель не действует. Любой автоподбор Fable,
fast=true, запрос credit consent или дополнительные ходы останавливают пробу до
решения пользователя. В T006 не повторять уже достаточный proof без новой причины;
оставшийся бюджет не является обязанностью тратить его. Fast и платные модели
проверяются metadata/read-back, не генерацией. Остальные переключения/control-команды
не считаются ходами только после подтверждения T001, что они не вызывают inference.

Применимое согласие получено в ходе T001 13.11.2026: пользователь прямо поручил
выполнить весь план самостоятельно и заранее согласился с решениями агента.
Использовано 2/2 хода T001, оба claude-sonnet-5-5, high, fast=false, ответ OK, без
инструментов. Bootstrap prompt отсутствовал. Дополнительных T001 model turns нет
без согласованного пересмотра бюджета. Хуки/sentinel и подсчёт — отчёт evidence M27.

## Поведение на ОС

| Исходные факты | macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- | --- |
| Версия/метаданные CLI | локально прочитаны | ещё не проверены вживую | ещё не проверены вживую |
| Host Kit | expect | expect | ConPTY |
| Новые setters | пока не доказаны | нужен injected linux и CI | нужен injected win32 и CI |
| Визуальный эталон | Claude Code Desktop/Remote Control | тот же браузерный UI Kit | тот же UI Kit; нативная живая приёмка отдельно |

Исходные контракты: provider-claude/parameters.md, interrupt.md, module.md;
M25-session-parameters-facts.md; session-chat/parameters.md. Прототип другой
надстройки или чужая переписка источниками не служат.
