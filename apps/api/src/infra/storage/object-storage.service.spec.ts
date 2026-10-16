import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalFilesystemObjectStorageService } from './object-storage.service';

const temporaryRoots: string[] = [];

async function createService() {
  const root = await mkdtemp(join(tmpdir(), 'r27-storage-'));
  temporaryRoots.push(root);
  const configService = {
    get: vi.fn((key: string) => (key === 'objectStorageLocalRoot' ? root : undefined)),
  };
  return {
    root,
    service: new LocalFilesystemObjectStorageService(configService as never),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('LocalFilesystemObjectStorageService', () => {
  it('checks filesystem headroom before a quota reservation is admitted', async () => {
    const { service } = await createService();

    await expect(
      service.assertWriteCapacity({ bytes: 1, minFreeBytes: 0 }),
    ).resolves.toEqual({ availableBytes: expect.any(BigInt) });
    await expect(
      service.assertWriteCapacity({
        bytes: Number.MAX_SAFE_INTEGER,
        minFreeBytes: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toThrow('OBJECT_STORAGE_CAPACITY_BELOW_RESERVED_HEADROOM');
  });

  it('promotes a quarantined object into its clean key', async () => {
    const { root, service } = await createService();
    await service.upload({
      bucket: 'attachments',
      storageKey: 'quarantine/project/file.pdf',
      buffer: Buffer.from('clean'),
    });

    await service.promote({
      bucket: 'attachments',
      sourceStorageKey: 'quarantine/project/file.pdf',
      destinationStorageKey: 'project/file.pdf',
    });

    await expect(readFile(join(root, 'attachments/project/file.pdf'), 'utf8')).resolves.toBe(
      'clean',
    );
  });

  it('inspects regular objects without buffering and reports missing keys', async () => {
    const { service } = await createService();
    await service.upload({
      bucket: 'attachments',
      storageKey: 'project/file.pdf',
      buffer: Buffer.from('metadata-only'),
    });

    await expect(
      service.inspect({ bucket: 'attachments', storageKey: 'project/file.pdf' }),
    ).resolves.toEqual({ exists: true, size: Buffer.byteLength('metadata-only') });
    await expect(
      service.inspect({ bucket: 'attachments', storageKey: 'project/missing.pdf' }),
    ).resolves.toEqual({ exists: false, size: null });
  });

  it('opens a bounded-memory read stream and reports the exact content length', async () => {
    const { service } = await createService();
    await service.upload({
      bucket: 'attachments',
      storageKey: 'project/file.pdf',
      buffer: Buffer.from('streamed-content'),
    });

    const download = await service.openDownload({
      bucket: 'attachments',
      storageKey: 'project/file.pdf',
      expectedContentLength: Buffer.byteLength('streamed-content'),
    });
    const chunks: Buffer[] = [];
    for await (const chunk of download.stream) {
      chunks.push(Buffer.from(chunk));
    }

    expect(download.contentLength).toBe(Buffer.byteLength('streamed-content'));
    expect(Buffer.concat(chunks).toString('utf8')).toBe('streamed-content');
  });

  it('rejects metadata size mismatches before exposing a stream', async () => {
    const { service } = await createService();
    await service.upload({
      bucket: 'attachments',
      storageKey: 'project/file.pdf',
      buffer: Buffer.from('short'),
    });

    await expect(
      service.openDownload({
        bucket: 'attachments',
        storageKey: 'project/file.pdf',
        expectedContentLength: 20 * 1024 * 1024,
      }),
    ).rejects.toThrow('OBJECT_STORAGE_CONTENT_LENGTH_MISMATCH');
  });

  it('rejects non-regular objects before exposing a stream', async () => {
    const { service } = await createService();
    await service.upload({
      bucket: 'attachments',
      storageKey: 'project/file.pdf',
      buffer: Buffer.from('content'),
    });

    await expect(
      service.openDownload({
        bucket: 'attachments',
        storageKey: 'project',
        expectedContentLength: 0,
      }),
    ).rejects.toThrow('OBJECT_STORAGE_OBJECT_NOT_REGULAR_FILE');
  });

  it('refuses to follow a final-component symlink out of the storage root', async () => {
    const { root, service } = await createService();
    const outside = join(root, 'outside-secret.txt');
    await writeFile(outside, 'secret');
    await service.upload({
      bucket: 'attachments',
      storageKey: 'project/placeholder.txt',
      buffer: Buffer.from('placeholder'),
    });
    await symlink(outside, join(root, 'attachments/project/link.txt'));

    await expect(
      service.openDownload({
        bucket: 'attachments',
        storageKey: 'project/link.txt',
        expectedContentLength: 6,
      }),
    ).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(
      service.inspect({
        bucket: 'attachments',
        storageKey: 'project/link.txt',
      }),
    ).rejects.toMatchObject({ code: 'ELOOP' });
  });

  it('purges a quarantined object after a rejected scan', async () => {
    const { root, service } = await createService();
    await service.upload({
      bucket: 'attachments',
      storageKey: 'quarantine/project/rejected.pdf',
      buffer: Buffer.from('rejected'),
    });

    await service.purge({
      bucket: 'attachments',
      storageKey: 'quarantine/project/rejected.pdf',
    });

    await expect(
      readFile(join(root, 'attachments/quarantine/project/rejected.pdf')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['../outside', '/absolute/path', 'safe/../../../outside'])(
    'rejects an object key outside the configured root: %s',
    async (storageKey) => {
      const { service } = await createService();

      await expect(
        service.upload({
          bucket: 'attachments',
          storageKey,
          buffer: Buffer.from('blocked'),
        }),
      ).rejects.toThrow('OBJECT_STORAGE_PATH_OUTSIDE_ROOT');
    },
  );
});
