# cli: подключённые модули

Дополнение к [module.md](module.md): какие модули `createApp` (`src/app.ts`) подключает и с
какими опциями. Раздел вынесен из `module.md` без изменений (M22), когда тот дошёл до предела
размера документа.

## Подключённые модули

- `project-registry` (T002): `registerProjectRoutes` — `GET /api/folders`,
  `GET|POST /api/projects`, `POST /api/projects/open`,
  `DELETE /api/projects/:id` и раздел `projects`; корень новых проектов —
  `config.projectsRoot`, домашняя папка — `homedir` из опций.
- `kit-structure` (T003): `registerStructureRoutes` —
  `GET|POST /api/projects/:id/structure` и раздел `structure` (с общими
  `mutex` и `events`); `recordSessionStart` для `wfk hook`.
- `provider-registry` (T004): `registerProviderRoutes` — маршруты
  провайдеров, `POST /api/refresh` и раздел `providers`; провайдеры
  регистрируются из фабрик (`ProviderContext`: `platform`, `env`,
  `homedir`, `dirs`, `config`, `events`, `supervisor`, `runCommand`, `now`,
  `log`); охранник удаления проекта `projects.addRemoveGuard` — живые сессии
  и `removeBlockers?` провайдеров.
- `data-store` (T004): раздел `operations` (`operations.section()`).
- `project-wizard`, `session-view` (веха 2, T008), `session-chat` (M18): статика мастера, экрана
  сессии и диалога (`projectWizardMount()`, `sessionViewMount()`, `sessionChatMount()`).
- `process-supervisor` (T004): `createProcessSupervisor` над
  `<state>/processes.json`, `runCommand`.
- `agent-channel` (веха 2, T002): `createAgentChannel` (проект хука —
  самый глубокий зарегистрированный проект, содержащий `$CLAUDE_PROJECT_DIR`
  или `cwd`, пути сравниваются и после `realpath`), `registerChannelRoutes`
  — `POST /api/hooks/stop|prompt` и раздел `channel`; `stop()` отпускает
  ожидающие хуки.
- `plan-review` (веха 2, T004): `createReviewToggles` (путь выбран — у
  проекта есть `execution` в разделе `workflow`), `load()` при `start()`,
  `registerReviewRoutes` — `POST /api/projects/:id/sessions/:sid/review` и
  раздел `review`.
- `project-setup` (веха 2, T006): `createProjectSetup` (те же `runCommand`,
  `env`, реестры, `operations`), `registerSetupRoutes` — мастер и раздел
  `setup`; реестр проектов получает `saveRoot` (запись `projectsRoot` в
  `config.json` с сохранением других полей).
- `session-titles` (веха 2, T005): `createSessionTitles` (проект по папке
  — тот же поиск, что у канала, с `realpath` ближайшей существующей
  папки; сессии — из канала; цель плана — из раздела `workflow`;
  переименование — `renameSession` провайдера по префиксу ключа сессии;
  `listed` и `listedRunning` — ключи из `listSessions` всех провайдеров, второе
  только со `state: 'running'`, M9 2.3),
  `load()` при `start()`, `onTurn`, `setServiceTurn` (приветствие панели — `SERVICE_MESSAGE_MARK` из `#project-setup`) и `appTitle` из хука `prompt` (опция `promptTitle` — свойство `promptTitle` провайдера), `onStop` из хука `stop`,
  `registerTitleRoutes` — маршруты имён и раздел `titles`; `isClient` — провайдер есть в реестре.
- `autopilot` (веха 2, T003): `createAutopilot` получает канал-обёртку,
  чей `enqueue` будит простаивающую (`waiting`) сессию через `wakeSession` её
  провайдера (есть метод — будит; сейчас он только у Claude); `owns` — `ownsSession` (M16); опция `orchestration` —
  возможность `orchestration` провайдера сессии (недоступна — скоуп только
  последовательно); решатель `Stop` канала
  (`channel.setDecider`); маршруты хуков получают канал-обёртку, чей
  `prompt` сообщает автопилоту, кто начал ход (`onPrompt`);
  сообщения панели (`POST …/sessions/:sid/message`) идут через ту же
  будящую обёртку (опция `messages` маршрутов канала, раунд R8);
- `POST /api/open-link { url }` (`src/open-link.ts`, M3-autostart раздел 7): служба
  открывает ссылку чата ChatGPT (`codex://threads/<id>`, в режиме общего демона M12 — с `?hostId=remote-ssh-discovered%3A<alias>`, другие параметры не принимаются) или сессии Claude Desktop
  (`claude://claude.ai/code/session_<id>`, раздел 11), `OPENABLE_LINK`, командой `open` —
  только с этого компьютера (loopback, иначе 403), только macOS и Windows (иначе 501
  `not-supported`); другая ссылка — 400 без запуска, неудача всех команд — 502 и строка в
  журнале. Windows (`openCommands`, M5 раздел 7): `claude://` — `rundll32
  url.dll,FileProtocolHandler`; `codex://` — приложение из AppX-пакета `OpenAI.Codex`
  (`codexAppxScript`, PowerShell `shell:AppsFolder\<семейство>!<id>` с адресом целиком, с
  `hostId` M13, одним аргументом в кавычках; без пакета — выход 3), затем `rundll32`. Ссылка проекта Kimi Code (M8, раздел 2.6):
  `kimi-code://open?root=<папка>` с необязательным `new=1` (`parseKimiProjectLink`) — только
  для папки зарегистрированного проекта (`sameFolder`, иначе 400 `bad-link`) и только когда
  приложение найдено (`kimiAppFound`, подмена — `AppOptions.kimiApp`; иначе 501 `no-handler`
  с подсказкой `kimi -S <id>`); служба открывает ссылку, собранную заново из папки проекта:
  macOS — `open`, Linux — `xdg-open`, Windows — `rundll32`. Ссылка без `new=1` добавляет
  пустой чат (M9, раздел 8.1), поэтому первой идёт команда `kimiWorkspaceCommand` для папки
  проекта (подмена — `AppOptions.kimiCommand`): macOS — `open -n -a <Kimi Code.app> --args
  --workspace=<папка>`, Windows — PowerShell `Start-Process` программы обработчика
  `kimi-code`, Linux — команды нет; её неудача — ссылка следом.
- `POST /api/system/shutdown` (там же, M5 раздел 7): только loopback (и Origin, как у любого
  изменения); отвечает `{ stopping: true }` и через 50 мс выполняет `app.shutdownRequested` —
  `wfk serve` останавливается так же, как по SIGTERM (на Windows сигналов нет; так службу
  останавливает установщик). Панель зовёт его для
  новой сессии: окно без щелчка пользователя ссылку приложения может не открыть;
- перекрёстное ревью плана (M4) собрано в `src/review-wiring.ts`:
  `lateReviewDecider()` — решатель ревью для автопилота (подключается после
  создания; передаёт и `choiceBlocked`), `wireCrossReview({ router, state, channel, messages, projects,
  providers, workflow, toggles, titles, resolveFolderProject, isClient, log })` — `createCrossReview` (с вопросом о плане:
  `question`, `asking`, `decided`, `askProposal` из `toggles`; `providerTitle` — название
  провайдера из реестра, `reviewerBlocked` — причина недоступной возможности `reviewer`,
  `briefByQueue(provider)` — по `reviewBrief` провайдера (M12), без него — есть ли `wakeSession`; маршрут
  `registerPlanQuestionRoute` с проектом по папке (`resolveFolderProject`, как у канала) и
  сессией запроса (`sessionKey`: названная — `namedSession`, иначе `titles.running`; его
  `TitleError` уходит как `HttpError` с кандидатами); ответ — `ANSWER_MESSAGES` агенту через
  будящий канал и `wake`)
  (ревьюер — `createSession` провайдера с первым сообщением и `detached`, поиск по
  `listSessions`: `remoteId` или `localId`; сообщения — через будящий канал с
  источником `review`; задание ревьюеру — `deliverToSession` (M4 13.9): очередь канала и
  сразу `wakeSession` провайдера сессии (по префиксу ключа; нет метода — только очередь), не дожидаясь первого `Stop` новой сессии; открытое предложение — `workflow.proposal` без
  `execution`), слушатель `channel.onStop`, маршруты ревью; `toggleLock` —
  блокировка переключателя (ревью идёт или открытый план уже прошёл ревью);
  переключатель (`locked`, `onChange`) вызывает `crossReview.toggled`;
- жизненный цикл сессий провайдеров собран в `src/provider-lifecycle.ts`
  (`wireProviderLifecycle`): проверки удаления, хуки удаления и архива, подъём при
  запуске; архив проекта или сессии (`addArchivedHook`, опция `archived` заголовков)
  ждёт остановки сессий через `providers.setArchived`, возврат поднимает их в фоне
  (раунд R10); перед удалением папки проекта (`addBeforeDeleteHook`) —
  `providers.deleteSessions` (треды ChatGPT, M3-autostart R5), неудача — в журнал;
  `providers.retryDeletes()` при запуске и раз в `DELETE_RETRY_MS` (60 с) — треды,
  не отданные приложением сразу (R6); `providers.maintain()` раз в `MAINTAIN_MS`
  (60 с, опция `maintainMs`, `0` — выключено; одновременно идёт одно) — обслуживание
  провайдеров, строки — в журнал (Codex: удалённое управление — приложению ChatGPT, M7);
  `lifecycle.stop()` (из `app.stop()`) снимает оба интервала и повторы автозапуска;
  при запуске `providers.autostart()` (демон Codex) — до
  `AUTOSTART_ATTEMPTS` (3) попыток с паузой `AUTOSTART_PAUSE_MS` (30 с), каждая
  неудача — в журнал; при остановке службы демон и процессы Claude не трогаются
  (скоуп M3-autostart);
- удалённый проект забирает с собой записи (раунд R9): `addRemovedHook` реестра
  проектов вызывает `providers.forgetProjects` с оставшимися проектами; при
  запуске то же для всего списка (архивные проекты остаются в списке);
- при запуске служба поднимает прерванные сессии проектов не из архива
  (`providers.resumeInterrupted`; Claude — в тот же канал Remote Control);
  маршрут сообщений панели получает `owns`: сессия, которую канал ещё не
  видел, принимает сообщение, если провайдер числит её за проектом, а
  будящая обёртка через `wakeSession` поднимает прерванную сессию Claude
  (раунд R9);
  `registerAutopilotRoutes` — `POST /api/projects/:id/workflow/…` и раздел
  `autopilot`.
- `kit-bundle` и `kit-runner` (веха 2, T001): `kitBundleProvider` над
  `dirs.appDir` (распаковка бандла Kit 2.2.4 при первой команде),
  `createKitRunner` (тот же `runCommand` и `env`), `createWorkflowState` над
  `projects.list()` и раздел `workflow` (`workflow.section()`; опрос панели
  команд Kit не запускает).
- `kit-update` (M22, T003): `registerKitUpdateRoutes` (те же `kit`, `providers` и `projects`;
  журнал — `log`) — `POST /api/projects/:id/kit/update` и раздел `kitUpdate` (версия Kit
  проекта, `action: update` для устаревшего); `onChange` состояния `workflow` обновляет и его
  кэш, а после обновления Kit (`onUpdated`) служба перечитывает `workflow.refresh(id)`
  проекта; `app.stop()` снимает его интервал.
