import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common"
import { randomUUID } from "node:crypto"
import { Request, Response } from "express"
import { Observable, tap } from "rxjs"
import { StructuredLogger } from "./structured-logger.service"

type RequestWithId = Request & { requestId: string }

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>()
    const response = context.switchToHttp().getResponse<Response>()
    const requestId = request.header("x-request-id") || randomUUID()
    request.requestId = requestId
    response.setHeader("x-request-id", requestId)
    const startedAt = Date.now()

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.info(
            {
              requestId,
              method: request.method,
              url: request.originalUrl,
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
            },
            "request completed",
          ),
        error: (error: unknown) =>
          this.logger.error(
            {
              requestId,
              method: request.method,
              url: request.originalUrl,
              statusCode: response.statusCode,
              durationMs: Date.now() - startedAt,
              error: error instanceof Error ? error.message : String(error),
            },
            "request failed",
          ),
      }),
    )
  }
}
