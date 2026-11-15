# Маршруты provider-registry

Часть [контракта модуля](module.md).

### Маршруты (`routes.ts`)

`registerProviderRoutes({ router, state, registry, projects, operations,
mutex, events?, platform, now?, onRefresh? }) → { refresh() }` регистрирует
маршруты и раздел `providers`.

| Маршрут | Ответ |
| --- | --- |
| `GET /api/providers` | `{ providers: ProviderSummary[] }` |
| `GET /api/projects/:id/providers/:p` | `ProjectProviderState` |
| `GET /api/projects/:id/providers/:p/trust/preview` | `TrustPreview` (синхронно) |
| `POST …/providers/:p/trust` `{token, choices?}` | 202, операция `provider.trust` → `grantTrust(project, token, choices)`; `choices` — объект `{ <id>: <id ответа> }` (id — `[A-Za-z0-9._:-]{1,64}`, до 16 пар), без него — `{}`; иначе 400 `invalid-body`. Обязательность ответов проверяет провайдер |
| `POST …/providers/:p/hooks/approve` `{command, hash}` | 202, `provider.hooks.approve` → `approveHooks` |
| `POST …/providers/:p/sessions` `{title?}` | 202, `provider.session.create`; имя по умолчанию `<проект> · ГГГГ-ММ-ДД ЧЧ:ММ` (`defaultSessionTitle`) |
| `POST …/sessions/:sid/resume`, `…/sessions/:sid/stop` | 202, `provider.session.resume` / `provider.session.stop` |
| `POST /api/providers/:p/actions/:a` | 202, `provider.action` → `runAction(a, null)` |
| `POST /api/projects/:id/providers/:p/actions/:a` | 202, `provider.action` → `runAction(a, project)` |
| `GET /api/providers/:p/shared-access` | `SharedAccessState` (`state(false)`, M12) |
| `POST /api/providers/:p/shared-access/recheck` | `SharedAccessState` после всех проверок (`state(true)`) |
| `GET /api/providers/:p/shared-access/preview` | `SharedAccessPreview` (`writes`, `token`, `expiresAt`, `notes`) |
| `POST /api/providers/:p/shared-access/apply` `{token}` | 202, `provider.shared-access.apply` → `apply(token)` |
| `POST /api/providers/:p/shared-access/remove` | 202, `provider.shared-access.remove` → `remove()` |
| `POST /api/providers/:p/shared-access/open` `{target}` | `{ opened }`; `target` — `remote-login` или `connections`, иначе 400 |
| `GET …/providers/:p/sessions/:sid/messages` | `{ supported, messages, truncated, sync? }` (`chat-routes.ts`, M18, M32): без `readMessages` — `supported: false`; чужая сессия — 404 `unknown-session`; `ProviderError` — 502, `codex-reconnecting`/`codex-unavailable` — 503; см. [chat.md](chat.md) |
| `POST /api/refresh` | 202, `providers.refresh`: сброс кэша журнала, `onRefresh` (сверка процессов), `refresh?()` каждого провайдера |

Долгий POST отвечает 202 `{ operationId, operation, existing }`; ход и
итог — в разделе `operations` `/api/state`. Ключ операции — вид, провайдер,
проект и (для сессий и действий) id: повтор во время операции возвращает ту
же операцию (`existing: true`) и второе действие не запускает. Действие
выполняется под мьютексом `provider:<p>`, затем `project:<id>` (тот же
ключ, что у установки структуры); пока ключ занят, `progress` — «ожидание
очереди». Итог пишется в `events.jsonl` (`OPERATION_EVENTS`):
`provider.trust.granted`, `provider.hooks.approved`,
`provider.session.created|resumed|stopped`, `provider.action.completed`,
`provider.shared-access.applied|removed`,
`providers.refreshed`; неудача — `provider.operation.failed` (`kind`,
`error`). В событии — `operationId`, `provider`, `project`,
`projectName`, `projectPath` и краткий итог (id сессии, `trusted`,
`backup`).

Ошибки до запуска операции — `{ error: { code, message, ...details } }`:
400 `invalid-body`, `invalid-session`; 403 `access-denied` (с `hint`); 404
`unknown-provider`, `not-found`, `unknown-action`, `unknown-session`; 409 `project-missing`,
`not-supported` (нет необязательного метода или `sharedAccess`), `action-disabled` (с
`hint` = `reason`); `ProviderError` предпросмотра — со своим статусом
(у заглушки 501 `not-implemented`).

Раздел `/api/state` → `providers`: `{ providers: ProviderSummary[]
(id, title, label, mark, status, capabilities, resume — есть ли у провайдера
`resumeSession`, actions(null), errors), projects: {
<projectId>: { <providerId>: ProjectProviderState } } }`.

