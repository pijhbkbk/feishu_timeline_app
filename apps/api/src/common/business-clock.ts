import { Global, Injectable, Module } from '@nestjs/common';

/** Calendar decisions use this clock. Authentication, rate limits, leases and
 * transport timeouts continue to use the real system clock. No runtime override
 * or environment setting is exposed by the production application. */
@Injectable()
export class BusinessClock {
  now(): Date { return new Date(); }
}

@Global()
@Module({ providers: [BusinessClock], exports: [BusinessClock] })
export class BusinessClockModule {}
