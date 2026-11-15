# provider-registry: вопросы агента (M33, M34)

Спецификация — [M33](../../../../../../docs/planning/M33-agent-questions.md), раздел 2.1;
вопрос с ответом сообщением — [M34](../../../../../../docs/planning/M34-codex-async-answer.md),
раздел 2.1. Код —
`src/questions.ts` (типы, пределы, нормализация, проверка ответа), `src/question-attempts.ts`
(журнал попыток), `src/question-routes.ts` (маршрут ответа и взгляд журнала на вопросы ленты).
Ссылка — из [module.md](module.md).

## Типы (`src/questions.ts`)

- `ChatQuestionOption { label, description }`; `ChatQuestionPart { id, header, question,
  options, multiSelect, allowOther }` — пустые `options` дают `allowOther: true`.
- `ChatQuestion { id, at, afterMessageId, state, parts, answerable, reason?, delivery?,
  answers?, reply? }`: `state` — `pending | answered | cancelled`; `delivery: 'sent'` — ответ передан,
  итог не подтверждён; `answers` — только доказанный итог у `answered`; `reply: 'message'` —
  ответ доходит до агента сообщением пользователя (асинхронный вопрос Codex, M33 раздел 2.7),
  но панель отвечает тем же маршрутом ответа с попыткой (M34): у такого вопроса бывают
  `delivery` и `answers` (разобранные из ответного сообщения ленты, кто бы его ни прислал);
  карточка стоит после своего сообщения и не меняет строку состояния.
- `ChatQuestionAnswer` — `{ [partId]: { selected: string[]; other?: string } }`;
  `QuestionAttempt { id, answers }`; `QuestionOutcome` — `accepted | unknown`.
- `ChatPage.questions?` — от старых к новым; нет поля — провайдер вопросов не отдаёт.
- Пределы: `QUESTIONS_PAGE_MAX` 20, частей 4, вариантов 8, заголовок 60, подпись 200,
  описание 1000, вопрос 2000, свой текст 2000 знаков.
- `questionOut` / `questionsOut` (вызывает `chatPageOut`): только поля контракта; превышение
  предела обрезает текст (`…`) и делает вопрос `answerable: false` с
  `QUESTION_TOO_LARGE_REASON`; `answerable` — только у `pending` без `delivery` и с частями;
  у неотвечаемого ожидающего вопроса всегда есть `reason`; `reply` — только значение
  `'message'`; `delivery` и `answers` сохраняются и у него (M34).
- `checkQuestionAnswer(question, answer)` — провайдер вызывает её на свежем чтении прямо перед
  передачей, для любого вопроса, в том числе с `reply: 'message'` (M34): не `pending` —
  `question-stale`; `delivery` — `question-sent`; не `answerable` —
  `question-unavailable` с причиной; иначе ответ на каждую часть, подписи только из `options`
  без повторов, свой текст только при `allowOther` (очищен `cleanAnswerText`, не пуст), без
  `multiSelect` — ровно один выбор, с ним — хотя бы один; нарушение — `question-invalid`.

## Контракт провайдера

Методы вопросов собраны в `ProviderQuestions` (`src/questions.ts`), `Provider` его расширяет.

`answerQuestion?(project, sid, questionId, attempt, commit) → 'accepted' | 'unknown'`. Провайдер
читает вопрос заново, вызывает `checkQuestionAnswer`, затем `commit()` (запись журнала; отказ —
ничего не передавать) и передаёт ответ наружу один раз; ждёт итога. Отказы — `ProviderError`
с кодами `question-*`. Возможность `answerQuestion` — явное включение (по умолчанию
недоступна, как `interruptTurn`).

`questionHook?(project, request, signal) → QuestionHookReply` (M33, раздел 2.3) — один запрос
`wfk hook question`: `QuestionHookRequest { client, sessionId, transcriptPath, cwd, projectDir,
waiterId, toolName, toolInput }`; ответ `{ wait: true }` (спросить снова), `{ release: true }`
(выйти без вывода, родной диалог работает дальше) или `{ decision }` (хук печатает решение).
`signal` кончается с HTTP-запросом. Маршрут — `agent-channel`, связка — `cli`.

## Маршрут

`POST /api/projects/:id/providers/:p/sessions/:sid/questions/:qid/answer`, тело
`{ attemptId: UUID, answers }` → `{ answered: true, outcome }`.

| Код | HTTP | Когда |
| --- | --- | --- |
| `question-invalid` | 400 | форма тела, id вопроса или ответ не подходит |
| `question-stale` | 409 | вопрос закрыт; другой `attemptId` после известного итога |
| `question-sent` | 409 | другой `attemptId`, пока ответ передан без итога |
| `question-unavailable` | 409 | вопрос неотвечаемый (причина); в журнале 500 записей `sent` |
| `question-failed` | 502 | провайдер не принял до передачи; журнал не читается или не записан |
| `question-timeout` | 504 | передано, итога нет; тот же `attemptId` после перезапуска без итога |
| `unsupported` | 404 | у провайдера нет `answerQuestion` |

Правила попытки: проверка журнала и регистрация попытки — один синхронный шаг; передача
наружу — не больше одного раза на вопрос. Тот же `attemptId` ждёт идущую попытку или получает
её итог; новая попытка — только после отказа без передачи. После `question-timeout` вопрос
ленты — `pending` с `delivery: 'sent'`. Событие `provider.question.answered` — только id и
исход.

## Журнал попыток (`src/question-attempts.ts`)

`createQuestionAttempts({ file, platform?, now? })`, файл `questionAttemptsFile(dirs)` —
`<state>/question-attempts.json` (`{ version: 1, records }`, атомарная запись). Запись —
`questionKey` (sha256 провайдера, проекта, сессии и id вопроса), `attemptId`, `sent | done`,
исход, время; текста вопроса и ответа нет. `begin` пишет `sent` на диск до передачи (сбой —
откат и отказ); `finish` переводит в `done`. `sent` не удаляется ни по сроку, ни по числу;
очистка — только `done` старше 7 дней и сверх 500. Битый файл — ответы отклоняются
(`question-failed`), ожидающие вопросы ленты неотвечаемы. `readQuestionAttempts(file)` —
чтение для провайдеров (повторный хук после перезапуска, T005).

Лента (`GET …/messages`): ожидающий вопрос с записью `sent` — `answerable: false`,
`delivery: 'sent'`, причина «Ответ отправлен, ждём подтверждения» (попытка идёт) или
`QUESTION_SENT_BEFORE_RESTART_REASON` (после перезапуска); закрытый вопрос с записью `sent`
переводит её в `done` (`closed`).

## Поведение на ОС

| Что | macOS | Linux | Windows |
| --- | --- | --- | --- |
| Контракт, проверка, маршрут | общий Node-код | так же | так же, x64 и ARM64 |
| Журнал | `stateDir` (`~/Library/Application Support/Workflow Kit`) | `$XDG_STATE_HOME/workflow-kit` | `%LOCALAPPDATA%\Workflow Kit`; путь через `path.win32` |

Веток по ОС нет: путь журнала строится injected-платформой, запись — `writeJsonAtomic`.

## Тесты

`test/questions.test.ts`: нормализация и пределы; `checkQuestionAnswer`; маршрут на подставном
провайдере — принятый ответ без текстов в журнале, потерянный HTTP-ответ, повтор с другого
клиента, прямой POST на секретный, большой, закрытый и отправленный вопрос без передачи,
задержанное подтверждение, тайм-аут и перезапуск, сбой записи журнала, запись `sent` старше
7 дней и полный журнал после перезапуска, очистка только `done`.
