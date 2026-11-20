# Контракты HTTP: маршруты и разделы состояния

Часть [основных контрактов](CONTRACTS.md). Раздел вынесен из `CONTRACTS.md` без изменений (M39).

## Реестр маршрутов и разделов состояния (`http-server`)

`createRouter()` — маршруты с `:name`, ответ JSON, ошибки `{ error: { code, message,
...details } }` через `HttpError`. `createStateRegistry()` — разделы `GET /api/state`; упавший
даёт `{ error }`, остальные отдаются. Разделы: `system` (`cli`), `projects`
(`project-registry`), `structure` (`kit-structure`), `providers` (`provider-registry`),
`operations` (`data-store`), `workflow` (`kit-runner`), `channel` (`agent-channel`),
`autopilot`, `autopiloting` (`autopilot`, M39), `review` (`plan-review`), `reviews`
(`cross-review`), `titles` (`session-titles`), `setup` (`project-setup`), `publication`
(`git-publish`). Фильтр
доступа D8: только loopback и Tailscale (адрес клиента и локальный адрес),
`Host` из списка, для изменяющих запросов — `Origin` и JSON. Контракт —
[http-server/module.md](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md).

## Автопилотирование (M39)

- `GET /api/settings/autopiloting` → `{ version, revision, mode, review, error }` (нет файла —
  `off`, `review=false`; нечитаемый — те же значения и текст `error`).
- `POST /api/settings/autopiloting { expectedRevision, mode: off | after-start | full,
  review }` → сохранённые настройки; 400 `bad-request`, 409 `settings-stale` с `current`.
  Сначала запись `autopiloting.json`, затем слушатели (до M48 переход в `off` ставил запуски на
  паузу; M48 — Settings только значения для новых сессий).
- Раздел `autopiloting`: `{ settings, error, projects: { <id>: { runId, mode, phase, reason,
  source, scopeId, review, updatedAt } } }` — без цитат пользователя.
- `POST /api/sessions/plan` принимает `authorized` (точные слова поручения): ответ
  `{ projectId, key, action: "prepare", runId, mode, review, policy, instruction }`; 409
  `authorization-source-missing`, `authorization-quote-mismatch`, `run-active` с
  `nextAction`. `POST /api/projects/:id/workflow/start|resume` отвечают и `runId`, когда
  старт записал разрешение запуска; 409 `run-paused`, `run-active`, `scope-changed`.
- T007: `POST /api/projects/:id/autopiloting/pause|resume|stop { runId, expectedRevision }` —
  только этот запуск (404 `run-not-found`, 409 `run-stale` с `current`); только loopback —
  `POST /api/sessions/progress { cwd, projectDir?, client?, sessionId?, progress }` (ожидание
  CI владельца: 400 `bad-request`, 403 `not-owner`, 409 `ci-policy-mismatch`, `action-done`,
  `no-ci-policy`) и `POST /api/sessions/run { …, action: pause | stop }`.
- T008: `POST /api/projects/:id/publish` выполняется под мьютексом `project:<id>` тем же
  сервисом git-publish, что публикация запуска; отказ учётных данных — 502 `push-auth`
  (прочие сбои push — 502 `push-failed`). Раздел `autopiloting` показывает фазы
  `accepting`, `closing`, `publishing` и после закрытия scope до проверенной публикации.
- T009: раздел `autopiloting.projects[id]` — `{ runId, revision, owner, mode, phase,
  pausedFrom, reason, nextAction, source, scopeId, review, wait, publication, updatedAt }`
  после любой записи журнала; `GET /api/projects/:id/autopiloting/policy` → `{ mode, policy,
  text, manualCriteria }`.
- Раздел `reviews` (T006): у ревью есть `approvedDigest`, `versioned` и `reviewedProposal`
  (`{ scopeId, generation, digest }` согласованной версии предложения).
- M41 T002: в разделе `autopiloting.projects[id]` — `manualAcceptance { reason, since }`
  (запуск ждёт приёмки пользователя) и `notice` (раннее предупреждение).
- M41 T003: `POST /api/projects/:id/kit/update` — 409 `scope-open`, пока открыт план, и 409
  `run-active`, пока запуск автопилотирования не опубликовал результат (`details { scopeId,
  runId }`); раздел `kitUpdate.projects[id].deferred { code, scopeId, runId } | null`.
  Контракт — [kit-update/module.md](../../product-parts/workflow-engine/clusters/kit-host/modules/kit-update/module.md).
- M44 T002: `POST /api/hooks/session-start { client, input, projectDir?, panelProcess? }` (только
  loopback, иначе 403; клиент вне провайдеров или вход без `session_id` — 400 `bad-hook-input`) →
  `{ answer }` — ответ хука SessionStart в диалекте клиента: Claude и Codex —
  `{ continue: true, hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }`,
  Kimi — `{ message }`. Текст — одна ASCII-строка `Workflow Kit autopilot: mode=<off|after-start|full>,
  review=<on|off>; run=<none|<id> authorized (phase …)|<id> NOT authorized (…)|<id> paused|<id>
  blocked (…)>.`, без живого разрешения Kit — с напоминанием о ручных решениях. Отвечает сразу:
  у хука 1,5 с на всё. Контракт — [agent-channel/module.md](../../product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md),
  [cli/commands.md](../../product-parts/backend-core/clusters/runtime/modules/cli/commands.md).
- M44 T004: `POST /api/projects/:id/autopiloting/retry { runId, expectedRevision }` — «Повторить»
  запуска без разрешения Kit: запрос разрешения снова (404 `run-not-found`, 409 `run-stale`,
  `scope-changed`, код отказа Kit); у запуска с разрешением — `already: true`. В разделе
  `autopiloting.projects[id]` — `authorized` (разрешение Kit записано для запуска). Контракт —
  [autopilot/grant.md](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/grant.md).
- M48 T001: `GET /api/projects/:id/sessions/:sid/autopiloting` → `{ settings: { version, revision,
  key, mode, review, source, at, preparing? }, stage, effect }` (первое чтение берёт Settings;
  T002 — `stage`: `idle | question | writing | proposed | executing | other-plan | run | paused |
  other-run`, `effect` — строка последнего переключения или `null`); `POST … { expectedRevision,
  mode?, review? }` → то же после переключения ([autopilot/session-switch.md](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-switch.md)); 400 `bad-request` (ключ не `<client>:<id>`, неизвестное
  значение), 404 `project-not-found`, 409 `settings-stale` с `current`. `GET
  /api/projects/:id/autopiloting/policy?session=<key>` — политика по режиму сессии. Раздел
  `autopiloting` — плюс `sessions: { <projectId>: { <key>: запись } }`. Контракт —
  [autopilot/session-settings.md](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/session-settings.md).
- Контракт — [autopilot/autopiloting.md](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md).

## Голосовой ввод (speech-integration)

- `GET /api/speech` → состояние: `supported`, `available`, `reason`, `phase`, `backend`,
  `selected`, `models`; не loopback — `{ supported: false, available: false }` с причиной.
- `POST /api/speech/models/:id/download|cancel|select|remove` → публичное состояние моделей.
- Upgrade `/api/speech/stream` (реестр `addUpgrade` `http-server`; неизвестный upgrade
  отклоняется): тот же Origin, Host и порт, loopback с обеих сторон, протокол 1 и
  `dictationId`; двоичные кадры — `u32` `audioSeq` (LE) и PCM. Аудио и текст не пишутся в
  журнал и не уходят провайдеру. Контракт —
  [speech-service/module.md](../../product-parts/speech-input/clusters/local-recognition/modules/speech-service/module.md).

## Сообщение панели в сессию (M45)

- `POST /api/projects/:id/sessions/:sid/message { text }` → `{ sent: true }` (Claude начал ход с
  этим текстом: хук `UserPromptSubmit` пришёл в течение `DIRECT_CONFIRM_MS` = 8 с), `{ queued: <id> }`
  (прямой путь отказал: сессия занята, терминал не свободен — диалог, черновик, неубранная смена
  параметров) или `{ sent: false, undelivered: { reason } }` — текст вставлен, но хука нет; в очередь
  не кладётся, панель сохраняет текст и предлагает «Повторить». Подтверждение ждётся только для
  сессии, чьи хуки канал видел.
- M46: терминал есть, но не свободен (диалог, черновик, неубранная смена параметров) — не очередь, а
  `{ sent: false, undelivered: { reason } }` с причиной состояния хоста («Терминал Claude занят или
  не распознан», «В Claude есть черновик», …): ждущая сессия не шлёт хуков, очередь бы не ушла.
  `{ queued }` остаётся для занятой сессии и для отсутствия прямого пути.
- M47: `{ sent: true }` — и когда текст хука `UserPromptSubmit` не равен отправленному: вставку
  подтверждает первый хук сессии, пришедший за время отправки и ожидания (Claude 2.1.328 передаёт
  длинную вставку в обёртке `<pasted_content id="…">`). Расхождение — строка журнала службы без
  текстов; ответ маршрута не меняется.
