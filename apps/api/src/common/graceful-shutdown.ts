import type { Server } from 'node:http';

export type BackgroundWriter = {
  beginShutdown(): void;
  isShutdownIdle(): boolean;
};

/** Pause consumers first, drain accepted HTTP writes, then wait for background
 * writes before closing Redis/Prisma. A timeout is failure, never a backup point. */
export async function drainWriters(server: Server, writers: BackgroundWriter[], timeoutMs = 45000) {
  for (const writer of writers) writer.beginShutdown();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Application write drain timed out')), timeoutMs);
  });
  let cancelled = false;
  try {
    await Promise.race([
      (async () => {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        while (!cancelled && writers.some(writer => !writer.isShutdownIdle())) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      })(), timeout,
    ]);
  } finally { cancelled = true; clearTimeout(timer); }
}
