// Public interface of agent-channel.
export type {
  ActivityState,
  AgentChannel,
  AgentChannelOptions,
  HookReply,
  QueuedMessage,
  SessionActivity,
  StopContext,
  StopDecider,
  StopDecision,
  StopEvent,
  StopListener,
  TurnOrigin,
} from './channel.ts';
export { STOP_HOLD_MS, createAgentChannel } from './channel.ts';
export type { AgentClient, HookDialects, HookInput } from './hook-input.ts';
export { blockAnswer, contextAnswer, messageAnswer, parseHookInput, promptAnswer, sessionKey } from './hook-input.ts';
export type { ChannelRoutesOptions } from './routes.ts';
export { MESSAGE_MAX_CHARS, queueSessionMessage, registerChannelRoutes } from './routes.ts';
