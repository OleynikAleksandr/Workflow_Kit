// Public interface of agent-channel.
export type {
  ActivityState,
  AgentChannel,
  AgentChannelOptions,
  DetachedDelivery,
  HookReply,
  IdleListener,
  QueuedMessage,
  SessionActivity,
  SessionRef,
  StopContext,
  StopDecider,
  StopDecision,
  StopEvent,
  StopListener,
  TurnEndEvent,
  TurnEndNotice,
  TurnOrigin,
} from './types.ts';
export { STOP_HOLD_MS, TURN_END_EVENTS } from './types.ts';
export { createAgentChannel } from './channel.ts';
export type { TurnSnapshot, TurnControl, InterruptView, InterruptionOutcome } from './turn-state.ts';
export { MAX_SEND_FAILURES, UNDELIVERED_NOTE } from './detached.ts';
export type { AgentClient, HookDialects, HookInput } from './hook-input.ts';
export { blockAnswer, contextAnswer, messageAnswer, parseHookInput, promptAnswer, sessionKey } from './hook-input.ts';
export type { ChannelRoutesOptions } from './routes.ts';
export { MESSAGE_MAX_CHARS, checkSessionMessage, queueSessionMessage, registerChannelRoutes } from './routes.ts';
