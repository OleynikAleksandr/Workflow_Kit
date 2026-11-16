// The words the user really wrote to a session (spec M39 T005): the prompts the user typed in the
// agent's app and the messages typed in the panel. The autopilot checks the quote of a direct
// instruction against them; review, reminder, decider and other service messages never count.
// Kept in memory only; the run journal of the autopilot keeps what a run needs.
import type { UserWords } from './types.ts';

/** How many recent user texts a session keeps. */
export const USER_WORDS_KEPT = 5;

export interface UserWordsStore {
  record(key: string, words: UserWords): void;
  list(key: string): UserWords[];
  forget(key: string): void;
  /** The channel methods `userWords` and `noteUserWords` (a panel message given directly). */
  api(iso: () => string): { userWords(key: string): UserWords[]; noteUserWords(key: string, text: string): void };
}

export function createUserWords(limit = USER_WORDS_KEPT): UserWordsStore {
  const byKey = new Map<string, UserWords[]>();
  return {
    record(key, words) {
      if (!words.text.trim()) return;
      const list = byKey.get(key) ?? [];
      list.push(words);
      byKey.set(key, list.slice(-limit));
    },
    list: (key) => [...(byKey.get(key) ?? [])],
    forget: (key) => void byKey.delete(key),
    api(iso) {
      return {
        userWords: (key) => this.list(key),
        noteUserWords: (key, text) => this.record(key, { text, at: iso(), via: 'panel', turnId: null }),
      };
    },
  };
}
