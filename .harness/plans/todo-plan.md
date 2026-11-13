# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-13T11:13:51.984Z",
    "scopeId": "m24-interface-polish"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 804,
  "rounds": [
    {
      "digest": {
        "contracts": [
          "Provider.readParameters/updateParameters; GET/POST parameters; очередь, журнал и типизированные ошибки.",
          "Атомарные снимки и createJsonlTail: блоки, редкие записи, частичная строка, сброс при замене.",
          "Codex: каталоги, совместимость, подтверждение, следующий ход и экспериментальный API.",
          "Claude: statusline, отдельный --settings, снимок/транскрипт/лимиты; редактирование выключено.",
          "Диалог: видимый single-flight опрос, кольцо/лимиты, доступное меню, fallback M24."
        ],
        "decisions": [
          "T001 разрешила реализацию после проверки обоих направлений с пользователем.",
          "Живая строка установленного Claude проверяется в T008; T006 доказывает автоматическую цепочку.",
          "Скорость сохраняет последнее явное service_tier; отсутствие поля не означает стандартную.",
          "Общий контракт не знает провайдеров; подписи, стиль и варианты принадлежат адаптерам.",
          "Таблица данных перенесена в CONTRACTS из-за лимита размера обзора."
        ],
        "references": [
          "docs/planning/M25-session-parameters.md",
          "docs/design/M25-session-parameters-rules.md",
          "docs/evidence/M25-acceptance.md",
          "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md",
          "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md",
          "product-parts/backend-core/clusters/runtime/modules/cli/statusline.md",
          "product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md"
        ],
        "result": "Реализованы чтение параметров Claude/ChatGPT, управление ChatGPT и строка/меню диалога. T001 положительная; автоматические и браузерные проверки выполнены. Поставка и живая приёмка отдельно."
      },
      "id": "R1",
      "kind": "implementation",
      "status": "CLOSED",
      "title": "Implementation"
    },
    {
      "digest": null,
      "id": "R2",
      "kind": "fixes",
      "status": "OPEN",
      "title": "M25: отказы Windows в предварительной CI"
    }
  ],
  "schema": "harness-workflow-plan/1",
  "scope": {
    "acceptance": [
      "В диалоге сессий Claude и ChatGPT видны модель, усилие, режим, заполнение контекста и лимиты подписки с фактическими значениями провайдера.",
      "Строка параметров повторяет порядок, подписи, цвета и значки родных приложений по скриншотам пользователя от 13.11.2026; шрифт — стек шрифтов провайдера.",
      "Модель, усилие, скорость, режим и разрешения сессии ChatGPT меняются из диалога Kit и действуют на следующий ход, в том числе отправленный из приложения ChatGPT; полный доступ требует подтверждения.",
      "Строка состояния пользователя в терминале Claude не изменилась; Kimi и провайдеры без параметров показывают прежнюю строку.",
      "Контракты, матрица ОС и доказательства обновлены; локальная поставка 0.11.0 установлена после подтверждения пользователя.",
      "CI четырёх платформ зелёная на SHA поставки на ветке ci/m25-session-parameters, отправленной по прямой команде пользователя вне задач плана; SHA и ссылка на прогон записаны в доказательства до приёмки."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-13T13:01:34.759Z",
      "text": "Пользователь (13.11.2026): «Затем подготовь спецификацию и to-do plan по первому этапу. То есть у двух провайдеров показывать полную информацию, при этом, пожалуйста, формат и шрифты выбрать из тех, которые используют сами провайдеры. Я дам скриншот. И по именам моделей ты поймешь, у кого какие. А для ChatGPT делаем полное управление прямо из диалога Workflow Kit.» Панель Workflow Kit: пользователь выбрал спецификацию и план с ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "d98bfecb8ba49a745ae2028f357fd05092409077",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M25-session-parameters.md",
        "required": true
      },
      {
        "path": "docs/design/M25-session-parameters-rules.md",
        "required": true
      },
      {
        "path": "docs/design/M25-session-parameters-facts.md",
        "required": true
      },
      {
        "path": "docs/design/M24-browser-verification.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Родные строки параметров заданы скриншотами пользователя от 13.11.2026; их описание — в разделе 5 документа фактов M25."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Строка параметров остаётся под рамкой ввода справа у всех провайдеров (геометрия M24); повторяются порядок, подписи, цвета и значки родной строки."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Файлы фирменных шрифтов в Kit не включаются; провайдер называет стек шрифтов, при отсутствии фирменного работает системный."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Лимиты Claude берутся из строки состояния через обёртку wfk statusline, которая передаёт вывод пользовательского скрипта без изменений."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "В M25 управление параметрами — только ChatGPT; у Claude только показ."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Расширение разрешений ChatGPT до полного доступа требует подтверждения в меню."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Первая задача — живая проба с пользователем: действует ли изменение из Kit на ход из приложения ChatGPT; при отрицательном исходе scope блокируется до решения пользователя."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Поставка и CI (раздел 8 правил M25): задача поставки делает локальную установку без push; ветку ci/m25-session-parameters отправляют по прямой команде пользователя вне задач плана; зелёная CI на SHA поставки — условие приёмки scope; main публикуется после приёмки и закрытия."
      },
      {
        "at": "2026-11-13T13:01:34.759Z",
        "text": "Последовательное выполнение: проба и общий контракт первыми, общие документы меняются в каждой задаче."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 3,
      "ownerSession": "802334f8-ed69-4bb0-b3e7-d06d00de96af",
      "strategy": "sequential"
    },
    "id": "m25-session-parameters",
    "objective": "Диалог Workflow Kit показывает у Claude и ChatGPT модель, усилие, режим, контекст и лимиты в оформлении провайдеров; параметры сессии ChatGPT меняются из диалога.",
    "spec": "docs/planning/M25-session-parameters.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "При активном общем доступе на чате проекта выполнены четыре шага раздела 1 правил M25; скрипт пробы в репозиторий не входит, функциональные файлы не меняются.",
        "Доказательства M25 содержат: что показали переключатели приложения ChatGPT на Mac и iPad (наблюдение пользователя), фактические модель и усилие turn_context хода, отправленного из приложения после изменения из Kit, и результат обратного направления.",
        "Документ фактов M25 обновлён; исход назван явно по таблице раздела 1 правил M25: положительный, частичный или отрицательный.",
        "Следующая задача начинается только при положительном исходе. При частичном и отрицательном T001 завершается записью наблюдений, после чего scope блокируется командой task:block до решения пользователя; агент сам ограничение не принимает, порядок продолжения — раздел 1 правил M25."
      ],
      "checks": [],
      "commitMessage": "docs: record the ChatGPT parameter control probe",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true,
          "heading": "1. Проба осуществимости идёт первой (T001)"
        },
        {
          "path": "docs/design/M25-session-parameters-facts.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/design/M25-session-parameters-facts.md",
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Проба с пользователем: изменение из Kit и приложение ChatGPT",
      "why": "Управление ChatGPT имеет смысл, только если изменение из Kit действует на ходы из приложения"
    },
    {
      "acceptance": [
        "Типы раздела 2.1 (включая reason параметра и правило editable) и необязательные методы readParameters и updateParameters добавлены; существующие импорты публичного входа работают; ни один файл не превышает предел строк.",
        "GET и POST …/parameters находят сессию в listSessions проекта по localId, затем по remoteId, и передают провайдеру localId; сессия другого проекта получает 404 unknown-session до любого вызова readParameters или updateParameters (тест с существующей сессией другого проекта).",
        "GET отдаёт { supported: false } для провайдера без метода; POST проверяет тело и возвращает коды ошибок таблицы 2.1 с указанными статусами.",
        "POST одной сессии выполняются строго по очереди: тест с двумя одновременными запросами подтверждает, что второй вызов провайдера начинается после завершения первого; запросы разных сессий друг друга не ждут.",
        "Изменение параметра пишется в журнал событий службы: провайдер, сессия, параметр, старое и новое значение.",
        "Снимки: пути, запись через временный файл и переименование, отказ для недопустимого id сессии; тесты с платформами darwin, linux и win32.",
        "jsonl-tail по разделу 3 правил: холодное чтение блоками до предела, продолжающее чтение с сохранением эффективных значений; образцы — редкая запись за пределами последнего мегабайта, строка длиннее блока, незавершённая последняя запись, укороченный файл.",
        "Возможности sessionParameters и updateParameters объявляются через capabilities(); заглушка и Kimi ведут себя как раньше.",
        "CONTRACTS.md обновлён. Проверки коммита прошли; module.md модуля и связанный документ, матрица ОС в OVERVIEW.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "feat: add the session parameters contract and routes",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "2.1. Контракт и API (`provider-registry`)"
        },
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true
        },
        {
          "path": "docs/design/M25-session-parameters-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-contract/cluster.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OVERVIEW.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/context.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/jsonl-tail.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-snapshots.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameter-storage.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Контракт параметров сессии, маршруты, очередь, снимки и чтение JSONL",
      "why": "Провайдеры и панель обмениваются параметрами по одному контракту, не называя провайдеров"
    },
    {
      "acceptance": [
        "readParameters по разделу 2.2: модель и усилие из thread/read без загрузки треда; скорость, режим, разрешения и контекст из файла сессии через jsonl-tail; лимиты и каталоги с указанными кэшами.",
        "Подписи и порядок соответствуют таблице 2.2 (GPT-6.1 Sol, «Высокое», молния только при priority); незнакомое значение показывается идентификатором; параметр без данных не включается.",
        "Разрешения распознаются только по структурам раздела 4 правил: тесты стандартного :workspace, полного доступа, только чтения и нестандартного профиля с записью в иной путь («Особые разрешения», value null); value распознанного профиля равен идентификатору каталога.",
        "Соединения по разделу 5 правил: experimentalApi с повтором без флага; при недоступном каталоге параметр показан без options с reason; editable истинно только при наличии options; тесты обоих вариантов соединения.",
        "Чтение при просроченном или пустом сохранённом состоянии общего доступа не вызывает runCommand и sharedMode.refresh() (тест); оно не вызывает thread/resume и turn/start.",
        "Тред без файла сессии, незнакомая запись и отказ демона обработаны без ошибки показа; тесты на подставном демоне с платформами darwin, linux и win32.",
        "Доказательства M25 содержат результат живого чтения. Проверки коммита прошли; module.md модуля и связанный документ, матрица ОС в OVERVIEW.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "feat(codex): read session parameters",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "2.2. ChatGPT: чтение (`provider-codex/src/parameters.ts`)"
        },
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true
        },
        {
          "path": "docs/design/M25-session-parameters-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-values.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameters.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "ChatGPT: чтение параметров сессии",
      "why": "Строка ChatGPT показывает фактические модель, усилие, скорость, режим, разрешения, контекст и лимиты"
    },
    {
      "acceptance": [
        "updateParameters по разделу 2.3: проверка присланных значений по каталогам; при смене модели унаследованное усилие, не подходящее новой модели, заменяется её defaultReasoningEffort, неподходящая скорость сбрасывается в стандартную, о каждой поправке строка в notes; усилие или скорость, присланные в запросе и не подходящие модели, дают parameter-invalid без автозамены; подтверждение полного доступа; перед изменением общий доступ перепроверяется через sharedMode.refresh().",
        "В один thread/settings/update уходят присланное поле и зависимые поправки, прочие настройки не передаются; collaborationMode передаётся только при смене режима, с моделью и усилием, прочитанными внутри очереди сессии (тесты: смена усилия содержит только effort; смена модели с подходящими усилием и скоростью содержит только model; оба запроса не содержат collaborationMode и не меняют developer_instructions).",
        "Тесты зависимых поправок: переход с усилия ultra на модель без ultra отправляет model и effort по умолчанию этой модели и возвращает строку в notes; переход на модель без текущей скорости отправляет model и serviceTier: null со строкой в notes; оба случая вместе дают одну отправку с тремя полями и две строки notes; явно присланное неподдерживаемое усилие даёт parameter-invalid и ничего не отправляет.",
        "Два изменения разных параметров, построенные клиентами от одного старого состояния, оба сохраняются (тест на очереди и перечитывании).",
        "Незагруженный тред проходит thread/resume → thread/settings/update → thread/unsubscribe; идущий ход не меняется; Kit не отвечает на запросы одобрений.",
        "Отказы parameter-invalid, confirmation-required и parameters-unavailable возвращаются с текстами спецификации; отказ «метод недоступен» запоминается до refresh() и отключает options; ответ успеха — заново прочитанные параметры.",
        "Все ветки покрыты тестами на подставном демоне с платформами darwin, linux и win32.",
        "Доказательства M25 содержат живую пробу изменения на тестовом треде, удалённом после пробы. Проверки коммита прошли; module.md модуля и связанный документ, матрица ОС в OVERVIEW.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "feat(codex): update session parameters",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "2.3. ChatGPT: изменение (`provider-codex/src/parameters.ts`)"
        },
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true
        },
        {
          "path": "docs/design/M25-session-parameters-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-update.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameter-update.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameters.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "ChatGPT: изменение параметров сессии",
      "why": "Пользователь меняет модель, усилие, скорость, режим и разрешения ChatGPT из диалога Kit"
    },
    {
      "acceptance": [
        "wfk statusline --client <id> по разделу 2.4 пишет снимок сессии и файл лимитов и всегда завершается с кодом 0; настройка ищется в порядке local → project → user, команда с wfk statusline пропускается; stdin ограничен 1 МиБ; снимки старше 30 суток удаляются; снимок не содержит текста переписки.",
        "Команда пользователя получает исходный stdin байт в байт, её stdout возвращается байт в байт: тесты с Unicode, кавычками и многострочным выводом; при отсутствии настройки вывод пустой.",
        "Оболочка по разделу 6 правил: /bin/sh на macOS и Linux; на Windows Git Bash (CLAUDE_CODE_GIT_BASH_PATH, затем bash из PATH), без него PowerShell; cmd не используется; ветки проверены с подставленной платформой.",
        "По истечении 5 с завершается всё дерево процессов команды (группа процессов на macOS и Linux, taskkill /T /F на Windows): тест подтверждает, что зависшая команда и её дочерний процесс не остаются; вывод пустой, код 0.",
        "Ошибка записи снимка, отсутствие службы и отсутствие оболочки не меняют вывод пользовательской команды и код завершения (тесты).",
        "Новые вызовы программ внесены в allowlist с описанием для трёх ОС. Проверки коммита прошли; module.md модуля и связанный документ, матрица ОС в OVERVIEW.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "feat(cli): capture Claude status line snapshots",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "2.4. Claude: снимок строки состояния (`cli`, команда `wfk statusline`)"
        },
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true
        },
        {
          "path": "docs/design/M25-session-parameters-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "bin",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/statusline-shell.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/statusline.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/statusline.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/statusline.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Команда wfk statusline: снимок и строка пользователя",
      "why": "Лимиты, размер окна и имя модели Claude отдаёт только команде строки состояния"
    },
    {
      "acceptance": [
        "Сессии и возобновления панели запускаются с --settings на macOS, Linux и Windows; каждый запуск получает свой неизменяемый файл настроек (раздел 7 правил); padding и refreshInterval копируются из действующей настройки пользователя; окружение папки запускается как раньше.",
        "Тест двух одновременных запусков разных проектов с разными padding и refreshInterval подтверждает, что каждый процесс получил свой файл со своими значениями.",
        "readParameters по разделу 2.5: снимок, затем транскрипт через jsonl-tail, затем файл лимитов; сессия без снимка получает модель, усилие и режим из транскрипта и имя модели из идентификатора; editable всегда false; чтение не запускает программ.",
        "Режим находится и тогда, когда запись permission-mode лежит дальше последнего мегабайта транскрипта, и сохраняется при следующих чтениях (тест).",
        "Подписи соответствуют таблице 2.5 (Fable 5.2, High, Auto); незнакомое значение показывается идентификатором; окно лимита с прошедшим resets_at не показывается.",
        "Ветки ОС проверены с подставленной платформой; существующие тесты pty, диалогов и прерывания проходят.",
        "Доказательства M25 содержат автоматическую проверку запуска с файлом настроек и сохранения пользовательской строки; живая проверка установленной сессии панели (снимок и неизменность строки пользователя) остаётся обязательной в T008 после установки новой команды wfk statusline. Проверки коммита прошли; module.md модуля и связанный документ, матрица ОС в OVERVIEW.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "feat(claude): read session parameters",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "2.5. Claude: чтение и запуск (`provider-claude`)"
        },
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true
        },
        {
          "path": "docs/design/M25-session-parameters-facts.md",
          "required": true
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-settings.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-launch.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameters.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Claude: запуск с --settings и чтение параметров",
      "why": "Строка Claude показывает фактические модель, усилие, режим, контекст и лимиты"
    },
    {
      "acceptance": [
        "Строка по разделу 2.6 для обоих значений ring: порядок, тона, молния, стрелка и кольцо совпадают с описанием скриншотов; шрифт и цвет дуги ставятся через CSSOM после проверки; обе темы.",
        "Кольцо контекста и лимиты показывают значения и открывают подсказки по нажатию; пороги 80 % и 95 % меняют цвет лимита; при отсутствии данных элемент лимитов отсутствует, кольцо пустое.",
        "Меню при editable: true: разделы по всем параметрам из items, отметка текущего значения, POST по выбору, блокировка на время запроса, подтверждение для варианта с confirm, итог, notes и ошибки под вводом; параметр без options остаётся в меню разделом с текущим значением и его reason, без выбора; при editable: false стрелки нет, причина в подсказке.",
        "Частичная доступность проверена тестом чистой логики и в браузерной проверке: у model и effort есть options, у mode нет options и есть reason — меню содержит выбираемые разделы «Модель» и «Усилие» и недоступный раздел «Режим» с причиной.",
        "supported: false оставляет строку M24; опрос раз в 5 с с одним запросом на сессию; ошибка чтения сохраняет последние значения.",
        "Доступность: роли меню, Esc, стрелки, возврат фокуса, области нажатия 44×44 px на сенсорном экране, ничего только по наведению; текст через textContent; CSP не ослаблен; меню не меняет высоту карточки и не выходит за окно на iPad.",
        "Чистая логика покрыта тестами; браузерная проверка по M24-browser-verification на подставном API выполнена, скриншоты и результаты — в доказательствах M25.",
        "Проверки коммита прошли; module.md модуля и связанный документ, матрица ОС в OVERVIEW.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "feat(panel): show and change session parameters in the dialog",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "2.6. Диалог (`session-chat`)"
        },
        {
          "path": "docs/design/M25-session-parameters-facts.md",
          "required": true,
          "heading": "5. Родное оформление (скриншоты пользователя 13.11.2026, тёмная тема)"
        },
        {
          "path": "docs/design/M24-browser-verification.md",
          "required": true
        },
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "product-parts/control-panel/clusters/web-panel/cluster.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md",
        "docs/evidence/M25",
        "docs/evidence/M25/browser-results.json",
        "docs/evidence/M25/chatgpt-200pct-dark.png",
        "docs/evidence/M25/chatgpt-desktop-dark.png",
        "docs/evidence/M25/chatgpt-desktop.png",
        "docs/evidence/M25/chatgpt-partial-menu.png",
        "docs/evidence/M25/chatgpt-touch-menu-dark.png",
        "docs/evidence/M25/claude-ipad-dark.png",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/check.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/chevron-down.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/zap.svg",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/parameters-model.test.ts"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Диалог: строка параметров в оформлении провайдера и меню",
      "why": "Пользователь видит параметры в привычном виде и меняет параметры ChatGPT в диалоге"
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
        "T002",
        "T003",
        "T004",
        "T005",
        "T006",
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M25-session-parameters.md",
        "docs/design/M25-session-parameters-facts.md",
        "docs/evidence/M25-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-contract/cluster.md",
        "docs/architecture/CONTRACTS.md",
        "product-parts/control-panel/clusters/web-panel/cluster.md"
      ],
      "fixes": null,
      "id": "DOCS-R1",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R1",
      "status": "DONE",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "Записи одного файла выполняются по очереди; записи разных файлов не блокируют друг друга; временный файл переименовывается атомарно без предварительного удаления назначения.",
        "EPERM/EACCES/EBUSY при переименовании имеют ограниченный повтор; прочие ошибки возвращаются сразу; тесты воспроизводят transient отказ и сохраняют прежний снимок при постоянном отказе.",
        "Тест десяти конкурентных записей сохранён; локальные обязательные проверки прошли. Контракт и доказательства содержат исходный Windows сбой и изменение."
      ],
      "checks": [],
      "commitMessage": "fix(parameters): serialize atomic snapshot replacement",
      "confirmation": null,
      "context": [],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-snapshots.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameter-storage.test.ts"
      ],
      "fixes": "T002",
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "DONE",
      "title": "Снимки: сериализация и атомарная замена при занятости файла",
      "why": "Windows x64 CI 43439309345 получила EPERM при десяти одновременных переименованиях снимка"
    },
    {
      "acceptance": [
        "После тайм-аута вывод пустой, а Promise завершается после закрытия процесса и завершения операции уничтожения дерева, включая Windows taskkill /T /F.",
        "Детерминированный тест задержанного завершения taskkill и существующий тест гибели команды/дочернего процесса проходят; тесты Windows не ослабляются удалением проверок.",
        "Контракт, матрица ОС и доказательства обновлены; обязательные проверки прошли. Предварительная CI после раунда проверяется до начала поставки."
      ],
      "checks": [],
      "commitMessage": "fix(statusline): await process tree termination",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T010"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": "T005",
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R2",
      "status": "TODO",
      "title": "Statusline: дождаться завершения дерева и закрытия процесса",
      "why": "Windows x64 CI 43439309345 получила EBUSY при очистке cwd ещё завершающегося процесса"
    },
    {
      "acceptance": [
        "Project-wide documents describe the round result",
        "The round digest records result, decisions, contracts and references"
      ],
      "checks": [],
      "commitMessage": "docs: reconcile documentation for R2",
      "confirmation": null,
      "context": [],
      "dependencies": [
        "T010",
        "T011"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": null,
      "id": "DOCS-R2",
      "iteration": 1,
      "kind": "docs",
      "roundId": "R2",
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "После отдельного подтверждения пользователя и задачи DOCS штатным способом подготовлен и установлен локальный релиз 0.11.0; установленная служба проверена.",
        "Версия согласована в package.json, README.md, docs/installation.md, docs/usage.md, OVERVIEW.md и CHANGELOG; доказательства M25 содержат команды, результаты, SHA поставки и список живых проверок раздела 4 с исполнителями по ОС.",
        "Задача не выполняет git push; её коммит — SHA поставки; в доказательствах записано «CI ожидает отправки ветки ci/m25-session-parameters» с этим SHA. Зелёную CI проверяет T009 (раздел 8 правил M25)."
      ],
      "checks": [],
      "commitMessage": "chore(release): install Workflow Kit 0.11.0 locally",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "4. Проверка"
        },
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true,
          "heading": "8. Поставка и CI"
        }
      ],
      "dependencies": [
        "T007",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/usage.md",
        "docs/architecture/OVERVIEW.md",
        "docs/changelog",
        "docs/evidence/M25-acceptance.md",
        "docs/evidence/M25"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "Локальная поставка 0.11.0 и живая приёмка",
      "why": "Пользователь проверяет результат в установленной службе"
    },
    {
      "acceptance": [
        "Ветка ci/m25-session-parameters отправлена на SHA поставки пользователем либо агентом по его прямой команде в чате; сама задача git push не выполняет и функциональные файлы не меняет.",
        "До task:start агент проверил прогон CI для SHA поставки; задача начата с подтверждением пользователя и только при зелёной CI на macOS, Linux, Windows x64 и Windows ARM64.",
        "Доказательства M25 содержат SHA поставки, ссылку на прогон CI и итог по каждой из четырёх платформ.",
        "При красной или незапущенной CI задача не начинается и остаётся TODO: дефект исправляет раунд исправлений по разделу 8 правил M25, после него проверяется новый SHA."
      ],
      "checks": [],
      "commitMessage": "docs: record green CI for the M25 delivery",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M25-session-parameters-rules.md",
          "required": true,
          "heading": "8. Поставка и CI"
        },
        {
          "path": "docs/planning/M25-session-parameters.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T008",
        "DOCS-R2"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R2",
      "status": "TODO",
      "title": "CI четырёх платформ на SHA поставки",
      "why": "Поставка не завершена без зелёной CI на macOS, Linux, Windows x64 и Windows ARM64"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m25-session-parameters (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 9/13
- Revision: 804

## Objective

Диалог Workflow Kit показывает у Claude и ChatGPT модель, усилие, режим, контекст и лимиты в оформлении провайдеров; параметры сессии ChatGPT меняются из диалога.

## Acceptance

- В диалоге сессий Claude и ChatGPT видны модель, усилие, режим, заполнение контекста и лимиты подписки с фактическими значениями провайдера.
- Строка параметров повторяет порядок, подписи, цвета и значки родных приложений по скриншотам пользователя от 13.11.2026; шрифт — стек шрифтов провайдера.
- Модель, усилие, скорость, режим и разрешения сессии ChatGPT меняются из диалога Kit и действуют на следующий ход, в том числе отправленный из приложения ChatGPT; полный доступ требует подтверждения.
- Строка состояния пользователя в терминале Claude не изменилась; Kimi и провайдеры без параметров показывают прежнюю строку.
- Контракты, матрица ОС и доказательства обновлены; локальная поставка 0.11.0 установлена после подтверждения пользователя.
- CI четырёх платформ зелёная на SHA поставки на ветке ci/m25-session-parameters, отправленной по прямой команде пользователя вне задач плана; SHA и ссылка на прогон записаны в доказательства до приёмки.

## Rounds

### R1 — Implementation (implementation, CLOSED)

- [DONE] T001 — Проба с пользователем: изменение из Kit и приложение ChatGPT (work)
  - Commit: docs: record the ChatGPT parameter control probe
  - Files: docs/design/M25-session-parameters-facts.md, docs/evidence/M25-acceptance.md
- [DONE] T002 — Контракт параметров сессии, маршруты, очередь, снимки и чтение JSONL (work)
  - Commit: feat: add the session parameters contract and routes
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-contract/cluster.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/context.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/jsonl-tail.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-snapshots.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameters.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameter-storage.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameters.test.ts
  - Depends on: T001
- [DONE] T003 — ChatGPT: чтение параметров сессии (work)
  - Commit: feat(codex): read session parameters
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-values.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameters.test.ts
  - Depends on: T002
- [DONE] T004 — ChatGPT: изменение параметров сессии (work)
  - Commit: feat(codex): update session parameters
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameter-update.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameter-update.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/parameters.test.ts
  - Depends on: T003
- [DONE] T005 — Команда wfk statusline: снимок и строка пользователя (work)
  - Commit: feat(cli): capture Claude status line snapshots
  - Files: product-parts/backend-core/clusters/runtime/modules/cli, bin, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/statusline-shell.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/statusline.ts, product-parts/backend-core/clusters/runtime/modules/cli/statusline.md, product-parts/backend-core/clusters/runtime/modules/cli/test/statusline.test.ts
  - Depends on: T004
- [DONE] T006 — Claude: запуск с --settings и чтение параметров (work)
  - Commit: feat(claude): read session parameters
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/parameters.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameter-settings.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/parameters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/host.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/pty/session.exp, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/sessions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameter-launch.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parameters.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/parts.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/provider.test.ts
  - Depends on: T005
- [DONE] T007 — Диалог: строка параметров в оформлении провайдера и меню (work)
  - Commit: feat(panel): show and change session parameters in the dialog
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, product-parts/control-panel/clusters/web-panel/cluster.md, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md, docs/evidence/M25, docs/evidence/M25/browser-results.json, docs/evidence/M25/chatgpt-200pct-dark.png, docs/evidence/M25/chatgpt-desktop-dark.png, docs/evidence/M25/chatgpt-desktop.png, docs/evidence/M25/chatgpt-partial-menu.png, docs/evidence/M25/chatgpt-touch-menu-dark.png, docs/evidence/M25/claude-ipad-dark.png, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/parameters.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/composer.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/check.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/chevron-down.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/icons/zap.svg, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/parameters.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/parameters-model.test.ts
  - Depends on: T006
- [DONE] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M25-session-parameters.md, docs/design/M25-session-parameters-facts.md, docs/evidence/M25-acceptance.md, product-parts/provider-runtime/clusters/provider-contract/cluster.md, docs/architecture/CONTRACTS.md, product-parts/control-panel/clusters/web-panel/cluster.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007

Digest: Реализованы чтение параметров Claude/ChatGPT, управление ChatGPT и строка/меню диалога. T001 положительная; автоматические и браузерные проверки выполнены. Поставка и живая приёмка отдельно.

### R2 — M25: отказы Windows в предварительной CI (fixes, OPEN)

- [DONE] T010 — Снимки: сериализация и атомарная замена при занятости файла (work)
  - Commit: fix(parameters): serialize atomic snapshot replacement
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/parameters.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/parameter-snapshots.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/parameter-storage.test.ts
  - Fixes: T002
- [TODO] T011 — Statusline: дождаться завершения дерева и закрытия процесса (work)
  - Commit: fix(statusline): await process tree termination
  - Files: product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md
  - Depends on: T010
  - Fixes: T005
- [TODO] DOCS-R2 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R2
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md
  - Depends on: T010, T011
- [TODO] T008 — Локальная поставка 0.11.0 и живая приёмка (delivery)
  - Commit: chore(release): install Workflow Kit 0.11.0 locally
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/usage.md, docs/architecture/OVERVIEW.md, docs/changelog, docs/evidence/M25-acceptance.md, docs/evidence/M25
  - Depends on: T007, DOCS-R2
- [TODO] T009 — CI четырёх платформ на SHA поставки (delivery)
  - Commit: docs: record green CI for the M25 delivery
  - Files: docs/evidence/M25-acceptance.md
  - Depends on: T008, DOCS-R2

State changes only through `scripts/workflow` commands. History lives in Git.
