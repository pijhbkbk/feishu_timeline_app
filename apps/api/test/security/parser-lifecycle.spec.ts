import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixture = fileURLToPath(new URL('./fixtures/parser-lifecycle-probe.mjs', import.meta.url));

describe('installed production parser lifecycles', () => {
  for (const [name, version, expected] of [
    ['body-parser', '2.4.0', { normalRequest: true, gzipCompleted: true }],
    ['multer', '2.5.0', { callbackCount: 1, normalUpload: true }],
  ] as const) {
    it(`${name} survives late input and serves subsequent work without swallowing process errors`, () => {
      const result = spawnSync(process.execPath, [fixture, name], {
        timeout: 5000, maxBuffer: 64 * 1024, encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ package: name, version, completed: true, ...expected });
    });
  }
});
