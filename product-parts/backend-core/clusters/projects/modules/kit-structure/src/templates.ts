// Texts that Workflow Kit writes into user projects (structure v1, spec section 7).
// They are read by agents of any project, so they are written in English.

/** Version of the Kit structure; bump it whenever a managed text below changes. */
export const STRUCTURE_VERSION = 1;

/** Markers of the Kit section in AGENTS.md. */
export const AGENTS_BEGIN = '<!-- wfk:begin -->';
export const AGENTS_END = '<!-- wfk:end -->';

/** Markers of the Kit block in .gitignore. */
export const GITIGNORE_BEGIN = '# wfk:begin';
export const GITIGNORE_END = '# wfk:end';

/** Clients whose SessionStart hook Kit installs. */
export type HookClient = 'claude' | 'codex';
export const HOOK_CLIENTS: readonly HookClient[] = ['claude', 'codex'];

/**
 * Machine-independent SessionStart hook command (spec section 7): it silently does nothing
 * when the launcher is missing and always exits with 0.
 */
export function hookCommand(client: HookClient): string {
  return `[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook session-start --client ${client}; exit 0`;
}

/** Body of the Kit section in AGENTS.md (between the markers). */
export const AGENTS_SECTION = `## Workflow Kit (managed section, do not edit by hand)

Workflow Kit (\`wfk\`) manages this section, the SessionStart hook entries in
\`.claude/settings.json\` and \`.codex/hooks.json\`, the \`.gitignore\` block between
\`# wfk:begin\` and \`# wfk:end\` and the files listed in
\`.workflow-kit/manifest.json\`. Write project instructions outside the
\`wfk:begin\`/\`wfk:end\` markers; Kit never changes text outside them.

### Architecture: product-parts

Code is organized as a tree of product parts, clusters and modules:

\`\`\`text
product-parts/<part>/product-part.md
product-parts/<part>/clusters/<cluster>/cluster.md
product-parts/<part>/clusters/<cluster>/modules/<module>/module.md
product-parts/<part>/clusters/<cluster>/modules/<module>/src/
product-parts/<part>/clusters/<cluster>/modules/<module>/test/
\`\`\`

- A product part is a large area of the product; \`product-part.md\` names its
  purpose, clusters and boundaries.
- A cluster groups related modules; \`cluster.md\` lists them and the rules
  between them.
- A module is the unit of work: \`module.md\` is its contract (purpose, public
  interface, invariants, dependencies), \`src/\` holds the code, \`test/\` the tests.
- Modules talk to each other only through the public entry of a module (for
  example \`src/index.ts\`); never import another module's internal files.
- A module contract changes in the same commit as the module code.
- Start new parts, clusters and modules from the templates in
  \`.workflow-kit/templates/\` (\`product-part.md\`, \`cluster.md\`, \`module.md\`).
- Existing code is not moved automatically; move it into modules only as part
  of planned work.

### Local data

\`.workflow-kit/local/\` holds machine-local data (for example the session journal
\`sessions.jsonl\` written by the SessionStart hook). It is git-ignored; do not
commit or edit it.
`;

/** CLAUDE.md created when the project has none: Claude reads AGENTS.md through it. */
export const CLAUDE_MD = '@AGENTS.md\n';

/** Body of the Kit block in .gitignore (between the markers). */
export const GITIGNORE_BLOCK = '.workflow-kit/local/\n';

/** product-parts/README.md, created only when the project has no product-parts directory. */
export const PRODUCT_PARTS_README = `# product-parts

Code of this project is organized as product parts, clusters and modules
(the convention is described in the Workflow Kit section of \`AGENTS.md\`):

\`\`\`text
<part>/product-part.md
<part>/clusters/<cluster>/cluster.md
<part>/clusters/<cluster>/modules/<module>/module.md   contract
<part>/clusters/<cluster>/modules/<module>/src/        code
<part>/clusters/<cluster>/modules/<module>/test/       tests
\`\`\`

- Modules use each other only through their public entry (e.g. \`src/index.ts\`).
- A module contract (\`module.md\`) changes in the same commit as its code.
- Templates: \`.workflow-kit/templates/product-part.md\`, \`cluster.md\`, \`module.md\`.
`;

/** Template of product-part.md. */
export const PRODUCT_PART_TEMPLATE = `# Product part: <part>

## Purpose

What this part of the product does and for whom.

## Public interface

Clusters and the entry points other parts may use.

| Cluster | Responsibility |
| --- | --- |
| \`<cluster>\` | ... |

## Invariants

Rules that always hold for this part.

## Dependencies

Other product parts this part relies on, and through which public entries.
`;

/** Template of cluster.md. */
export const CLUSTER_TEMPLATE = `# Cluster: <part> / <cluster>

## Purpose

What this cluster is responsible for.

## Public interface

Modules of the cluster and what each of them offers to others.

| Module | Responsibility |
| --- | --- |
| \`<module>\` | ... |

## Invariants

Rules between the modules of this cluster.

## Dependencies

Other clusters and modules this cluster uses, only through their public entries.
`;

/** Template of module.md (the module contract). */
export const MODULE_TEMPLATE = `# Module: <module>

Part \`<part>\`, cluster \`<cluster>\`. Public entry: \`src/index.ts\`.

## Purpose

What the module does and what it does not do.

## Public interface

Functions, types, routes, commands and files that other modules may use.

## Invariants

Rules the module always keeps; tests check them.

## Dependencies

Modules this module imports (only through their public entries) and external
programs or files it touches.
`;
