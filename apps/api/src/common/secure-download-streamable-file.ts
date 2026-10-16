import { StreamableFile } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

type DestroyableStreamResponse = {
  destroyed: boolean;
  end(): void;
  destroy?: () => void;
};

/** Prevent Nest's default StreamableFile handler from returning or logging a
 * storage error message, which can contain an absolute local object path. */
export function createSecureDownloadStreamableFile(
  stream: Readable,
  logGenericError: () => void,
) {
  return new StreamableFile(stream)
    .setErrorHandler((_error, response) => {
      const destroyable = response as DestroyableStreamResponse;
      if (destroyable.destroyed) return;
      if (typeof destroyable.destroy === 'function') destroyable.destroy();
      else destroyable.end();
    })
    .setErrorLogger(() => logGenericError());
}

export async function closeDownloadStream(stream: Readable) {
  stream.destroy();
  await finished(stream).catch(() => undefined);
}
