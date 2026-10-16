import { isIP } from 'node:net';

function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 45 || value.includes('%') || !isIP(value)) return undefined;
  if (isIP(value) === 4) return value;
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(normalized);
  if (!mapped?.[1] || !mapped[2]) return normalized;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >>> 8, high & 255, low >>> 8, low & 255].join('.');
}

export function resolveNativeAuthTrustedProxyIp(value: string | undefined): string | undefined {
  const address = value?.trim();
  if (!address) return undefined;
  const octets = address.split('.').map(Number);
  const second = octets[1] ?? -1;
  const privateAddress = isIP(address) === 4 && (
    octets[0] === 10 ||
    (octets[0] === 172 && second >= 16 && second <= 31) ||
    (octets[0] === 192 && second === 168)
  );
  if (!privateAddress) {
    throw new Error('NATIVE_AUTH_TRUSTED_PROXY_IP must be one exact private IPv4 address, without a range or list.');
  }
  return address;
}

export function nativeAuthClientAddress(peer: string | undefined, header: unknown, trustedProxyIp?: string): string {
  const address = normalizeIp(peer);
  const proxy = address === '127.0.0.1' || address === '::1' || (
    trustedProxyIp !== undefined && address === trustedProxyIp
  );
  // The verified deployment must restrict this peer to the host reverse proxy,
  // whose X-Real-IP overwrites all client-supplied values.
  return (proxy ? normalizeIp(header) : undefined) ?? address ?? 'unknown';
}
