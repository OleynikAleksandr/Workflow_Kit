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
} from './channel.ts';
export { STOP_HOLD_MS, createAgentChannel } from './channel.ts';
export type { AgentClient, HookInput } from './hook-input.ts';
export { AGENT_CLIENTS, blockAnswer, contextAnswer, isAgentClient, parseHookInput, sessionKey } from './hook-input.ts';
export type { ChannelRoutesOptions } from './routes.ts';
export { MESSAGE_MAX_CHARS, queueSessionMessage, registerChannelRoutes } from './routes.ts';
