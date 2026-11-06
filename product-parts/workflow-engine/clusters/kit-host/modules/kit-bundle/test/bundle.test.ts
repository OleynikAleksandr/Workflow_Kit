import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  KIT_SHA256,
  KIT_VERSION,
  KitBundleError,
  ensureKitBundle,
  kitBundleProvider,
  unpackedBundleFile,
  vendorBundleFile,
} from '../src/index.ts';

let tmp = '';
let counter = 0;
const appDir = (): string => path.join(tmp, `app${++counter}`);
const sha = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-kit-bundle-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('the vendored bundle unpacks to the provenance hash', async () => {
  const dir = appDir();
  const bundle = await ensureKitBundle({ appDir: dir });
  assert.equal(bundle.file, unpackedBundleFile(dir));
  assert.equal(bundle.version, KIT_VERSION);
  assert.equal(sha(await readFile(bundle.file)), KIT_SHA256);
  const provenance = await readFile(path.join(path.dirname(vendorBundleFile()), 'PROVENANCE'), 'utf8');
  assert.match(provenance, new RegExp(KIT_SHA256));
  assert.match(provenance, /e4226208/);
});

test('a verified bundle is reused, a damaged one is rewritten', async () => {
  const dir = appDir();
  const first = await ensureKitBundle({ appDir: dir });
  const before = (await stat(first.file)).mtimeMs;
  await ensureKitBundle({ appDir: dir });
  assert.equal((await stat(first.file)).mtimeMs, before);
  await writeFile(first.file, 'damaged');
  await ensureKitBundle({ appDir: dir });
  assert.equal(sha(await readFile(first.file)), KIT_SHA256);
});

test('a missing, broken or foreign gzip is KIT_NO_BUNDLE', async () => {
  const missing = path.join(tmp, 'missing.gz');
  await assert.rejects(ensureKitBundle({ appDir: appDir(), vendorFile: missing }), (error: unknown) => {
    assert.ok(error instanceof KitBundleError);
    assert.equal(error.code, 'KIT_NO_BUNDLE');
    return true;
  });
  const broken = path.join(tmp, 'broken.gz');
  await writeFile(broken, 'not gzip');
  await assert.rejects(ensureKitBundle({ appDir: appDir(), vendorFile: broken }), { code: 'KIT_NO_BUNDLE' });
  const foreign = path.join(tmp, 'foreign.gz');
  await writeFile(foreign, gzipSync('console.log(1)'));
  await assert.rejects(ensureKitBundle({ appDir: appDir(), vendorFile: foreign }), { code: 'KIT_NO_BUNDLE' });
  const ok = await ensureKitBundle({ appDir: appDir(), vendorFile: foreign, sha256: sha('console.log(1)') });
  assert.equal(await readFile(ok.file, 'utf8'), 'console.log(1)');
});

test('the provider memoizes success and retries after a failure', async () => {
  const dir = appDir();
  const vendorFile = path.join(tmp, 'late.gz');
  const get = kitBundleProvider({ appDir: dir, vendorFile, sha256: sha('x') });
  await assert.rejects(get(), { code: 'KIT_NO_BUNDLE' });
  await writeFile(vendorFile, gzipSync('x'));
  const first = get();
  assert.equal(get(), first);
  assert.equal((await first).file, unpackedBundleFile(dir));
});
