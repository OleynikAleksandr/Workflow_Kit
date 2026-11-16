# Workflow Kit — интеграция с Harness при установке

Часть [установки, Доктора и платформ](WorkflowKitInstallation.md): разделы 5 и 7
перенесены сюда дословно ради лимита размера документа; нумерация сохранена.

## 5. Интеграция с Harness

### 5.1 Сборка и поставка

- `scripts/build-workflow-kit.mjs` (Vite, второй конфиг в режиме
  SSR-библиотеки) собирает `dist/workflow-kit/workflow.mjs` из точки входа
  `workflow-kit/src/workflow-kit-cli.ts`. Шаг включён в `npm run build` и в
  `scripts/dev-electron.mjs`.
- electron-builder кладёт бандл обычным файлом:
  `extraResources: dist/workflow-kit → Resources/workflow-kit`.
- Electron host передаёт процессу Core переменные окружения:
  - `HARNESS_WORKFLOW_KIT_BUNDLE` — путь к бандлу; в dev — `dist/workflow-kit`
    репозитория;
  - `HARNESS_ELECTRON_NODE` — `process.execPath`, используется с
    `ELECTRON_RUN_AS_NODE=1`.

### 5.2 `workflow-host` (Core)

Асинхронно запускает бандл дочерним процессом (`execFile` без shell, таймаут,
JSON на stdout). Для `install` и `inspect` берётся бандл приложения, для
остальных команд — бандл, установленный в проект. Если установленного нет,
используется бандл приложения. Открывая проект, Core записывает
`.harness/workflow/local/runtime`: путь к Electron и режим `electron`. Так
запускатели в проекте работают даже без системного Node.

`setIdentity({name, email})` запускает бандл приложения в домашнем
каталоге без проекта: `identity:set --name=<имя> --email=<почта> --global`
(форма `--флаг=значение` сохраняет значение, начинающееся с `--`).

Процессы Kit и провайдеров получают PATH login-оболочки пользователя: Core
читает его один раз при старте (`core-login-path.ts`,
[ReleaseFixes-2026-11-04-2.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ReleaseFixes-2026-11-04-2.md), раздел 6).

Процессы агентов Claude и Kimi (`HOME` — папка провайдера) получают
`GIT_CONFIG_GLOBAL=<настоящий home>/.gitconfig` от `withRealGitConfig`
(`provider-home-manager`), если переменная не задана и файл есть: Kit внутри
агента видит идентичность пользователя
([ReleaseFixes-2026-11-04-3.md](https://github.com/OleynikAleksandr/Harness_AI/blob/94a9d457/docs/architecture/ReleaseFixes-2026-11-04-3.md), раздел 5).

Ответ всегда имеет форму конверта Kit. Сбои самого хоста приходят в той же
форме с кодами `HOST_NO_BUNDLE`, `HOST_SPAWN`, `HOST_TIMEOUT` и
`HOST_OUTPUT`, поэтому Core обрабатывает один формат.

### 5.3 Core RPC (`core-project-workflow-rpc.ts`)

| Метод | Назначение |
|---|---|
| `workflow-inspect` `{path}` | классификация папки |
| `workflow-prepare-project` `{path, name?, mode: "new"\|"open", install?}` | установка (всегда с `--host harness`) и добавление workspace |
| `workflow-identity-set` `{name, email}` | глобальная Git-идентичность через `identity:set --global`; конверт Kit без изменений |
| `workflow-status` `{workspaceId?}` | статус Kit workspace и модель плана `planView`; без проекта — `NO_WORKSPACE` |
| `workflow-doctor` `{workspaceId?, fix?}` | Доктор |
| `workflow-autopilot-get` `{sessionId}` | состояние автопилота, `pauseState` и последняя причина остановки |
| `workflow-autopilot-set` `{sessionId, enabled}` | внутренний вызов Core, без моста и preload |
| `workflow-pause-set` `{sessionId, paused}` | пауза или продолжение плана: Kit `pause:set`, затем оценка автопилота |
| `workflow-mode-choice-get` `{workspaceId}` | карточка выбора режима workspace или `null` |
| `workflow-mode-choose` `{workspaceId, sessionId, generation, option}` | выбор пользователя на карточке |

Для `mode: "new"` поле `path` — родительская папка, а `name` — имя новой
папки проекта. Целевая папка должна отсутствовать или быть пустой. Для
`mode: "open"` поле `path` — сама папка, `name` не передаётся: проект
называется по папке. Что делает Core, зависит от
`action` результата `inspect`:
- `create`, `install`, `install-migrate` — установка;
- `update` — обновление;
- `open`, `doctor` — ничего не устанавливается;
- `unsupported` — отказ.

`install: false` с `mode: "open"` («Открыть без Kit») регистрирует любую
существующую папку, ничего не устанавливая. Так сохраняется прежнее
поведение «Add Workspace».

Отказ `GIT_IDENTITY_REQUIRED` ничего не записывает. После успешного
`workflow-identity-set` клиент повторяет тот же запрос; Core прерванную
подготовку не хранит.

Затем папка регистрируется как workspace. Методы `workflow-*` обрабатывает
`CoreProjectWorkflowRpc` (`core-project-workflow-rpc.ts`).

Событие `workflow:status` (`{workspaceId, path, planView, status}`)
публикуется после каждой операции Kit и при изменении плана или
`.harness/workflow/local` проекта (наблюдатель Core, без открытого UI).
Событие `workflow:autopilot` публикуется при каждом решении автопилота,
`workflow:mode-choice` — при каждом изменении карточки режима
(`WorkflowKitExecutionModes.md`, разделы 4.2 и 10).

### 5.4 Доставка контекста восстановления в сессии

- Контракт адаптера расширяется полем
  `ProviderSessionStartOptions.workspaceContext?: string`. Core вычисляет
  пакет в `bindProviderSession` и передаёт его в `createSession` и
  `resumeSession`. Для новой сессии провайдера используется событие
  `startup`, для возобновления — `resume`. Таймаут — 20 секунд. Пакет
  получают только основные сессии. Субагенты и сессии Profile Creator его не
  получают. Если Kit не установлен или вернул ошибку, сессия стартует без
  контекста.
- Как адаптеры используют поле:
  - **Claude** — добавляет его к системному промпту (native: `append` к
    пресету `claude_code`; managed и legacy: в конец строки);
  - **Codex** — `developerInstructions` в `thread/start` и `thread/resume`;
  - **клиенты OpenRouter, GLM, Local Models, Kimi-client** — системное
    сообщение в начале истории.
- **Kimi native и Grok** в этом выпуске поле не используют. Агент получает
  правила из `AGENTS.md` и вызывает `scripts/workflow recover`.
- Процессам провайдеров Harness передаёт `HARNESS_WORKFLOW_RECOVERY=host`.
  Если проектные хуки (`.claude/settings.json` в native-профиле,
  `.codex/hooks.json`) всё же сработают, они вернут пустой контекст и не
  будут его дублировать.
- Ход автопилота несёт свежий пакет в тексте сообщения. Поэтому длинная
  сессия, у которой системный контекст фиксируется при старте, всегда видит
  актуальное состояние.

### 5.5 Автопилот в Core

Исполнитель автопилота — `session-request-handler`
(`session-workflow-autopilot.ts`). Он работает рядом с обработчиком
`turn_completed` в `session-provider-event-router.ts`. После завершения хода:

1. Пропускает ход, если:
   - сессия — субагент или Profile Creator;
   - ход был остановлен пользователем;
   - ход закончился ошибкой;
   - ожидается ответ на запрос провайдера.
2. Получает статус через `workflow-host`.
3. Вызывает `WorkflowAutopilotFacade.decide`.
4. При `continue` отправляет ход через `SessionRequestHandlerFacade.sendMessage`.

Состояние автопилота хранится в памяти Core для каждой сессии. По умолчанию
автопилот включён для каждой подходящей сессии; пауза Kit останавливает его
перед следующей задачей (`paused`), текущая задача доводится до конца.
Решения для scope `orchestrated` и причины
`waiting-for-mode-choice`/`waiting-for-executors` описаны в
`WorkflowKitRecovery.md`, раздел 6.

Как работает исполнитель:
- Статус проекта берётся командой Kit `autopilot:status`.
- Когда ход начинается, исполнитель запоминает исходную точку: ревизию плана
  и HEAD. По ней решение определяет `no-progress`.
- `user-message` означает, что пользователь написал во время уже идущего
  хода. Ход, который начал сам пользователь, автопилот продолжает обычным
  образом.
- Включение автопилота (внутренний вызов) или снятие паузы
  (`refreshPause`) в простаивающей сессии сразу оценивает проект и
  запускает следующую задачу. Исключение — выбор `sequential`/`orchestrated`
  на карточке режима: Core включает автопилот с `evaluate: false` до
  сообщения выбора, и решение принимает конец этого хода.
- Ход автопилота проходит тем же путём, что сообщение пользователя.
- Stop, `turn_failed` и `stream_error` завершают цепочку с причиной
  `turn-error`.

### 5.6 Интерфейс

- Новый кластер Application Shell `project-workflow-ui`:
  - `project-setup-dialog` — «Новый проект»: родительская папка и имя;
    «Открыть проект»: папка (без поля имени), результат `inspect` и кнопка
    установки. При `GIT_IDENTITY_REQUIRED` — форма Git-идентичности: имя,
    почта и «Сохранить и продолжить» (`workflow-identity-set`, затем тот
    же запрос подготовки);
  - `project-doctor-panel` — проверки Доктора и «Исправить»; для
    неисправимой `git-identity` — та же форма, затем `doctor --fix`;
  - `workflow-status-strip` — scope, задача, прогресс и причина остановки
    автопилота (только отображение, переключателя нет);
  - `execution-mode-card` — карточка выбора режима в левом сайдбаре под
    карточкой сессии-владельца, на месте плана;
  - `project-plan-panel` — активный план в боковой панели под карточкой
    сессии-владельца (`WorkflowKitExecutionModes.md`, раздел 10.2) и
    кнопка паузы по `pauseState` Core: «Pause», «Pausing after the current
    task» (неактивна), «Continue» (`workflow-pause-set`).
- В меню workspace в боковой панели — «Новый проект», «Открыть проект»,
  «Доктор проекта». Прежний пункт «Add Workspace» становится «Открыть
  проект». Обычную папку без Kit открывает кнопка «Open Without Kit».
- Строка статуса стоит над поверхностью сессии в окне сессий и в отдельном
  окне. Она показывается только для workspace с установленным Kit.
- Electron host получает IPC `pick-project-folder` (только выбор папки и
  возврат пути) и `pick-project-parent`.
- Все строки интерфейса проходят через `source-dictionaries`. Нативные
  `alert`, `confirm` и `prompt` не используются.

## 7. Перевод репозитория Harness AI на Kit

1. Профиль качества Harness (`WorkflowKitQuality.md`, раздел 9) и политика
   контрактов: `module.md` меняется вместе с `src/**` модуля.
2. `install` в самом репозитории (секции в `.husky/*`) и
   `migrate:harness-plan` для активного плана.
3. Переписать `AGENTS.md` (процесс — из секции Kit), обновить
   `CLAUDE.md`, индекс и шаблон плана; удалить `scripts/plan.mjs`,
   `scripts/check-docs-sync.mjs`, их тесты и npm-скрипты `plan:*`.
4. Оставшиеся задачи scope (DOCS, сборка, приёмка) выполняются уже
   командами нового Kit.
