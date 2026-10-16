import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { finalize, tap } from 'rxjs';

import type { AuthenticatedRequest } from '../modules/auth/auth.types';
import {
  DownloadAdmissionRejectedException,
  DownloadAdmissionService,
  type DownloadAdmissionLease,
} from './download-admission.service';

type LifecycleEmitter = {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
};
type LifecycleRequest = LifecycleEmitter & { aborted?: boolean };
type LifecycleResponse = LifecycleEmitter & {
  destroyed?: boolean;
  writableFinished?: boolean;
};
type DownloadSource = LifecycleEmitter & {
  closed?: boolean;
  destroyed?: boolean;
  destroy(): unknown;
};

export function bindDownloadAdmissionLeaseToHttpLifecycle(
  request: LifecycleRequest,
  response: LifecycleResponse,
  lease: DownloadAdmissionLease,
) {
  let released = false;
  let controllerSettled = false;
  let source: DownloadSource | undefined;
  let sourceSettled = false;
  let transportTerminal = Boolean(
    request.aborted || response.destroyed || response.writableFinished,
  );
  let transportAborted = Boolean(
    request.aborted || (response.destroyed && !response.writableFinished),
  );

  const cleanup = () => {
    for (const [emitter, event, listener] of transportBindings) {
      emitter.removeListener(event, listener);
    }
    if (source) {
      source.removeListener('close', settleSource);
      source.removeListener('error', failSource);
    }
  };
  const releaseIfSettled = () => {
    const downstreamSettled = source ? sourceSettled : controllerSettled;
    if (!transportTerminal || !downstreamSettled || released) return;
    released = true;
    cleanup();
    lease.release();
  };
  const settleSource = () => {
    sourceSettled = true;
    releaseIfSettled();
  };
  const failSource = () => {
    if (source && !source.destroyed) source.destroy();
  };
  const abortTransport = () => {
    transportTerminal = true;
    transportAborted = true;
    if (source && !sourceSettled && !source.destroyed) source.destroy();
    releaseIfSettled();
  };
  const finishTransport = () => {
    transportTerminal = true;
    releaseIfSettled();
  };
  const closeTransport = () => {
    if (response.writableFinished) finishTransport();
    else abortTransport();
  };
  const transportBindings: Array<[LifecycleEmitter, string, () => void]> = [
    [response, 'finish', finishTransport],
    [response, 'close', closeTransport],
    [response, 'error', abortTransport],
    [request, 'aborted', abortTransport],
    [request, 'error', abortTransport],
  ];

  for (const [emitter, event, listener] of transportBindings) {
    emitter.once(event, listener);
  }

  return {
    trackSource(nextSource: DownloadSource) {
      if (source) throw new Error('DOWNLOAD_SOURCE_ALREADY_TRACKED');
      source = nextSource;
      // `destroyed` flips before an asynchronous _destroy callback and `close`.
      // Only an observed terminal event (or an already closed source) proves
      // downstream resources have actually settled.
      sourceSettled = Boolean(source.closed);
      if (!sourceSettled) {
        source.once('close', settleSource);
        source.once('error', failSource);
      }
      if (transportAborted && !sourceSettled && !source.destroyed) source.destroy();
      releaseIfSettled();
    },
    markControllerSettled() {
      controllerSettled = true;
      releaseIfSettled();
    },
  };
}

@Injectable()
export class DownloadAdmissionInterceptor implements NestInterceptor {
  constructor(
    @Inject(DownloadAdmissionService)
    private readonly downloadAdmissionService: DownloadAdmissionService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<LifecycleResponse & {
      setHeader(name: string, value: string): void;
    }>();
    let lease: DownloadAdmissionLease;
    try {
      lease = this.downloadAdmissionService.acquire(request);
    } catch (error) {
      if (error instanceof DownloadAdmissionRejectedException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }

    const lifecycle = bindDownloadAdmissionLeaseToHttpLifecycle(
      request,
      response,
      lease,
    );
    return next.handle().pipe(
      tap((result) => {
        if (result instanceof StreamableFile) {
          lifecycle.trackSource(result.getStream());
        }
      }),
      finalize(() => lifecycle.markControllerSettled()),
    );
  }
}
