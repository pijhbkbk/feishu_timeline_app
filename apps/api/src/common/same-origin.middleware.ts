import type { NextFunction, Request, Response } from 'express';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createSameOriginMutationGuard(frontendUrl: string) {
  const allowedOrigin = normalizeOrigin(frontendUrl);

  return (request: Request, response: Response, next: NextFunction) => {
    if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) {
      next();
      return;
    }

    const requestOrigin = request.headers.origin;

    if (
      allowedOrigin &&
      typeof requestOrigin === 'string' &&
      normalizeOrigin(requestOrigin) === allowedOrigin
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
