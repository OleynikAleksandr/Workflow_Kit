#!/usr/bin/env node
// Entry point of the wfk command (owned by the cli module). It is plain JavaScript so that
// an old Node.js gets a clear message instead of a TypeScript syntax error.

const MIN_NODE_MAJOR = 24;
const major = Number(process.versions.node.split('.')[0]);

if (!(major >= MIN_NODE_MAJOR)) {
  process.stderr.write(`wfk: нужен Node.js ${MIN_NODE_MAJOR} или новее, сейчас ${process.version}\n`);
  process.exit(1);
}

const { main } = await import('#cli');
process.exitCode = await main(process.argv.slice(2));
