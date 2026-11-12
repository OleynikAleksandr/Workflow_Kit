import type { InputSchema } from "../../workflow-plan/src/workflow-plan-facade.js";
import { WorkflowError } from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowRecoveryFacade } from "../../workflow-recovery/src/workflow-recovery-facade.js";
import type { ParsedArgs } from "./kit-cli-args.js";

interface SchemaCommandSpec {
  run: (context: { args: ParsedArgs }) => unknown;
  text: (result: unknown) => string;
  usage: string;
}

/** `schema` without a command: every command with an input descriptor. */
interface SchemaList {
  commands: { command: string; description: string }[];
}

function schemaList(): SchemaList {
  return {
    commands: workflowRecoveryFacade.inputSchemaCommands().map((command) => ({
      command,
      description:
        workflowRecoveryFacade.inputSchema(command)?.description ?? "",
    })),
  };
}

function schemaText(value: unknown): string {
  if ("commands" in (value as object)) {
    return [
      "Commands with an input schema:",
      ...(value as SchemaList).commands.map(
        (item) => `- ${item.command} — ${item.description}`
      ),
      "Run `scripts/workflow schema <command>` for its fields, rules and an example.",
      "",
    ].join("\n");
  }
  return `${workflowRecoveryFacade.schemaText(value as InputSchema)}\n`;
}

/**
 * `schema [<command>]`: the JSON input descriptor of a Kit command with its
 * example, or the list of commands that have one. A pure read: it needs no
 * scope and also runs in an executor worktree.
 */
export const SCHEMA_COMMANDS: Readonly<Record<string, SchemaCommandSpec>> = {
  schema: {
    run: ({ args }): InputSchema | SchemaList => {
      const command = args.positionals[0];
      if (command === undefined) {
        return schemaList();
      }
      const schema = workflowRecoveryFacade.inputSchema(command);
      if (!schema) {
        const commands = workflowRecoveryFacade.inputSchemaCommands();
        throw new WorkflowError(
          "USAGE",
          `${command} has no input schema. Commands with a schema: ${commands.join(", ")}.`,
          { commands },
          "Run `scripts/workflow schema` for the list."
        );
      }
      return schema;
    },
    text: schemaText,
    usage: "schema [<command>]",
  },
};
