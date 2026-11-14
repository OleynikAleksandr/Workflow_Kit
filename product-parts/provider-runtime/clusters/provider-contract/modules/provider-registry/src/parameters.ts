/** Provider-owned presentation and editing of effective session parameters (M25). */
export type ParameterId = 'model' | 'effort' | 'speed' | 'mode' | 'permissions' | 'ultracode';
export interface ParameterOption {
  value: string; label: string; description?: string;
  disabled?: boolean; reason?: string; confirm?: string; selected?: boolean; group?: 'primary' | 'more'; recommended?: boolean;
}
export interface ParameterItem {
  id: ParameterId; value: string | null; label: string;
  tone: 'primary' | 'muted'; icon?: 'zap'; inRow: boolean; title: string;
  options?: ParameterOption[]; reason?: string;
}
export interface ContextUsage {
  usedTokens: number | null; windowTokens: number | null; usedPercent: number | null;
  /** The model window when the provider counts against a smaller threshold (Claude autoCompactWindow, M28). */
  modelWindowTokens?: number | null;
}
export interface LimitWindow {
  id: string; label: string; usedPercent: number; resetsAt: string | null;
}
export interface ParameterStyle { font: string; ring: 'first' | 'last'; accent?: string }
export interface SessionParameters {
  items: ParameterItem[]; context: ContextUsage | null; limits: LimitWindow[];
  presentation?: ParameterPresentation; style: ParameterStyle; editable: boolean; reason?: string; notes?: string[]; at: string;
}
export interface ParameterChange {
  model?: string; effort?: string; speed?: string; mode?: string; ultracode?: string;
  permissions?: string; access?: string; confirmed?: boolean;
}
export const PARAMETER_IDS: readonly ParameterId[] = ['model', 'effort', 'speed', 'mode', 'permissions', 'ultracode'];

/** Optional provider-owned compact controls; older clients keep the item list. */
export interface AccessOption extends ParameterOption {
  icon: 'hand' | 'shield-check' | 'shield-alert';
}
export interface AccessPresentation {
  value: string | null; label: string; tone: 'primary' | 'warning';
  options?: AccessOption[]; reason?: string;
}
export interface EffortCardPresentation {
  layout: 'effort-card'; speedHint?: string; access: AccessPresentation;
}

export interface ClaudeControlsPresentation { layout: 'claude-controls'; speedHint?: string }
export type ParameterPresentation = EffortCardPresentation | ClaudeControlsPresentation;

export const PARAMETER_CHANGE_IDS = [...PARAMETER_IDS, 'access'] as const;
