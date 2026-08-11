import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
