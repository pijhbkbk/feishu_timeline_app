import { createConnection, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';

const MAX_RESPONSE_BYTES = 16 * 1024;
const CLOSE_GRACE_MS = 250;

/** A scan never reconnects: every numbered reply belongs to one clamd process. */
export class ClamAvSession {
  private socket: Socket | undefined;
  private opening: Promise<void> | undefined;
  private closed: Promise<void> | undefined;
  private rejectOpening: ((error: Error) => void) | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private error: Error | undefined;
  private closing = false;
  private requestId = 0;
  private received = Buffer.alloc(0);
  private pending: {
    id: number;
    resolve: (response: Buffer) => void;
    reject: (error: Error) => void;
    written: boolean;
    response?: Buffer;
  } | undefined;

  constructor(private readonly host: string, private readonly port: number, private readonly deadline: number) {}

  async exchange(payload: Buffer | Iterable<Buffer>): Promise<Buffer> {
    await this.open();
    if (this.error) throw this.error;
    if (this.closing || this.pending) throw new Error('CLAMAV_SESSION_STATE_INVALID');
    const socket = this.socket!;
    const response = new Promise<Buffer>((resolve, reject) => {
      this.pending = { id: ++this.requestId, resolve, reject, written: false };
    });
    void this.write(payload).then(() => {
      if (!this.pending || this.error || socket.destroyed) return;
      this.pending.written = true;
      this.finishReply();
    }).catch(() => this.fail(new Error('CLAMAV_CONNECTION_ERROR')));
    return response;
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    this.closing = true;
    if (this.pending) this.fail(new Error('CLAMAV_CONNECTION_CLOSED'));
    clearTimeout(this.timeout);
    let grace: ReturnType<typeof setTimeout> | undefined;
    if (!this.socket.destroyed) {
      this.socket.end('zEND\0');
      grace = setTimeout(() => this.socket?.destroy(), Math.max(0, Math.min(CLOSE_GRACE_MS, this.deadline - performance.now())));
    }
    await this.closed;
    clearTimeout(grace);
    if (this.error) throw this.error;
  }

  private open(): Promise<void> {
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      this.rejectOpening = reject;
      const remaining = this.deadline - performance.now();
      if (remaining <= 0) { reject(new Error('CLAMAV_TOTAL_TIMEOUT')); return; }
      const socket = createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      this.closed = new Promise<void>((done) => socket.once('close', done));
      this.timeout = setTimeout(() => this.fail(new Error('CLAMAV_TOTAL_TIMEOUT')), remaining);
      socket.once('connect', () => {
        if (this.error) return;
        socket.write('zIDSESSION\0');
        resolve();
      });
      socket.on('data', (chunk: Buffer) => this.read(chunk));
      socket.once('error', () => this.fail(new Error('CLAMAV_CONNECTION_ERROR')));
      socket.once('end', () => { if (!this.closing) this.fail(new Error('CLAMAV_CONNECTION_CLOSED')); });
      socket.once('close', () => { if (!this.closing && !this.error) this.fail(new Error('CLAMAV_CONNECTION_CLOSED')); });
    });
    return this.opening;
  }

  private fail(error: Error): void {
    if (this.error) return;
    this.error = error;
    clearTimeout(this.timeout);
    this.rejectOpening?.(error);
    this.pending?.reject(error);
    this.pending = undefined;
    this.socket?.destroy();
  }

  private read(chunk: Buffer): void {
    if (this.error) return;
    if (!this.pending || this.pending.response) { this.fail(new Error('CLAMAV_UNEXPECTED_RESPONSE')); return; }
    if (this.received.length + chunk.length > MAX_RESPONSE_BYTES) { this.fail(new Error('CLAMAV_RESPONSE_TOO_LARGE')); return; }
    this.received = Buffer.concat([this.received, chunk]);
    const end = this.received.indexOf(0);
    if (end < 0) return;
    if (end !== this.received.length - 1) { this.fail(new Error('CLAMAV_UNEXPECTED_RESPONSE')); return; }
    const prefix = Buffer.from(`${this.pending.id}: `);
    if (!this.received.subarray(0, prefix.length).equals(prefix)) { this.fail(new Error('CLAMAV_RESPONSE_ID_MISMATCH')); return; }
    this.pending.response = this.received.subarray(prefix.length, end);
    this.received = Buffer.alloc(0);
    this.finishReply();
  }

  private finishReply(): void {
    const pending = this.pending;
    if (!pending?.written || !pending.response) return;
    this.pending = undefined;
    pending.resolve(pending.response);
  }

  private async write(payload: Buffer | Iterable<Buffer>): Promise<void> {
    const socket = this.socket!;
    for (const chunk of Buffer.isBuffer(payload) ? [payload] : payload) {
      if (this.error || socket.destroyed) return;
      if (!socket.write(chunk)) await waitForDrain(socket);
    }
  }
}

function waitForDrain(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = () => { socket.off('drain', drained); socket.off('close', closed); socket.off('error', failed); };
    const drained = () => { clean(); resolve(); };
    const closed = () => { clean(); reject(new Error('CLAMAV_CONNECTION_CLOSED')); };
    const failed = () => { clean(); reject(new Error('CLAMAV_CONNECTION_ERROR')); };
    socket.once('drain', drained); socket.once('close', closed); socket.once('error', failed);
    if (socket.destroyed) closed();
  });
}
