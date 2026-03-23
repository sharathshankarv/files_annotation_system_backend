import {
  Injectable,
  NestInterceptor,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { splunkLogger } from '../logger/logger.utils';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    return next.handle().pipe(
      catchError((err) => {
        // 🛡️ Principal Tip: Log the full context for Splunk troubleshooting
        splunkLogger.error(`API_FAIL: ${req.method} ${req.url}`, {
          status: err.status || 500,
          message: err.message,
          path: req.url,
          body: req.method !== 'GET' ? req.body : undefined,
          stack: err.stack,
          timestamp: new Date().toISOString(),
        });
        throw err;
      }),
    );
  }
}
