// Unix expect bridge: pure screen/control logic is shared with ConPTY. No terminal input here.
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { InterruptControl, REQUEST_SUFFIX, RESULT_SUFFIX, STATE_SUFFIX } from './interrupt-control.ts';
import { ParameterHost } from './parameter-files.ts';
import type { NativeAction } from './parameter-protocol.ts';
import type { HostRequest } from './interrupt-control.ts';

const debug = process.argv[2]!;
let escape = false;
const control = new InterruptControl(randomUUID(), () => Date.now(), () => { escape = true; return true; });
const put = (suffix: string, value: unknown): void => {
  const file = debug + suffix;
  writeFileSync(file + '.partial', JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  renameSync(file + '.partial', file);
};
const hostId = process.argv[3];
const parameters = hostId ? new ParameterHost(debug, hostId, process.argv[4]!, control.screen, {
  async read(file) { try { return readFileSync(file, 'utf8'); } catch { return null; } },
  async take(file) { try { const raw = readFileSync(file, 'utf8'); unlinkSync(file); return raw; } catch { return null; } },
  async put(file, value) { writeFileSync(file + '.partial', JSON.stringify(value), { encoding: 'utf8', mode: 0o600 }); renameSync(file + '.partial', file); },
}, Date.now) : null;
let action: NativeAction | null = null;
let chain = Promise.resolve();
process.stdout.on('error', () => process.exit(1));
createInterface({ input: process.stdin }).on('line', (line) => { chain = chain.then(async () => {
  try {
    if (line.startsWith('DATA ')) { control.feed(Buffer.from(line.slice(5), 'hex').toString('utf8')); parameters?.observe(); }
    else if (line === 'USER_INPUT') parameters?.userInput();
    else if (line === 'COMMIT') {
      if (action) parameters?.write(action, text => { process.stdout.write(`WRITE ${Buffer.from(text).toString('hex')}\n`); return true; });
      action = null;
    }
    else if (line === 'CANCEL') {
      const result = control.cancel();
      if (result) put(RESULT_SUFFIX, result);
    } else if (line === 'POLL') {
      if (parameters && existsSync(debug + REQUEST_SUFFIX)) parameters.engine.cancel();
      const legacy = ['.text', '.message', '.rename'].some(suffix => existsSync(debug + suffix));
      if (legacy) parameters?.userInput();
      action = await parameters?.poll(!legacy) ?? null;
      if (action) process.stdout.write('PARAM\n');
      if (parameters?.busy) { process.stdout.write('BUSY\nDONE\n'); return; }
      let request: HostRequest | null = null;
      try { request = JSON.parse(readFileSync(debug + REQUEST_SUFFIX, 'utf8')) as HostRequest; unlinkSync(debug + REQUEST_SUFFIX); } catch { /* absent/malformed: no key */ }
      if (request) { const result = control.request(request); if (result) put(RESULT_SUFFIX, result); }
      const result = control.poll();
      if (result) put(RESULT_SUFFIX, result);
      put(STATE_SUFFIX, control.snapshot());
    }
    if (escape) { escape = false; process.stdout.write('ESC\n'); }
    process.stdout.write('DONE\n');
  } catch { process.stdout.write('FAILED\nDONE\n'); }
}); }).on('close', () => { void chain.finally(() => process.exit(0)); });
