# M27: контракт изменения параметров Claude

Часть [спецификации](../planning/M27-claude-native-controls.md). Полные требования
вынесены сюда для ограниченного пакета восстановления; они обязательны для T002–T006.
Выбор конкретной native команды подтверждает T001, интерфейс и гарантии заданы ниже.

### 2.4. Общий контракт и HTTP

provider-registry расширяет ParameterPresentation дискриминированным вариантом
{layout:'claude-controls', speedHint?}; существующий effort-card/access остаётся
обратно совместимым. Claude presentation использует items model/effort/speed/mode,
options/description/disabled/reason/confirm. Интерфейс не интерпретирует native id.
У всех обращений к access M26 появляется layout guard, включая аудит, старый UI
и provider-codex/parameter-update. Код Codex явно отклоняет ultracode также в смешанном
запросе с допустимой моделью, а не молча игнорирует новый ключ.

Только если таблица T001 доказывает соответствующий Ultracode API, ParameterId/ParameterChange и допустимые
ключи расширяются ultracode со строками on/off; в native запросе это boolean.
ChatGPT/Kimi этот ключ не принимают, неизвестное поле/недопустимое значение отказывает.
Отсутствующая presentation сохраняет M25 fallback, незнакомый layout не ломает ввод.

Маршрут GET/POST parameters и проверка project/localId/remoteId остаются общими.
readParameters не запускает программы, не открывает нативные меню и ничего не пишет;
используются снимки host/metadata и M25. Нет свежего наблюдения/каталога — причины
и прежние данные, без фальшивой актуальности от at=now. Старый снимок от другого
epoch или session не разрешает запись. Capability updateParameters объявляется
явно; конкретная сессия может оставаться только для чтения с объяснением.

POST Claude принимает одно из model/effort/speed/mode/ultracode за запрос плюс
confirmed; несколько изменений или legacy permissions/access отказывает до ввода
в native процесс. Так не обещается атомарная серия независимых TUI-команд.
Для обязательного нативного сопряжённого изменения перечитывается весь набор.
Аудит provider.parameters.changed содержит effective old/new, включая native
поправки, не текст переписки и не желаемые значения из тела запроса.

Существующие 400 parameter-invalid,409 confirmation-required,503 parameters-unavailable
сохраняются. Добавить 409 parameters-busy/parameters-stale и 504 parameters-timeout,
с явным mapping в parameter-routes и тестами, чтобы они не превращались в 502.
Понятные причины: «Claude ещё отвечает», «Claude ждёт решения в своём приложении»,
«Нативный ввод Claude занят», «Управление этой сессией недоступно»,
«Состояние Claude изменилось — повторите выбор». Успех очищает ошибку и молчит.

### 2.5. Native control и конкурентность

Основная точка изменения — существующий процесс, которым владеет Kit. Управляющий
адаптер выполняет проверенный T001 протокол и даёт независимое подтверждение.
Для PTY варианта выделить небольшие parameter-control/parameter-host файлы внутри
provider-claude, используя публичный TerminalScreen из pty-host. Обе платформенные
обвязки вызывают общий контроллер; не раздувать host/session.exp за 400 строк.

Запрос/ответ/снимок — ограниченные JSON с version, UUID, canonical session, epoch,
expires, typed operation/value. Атомарная запись, права по текущему контракту host;
метаданные не содержат сырых кадров/переписки/секретов. Snapshot отражает наблюдение
Claude, не копию отправленной команды. ACK о взятом запросе не является read-back.
В T002 общий арбитр сначала объединяет прежние direct send/Stop без новых setters;
в T003 к нему добавляются parameters. Все interrupt*/direct тесты проходят без
ослабления assertions, deadlines и поведенческих гарантий.
Один native control arbiter координирует parameters, direct send и Stop; одного
HTTP mutex parameters недостаточно. Перед каждой записью перепроверяются живой
host, epoch, актуальный экран, пустой input и отсутствие диалога/чужой транзакции.

В этой вехе setter начинает операцию только при подтверждённом idle. Во время
работы/permission/question/unknown — явный отказ, без постановки параметра в очередь
до неизвестного будущего хода и без Esc, чтобы очистить поле. Изменение не прерывает
работу. Свежий пользовательский ввод или изменение native state отменяет транзакцию.
Команда не может стать сообщением LLM или нажать пункт чужого диалога. Синтетические
команды не создают в канале Kit пользовательскую реплику/снятие барьера/продолжение
плана через хуки. T001 записывает реальные hooks в Kit-проекте. T003 меняет
agent-channel/autopilot/cli wiring при необходимости: служебное событие коррелируется
с доверенной pending-транзакцией UUID/session/epoch/expiry, не только текстом prompt.
Оно не вызывает beginTurn, не забирает очередь/ack, не снимает барьер, не включает
autopilot. Обычный похожий prompt не получает эту привилегию. После control реальное
сообщение доставляется ровно один раз; тест охватывает очередь до/во время операции.

Direct-send во время краткой управляющей транзакции удерживается штатной очередью
с прежними гарантиями доставки; файл не считается взятым, пока нельзя безопасно
вставить сообщение. Stop не вводит Esc в открытое меню настроек: сначала отмена
своей транзакции, затем штатная проверка конкретного native turn. Тайм-аут/смена
epoch/повтор UUID/падение host не повторяют команду и не убивают процесс.

Кэш настройки/каталога привязан к версии Claude, cwd/среде, canonical session и
идентичности host, не переносится в чужую папку/новый процесс. Допуск определяется
минимальной версией и распознанной сигнатурой из facts §5, не равенством 2.1.323. При restart очищается.
Кешированный statusline поддерживает контекст/лимиты, но не маскирует несостоявшийся
setter. user statusline wrapper и очистка родительских CLAUDE* переменных сохраняются.

### 2.6. Внешние сессии и старые host

Внешняя, остановленная или запущенная старым host беседа не захватывается скрыто.
Показывать параметры и точную причину недоступности изменения. Для старого host
предложить штатное возобновление панелью после остановки пользователем, в той же
local беседе; live работа и черновик не прерываются. Изменение новой/возобновлённой
управляемой беседы — обязательный сценарий приёмки. Миграцию/сопоставление Remote
Control id проверить существующим механизмом sessions/imports; не создавать второй
истории и не терять очередь. Ревьюер этого плана и другие рабочие беседы не служат
объектом переключения параметров или переустановки host.

## Поведение на ОС

Общий контракт одинаков на macOS/Linux/Windows x64 и ARM64. Host транспорта —
expect+Node на macOS/Linux, ConPTY+Node на Windows. Все ОС-ветки проверяются
с injected platform, программы включаются в platform-guard allowlist.

## Обязательные гарантии

Весь этот документ обязателен, профильные разделы читаются через task context.
T001 фиксирует допустимый канал и наблюдённые hooks/encoding; T002 сохраняет send/Stop,
T003 реализует транзакцию/корреляцию hooks, T004 — state/API, T005 — UI, T006 — proof/QA.
Gate и бюджет — facts §3–§6; native геометрия/темы — claude-visual-reference.md.
Ни одна ссылка на PENDING не означает готовности; при блокере T001 не коммитится.
На Windows нет объявления live-проверки по одному CI; неизвестный ConPTY frame
всегда даёт read-only независимо от версии и результатов тестов.

## Наблюдение T001 от 13.11.2026

Исследовательский gate PASS: [отчёт](../evidence/M27-claude-native-controls.md),
facts §4/§5, [native канал](M27/claude-native-channel.md) и visual contract заполнены.
В production коде T001 setters нет. T003 переносит доказанные primitives и exact
нормализацию служебных terminal sequences в streaming engine; чужой frame отказывает.
Минимальная испытанная версия 2.1.323 + shape/protocol, не exact version equality.

Model/effort выбираются через picker + s; model More models раскрывается Enter
только при Enter to expand. Enter на строке модели сохраняет default и запрещён.
Native model catalog может иметь opaque keys выбора; labels/aliases не effective id.
Если options используют такие keys, у options добавляется selected (и group primary/
more для native меню), а item.value продолжает отражать фактический native model.id.
Claude UI использует selected; Codex сохраняет прежнее сравнение value. Аудит хранит
фактические old/new. Не зашивать перечень версий моделей со скриншота в allowlist.

Ultracode имеет отдельный switch и on/off API; effort при переключении остаётся high.
Legacy raw ultra подписывается Ultracode, неизвестный base не выдумывается. Fast
в этом аккаунте native недоступен до usage credits, которые не включались. Native
RC bypass не предлагает. Mode читается из свежего host footer, не старого transcript
permission-mode; исходный M25 reader может отставать до следующего обычного prompt.

Обычный HTTP user message route нельзя использовать для controls: он помечает
builtin /effort как working без последующего Stop. Native control route не делает
beginTurn/queue ACK/resumeDelivery и не вводит исключение для любого slash-prefix.
Живые пробы очереди и обратной GUI-смены не потребовали новых model turns: T001 2/2.
Native menus/disabled получены после AX_TRUSTED=true; test cloud archive подтверждён
отдельно по native Unarchive/archived state, не по одному локальному purge.

## Реализация T002

Общий NativeControlArbiter в #pty-host и per-runtime wrapper Claude объединяют
существующий send/Stop по canonical debugFile; aliases не обходят lease. FIFO send
одного sid сохраняется и при resolve/resume. AbortSignal отменяет ожидающий Stop
по исходному deadline; новая epoch за время ожидания даёт stale, не Esc в новый ход.
Начатая операция освобождает lease только после cleanup. Новых parameters API,
терминальных последовательностей и изменений user message route в T002 нет.

### Реализация T003

Per-launch `controlHostId`, `.parameters-native/state/request/result/cancel` и общий
ParameterEngine воплощают протокол. Worker публикует pending до ввода, host проверяет
revision после drain и перед записью. Каталоги читаются host в собственном idle,
GET их не открывает. Старый host без binding остаётся read-only. Typed builtin paste
отделён от Enter проверкой собственного echoed input. Model/effort — только `s`,
mode — footer, Ultracode — ACK плюс отдельный marker/base; request echo не proof.
CLI guard проверяет доверенную транзакцию до channel/titles/autopilot. Обычный prompt
с похожим текстом проходит обычный канал. Cancel/timeout не повторяет setter.

### Реализация T004

Provider.readParameters объединяет M25 context/limits с новым native snapshot;
старые host остаются read-only, raw ultra не получает выдуманный base. POST принимает
одно поле, проверяет actual options и после ACK перечитывает весь набор. Model
options имеют opaque value + selected/group, effective item.value остаётся model.id.
Recommended получается из native description preview. Claude presentation не имеет
access; все M26 consumers проверяют effort-card. Codex отвергает ultracode до RPC.
HTTP явно сохраняет 400/409/503/504 и аудит только фактических изменений items.
