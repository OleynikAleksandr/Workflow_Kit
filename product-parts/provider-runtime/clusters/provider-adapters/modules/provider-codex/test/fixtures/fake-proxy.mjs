// Test relay for the real Windows proxyStream path; no Codex or user daemon is started.
import net from 'node:net';
const args = process.argv.slice(2);
if (args[0] !== 'app-server' || args[1] !== 'proxy' || args[2] !== '--sock' || !args[3]) process.exit(64);
const socket = net.connect(args[3]);
socket.on('error', () => process.exit(1));
socket.on('connect', () => process.stdin.pipe(socket));
socket.pipe(process.stdout);
socket.on('close', () => process.exit(0));
process.stdin.on('end', () => socket.end());
