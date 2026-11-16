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
- Раздел `reviews` (T006): у ревью есть `approvedDigest`, `versioned` и `reviewedProposal`
  (`{ scopeId, generation, digest }` согласованной версии предложения).
- Контракт — [autopilot/autopiloting.md](../../product-parts/workflow-engine/clusters/session-loop/modules/autopilot/autopiloting.md).
