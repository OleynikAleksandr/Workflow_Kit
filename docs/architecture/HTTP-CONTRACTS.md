# Контракты HTTP: маршруты и разделы состояния

Часть [основных контрактов](CONTRACTS.md). Раздел вынесен из `CONTRACTS.md` без изменений (M39).

## Реестр маршрутов и разделов состояния (`http-server`)

`createRouter()` — маршруты с `:name`, ответ JSON, ошибки `{ error: { code, message,
...details } }` через `HttpError`. `createStateRegistry()` — разделы `GET /api/state`; упавший
даёт `{ error }`, остальные отдаются. Разделы: `system` (`cli`), `projects`
(`project-registry`), `structure` (`kit-structure`), `providers` (`provider-registry`),
`operations` (`data-store`), `workflow` (`kit-runner`), `channel` (`agent-channel`),
`autopilot`, `review` (`plan-review`), `reviews` (`cross-review`), `titles` (`session-titles`),
`setup` (`project-setup`), `publication` (`git-publish`). Фильтр
доступа D8: только loopback и Tailscale (адрес клиента и локальный адрес),
`Host` из списка, для изменяющих запросов — `Origin` и JSON. Контракт —
[http-server/module.md](../../product-parts/backend-core/clusters/http-api/modules/http-server/module.md).
