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
  "revision": 781,
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
      "status": "TODO",
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
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
        "Доказательства M25: сессия панели пишет снимок, строка состояния пользователя в терминале не изменилась. Проверки коммита прошли; module.md модуля и связанный документ, матрица ОС в OVERVIEW.md обновлены в том же коммите."
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
        "docs/evidence/M25-acceptance.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Claude: запуск с --settings и чтение параметров",
      "why": "Строка Claude показывает фактические модель, усилие, режим, контекст и лимиты"
    },
    {
      "acceptance": [
        "Строка по разделу 2.6 для обоих значений ring: порядок, тона, молния, стрелка и кольцо совпадают с описанием скриншотов; шрифт и цвет дуги ставятся через CSSOM после проверки; обе темы.",
        "Кольцо контекста и лимиты показывают значения и открывают подсказки по нажатию; пороги 80 % и 95 % меняют цвет лимита; при отсутствии данных элемент лимитов отсутствует, кольцо пустое.",
        "Меню при editable: true: разделы по items с options, отметка текущего значения, POST по выбору, блокировка на время запроса, подтверждение для варианта с confirm, итог, notes и ошибки под вводом; параметр без options показан в меню недоступным с его reason; при editable: false стрелки нет, причина в подсказке.",
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
        "docs/evidence/M25"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
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
      "status": "TODO",
      "title": "Reconcile project documentation and write the round digest",
      "why": "Keep the project context current for the next agent and close the round."
    },
    {
      "acceptance": [
        "После отдельного подтверждения пользователя и задачи DOCS штатным способом подготовлен и установлен локальный релиз 0.11.0; установленная служба проверена.",
        "Версия согласована в package.json, README.md, docs/installation.md, docs/usage.md, OVERVIEW.md и CHANGELOG; доказательства M25 содержат команды, результаты, SHA поставки и список живых проверок раздела 4 с исполнителями по ОС.",
        "Задача не выполняет git push; в доказательствах записано «CI ожидает отправки ветки ci/m25-session-parameters» с SHA поставки. Зелёная CI — условие приёмки scope (раздел 8 правил M25)."
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
        "DOCS-R1"
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
      "roundId": "R1",
      "status": "TODO",
      "title": "Локальная поставка 0.11.0 и живая приёмка",
      "why": "Пользователь проверяет результат в установленной службе"
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
- Progress: 0/9
- Revision: 781

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

### R1 — Implementation (implementation, OPEN)

- [TODO] T001 — Проба с пользователем: изменение из Kit и приложение ChatGPT (work)
  - Commit: docs: record the ChatGPT parameter control probe
  - Files: docs/design/M25-session-parameters-facts.md, docs/evidence/M25-acceptance.md
- [TODO] T002 — Контракт параметров сессии, маршруты, очередь, снимки и чтение JSONL (work)
  - Commit: feat: add the session parameters contract and routes
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-contract/cluster.md, docs/architecture/CONTRACTS.md, docs/architecture/OVERVIEW.md
  - Depends on: T001
- [TODO] T003 — ChatGPT: чтение параметров сессии (work)
  - Commit: feat(codex): read session parameters
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md
  - Depends on: T002
- [TODO] T004 — ChatGPT: изменение параметров сессии (work)
  - Commit: feat(codex): update session parameters
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md
  - Depends on: T003
- [TODO] T005 — Команда wfk statusline: снимок и строка пользователя (work)
  - Commit: feat(cli): capture Claude status line snapshots
  - Files: product-parts/backend-core/clusters/runtime/modules/cli, bin, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md
  - Depends on: T004
- [TODO] T006 — Claude: запуск с --settings и чтение параметров (work)
  - Commit: feat(claude): read session parameters
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md
  - Depends on: T005
- [TODO] T007 — Диалог: строка параметров в оформлении провайдера и меню (work)
  - Commit: feat(panel): show and change session parameters in the dialog
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, product-parts/control-panel/clusters/web-panel/cluster.md, docs/architecture/OVERVIEW.md, docs/evidence/M25-acceptance.md, docs/evidence/M25
  - Depends on: T006
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M25-session-parameters.md, docs/design/M25-session-parameters-facts.md, docs/evidence/M25-acceptance.md, product-parts/provider-runtime/clusters/provider-contract/cluster.md, docs/architecture/CONTRACTS.md, product-parts/control-panel/clusters/web-panel/cluster.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007
- [TODO] T008 — Локальная поставка 0.11.0 и живая приёмка (delivery)
  - Commit: chore(release): install Workflow Kit 0.11.0 locally
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/usage.md, docs/architecture/OVERVIEW.md, docs/changelog, docs/evidence/M25-acceptance.md, docs/evidence/M25
  - Depends on: T007, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
