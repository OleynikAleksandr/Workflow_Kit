# Веха 3, раунд 7: оркестрация встроенными подагентами Claude и ChatGPT

## 1. Решение пользователя (2026-11-07)

«Сейчас нужно сделать и у Claude, и у ChatGPT запуск сабагентов, работающих
с планом по их внутреннему протоколу» — сессия-владелец плана становится
оркестратором и раздаёт задачи встроенным подагентам своего приложения
(Claude — инструмент Agent, Codex — `spawn_agent`). Оркестрация силами
самого Workflow Kit с любым CLI-подагентом (как в Workflow Pilot) —
следующий этап. «Сразу вносить все исправления… выпускать релиз 0.3.3, а
потом проверять работу оркестраторов на тестовых проектах».

## 2. Проверено (проба Kit 2.2.2, 2026-11-07)

- `assignment:create --task <ID>` возвращает назначение (`id`,
  `baseCommit`, `worktree: null`) и поручение исполнителю: «Your working
  directory is your own git worktree… FIRST run assignment:attach <id>…
  task:start… commit --task… Reply with the SHA». Рабочую копию Kit не
  создаёт: у Claude её даёт инструмент Agent с `isolation: "worktree"`.
- Своя копия годится: `git worktree add --detach <путь> <baseCommit>` →
  в ней `assignment:attach`, `task:start`, `commit --task` → в main
  `integration:start --id <id> --source <sha>` влил коммит, Kit убрал
  копию (`cleanup: DONE`).
- Codex 0.167: подагенты включены (`multi_agent` stable), у них нет своей
  копии; команды подагента выполняются с явным `workdir`. Песочница пишет
  внутри проекта, поэтому копии — в `.workflow-kit/local/worktrees/<id>`
  (папка уже в `.gitignore`).

## 3. Решение

- Панель и служба предлагают «Оркестрация с исполнителями» сессиям обоих
  приложений (снимаются ограничения `claudeOnly` и
  `orchestrated-claude-only`).
- Сообщение старта плана в режиме оркестрации — своё для приложения:
  - Claude: поручение `assignment:create` — подагенту инструментом Agent
    с `isolation: "worktree"`, независимые — параллельно (до `maxWorkers`),
    SHA ответа — в `integration:start`;
  - Codex: для каждого назначения
    `git worktree add --detach .workflow-kit/local/worktrees/<id> <baseCommit>`,
    подагент `spawn_agent` с поручением и строкой «твоя рабочая копия —
    <абсолютный путь>, все команды выполняй с этим workdir», ожидание SHA
    (`wait_agent`), затем `integration:start`; копию убирает Kit.
- Продолжения автопилота в оркестрации у Codex дополняются той же
  короткой процедурой.
- Раздел Kit в `AGENTS.md` (фрагмент `agents-section`) описывает обе
  процедуры: оркестратор сам задачи не делает, QUALITY и выпуск — сам.
- Релиз 0.3.3; проверка — на тестовых проектах пользователя (откат —
  через git).
