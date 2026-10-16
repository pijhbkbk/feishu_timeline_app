import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { createSecureDownloadStreamableFile } from './secure-download-streamable-file';

describe('createSecureDownloadStreamableFile', () => {
  it('destroys a partial response and never sends or logs a storage path', () => {
    const logGenericError = vi.fn();
    const file = createSecureDownloadStreamableFile(
      new PassThrough(),
      logGenericError,
    );
    const response = {
      destroyed: false,
      headersSent: true,
      statusCode: 200,
      send: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    const sensitiveError = new Error(
      'EIO while reading /private/var/object-storage/customer/secret.pdf',
    );

    file.errorHandler(sensitiveError, response);
    file.errorLogger(sensitiveError);

    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(response.send).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
    expect(logGenericError).toHaveBeenCalledWith();
    expect(JSON.stringify(logGenericError.mock.calls)).not.toContain('/private/var');
  });
});
