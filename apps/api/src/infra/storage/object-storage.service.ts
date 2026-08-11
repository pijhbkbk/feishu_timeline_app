import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export type ObjectStorageUploadInput = {
  bucket: string;
  storageKey: string;
  buffer: Buffer;
};

export type ObjectStorageDownloadInput = {
  bucket: string;
  storageKey: string;
};

export type ObjectStoragePromoteInput = {
  bucket: string;
  sourceStorageKey: string;
  destinationStorageKey: string;
};

export abstract class ObjectStorageService {
  abstract upload(input: ObjectStorageUploadInput): Promise<void>;
  abstract promote(input: ObjectStoragePromoteInput): Promise<void>;
  abstract purge(input: ObjectStorageDownloadInput): Promise<void>;
  abstract download(input: ObjectStorageDownloadInput): Promise<Buffer>;
  abstract markDeleted(input: ObjectStorageDownloadInput): Promise<void>;
}

@Injectable()
export class LocalFilesystemObjectStorageService extends ObjectStorageService {
  private readonly storageRoot: string;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    super();
    this.storageRoot = resolve(
      process.cwd(),
      this.configService.get<string>('objectStorageLocalRoot') ?? 'var/object-storage',
    );
  }

  async upload(input: ObjectStorageUploadInput) {
    const absolutePath = this.resolveAbsolutePath(input.bucket, input.storageKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
  }

  async promote(input: ObjectStoragePromoteInput) {
    const sourcePath = this.resolveAbsolutePath(input.bucket, input.sourceStorageKey);
    const destinationPath = this.resolveAbsolutePath(
      input.bucket,
      input.destinationStorageKey,
    );
    await mkdir(dirname(destinationPath), { recursive: true });
    await rename(sourcePath, destinationPath);
  }

  async purge(input: ObjectStorageDownloadInput) {
    try {
      await unlink(this.resolveAbsolutePath(input.bucket, input.storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  download(input: ObjectStorageDownloadInput) {
    return readFile(this.resolveAbsolutePath(input.bucket, input.storageKey));
  }

  async markDeleted() {
    // Local adapter keeps the binary for audit/history. Deletion is logical in DB.
  }

  private resolveAbsolutePath(bucket: string, storageKey: string) {
    const bucketRoot = resolve(this.storageRoot, bucket);
    const bucketRelativePath = relative(this.storageRoot, bucketRoot);

    if (
      !bucketRelativePath ||
      bucketRelativePath.startsWith('..') ||
      isAbsolute(bucketRelativePath)
    ) {
      throw new Error('OBJECT_STORAGE_PATH_OUTSIDE_ROOT');
    }

    const absolutePath = resolve(bucketRoot, storageKey);
    const relativePath = relative(bucketRoot, absolutePath);

    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('OBJECT_STORAGE_PATH_OUTSIDE_ROOT');
    }

    return absolutePath;
  }
}
