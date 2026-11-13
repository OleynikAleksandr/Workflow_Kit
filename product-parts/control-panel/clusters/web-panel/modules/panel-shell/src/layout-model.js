// @ts-check
// Browser dimensions only: the layout never branches on the host OS.
export const WIDTH_KEY = 'wfk.sidebar.width';
export const NARROW_WIDTH = 680;
export const DEFAULT_WIDTH = 320;
export const MIN_WIDTH = 240;

/** @param {number} viewport */
export function widthRange(viewport) {
  return { min: MIN_WIDTH, max: Math.max(MIN_WIDTH, Math.min(560, viewport - 368)) };
}

/** @param {unknown} value @param {number} viewport */
export function sidebarWidth(value, viewport) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  const { min, max } = widthRange(viewport);
  return Math.round(Math.max(min, Math.min(max, Number.isFinite(n) ? n : DEFAULT_WIDTH)));
}

/** @param {number} width @param {string} key @param {number} viewport */
export function keyboardWidth(width, key, viewport) {
  const { min, max } = widthRange(viewport);
  const values = { ArrowLeft: width - 16, ArrowRight: width + 16, Home: min, End: max };
  return key in values ? sidebarWidth(values[/** @type {keyof typeof values} */ (key)], viewport) : null;
}
