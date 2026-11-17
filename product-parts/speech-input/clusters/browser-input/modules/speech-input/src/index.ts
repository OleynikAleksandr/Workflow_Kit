import { fileURLToPath } from 'node:url';
/** Public backend mount. Browser callers load /speech-input/dictation.js. */
export function speechInputMount(): { prefix: string; dir: string } {
  return { prefix: '/speech-input/', dir: fileURLToPath(new URL('.', import.meta.url)) };
}
