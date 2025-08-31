import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, AuthenticatedRequest } from '@/types';
import { logger, securityLogger, logSecurityEvent } from '@/utils/logger';

/**
 * Global error handler middleware
 * Handles all errors in a consistent format with proper HTTP status codes
 */
export const errorHandler = (
  error: Error | AppError,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Log the error with context
  const errorContext = {
    requestId: req.requestId,
    userId: req.user?.sub,
    clinicId: req.clinicId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    stack: error.stack
  };

  // Determine if this is an operational error or programming error
  const isOperationalError = error instanceof AppError && error.isOperational;
  
  if (isOperationalError) {
    logger.warn('Operational error occurred', {
      error: error.message,
      code: (error as AppError).code,
      statusCode: (error as AppError).statusCode,
      ...errorContext
    });
  } else {
    logger.error('Unexpected error occurred', {
      error: error.message,
      ...errorContext
    });
  }

  // Handle specific error types
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An internal error occurred';
  let details: any = undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
    
    if (error instanceof ValidationError && error.details) {
      details = error.details;
    }
  } else if (error.name === 'ValidationError') {
    // Mongoose validation error
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = parseValidationErrors(error);
  } else if (error.name === 'CastError') {
    // Mongoose cast error (invalid ObjectId, etc.)
    statusCode = 400;
    errorCode = 'INVALID_INPUT';
    message = 'Invalid input format';
  } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    // MongoDB specific errors
    statusCode = handleMongoError(error as any);
    errorCode = 'DATABASE_ERROR';
    message = 'Database operation failed';
  } else if (error.name === 'ConditionalCheckFailedException') {
    // DynamoDB conditional check failed
    statusCode = 409;
    errorCode = 'CONFLICT';
    message = 'Resource conflict or not found';
  } else if (error.name === 'ResourceNotFoundException') {
    // DynamoDB resource not found
    statusCode = 404;
    errorCode = 'NOT_FOUND';
    message = 'Resource not found';
  } else if (error.name === 'ProvisionedThroughputExceededException') {
    // DynamoDB throttling
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    message = 'Too many requests, please try again later';
  } else if (error.name === 'JsonWebTokenError') {
    // JWT related errors
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
    
    logSecurityEvent('invalid_jwt_token', {
      ...errorContext,
      jwtError: error.message
    }, 'warn');
    
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
    
    logSecurityEvent('expired_jwt_token', errorContext, 'info');
    
  } else if (error.name === 'SyntaxError' && 'body' in error) {
    // JSON parsing error
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (error.name === 'MulterError') {
    // File upload errors
    const multerError = error as any;
    statusCode = 400;
    errorCode = 'FILE_UPLOAD_ERROR';
    
    switch (multerError.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      default:
        message = 'File upload failed';
    }
  }

  // Log security-related errors
  if (statusCode === 401 || statusCode === 403) {
    securityLogger.warn('Security error', {
      errorCode,
      message,
      statusCode,
      ...errorContext
    });
  }

  // Log rate limiting
  if (statusCode === 429) {
    logSecurityEvent('rate_limit_exceeded', {
      ...errorContext,
      errorCode,
      message
    }, 'warn');
  }

  // Prepare error response
  const errorResponse: any = {
    error: errorCode,
    message,
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  };

  // Add details for validation errors
  if (details) {
    errorResponse.details = details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development' && !(error instanceof AppError)) {
    errorResponse.stack = error.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);

  // Report critical errors to monitoring service
  if (statusCode >= 500) {
    reportCriticalError(error, errorContext);
  }
};

/**
 * Parse validation errors into a structured format
 */
function parseValidationErrors(error: any): any {
  if (error.errors) {
    // Mongoose validation errors
    const errors: any = {};
    
    Object.keys(error.errors).forEach(key => {
      const err = error.errors[key];
      errors[key] = {
        message: err.message,
        value: err.value,
        kind: err.kind
      };
    });
    
    return errors;
  }
  
  // Zod validation errors
  if (error.issues) {
    return error.issues.map((issue: any) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }));
  }
  
  return null;
}

/**
 * Handle MongoDB specific errors
 */
function handleMongoError(error: any): number {
  if (error.code) {
    switch (error.code) {
      case 11000: // Duplicate key error
        return 409;
      case 121: // Document validation failed
        return 400;
      case 50: // MaxTimeMSExpired
        return 408;
      default:
        return 500;
    }
  }
  return 500;
}

/**
 * Report critical errors to monitoring service
 */
function reportCriticalError(error: Error, context: any): void {
  // In production, this would integrate with services like Sentry, DataDog, etc.
  logger.error('Critical error reported', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context,
    severity: 'CRITICAL',
    alertRequired: true
  });

  // Could also send to external monitoring services
  // Example: Sentry.captureException(error, { contexts: { request: context } });
}

/**
 * Async error handler wrapper
 * Catches async errors in route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const error = {
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId
  };

  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  res.status(404).json(error);
};

/**
 * Validation error helper
 */
export function createValidationError(message: string, details?: any): ValidationError {
  return new ValidationError(message, details);
}

/**
 * Database error helper
 */
export function createDatabaseError(operation: string, originalError?: Error): AppError {
  logger.error(`Database operation failed: ${operation}`, originalError);
  return new AppError('Database operation failed', 500, 'DATABASE_ERROR');
}

/**
 * External service error helper
 */
export function createExternalServiceError(service: string, operation: string): AppError {
  return new AppError(
    `External service error: ${service} ${operation}`, 
    502, 
    'EXTERNAL_SERVICE_ERROR'
  );
}

/**
 * Rate limit error helper
 */
export function createRateLimitError(retryAfter?: number): AppError {
  const error = new AppError(
    'Rate limit exceeded. Too many requests.',
    429,
    'RATE_LIMIT_EXCEEDED'
  );
  
  if (retryAfter) {
    (error as any).retryAfter = retryAfter;
  }
  
  return error;
}

export { };