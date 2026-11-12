export type WorkflowErrorDetails = Record<string, unknown>;

/**
 * Structured error of every Workflow Kit module. The CLI renders it as
 * `{ok:false, code, message, nextAction, details}`.
 */
export class WorkflowError extends Error {
  readonly code: string;
  readonly details: WorkflowErrorDetails;
  readonly nextAction: string | null;

  constructor(
    code: string,
    message: string,
    details: WorkflowErrorDetails = {},
    nextAction: string | null = null
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.nextAction = nextAction;
  }
}

/** Throws a WorkflowError when the condition is false. */
export function ensure(
  condition: unknown,
  code: string,
  message: string,
  details: WorkflowErrorDetails = {},
  nextAction: string | null = null
): asserts condition {
  if (!condition) {
    throw new WorkflowError(code, message, details, nextAction);
  }
}
