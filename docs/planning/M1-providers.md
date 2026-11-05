# Веха 1 — провайдеры Claude и Codex

Часть спецификации [M1-orchestrator-core.md](M1-orchestrator-core.md).
Факты проверены 2026-11-05 на Mac и iPad пользователя (Claude CLI 2.1.318,
codex-cli 0.166.0, ChatGPT для Mac 26.1029). Помечено **[не проверено]**
то, что известно только из документации или типов.

## 1. Контракт провайдера

```ts
interface Provider {
  id: string                                       // registry key, open for new providers
  title: string
  capabilities(): Promise<Capabilities>            // depends on OS, CLI version, login, expect
  status(): Promise<ProviderStatus>                // read-only, cached: installed, versions, daemon
  previewTrust(project: Project): Promise<TrustPreview> // keys to write, autorun points, token
  grantTrust(project: Project, token: string, choices?: TrustChoices): Promise<TrustState>
  hooks(project: Project): Promise<HookState>      // kit hook and foreign hooks with command + hash
  approveHooks?(project: Project, expected: { command: string; hash: string }): Promise<HookState>
  listSessions(project: Project): Promise<SessionInfo[]>
  createSession(project: Project, opts: { title: string }): Promise<SessionInfo>
  resumeSession?(project: Project, sessionId: string): Promise<SessionInfo>
  stopSession?(project: Project, sessionId: string): Promise<void>
  actions(project: Project | null): Promise<ProviderAction[]>
  runAction(id: string, project: Project | null): Promise<ProviderStatus | ProjectProviderState>
}
```

- `SessionInfo`: `provider`, `localId`, `remoteId?`, `title`, `createdAt`,
  `origin` (`panel` | `hook`), `state` (`running` | `stopped` | `unknown`),
  `links` `{ desktop?, mobile?, web? }`, `note?` (например, «без Remote
  Control — ссылки нет»).
- `ProviderAction`: `id`, `title`, `scope` (`provider` | `project`),
  `enabled`, `reason?`, `confirm?`. Панель рисует их из контракта.
- `TrustPreview`: записываемые ключи и файлы; найденные в папке точки
  автозапуска (`.claude/settings*.json` с хуками и разрешениями, `.mcp.json`,
  чужие хуки `.codex/hooks.json`); выборы пользователя `choices` (`id`,
  `title`, `description`, `options`, `required`; ответа по умолчанию нет);
  `inherited` `{ from, note }`, если доверена только родительская папка;
  токен предпросмотра. `grantTrust` получает ответы `{ <id выбора>: <id
  ответа> }` (маршрут `POST …/trust { token, choices }`); панель не
  отправляет «Доверять» без обязательного ответа.
- Ошибка — `{ code, message, hint }`; `hint` говорит, что сделать.
- Итоговый список сессий строит сам провайдер: общий помощник
  `readHookSessions(project, client)` из модуля `provider-registry` + свои записи панели.
  Сервер и панель ничего не фильтруют и не знают о провайдере.
- Ссылка выбирается панелью: `mobile`, если `navigator.maxTouchPoints > 1`
  (iPad Safari выдаёт себя за Mac), иначе `desktop`; `web` — запасная.

## 2. Claude

Проверенные факты:

- `claude --remote-control "<имя>"` в папке проекта — интерактивная сессия
  Remote Control; нужен pty с размером (`expect`, `stty rows 40 columns 160`),
  иначе нет вывода и диалога доверия. В выводе есть
  `claude.ai/code/session_<id>`; процесс должен жить, пока нужна сессия.
- `--debug-file <файл>` пишет `Created session cse_…` и `server title …`;
  `cse_X` и `session_X` — один id.
- Возобновление под тем же id: в транскрипте сессии есть запись
  `"type":"bridge-session"` с `bridgeSessionId: cse_<X>`;
  `claude --resume <localId> --remote-control "<имя>"` поднимает тот же
  `session_<X>`. Транскрипт: `~/.claude/projects/<путь, где не-буквы
  заменены на '-'>/<localId>.jsonl`.
- `claude remote-control --name <имя> --spawn=same-dir` — окружение папки:
  к нему подключаются с iPad и веба, чтобы начать сессию там.
- Доверие: `~/.claude.json` → `projects["<путь>"].hasTrustDialogAccepted`;
  без доверия самой папки Remote Control отвечает «Workspace not trusted».
- Проверено 2026-11-05 (Claude Code 2.1.318): доверие `~`
  (`projects["<home>"].hasTrustDialogAccepted = true`) подавляет диалог
  доверия для вложенных папок — интерактивный `claude` в
  `~/WorkflowKitProjects/!_001` стартовал без диалога, а ключ самой папки
  остался `false`. Интерактивный Claude наследует доверие родителя, Remote
  Control требует доверия самой папки. Текст настоящего диалога доверия на
  этой машине поэтому не получен **[не проверено]**.
- Проверено 2026-11-05: если CLAUDE.md папки или родительской папки (или
  `.claude/rules`) импортирует файлы вне папки (`~/CLAUDE.md` со строкой
  `@AGENTS.md` → `~/AGENTS.md`), первый запуск показывает диалог «Allow
  external CLAUDE.md file imports? This project's CLAUDE.md or
  .claude/rules imports files outside the current working directory. Never
  allow this for third-party repositories. External imports: … ❯ No,
  disable external imports / Yes, allow external imports · Enter to
  confirm · Esc to cancel». Ответ записывается в запись папки:
  `hasClaudeMdExternalIncludesApproved` (true / false) и
  `hasClaudeMdExternalIncludesWarningShown: true`. На экране pty пробелы
  выводятся сдвигами курсора (`ESC[nC`), фразы надо искать с допуском.
- Пользовательские `~/.claude/CLAUDE.md` и `~/.claude/rules` не считаются
  памятью проекта **[не проверено]**.
- Хук `SessionStart` (`.claude/settings.json`) получает `session_id`
  (локальный), `transcript_path`, `cwd`, `source`, `model`; stdout хука
  попадает в контекст сессии.
- Дочерним процессам убирать переменные `CLAUDE*` (иначе «Transcript saving
  is off»). Процессы запускать отдельной группой с выводом в файл: иначе они
  умирают вместе с родителем.
- Ссылки: Mac `claude://claude.ai/code/session_<id>` (Claude Desktop);
  iPad и веб `https://claude.ai/code/session_<id>` (открывает приложение).
  `claude://…?environment=…` Desktop не понимает.
- В Desktop сессии видны внутри проекта; на iPad и в вебе — общим списком.

Требования вехи 1:

- Доверие для Remote Control — только точный ключ папки; доверенная
  родительская папка — отдельная пометка в панели («интерактивный Claude
  не спросит, Remote Control требует доверия папки»).
- `previewTrust` перечисляет точки автозапуска папки (их запустит первая
  сессия) и внешние импорты CLAUDE.md, которые Claude загрузит для папки
  (CLAUDE.md, CLAUDE.local.md, `.claude/CLAUDE.md`, `.claude/rules` папки и
  родительских папок); если они есть и не решены — обязательный выбор
  «разрешить / запретить внешние импорты».
- `grantTrust` не проходит диалогов и не запускает `claude`: после
  предпросмотра и токена он сам атомарно записывает в `~/.claude.json`
  `projects[<папка>].hasTrustDialogAccepted = true` и (по выбору)
  `hasClaudeMdExternalIncludesApproved`,
  `hasClaudeMdExternalIncludesWarningShown = true`: копия до записи,
  временный файл с теми же правами и `rename`, JSON с отступом 2, проверка
  чтением; запись, потерянную из-за параллельной записи Claude, повторяет
  до 3 раз. `trust.exp` удалён.
- `session.exp` и `environment.exp` никогда не нажимают клавиш в диалогах:
  диалоги доверия и внешних импортов узнаются по тексту, любой другой — по
  подвалу «Enter to confirm / Esc to cancel»; процесс останавливается,
  операция завершается ошибкой (`trust-dialog`, `imports-dialog`,
  `unknown-dialog`) с текстом диалога и подсказкой «решите это в
  предпросмотре доверия».
- Создание: `session.exp` печатает `SESSION_URL session_<id>` (основной
  источник) и pid дочернего `claude`; debug-файл — запасной источник. Имя
  `<проект> · <время>`. Запись в `sessions/claude.json` (D9).
- Сессия из хука: `localId` из журнала; `remoteId` — отложенно, по записи
  `bridge-session` в файле `transcript_path` (каталог транскриптов самим не
  вычислять). Без `bridge-session` сессия показывается без ссылки.
- Сессии с меткой `WFK_SERVICE_SESSION` в список не попадают.
- Окружение папки — особое действие проекта (запуск, остановка) по правилам
  D5 и D9, с записью и состоянием в панели; после перезагрузки —
  «остановлено».
- Нет `expect` (Linux) или Windows — возможности недоступны с причиной.

## 3. Codex

Проверенные факты:

- `codex remote-control start --json` поднимает один фоновый app-server на
  весь Mac: `{"mode":"daemon","status":"connected",…}`. Пид —
  `~/.codex/app-server-daemon/daemon.pid`. При истёкшем токене —
  `connection is errored`, в `daemon.stderr.log` — `401 … token expired`;
  лечится `codex login` (делает пользователь).
- Демон слушает WebSocket на unix-сокете
  `~/.codex/app-server-control/app-server-control.sock`; протокол JSON-RPC:
  `initialize` → уведомление `initialized` → вызовы.
- Новая сессия: `thread/start {cwd}` → `thread/name/set {threadId, name}` →
  `turn/start {threadId, input:[{type:"text",text}]}`. Пустую сессию ChatGPT
  не открывает, поэтому нужен короткий служебный ход.
- Отдельный `codex app-server` по stdio годится для `hooks/list` и
  `config/value/write`; его треды ChatGPT не видит.
- Хуки проекта `.codex/hooks.json` читаются, только если папке доверяют явно:
  `[projects."<путь>"] trust_level = "trusted"` (доверие к `/` или домашней
  папке не помогает). Каждый хук одобряется по хешу:
  `[hooks.state."<abs>/.codex/hooks.json:session_start:<i>:<j>"]
  trusted_hash = "sha256:…"` (ключ позиционный); `hooks/list {cwds}` даёт
  `trustStatus` и `currentHash`; запись — `config/value/write {keyPath,
  value, mergeStrategy:"upsert"}`. Изменился хук — одобрение слетает.
- Хук SessionStart срабатывает с первым ходом, не на `thread/start`; вход:
  `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`,
  `permission_mode`, `source`. Названия сессий —
  `~/.codex/session_index.jsonl` (`id`, `thread_name`).
- С iPad сессии идут в выбранной папке в `bypassPermissions`; удалённый
  ChatGPT показывает проекты. Ссылка `codex://threads/<id>` открывает сессию
  в ChatGPT на Mac и iPad.
- **[не проверено]** `project/list`, `thread/list`, `thread/resume`,
  `https://chatgpt.com/codex/deeplink?url=…`.

Требования вехи 1:

- Статус только читает: pid-файл и `initialize` по сокету, с кэшем; запуск
  демона — особое действие по кнопке.
- `previewTrust` показывает ключ `trust_level` и чужие хуки; запись — через
  `codex app-server` с копией `~/.codex/config.toml` до и проверкой после.
- `approveHooks` одобряет только хук Kit: команда точно совпадает с
  шаблоном раздела 7 основной спецификации, хеш — с текущим. Чужие хуки
  показываются с командой и хешем, но не одобряются.
- Создание: `thread/start`, `thread/name/set`, служебный `turn/start` с
  безопасными параметрами sandbox и approval **[не проверено, проверить в
  задаче]**; запись в `sessions/codex.json`.
- Список: журнал хука + записи панели, названия из `session_index.jsonl`.
  Хук не одобрен — панель прямо говорит, что список неполон.
- Windows — возможности недоступны с причиной (Q2).
