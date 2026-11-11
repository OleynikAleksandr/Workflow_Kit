# provider-codex: передача удалённого управления приложению ChatGPT (M7, замечание 2)

У треда один писатель, удалённое управление получает подключившийся первым: если его
держит демон, а приложение ChatGPT открыто, чат приложения не открывается на iPad
(«используется в другом сеансе Codex»). `src/handover.ts`, `maintain()` (бэкенд
зовёт раз в минуту): демон `connected`, работает app-server приложения, в демоне нет
загруженных тредов (`thread/loaded/list`) и не идёт `createSession` — тогда
`remote-control stop`, пауза `HANDOVER_WAIT_MS` (приложение берёт управление само,
≤ 65 с), `start --json`; демон остаётся локальным app-server Kit (`remoteOwner:
'app'`). Одна попытка на набор pid приложения. Во время передачи статус «передаёт
управление ChatGPT», создание сессий и действие демона выключены (`HANDOVER_REASON`),
`createSession` — `codex-handover`. `DaemonState.settling` (`isSettling`, `SETTLE_MS`
60 с): `errored` без ошибки входа в первую минуту демона — «подключается», не
«ошибка входа».

| macOS | Linux | Windows |
|---|---|---|
| `ps -axo pid=,command=`: `/ChatGPT.app/` и `app-server` | приложения нет — ничего | CIM `Win32_Process` codex.exe через PowerShell, папка с `OpenAI.Codex`/`ChatGPT` (**П**) |

В режиме общего демона (M12, [shared-access.md](shared-access.md)) `maintain()` передачу не
делает (`HandoverDeps.shared`): приложение ChatGPT — клиент демона, управление остаётся у
демона.
