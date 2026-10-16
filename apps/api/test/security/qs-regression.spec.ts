import { createRequire } from 'node:module';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

// Resolve the actual production graph; an independent test dependency could
// pass while Nest/Express still uses a vulnerable transitive copy.
const apiRequire = createRequire(import.meta.url);
const nestRequire = createRequire(apiRequire.resolve('@nestjs/platform-express'));
const expressRequire = createRequire(nestRequire.resolve('express'));
const bodyParserRequire = createRequire(expressRequire.resolve('body-parser'));
const parserParents = [expressRequire, bodyParserRequire];

describe('production qs dependency boundaries', () => {
  for (const [index, parentRequire] of parserParents.entries()) {
    describe(index === 0 ? 'Express query parser' : 'body-parser forms', () => {
      const qs = parentRequire('qs');

      it('enforces arrayLimit for bracketed comma groups (GHSA-x5fp-wj9c-mxmx)', () => {
        expect(() => qs.parse('a[]=1,2,3,4', {
          comma: true, arrayLimit: 3, throwOnLimitExceeded: true,
        })).toThrow(RangeError);
        expect(qs.parse('a[]=1,2', {
          comma: true, arrayLimit: 3, throwOnLimitExceeded: true,
        })).toEqual({ a: [['1', '2']] });
      });

      it('does not call attacker controlled isBuffer (GHSA-4mjr-xmp4-gh2g)', () => {
        for (const options of [{ plainObjects: true }, { allowPrototypes: true }]) {
          const input = qs.parse('x%5Bconstructor%5D%5BisBuffer%5D=y', options);
          expect(() => qs.stringify(input)).not.toThrow();
        }
        expect(qs.stringify({ value: Buffer.from('safe') })).toBe('value=safe');
        expect(qs.parse(qs.stringify({ user: { name: 'synthetic' } })))
          .toEqual({ user: { name: 'synthetic' } });
      });
    });
  }

  it('keeps both production parents on the same fixed dependency', () => {
    expect(expressRequire.resolve('qs')).toBe(bodyParserRequire.resolve('qs'));
    expect(expressRequire('qs/package.json').version).toBe('6.16.0');
  });

  it('preserves actual Express form parsing and request limits', async () => {
    const express = nestRequire('express');
    const app = express();
    // Same extended parser mode registered by the Nest Express adapter.
    app.use(express.urlencoded({ extended: true, parameterLimit: 4, depth: 2 }));
    app.post('/', (request: { body: unknown }, response: { json: (body: unknown) => void }) => {
      response.json(request.body);
    });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    const endpoint = new URL(`http://127.0.0.1:${address.port}/`);
    const send = (body: string) => fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    try {
      const valid = await send('user[name]=synthetic&colors[]=red&colors[]=blue');
      expect(valid.status).toBe(200);
      expect(await valid.json()).toEqual({ user: { name: 'synthetic' }, colors: ['red', 'blue'] });
      const deep = await send('a[b][c][d]=value');
      expect(deep.status).toBe(400);
      await deep.body?.cancel();
      const excess = await send('a=1&b=2&c=3&d=4&e=5');
      expect(excess.status).toBe(413);
      await excess.body?.cancel();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
    }
  });
});
