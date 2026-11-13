// Unix expect bridge: pure screen/control logic is shared with ConPTY. No terminal input here.
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { InterruptControl, REQUEST_SUFFIX, RESULT_SUFFIX, STATE_SUFFIX } from './interrupt-control.ts';
import type { HostRequest } from './interrupt-control.ts';

const debug = process.argv[2]!;
let escape = false;
const control = new InterruptControl(randomUUID(), () => Date.now(), () => { escape = true; return true; });
const put = (suffix: string, value: unknown): void => {
  const file = debug + suffix;
  writeFileSync(file + '.partial', JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  renameSync(file + '.partial', file);
};
process.stdout.on('error', () => process.exit(1));
createInterface({ input: process.stdin }).on('line', (line) => {
  try {
    if (line.startsWith('DATA ')) control.feed(Buffer.from(line.slice(5), 'hex').toString('utf8'));
    else if (line === 'CANCEL') {
      const result = control.cancel();
      if (result) put(RESULT_SUFFIX, result);
    } else if (line === 'POLL') {
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
}).on('close', () => process.exit(0));
