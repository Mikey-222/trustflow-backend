import { Injectable, NestMiddleware } from '@nestjs/common';
import { SanitizedLogger } from './sanitized-logger';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { CorrelationIdStore } from './correlation-id.store';
import { redactIp, redactUrl, redactValue, sanitiseCorrelationId, REDACTED } from './redaction';

/** Header name clients can send to propagate an upstream correlation ID. */
export const CORRELATION_ID_HEADER = 'x-request-id';

/** Sensitive route path patterns whose request bodies must never be logged verbatim (#916). */
const SENSITIVE_PATH_PATTERNS = [/^\/auth/i, /verify/i, /challenge/i, /signature/i];

/**
 * Generates (or propagates an inbound `X-Request-Id` header as) a correlation ID for every
 * HTTP request, attaches it to `request.correlationId`, writes it back in the response
 * header, and runs the remainder of the request inside the `CorrelationIdStore` async context
 * so every log line emitted while handling the request can include the same ID.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new SanitizedLogger(CorrelationIdMiddleware.name);

  constructor(private readonly store: CorrelationIdStore) {}

  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction): void {
    // Honour a well-formed upstream ID if present; otherwise generate a new one.
    const inbound = req.headers[CORRELATION_ID_HEADER] as string | undefined;
    const correlationId = sanitiseCorrelationId(inbound) ?? randomUUID();

    req.correlationId = correlationId;

    // Echo the ID back to the caller so they can correlate on their end.
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    const path = req.originalUrl ?? req.url ?? '';
    const isSensitive = SENSITIVE_PATH_PATTERNS.some(p => p.test(path));

    const logEntry: Record<string, unknown> = {
      event: 'request_start',
      correlationId,
      method: req.method,
      url: redactUrl(path),
      ip: redactIp(req.ip),
    };

    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      logEntry.body = isSensitive ? REDACTED : redactValue(req.body);
    }

    this.logger.log(JSON.stringify(logEntry));

    // Run the rest of the request lifecycle inside the async store so downstream
    // code (services, guards, interceptors) can retrieve the ID without it being
    // threaded through every function signature.
    this.store.run(correlationId, () => next());
  }
}
