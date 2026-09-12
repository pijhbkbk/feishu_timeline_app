import { describe, expect, it } from 'vitest';

import { nativeAuthClientAddress, resolveNativeAuthTrustedProxyIp } from './native-auth-client';

describe('native auth reverse proxy address', () => {
  it('ignores forged forwarding headers from public and unconfigured private peers', () => {
    expect(nativeAuthClientAddress('203.0.113.8', '198.51.100.9')).toBe('203.0.113.8');
    expect(nativeAuthClientAddress('172.30.44.2', '198.51.100.9', '172.30.44.1')).toBe('172.30.44.2');
    expect(nativeAuthClientAddress('172.30.44.1', '198.51.100.9')).toBe('172.30.44.1');
  });

  it('trusts only the explicitly configured Docker gateway and loopback proxy', () => {
    for (const peer of ['172.30.44.1', '::ffff:172.30.44.1', '::ffff:ac1e:2c01']) {
      expect(nativeAuthClientAddress(peer, '198.51.100.9', '172.30.44.1')).toBe('198.51.100.9');
    }
    for (const peer of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
      expect(nativeAuthClientAddress(peer, '198.51.100.9')).toBe('198.51.100.9');
    }
  });

  it('keeps malformed, duplicate and list headers in the proxy address bucket', () => {
    for (const header of [undefined, [], ['198.51.100.9'], '198.51.100.9, 203.0.113.8', 'not-an-ip', ' 198.51.100.9', 'fe80::1%eth0', 'x'.repeat(129)]) {
      expect(nativeAuthClientAddress('172.30.44.1', header, '172.30.44.1')).toBe('172.30.44.1');
    }
  });

  it('canonicalizes IPv6 and mapped IPv4 to avoid alternate rate-limit keys', () => {
    expect(nativeAuthClientAddress('::1', '2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(nativeAuthClientAddress('::1', '::ffff:c633:6409')).toBe('198.51.100.9');
    expect(nativeAuthClientAddress(undefined, '198.51.100.9')).toBe('unknown');
  });

  it('fails configuration closed for broad ranges, lists and non-private addresses', () => {
    expect(resolveNativeAuthTrustedProxyIp(undefined)).toBeUndefined();
    expect(resolveNativeAuthTrustedProxyIp('172.30.44.1')).toBe('172.30.44.1');
    for (const value of ['172.30.44.0/24', '172.30.44.1,172.30.44.2', '0.0.0.0', '203.0.113.8', '::1', 'localhost', '172.030.44.1', '172.32.0.1']) {
      expect(() => resolveNativeAuthTrustedProxyIp(value)).toThrow('one exact private IPv4');
    }
  });
});
