// Minimal WebSocket client (RFC 6455) over a unix socket, without dependencies: the Codex daemon
// listens on ~/.codex/app-server-control/app-server-control.sock. Node's built-in WebSocket cannot
// dial a unix socket, so the handshake and the frames are done here on top of node:net.
import { createHash, randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import type { RpcTransport } from './rpc.ts';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Largest frame accepted from the server (protects the service from a runaway peer). */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

export const OPCODE = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 } as const;

/** Encodes one final frame; clients must mask (mask is injectable for tests, null = unmasked server frame). */
export function encodeFrame(opcode: number, payload: Buffer, mask: Buffer | null = randomBytes(4)): Buffer {
  const length = payload.length;
  const head: number[] = [0x80 | opcode];
  const maskBit = mask ? 0x80 : 0;
  let extended = Buffer.alloc(0);
  if (length < 126) head.push(maskBit | length);
  else if (length < 65536) {
    head.push(maskBit | 126);
    extended = Buffer.alloc(2);
    extended.writeUInt16BE(length);
  } else {
    head.push(maskBit | 127);
    extended = Buffer.alloc(8);
    extended.writeBigUInt64BE(BigInt(length));
  }
  const body = Buffer.from(payload);
  if (mask) for (let i = 0; i < body.length; i += 1) body[i] = body[i]! ^ mask[i % 4]!;
  return Buffer.concat([Buffer.from(head), extended, mask ?? Buffer.alloc(0), body]);
}

/** A decoded frame. */
export interface Frame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
}

/** Incremental frame decoder: push bytes, get complete frames (masked or not). */
export function createFrameDecoder(maxBytes = MAX_FRAME_BYTES): (chunk: Buffer) => Frame[] {
  let buffer: Buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    const frames: Frame[] = [];
    for (;;) {
      if (buffer.length < 2) break;
      const fin = (buffer[0]! & 0x80) !== 0;
      const opcode = buffer[0]! & 0x0f;
      const masked = (buffer[1]! & 0x80) !== 0;
      let length = buffer[1]! & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) break;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) break;
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(maxBytes)) throw new Error('WebSocket frame too large');
        length = Number(big);
        offset = 10;
      }
      if (length > maxBytes) throw new Error('WebSocket frame too large');
      const maskBytes = masked ? 4 : 0;
      if (buffer.length < offset + maskBytes + length) break;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      const payload = Buffer.from(buffer.subarray(offset + maskBytes, offset + maskBytes + length));
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] = payload[i]! ^ mask[i % 4]!;
      frames.push({ fin, opcode, payload });
      buffer = buffer.subarray(offset + maskBytes + length);
    }
    return frames;
  };
}

/** Sec-WebSocket-Accept for a key. */
export function acceptKey(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64');
}

/**
 * Connects to a WebSocket server listening on a unix socket and returns a JSON message
 * transport (text frames carry one JSON-RPC message each). Rejects on refusal or timeout.
 */
export function connectUnixWebSocket(socketPath: string, options: { timeoutMs?: number } = {}): Promise<RpcTransport> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath });
    const key = randomBytes(16).toString('base64');
    let handshake = Buffer.alloc(0);
    let open = false;
    let messageHandler: (message: unknown) => void = () => undefined;
    let closeHandler: (error?: Error) => void = () => undefined;
    let closedOnce = false;
    const decode = createFrameDecoder();
    let fragments: Buffer[] = [];
    const timer = setTimeout(() => fail(new Error('the Codex daemon did not answer the WebSocket handshake in time')), options.timeoutMs ?? 5000);

    const finishClose = (error?: Error): void => {
      if (closedOnce) return;
      closedOnce = true;
      closeHandler(error);
    };
    function fail(error: Error): void {
      clearTimeout(timer);
      socket.destroy();
      if (!open) reject(error);
      else finishClose(error);
    }
    const send = (opcode: number, payload: Buffer): void => {
      if (!socket.destroyed) socket.write(encodeFrame(opcode, payload));
    };
    const onFrames = (chunk: Buffer): void => {
      let frames: Frame[];
      try {
        frames = decode(chunk);
      } catch (error) {
        fail(error as Error);
        return;
      }
      for (const frame of frames) {
        if (frame.opcode === OPCODE.ping) send(OPCODE.pong, frame.payload);
        else if (frame.opcode === OPCODE.close) {
          send(OPCODE.close, Buffer.alloc(0));
          socket.end();
        } else if (frame.opcode === OPCODE.text || frame.opcode === OPCODE.continuation) {
          fragments.push(frame.payload);
          if (!frame.fin) continue;
          const text = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          try {
            messageHandler(JSON.parse(text));
          } catch {
            // Not JSON: ignored.
          }
        }
      }
    };

    socket.on('connect', () => {
      socket.write(
        'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.on('data', (chunk: Buffer) => {
      if (open) {
        onFrames(chunk);
        return;
      }
      handshake = Buffer.concat([handshake, chunk]);
      const end = handshake.indexOf('\r\n\r\n');
      if (end < 0) {
        if (handshake.length > 64 * 1024) fail(new Error('the Codex daemon sent an oversized handshake'));
        return;
      }
      const head = handshake.subarray(0, end).toString('latin1');
      const status = /^HTTP\/1\.1 101\b/.test(head);
      const accept = /^sec-websocket-accept:\s*(\S+)\s*$/im.exec(head)?.[1];
      if (!status || accept !== acceptKey(key)) {
        fail(new Error(`the Codex daemon refused the WebSocket connection (${head.split('\r\n')[0] ?? 'no status'})`));
        return;
      }
      open = true;
      clearTimeout(timer);
      const rest = handshake.subarray(end + 4);
      resolve({
        send: (message) => send(OPCODE.text, Buffer.from(JSON.stringify(message), 'utf8')),
        onMessage: (handler) => {
          messageHandler = handler;
        },
        onClose: (handler) => {
          closeHandler = handler;
        },
        close: () => {
          send(OPCODE.close, Buffer.alloc(0));
          socket.end();
          setTimeout(() => socket.destroy(), 200).unref();
        },
      });
      if (rest.length > 0) setImmediate(() => onFrames(rest));
    });
    socket.on('error', (error) => fail(error));
    socket.on('close', () => {
      clearTimeout(timer);
      if (!open) reject(new Error('the Codex daemon closed the connection'));
      else finishClose();
    });
  });
}
