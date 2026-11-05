# Модуль: http-server

Часть `backend-core`, кластер `http-api`. Алиас импорта: `#http-server`.

## Назначение

HTTP-сервер бэкенда: фильтр доступа (D8), реестр маршрутов API, реестр
разделов `/api/state`, раздача статических файлов панели.

## Публичный интерфейс (`src/index.ts`)

- `createHttpServer({ router, staticMounts?, getInterfaces?, log?,
  maxBodyBytes? }) → HttpServerHandle` — `listen(port)` слушает `::`
  (dual-stack, `ipv6Only: false`), при отсутствии IPv6 — `0.0.0.0`;
  `port()`, `addStatic(mount)`, `close()`. Интерфейсы
  (`os.networkInterfaces` по умолчанию) читаются на каждый запрос, поэтому
  Tailscale, поднятый после старта, подхватывается без перезапуска.
- `createRouter() → Router` — `add/get/post/delete(pattern, handler)`,
  шаблоны с `:name`; `match`, `list`. Обработчик получает `RouteContext`
  (`method`, `path`, `query`, `params`, `body`, `req`, `res`); возвращённое
  значение уходит JSON 200, `jsonResult(status, body)` — другой статус,
  `throw new HttpError(status, code, message, details?)` — ошибка;
  `details` (например, `{ hint }`) добавляются в объект `error` ответа.
- `createStateRegistry() → StateRegistry` — `add(name, provider)`,
  `collect()`; упавший раздел даёт `{ error }`, остальные отдаются.
- `registerCoreRoutes(router, state, health)` — `GET /api/health`
  (`{ ok: true, ...health() }`) и `GET /api/state`
  (`{ generatedAt, ...разделы }`).
- Фильтр: `checkAccess(request, { port, tailscaleAddresses })`,
  `classifyAddress`, `normalizeAddress`, `isTrustedAddress`,
  `tailscaleAddresses(interfaces)`, `parseHostHeader`, `allowedHostnames`,
  `MUTATING_METHODS`.
- Раздача: `findStaticFile(mounts, path)`, `STATIC_TYPES`; `sendJson`,
  `sendError`.

## Фильтр доступа (D8)

Запрос принимается, только если:

1. адрес клиента и `req.socket.localAddress` — loopback (`127.0.0.0/8`,
   `::1`, `::ffff:127.x`) или Tailscale (`100.64.0.0/10`, в том числе
   `::ffff:100.x`, и `fd7a:115c:a1e0::/48`);
2. `Host` с портом сервера и именем из списка: `127.0.0.1`, `localhost`,
   `[::1]`, адреса Tailscale этой машины из интерфейсов; имена `*.ts.net`
   (MagicDNS) — только для клиента с адреса Tailscale;
3. для POST/PUT/PATCH/DELETE: `Origin` равен `http://<Host>`,
   `Content-Type` — `application/json`.

Иначе — 403 `{ "error": { "code": "forbidden", "message": <причина> } }`,
причина пишется в журнал.

## Ответы и ошибки

- Все ошибки — `{ error: { code, message, ...details } }`: 400 `invalid-json`,
  `bad-path`; 403 `forbidden`; 404 `not-found`; 405 `method-not-allowed`
  (с `Allow`); 413 `body-too-large` (тело больше 1 МиБ); 500 `internal`.
- API: `Cache-Control: no-store`; статика: `no-cache` и CSP
  `default-src 'self'`; всегда `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`.
- Статика: монтирования `{ prefix, dir, index? }` (самый длинный префикс
  выигрывает); отдаются только `.html`, `.js`, `.css`, `.svg`, `.png`,
  `.ico`, `.webmanifest`; скрытые сегменты, `..` и выход за каталог — 404.
  Пути `/api/**` всегда идут в реестр маршрутов.

## Инварианты

- Модуль не содержит предметных маршрутов и не читает диск, кроме
  каталогов монтирования.
- Тесты подставляют интерфейсы и слушают свободный порт (`listen(0)`).

## Потребители

- `cli` собирает сервер: `registerCoreRoutes`, разделы `system` и
  `operations`; статика передаётся через `staticMounts` — `panel-shell` под
  `/`, `provider-cards` под `/provider-cards/` (`addStatic` сейчас никто не
  вызывает).
- `project-registry` — `GET /api/folders`, `/api/projects`,
  `/api/projects/open`, `DELETE /api/projects/:id` и раздел `projects`.
- `kit-structure` — `/api/projects/:id/structure` и раздел `structure`.
- `provider-registry` — `/api/providers`, `/api/projects/:id/providers/:p/**`
  (доверие, хуки, сессии, действия), `/api/providers/:p/actions/:a`,
  `POST /api/refresh` и раздел `providers`.

## Дальше

В вехе 1 изменений не запланировано. Авторизация панели вне Tailscale —
веха 2 (спецификация, раздел 13).
