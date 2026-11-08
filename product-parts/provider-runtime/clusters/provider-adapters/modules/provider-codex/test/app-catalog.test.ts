// The ChatGPT app catalog cleanup: a copy first, only the given threads, 5 copies kept.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { forgetInAppCatalog } from '../src/app-catalog.ts';
import { appCatalog } from './catalog-fixture.ts';

let tmp = '';
let home = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-catalog-'));
  home = path.join(tmp, '.codex');
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('forgetInAppCatalog copies the database first, removes only the given threads, keeps 5 copies; no rows — no write', async () => {
  const catalog = await appCatalog(home, ['t-a', 't-b']);
  const backupsDir = path.join(tmp, 'backups');
  for (let i = 0; i < 6; i += 1) await mkdir(path.join(backupsDir, `codex.db-2020010${i}T000000`), { recursive: true });
  const removed = await forgetInAppCatalog({ codexHome: home, backupsDir, now: new Date('2026-11-08T09:00:00Z'), threadIds: ['t-a'] });
  assert.equal(removed, 3);
  assert.deepEqual(catalog.rows(), ['t-b']);
  const copies = (await readdir(backupsDir)).sort();
  assert.equal(copies.length, 5);
  assert.equal(copies.at(-1), 'codex.db-20261108T090000');
  const { DatabaseSync } = await import('node:sqlite');
  const copy = new DatabaseSync(path.join(backupsDir, 'codex.db-20261108T090000', 'codex.db'), { readOnly: true });
  assert.equal((copy.prepare("SELECT count(*) AS n FROM local_thread_catalog WHERE thread_id = 't-a'").get() as { n: number }).n, 1, 'the copy is from before the write');
  copy.close();
  assert.equal(await forgetInAppCatalog({ codexHome: home, backupsDir, now: new Date('2026-11-08T10:00:00Z'), threadIds: ['t-a'] }), 0);
  assert.equal((await readdir(backupsDir)).length, 5, 'nothing to remove — no copy');
  assert.equal(await forgetInAppCatalog({ codexHome: path.join(home, 'none'), backupsDir, now: new Date(), threadIds: ['t-b'] }), 0);
});
