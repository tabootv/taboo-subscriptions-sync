import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, tap, timeout } from 'rxjs/operators';
import { logger } from '../logger/logger.config';
import { TIMEOUT_KEY } from './timeout.decorator';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly logger = logger();

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const timeoutMs =
      this.reflector.get<number>(TIMEOUT_KEY, handler) ||
      this.reflector.get<number>(TIMEOUT_KEY, context.getClass()) ||
      300000;

    this.logger.info(
      {
        timeoutMs,
        path: context.switchToHttp().getRequest().url,
        handlerTimeout: this.reflector.get<number>(TIMEOUT_KEY, handler),
        classTimeout: this.reflector.get<number>(
          TIMEOUT_KEY,
          context.getClass(),
        ),
      },
      'TimeoutInterceptor: Starting request',
    );

    return next.handle().pipe(
      tap({
        next: (value) => {
          this.logger.info('TimeoutInterceptor: Response ready to send');
        },
        error: (error) => {
          this.logger.error(
            { error: error.message },
            'TimeoutInterceptor: Error occurred',
          );
        },
        complete: () => {
          this.logger.info('TimeoutInterceptor: Response sent');
        },
      }),
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          this.logger.error(
            { timeoutMs, error: err.message },
            'TimeoutInterceptor: Request timed out',
          );
          return throwError(
            () =>
              new RequestTimeoutException(
                `Operation timed out after ${timeoutMs}ms`,
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
