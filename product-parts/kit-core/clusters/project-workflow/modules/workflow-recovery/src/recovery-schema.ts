import {
  type FieldSpec,
  type InputSchema,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import { KIT_COMMAND, type RecoveryInput } from "./recovery-model.js";
import { agentRole } from "./recovery-roles.js";
import { focusTask } from "./recovery-sections.js";

const QUALITY_COMMAND = "quality:apply";

/** Commands with an input descriptor: the plan commands, then `quality:apply`. */
export function inputSchemaCommands(): string[] {
  return [...workflowPlanFacade.inputSchemaCommands(), QUALITY_COMMAND];
}

/** The input descriptor of `command` from its owner module, or null. */
export function inputSchema(command: string): InputSchema | null {
  return command === QUALITY_COMMAND
    ? workflowQualityFacade.inputSchema()
    : workflowPlanFacade.inputSchema(command);
}

function limits(spec: FieldSpec): string[] {
  const items: string[] = [];
  const add = (label: string, value: number | string | undefined) => {
    if (value !== undefined) {
      items.push(`${label} ${value}`);
    }
  };
  add("minItems", spec.minItems);
  add("maxItems", spec.maxItems);
  add("maxBytes", spec.maxBytes);
  add("minLength", spec.minLength);
  add("minimum", spec.minimum);
  add("maximum", spec.maximum);
  add("enum", spec.enum?.join("|"));
  add("pattern", spec.pattern);
  add("code", spec.code);
  add("limitCode", spec.limitCode);
  return items;
}

function fieldLine(spec: FieldSpec): string {
  return `- ${spec.name} ${spec.type} ${spec.required ? "required" : "optional"} [${limits(spec).join(", ")}] — ${spec.description}`;
}

/**
 * Compact text of a descriptor: one line per field
 * (`name type required|optional [limits, code] — description`), the
 * cross-field rules and the example as one line of JSON.
 */
export function schemaText(schema: InputSchema): string {
  return [
    `${schema.command}: ${schema.description}`,
    "fields:",
    ...schema.fields.map(fieldLine),
    "rules:",
    ...schema.rules.map((rule) => `- ${rule}`),
    "example:",
    JSON.stringify(schema.example),
  ].join("\n");
}

/** The task whose input the next step needs: the executor's own task, else the focus task. */
function stepTask(input: RecoveryInput) {
  const executor = input.roles?.executor;
  const task = executor
    ? input.plan.tasks.find((item) => item.id === executor.taskId)
    : focusTask(input.plan);
  return task && task.status !== "DONE" ? task : null;
}

/**
 * The command whose input the next step needs, or null: a new scope
 * (`scope:propose` for a Harness host, else `scope:create`) unless a
 * proposal waits for the user's choice; `plan:extend` for defects of a
 * scope ready for or past acceptance; `quality:apply` for a QUALITY task;
 * the round digest for a DOCS task outside the orchestrator's main.
 */
function nextSchemaCommand(input: RecoveryInput): string | null {
  const scope = input.plan.scope;
  if (!scope) {
    const proposal = input.roles?.proposal;
    if (proposal && !proposal.refining) {
      return null;
    }
    return input.roles?.harness ? "scope:propose" : "scope:create";
  }
  if (input.transaction || scope.status === "BLOCKED") {
    return null;
  }
  const role = agentRole(input);
  if (
    role !== "executor" &&
    (scope.delivery === "READY_FOR_ACCEPTANCE" || scope.delivery === "ACCEPTED")
  ) {
    return "plan:extend";
  }
  const task = stepTask(input);
  if (task?.kind === "quality") {
    return QUALITY_COMMAND;
  }
  return task?.kind === "docs" && role !== "orchestrator" ? "digest" : null;
}

/** The `schema` section of the packet, or null when the next step has no input. */
export function schemaSection(input: RecoveryInput): string | null {
  const command = nextSchemaCommand(input);
  const schema = command ? inputSchema(command) : null;
  return schema
    ? `Input of the next step (\`${KIT_COMMAND} schema ${schema.command}\` prints it again).\n${schemaText(schema)}`
    : null;
}
