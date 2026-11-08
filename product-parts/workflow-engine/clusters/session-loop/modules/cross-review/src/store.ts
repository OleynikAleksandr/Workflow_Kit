// Reviews in the project folder: .workflow-kit/local/reviews/<client>.<session id>.json, one per
// main session (spec M4 section 6). They survive a restart of the service.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '#data-store';
import type { ReviewProvider } from './texts.ts';

export const REVIEWS_DIR = '.workflow-kit/local/reviews';

export type ReviewStatus = 'starting' | 'reviewing' | 'answering' | 'agreed' | 'disagreed' | 'failed' | 'cancelled';

export interface ReviewEntry {
  from: 'reviewer' | 'main' | 'kit';
  round: number;
  text: string;
  at: string;
}

export interface Review {
  projectId: string;
  scopeId: string | null;
  mainKey: string;
  mainTitle: string;
  mainProvider: ReviewProvider;
  reviewerProvider: ReviewProvider;
  /** Channel key of the reviewer once known. */
  reviewerKey: string | null;
  /** What createSession returned: Claude knows its hook id only later. */
  reviewerRef: { localId: string | null; remoteId: string | null } | null;
  reviewerTitle: string;
  status: ReviewStatus;
  round: number;
  maxRounds: number;
  generation: number;
  /** The last reviewer answer carried REVIEW: APPROVED. */
  approved: boolean;
  reason: string | null;
  entries: ReviewEntry[];
  createdAt: string;
  updatedAt: string;
}

export const FINISHED: ReadonlySet<ReviewStatus> = new Set(['agreed', 'disagreed', 'failed', 'cancelled']);

const KEY = /^(claude|codex):([A-Za-z0-9._-]{1,200})$/;

export function reviewFile(projectPath: string, mainKey: string): string | null {
  const match = KEY.exec(mainKey);
  return match ? path.join(projectPath, REVIEWS_DIR, `${match[1]}.${match[2]}.json`) : null;
}

export async function saveReview(projectPath: string, review: Review): Promise<void> {
  const file = reviewFile(projectPath, review.mainKey);
  if (file) await writeJsonAtomic(file, review);
}

/** Reviews of one project; broken files are skipped. */
export async function readReviews(projectPath: string): Promise<Review[]> {
  let names: string[] = [];
  try {
    names = await readdir(path.join(projectPath, REVIEWS_DIR));
  } catch {
    return [];
  }
  const result: Review[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const value = (await readJsonFile(path.join(projectPath, REVIEWS_DIR, name))) as Review | undefined;
      if (value && typeof value.mainKey === 'string' && Array.isArray(value.entries)) result.push(value);
    } catch {
      // A broken file is no review.
    }
  }
  return result;
}
