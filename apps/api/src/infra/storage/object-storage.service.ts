import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type ObjectStorageUploadInput = {
  bucket: string;
  storageKey: string;
  buffer: Buffer;
};

export type ObjectStorageDownloadInput = {
  bucket: string;
  storageKey: string;
};

export abstract class ObjectStorageService {
  abstract upload(input: ObjectStorageUploadInput): Promise<void>;
  abstract download(input: ObjectStorageDownloadInput): Promise<Buffer>;
  abstract markDeleted(input: ObjectStorageDownloadInput): Promise<void>;
}

@Injectable()
export class LocalFilesystemObjectStorageService extends ObjectStorageService {
  private readonly storageRoot: string;

  constructor(configService: ConfigService) {
    super();
    this.storageRoot = resolve(
      process.cwd(),
      configService.get<string>('objectStorageLocalRoot') ?? 'var/object-storage',
    );
  }

  async upload(input: ObjectStorageUploadInput) {
    const absolutePath = this.resolveAbsolutePath(input.bucket, input.storageKey);
    await mkdir(join(this.storageRoot, input.bucket, this.getParentDirectory(input.storageKey)), {
      recursive: true,
    });
    await writeFile(absolutePath, input.buffer);
  }

  download(input: ObjectStorageDownloadInput) {
    return readFile(this.resolveAbsolutePath(input.bucket, input.storageKey));
  }

  async markDeleted() {
    // Local adapter keeps the binary for audit/history. Deletion is logical in DB.
  }

  private resolveAbsolutePath(bucket: string, storageKey: string) {
    return join(this.storageRoot, bucket, storageKey);
  }

  private getParentDirectory(storageKey: string) {
    const lastSlashIndex = storageKey.lastIndexOf('/');
    return lastSlashIndex === -1 ? '' : storageKey.slice(0, lastSlashIndex);
  }
}
