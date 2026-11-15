# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-14T17:32:33.863Z",
    "scopeId": "m31-plan-in-any-session"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1008,
  "rounds": [
    {
      "digest": null,
      "id": "R1",
      "kind": "implementation",
      "status": "OPEN",
      "title": "Implementation"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "История суммарно более 16 МиБ читается порциями; новые реплики появляются без повторного полного обхода; большой отдельный элемент имеет явный ограниченный путь обработки.",
      "После возврата сокета чтение ленты и параметров восстанавливается без reload; сообщения, черновик, фокус и очередь сохраняются.",
      "Автоматический retry не повторяет turn/start, turn/interrupt и изменение параметров; Stop подтверждает только конкретный nativeTurnId без полной истории.",
      "Проверены совместимость paginated/legacy и пределы памяти/страниц/deadline; неподдерживаемые случаи документированы без скрытого full-history fallback.",
      "Обязательные проверки и CI точного поставляемого SHA зелёные на macOS, Linux, Windows x64/ARM64; живая приёмка пользователя и Windows-тестера отдельно подтверждается, pending не выдаётся за passed.",
      "Контракты и OS-MATRIX согласованы; локальная сборка установлена и проверена; опубликована только разрешённая CI-ветка, main не публикуется."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-15T08:55:44.365Z",
      "text": "Пользователь 15.11.2026: «Давай исправим: сделаем порционную загрузку диалога Codex и восстановление подключения при исчезновении сокета. Подготовь спецификацию и план». В панели выбрана спецификация и план с ревью. Пользователь отдельно разрешил 15.11.2026: «Да: установка и CI до приёмки» — локальная сборка и установка с delivery-подтверждением, push только ci/M32-codex-history-recovery до приёмки; main отдельно после закрытия. Пользователь 15.11.2026: «Восстановите текущее ревью, чтобы закончили вы с этим». Новая техническая попытка ревью сохраняет состав исправленного плана; реализация не запускается. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "521f153135a75378a11208fa698da9b6cb3f9bed",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M32-codex-history-recovery.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-codex-validation.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-codex-protocol-plan.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-codex-connection.md",
        "required": true
      },
      {
        "path": "docs/planning/M32-document-split.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Подготовка с ревью другого провайдера; реализация только после выбора и старта в панели."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Последние 100 сообщений остаются публичным контрактом; пагинация выполняется внутри адаптера, без новой кнопки полной истории."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Восстановление подключается к вернувшемуся демону; автоматический запуск/перезапуск демона и изменение общего доступа не входят в задачу."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Пользователь разрешил установку и CI до приёмки; T006/T007 delivery запускаются с --confirmed, push только ci/M32-codex-history-recovery; main отдельно после приёмки и закрытия."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Разделение контрактов выполнено ДО плана отдельным docs:commit 78a10d79adb9ea8fb0894038da1c1ac503811f42; обязательного шага между задачами нет."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Oversized item оставляет gap только элемента/диапазона: обе короткие реплики того же хода видны. Неподтверждённый обязательный live-факт или несовместимость критериев блокирует T001."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Восстановление зависшего ревью: предыдущий обмен answering отменяется штатным API. Новый scope proposal ID нужен, поскольку штатный retry допускает только failed, а cancelled того же scope автоматически не перезапускается. Состав задач и разрешённая CI-ветка ci/M32-codex-history-recovery сохранены."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "Точная разрешённая ветка ci/M32-codex-history-recovery сохраняется при техническом scope id с retry1; это исключение из ci/<scope> по явному разрешению пользователя."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "DOCS обновляет CONTRACTS.md (sync и два кода 503), сверяет routes.md/chat.md; промежуточные T002b2–T003 до T004 не устанавливаются."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "T007 проверяет только поставляемый SHA T006; собственный evidence/plan commit проверяется при отдельной публикации main после приёмки и закрытия."
      },
      {
        "at": "2026-11-15T08:55:44.365Z",
        "text": "T001 проверяет oversized на настоящем сервере с пониженным пределом только скрипта пробы; live output >16 МиБ не требуется. Фикстуру желательно подготовить после ревью до старта T001; рабочий лимит 16 МиБ сохраняется."
      },
      {
        "at": "2026-11-15T08:56:16.936Z",
        "text": "Owner session moved from 01a1de3c-b4ea-73a2-82d6-61c33ceb572d to 3967748e-6627-496f-9f10-fb2fa729caac: The user started the plan from this session in the Workflow Kit panel"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "3967748e-6627-496f-9f10-fb2fa729caac",
      "strategy": "sequential"
    },
    "id": "M32-codex-history-recovery-retry1",
    "objective": "Порционная загрузка длинного диалога Codex и автоматическое восстановление чтения после исчезновения сокета без повторных действий пользователя",
    "spec": "docs/planning/M32-codex-history-recovery.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Обязательный live: turns/list и items/list на существующем, в том числе notLoaded треде; loaded/list и status до/после не меняются; ограниченный путь для заявленных paginated/legacy подтверждён отдельно.",
        "Живой успешный/упавший output фактически сохраняемого размера: limit=1, asc/desc, exclusive anchors. Скрипт против настоящего сервера понижает собственный лимит ниже страницы output, но выше соседних реплик; после oversized обе реплики доступны. Размеры и лимит записаны в evidence; отсутствие live элемента >16 МиБ не блокирует задачу, >16 МиБ обязательно проверяется в fake T002a/T005.",
        "backwardsCursor/active updates/terminal переход исследованы; ненаблюдаемые динамические свойства pending с консервативным чтением хвоста от подтверждённого anchor. itemsView явно задан; deferOutput не считается поддержанным по наличию поля.",
        "Проверены excludeTurns и наблюдаемость серверной идентичности; нет auth.json копирования, внутренних историй, resume/interrupt пользовательских тредов. Evidence содержит полный скрипт публичной RPC-пробы, команды запуска, SHA, версии и счётчики без текста переписки.",
        "Если обязательный live-факт не подтверждён или реальный сервер не позволяет пройти вокруг элемента и выполнить будущие критерии — task:block, не DONE. Отсутствие live output >16 МиБ не является блокером. Подходящую фикстуру рекомендуется подготовить после ревью до task:start T001; нехватка данных отличается от несовместимости. Факты идут в evidence и protocol-plan.md, основная спецификация получает только ссылки; согласованное поведение не переписывается."
      ],
      "checks": [],
      "commitMessage": "docs: verify Codex paginated history protocol",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/interrupt.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/planning/M32-codex-history-recovery.md",
        "docs/planning/M32-codex-validation.md",
        "docs/evidence/M32-codex-protocol.md",
        "docs/planning/M32-codex-protocol-plan.md",
        "docs/planning/M32-codex-connection.md",
        "docs/planning/M32-document-split.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Подтвердить протокол пагинации и совместимость старых сессий",
      "why": "Подтвердить протокол пагинации и совместимость старых сессий"
    },
    {
      "acceptance": [
        "Подготовительный commit 78a10d7 уже содержит дословный перенос контрактов; лимит каждого документа соблюдён.",
        "Кадр и собранное сообщение ограничены 16 МиБ; chunks собираются без квадратичного копирования; buffers освобождаются.",
        "Некорректный JSON и превышения дают структурированные ошибки, rpc сохраняет code/size/limit; тесты границ, fragments и обрыва проходят.",
        "Контракт module.md и OS-MATRIX обновлены в том же коммите.",
        "Закрытие транспорта из-за размера сохраняет typed oversized и не превращается в сетевую ошибку; отсутствие epoch/backoff/Stop-инвалидации проверяется с координатором в T003/T005."
      ],
      "checks": [],
      "commitMessage": "fix: bound Codex websocket messages and preserve transport errors",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T002a",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Ограничить транспорт и сохранить типизированные ошибки",
      "why": "Ограничить транспорт и сохранить типизированные ошибки"
    },
    {
      "acceptance": [
        "ChatPage и whitelist chatPageOut сохраняют sync, bounded gaps с item/диапазоном и retryAfterMs; readError сохраняет 503 codex-reconnecting/codex-unavailable. Другие ошибки и провайдеры сохраняют прежний контракт.",
        "cutChatText идемпотентна, включая 19999 букв + emoji + хвост: повтор не дублирует пометку, не повреждает surrogate pair; регрессионный тест проходит.",
        "registry/chat.md разрешает общую нормализацию до кэша и в маршруте; routes.md/module.md и OS-MATRIX обновлены. Тесты HTTP проверяют безопасную нормализацию полей sync."
      ],
      "checks": [],
      "commitMessage": "fix: add chat sync contract and idempotent text normalization",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002a"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/routes.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/chat-routes.test.ts"
      ],
      "fixes": null,
      "id": "T002b1",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Расширить контракт ленты и исправить повторную обрезку текста",
      "why": "Расширить контракт ленты и исправить повторную обрезку текста"
    },
    {
      "acceptance": [
        "Использован механизм, подтверждённый T001: сообщения дедуплицированы, новые/изменённые items не теряются; нет includeTurns:true в ленте, itemsView задан явно.",
        "В начале poll metadata + latest turns/notLoaded нормализуются для onThreadRead/observe/turn-snapshot; существующие interrupt-тесты проходят до T002c, успешный status сохраняется при ошибке items.",
        "При output >16 МиБ обе короткие реплики одного хода видны; двусторонний limit=1 ограничивает gap item/диапазоном, сохраняет границы и не перечитывает их каждый poll. Gap ключуется серверной идентичностью и статусом хода, не reconnect epoch.",
        "Активный ход читается от подтверждённого завершённого anchor: завершённые outputs повторно не скачиваются; terminal дочитывает хвост. Один reader/inflight на тред, кэш до 64 тредов/32 МиБ UTF-8.",
        "Каждый poll ≤8 страниц/32 МиБ payload UTF-8/5с включая connect/status; продолжение не начинается с нуля. Общая cutChatText применяется до кэша.",
        "До T003: loading/ready/partial без retryAfterMs; транспортный сбой даёт прежнюю 502, не успешный stale-снимок; unsupported — 502 с unavailable без retryAfterMs. Контракты chat/interrupt/module и OS-MATRIX согласованы."
      ],
      "checks": [],
      "commitMessage": "fix: paginate Codex history and preserve turn snapshots",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/chat.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/interrupt.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002b1"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T002b2",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Читать Codex порциями с ограниченными gaps и совместимым снимком Stop",
      "why": "Читать Codex порциями с ограниченными gaps и совместимым снимком Stop"
    },
    {
      "acceptance": [
        "Каждый poll сначала обновляет снимок управления; ошибка items не инвалидирует успешный status, TTL 6с и резерв повторного status учитываются.",
        "Два preflight и подтверждение Stop — собственные свежие RPC без shared inflight/кэша; nativeTurnId, stale successor и deadline 8с сохранены.",
        "Во всём адаптере нет thread/read includeTurns:true или resume без excludeTurns, включая thread-ops.ts и parameter-update.ts; проверено счётчиками RPC.",
        "Крупная история не блокирует Stop и изменение параметров; контракты interrupt/parameters/module и OS-MATRIX обновлены."
      ],
      "checks": [],
      "commitMessage": "fix: read fresh Codex turn state and exclude resume history",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/interrupt.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002b2"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T002c",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Сохранить свежие проверки Stop и исключить историю из всех resume",
      "why": "Сохранить свежие проверки Stop и исключить историю из всех resume"
    },
    {
      "acceptance": [
        "Новый realpath/handshake/initialize учитывает замену сокета; наблюдаемые признаки из T001 инвалидируют устаревшие положительные снимки при смене сервера.",
        "Backoff 250мс/1с/2с/4с/10с, единый recovery probe, deadline и cleanup предотвращают шторм и утечки.",
        "Потеря ответа после изменяющего RPC не вызывает повторную отправку; произвольный withDaemon callback не переигрывается.",
        "Параметры и лента возобновляются после возврата демона; auth/protocol/unsupported не становятся бесконечным сетевым retry.",
        "Injected linux/win32 и ранний выход proxy проверены; контракты и OS-MATRIX обновлены.",
        "Координатор расширяет daemon()/inflight без второго цикла проб; server identity и reconnect epoch различаются. Только сетевой сбой меняет epoch: oversized/нормальное закрытие withDaemon не инвалидируют Stop/gaps и не запускают backoff.",
        "Лента/параметры завершают poll за 5с, cooldown отвечает сразу; серверный монотонный отсчёт 30с един для вкладок. retryAfterMs — остаток до следующей пробы ≤11с с jitter.",
        "Наличие/отсутствие снимка даёт строго определённые 200 либо 503; крупный элемент не запускает сетевой retry."
      ],
      "checks": [],
      "commitMessage": "fix: recover Codex socket reads with bounded retry",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md",
          "required": true
        },
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/interrupt.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002c"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Восстанавливать соединение и повторять только безопасные чтения",
      "why": "Восстанавливать соединение и повторять только безопасные чтения"
    },
    {
      "acceptance": [
        "Панель понимает sync loading/ready/reconnecting/unavailable и ответы других провайдеров без sync.",
        "После 30 секунд показывается понятное предложение проверить демон; успешное чтение убирает сообщение без success-строки.",
        "Ошибка и recovery сохраняют draft, scroll, focus, queued bubbles; действие не отправляется повторно.",
        "Служебные строки под composer M28 не возвращаются; ошибки действий пользователя остаются видимыми.",
        "Модельные и браузерные регрессии, module.md и OS-MATRIX обновлены; каждый документ ≤28000 байт, запас module.md проверен до старта.",
        "Покрыты partial/gaps, 503 без снимка и серверный 30-секундный unavailable; catch не очищает браузерный снимок.",
        "UX параметров без изменений: фоновые GET тихие и сохраняют значения, POST не повторяется, existing action errors и FAILURE_SHOW_MS pending failures сохранены; восстановление проверено без reload."
      ],
      "checks": [],
      "commitMessage": "fix: preserve session chat while Codex reconnects",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Показать восстановление ленты с сохранением ввода и прокрутки",
      "why": "Показать восстановление ленты с сохранением ввода и прокрутки"
    },
    {
      "acceptance": [
        "Реальный тестовый WebSocket и подставной proxy проходят историю >16 МиБ, разрыв и замену сокета, восстановление нескольких читателей.",
        "Счётчики RPC подтверждают отсутствие full-history чтений и повторов изменяющих RPC; Stop проверяет нужную цель после reconnect.",
        "Браузерный сценарий подтверждает сохранение ленты/поля/очереди и появление новых сообщений после восстановления.",
        "Настроенные обязательные проверки проходят; evidence содержит команды, SHA, результаты и честные pending для live и CI каждой ОС.",
        "Дефекты завершённых задач оформляются fixes round через Kit; эта задача не подменяет их скрытым изменением реализации.",
        "Измерены UTF-8 байты/страницы/deadline/кэш/RPC на poll, включая устойчивый активный ход: завершённые outputs не скачиваются заново. Короткая реплика → output >16 МиБ → короткий ответ в одном ходе: обе реплики видны; gap не перечитывается, epoch/backoff/Stop не меняются.",
        "Отдельно проверены подтверждённый T001 механизм курсоров, два независимых Stop preflight, updateParameters excludeTurns, одинаковый серверный downtime для Mac/iPad. Размер session-chat/module.md не превышает 28000 байт."
      ],
      "checks": [],
      "commitMessage": "test: cover Codex long history and socket recovery",
      "confirmation": null,
      "context": [
        {
          "path": "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
          "required": true
        },
        {
          "path": "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/evidence/M32-codex-history-recovery.md",
        "docs/architecture/OS-MATRIX.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Проверить длинную историю и восстановление сквозными сценариями",
      "why": "Проверить длинную историю и восстановление сквозными сценариями"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R1",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T001",
        "T002a",
        "T002b1",
        "T002b2",
        "T002c",
        "T003",
        "T004",
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M32-codex-history-recovery.md",
        "docs/planning/M32-codex-validation.md",
        "docs/evidence/M32-codex-protocol.md",
        "docs/planning/M32-codex-protocol-plan.md",
        "docs/planning/M32-codex-connection.md",
        "docs/planning/M32-document-split.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "docs/evidence/M32-codex-history-recovery.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "task:start с --confirmed разрешением пользователя; patch-версия от актуальной базы, штатная сборка и локальная установка после T005 и DOCS.",
        "wfk doctor --installed и smoke установленной службы успешны; evidence содержит версию и исходный SHA, пользовательский активный ход не прерывается.",
        "Живые сценарии предоставлены пользователю macOS/iPad и Windows-тестеру; непроведённые отмечены pending, main не публикуется.",
        "Версия согласована в package.json/package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/usage.md; local-delivery.md содержит команды и установленный результат."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver Codex history recovery update",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T005",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "docs/evidence/M32-codex-history-recovery.md",
        "README.md",
        "docs/installation.md",
        "docs/usage.md",
        "docs/evidence/M32/local-delivery.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Собрать и установить исправление для живой приёмки",
      "why": "Собрать и установить исправление для живой приёмки"
    },
    {
      "acceptance": [
        "Разрешён только push ci/M32-codex-history-recovery без force; чужие remote изменения сохраняются, main не публикуется.",
        "Для точного SHA T006 зелёные macOS/Linux/Windows x64/ARM64, evidence содержит SHA/URL/results; падение CI не объявляется DONE.",
        "Собственный evidence/plan commit T007 не отправляется после DONE: его CI проводится при отдельной публикации main после приёмки и закрытия; здесь требуется CI поставляемого SHA T006. Функциональные дефекты — fixes round."
      ],
      "checks": [],
      "commitMessage": "docs: record Codex history recovery cross-platform CI",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T006",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M32-codex-history-recovery.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Проверить поставляемый SHA в CI на четырёх платформах",
      "why": "Проверить поставляемый SHA в CI на четырёх платформах"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M32-codex-history-recovery-retry1 (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 3/11
- Revision: 1008

## Objective

Порционная загрузка длинного диалога Codex и автоматическое восстановление чтения после исчезновения сокета без повторных действий пользователя

## Acceptance

- История суммарно более 16 МиБ читается порциями; новые реплики появляются без повторного полного обхода; большой отдельный элемент имеет явный ограниченный путь обработки.
- После возврата сокета чтение ленты и параметров восстанавливается без reload; сообщения, черновик, фокус и очередь сохраняются.
- Автоматический retry не повторяет turn/start, turn/interrupt и изменение параметров; Stop подтверждает только конкретный nativeTurnId без полной истории.
- Проверены совместимость paginated/legacy и пределы памяти/страниц/deadline; неподдерживаемые случаи документированы без скрытого full-history fallback.
- Обязательные проверки и CI точного поставляемого SHA зелёные на macOS, Linux, Windows x64/ARM64; живая приёмка пользователя и Windows-тестера отдельно подтверждается, pending не выдаётся за passed.
- Контракты и OS-MATRIX согласованы; локальная сборка установлена и проверена; опубликована только разрешённая CI-ветка, main не публикуется.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Подтвердить протокол пагинации и совместимость старых сессий (work)
  - Commit: docs: verify Codex paginated history protocol
  - Files: docs/planning/M32-codex-history-recovery.md, docs/planning/M32-codex-validation.md, docs/evidence/M32-codex-protocol.md, docs/planning/M32-codex-protocol-plan.md, docs/planning/M32-codex-connection.md, docs/planning/M32-document-split.md
- [DONE] T002a — Ограничить транспорт и сохранить типизированные ошибки (work)
  - Commit: fix: bound Codex websocket messages and preserve transport errors
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/ws.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, docs/architecture/OS-MATRIX.md
  - Depends on: T001
- [DONE] T002b1 — Расширить контракт ленты и исправить повторную обрезку текста (work)
  - Commit: fix: add chat sync contract and idempotent text normalization
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, docs/architecture/OS-MATRIX.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/chat.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/routes.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/chat-routes.test.ts
  - Depends on: T002a
- [TODO] T002b2 — Читать Codex порциями с ограниченными gaps и совместимым снимком Stop (work)
  - Commit: fix: paginate Codex history and preserve turn snapshots
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OS-MATRIX.md
  - Depends on: T002b1
- [TODO] T002c — Сохранить свежие проверки Stop и исключить историю из всех resume (work)
  - Commit: fix: read fresh Codex turn state and exclude resume history
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OS-MATRIX.md
  - Depends on: T002b2
- [TODO] T003 — Восстанавливать соединение и повторять только безопасные чтения (work)
  - Commit: fix: recover Codex socket reads with bounded retry
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OS-MATRIX.md
  - Depends on: T002c
- [TODO] T004 — Показать восстановление ленты с сохранением ввода и прокрутки (work)
  - Commit: fix: preserve session chat while Codex reconnects
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/architecture/OS-MATRIX.md
  - Depends on: T003
- [TODO] T005 — Проверить длинную историю и восстановление сквозными сценариями (work)
  - Commit: test: cover Codex long history and socket recovery
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/test, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/evidence/M32-codex-history-recovery.md, docs/architecture/OS-MATRIX.md
  - Depends on: T004
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M32-codex-history-recovery.md, docs/planning/M32-codex-validation.md, docs/evidence/M32-codex-protocol.md, docs/planning/M32-codex-protocol-plan.md, docs/planning/M32-codex-connection.md, docs/planning/M32-document-split.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, docs/architecture/OS-MATRIX.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, docs/evidence/M32-codex-history-recovery.md
  - Depends on: T001, T002a, T002b1, T002b2, T002c, T003, T004, T005
- [TODO] T006 — Собрать и установить исправление для живой приёмки (delivery)
  - Commit: chore: deliver Codex history recovery update
  - Files: package.json, package-lock.json, CHANGELOG.md, docs/evidence/M32-codex-history-recovery.md, README.md, docs/installation.md, docs/usage.md, docs/evidence/M32/local-delivery.md
  - Depends on: T005, DOCS-R1
- [TODO] T007 — Проверить поставляемый SHA в CI на четырёх платформах (delivery)
  - Commit: docs: record Codex history recovery cross-platform CI
  - Files: docs/evidence/M32-codex-history-recovery.md
  - Depends on: T006, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
