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
  Сначала запись `autopiloting.json`, затем слушатели (переход в `off` ставит запуски на паузу).
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
