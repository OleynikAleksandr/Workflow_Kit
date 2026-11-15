# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-15T12:33:36.390Z",
    "scopeId": "M32-codex-history-recovery-fix"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 1057,
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
      "T001 и T002 доказали канал показа и ответа для Claude и Codex из вариантов спецификации; недоказанный вариант — task:block и решение пользователя, а не молчаливое урезание.",
      "Вопрос Claude (AskUserQuestion) и вопрос Codex (request_user_input) виден карточкой в диалоге панели; ответ по кнопке доходит до агента, родное приложение показывает тот же итог, а ответ в приложении закрывает карточку.",
      "Kit не отвечает без нажатия пользователя, не принимает одобрения команд и правок, не пропускает через панель секретные ответы и не пишет текст вопросов и ответов в журналы.",
      "Лента, ввод, очередь, Stop, параметры, автопилот и провайдеры ChatGPT и Kimi не регрессировали; контракты модулей и матрица трёх ОС согласованы.",
      "0.14.0 установлена и проверена, CI точного SHA зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно."
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-15T13:15:13.651Z",
      "text": "Пользователь, 15.11.2026: «Что мы можем сделать, чтобы подобный интерактивный вопрос возникал и в Workflow Kit диалоге? Ну или похожий хотя бы, чтобы не писать в поле ввода пользователя «подтверждаю» или вариант, который предложен, а нажать, выбрать ответ и нажать «Submit».» В панели выбраны спецификация и план с ревью. | Execution mode chosen by the user: sequential: Выбор пользователя в панели Workflow Kit: выполнить самому, последовательно"
    },
    "baselineCommit": "087c69f889aa729497bc4808625ce2432cbadedc",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M33-agent-questions.md",
        "required": true
      },
      {
        "path": "docs/planning/M33-agent-questions-providers.md",
        "required": true
      },
      {
        "path": "docs/design/M33-claude-question-facts.md",
        "required": true
      },
      {
        "path": "docs/design/M33-codex-question-facts.md",
        "required": true
      }
    ],
    "decisions": [
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Спецификация и план с ревью; задачи не запускать до решения в панели."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Сначала пробы T001 и T002: они уточняют факты и выбирают только из вариантов спецификации (Claude — сочетание D1 и канала A1 или A2 из таблицы раздела 2.2; Codex — L1, L2 или только C0, признак исхода гонки); противоречие факта критерию следующих задач — task:block."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Родной вопрос не прячется: вариант A3 (удерживающий хук PreToolUse) в M33 не реализуется без отдельного решения пользователя."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Kit не отвечает за пользователя: ответ уходит только по явному нажатию в панели и передаётся провайдеру не больше одного раза; чужой или неподтверждённый итог агенту не приписывается."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Не входят approvals, ExitPlanMode, MCP elicitation, вопросы Kimi и кнопка «Пропустить»."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Живые ходы — только после прямого согласия пользователя с бюджетом: T001 до 12 коротких ходов Haiku (серия K — ещё до 4), T002 до 8 коротких ходов Codex, T008 до 3 ходов Haiku и 2 ходов Codex, T009 до 2 ходов Haiku и 2 ходов Codex."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Видимое в Claude Desktop и ChatGPT подтверждает пользователь; без подтверждения факт остаётся «не проверено»."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Спецификация разделена на основной документ и решение по провайдерам; контракты модулей пишутся в новые questions.md рядом с module.md: документы не сжимаются под предел 28 000 байт."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Расхождение полноты текстовой ленты (строка о ходе работы в Claude Desktop) записано в разделе 7 спецификации и в M33 не входит."
      },
      {
        "at": "2026-11-15T13:15:13.651Z",
        "text": "Рекомендован sequential: пробы требуют участия пользователя, задачи реализации меняют общий контракт и общие документы по цепочке; поставка, CI точного SHA, приёмка, закрытие и публикация main разделены."
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 2,
      "ownerSession": "4f9ed632-4ce4-4d1f-8c95-dbc1b23b1186",
      "strategy": "sequential"
    },
    "id": "M33-agent-questions",
    "objective": "Показывать интерактивный вопрос агента Claude (AskUserQuestion) и ChatGPT/Codex (request_user_input) карточкой в диалоге панели и доставлять ответ по кнопке, сохраняя вопрос в родном приложении",
    "spec": "docs/planning/M33-agent-questions.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Перед живыми ходами получено прямое согласие пользователя с бюджетом (до 12 коротких ходов Haiku, серия K — ещё до 4); без согласия — task:block без коммита.",
        "Проба идёт в одноразовом проекте Kit через публичный путь провайдера с Remote Control; пользовательские сессии, их транскрипты и умолчания не тронуты, после пробы проект, доверие и процессы убраны.",
        "Заполнены строки D1, D2 и P1–P7 таблицы результатов с уровнем доказательства; строки, зависящие от Claude Desktop, подтверждены пользователем или помечены «не проверено».",
        "Выбрано допустимое сочетание таблицы раздела 2.2: A1 (доказаны P1–P5 и P7) или A2 (D1 «да» и доказаны K1–K4); серия K запускается при провале любого условия A1. Записаны способ привязки ожидающего хука к вызову, формат answers и значение тайм-аута хука. Нет допустимого сочетания — task:block и решение пользователя.",
        "Скрипт пробы целиком, команды запуска, версии и счётчик ходов записаны в evidence; исполняемых файлов в репозитории не добавлено; из переписки пробы в документы попали только вопросы, заданные самим скриптом."
      ],
      "checks": [],
      "commitMessage": "docs: verify Claude question display and answer channel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M33-claude-question-facts.md",
          "required": true
        },
        {
          "path": "docs/planning/M33-agent-questions-providers.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/design/M33-claude-question-facts.md",
        "docs/evidence/M33-claude-question-probe.md"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Проба Claude: показ вопроса и канал ответа",
      "why": "Ответ на AskUserQuestion хуком документирован, но вживую не испытан; видимость вопроса в приложении при ожидающем хуке не документирована"
    },
    {
      "acceptance": [
        "Перед живыми ходами получено прямое согласие пользователя с бюджетом (до 8 коротких ходов Codex на самой дешёвой модели); без согласия — task:block без коммита.",
        "Проба идёт в тестовом треде одноразового проекта через публичный RPC демона; пользовательские треды не читаются, не возобновляются и не прерываются; auth-файлы не копируются.",
        "Заполнены строки Q1–Q12 таблицы результатов с уровнем доказательства, включая быстрый вопрос до подписки, обрыв и повторную подписку слушателя; строки, зависящие от приложения ChatGPT, подтверждены пользователем или помечены «не проверено».",
        "Выбран момент подписки L1 или L2 (с записанными ограничениями L2) либо только C0; записаны признак, отличающий принятый ответ Kit от опоздавшего и неподтверждённого (или его отсутствие — тогда исход только unknown), обращение с чужими запросами сервера и необходимость experimentalApi. Запрос не доходит до второго подписчика — task:block и решение пользователя о C1.",
        "Скрипт пробы целиком, команды запуска, версии и счётчик ходов записаны в evidence; скрипт не импортирует код Kit и не печатает переписку; исполняемых файлов в репозитории не добавлено."
      ],
      "checks": [],
      "commitMessage": "docs: verify Codex user input request delivery and answer",
      "confirmation": null,
      "context": [
        {
          "path": "docs/design/M33-codex-question-facts.md",
          "required": true
        },
        {
          "path": "docs/planning/M33-agent-questions-providers.md",
          "required": true,
          "heading": "2.4. Codex: показ и ответ (`provider-codex`)"
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "docs/design/M33-codex-question-facts.md",
        "docs/evidence/M33-codex-question-probe.md"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "parallelSafe": true,
      "roundId": "R1",
      "status": "DONE",
      "title": "Проба Codex: доставка вопроса подписчику и ответ",
      "why": "Запрос item/tool/requestUserInput известен только по схеме; поведение демона при нескольких клиентах не испытано"
    },
    {
      "acceptance": [
        "questions.ts даёт типы (включая delivery и исходы accepted и unknown), пределы, нормализацию страницы и checkQuestionAnswer по разделу 2.1; страница без questions сохраняет прежний контракт, существующие тесты ленты проходят без изменения проверок.",
        "Маршрут POST …/questions/:qid/answer принимает attemptId и answers, проверяет форму тела и отдаёт коды и HTTP-статусы таблицы раздела 2.1; провайдер без метода — 404 unsupported.",
        "Правила попытки раздела 2.1 реализованы на сервере: передача провайдеру не больше одного раза на вопрос; тот же attemptId возвращает исход первой попытки без новой передачи; другой attemptId после передачи получает question-sent или question-stale; новая попытка возможна только после отказа без передачи; после question-timeout вопрос остаётся с delivery sent.",
        "Журнал попыток question-attempts.json переживает перезапуск службы: запись sent (ключ вопроса, attemptId, состояние, время — без текста вопроса и ответа) сохраняется на диск до передачи; сбой записи даёт question-failed без передачи. Тест перезапуска: вопрос с записью sent не отвечаем (delivery sent), новая попытка получает question-sent, тот же attemptId — итог или question-timeout, второй передачи нет.",
        "Запись sent защитная: не удаляется ни по сроку, ни по числу записей и переходит в done только при известном итоге вопроса; очистка (старше 7 дней, сверх 500) касается только done; при 500 записях sent новые ответы отклоняются до передачи с question-unavailable и понятной причиной. Тесты: запись sent старше 7 дней и переполнение журнала, затем перезапуск и повторный POST — передачи нет.",
        "Отрицательные тесты прямого POST на подставном провайдере: секретный, сверх пределов, закрытый и уже отправленный вопрос получают отказ без единого вызова передачи; покрыты потерянный HTTP-ответ, задержанное подтверждение и повтор с другого клиента.",
        "Возможность answerQuestion включается явно; текст вопросов и ответов не попадает в журнал службы.",
        "Контракт описан в новом questions.md модуля со ссылкой из module.md; CONTRACTS.md (включая файл журнала попыток в данных на диске) и OS-MATRIX.md обновлены в том же коммите."
      ],
      "checks": [],
      "commitMessage": "feat: add the agent question contract and answer route",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true,
          "heading": "2.1. Общий контракт (`provider-registry`)"
        },
        {
          "path": "docs/design/M33-claude-question-facts.md",
          "required": true,
          "heading": "5. Выбор варианта (заполняет T001)"
        },
        {
          "path": "docs/design/M33-codex-question-facts.md",
          "required": true,
          "heading": "5. Выбор варианта (заполняет T002)"
        }
      ],
      "dependencies": [
        "T001",
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/questions.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/question-attempts.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/question-routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/questions.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/questions.test.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Общий контракт вопроса и маршрут ответа",
      "why": "Провайдеры и панель должны говорить об одном вопросе одним языком"
    },
    {
      "acceptance": [
        "Лента Claude отдаёт закрытые вопросы AskUserQuestion из транскрипта: answered с ответами в формате T001 и cancelled; sidechain и другие инструменты вопросов не дают; сообщения ленты прежние.",
        "При D1 «да» ожидающий вопрос берётся из транскрипта с id вызова, и sendDirect при нём возвращает false, не записывая управляющие файлы; при D1 «нет» T004 отдаёт только закрытые вопросы, а ожидающий вопрос и запрет вставки реализует T005.",
        "Дозапись, разорванная строка, замена файла и пределы страницы покрыты тестами.",
        "Вопрос без канала ответа имеет answerable false и причину; контракт описан в новом questions.md модуля, OS-MATRIX.md обновлена."
      ],
      "checks": [],
      "commitMessage": "feat(claude): show AskUserQuestion in the session feed",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions-providers.md",
          "required": true,
          "heading": "2.2. Claude: показ (`provider-claude`)"
        },
        {
          "path": "docs/design/M33-claude-question-facts.md",
          "required": true
        },
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true,
          "heading": "2.1. Общий контракт (`provider-registry`)"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/questions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/question-guard.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/questions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/questions.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Claude: вопрос в ленте и запрет вставки в открытый диалог",
      "why": "Вопрос AskUserQuestion сейчас отбрасывается лентой, а текст панели может попасть в открытый диалог терминала"
    },
    {
      "acceptance": [
        "Реализован только канал и сочетание с D1, выбранные T001, по разделам 2.2 и 2.3; вариант A3 не реализован.",
        "Ответ уходит только по вызову answerQuestion; непосредственно перед передачей заново проверяются состояние и answerable вопроса, поэтому прямой POST на закрытый, неотвечаемый или уже отправленный вопрос ничего не передаёт хуку или терминалу. Автопилот, очередь, истечение времени и вызовы других инструментов ответа не дают, служба проверяет tool_name.",
        "Ответ панели подтверждается результатом в транскрипте: те же ответы — исход accepted, другие — question-stale, нет результата за 10 с — question-timeout с delivery sent и без повторной передачи; ожидание снимается, когда вопрос закрыт с другой стороны.",
        "При A1 ожидающий хук привязан ровно к одному вызову: waiterId сохраняется при повторных запросах хука, решение получает только привязанное ожидание в состоянии waiting и один раз. Закрытие отдельного HTTP-запроса ожидание не меняет; оно завершается только по подтверждённому итогу в транскрипте, сроку восстановления 2 мин, сроку хука или вытеснению новым waiterId сессии, и завершённое ожидание не оживает. Тесты: два одинаковых вопроса подряд, поздний ответ старого хука, штатная смена девятиминутного запроса и сетевой обрыв с возвратом сохраняют вопрос и привязку, возврат хука после завершения получает release.",
        "Перезапуск службы не даёт второй передачи: при A1 хук, вернувшийся с waiterId вопроса с записью sent, получает release, и вопрос остаётся в родном диалоге; при A2 запись sent сохранена до файла запроса хосту, после перезапуска нового запроса хосту нет, итог берётся из файла результата хоста и транскрипта, хост не выполняет запрос с повторным id. Тесты: перезапуск после передачи решения A1 и после первого нажатия A2 до подтверждения.",
        "При D1 «нет» здесь же реализованы ожидающий вопрос hook:<waiterId> и запрет вставки sendDirect.",
        "При A1: событие хука добавлено только для Claude, STRUCTURE_VERSION выросла, существующий проект получает статус «устарела» и обновляется прежним путём, .codex/hooks.json и хуки Kimi остаются байт в байт прежними, wfk hook question без службы выходит с кодом 0 без вывода. При A2: неизвестный кадр или версия ниже проверенной дают question-unavailable без нажатий, нажатия одной попытки не повторяются.",
        "Тесты идут с подставленными darwin, linux и win32; существующие тесты хуков, direct, interrupt и параметров проходят без ослабления; контракты модулей, CONTRACTS.md и OS-MATRIX.md обновлены."
      ],
      "checks": [],
      "commitMessage": "feat(claude): answer AskUserQuestion from the panel",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions-providers.md",
          "required": true,
          "heading": "2.3. Claude: ответ"
        },
        {
          "path": "docs/design/M33-claude-question-facts.md",
          "required": true
        },
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true,
          "heading": "2.1. Общий контракт (`provider-registry`)"
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-config.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/question-hook.test.ts",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/question-hook.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/question-hook.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/questions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/question-waiters.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/questions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/question-waiters.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/questions.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/questions.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/question-route.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Claude: ответ на вопрос выбранным каналом",
      "why": "Пользователь отвечает на вопрос Claude кнопкой в панели, а не текстом"
    },
    {
      "acceptance": [
        "C0: статус active с флагом waitingOnUserInput без известного содержимого даёт вопрос-заглушку с причиной; после снятия флага заглушки нет.",
        "C1 по выбору T002 (L1): перед ходом, который начинает сам Kit, слушатель подписан до turn/start; для хода из приложения — подписка по флагу waitingOnUserInput, демон повторяет ожидающий запрос. Слушатель получает item/tool/requestUserInput и отдаёт вопрос в ленту; serverRequest/resolved без ответа Kit закрывает вопрос, конец или прерывание хода дают cancelled.",
        "Момент подписки покрыт тестами: быстрый вопрос до подписки, открытие панели посреди хода, обрыв соединения слушателя и снятие подписки через 60 с без опросов дают повторённый вопрос после новой подписки; вопросы оборванного соединения становятся неотвечаемыми до повтора.",
        "Ответ панели уходит результатом того же запроса не больше одного раза и не отправляется после полученного serverRequest/resolved (question-stale). Признака победителя нет (T002, Q5): закрытие после отправки — исход unknown без answers; нет закрытия за 10 с — question-timeout с delivery sent. Тест гонки разных ответов панели и другого клиента не приписывает агенту ответ панели.",
        "Перезапуск службы после отправки ответа до подтверждения: вопрос, повторённый демоном новому подписчику, с записью sent в журнале попыток не отвечаем, второй ответ не отправляется.",
        "Секретная часть делает вопрос неотвечаемым, и прямой POST на него ничего не отправляет демону. Ни одно соединение Kit (слушатель, лента, прямой ход, Stop, параметры, создание и удаление сессий) не отвечает на запросы сервера ни результатом, ни ошибкой, кроме ответа слушателя на вопрос по нажатию в панели; Kit не одобряет и не отклоняет команды и правки. Тест: запрос одобрения и вопрос, пришедшие на короткое соединение во время прямого хода, остаются без ответа.",
        "Слушатель не копит уведомления, держит не больше 8 подписок, снимает их по правилам раздела 2.4 и переживает обрыв соединения без шторма повторов; лента, Stop, прямой ход и параметры не регрессировали.",
        "Тесты идут на подставном демоне с подставленными darwin, linux и win32; контракт описан в новом questions.md модуля, CONTRACTS.md и OS-MATRIX.md обновлены."
      ],
      "checks": [],
      "commitMessage": "feat(codex): show and answer user input requests",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions-providers.md",
          "required": true,
          "heading": "2.4. Codex: показ и ответ (`provider-codex`)"
        },
        {
          "path": "docs/design/M33-codex-question-facts.md",
          "required": true
        },
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true,
          "heading": "2.1. Общий контракт (`provider-registry`)"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/questions.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/question-listener.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/question-parts.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/questions.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/chat.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/questions.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-sessions.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Codex: флаг ожидания, слушатель вопросов и ответ",
      "why": "Вопрос Codex приходит запросом сервера, который Kit сейчас отклоняет, а отказ любого подписчика отменяет вопрос и одобрение для всех клиентов"
    },
    {
      "acceptance": [
        "Карточка по разделу 2.5: один и несколько вариантов, свой вариант, несколько частей, «Отправить» и Ctrl/⌘+Enter; состояния ожидания, неотвечаемого вопроса, отправки, ответа, отмены и ошибки; кнопки «Пропустить» нет.",
        "Попытка: attemptId создаётся при нажатии и повторяется при сетевой ошибке; новая попытка той же кнопкой возможна только после отказа без передачи; после question-timeout, question-sent и при delivery sent кнопки отправки нет; исход unknown и закрытие без answers не подставляют выбор панели.",
        "Выбор переживает опрос; question-stale показывает итог; одно нажатие по варианту ответ не отправляет; поле ввода, очередь, Stop и параметры диалога работают как прежде.",
        "Сенсорные цели не меньше 44 px, управление с клавиатуры, тёмная и светлая темы, узкая раскладка; сверка с эталоном Claude Desktop записана в docs/evidence/M33/design-qa.md, design-qa.md получил ссылку.",
        "Модель покрыта тестами, сценарии карточки — браузерным прогоном в изолированном Chromium; контракт описан в новом questions.md модуля."
      ],
      "checks": [],
      "commitMessage": "feat(panel): add the agent question card to the session chat",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/session-chat",
        "docs/evidence/M33/design-qa.md",
        "design-qa.md",
        "docs/evidence/M33/T007-dark-wide-answered.png",
        "docs/evidence/M33/T007-dark-wide-locked.png",
        "docs/evidence/M33/T007-dark-wide-pending.png",
        "docs/evidence/M33/T007-light-narrow-answered.png",
        "docs/evidence/M33/T007-light-narrow-locked.png",
        "docs/evidence/M33/T007-light-narrow-pending.png",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/questions.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m33-question.browser.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-chat/test/question-model.test.ts"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Панель: карточка вопроса в диалоге",
      "why": "Пользователь выбирает ответ и нажимает «Отправить», как в родном приложении"
    },
    {
      "acceptance": [
        "С согласия пользователя (до 3 коротких ходов Haiku и 2 коротких ходов Codex) на службе из исходников: вопрос Claude и вопрос Codex отвечены из панели и по одному — из родного приложения; итог совпал на обеих сторонах.",
        "Проверены отказ question-stale, вопрос сессии без канала ответа и вопрос-заглушка или секретный вопрос Codex; недоступный сценарий записан с причиной.",
        "docs/evidence/M33-acceptance.md перечисляет живые проверки по ОС и исполнителей: macOS — пользователь и агент, Windows — проверяющий на Windows, Linux — CI; непроверенное помечено."
      ],
      "checks": [],
      "commitMessage": "docs: record live verification of agent questions",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T005",
        "T006",
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M33-acceptance.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Живая проверка вопросов Claude и Codex на macOS",
      "why": "Подставные провайдеры не доказывают сквозной путь через родные приложения"
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
        "T007",
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M33-agent-questions.md",
        "docs/design/M33-claude-question-facts.md",
        "docs/evidence/M33-claude-question-probe.md",
        "docs/design/M33-codex-question-facts.md",
        "docs/evidence/M33-codex-question-probe.md",
        "docs/architecture/CONTRACTS.md",
        "docs/architecture/OS-MATRIX.md",
        "docs/evidence/M33/design-qa.md",
        "design-qa.md",
        "docs/evidence/M33-acceptance.md"
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
        "Версия 0.14.0 и запись CHANGELOG; сборка и локальная установка выполнены, установленная служба отвечает и показывает 0.14.0.",
        "На установленной 0.14.0, с согласия пользователя (до 2 коротких ходов Haiku и 2 коротких ходов Codex): карточка вопроса показана и ответ из панели дошёл до агента у Claude и у Codex.",
        "При A1 существующий проект со старой структурой получил статус «устарела», обновлён прежней кнопкой, и новая сессия Claude в нём отвечает на вопрос из панели.",
        "Результат записан в docs/evidence/M33/local-delivery.md как проверка поставки агентом и отделён от пользовательской приёмки; работающие сессии не перезапущены без согласия пользователя."
      ],
      "checks": [
        "installed-service"
      ],
      "commitMessage": "chore: deliver agent questions in the session chat",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T008",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "CHANGELOG.md",
        "docs/evidence/M33/local-delivery.md",
        "docs/evidence/M33-acceptance.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Поставка 0.14.0, установка и функциональная проверка установленной версии",
      "why": "Пользователь проверяет вопросы в установленной панели"
    },
    {
      "acceptance": [
        "CI ветки ci/M33-agent-questions зелёная на macOS, Linux, Windows x64 и ARM64 для точного SHA задачи T009; ссылка на прогон и SHA записаны в evidence.",
        "Ветка main не публикуется: публикация — после приёмки и закрытия scope по команде пользователя."
      ],
      "checks": [],
      "commitMessage": "docs: record agent questions cross-platform CI",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M33-agent-questions.md",
          "required": true,
          "heading": "4. Проверка"
        }
      ],
      "dependencies": [
        "T009",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "docs/evidence/M33-acceptance.md"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "CI точного SHA поставки на четырёх платформах",
      "why": "Поставка не завершена, пока CI не зелёная на каждой ОС"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: M33-agent-questions (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 7/11
- Revision: 1057

## Objective

Показывать интерактивный вопрос агента Claude (AskUserQuestion) и ChatGPT/Codex (request_user_input) карточкой в диалоге панели и доставлять ответ по кнопке, сохраняя вопрос в родном приложении

## Acceptance

- T001 и T002 доказали канал показа и ответа для Claude и Codex из вариантов спецификации; недоказанный вариант — task:block и решение пользователя, а не молчаливое урезание.
- Вопрос Claude (AskUserQuestion) и вопрос Codex (request_user_input) виден карточкой в диалоге панели; ответ по кнопке доходит до агента, родное приложение показывает тот же итог, а ответ в приложении закрывает карточку.
- Kit не отвечает без нажатия пользователя, не принимает одобрения команд и правок, не пропускает через панель секретные ответы и не пишет текст вопросов и ответов в журналы.
- Лента, ввод, очередь, Stop, параметры, автопилот и провайдеры ChatGPT и Kimi не регрессировали; контракты модулей и матрица трёх ОС согласованы.
- 0.14.0 установлена и проверена, CI точного SHA зелёная на macOS, Linux, Windows x64 и ARM64; пользовательская приёмка отдельно.

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Проба Claude: показ вопроса и канал ответа (work, parallel-safe)
  - Commit: docs: verify Claude question display and answer channel
  - Files: docs/design/M33-claude-question-facts.md, docs/evidence/M33-claude-question-probe.md
- [DONE] T002 — Проба Codex: доставка вопроса подписчику и ответ (work, parallel-safe)
  - Commit: docs: verify Codex user input request delivery and answer
  - Files: docs/design/M33-codex-question-facts.md, docs/evidence/M33-codex-question-probe.md
- [DONE] T003 — Общий контракт вопроса и маршрут ответа (work)
  - Commit: feat: add the agent question contract and answer route
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/questions.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/chat.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/question-attempts.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/question-routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/questions.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/routes.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/questions.test.ts
  - Depends on: T001, T002
- [DONE] T004 — Claude: вопрос в ленте и запрет вставки в открытый диалог (work)
  - Commit: feat(claude): show AskUserQuestion in the session feed
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/architecture/OS-MATRIX.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/chat.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/questions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/direct.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/question-guard.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/questions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/direct.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/questions.test.ts
  - Depends on: T003
- [DONE] T005 — Claude: ответ на вопрос выбранным каналом (work)
  - Commit: feat(claude): answer AskUserQuestion from the panel
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, tools/platform-guard/allowlist.json, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/src/hook-config.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/src/templates.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/question-hook.test.ts, product-parts/backend-core/clusters/projects/modules/kit-structure/test/structure.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/connected-modules.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/question-hook.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/question-hook.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/questions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/programs.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/question-waiters.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/questions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/test/question-waiters.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/questions.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/questions.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/question-route.test.ts
  - Depends on: T004
- [DONE] T006 — Codex: флаг ожидания, слушатель вопросов и ответ (work)
  - Commit: feat(codex): show and answer user input requests
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/questions.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/chat.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/question-listener.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/question-parts.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/questions.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/rpc.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/runtime.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/chat.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/fake-daemon.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/questions.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/shared-sessions.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/test/ws-rpc.test.ts
  - Depends on: T003
- [DONE] T007 — Панель: карточка вопроса в диалоге (work)
  - Commit: feat(panel): add the agent question card to the session chat
  - Files: product-parts/control-panel/clusters/web-panel/modules/session-chat, docs/evidence/M33/design-qa.md, design-qa.md, docs/evidence/M33/T007-dark-wide-answered.png, docs/evidence/M33/T007-dark-wide-locked.png, docs/evidence/M33/T007-dark-wide-pending.png, docs/evidence/M33/T007-light-narrow-answered.png, docs/evidence/M33/T007-light-narrow-locked.png, docs/evidence/M33/T007-light-narrow-pending.png, product-parts/control-panel/clusters/web-panel/modules/session-chat/module.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/questions.md, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-card.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/question-model.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.css, product-parts/control-panel/clusters/web-panel/modules/session-chat/src/session-chat.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/m33-question.browser.js, product-parts/control-panel/clusters/web-panel/modules/session-chat/test/question-model.test.ts
  - Depends on: T003
- [TODO] T008 — Живая проверка вопросов Claude и Codex на macOS (work)
  - Commit: docs: record live verification of agent questions
  - Files: docs/evidence/M33-acceptance.md
  - Depends on: T005, T006, T007
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M33-agent-questions.md, docs/design/M33-claude-question-facts.md, docs/evidence/M33-claude-question-probe.md, docs/design/M33-codex-question-facts.md, docs/evidence/M33-codex-question-probe.md, docs/architecture/CONTRACTS.md, docs/architecture/OS-MATRIX.md, docs/evidence/M33/design-qa.md, design-qa.md, docs/evidence/M33-acceptance.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, T008
- [TODO] T009 — Поставка 0.14.0, установка и функциональная проверка установленной версии (delivery)
  - Commit: chore: deliver agent questions in the session chat
  - Files: package.json, CHANGELOG.md, docs/evidence/M33/local-delivery.md, docs/evidence/M33-acceptance.md
  - Depends on: T008, DOCS-R1
- [TODO] T010 — CI точного SHA поставки на четырёх платформах (delivery)
  - Commit: docs: record agent questions cross-platform CI
  - Files: docs/evidence/M33-acceptance.md
  - Depends on: T009, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
