import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { validateNativePassword } from './native-auth.rules';

const OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1, hashLength: 32 };
// Only our bounded PHC parameters are accepted; database corruption cannot request unbounded KDF work.
const HASH_PATTERN = /^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;

@Injectable()
export class NativePasswordService {
  private active = 0;
  private dummyHash: Promise<string> | undefined;

  async hash(password: string) {
    validateNativePassword(password);
    return this.bounded(() => argon2.hash(password, OPTIONS));
  }

  async verify(hash: string | null, password: string) {
    if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 512) return false;
    if (!this.dummyHash) {
      this.dummyHash = this.hash('Native authentication timing dummy phrase 2026');
      void this.dummyHash.catch(() => { this.dummyHash = undefined; });
    }
    const candidate = hash && HASH_PATTERN.test(hash) ? hash : await this.dummyHash;
    const valid = await this.bounded(() => argon2.verify(candidate, password));
    return Boolean(hash && HASH_PATTERN.test(hash) && valid);
  }

  private async bounded<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 2) throw new ServiceUnavailableException('登录服务繁忙，请稍后重试。');
    this.active += 1;
    try { return await operation(); }
    finally { this.active -= 1; }
  }
}
