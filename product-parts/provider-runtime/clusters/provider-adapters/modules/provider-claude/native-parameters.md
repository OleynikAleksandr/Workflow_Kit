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
