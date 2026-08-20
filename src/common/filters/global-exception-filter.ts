import * as Sentry from '@sentry/node';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import type { Request, Response } from 'express';

import type { RequestWithId } from '../middleware/request-id.middleware.js';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();

    const request = ctx.getRequest<RequestWithId & Request>();

    const response = ctx.getResponse<Response>();

    const requestId = request.requestId;

    /*
     * 1. Prisma errors
     */
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const result = this.handlePrismaError(exception);

      this.logger.error(
        JSON.stringify({
          event: 'database.error',
          requestId,
          path: request.originalUrl,
          method: request.method,
          prismaCode: exception.code,
        }),
      );

      response.status(result.statusCode).json({
        success: false,
        requestId,
        statusCode: result.statusCode,
        errorCode: result.errorCode,
        message: result.message,
        errors: null,
      });

      return;
    }

    /*
     * 2. Nest HTTP exceptions
     */
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();

      const exceptionResponse = exception.getResponse();

      const formatted = this.normalizeHttpException(exceptionResponse);

      response.status(statusCode).json({
        success: false,
        requestId,
        statusCode,
        errorCode: formatted.errorCode,
        message: formatted.message,
        errors: formatted.errors,
      });

      return;
    }

    /*
     * 3. Unknown/unexpected errors
     */

    this.logger.error(
      JSON.stringify({
        event: 'unexpected.error',
        requestId,
        path: request.originalUrl,
        method: request.method,
        error:
          exception instanceof Error ? exception.message : String(exception),
      }),
      exception instanceof Error ? exception.stack : undefined,
    );

    // Capture the error in Sentry
    Sentry.captureException(exception, {
      tags: {
        path: request.url,
      },
      user: (request as any)?.user
        ? {
            id: (request as any)?.user?.id,
            tenantId: (request as any)?.user?.tenantId,
          }
        : undefined,
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      requestId,
      statusCode: 500,
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      errors: null,
    });
  }

  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      /*
       * Unique constraint violation
       */
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          errorCode: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: 'A resource with the same unique value already exists',
        };

      /*
       * Record required but not found
       */
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          errorCode: 'RESOURCE_NOT_FOUND',
          message: 'The requested resource was not found',
        };

      /*
       * Foreign key violation
       */
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          errorCode: 'FOREIGN_KEY_CONSTRAINT',
          message: 'The operation violates a related resource constraint',
        };

      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: 'DATABASE_ERROR',
          message: 'A database error occurred',
        };
    }
  }

  private normalizeHttpException(exceptionResponse: string | object) {
    if (typeof exceptionResponse === 'string') {
      return {
        errorCode: 'HTTP_ERROR',
        message: exceptionResponse,
        errors: null,
      };
    }

    const response = exceptionResponse as {
      message?: unknown;
      errorCode?: string;
      errors?: unknown;
    };

    /*
     * ValidationPipe may give us an array.
     */
    if (Array.isArray(response.message)) {
      return {
        errorCode: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: response.message,
      };
    }

    return {
      errorCode: response.errorCode ?? 'HTTP_ERROR',
      message:
        typeof response.message === 'string'
          ? response.message
          : 'Request failed',
      errors: response.errors ?? null,
    };
  }
}
