// Journal of answer attempts (spec M33 section 2.1): survives a restart of the service, so an answer
// is handed to a provider at most once per question. Records hold ids and states, never texts.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { writeJsonAtomic } from '#data-store';
import type { DataDirs } from '#data-store';

/** sent: handed out, outcome unknown (protective, never pruned); done: the outcome is known. */
export type AttemptState = 'sent' | 'done';
/** Known outcome of a done record: the panel's answer won, delivered without a winner, or the question closed otherwise. */
export type AttemptOutcome = 'accepted' | 'unknown' | 'stale' | 'closed';

export interface AttemptRecord {
  key: string;
  attemptId: string;
  state: AttemptState;
  outcome?: AttemptOutcome;
  /** Epoch ms of the last change. */
  at: number;
}

/** Done records older than this are pruned. */
export const ATTEMPTS_DONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Done records kept at most; also the most sent records before new answers are refused. */
export const ATTEMPTS_MAX = 500;
export const QUESTION_JOURNAL_FULL_REASON = 'Слишком много ответов без подтверждения. Ответьте в приложении провайдера';

/** The journal file: <state>/question-attempts.json. */
export function questionAttemptsFile(dirs: Pick<DataDirs, 'stateDir'>, platform: NodeJS.Platform = process.platform): string {
  return (platform === 'win32' ? path.win32 : path.posix).join(dirs.stateDir, 'question-attempts.json');
}

/** Key of a question: sha256 of provider, project, session and question id. */
export function questionKey(provider: string, project: string, session: string, question: string): string {
  return createHash('sha256').update([provider, project, session, question].join('\n')).digest('hex');
}

function validRecord(value: unknown): value is AttemptRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r['key'] === 'string' && /^[a-f0-9]{64}$/.test(r['key']) && typeof r['attemptId'] === 'string' && r['attemptId'].length <= 64
    && (r['state'] === 'sent' || r['state'] === 'done') && typeof r['at'] === 'number' && Number.isFinite(r['at']);
}

/** Records of a journal file; a missing or broken file has none (a broken file is reported to the caller by load). */
export async function readQuestionAttempts(file: string): Promise<AttemptRecord[]> {
  let text: string;
  try { text = await readFile(file, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const parsed = JSON.parse(text) as unknown;
  const list = typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { records?: unknown }).records) ? (parsed as { records: unknown[] }).records : [];
  return list.filter(validRecord);
}

export interface QuestionAttempts {
  /** Loads the file once; later calls resolve at once. */
  ready(): Promise<void>;
  /** Record of a question (after ready). */
  find(key: string): AttemptRecord | undefined;
  /** Number of sent records. */
  sentCount(): number;
  /** Writes a sent record to disk; rejects when the write fails (nothing may be handed out then). */
  begin(key: string, attemptId: string): Promise<void>;
  /** Marks a record done with its outcome. */
  finish(key: string, outcome: AttemptOutcome): Promise<void>;
}

export interface QuestionAttemptsOptions {
  /** Null keeps the journal in memory (tests of other modules). */
  file: string | null;
  platform?: NodeJS.Platform;
  now?: () => number;
  write?: (file: string, value: unknown) => Promise<void>;
  read?: (file: string) => Promise<AttemptRecord[]>;
}

/** Creates the journal. Writes are serialized; a sent record is never pruned. */
export function createQuestionAttempts(options: QuestionAttemptsOptions): QuestionAttempts {
  const now = options.now ?? Date.now;
  const write = options.write ?? ((file: string, value: unknown) => writeJsonAtomic(file, value, { platform: options.platform ?? process.platform }));
  const read = options.read ?? readQuestionAttempts;
  const records = new Map<string, AttemptRecord>();
  let loading: Promise<void> | null = null;
  let chain: Promise<void> = Promise.resolve();

  const prune = (): void => {
    const done = [...records.values()].filter((r) => r.state === 'done').sort((a, b) => a.at - b.at);
    const limit = now() - ATTEMPTS_DONE_TTL_MS;
    for (const [index, r] of done.entries()) if (r.at < limit || done.length - index > ATTEMPTS_MAX) records.delete(r.key);
  };
  const persist = (): Promise<void> => {
    const file = options.file;
    const next = chain.then(async () => {
      prune();
      if (file) await write(file, { version: 1, records: [...records.values()] });
    });
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    ready() {
      loading ??= (async () => {
        if (!options.file) return;
        for (const r of await read(options.file)) records.set(r.key, r);
      })();
      return loading;
    },
    find: (key) => records.get(key),
    sentCount: () => [...records.values()].filter((r) => r.state === 'sent').length,
    async begin(key, attemptId) {
      const previous = records.get(key);
      records.set(key, { key, attemptId, state: 'sent', at: now() });
      try { await persist(); } catch (error) {
        if (previous) records.set(key, previous); else records.delete(key);
        throw error;
      }
    },
    async finish(key, outcome) {
      const r = records.get(key);
      if (!r || r.state === 'done') return;
      records.set(key, { ...r, state: 'done', outcome, at: now() });
      await persist();
    },
  };
}
