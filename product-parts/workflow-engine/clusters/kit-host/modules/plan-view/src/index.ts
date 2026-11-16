// Public interface of plan-view.
export type {
  KitAssignment,
  KitChoiceOption,
  KitExecution,
  KitProposal,
  KitProposalDigest,
  KitScope,
  KitScopeProposalMarker,
  KitStatus,
  KitStrategy,
  KitTask,
  KitTaskRef,
  KitTaskStatus,
} from './kit-types.ts';
export type { ChoiceCard, ChoiceOptionView, PlanAction, PlanPhase, PlanTaskView, PlanView, TaskState } from './plan-view.ts';
export {
  MODE_LABELS,
  PHASE_LABELS,
  TASK_STATE_LABELS,
  buildChoiceCard,
  buildPlanView,
  choiceOptionsFor,
} from './plan-view.ts';
export type { AutopilotSupport, KitAutopilotCapability } from './autopilot-support.ts';
export { SUPPORTED_HOST_PROTOCOL, UPDATE_KIT_TEXT, autopilotSupport } from './autopilot-support.ts';
