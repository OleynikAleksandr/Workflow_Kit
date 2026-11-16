# Workflow Execution Mode Module

## Responsibility

The execution mode choice of a new scope (section 4.1 of
`docs/architecture/workflow-kit/WorkflowKitExecutionModes.md`):
- the scope proposal record `.harness/workflow/local/scope-proposal.json`;
- the options of the mode card;
- the verification of the user's choice against the stored proposal.

Creating the scope, the plan validation and the parallel-work fact belong
to `workflow-plan` and `workflow-kit`; this module only stores and checks
the proposal.

## Public Facade

`WorkflowExecutionModeFacade` (class, singleton
`workflowExecutionModeFacade`) in `src/workflow-execution-mode-facade.ts`.
Types: `ExecutionModeOption` (`sequential`, `orchestrated`, `refine`),
`ScopeProposal`, `ProposalDigest`.

## Contract

- `options(recommended, hasParallelWork)` — pure option logic:
  - with parallel work: `[recommended, the other mode, "refine"]`;
  - without: `["sequential", "refine"]`; recommending `orchestrated` fails
    with `NO_PARALLEL_WORK`;
  - a recommendation other than `sequential`/`orchestrated` fails with
    `PROPOSAL_RECOMMENDATION`.
- `digest(input)` — sha256 (hex) of the canonical JSON of the plan input
  (object keys sorted, array order kept).
- `proposalFile(root)` — the record path, through the local-path helper of
  `workflow-git` (`.harness/workflow/local`, ignored local state).
- `readProposal(root)` — the stored record, or `null` when the file is
  missing, is not JSON or is not a version-1 record with a positive
  `generation` and an `options` list.
- `nextProposal(root, {input, recommended, reason, hasParallelWork, now})`
  builds the next record without writing it:
  - `version: 1`;
  - `generation` is the stored generation + 1, or 1 without a record;
  - `planDigest` is `digest(input)`; `input` is a copy of the validated
    scope input;
  - `recommended`, `reason` (trimmed, 10 to 300 characters, otherwise
    `PROPOSAL_REASON`), `hasParallelWork`, `options`;
  - `refining: false`, `choice: null`, `createdAt: now`.
- `writeProposal(root, proposal)` — atomic two-space JSON.
- `verifyChoice(root, {generation, option, session, note, now})` returns the
  stored proposal or fails, in this order:
  1. `PROPOSAL_OPTION` — the option is not `sequential`, `orchestrated` or
     `refine`;
  2. `PROPOSAL_SESSION` / `PROPOSAL_NOTE` — empty session or note;
  3. `PROPOSAL_CHANGED` — no record, another generation, a record in
     refinement (`input: null`) or a stored input that no longer matches
     `planDigest`; details `{generation, current}`;
  4. `NO_PARALLEL_WORK` — `orchestrated` for a proposal without parallel
     work;
  5. `PROPOSAL_OPTION` — any other option the proposal does not offer.
  It never writes.
- `refine(root, proposal, choice)` writes the record with `input: null`,
  `planDigest: null`, `refining: true` and `choice {option: "refine",
  generation, session, note, at}`; the generation stays.
- `proposalDigest(root, proposal = readProposal(root))` (spec M39) returns
  `{generation, scopeId, proposalDigest, documentDigests}`, the digest a
  review agrees on; it never writes:
  - `NO_PROPOSAL` without a record or for a record in refinement
    (`input: null`);
  - `documentDigests` maps every document path of the input — `spec`,
    `context[].path`, `tasks[].context[].path`, unique and sorted — to the
    sha256 of its bytes, `null` for a missing file (the whole file, also
    for a reference with a heading);
  - `proposalDigest` is `digest({documents, proposal: {input, recommended,
    reason, options, hasParallelWork}})`: the plan input with automation
    and CI and the document bytes count; `createdAt`, `generation`,
    `choice`, `planDigest` and `refining` do not.
- `clear(root)` removes the record (a scope was created or closed).

## Dependencies

`workflow-platform` (files, errors), `workflow-git` (`localPath`),
`workflow-plan` (types). Node built-ins only.

## Tests

`test/workflow-execution-mode-facade.test.mjs` — options with and without
parallel work, `NO_PARALLEL_WORK`, the canonical digest, reason bounds,
growing generations, every `verifyChoice` failure, refine, clear and an
unreadable record; `proposalDigest`: `NO_PROPOSAL` in refinement, sorted
document paths with `null` for a missing file, the same digest for other
times and generations, a new digest for another reason or changed bytes.

## Owned Paths

- `module.md`
- `src/**`
- `test/**`
