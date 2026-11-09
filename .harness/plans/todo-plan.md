# Workflow Plan — Workflow_Kit

<!-- harness-workflow:begin -->
```json
{
  "currentTaskId": null,
  "lastClosed": {
    "closedAt": "2026-11-09T17:29:49.064Z",
    "scopeId": "m7-test-fixes"
  },
  "projectId": "workflow-kit",
  "projectName": "Workflow_Kit",
  "revision": 478,
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
      "A Kimi Code session is created from the panel with its first message and is visible in the Kimi Code app",
      "Kimi trust and the Kit hook are set up from the project wizard after a preview",
      "Autopilot and plan review messages reach a Kimi session after its turn ends",
      "Provider lists and names in the backend and the panel come from the registry",
      "0.6.0 is installed locally and CI is green on all four platforms before acceptance"
    ],
    "acceptanceNote": null,
    "approval": {
      "at": "2026-11-09T20:23:56.841Z",
      "text": "User 2026-11-09: «Как полноценного провайдера третьего», «речь идёт о Kimi Code»; «Как только пройдешь ревью спецификации и плана и подправишь их в соответствии с замечаниями, приступай к выполнению плана вплоть до сборки нового релиза и проверки а потом отчитайся.» | Execution mode chosen by the user: sequential: Как только пройдешь ревью спецификации и плана и подправишь их в соответствии с замечаниями, приступай к выполнению плана вплоть до сборки нового релиза и проверки а потом отчитайся. … И, пожалуйста, потом без пауз."
    },
    "baselineCommit": "0128a4cbe6e2420f4cde6259e8628de05e0ee1e5",
    "blockedReason": null,
    "context": [
      {
        "path": "docs/planning/M8-kimi-provider.md",
        "required": true
      },
      {
        "path": "docs/planning/M8-kimi-protocol.md",
        "required": true
      },
      {
        "path": "docs/evidence/M8-kimi-captures.md",
        "required": false
      },
      {
        "path": "docs/planning/kimi-provider-research.md",
        "required": false
      }
    ],
    "decisions": [
      {
        "at": "2026-11-09T20:23:56.841Z",
        "text": "Kit uses the Kimi Code CLI and its own `kimi web` server; the Kimi chat app is not supported"
      },
      {
        "at": "2026-11-09T20:23:56.841Z",
        "text": "The Kit hook for Kimi is five global [[hooks]] entries in config.toml written after a preview with a fingerprint"
      },
      {
        "at": "2026-11-09T20:23:56.841Z",
        "text": "The next message reaches Kimi as a prompt after the session lock is released; the Stop hook is not held"
      },
      {
        "at": "2026-11-09T20:23:56.841Z",
        "text": "Provider lists and names come from the registry instead of hardcoded claude/codex"
      },
      {
        "at": "2026-11-09T20:23:56.841Z",
        "text": "Kimi is not a plan reviewer and does not orchestrate in M8; a Kimi main session is reviewed by ChatGPT"
      },
      {
        "at": "2026-11-09T20:23:56.841Z",
        "text": "Sessions open in the Kimi Code app by kimi-code://open?root=<project>; on a tablet through Remote Control"
      }
    ],
    "delivery": "IN_PROGRESS",
    "execution": {
      "maxWorkers": 1,
      "ownerSession": "cb3d513d-4c3d-4df1-87cc-0504037096d6",
      "strategy": "sequential"
    },
    "id": "m8-kimi-provider",
    "objective": "Add Kimi Code as the third provider of Workflow Kit and release 0.6.0",
    "spec": "docs/planning/M8-kimi-provider.md",
    "status": "ACTIVE"
  },
  "tasks": [
    {
      "acceptance": [
        "Provider.hookDialect exists in the contract; a provider without it uses the claude dialect",
        "parseHookInput accepts a prompt given as an array of parts and the channel answers UserPromptSubmit of a kimi-dialect client with {message}",
        "AgentClient is a provider id from the registry; --client of wfk hook is checked against the registry and an unknown client is refused",
        "Claude and Codex hook behaviour is unchanged and covered by the existing tests"
      ],
      "checks": [],
      "commitMessage": "refactor: take hook clients and reply dialects from the provider registry",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        }
      ],
      "dependencies": [],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/module.md",
        "product-parts/backend-core/clusters/projects/modules/kit-structure/src/session-hook.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-list.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts"
      ],
      "fixes": null,
      "id": "T001",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Hook clients and dialects from the registry",
      "why": "A third provider needs its hook input and reply format without hardcoded claude/codex checks"
    },
    {
      "acceptance": [
        "session-titles, plan-review, cross-review, autopilot, plan-view and cli have no comparison with a provider name outside dialect or pair tables",
        "Review pairs come from one table (claude→codex, codex→claude, kimi→codex) and a provider with an unavailable reviewer capability is never offered as a reviewer",
        "choiceOptionsFor hides orchestrated for a provider whose orchestration capability is unavailable",
        "wfk session title|plan without a session id resolves the only project session with a running turn; none or several give 409 session-ambiguous with candidates",
        "/api/sessions/plan accepts any registered client"
      ],
      "checks": [],
      "commitMessage": "refactor: take provider lists, review pairs and session lookup from the registry",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        }
      ],
      "dependencies": [
        "T001"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-list.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/plan-view.ts",
        "product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestration.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/find-reviewer.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/index.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/routes.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts"
      ],
      "fixes": null,
      "id": "T002",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Provider lists from the registry in the service",
      "why": "Titles, reviews, autopilot, plan view and session commands hardcode the claude/codex pair"
    },
    {
      "acceptance": [
        "Wizard provider buttons and the trust and hook steps are built from the provider list of the state",
        "The provider of the first session is mandatory; steps of other providers are skipped with a note",
        "HookState.writes is part of the contract, shown in the preview, and the preview fingerprint includes the hook hash of every provider",
        "Provider actions with scope provider are shown for any provider, also a ready one and in an existing project",
        "approveHooks receives the command and hash of the preview shown to the user, not re-read values; a hook file changed during an earlier wizard step is refused with hooks-changed and a new preview"
      ],
      "checks": [],
      "commitMessage": "feat: build the project wizard from the registered providers",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true,
          "heading": "4. Список провайдеров из реестра"
        }
      ],
      "dependencies": [
        "T002"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex",
        "product-parts/backend-core/clusters/projects/modules/project-setup",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/module.md",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/index.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/preview.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/src/setup.ts",
        "product-parts/backend-core/clusters/projects/modules/project-setup/test/setup.test.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/provider-list.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/provider-actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/provider-actions.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.css",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/wizard-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard/test/wizard-model.test.ts",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md",
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts"
      ],
      "fixes": null,
      "id": "T003",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Wizard by registry providers",
      "why": "The wizard knows exactly two providers and hides provider actions of a ready provider"
    },
    {
      "acceptance": [
        "Provider names, labels, button captions and confirmation texts come from the state",
        "Session revival is offered only for providers with resumeSession; opening a chat follows links",
        "The Programs line of the System card lists the programs reported by the service",
        "Panel files stay within the 400 line limit"
      ],
      "checks": [],
      "commitMessage": "feat: render provider names, buttons and labels of the panel from the state",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true,
          "heading": "4. Список провайдеров из реестра"
        }
      ],
      "dependencies": [
        "T003"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/module.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/archive.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/providers.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/module.md",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js",
        "product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts"
      ],
      "fixes": null,
      "id": "T004",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "Panel by registry providers",
      "why": "The panel shell and the session view hardcode Claude and ChatGPT"
    },
    {
      "acceptance": [
        "wfk install records the path of kimi as an optional program on macOS, Linux and Windows",
        "wfk status and wfk doctor show kimi; a missing kimi is not an error",
        "win32 and linux branches have tests with the injected platform"
      ],
      "checks": [],
      "commitMessage": "feat: record the kimi program at install and show it in status and doctor",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        }
      ],
      "dependencies": [
        "T004"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/system-service/clusters/deployment/modules/service-installer",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/OVERVIEW.md",
        "product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/module.md",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/programs.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/status.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts",
        "product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts"
      ],
      "fixes": null,
      "id": "T005",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "DONE",
      "title": "kimi in install programs, status and doctor",
      "why": "The service must know the path of kimi the same way as claude and codex"
    },
    {
      "acceptance": [
        "The contract has optional sessionIdle, lastAnswer and sendMessage(project, sessionId, text, {id})",
        "wfk hook turn-end posts to /api/hooks/turn-end, prints nothing and exits 0 also when the service is down",
        "One watcher per session waits for sessionIdle and restarts on a new notification; a Stop while the session is busy delivers nothing; an expired wait is picked up by maintain",
        "The detached stop takes the decision path of stop() and delivers an outbox with a stable id: a refused delivery is retried with the same id and content, and five failures in a row leave a note",
        "A UserPromptSubmit carrying the outbox text keeps the origin and sources of the turn also when the hook arrives before the API answer; the autopilot counts the turn as its own and a full review round recognises the answer to its remarks",
        "A failed lastAnswer is not an agent answer: stop listeners and the decider are not called and the session carries a note; a turn generation that changed cancels the detached stop",
        "A Stop without a live session lock marks the session as lockless: no detached stop and no delivery until a Stop arrives with a live lock",
        "A deferred session title is applied when the session becomes idle, before the next delivery, without a new user turn",
        "A message queued for a waiting slot is flushed at once; wakeIdle and maintain flush for providers with sendMessage; sessions archived in the panel get no message",
        "StopFailure and Interrupt do not continue the autopilot; a user prompt cancels a pending detached stop"
      ],
      "checks": [],
      "commitMessage": "feat: deliver the next message as a prompt after a detached turn end",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        },
        {
          "path": "docs/planning/M8-kimi-protocol.md",
          "required": true,
          "heading": "11. Конец хода и доставка: правила канала"
        }
      ],
      "dependencies": [
        "T005"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T006",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Turn end without holding Stop",
      "why": "Kimi cannot take a continuation in its Stop hook, so the channel needs a detached turn end"
    },
    {
      "acceptance": [
        "The kimi provider is registered after codex and reports the states of the status table",
        "The Kimi server is started through the supervisor without a saved output, found by its pid in server/instances and adopted after a service restart",
        "The HTTP client talks only to 127.0.0.1, refuses redirects, sends the token only in the header, re-reads it once on an authorization failure and drops stack and data of errors",
        "ensureWorkspace reuses the workspace of the same folder and creates one with an idempotency key otherwise",
        "trust reads only workspace-trust files; grantTrust writes through the API and reads back",
        "Tests use a fake server with the real 2.5.2 answers of docs/evidence/M8-kimi-captures.md copied to test/fixtures and a temporary home; win32 and linux branches are tested with the injected platform",
        "The client checks the shape of the answers it uses; an unknown shape gives the error status with the Kimi version, and a version outside 2.5.x with a known shape stays ready with a note"
      ],
      "checks": [],
      "commitMessage": "feat: add the Kimi provider with its server, status and folder trust",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        },
        {
          "path": "docs/planning/M8-kimi-protocol.md",
          "required": true
        }
      ],
      "dependencies": [
        "T006"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/provider-runtime/clusters/provider-adapters/cluster.md",
        "product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T007",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "provider-kimi: program, server, status, workspace, trust",
      "why": "The base of the third provider"
    },
    {
      "acceptance": [
        "Hook commands are built for /bin/sh and for cmd.exe; a path that cannot be quoted gives status unknown",
        "hooks() reports approved, pending, modified or unknown and carries writes and the fingerprint",
        "approveHooks takes a lock file with its pid (a lock of a dead process is taken over), refuses a changed file with hooks-changed also when it changes right before the rename, keeps a backup, writes atomically, runs kimi doctor config and rolls back only its own write",
        "Blocks of other tools and the rest of config.toml stay byte for byte",
        "The remove-kimi-hook action removes only Kit blocks",
        "The wizard shows the Kimi hook step with its preview",
        "A test executes the generated hook command through the shell of its OS (/bin/sh and cmd.exe in CI) with a stand-in launcher: stdin arrives, and paths with a space, Cyrillic letters and an apostrophe work"
      ],
      "checks": [],
      "commitMessage": "feat: write the Kit hook into the Kimi config after a preview",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        },
        {
          "path": "docs/planning/M8-kimi-protocol.md",
          "required": true
        }
      ],
      "dependencies": [
        "T007"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/projects/modules/project-setup",
        "product-parts/control-panel/clusters/web-panel/modules/project-wizard",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T008",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Kit hook for Kimi in config.toml",
      "why": "Kimi hooks are global entries of the user config and must be written safely"
    },
    {
      "acceptance": [
        "createSession creates the session in the workspace of the folder and sends the first message",
        "One ownership rule (the session folder is the project folder or inside it) serves the server, panel records and the hook journal; listSessions pages through active and archived sessions and works from records when the server is down",
        "renameSession returns synced false on 40931; archiveSessions and restoreSessions mirror the panel archive to Kimi and a refusal leaves a note; a session archived only in Kimi carries a note and gets no message",
        "deleteSessions enumerates every session of the folder workspaces without a page limit, also sessions created outside the panel and missing from the journal; an incomplete run keeps a per-folder intent retried by retryDeletes after a service restart, and sessions created after the request are kept",
        "sessionIdle follows the lock file rules; lastAnswer pages back to the last user message, returns null only for a turn without assistant text and rejects on an API failure or a missing turn start",
        "sendMessage is serialized per session, uses prompt_id kit-<delivery id> given by the caller and handles 40927, 40931 and 40932"
      ],
      "checks": [],
      "commitMessage": "feat: create, list, rename, archive and delete Kimi sessions and deliver messages",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        },
        {
          "path": "docs/planning/M8-kimi-protocol.md",
          "required": true
        }
      ],
      "dependencies": [
        "T008"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry",
        "product-parts/workflow-engine/clusters/session-loop/modules/session-titles",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T009",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Kimi sessions and message delivery",
      "why": "Sessions are the main function of a provider"
    },
    {
      "acceptance": [
        "links.desktop is kimi-code://open?root=<folder> only when the app is found; otherwise the session carries the note with kimi -S <id>",
        "links.mobile is given only for an exact https://code-rc.kimi.com/devices/<id>/ address",
        "open-link accepts kimi-code://open only with the root of a registered project and opens it with open, xdg-open or rundll32 by platform; a missing handler gives a defined answer",
        "The kimi-remote, kimi-remote-off and restart-kimi-server actions work and 40928 gives a note",
        "A click on a Kimi session in the panel opens its screen and the project in the app"
      ],
      "checks": [],
      "commitMessage": "feat: open Kimi sessions in the Kimi Code app and through Remote Control",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        },
        {
          "path": "docs/planning/M8-kimi-protocol.md",
          "required": true,
          "heading": "6. Приложение и Remote Control"
        }
      ],
      "dependencies": [
        "T009"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "product-parts/control-panel/clusters/web-panel/modules/panel-shell",
        "product-parts/control-panel/clusters/web-panel/modules/session-view",
        "tools/platform-guard/allowlist.json",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T010",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Kimi links, app check, Remote Control",
      "why": "The user opens the chat from the panel on the computer and on a tablet"
    },
    {
      "acceptance": [
        "Scenario tests of section 7 pass on fixtures of real Kimi 2.5.2 answers, including two autopilot continuations in a row and a full review round Kimi → ChatGPT → Kimi",
        "Autopilot texts and the AGENTS.md template say that orchestration is not started from Kimi",
        "Fixtures contain no secrets and no paths of the developer machine"
      ],
      "checks": [],
      "commitMessage": "test: cover Kimi autopilot and review scenarios; say that Kimi runs scopes sequentially",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true
        },
        {
          "path": "docs/planning/M8-kimi-protocol.md",
          "required": true,
          "heading": "11. Конец хода и доставка: правила канала"
        }
      ],
      "dependencies": [
        "T010"
      ],
      "docsWaiver": null,
      "files": [
        "product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi",
        "product-parts/workflow-engine/clusters/session-loop/modules/agent-channel",
        "product-parts/workflow-engine/clusters/session-loop/modules/autopilot",
        "product-parts/workflow-engine/clusters/session-loop/modules/cross-review",
        "product-parts/workflow-engine/clusters/session-loop/modules/plan-review",
        "product-parts/backend-core/clusters/projects/modules/kit-structure",
        "product-parts/backend-core/clusters/runtime/modules/cli",
        "docs/architecture/OVERVIEW.md"
      ],
      "fixes": null,
      "id": "T011",
      "iteration": 1,
      "kind": "work",
      "roundId": "R1",
      "status": "TODO",
      "title": "Scenario tests, autopilot texts and AGENTS template for Kimi",
      "why": "The whole chain must be proven on real fixtures before the release"
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
        "T008",
        "T009",
        "T010",
        "T011"
      ],
      "docsWaiver": null,
      "files": [
        "README.md",
        "docs/architecture/OVERVIEW.md",
        "docs/planning/M8-kimi-provider.md",
        "product-parts/provider-runtime/clusters/provider-adapters/cluster.md"
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
        "Version 0.6.0 in package files and docs; CHANGELOG entry",
        "node bin/wfk.mjs install and wfk doctor --installed pass",
        "CI on ci/m8-kimi-provider is green on macOS, Linux, Windows x64 and ARM64",
        "The acceptance document lists live checks per OS with their actual results; Windows and Linux items not checked live are recorded as unverified"
      ],
      "checks": [],
      "commitMessage": "chore: release 0.6.0",
      "confirmation": null,
      "context": [
        {
          "path": "docs/planning/M8-kimi-provider.md",
          "required": true,
          "heading": "7. Проверка"
        }
      ],
      "dependencies": [
        "T011",
        "DOCS-R1"
      ],
      "docsWaiver": null,
      "files": [
        "package.json",
        "package-lock.json",
        "CHANGELOG.md",
        "README.md",
        "docs/installation.md",
        "docs/architecture/OVERVIEW.md",
        "docs/evidence/M8-acceptance.md"
      ],
      "fixes": null,
      "id": "T012",
      "iteration": 1,
      "kind": "delivery",
      "roundId": "R1",
      "status": "TODO",
      "title": "Release 0.6.0 with green CI",
      "why": "Release 0.6.0 with green CI"
    }
  ]
}
```
<!-- harness-workflow:end -->

## State

- Scope: m8-kimi-provider (ACTIVE)
- Delivery: IN_PROGRESS
- Execution: sequential
- Current task: none
- Progress: 5/13
- Revision: 478

## Objective

Add Kimi Code as the third provider of Workflow Kit and release 0.6.0

## Acceptance

- A Kimi Code session is created from the panel with its first message and is visible in the Kimi Code app
- Kimi trust and the Kit hook are set up from the project wizard after a preview
- Autopilot and plan review messages reach a Kimi session after its turn ends
- Provider lists and names in the backend and the panel come from the registry
- 0.6.0 is installed locally and CI is green on all four platforms before acceptance

## Rounds

### R1 — Implementation (implementation, OPEN)

- [DONE] T001 — Hook clients and dialects from the registry (work)
  - Commit: refactor: take hook clients and reply dialects from the provider registry
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/projects/modules/kit-structure/module.md, product-parts/backend-core/clusters/projects/modules/kit-structure/src/session-hook.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/commands.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/hook.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-list.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-link.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/module.md, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/channel.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/hook-input.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel/test/channel.test.ts
- [DONE] T002 — Provider lists from the registry in the service (work)
  - Commit: refactor: take provider lists, review pairs and session lookup from the registry
  - Files: product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/kit-host/modules/plan-view, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-list.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-command.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/session-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/hook-channel.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/review.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/module.md, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/src/plan-view.ts, product-parts/workflow-engine/clusters/kit-host/modules/plan-view/test/plan-view.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/module.md, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/autopilot.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/decide.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/autopilot/test/orchestration.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/contract.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/find-reviewer.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/review.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/store.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/src/texts.ts, product-parts/workflow-engine/clusters/session-loop/modules/cross-review/test/review.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/module.md, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/src/toggles.ts, product-parts/workflow-engine/clusters/session-loop/modules/plan-review/test/toggles.test.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/module.md, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/index.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/routes.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/src/titles.ts, product-parts/workflow-engine/clusters/session-loop/modules/session-titles/test/titles.test.ts
  - Depends on: T001
- [DONE] T003 — Wizard by registry providers (work)
  - Commit: feat: build the project wizard from the registered providers
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex, product-parts/backend-core/clusters/projects/modules/project-setup, product-parts/control-panel/clusters/web-panel/modules/project-wizard, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/projects/modules/project-setup/module.md, product-parts/backend-core/clusters/projects/modules/project-setup/src/index.ts, product-parts/backend-core/clusters/projects/modules/project-setup/src/preview.ts, product-parts/backend-core/clusters/projects/modules/project-setup/src/setup.ts, product-parts/backend-core/clusters/projects/modules/project-setup/test/setup.test.ts, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/provider-list.ts, product-parts/backend-core/clusters/runtime/modules/cli/src/review-wiring.ts, product-parts/backend-core/clusters/runtime/modules/cli/test/providers.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/provider-actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/provider-actions.test.ts, product-parts/control-panel/clusters/web-panel/modules/project-wizard/module.md, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.css, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/project-wizard.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/src/wizard-model.js, product-parts/control-panel/clusters/web-panel/modules/project-wizard/test/wizard-model.test.ts, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/module.md, product-parts/provider-runtime/clusters/provider-adapters/modules/provider-codex/src/provider.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/contract.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/index.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts
  - Depends on: T002
- [DONE] T004 — Panel by registry providers (work)
  - Commit: feat: render provider names, buttons and labels of the panel from the state
  - Files: product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/session-view, product-parts/control-panel/clusters/web-panel/modules/project-wizard, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/runtime/modules/cli/module.md, product-parts/backend-core/clusters/runtime/modules/cli/src/app.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/module.md, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/actions.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/app.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/archive.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/layout.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/providers.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/screens.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/sidebar.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/slots.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/system-card.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/tree.css, product-parts/control-panel/clusters/web-panel/modules/panel-shell/src/view-model.js, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/panel-shell.test.ts, product-parts/control-panel/clusters/web-panel/modules/panel-shell/test/view-model.test.ts, product-parts/control-panel/clusters/web-panel/modules/session-view/module.md, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-model.js, product-parts/control-panel/clusters/web-panel/modules/session-view/src/session-view.js, product-parts/control-panel/clusters/web-panel/modules/session-view/test/session-model.test.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/module.md, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/src/registry.ts, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry/test/routes.test.ts
  - Depends on: T003
- [DONE] T005 — kimi in install programs, status and doctor (work)
  - Commit: feat: record the kimi program at install and show it in status and doctor
  - Files: product-parts/system-service/clusters/deployment/modules/service-installer, product-parts/backend-core/clusters/runtime/modules/cli, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md, product-parts/backend-core/clusters/runtime/modules/cli/test/app.test.ts, product-parts/system-service/clusters/deployment/modules/service-installer/module.md, product-parts/system-service/clusters/deployment/modules/service-installer/src/doctor.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/programs.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/status.ts, product-parts/system-service/clusters/deployment/modules/service-installer/src/types.ts, product-parts/system-service/clusters/deployment/modules/service-installer/test/install.test.ts
  - Depends on: T004
- [TODO] T006 — Turn end without holding Stop (work)
  - Commit: feat: deliver the next message as a prompt after a detached turn end
  - Files: product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/backend-core/clusters/projects/modules/kit-structure, docs/architecture/OVERVIEW.md
  - Depends on: T005
- [TODO] T007 — provider-kimi: program, server, status, workspace, trust (work)
  - Commit: feat: add the Kimi provider with its server, status and folder trust
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/provider-runtime/clusters/provider-adapters/cluster.md, product-parts/provider-runtime/clusters/provider-contract/modules/process-supervisor, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/backend-core/clusters/runtime/modules/cli, package.json, package-lock.json, tsconfig.json, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md
  - Depends on: T006
- [TODO] T008 — Kit hook for Kimi in config.toml (work)
  - Commit: feat: write the Kit hook into the Kimi config after a preview
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/projects/modules/project-setup, product-parts/control-panel/clusters/web-panel/modules/project-wizard, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/backend-core/clusters/runtime/modules/cli, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md
  - Depends on: T007
- [TODO] T009 — Kimi sessions and message delivery (work)
  - Commit: feat: create, list, rename, archive and delete Kimi sessions and deliver messages
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/provider-runtime/clusters/provider-contract/modules/provider-registry, product-parts/workflow-engine/clusters/session-loop/modules/session-titles, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OVERVIEW.md
  - Depends on: T008
- [TODO] T010 — Kimi links, app check, Remote Control (work)
  - Commit: feat: open Kimi sessions in the Kimi Code app and through Remote Control
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/backend-core/clusters/runtime/modules/cli, product-parts/control-panel/clusters/web-panel/modules/panel-shell, product-parts/control-panel/clusters/web-panel/modules/session-view, tools/platform-guard/allowlist.json, docs/architecture/OVERVIEW.md
  - Depends on: T009
- [TODO] T011 — Scenario tests, autopilot texts and AGENTS template for Kimi (work)
  - Commit: test: cover Kimi autopilot and review scenarios; say that Kimi runs scopes sequentially
  - Files: product-parts/provider-runtime/clusters/provider-adapters/modules/provider-kimi, product-parts/workflow-engine/clusters/session-loop/modules/agent-channel, product-parts/workflow-engine/clusters/session-loop/modules/autopilot, product-parts/workflow-engine/clusters/session-loop/modules/cross-review, product-parts/workflow-engine/clusters/session-loop/modules/plan-review, product-parts/backend-core/clusters/projects/modules/kit-structure, product-parts/backend-core/clusters/runtime/modules/cli, docs/architecture/OVERVIEW.md
  - Depends on: T010
- [TODO] DOCS-R1 — Reconcile project documentation and write the round digest (docs)
  - Commit: docs: reconcile documentation for R1
  - Files: README.md, docs/architecture/OVERVIEW.md, docs/planning/M8-kimi-provider.md, product-parts/provider-runtime/clusters/provider-adapters/cluster.md
  - Depends on: T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011
- [TODO] T012 — Release 0.6.0 with green CI (delivery)
  - Commit: chore: release 0.6.0
  - Files: package.json, package-lock.json, CHANGELOG.md, README.md, docs/installation.md, docs/architecture/OVERVIEW.md, docs/evidence/M8-acceptance.md
  - Depends on: T011, DOCS-R1

State changes only through `scripts/workflow` commands. History lives in Git.
