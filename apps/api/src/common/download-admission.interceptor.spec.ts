import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindDownloadAdmissionLeaseToHttpLifecycle } from './download-admission.interceptor';

const openServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
});

describe('download admission HTTP lifecycle', () => {
  it('requires both HTTP terminal and source settlement and releases exactly once', () => {
    const request = new EventEmitter();
    const response = new EventEmitter() as EventEmitter & { writableFinished?: boolean };
    const source = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn<() => void>> };
    source.destroy = vi.fn();
    const release = vi.fn();
    const lifecycle = bindDownloadAdmissionLeaseToHttpLifecycle(
      request,
      response,
      { release },
    );

    lifecycle.trackSource(source);
    response.emit('finish');
    expect(release).not.toHaveBeenCalled();
    source.emit('close');
    source.emit('close');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('destroys a late source after abort and waits for its close before release', () => {
    const request = new EventEmitter();
    const response = new EventEmitter() as EventEmitter & { writableFinished?: boolean };
    const source = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn<() => void>> };
    source.destroy = vi.fn();
    const release = vi.fn();
    const lifecycle = bindDownloadAdmissionLeaseToHttpLifecycle(
      request,
      response,
      { release },
    );

    request.emit('aborted');
    lifecycle.trackSource(source);
    expect(source.destroy).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    source.emit('close');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not treat destroyed as settled before the asynchronous close event', () => {
    const request = new EventEmitter();
    const response = new EventEmitter() as EventEmitter & { writableFinished?: boolean };
    const source = new EventEmitter() as EventEmitter & {
      closed?: boolean;
      destroyed?: boolean;
      destroy: ReturnType<typeof vi.fn<() => void>>;
    };
    source.destroyed = true;
    source.closed = false;
    source.destroy = vi.fn();
    const release = vi.fn();
    const lifecycle = bindDownloadAdmissionLeaseToHttpLifecycle(
      request,
      response,
      { release },
    );

    request.emit('aborted');
    lifecycle.trackSource(source);
    expect(release).not.toHaveBeenCalled();
    source.emit('close');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not let a source error bypass the required close event', () => {
    const request = new EventEmitter();
    const response = new EventEmitter() as EventEmitter & { writableFinished?: boolean };
    const source = new EventEmitter() as EventEmitter & {
      destroyed?: boolean;
      destroy: ReturnType<typeof vi.fn<() => void>>;
    };
    source.destroyed = false;
    source.destroy = vi.fn(() => {
      source.destroyed = true;
    });
    const release = vi.fn();
    const lifecycle = bindDownloadAdmissionLeaseToHttpLifecycle(
      request,
      response,
      { release },
    );

    lifecycle.trackSource(source);
    response.emit('close');
    source.emit('error');
    expect(release).not.toHaveBeenCalled();
    source.emit('close');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('holds the lease for a real slow TCP client and releases after disconnect', async () => {
    let releaseCount = 0;
    let sourceDestroyed = false;
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const server = createServer(async (request, response) => {
      const lifecycle = bindDownloadAdmissionLeaseToHttpLifecycle(
        request,
        response,
        { release: () => { releaseCount += 1; } },
      );
      const source = new Readable({
        read() {
          this.push(Buffer.alloc(64 * 1024));
        },
        destroy(error, callback) {
          sourceDestroyed = true;
          callback(error);
        },
      });
      lifecycle.trackSource(source);
      requestStarted();
      try {
        await pipeline(source, response);
      } catch {
        // A client disconnect is the expected terminal condition for this test.
      }
    });
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing TCP address.');

    const client = connect(address.port, '127.0.0.1');
    client.on('data', () => client.pause());
    client.write('GET /download HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    await started;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(releaseCount).toBe(0);

    client.destroy();
    await vi.waitFor(() => {
      expect(sourceDestroyed).toBe(true);
      expect(releaseCount).toBe(1);
    });
  });
});
