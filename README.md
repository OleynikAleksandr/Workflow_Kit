# Workflow Kit

Workflow Kit — оркестратор поверх родных приложений Claude и ChatGPT/Codex,
без своего чата. Это бэкенд-служба пользователя с веб-панелью для Mac и iPad
(по адресу Tailscale): реестр проектов, собственная структура Kit в папке
проекта, провайдеры Claude и Codex с общим контрактом (доверие к папке,
сессии, окружение Claude, демон и хуки Codex), установщик с автозапуском.
С вехи 2 служба ведёт в проектах процесс Harness Workflow Kit 2.2.2: мастер
проекта с одним согласием и первой сессией, карточки выбора пути и плана,
автопилот через хуки агентов, имена сессий; панель — по согласованному
макету (`docs/design/ui-mockup.html`), с экраном «Домой» на iPad.

Веха 1 (`m1-orchestrator-core`) реализована; приёмка на устройстве —
по разделу 11 спецификации
([docs/planning/M1-orchestrator-core.md](docs/planning/M1-orchestrator-core.md)).
Первый проход приёмки на Mac нашёл дефекты D1–D3
([docs/evidence/M1-acceptance.md](docs/evidence/M1-acceptance.md)); они
исправлены раундом R2, повторная приёмка — после переустановки.

Веха 2 (`m2-interface-and-process`) принята
([docs/planning/M2-interface-and-process.md](docs/planning/M2-interface-and-process.md),
[docs/evidence/M2-acceptance.md](docs/evidence/M2-acceptance.md)). Веха 3
(`m3-fixes`, [docs/planning/M3-fixes.md](docs/planning/M3-fixes.md)) —
раунды исправлений и дополнений, каждый заканчивается релизом с новой
версией (`package.json`; веха 3 — `0.3.x`).
Сессии Claude, созданные панелью, работают через Remote Control: агент — процесс `claude` на
Mac, claude.ai только пересылает сообщения. Удалённый проект забирает с собой записи своих
сессий; остановленная сессия Claude поднимается сама в тот же канал — при открытии в панели,
при сообщении из панели и при старте службы после перезагрузки (раунд R9). Архив проекта
или сессии в панели останавливает её и не даёт подняться, возврат из архива сразу поднимает
(раунд R10).

## Требования

- Node.js 24 или новее (TypeScript исполняется напрямую, type stripping).
  Runtime-зависимостей нет; `typescript` и `@types/node` нужны только для
  проверок.
- Провайдеры: `claude` (2.1.0+) для Claude и `expect` для его сессий и
  окружения (доверие к папке Kit пишет в `~/.claude.json` сам, без
  `expect`); `codex` для ChatGPT/Codex. Без них панель показывает
  недоступные возможности с причиной.
- Основная ОС — macOS. Linux и Windows поддержаны кодом, но проверены
  только тестами (см. матрицу ОС в
  [OVERVIEW](docs/architecture/OVERVIEW.md#матрица-ос)).

## Запуск из клона (разработка)

```sh
npm ci                       # dev-зависимости для проверок
node bin/wfk.mjs serve       # бэкенд и панель на http://127.0.0.1:4747/
```

`serve` печатает адреса панели (loopback и Tailscale). Второй экземпляр
рядом с установленной службой запускается со своими данными и портом:

```sh
WFK_DATA_DIR=/tmp/wfk-dev WFK_PORT=4848 node bin/wfk.mjs serve
```

## Установка службы

```sh
node bin/wfk.mjs install     # копия в app/<версия>, запускатель, значок, автозапуск, старт
wfk open                     # поднять службу при необходимости и открыть панель
wfk service start|stop|status
wfk doctor --installed       # проверка установленной службы
wfk uninstall                # снять автозапуск, запускатель и значок; данные остаются
```

`node bin/wfk.mjs link [--force]` ставит запускатель `~/.local/bin/wfk` на
текущий клон (для разработки; `install` его заменяет своим). Повторный
`install` обновляет версию. Значок «Workflow Kit» (macOS
`~/Applications/Workflow Kit.app`) делает то же, что `wfk open`.

## Проверки

```sh
npm run typecheck            # tsc --noEmit (TS и JSDoc панели)
npm test                     # node --test "product-parts/**/test/*.test.ts"
```

Тесты не трогают настоящий HOME, `~/.claude.json`, `~/.codex`,
LaunchAgents и порт 4747: подставные программы, HOME и `WFK_DATA_DIR`.

## Документы

- Архитектура: [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)
  — части продукта, модули, контракты, матрица ОС, известные ограничения.
- Контракты модулей: `product-parts/<часть>/clusters/<кластер>/modules/<модуль>/module.md`.
- Спецификации вех 1 и 2 и провайдеры (временные, до приёмки):
  [docs/planning/](docs/planning/); макет интерфейса —
  [docs/design/ui-mockup.html](docs/design/ui-mockup.html).
- Правила разработки (Workflow Kit): [AGENTS.md](AGENTS.md).
