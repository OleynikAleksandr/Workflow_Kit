# M27: доказательства нативных контролов Claude

## Статус T001

13.11.2026: исследовательский gate **PASS** после устранения системного блокера.
Первоначальная блокировка task:block/revision 863 снята task:unblock/revision 864
после явного сообщения пользователя о включении codex в настройках macOS.
Функциональный код и установленная 0.12.1 в T001 не менялись. T002 и поставка
0.13.0 выполняются следующими задачами; исследование не выдаётся за готовую функцию.

Пользователь прямо подтвердил в этом ходе: «Весь план выполняй самостоятельно
без привлечения меня к каким-то выборам вплоть до сборки нового релиза, пожалуйста.
Принимай все решения самостоятельно. Я совсем заранее согласен». Это применимое
согласие на две короткие безопасные Sonnet-пробы из facts §6, не разрешение
включать usage credits или выдавать непроверенный этап за завершённый.

## Стенд и ограничения наблюдения

- macOS; установленный Kit 0.12.1; исходники на HEAD начала задачи `33e3735f`.
- Claude CLI 2.1.323, Claude Desktop 5.11492.2, Claude Max.
- Уникальный проект `33d94fb00149`, временная папка
  `/Users/oleksandroliinyk/WorkflowKitProjects/M27_native_probe_Tzo8Bp/project`.
- `createApp` с изолированными WFK_DATA_DIR/портом 57160, только Claude provider.
  Публичные kit.install/installStructure установили настоящий Kit и его hooks.
  Scoped trust — штатные previewTrust/grantTrust; чужой trust не переписывался.
- Public createClaudeProvider → provider.createSession → штатный startSessionProcess.
  Одноразовая expect-обёртка **source** подключала неизменённый production session.exp,
  dialogs/interrupt worker, --settings statusline и Remote Control. Она наблюдала
  поток собственного PTY и отправляла ограниченные тестовые клавиши. Это лабораторный
  прототип транспорта, не реализация production setter и не доказательство ConPTY.
- Local id `3c19d746-45cf-4488-93db-b41cf611ba49`, Remote Control id
  `session_01EyVab9pcPu9dj4vsYZgFHd`, expect PID 10313, Claude PID 10318
  сохранялись во всех переключениях и двух ответах. Идущий Claude не перезапускался.
- Ради sentinel-наблюдения перезапускался только собственный изолированный backend
  с тем же портом; неизменность native id/PID подтверждена. Рабочая служба не тронута.
- Диагностика hooks — пассивная обёртка публичного router.match, работающие обработчики
  не заменялись. Метаданные — public provider.readParameters/readMessages,
  readSnapshot/snapshotFile и вход собственного локального statusline. Сырые чужие
  журналы/транскрипты/авторизация не читались.
- [Наблюдения](M27/native-probe-observations.json),
  [исходник временного стенда](M27/probe-harness.md),
  [локальная очистка](M27/local-cleanup.json).

## Что фактически удалось доказать

| Проверка | Наблюдение | Предел вывода |
| --- | --- | --- |
| Effort | `/effort`, Right, `s`: medium → high, native «this session only»; `/effort status` и reader: high | Native primitive и GUI reverse подтверждены |
| Model | `/model`, Down, `s`: Sonnet 5.5 → Haiku 5.5; обратно Up, `s`: Sonnet | Ни одной генерации на Haiku; та же беседа, user defaults не менялись |
| Следующий ход | Два ответа OK, resolved `claude-sonnet-5-5`, effort high, fast=false | Фактический бюджет T001 исчерпан: 2/2 |
| Ultracode | `/effort ultracode` и `/effort ultracode off`: native on/off, effort остаётся high | В Desktop composer отдельная подпись High · Ultracode; это не шестой уровень |
| Raw effort | Реальный statusline при Ultracode on: `effort.level=high`, fast_mode=false, отдельного ultracode ключа нет | Исторический raw ultra в этой пробе не воспроизведён; не угадывать его base effort |
| Fast | `/fast`: «Fast mode requires usage credits»; доступно только Esc | NATIVE_UNAVAILABLE в этом аккаунте; кредиты не включались, платных ходов нет |
| Mode | Shift+Tab: Auto → Manual → Accept edits → Plan → Auto | Нативные заголовки меняются сразу; M25 reader обновляет permission mode только после обычного prompt |
| Defaults | SHA-256 `~/.claude/settings.json` неизменен во всех снимках и после purge | Полный файл не восстанавливался из старой копии |
| История | Public readMessages: два user/assistant OK, прежний local id | Не SDK-копия и не новый разговор после переключения |

Короткий native ответ о сохранении выбора и свежий statusline/read-back различаются
от последнего assistant record. Для mode обнаружен конкретный лаг M25: после
Auto → Manual terminal уже Manual, reader до следующего prompt ещё Auto; после
обычного хода reader возвращает `default`. Этот reader нельзя использовать как
немедленный ACK. После следующих циклов без новых ходов legacy mode снова устарел.

## Хуки, очередь и автопилот

В наблюдённых `/model` picker + `s`, `/effort` + `s`, `/effort status`, Ultracode on/off,
открытии/отмене `/fast` и Shift+Tab **не было HTTP UserPromptSubmit/Stop**. На двух
обычных prompt наблюдатель зафиксировал обе пары prompt/Stop, то есть отсутствие
событий на builtin-командах не объясняется неработающим наблюдателем. SessionStart
сработал: provider сопоставил local id и Remote Control через штатный журнал хука.
Иные plugin hooks целиком не инструментировались — универсальное отсутствие
всех возможных событий не заявляется.

Sentinel `M27_SENTINEL_CONTROL` через public channel.enqueue был в очереди до
`/effort status`. После команды: pending=1, waiting, автопилот пустой, новых hooks нет.
Следующий обычный prompt получил sentinel ровно один раз: 1 в HTTP-ответе prompt,
0 в Stop, pending=0, waiting, автопилот enabled=false/continues=0, второй ответ OK.
В продолжении после AX-разрешения отдельно проверены два sentinel: до /model
и во время /effort; затем effort/Ultracode/modes/fast оставили pending=2 и waiting.
Сами тестовые сообщения удалены при cleanup через channel.forget без генерации.
Это исследовательский proof, не финальная регрессия production T003/T006. Корреляция UUID/session/epoch остаётся обязательной частью плана.

## Устранение блокеров и вход T002

После указания точного codex executable пользователь включил системный доступ и
прямо поручил продолжить весь план до релиза. AX_TRUSTED=true проверено; native
меню открыты через Accessibility + CGEvent. Получены все обязательные PNG,
More models дополнительно: [визуальный контракт](../design/M27/claude-visual-reference.md).
Браузерный login не потребовался; приватные cloud API/учётные данные не использовались.

1. GUI effort medium→high прочитан тем же provider reader; GUI model Sonnet→Opus→Sonnet
   дал fresh model.id, defaults hash прежний. Дополнительно TUI More models раскрыт,
   выбрана Sonnet 5 через s, затем из Desktop восстановлена Sonnet 5.5 в той же беседе.
2. Точная причина invalid найдена в реальном PTY: ASCII designation и служебные CSI.
   Временный observer нормализовал только известные последовательности. Реальные
   menu/idle/effort/model/Ultracode/mode дали valid=true, без сброса unknown флага
   вручную. Production parser не менялся; streaming реализация с split/unknown
   тестами остаётся T003. Floor 2.1.323 + известная shape/protocol, не exact equality.
3. Ultracode on/off сохраняет base high, native UI — отдельный switch. Raw ultra в
   этой версии не воспроизведён: в legacy сохраняется подпись Ultracode, неизвестный
   base не выдумывается. Новый host передаёт раздельные подтверждённые поля.
4. Дополнительные пробные процессы не получали bootstrap/обычных prompt: normalized
   readMessages последней пробы пуст, Kit prompt/Stop отсутствуют. Бюджет T001 2/2,
   дополнительные model turns 0. Остаток всей M27 — 2 суммарно T006/T007.
5. Cloud archive подтверждён **отдельно в native UI** по Unarchive/archived state
   всех своих карточек и отсутствию в active sidebar. Прежнее предположение, что
   потребуется ручное архивирование, не понадобилось: в этих пробах stop приводил
   к native archive. Сам purge по-прежнему не считается доказательством cloud archive.
6. Обычный HTTP message route для /effort воспроизвёл working без Stop и pending=3.
   Три команды не исполнялись, LLM не запускалась. Изолированный backend остановлен,
   его in-memory очередь сброшена. Production parameters используют отдельную
   доверенную транзакцию, а не HTTP user message и не исключение по slash-prefix.

Артефакты: [GUI round trip](M27/native-gui-roundtrip.json),
[нормализованный терминал](M27/normalized-terminal-probe.json),
[прямые native controls](M27/normalized-native-direct.json),
[model/mode](M27/normalized-model-mode.json),
[More models и очередь](M27/more-models-queue-probe.json),
[очередь до/во время всех controls](M27/queue-during-all-controls.json),
[дефект user message route](M27/generic-message-control-regression.json),
[нулевая дополнительная генерация](M27/extra-probe-inference.json),
[финальная очистка](M27/final-native-cleanup.json).
Допустимый primitive и ограничения — [native канал](../design/M27/claude-native-channel.md).

## Очистка

Штатные provider.archiveSessions/stopSession/deleteSessions вернули local-data,
процессы собственного supervisor отсутствуют, trust временной папки trusted=false
(осталось только прежнее наследование домашней папки). PID 10313/10318 и изолированный
backend 13452 отсутствуют. После остановки observer/backend удалена только созданная
временная папка. Собственный браузерный probe tab закрыт; defaults hash сохранён.
Первоначально cloud archive был не подтверждён; после AX-доступа проверен native UI.
Всего исследованы собственные Remote Control id: 01EyVab9pcPu9dj4vsYZgFHd,
01EyVab99xhLNazaLNfN4RgG, 01EyVab7GyKcRmkHamgnMVeP, 01EyVab63yCpNYLoBgKCfYF3.
Все архивированы, активных пробных карточек нет. Повторная временная папка
M27_native_probe_wnkIrA и её scoped trust/processes удалены; чужие записи сохранены.

## Поведение на ОС и следующая проверка

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| Реальные CLI/PTY пробы, два Sonnet-хода, native GUI и cleanup подтверждены | Не выполнялось; далее CI/injected linux | Не выполнялось; далее CI/injected win32 и отдельный Windows tester |

За текущий ход нет утверждения о новой функции на любой ОС, зелёной CI или готовой
поставке. Native UI macOS/iPad проверяет пользователь; Windows — проверяющий,
Linux остаётся CI-only. Неизвестный frame/старый host остаётся read-only. T001 не
проверяет новую производственную функцию: UUID/races/ошибки/регрессии — T003–T006.

## T002: общий арбитр send/Stop

Добавлен общий per-host FIFO с отменой ожидающего admission; Claude local/remote
aliases используют одну lease, очередность send одного sid сохраняется. Прежние
.text/.interrupt и подтверждения остаются; новые параметры здесь не реализованы.
Новые проверки: alias race на injected darwin/linux/win32 без потери/дублирования
сообщений, отмена очереди, ошибка/освобождение, active lease, deadline Stop и новая
epoch во время ожидания. Существующие interrupt*/direct tests не ослаблялись.

Проверено перед коммитом T002: целевые native-arbiter/direct/interrupt/control/host
28/28 без пропусков; npm run check:platforms — ok. Проверки workflow commit
выполняются штатным профилем; native Windows live по этим тестам не заявляется.

## T003: native transactions и hooks

Общий ParameterEngine получает bounded native statusline с per-host UUID и проверяет
floor 2.1.323 плюс форму экрана. Каталог модели раскрывается/прокручивается, effort
берётся из native menu. Model/effort используют `s`, mode — Shift+Tab/footer,
Ultracode — отдельный builtin/ACK/base. Fast account restriction не обходится.
Unix worker и ConPTY используют один engine, ввод отделён от Enter, stale revision
не пишет клавишу. Cancel/timeout закрывает только собственное известное меню,
неизвестный экран удерживает legacy files. Старые host не становятся editable.

Проверены compatible patch, old/unknown version/frame, draft/busy/dialog, UUID/session/
epoch/deadline, повтор UUID, поздний экран, независимый read-back, More models,
побайтовые границы nonvisual controls; реальные обезличенные frame T001 тоже читаются.
Injected darwin/linux/win32: trusted hook guard не трогает channel/barrier/ack,
похожие обычные prompts не привилегированы, sentinels до/во время control доставлены
ровно один раз на обычном prompt. Direct при занятом арбитре возвращается в очередь.
Исходные interrupt*/direct assertions проходят, пользовательская statusline сохраняет
байты/ошибки. Это автоматизированная проверка; live нового host — T006/T007,
Windows live остаётся задачей проверяющего, Linux — CI.

## T004: effective state и HTTP

Claude-controls объединяет source native snapshot и M25 context/limits. Effective
model.id отделён от opaque option key; explicit selected/group и recommended из
native preview. Ultracode не меняет базовый effort, legacy raw ultra оставляет
base неизвестным. Fast требует доказанной доступности и здесь disabled с причиной.
Старый/stale host не становится editable, GET не открывает native меню/программы.

Injected darwin/linux/win32 тесты: одно изменение, unsupported/mixed поля, старый
host, busy/stale, native result и сохранение unrelated model/effort/context/limits.
Общие HTTP тесты проверили ownership/canonical alias, очередь и effective audit,
явные 400/409/503/504 и отсутствие access у Claude layout. Codex отвергает ultracode
до RPC, включая mixed model; M26 access assertions сохранены с layout guard.

## T005: Claude composer

Реальный composer с подменой только I/O: model → Effort/More models, отдельный Mode,
Ultracode on/off с сохранением High, native descriptions/recommended, один popup,
Esc/back/outside, quiet success и видимая ошибка; исходник claude-controls.browser.js.
DPR2 1542×1049 и touch 375×667: active options, минимум 44px, все четыре границы
popup. Исправлено смещение narrow popup после раскрытия; проверка границ добавлена.
Polling >5с сохранил идентичность DOM строки High и keyboard focus; draft сохранён.
Снимки claude-{effort,mode}-{source,touch}.png. Полная visual QA — T006.

Прежний native-controls.browser.js M26/R2 повторно прошёл обе темы: настоящий
thumb drag в обе стороны/вне трека, preview без POST, один POST после release,
polling во время захвата, Home/End/track click, Escape/blur/pointercancel/lostcapture,
quiet success и ошибки. Browser/CSP errors отсутствовали. Это изолированный Chromium,
не live iPad или Windows. Статика общая для трёх ОС.

## T006: native production roundtrip и QA

`native-production-final.json`: 12 успешных typed операций, model catalogue 13
после каждой, local 25000cf0-7ca3-4014-b6df-ce3735e34961, remote
session_01EyVab9SoDubn2f1J6Erx37, host 65986/Claude 65991. Один процесс и defaults
не менялись. Medium/High, Ultracode on/off, четыре mode, Haiku5.5, More models
Sonnet5, возврат Sonnet5.5/high. Controls не вызвали prompt/Stop и не начали inference.
Два сообщения поставлены до и внутри native Effort; настоящий следующий prompt-hook
содержал ровно 2 sentinel, Stop 0, pending 0. Sonnet5.5/high/fast=false ответил OK,
ChatPage содержит 2 сообщения user/assistant. T006 расход 1, T007 остаётся 1 из лимита 2.
Observer собственной пробы только копировал DATA, не менял production ключи/frame.

Первые неудачи сохранены: native-production-roundtrip.json и phase2 — до уточнения
точного ACK; before-cache-fix.json — успешные операции до исправления partial catalogue.
Найдены и исправлены: ожидание стабильного Ink кадра 200 мс, singular +1 model,
событийный statusline без ложной idle expiry, разные ACK model/Ultracode off,
неизменность полного каталога при setter-навигации. Unit fixtures теперь повторяют
фактические native строки; stale/unknown/foreign menu по-прежнему отказывают.
No-op не отправляет builtin и не обещает ненужный новый ACK.

`native-gui-final.json`: Medium из Desktop прочитан Kit, API вернул High, PID тот же,
нового хода нет. `native-gui-back-production.json` отдельно фиксирует Desktop
Haiku→Sonnet и обновление связанных каталогов. `native-production-cleanup.json`:
processes 0 / trust false/defaults прежние, native Unarchive и отсутствие собственных
проб в active sidebar. Пять временных папок удалены; дополнительные diagnostic hosts
не генерировали. Purge удалил local data, удаления серверных карточек не заявляем.

Visual QA: design-qa.md passed. Совместные boards effort/mode/more-comparison-final,
12 dark/light responsive cases в browser-responsive.json, пять размеров и 200% CSS
эквивалент. P1 narrow clipping и P2 density/width/asset/antialiasing исправлены.
Home/End ограничены активным submenu; touch 44, Esc/back/outside, один popup,
focus/draft/polling, quiet success и ошибка проверены. M26/R2 thumb drag сохранён.
macOS native проверена агентом, user acceptance отдельно; Windows live ждёт
проверяющего, Linux только CI. Светлая native pixel fidelity не заявляется.

## DOCS-R1: сверка документации

README перечитан целиком. Полностью сверены docs/setup.md, usage.md и installation.md
с кодом и реальными пробами. Версионные руководства пока относятся к установленной
0.12.1: их переключение на0.13.0, замена прежнего описания read-only Claude в usage
и уточнение minimum/new host в setup/installation входят в T007 (его allowed files).
README отделяет готовые исходники M27 от ещё не выполненной поставки/CI. Shared
contracts/spec/facts/visual QA согласованы; пользовательская приёмка и закрытие не
подменяются успешными тестами. Новый budget: T0061, T007 максимум1, без дополнительных
Sonnet/Fable/fast ходов в DOCS.
