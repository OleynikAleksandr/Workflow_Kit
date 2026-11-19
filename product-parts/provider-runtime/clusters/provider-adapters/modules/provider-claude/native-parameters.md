# Нативные параметры Claude (M27–M29)

Часть контракта модуля [provider-claude](module.md): собственный host панели, движок нативных
меню и чтение параметров для панели. Общие параметры M25 (снимок statusline, транскрипт,
лимиты) — [parameters.md](parameters.md), Stop и границы хода — [interrupt.md](interrupt.md).

## Host и движок (M27/T003)

Новый собственный host получает UUID `controlHostId` и per-launch native statusline:
CLI обёртка сохраняет identity/model/effort/fast, затем делегирует прежнюю строку.
`pty/parameter-{protocol,screen,engine,files}.ts` — общий контроллер expect/ConPTY:
свежий пустой idle, floor 2.1.323 плюс известный frame, UUID/session/epoch/deadline,
каталог из `/model` с More models/scroll и `/effort`. Enter разрешён только для
открытия builtin и раскрытия More models; модель/effort сохраняются клавишей `s`.
Ultracode — отдельный session-only builtin; mode — Shift+Tab с footer read-back.
Fast не включается: account prohibition либо недоказанный session-local путь.
Метаданные не содержат переписки. ACK + независимое наблюдение обязательны.
При отмене Esc закрывает только собственное распознанное меню; неизвестный экран
удерживает legacy input files. Стоп отменяет control перед общим FIFO; direct
имеет ограниченное ожидание admission и возвращает текст в обычную очередь.
`nativeControlHook` проверяет live owned host, session UUID, epoch и expires;
неожиданный hook отменяет control до channel/autopilot, без slash-prefix exemption.
На macOS/Linux worker отдаёт предложенную клавишу после повторного drain; Windows
вызывает тот же engine и проверяет revision непосредственно перед term.write.
Одинаковые ограничения на трёх ОС; Windows live ждёт отдельного проверяющего.

M27/T004: `parameter-controls.ts` объединяет read-only M25 context/limits и свежий
native state. `readParameters` не открывает меню; source timestamp не заменяется
временем GET. Старый host/raw ultra сохраняет подпись Ultracode и неизвестный base.
`updateParameters` принимает ровно одно поле model/effort/speed/mode/ultracode плюс
confirmed, проверяет native options и перечитывает весь effective набор. Model id
не равен opaque row key: selected/group передаются отдельно. Recommended effort
читается preview-проходом описаний native меню без `s`/изменения defaults.
Ошибки переводятся в parameter-invalid / parameters-busy/stale/unavailable/timeout.
Capability требует CLI floor и pty; конкретный host может оставаться read-only.
Одинаковый контракт на трёх ОС, live Windows ожидается.

M27/T005: адаптер упорядочивает только имеющиеся primary families как Desktop RC:
Opus/Fable/Sonnet/Haiku, прочие сохраняют порядок. Каталог и effective id не меняются;
More models остаётся в native порядке. UI не интерпретирует provider id/модель.

M27/T006: стабильный frame200мс, событийный statusline, точные native ACK и no-op;
частичный viewport не портит каталог. Уточнения — контракт M27, раздел T006.

M28/T002: `contextUsage` — контекст от порога автосжатия (parameters.md).

M28/T003: границы хода — `<debug>.turn` (interrupt.md, parameters.md).

M28/T004: доставка и `turnState` — sessions.md.

M28/T005: Stop весь ход — interrupt.md.

M28/T010, T012 — interrupt.md; T014 — parameters.md.

## Желаемые значения и каталог (M29/T002)

- **Файл желаемых значений** `<debug>.parameters-wanted` (`PARAMETER_WANTED`, пишет только
  служба): `{ version: 1, hostId, sessionId, changes, ids }`, на поле — последнее значение
  пользователя и UUID выбора (`validWanted`). Хост читает его при каждом опросе
  (`ParameterEngine.want`) и применяет по одному полю в порядке `WANTED_ORDER`: `model`,
  `ultracode`, `effort`, `mode` (`pursue`), только на свободном пустом вводе. Значение, которое
  уже действует, отмечается `applied` без клавиш. Учёт — `WantedChoices` (`parameter-wanted.ts`).
- **Статусы** — в снимке состояния: `wanted[field] = { id, value, status, reason, attempts }`,
  `status` — `pending`, `applying`, `applied`, `failed`. Хост не правит файл; применённый или
  отклонённый `id` повторно не применяется. Отмена вводом пользователя, Stop или началом хода
  — снова `pending` без счёта; иные неудачи считаются, после `WANTED_ATTEMPTS` (3) — `failed`
  с причиной. Значение вне каталога — сразу `failed`. Срок ожидания не ограничен, пока жив хост.
- **Каталог** `<debug>.parameters-catalog` (`PARAMETER_CATALOG`, `validCatalog`):
  `{ version: 1, cliVersion, primaryLast, models[{ key, label, group, index }], efforts{ label:
  { values, recommended, ultracode } } }`. Хост читает его один раз на версию CLI
  (`loadCatalog`); совпала версия — меню не открываются. Иначе модели читаются один раз, а
  усилия — один раз на модель (`discover`: `catalog`, затем `efforts`). Изменение знаний
  (`catalogRevision`) хост записывает в тот же файл (`exportCatalog`).
- **Короткий путь модели** (`seek`): меню `/model` открыто на текущей модели, хост жмёт стрелку к
  номеру строки цели из каталога и проверяет подпись перед `s`; «More models» раскрывается
  Enter на своей строке только для её моделей. Строка с номером цели, но другой подписью —
  «Каталог Claude изменился»: каталог перечитывается. После смены модели `/effort` открывается,
  только если её усилия неизвестны.
- **Диалог «Switch model?»** (Claude 2.1.325, M29/T005): в разговоре с кэшем после `s` Claude
  спрашивает «Yes, switch to <модель>» / «No, go back». Кадр `switch` (`switchTo`, `selected`)
  подтверждается Enter, только если подпись совпала с целью и выбрана строка 1; иначе транзакция
  отменяется, диалог закрывается Esc, неудача считается. `yieldToUser` считает его меню.
- **Подтверждение модели** (M29/T005): строка «Set model to <модель> for this session only» с именем
  цели. Statusline не требуется: в режиме plan Claude показывает в нём свою модель плана
  (живая проверка: Haiku → Sonnet 5.5 в plan). Усилия новой модели дочитывает `discover` после
  транзакции; `pursue` не обгоняет поле, которое ждёт каталог (порядок `WANTED_ORDER`).
- **Без служебных строк в ленте Desktop** (M30/T001). Desktop показывает записи `/effort` и
  системное «Kept model as …» (выход из `/model` по Esc), но не показывает `/model` с `s`. Поэтому:
  - кадр `model` читает строку усилия («◐ Medium effort (default) ←/→ to adjust»): `effortLevel`,
    `effortDefault`; строки моделей получают `checked` (✔ модели сессии);
  - `effortLevels` (`parameter-menu.ts`): ← до упора, → до упора (клавиша на краю ничего не меняет,
    шаг `quiet` 400 мс), уровни и «(default)» записываются, исходный уровень возвращается; нет
    строки — `values: []` (у модели нет выбора усилия);
  - каталог после обхода моделей возвращается на строку ✔, читает её уровни и закрывает меню `s`;
    нет строки ✔ — прежний выход Esc;
  - чтение усилий модели (`discover` `efforts`) — `/model` на текущей строке, уровни, `s`;
  - смена усилия — `/model`, ←/→ до цели, `s`; подтверждение «… for this session only with <уровень>
    effort» и statusline; неизвестные уровни новой модели читает обнаружение после смены модели
    (`/model`, уровни, `s`), чтобы смена укладывалась в 3 с;
  - `/effort` открывается только для `/effort ultracode [off]`; доступность Ultracode без `/effort`:
    из кэша, иначе у моделей со строкой усилия. Отмена внутри `/model` закрывает его Esc.
- **Темп** (M29/T005): после продвижения шага движок сразу предлагает следующий. Занятый хост
  опрашивается раз в `PACE_MS` = 100 мс: на macOS и Linux паузу выдерживает `interrupt-worker.ts`
  (таймер Node точен, `after 100` в Tcl 8.5 на macOS длится около 250 мс), на Windows — `runHost`.
- `/fast` не открывается: `fastReason` постоянный (`FAST_REASON`). Последний подтверждённый
  режим остаётся в снимке, пока кадр без строки режима (меню, перерисовка); для клавиш
  `ready()` по-прежнему требует строку режима как признак корня ввода.
- `.parameters-request` прежней синхронной транзакции больше нет (M29/T003).
- **ОС.** Логика общая для expect-хоста (macOS, Linux) и ConPTY (Windows). Windows-хост
  заменяет файлы через `replaceFile`: запись `<file>.partial` и `rename` с повтором при
  `EPERM`, `EBUSY`, `EACCES` (до пяти попыток).

## Служба: ответ сразу (M29/T003)

- `native-wanted.ts` — единственный писатель `.parameters-wanted`, по замку на файл:
  `mergeWanted` (новый выбор поля с новым UUID), `dropWanted` (выбран подтверждённый
  вариант), `pruneWanted` (по снимку хоста убирает поля с `applied` или `failed` своего
  `id` и файл чужого хоста или сессии). Кэш каталога — `<stateDir>/claude-native-catalog.json`
  (`CATALOG_CACHE`): `saveCatalog` берёт каталог хоста (та же версия CLI — усилия моделей
  объединяются), `seedCatalog` кладёт кэш рядом с debug-файлом при запуске сессии.
- `readParameters`: снимок без `wantedFile` (хост 0.13.2 и старше) — только чтение с причиной
  `HOST_REQUIRED`. Иначе меню — из каталога хоста или кэша той же версии CLI; занятость Claude
  меню не блокирует. Поле из файла желаемых значений — `pending { value, label, note }`,
  `note` по снимку (`pendingNote`): «применяется», «применится, когда Claude закончит ответ»,
  «применится, когда поле ввода Claude опустеет», «применится, когда Claude освободится».
  Отказ хоста — `failures` на `FAILURE_MS` (60 с). Скорость — только чтение, причина
  `FAST_REASON`.
- `updateParameters` проверяет вариант и сразу возвращает `readParameters`: подтверждённое
  значение снимает ожидание поля, иное — записывается в файл желаемых значений. Ошибки только
  400 (неверное значение) и 503 (нет хоста, вариант недоступен); ожидания хоста нет.
  `applyNativeParameter` удалена, `cancelNativeParameters(rt, debug, hostId)` отменяет
  текущую транзакцию хоста (хук пользователя, Stop, прямое сообщение).
- **ОС.** Одинаково: файлы через `writeNativeJson` (запись `.partial`, затем `rename`),
  пути — `path`.

## Уступка терминала (M45/T001)

Терминал Claude общий: в него пишут десктоп и iPad (Remote Control, мимо терминала), панель
(вставка `.text`) и хост параметров. 19.11.2026 меню `/model`, которое хост открывал для
обнаружения каталога (CLI 2.1.328, каталог в кэше — для 2.1.325), держало сообщения десктопа до
55 с, а вставка панели уходила в меню или за набранную команду.

- **Сообщения Remote Control.** `IngressWatch` (`pty/remote-ingress.ts`) на каждом опросе читает
  новую часть лога Claude (`--debug-file`, тот же путь, что у хоста; не больше 256 КиБ за раз,
  первый опрос только отмечает конец, укороченный файл начинается заново) и при строке
  `[bridge:repl] Ingress message type=user` вызывает `userInput()`: транзакция отменяется, своё
  меню закрывается Escape. Текст сообщения не читается и не хранится. Файлу нужны `size` и
  `slice` у `ParameterFiles`: `interrupt-worker.ts` (`statSync`/`readSync`), `host.ts` —
  `fileSize`/`fileSlice` из `win-host.ts`.
- **Пауза после ввода.** `userInput()` ставит `quietUntil` (`INPUT_QUIET_MS` = 3 с): `ready()`
  ложно, обнаружение и пожелания не начинаются, пока Claude берёт сообщение.
- **Меню без шага.** Своё меню (`model`, `effort`, `fast`, `switch`), на котором хост не нажал
  ни одной клавиши `MENU_IDLE_MS` = 10 с, отменяется и закрывается (раньше — только по `expires`,
  55 с).
- **Уборка.** Правила M28 не меняются: Escape только своему меню того же вида, очистка (`clear`)
  только поля, где ровно своя набранная команда (`typed`); чужой ввод, чужой диалог разрешений и
  чужое меню не трогаются. Новое: не больше `CLEANUP_TRIES` = 3 клавиш уборки, а клавиша, после
  которой экран не изменился, не ждётся дольше 1 с. Не вернувшийся к пустому полю терминал —
  `unsafe`, причина состояния «Терминал Claude не вернулся к пустому полю после смены параметров».
- **Текст пользователя ждёт.** `yieldToUser()` держит `.text`, `.message` и `.rename`, пока своя
  транзакция убирает за собой (до 2 с), а затем, пока `unsafe` и поле не пусто (`unsafe` снимается
  через 10 с). Вставка в меню или за набранную команду больше не происходит; если файл не взят
  вовремя, `sendDirect` удаляет его, и сообщение идёт очередью (M45/T002).
- **Неудача обнаружения.** Последняя попытка (`DISCOVERY_TRIES`), закончившаяся сама (не вводом
  пользователя и не ходом), добавляет ключ (`catalog:<модель>`, `efforts:<модель>`) в `failed`
  каталога; `exportCatalog` пишет и каталог без моделей с `failed`; `saveCatalog` той же версии CLI
  сохраняет прежние модели и объединяет `failed`. Хост после рестарта с этим каталогом не открывает
  `/model` для этих ключей; другая версия CLI читается заново.
- **Действующее пожелание.** `pursue()` сразу снимает (`applied`) ожидающее пожелание, значение
  которого у Claude уже есть, даже при занятом терминале: режим в панели не мигает.
- Тесты: `test/m45-parameter-host.test.ts` (Ingress, хост с логом, предел меню, удержание текста,
  неудача и рестарт, отмена пользователем, слияние каталога, хост ConPTY с путём `C:\…`).

## Меню `/model` Claude 2.1.328 (M46/T001)

Claude 2.1.328 изменил подсказки меню `/model` (кадры записаны с живого CLI 19.11.2026):

- подпись под заголовком `Your pick is the default for new sessions. For other models, use --model.`;
- нижняя строка `s to use this session only · Enter to save · Esc to cancel` вместо `Enter to set as
  default · s for this session only · Esc to cancel` (клавиши те же: `s` — только эта сессия,
  `Enter` — по умолчанию для новых сессий, хост его на модели не нажимает);
- прокрутка `↑ N more` / `↓ N more` вместо `… +N models`;
- модель без уровней — строка `○ Effort not supported for <модель>`.

`parameterFrame` узнаёт меню по `Select model` без строки ввода и подсказке любой из версий
(`MODEL_FOOTER`: `Enter to set as default|save|expand|collapse` или `s to use this session only`, затем
`Esc to cancel`); `hiddenModels` берёт `… +N models` или `↓ N more`. До исправления меню 2.1.328
считалось чужим окном (`dialog`): хост отменял свою транзакцию, по правилам M28 не закрывал его, и
терминал оставался в меню; каталог 2.1.328 был пуст.

- Тесты: `test/m46-menu.test.ts` (записанные кадры 2.1.328, кадр 2.1.325, чужое окно; чтение каталога
  и смена уровня на имитации 2.1.328 `test/claude-2-1-328.ts`; хост ConPTY читает каталог).
