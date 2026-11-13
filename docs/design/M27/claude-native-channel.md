# M27: доказанный нативный канал T001

13.11.2026, CLI 2.1.323. Transport — существующий интерактивный PTY процесса Kit;
проверочный source-wrapper подключает неизменённый session.exp и отдельный observer.
Ни SDK-копии, ни attach к приватному cloud endpoint нет. Производственная типизация,
арбитраж и ACK реализуются только T003; здесь зафиксирован исследованный native primitive.

## Команды и независимый результат

| Действие | Ввод в подтверждённый пустой idle | Подтверждение |
| --- | --- | --- |
| Модель | /model → навигация к точной строке → s | Native Set model … for this session only + свежий model.id/display_name из statusline |
| Дополнительная модель | В /model выбрать More models, Enter только при подсказке Enter to expand; затем строка → s | Тот же native ACK; Enter на строке модели запрещён, поскольку сохраняет default |
| Effort | /effort → Left/Right до нужной точки → s | Native Set effort … (this session only), /effort status и свежий effort.level |
| Ultracode | /effort ultracode или /effort ultracode off | Native on/off, base effort сохраняется; отдельный маркер ultracode в footer/рамке |
| Mode | Shift+Tab до выбранного разрешённого native mode, проверять каждый шаг | Текущий footer auto/manual/accept edits/plan; legacy transcript mode не немедленный ACK |
| Fast | /fast — только исследование доступности, Esc для отмены | В этом аккаунте Fast mode requires usage credits. Нет session-local writable primitive, поскольку native сама не предоставляет функцию |

Каталог /model раскрывает More models и прокручивается: UI показывает лишь часть строк
и «… +N models». Получать видимые строки с номерами/подписями до конца, исключать служебную
строку More models и TUI-only Default из основной Desktop-группы. Не выдавать её номер,
label или alias за effective model id. Допустим opaque key строки native каталога:
его валидирует сервер, а после выбора effective id читается отдельно. Недоказанный
каталог/двусмысленная строка — отказ, не произвольная /model <строка>.

## Распознавание терминала

Первоначальный TerminalScreen помечал реальный native экран invalid. Причины найдены
в реальном потоке: ASCII charset designation ESC ( B и служебные CSI. Одноразовый
observer удалял **только** ESC ( B, CSI r без параметров, CSI >0q, CSI ?u, CSI c, CSI <u.
С тем же публичным TerminalScreen реальные menu/idle/effort/model/mode/Ultracode
кадры стали valid=true. Исходники продукта T001 не меняла.

Объяснение: ESC ( B назначает ASCII, пустой CSI r восстанавливает полный scroll region,
CSI c запрашивает device attributes; >0q — запрос версии терминала; ?u/<u — query/pop
keyboard protocol. Не удалять похожие неизвестные команды или непустой scroll region.
В T003 реализовать это **в streaming parser**, включая split escape между chunks,
а не regex на независимом chunk. Неизвестная команда/форма остаётся invalid.
Источники: [XTerm control sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html),
[kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/).

Допуск: floor 2.1.323 (минимальная реально испытанная версия), плюс известная форма
native экрана и нового протокола host. Не точное равенство версии: новый patch с той
же сигнатурой разрешается; null/ниже floor/чужая форма — read-only. Это не утверждение
о живой проверке будущего patch. Проверки нового patch/unknown/split — T003.

## Изоляция и очередь

Встроенные команды не вызвали установленные Kit UserPromptSubmit/Stop; SessionStart
однократно записал identity при запуске. Обычные два prompt дали обе пары hooks.
Прямой provider.sendDirect сохранил очередь и не начал ход. **HTTP user message route**
для /effort начал turn без последующего Stop и накопил очередь — этот путь нельзя
использовать для controls. Изолированный backend остановлен, его тестовая очередь
сброшена без новой генерации. T003 использует доверенную native control-транзакцию,
а не пользовательский маршрут и не привилегию по одному slash-префиксу.

До/во время управляющей операции queued sentinel остаётся в очереди. Отдельной
проверкой подтверждено: следующий обычный prompt получает сообщение ровно один раз.
Дополнительные zero-inference пробы не расходуют новые model turns; T001 остаётся 2/2.

## Поведение на ОС

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| Реальные expect probes + native Desktop PNG | Тот же state machine, injected linux/CI в T003 | ConPTY вызывает тот же engine; injected win32/CI, живой tester отдельно |

Не заявлять живую Windows-проверку или разрешать неизвестный ConPTY экран по одному
номеру версии. Нет нового host protocol — read-only; идущие рабочие сессии не перезапускать.
