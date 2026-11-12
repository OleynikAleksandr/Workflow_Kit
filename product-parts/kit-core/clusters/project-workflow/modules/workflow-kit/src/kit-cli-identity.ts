import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { flag, type ParsedArgs } from "./kit-cli-args.js";
import type { WorkflowKitFacade } from "./workflow-kit-facade.js";

interface IdentityCommandContext {
  args: ParsedArgs;
  kit: WorkflowKitFacade;
  root: string;
}

interface IdentityCommandSpec {
  run: (context: IdentityCommandContext) => unknown;
  text: (result: unknown) => string;
  usage: string;
}

interface IdentitySetResult {
  email: string;
  name: string;
  scope: "global";
}

function identityText(value: unknown): string {
  const result = value as IdentitySetResult;
  return `identity: ${result.name} <${result.email}> (${result.scope} git config)\n`;
}

/**
 * `identity:set --name --email --global`: validates the identity
 * (GIT_IDENTITY_INVALID, GIT_IDENTITY_PLACEHOLDER) and writes it to the
 * global git config. It needs no project: it works in any folder.
 */
export const IDENTITY_COMMANDS: Readonly<Record<string, IdentityCommandSpec>> =
  {
    "identity:set": {
      run: ({ args, kit, root }): IdentitySetResult => {
        ensure(
          args.flags.get("global") === true,
          "USAGE",
          "identity:set needs --global: the identity is set once for all projects."
        );
        // A missing or empty value is the validator's GIT_IDENTITY_INVALID.
        const identity = kit.git.writeGlobalIdentity(root, {
          email: flag(args, "email") ?? "",
          name: flag(args, "name") ?? "",
        });
        return { ...identity, scope: "global" };
      },
      text: identityText,
      usage: 'identity:set --name "<name>" --email <email> --global',
    },
  };
