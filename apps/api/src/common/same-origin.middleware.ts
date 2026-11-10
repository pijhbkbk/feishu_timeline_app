import type { NextFunction, Request, Response } from 'express';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createSameOriginMutationGuard(frontendUrl: string | string[], requireMatchingHost = false) {
  const allowedOrigins = (Array.isArray(frontendUrl) ? frontendUrl : [frontendUrl]).map(normalizeOrigin);

  return (request: Request, response: Response, next: NextFunction) => {
    if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) {
      next();
      return;
    }

    const requestOrigin = request.headers.origin;

    if (
      allowedOrigins.length > 0 && allowedOrigins.every(Boolean) &&
      typeof requestOrigin === 'string' &&
      allowedOrigins.includes(normalizeOrigin(requestOrigin)) &&
      (!requireMatchingHost || exactPrivateHostMatchesOrigin(request.headers.host, requestOrigin))
    ) {
      next();
      return;
    }

    response.status(403).json({
      statusCode: 403,
      message: '跨站写请求已拒绝。',
      error: 'Forbidden',
    });
  };
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

// No forwarding header is trusted for this check. Both proxy hops preserve Host
// and the browser's actual Origin; aliases and opaque/malformed origins fail closed.
function exactPrivateHostMatchesOrigin(host: string | undefined, origin: string) {
  return (host === 'localhost:18443' && origin === 'https://localhost:18443') ||
    ((host === 'timeline.all-too-well.com' || host === 'timeline.all-too-well.com:443') &&
      origin === 'https://timeline.all-too-well.com');
}
