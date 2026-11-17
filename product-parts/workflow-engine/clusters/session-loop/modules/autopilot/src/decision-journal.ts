// The decision journal of a project (spec M40, contract section 4): one record per decision key
// in `.workflow-kit/local/decisions.json` (git-ignored, written only by the service, atomically).
// A record is `issued` before Kit is called and `applied` or `failed` after it, so a double press,
// a repeated command and a lost answer never make a second decision: one key has one decisionId.
import path from 'node:path';
import { createKeyedMutex, readJsonFile, writeJsonAtomic } from '#data-store';
import type { KitDecisionKind } from '#plan-view';

export const DECISIONS_FILE = '.workflow-kit/local/decisions.json';
/** Records a project keeps; older ones are dropped. */
export const DECISIONS_KEPT = 200;

/** Who decided, as Kit records it (`DecisionSource` of the plan history). */
export interface DecisionSourceRecord {
  kind: 'button' | 'grant' | 'message';
  messageId: string | null;
  runId: string | null;
  session: string | null;
}

export interface DecisionRecord {
  /** sha256 of the project, kind, target, input digest and source id. */
  key: string;
  decisionId: string;
  kind: KitDecisionKind;
  scopeId: string | null;
  taskId: string | null;
  inputDigest: string;
  /** `message:<id>`, `button:<request id>` or `grant:<run id>`. */
  sourceId: string;
  source: DecisionSourceRecord;
  note: string;
  /** The Kit command of the decision without the host flags. */
  args: string[];
  state: 'issued' | 'applied' | 'failed';
  /** The Kit result of an applied decision, or the refusal of a failed one. */
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  at: string;
  updatedAt: string;
}

export interface DecisionJournal {
  list(root: string): Promise<DecisionRecord[]>;
  /** Adds the record or replaces the one with the same key. */
  put(root: string, record: DecisionRecord): Promise<DecisionRecord>;
}

function valid(value: unknown): value is DecisionRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['key'] === 'string' && typeof v['decisionId'] === 'string' && typeof v['kind'] === 'string' && typeof v['state'] === 'string' && typeof v['sourceId'] === 'string' && Array.isArray(v['args']);
}

export function createDecisionJournal(options: { now?: () => Date; platform?: NodeJS.Platform } = {}): DecisionJournal {
  const now = options.now ?? (() => new Date());
  const mutex = createKeyedMutex();
  const writeOptions = { mode: 0o600, dirMode: 0o700, ...(options.platform ? { platform: options.platform } : {}) };
  const file = (root: string): string => path.join(root, ...DECISIONS_FILE.split('/'));

  async function list(root: string): Promise<DecisionRecord[]> {
    const value = await readJsonFile(file(root)).catch(() => undefined);
    const records = value && typeof value === 'object' ? (value as { records?: unknown }).records : null;
    return Array.isArray(records) ? records.filter(valid) : [];
  }

  return {
    list,
    put(root, record) {
      return mutex.run(root, async () => {
        const stored = { ...record, updatedAt: now().toISOString() };
        const records = [...(await list(root)).filter((item) => item.key !== record.key), stored].slice(-DECISIONS_KEPT);
        await writeJsonAtomic(file(root), { version: 1, records }, writeOptions);
        return stored;
      });
    },
  };
}
