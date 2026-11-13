# Модуль: pty-host

Часть `provider-runtime`, кластер `provider-contract`. Алиас импорта: `#pty-host`.

## Назначение

Псевдотерминал Windows (ConPTY) для программ с TUI — Claude Code (спецификация M5, раздел 2).
На macOS и Linux терминал по-прежнему даёт `expect`; общий `TerminalScreen` этого
модуля используется там для классификации экрана Claude без загрузки node-pty.

## Состав

- `vendor/node-pty-1.1.0/` — часть пакета `node-pty` 1.1.0 (Microsoft, MIT) только для Windows:
  `lib/*.js` (CommonJS), `prebuilds/win32-x64` и `prebuilds/win32-arm64` (`conpty.node`,
  `conpty_console_list.node`, `conpty/conpty.dll`, `conpty/OpenConsole.exe`, модули N-API —
  подходят к Node 24 без компилятора). Без winpty и `.pdb`. Происхождение и SHA-256 каждого
  файла — `vendor/node-pty-1.1.0/PROVENANCE`, лицензия — `LICENSE` там же. Ветка 1.2 не взята
  (регрессия #955).

## Публичный интерфейс (`src/index.ts`)

- `ptyUnavailable(platform, arch, dir?)` — причина, по которой терминал здесь не запустится
  (не Windows; нет сборки для архитектуры), или `null`.
- `loadNodePty(platform?, arch?, dir?) → NodePty` — `createRequire` пакета из `vendor`; отказ —
  `PtyUnavailableError` (`code: 'pty-unavailable'`).
- `startTerminal(pty, { file, args, cwd, env, cols, rows }, killTree?) → Terminal`:
  ConPTY со своим `conpty.dll` (`useConpty`, `useConptyDll`: встроенный conhost теряет клавиши);
  `onData`, `onExit`, `write(text)` — UTF-8 Buffer, `false` после выхода или при ошибке записи;
  `kill()` — один вызов `kill` node-pty (повторный роняет процесс, #983), затем дерево процессов
  `taskkill /PID <pid> /T /F`; ошибки внутренних сокетов подавлены (#976, #942, #960).
- `taskkillTree(pid)` — `taskkill /T /F` со скрытым окном.

## Инварианты

- Модуль не знает о Claude: протокол экрана и маркеры — в `provider-claude`.
- Нет сетевых загрузок и сборки при установке: установщик копирует `vendor` как остальной код.

## Зависимости

Только Node (`node:module`, `node:child_process`).

## Экран и поведение на ОС (M24)

`TerminalScreen(rows = 40, cols = 160)` экспортирован из `src/index.ts`:
`feed(chunk)`, `text()`, `valid`, `revision`. Хранит ограниченную сетку текущего экрана,
учитывает CR/LF, CSI-позицию/стирание и OSC, включая разрыв последовательности между
чанками. Неизвестная операция делает valid=false до полного стирания экрана: вызывающий
не должен посылать управляющие клавиши по неоднозначной картине. Это не транскрипт.
Классификация Claude и доказательство остановки принадлежат provider-claude; `TerminalScreen`
не знает провайдера. На macOS/Linux его загружает Node-помощник expect, на Windows x64/ARM64
— ConPTY-host. Для этого класса не нужны node-pty, программы ОС или native-библиотеки.
