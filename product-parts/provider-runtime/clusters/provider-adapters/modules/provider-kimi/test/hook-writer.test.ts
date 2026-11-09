// The guarded change of config.toml: the lock, the backup, the comparison right before the
// rename, `kimi doctor config` and the rollback. The session locks of Kimi are read here too.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ProviderError } from '#provider-registry';
import { changeConfig } from '../src/hook-writer.ts';
import type { ConfigChangeDeps } from '../src/hook-writer.ts';
import { holderAlive, liveSessionLocks, lockTime } from '../src/locks.ts';
import type { Liveness } from '../src/locks.ts';

const BOOT = Date.parse('2026-01-01T00:00:00Z');
const AFTER_BOOT = '2026-01-02T00:00:00.000Z';

interface Bench {
  dir: string;
  file: string;
  lock: string;
  alive: Set<number>;
  clock: { at: number };
  deps: ConfigChangeDeps;
  doctorCalls: number;
  refuse: string | null;
  names(): Promise<string[]>;
}

async function bench(run: (b: Bench) => Promise<void>, platform: NodeJS.Platform = process.platform): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfkw-'));
  const file = path.join(dir, 'home', 'config.toml');
  const alive = new Set<number>();
  const live: Liveness = { pidAlive: (pid) => alive.has(pid), bootTime: () => BOOT, hostname: () => 'this-host' };
  const clock = { at: Date.parse(AFTER_BOOT) };
  const b: Bench = {
    dir, file, lock: `${file}.wfk-lock`, alive, clock, doctorCalls: 0, refuse: null,
    deps: {
      file, platform, live,
      now: () => new Date((clock.at += 1000)),
      doctor: async () => {
        b.doctorCalls += 1;
        return b.refuse;
      },
    },
    names: async () => (await readdir(path.dirname(file))).sort(),
  };
  try {
    await run(b);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const refused = (code: string) => (error: unknown): boolean => error instanceof ProviderError && error.code === code && error.status === 409;

test('a change writes the file, keeps a backup with the mode of the config and drops its lock', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.file, 'old\n', { mode: 0o640 });
    const result = await changeConfig(b.deps, (current) => `${current}new\n`);
    assert.equal(await readFile(b.file, 'utf8'), 'old\nnew\n');
    assert.equal(result.written, true);
    assert.equal(await readFile(result.backup!, 'utf8'), 'old\n');
    assert.match(path.basename(result.backup!), /^config\.toml\.wfk-backup-\d{8}T\d{9}Z$/);
    assert.deepEqual(await b.names(), ['config.toml', path.basename(result.backup!)]);
    assert.equal(b.doctorCalls, 1);
    if (process.platform !== 'win32') {
      assert.equal((await stat(b.file)).mode & 0o777, 0o640);
      assert.equal((await stat(result.backup!)).mode & 0o777, 0o640);
    }
  });
});

test('the same text back writes nothing; a missing file is created without a backup', async () => {
  await bench(async (b) => {
    assert.deepEqual(await changeConfig(b.deps, (current) => current), { written: false, backup: null });
    assert.deepEqual(await b.names(), []);
    assert.deepEqual(await changeConfig(b.deps, () => 'kit\n'), { written: true, backup: null });
    assert.equal(await readFile(b.file, 'utf8'), 'kit\n');
    if (process.platform !== 'win32') assert.equal((await stat(b.file)).mode & 0o777, 0o600);
    assert.deepEqual(await b.names(), ['config.toml']);
  });
});

test('Windows: the file is written without changing modes', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.file, 'old\r\n');
    const result = await changeConfig(b.deps, () => 'new\r\n');
    assert.equal(await readFile(b.file, 'utf8'), 'new\r\n');
    assert.equal(await readFile(result.backup!, 'utf8'), 'old\r\n');
  }, 'win32');
});

test('a live lock refuses with hooks-busy; an abandoned one is taken over', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.file, 'old\n');
    b.alive.add(4242);
    await writeFile(b.lock, JSON.stringify({ pid: 4242, startedAt: AFTER_BOOT }));
    await assert.rejects(changeConfig(b.deps, () => 'new\n'), refused('hooks-busy'));
    assert.equal(await readFile(b.file, 'utf8'), 'old\n');
    assert.ok((await b.names()).includes('config.toml.wfk-lock'), 'the lock of the other operation stays');

    // The holder ended.
    b.alive.clear();
    await changeConfig(b.deps, () => 'one\n');
    // The pid is alive again, but the lock was written before the boot: another process has the pid now.
    b.alive.add(4242);
    await writeFile(b.lock, JSON.stringify({ pid: 4242, startedAt: '2025-12-31T00:00:00Z' }));
    await changeConfig(b.deps, () => 'two\n');
    assert.equal(await readFile(b.file, 'utf8'), 'two\n');
    assert.ok(!(await b.names()).includes('config.toml.wfk-lock'));
  });
});

test('a lock that cannot be read is busy while fresh and abandoned after 30 seconds', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.lock, '{ half');
    const written = new Date(b.clock.at);
    await utimes(b.lock, written, written);
    await assert.rejects(changeConfig(b.deps, () => 'new\n'), refused('hooks-busy'));
    b.clock.at += 40_000;
    await changeConfig(b.deps, () => 'new\n');
    assert.equal(await readFile(b.file, 'utf8'), 'new\n');
  });
});

test('a refusal of the builder leaves the file, makes no backup and drops the lock', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.file, 'old\n');
    await assert.rejects(changeConfig(b.deps, () => {
      throw new ProviderError('hooks-changed', 'changed', { status: 409 });
    }), refused('hooks-changed'));
    assert.deepEqual(await b.names(), ['config.toml']);
    assert.equal(b.doctorCalls, 0);
  });
});

test('a file changed right before the rename is not overwritten', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.file, 'old\n');
    b.deps.beforeRename = () => writeFile(b.file, 'edited by another program\n');
    await assert.rejects(changeConfig(b.deps, () => 'new\n'), refused('hooks-changed'));
    assert.equal(await readFile(b.file, 'utf8'), 'edited by another program\n');
    const names = await b.names();
    assert.equal(names.length, 2, `no temporary file and no lock stay: ${names.join(', ')}`);
    assert.equal(await readFile(path.join(path.dirname(b.file), names[1]!), 'utf8'), 'old\n');
    assert.equal(b.doctorCalls, 0);
  });
});

test('a file that appears right before the rename is not overwritten either', async () => {
  await bench(async (b) => {
    b.deps.beforeRename = () => writeFile(b.file, '');
    await assert.rejects(changeConfig(b.deps, () => 'new\n'), refused('hooks-changed'));
    assert.equal(await readFile(b.file, 'utf8'), '');
  });
});

test('kimi doctor refuses: the own write is rolled back, a later foreign edit is left alone', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.file, 'old\n', { mode: 0o600 });
    b.refuse = 'hooks[0].event: Invalid input';
    await assert.rejects(changeConfig(b.deps, () => 'new\n'), (error: unknown) => refused('hooks-invalid')(error) && /Invalid input.*прежний файл возвращён/.test((error as Error).message));
    assert.equal(await readFile(b.file, 'utf8'), 'old\n');
    assert.ok(!(await b.names()).some((name) => name.includes('wfk-tmp') || name.includes('wfk-lock')));

    // Another program edits the file between the write of Kit and the answer of the doctor.
    b.deps.doctor = async () => {
      await writeFile(b.file, 'new\nand more\n');
      return 'Invalid TOML';
    };
    const backups = (): Promise<string[]> => b.names().then((names) => names.filter((name) => name.includes('wfk-backup')));
    await assert.rejects(changeConfig(b.deps, () => 'new\n'), (error: unknown) => refused('hooks-invalid')(error) && (error as Error).message.includes('wfk-backup-'));
    assert.equal(await readFile(b.file, 'utf8'), 'new\nand more\n');
    assert.equal(await readFile(path.join(path.dirname(b.file), (await backups()).at(-1)!), 'utf8'), 'old\n');
  });
});

test('kimi doctor refuses a created file: the file is removed again', async () => {
  await bench(async (b) => {
    b.refuse = 'Invalid TOML';
    await assert.rejects(changeConfig(b.deps, () => 'new\n'), refused('hooks-invalid'));
    assert.deepEqual(await b.names(), []);
  });
});

test('the three latest backups are kept; bytes that are not UTF-8 are refused', async () => {
  await bench(async (b) => {
    await mkdir(path.dirname(b.file), { recursive: true });
    await writeFile(b.file, 'v0\n');
    for (let n = 1; n <= 5; n += 1) await changeConfig(b.deps, () => `v${n}\n`);
    const backups = (await b.names()).filter((name) => name.includes('wfk-backup'));
    assert.equal(backups.length, 3);
    assert.deepEqual(await Promise.all(backups.map((name) => readFile(path.join(path.dirname(b.file), name), 'utf8'))), ['v2\n', 'v3\n', 'v4\n']);

    await writeFile(b.file, Buffer.from([0x61, 0xff, 0xfe, 0x0a]));
    await assert.rejects(changeConfig(b.deps, () => 'x'), refused('hooks-unknown'));
    assert.deepEqual([...(await readFile(b.file))], [0x61, 0xff, 0xfe, 0x0a]);
  });
});

test('session locks of Kimi: another host or a running process after the boot is alive', async () => {
  await bench(async (b) => {
    const dir = path.join(b.dir, 'locks');
    const live = b.deps.live;
    assert.deepEqual(await liveSessionLocks(dir, live), [], 'no folder: no locks');
    await mkdir(dir, { recursive: true });
    b.alive.add(100);
    const lock = (id: string, data: unknown): Promise<void> => writeFile(path.join(dir, `${id}.lock`), typeof data === 'string' ? data : JSON.stringify(data));
    await lock('a-running', { version: 1, pid: 100, hostname: 'this-host', startedAt: Date.parse(AFTER_BOOT) });
    await lock('b-ended', { version: 1, pid: 200, hostname: 'this-host', startedAt: Date.parse(AFTER_BOOT) });
    await lock('c-before-boot', { version: 1, pid: 100, hostname: 'this-host', startedAt: BOOT - 60_000 });
    await lock('d-other-host', { version: 1, pid: 200, hostname: 'other', startedAt: 1 });
    await lock('e-half-written', '{ "pid": ');
    await writeFile(path.join(dir, 'notes.txt'), 'x');
    assert.deepEqual(await liveSessionLocks(dir, live), ['a-running', 'd-other-host', 'e-half-written']);

    assert.equal(lockTime('2026-01-02T00:00:00Z'), Date.parse(AFTER_BOOT));
    assert.equal(lockTime('soon'), null);
    assert.equal(holderAlive({ pid: 100, startedAt: 'soon' }, live), true, 'an unknown start time: the pid decides');
    assert.equal(holderAlive({ pid: '100', startedAt: AFTER_BOOT }, live), false);
  });
});
