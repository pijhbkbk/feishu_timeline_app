import {ServiceUnavailableException, type CallHandler, type ExecutionContext, type NestInterceptor} from '@nestjs/common';
import {Observable} from 'rxjs';

/** Socket close (and downstream unsubscribe) cannot cancel an already started
 * controller Promise. Retain the inner subscription until that work settles. */
export class RequestDrainInterceptor implements NestInterceptor {
  private active = 0;
  private stopping = false;
  beginShutdown() { this.stopping = true; }
  isShutdownIdle() { return this.active === 0; }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return new Observable(observer => {
      if (this.stopping) { observer.error(new ServiceUnavailableException('服务正在安全停止，请稍后重试。')); return; }
      this.active++;
      let settled = false;
      const finish = () => { if (!settled) {settled = true; this.active--; } };
      try {
        next.handle().subscribe({
          next: value => observer.next(value),
          error: error => {finish();observer.error(error);},
          complete: () => {finish();observer.complete();},
        });
      } catch (error) {finish();observer.error(error);}
      // Intentionally do not unsubscribe the inner handler on response abort.
      // Any unbounded handler prevents verified shutdown and hence backup.
    });
  }
}
