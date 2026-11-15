// Minimal WebSocket client (RFC 6455) over a byte stream, without dependencies: the Codex daemon
// listens on ~/.codex/app-server-control/app-server-control.sock. Node's built-in WebSocket cannot
// dial a unix socket, so the handshake and the frames are done here on top of node:net. On Windows
// node:net cannot reach an AF_UNIX socket, so the same client runs over the stdio of
// `codex app-server proxy` (proxy.ts, spec M5 section 5).
//
// Limits (spec M32 section 2.3): one frame and one assembled message are at most 16 MiB each. Both
// are checked on the frame header, before its payload is buffered; incoming bytes are queued as
// chunks and every byte is copied once, so a large message does not cost quadratic copying.
import { createHash, randomBytes } from 'node:crypto';
import { connect } from 'node:net';
import { TransportError } from './rpc.ts';
import type { RpcTransport } from './rpc.ts';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Largest frame accepted from the server (protects the service from a runaway peer). */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;
/** Largest message assembled from fragments. */
export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

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

/** A frame header, seen before its payload is buffered. */
export interface FrameHeader {
  fin: boolean;
  opcode: number;
  length: number;
}

/**
 * Incremental frame decoder: push bytes, get complete frames (masked or not). A frame above
 * maxBytes throws TransportError frame-too-large; onHeader may throw to refuse a frame by its
 * header. After a throw the decoder holds no bytes and must not be used again.
 */
export function createFrameDecoder(maxBytes = MAX_FRAME_BYTES, onHeader?: (header: FrameHeader) => void): (chunk: Buffer) => Frame[] {
  let queue: Buffer[] = [];
  let queued = 0;
  let pending: { fin: boolean; opcode: number; mask: Buffer | null; length: number } | null = null;

  /** Copies the first n queued bytes into a new buffer without consuming them (n is at most 14). */
  const peek = (n: number): Buffer => {
    if (queue[0]!.length >= n) return queue[0]!;
    const out = Buffer.alloc(n);
    let at = 0;
    for (const chunk of queue) {
      const count = Math.min(chunk.length, n - at);
      chunk.copy(out, at, 0, count);
      at += count;
      if (at === n) break;
    }
    return out;
  };
  /** Consumes n queued bytes; a single chunk is sliced, bytes across chunks are copied once. */
  const take = (n: number): Buffer => {
    queued -= n;
    if (queue[0]!.length >= n) {
      const head = queue[0]!;
      const part = head.subarray(0, n);
      if (head.length === n) queue.shift();
      else queue[0] = head.subarray(n);
      return part;
    }
    const out = Buffer.alloc(n);
    let at = 0;
    while (at < n) {
      const chunk = queue[0]!;
      const count = Math.min(chunk.length, n - at);
      chunk.copy(out, at, 0, count);
      at += count;
      if (count === chunk.length) queue.shift();
      else queue[0] = chunk.subarray(count);
    }
    return out;
  };
  const refuse = (error: unknown): never => {
    queue = [];
    queued = 0;
    pending = null;
    throw error;
  };

  return (chunk) => {
    if (chunk.length > 0) {
      queue.push(chunk);
      queued += chunk.length;
    }
    const frames: Frame[] = [];
    for (;;) {
      if (!pending) {
        if (queued < 2) break;
        const first = peek(2);
        const masked = (first[1]! & 0x80) !== 0;
        const short = first[1]! & 0x7f;
        const lengthBytes = short === 126 ? 2 : short === 127 ? 8 : 0;
        const headLength = 2 + lengthBytes + (masked ? 4 : 0);
        if (queued < headLength) break;
        const head = peek(headLength);
        let length = short;
        if (short === 126) length = head.readUInt16BE(2);
        else if (short === 127) {
          const big = head.readBigUInt64BE(2);
          if (big > BigInt(maxBytes)) refuse(new TransportError('frame-too-large', `WebSocket frame too large: ${big} bytes > ${maxBytes}`, { size: Number(big), limit: maxBytes }));
          length = Number(big);
        }
        if (length > maxBytes) refuse(new TransportError('frame-too-large', `WebSocket frame too large: ${length} bytes > ${maxBytes}`, { size: length, limit: maxBytes }));
        const header = { fin: (head[0]! & 0x80) !== 0, opcode: head[0]! & 0x0f, length };
        try {
          onHeader?.(header);
        } catch (error) {
          refuse(error);
        }
        const mask = masked ? Buffer.from(head.subarray(2 + lengthBytes, headLength)) : null;
        take(headLength);
        pending = { ...header, mask };
      }
      if (queued < pending.length) break;
      const raw = pending.length === 0 ? Buffer.alloc(0) : take(pending.length);
      let payload = raw;
      if (pending.mask) {
        payload = Buffer.from(raw);
        for (let i = 0; i < payload.length; i += 1) payload[i] = payload[i]! ^ pending.mask[i % 4]!;
      }
      frames.push({ fin: pending.fin, opcode: pending.opcode, payload });
      pending = null;
    }
    return frames;
  };
}

/** Sec-WebSocket-Accept for a key. */
export function acceptKey(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64');
}

/** A byte stream the WebSocket client runs on: a unix socket or the stdio of a proxy process. */
export interface ByteStream {
  readonly destroyed: boolean;
  write(data: string | Buffer): void;
  end(): void;
  destroy(): void;
  onReady(listener: () => void): void;
  onData(listener: (chunk: Buffer) => void): void;
  onError(listener: (error: Error) => void): void;
  onClose(listener: () => void): void;
  /** Why the stream ended, without secrets (the Windows proxy: exit code and stderr); null when unknown. */
  describeClose?(): string | null;
}

/** A unix socket as a ByteStream. */
export function socketStream(socketPath: string): ByteStream {
  const socket = connect({ path: socketPath });
  return {
    get destroyed() {
      return socket.destroyed;
    },
    write: (data) => void socket.write(data),
    end: () => void socket.end(),
    destroy: () => void socket.destroy(),
    onReady: (listener) => void socket.on('connect', listener),
    onData: (listener) => void socket.on('data', listener),
    onError: (listener) => void socket.on('error', listener),
    onClose: (listener) => void socket.on('close', () => listener()),
  };
}

/** Options of a WebSocket connection; the limits are injectable for tests. */
export interface WebSocketOptions {
  timeoutMs?: number;
  maxFrameBytes?: number;
  maxMessageBytes?: number;
}

/** Connects to a WebSocket server listening on a unix socket (see connectWebSocket). */
export function connectUnixWebSocket(socketPath: string, options: WebSocketOptions = {}): Promise<RpcTransport> {
  return connectWebSocket(socketStream(socketPath), options);
}

const fatalUtf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Runs the WebSocket handshake over a byte stream and returns a JSON message transport (text
 * frames carry one JSON-RPC message each). Rejects on refusal or timeout. Once open, a failure
 * closes the transport with a TransportError: frame-too-large, message-too-large, malformed-json,
 * protocol-error or connection-lost (the errno is kept); a close the client asked for or a
 * close frame of the server closes it without an error.
 */
export function connectWebSocket(socket: ByteStream, options: WebSocketOptions = {}): Promise<RpcTransport> {
  const maxMessage = options.maxMessageBytes ?? MAX_MESSAGE_BYTES;
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64');
    let handshake = Buffer.alloc(0);
    let open = false;
    let closing = false;
    let dead = false;
    let messageHandler: (message: unknown, bytes?: number) => void = () => undefined;
    let closeHandler: (error?: Error) => void = () => undefined;
    let closedOnce = false;
    // The decoder sees every header before its frame is delivered, so the headers keep their own
    // view of the message in progress (kind and declared bytes) for the protocol and size checks.
    let headerKind: 'text' | 'binary' | null = null;
    let headerBytes = 0;
    // The message being assembled from delivered frames (binary messages are dropped).
    let current: 'text' | 'binary' | null = null;
    let fragments: Buffer[] = [];
    let fragmentBytes = 0;
    // Bytes that came with the handshake answer wait until the caller attached its handlers; every
    // chunk received meanwhile queues behind them, so frames are decoded in the order they arrived.
    let backlog: Buffer[] | null = null;
    const protocolError = (message: string): TransportError => new TransportError('protocol-error', `WebSocket protocol error: ${message}`);
    const checkHeader = ({ fin, opcode, length }: FrameHeader): void => {
      if (opcode >= 8) {
        if (opcode > OPCODE.pong) throw protocolError(`reserved opcode ${opcode}`);
        if (!fin || length > 125) throw protocolError('fragmented or long control frame');
        return;
      }
      if (opcode > OPCODE.binary) throw protocolError(`reserved opcode ${opcode}`);
      if (opcode === OPCODE.continuation && !headerKind) throw protocolError('continuation without a message');
      if (opcode !== OPCODE.continuation && headerKind) throw protocolError('new message inside a fragmented one');
      if (opcode !== OPCODE.continuation) [headerKind, headerBytes] = [opcode === OPCODE.text ? 'text' : 'binary', 0];
      if (headerBytes + length > maxMessage) {
        throw new TransportError('message-too-large', `WebSocket message too large: ${headerBytes + length} bytes > ${maxMessage}`, { size: headerBytes + length, limit: maxMessage });
      }
      headerBytes += length;
      if (fin) [headerKind, headerBytes] = [null, 0];
    };
    const decode = createFrameDecoder(options.maxFrameBytes ?? MAX_FRAME_BYTES, checkHeader);
    const timer = setTimeout(() => fail(new TransportError('connection-lost', 'the Codex daemon did not answer the WebSocket handshake in time', { errno: 'ETIMEDOUT' })), options.timeoutMs ?? 5000);

    const release = (): void => {
      fragments = [];
      fragmentBytes = 0;
      current = null;
      handshake = Buffer.alloc(0);
    };
    const failed = (): void => {
      release();
      headerKind = null;
      headerBytes = 0;
    };
    const finishClose = (error?: Error): void => {
      if (closedOnce) return;
      closedOnce = true;
      release();
      closeHandler(error);
    };
    function fail(error: Error): void {
      clearTimeout(timer);
      dead = true;
      failed();
      socket.destroy();
      if (!open) reject(error);
      else finishClose(error);
    }
    const send = (opcode: number, payload: Buffer): void => {
      if (!socket.destroyed) socket.write(encodeFrame(opcode, payload));
    };
    const onFrames = (chunk: Buffer): void => {
      if (dead) return;
      let frames: Frame[];
      try {
        frames = decode(chunk);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      for (const frame of frames) {
        if (dead) return;
        if (frame.opcode === OPCODE.ping) send(OPCODE.pong, frame.payload);
        else if (frame.opcode === OPCODE.close) {
          closing = true;
          send(OPCODE.close, Buffer.alloc(0));
          socket.end();
        } else if (frame.opcode !== OPCODE.pong) {
          if (frame.opcode !== OPCODE.continuation) current = frame.opcode === OPCODE.text ? 'text' : 'binary';
          fragments.push(frame.payload);
          fragmentBytes += frame.payload.length;
          if (!frame.fin) continue;
          const kind = current;
          const body = fragments.length === 1 ? fragments[0]! : Buffer.concat(fragments, fragmentBytes);
          const size = fragmentBytes;
          release();
          if (kind !== 'text') continue;
          let message: unknown;
          try {
            message = JSON.parse(fatalUtf8.decode(body));
          } catch {
            fail(new TransportError('malformed-json', `the Codex daemon sent a message that is not JSON (${size} bytes)`, { size }));
            return;
          }
          messageHandler(message, size);
        }
      }
    };

    socket.onReady(() => {
      socket.write(
        'GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.onData((chunk: Buffer) => {
      if (dead) return;
      if (open) {
        if (backlog) backlog.push(chunk);
        else onFrames(chunk);
        return;
      }
      handshake = Buffer.concat([handshake, chunk]);
      const end = handshake.indexOf('\r\n\r\n');
      if (end < 0) {
        if (handshake.length > 64 * 1024) fail(new TransportError('protocol-error', 'the Codex daemon sent an oversized handshake', { size: handshake.length, limit: 64 * 1024 }));
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
      handshake = Buffer.alloc(0);
      resolve({
        send: (message) => send(OPCODE.text, Buffer.from(JSON.stringify(message), 'utf8')),
        onMessage: (handler) => {
          messageHandler = handler;
        },
        onClose: (handler) => {
          closeHandler = handler;
        },
        close: () => {
          closing = true;
          send(OPCODE.close, Buffer.alloc(0));
          socket.end();
          setTimeout(() => socket.destroy(), 200).unref();
        },
      });
      if (rest.length > 0) {
        backlog = [rest];
        setImmediate(() => {
          const queued = backlog ?? [];
          backlog = null;
          for (const chunk of queued) onFrames(chunk);
        });
      }
    });
    socket.onError((error) => {
      const errno = (error as NodeJS.ErrnoException).code;
      fail(new TransportError('connection-lost', error.message, errno ? { errno } : {}));
    });
    socket.onClose(() => {
      clearTimeout(timer);
      if (dead) return;
      dead = true;
      const why = socket.describeClose?.();
      if (!open) reject(new TransportError('connection-lost', `the Codex daemon closed the connection${why ? `: ${why}` : ''}`));
      else finishClose(closing ? undefined : new TransportError('connection-lost', 'the Codex daemon closed the connection unexpectedly'));
    });
  });
}
