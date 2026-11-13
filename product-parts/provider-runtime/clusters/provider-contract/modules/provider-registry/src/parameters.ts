/** Provider-owned presentation and editing of effective session parameters (M25). */
export type ParameterId = 'model' | 'effort' | 'speed' | 'mode' | 'permissions';
export interface ParameterOption {
  value: string; label: string; description?: string;
  disabled?: boolean; reason?: string; confirm?: string;
}
export interface ParameterItem {
  id: ParameterId; value: string | null; label: string;
  tone: 'primary' | 'muted'; icon?: 'zap'; inRow: boolean; title: string;
  options?: ParameterOption[]; reason?: string;
}
export interface ContextUsage {
  usedTokens: number | null; windowTokens: number | null; usedPercent: number | null;
}
export interface LimitWindow {
  id: string; label: string; usedPercent: number; resetsAt: string | null;
}
export interface ParameterStyle { font: string; ring: 'first' | 'last'; accent?: string }
export interface SessionParameters {
  items: ParameterItem[]; context: ContextUsage | null; limits: LimitWindow[];
  style: ParameterStyle; editable: boolean; reason?: string; notes?: string[]; at: string;
}
export interface ParameterChange {
  model?: string; effort?: string; speed?: string; mode?: string;
  permissions?: string; confirmed?: boolean;
}
export const PARAMETER_IDS: readonly ParameterId[] = ['model', 'effort', 'speed', 'mode', 'permissions'];
