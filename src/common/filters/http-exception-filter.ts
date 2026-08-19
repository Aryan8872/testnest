import {
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

export class HttpExceptionFilter implements ExceptionFilter {
  private mapErrorCode(status: number) {
    switch (status) {
      case 404:
        return 'NOT_FOUND';
      case 400:
        return 'VALIDATION_ERROR';

      case 409:
        return 'CONFLICT';
      default:
        return 'INTERNAL_ERROR';
    }
  }
  //ArgumentsHost allows filter to be used in HTTP context (or WebSocket, RPC contexts if needed).
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();

    let message = 'Internal server error';
    let errors = null;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    //If exception is Nest HttpException,
    // use exception.getResponse() to pull out structured data thrown earlier
    // (like BadRequestException({errors: [...]})).
    //     {
    //   "success": false,
    //   "statusCode": 400,
    //   "message": "Validation failed",
    //   "errorCode": "VALIDATION_ERROR",
    //   "errors": [...]
    // }
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse: any = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        message = exceptionResponse.message || message;
        errors = exceptionResponse.errors || null;
      }
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errorCode: this.mapErrorCode(status),
      errors,
    });
  }
}
