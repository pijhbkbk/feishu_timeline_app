import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants } from 'node:fs';
import { mkdir, open, rename, statfs, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { Readable } from 'node:stream';

export type ObjectStorageUploadInput = {
  bucket: string;
  storageKey: string;
  buffer: Buffer;
};

export type ObjectStorageDownloadInput = {
  bucket: string;
  storageKey: string;
};

export type ObjectStorageOpenDownloadInput = ObjectStorageDownloadInput & {
  expectedContentLength: number;
};

export type ObjectStorageDownload = {
  stream: Readable;
  contentLength: number;
};

export type ObjectStoragePromoteInput = {
  bucket: string;
  sourceStorageKey: string;
  destinationStorageKey: string;
};

export type ObjectStorageWriteCapacityInput = {
  bytes: number;
  minFreeBytes: number;
};

export type ObjectStorageWriteCapacity = {
  availableBytes: bigint;
};

export type ObjectStorageObjectMetadata = {
  exists: boolean;
  size: number | null;
};

export abstract class ObjectStorageService {
  abstract assertWriteCapacity(
    input: ObjectStorageWriteCapacityInput,
  ): Promise<ObjectStorageWriteCapacity>;
  abstract readAvailableBytes(): Promise<bigint>;
  abstract inspect(
    input: ObjectStorageDownloadInput,
  ): Promise<ObjectStorageObjectMetadata>;
  abstract upload(input: ObjectStorageUploadInput): Promise<void>;
  abstract promote(input: ObjectStoragePromoteInput): Promise<void>;
  abstract purge(input: ObjectStorageDownloadInput): Promise<void>;
  abstract openDownload(input: ObjectStorageOpenDownloadInput): Promise<ObjectStorageDownload>;
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

  async assertWriteCapacity(input: ObjectStorageWriteCapacityInput) {
    await mkdir(this.storageRoot, { recursive: true });
    const availableBytes = await this.readAvailableBytes();
    const requiredBytes = BigInt(input.bytes) + BigInt(input.minFreeBytes);
    if (availableBytes < requiredBytes) {
      throw new Error('OBJECT_STORAGE_CAPACITY_BELOW_RESERVED_HEADROOM');
    }
    return { availableBytes };
  }

  async readAvailableBytes() {
    const metadata = await statfs(this.storageRoot, { bigint: true });
    return metadata.bavail * metadata.bsize;
  }

  async upload(input: ObjectStorageUploadInput) {
    const absolutePath = this.resolveAbsolutePath(input.bucket, input.storageKey);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
  }

  async inspect(input: ObjectStorageDownloadInput) {
    let fileHandle;
    try {
      fileHandle = await open(
        this.resolveAbsolutePath(input.bucket, input.storageKey),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { exists: false, size: null };
      }
      throw error;
    }

    try {
      const metadata = await fileHandle.stat();
      if (!metadata.isFile()) {
        throw new Error('OBJECT_STORAGE_OBJECT_NOT_REGULAR_FILE');
      }
      return { exists: true, size: metadata.size };
    } finally {
      await fileHandle.close();
    }
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

  async openDownload(input: ObjectStorageOpenDownloadInput) {
    const fileHandle = await open(
      this.resolveAbsolutePath(input.bucket, input.storageKey),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const metadata = await fileHandle.stat();
      if (!metadata.isFile()) {
        throw new Error('OBJECT_STORAGE_OBJECT_NOT_REGULAR_FILE');
      }
      if (metadata.size !== input.expectedContentLength) {
        throw new Error('OBJECT_STORAGE_CONTENT_LENGTH_MISMATCH');
      }
      return {
        stream: fileHandle.createReadStream(),
        contentLength: metadata.size,
      };
    } catch (error) {
      await fileHandle.close();
      throw error;
    }
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
