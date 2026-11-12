// The vendored Harness Workflow Kit bundle: a gzip of the single-file workflow.mjs kept in the
// module's vendor/ folder, unpacked into the app data directory and verified by SHA-256.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { writeFileAtomic } from '#data-store';

/** Kit version of the vendored bundle. */
export const KIT_VERSION = '2.2.3';
/** SHA-256 of the unpacked bundle (see vendor/PROVENANCE). */
export const KIT_SHA256 = '8891de2ff127deae1819f132123ca12cbd98af77dec666c44209366ea925497e';
/** harness-ai commit the bundle was built from. */
export const KIT_SOURCE_COMMIT = '7afe27ad';

/** The gzip file shipped with the app. */
export function vendorBundleFile(): string {
  return fileURLToPath(new URL(`../vendor/workflow-kit-${KIT_VERSION}.mjs.gz`, import.meta.url));
}

/** Where the unpacked bundle lives inside the app data directory. */
export function unpackedBundleFile(appDir: string): string {
  return path.join(appDir, 'kit', `workflow-kit-${KIT_VERSION}.mjs`);
}

/** The bundle is missing, unreadable or its hash does not match. */
export class KitBundleError extends Error {
  readonly code = 'KIT_NO_BUNDLE';
  constructor(message: string) {
    super(message);
    this.name = 'KitBundleError';
  }
}

/** A verified bundle ready to run with node. */
export interface KitBundle {
  file: string;
  version: string;
  sha256: string;
}

export interface EnsureBundleOptions {
  appDir: string;
  /** Gzip source (default: the vendored file). */
  vendorFile?: string;
  /** Expected SHA-256 of the unpacked text (default: KIT_SHA256). */
  sha256?: string;
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function readOrNull(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

/**
 * Returns the unpacked bundle, writing it first when it is missing or differs from the expected
 * hash. A gzip that cannot be read or does not unpack to the expected hash is KIT_NO_BUNDLE.
 */
export async function ensureKitBundle(options: EnsureBundleOptions): Promise<KitBundle> {
  const expected = options.sha256 ?? KIT_SHA256;
  const target = unpackedBundleFile(options.appDir);
  const current = await readOrNull(target);
  if (current && sha256(current) === expected) return { file: target, version: KIT_VERSION, sha256: expected };

  const source = options.vendorFile ?? vendorBundleFile();
  const packed = await readOrNull(source);
  if (!packed) throw new KitBundleError(`Нет бандла Kit ${KIT_VERSION}: ${source}. Переустановите Workflow Kit.`);
  let text: Buffer;
  try {
    text = gunzipSync(packed);
  } catch {
    throw new KitBundleError(`Бандл Kit ${KIT_VERSION} повреждён (не распаковывается): ${source}.`);
  }
  if (sha256(text) !== expected) {
    throw new KitBundleError(`Бандл Kit ${KIT_VERSION} не совпадает с ожидаемым хешем: ${source}.`);
  }
  await writeFileAtomic(target, text.toString('utf8'), { mode: 0o644 });
  return { file: target, version: KIT_VERSION, sha256: expected };
}

/**
 * A lazy, memoized ensureKitBundle: the first call unpacks, later calls reuse the result.
 * A failure is not cached, so a repaired installation works without a restart.
 */
export function kitBundleProvider(options: EnsureBundleOptions): () => Promise<KitBundle> {
  let pending: Promise<KitBundle> | null = null;
  return () => {
    pending ??= ensureKitBundle(options).catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}
