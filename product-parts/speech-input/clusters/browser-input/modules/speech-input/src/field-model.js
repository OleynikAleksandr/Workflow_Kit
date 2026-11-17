export function beginRange(text, start, end) {
  const prefix = text.slice(0, start), suffix = text.slice(end);
  return { prefix, suffix, original: text, leftBoundary: /[\p{L}\p{N}.,!?;:)\]}]$/u.test(prefix), rightBoundary: /^[\p{L}\p{N}]/u.test(suffix) }; 
}
export function applySnapshot(range, committed, tentative, limit = 20000) {
  const snapshot = committed + tentative;
  const left = range.leftBoundary && /^[\p{L}\p{N}]/u.test(snapshot) ? ' ' : '';
  const right = range.rightBoundary && snapshot && !/\s$/.test(snapshot) ? ' ' : '';
  const available = Math.max(0, limit - range.prefix.length - range.suffix.length - left.length - right.length);
  let inserted = snapshot.slice(0, available);
  if (/[\uD800-\uDBFF]$/.test(inserted)) inserted = inserted.slice(0, -1);
  if (snapshot && !inserted) return { text: range.original, clipped: true, caret: range.prefix.length };
  return { text: snapshot ? range.prefix + left + inserted + right + range.suffix : range.original, clipped: snapshot.length > available, caret: range.prefix.length + left.length + inserted.length };
}
export function browserCapability({ platform = '', userAgent = '', maxTouchPoints = 0, secure = false, hostname = '', audioWorklet = false, media = false }) {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return false;
  return /Mac/i.test(platform) && secure && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) && audioWorklet && media;
}
