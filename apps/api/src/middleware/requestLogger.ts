import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import { AuthenticatedRequest } from '@/types';
import { logger, performanceLogger, createRequestContext } from '@/utils/logger';

/**
 * Request logging middleware
 * Logs all incoming requests with performance metrics and context
 */
export const requestLogger = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Generate unique request ID
  req.requestId = nanoid();
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  
  // Capture request start time
  const startTime = Date.now();
  
  // Log incoming request (excluding sensitive data)
  const requestInfo = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    contentLength: req.get('content-length'),
    contentType: req.get('content-type'),
    origin: req.get('origin'),
    referer: req.get('referer'),
    acceptLanguage: req.get('accept-language'),
    timestamp: new Date().toISOString()
  };

  logger.info('Incoming request', requestInfo);

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  const originalJson = res.json;
  
  let responseBody: any = null;
  let responseSize = 0;

  // Capture response body for logging (excluding sensitive data)
  res.json = function(obj: any) {
    responseBody = obj;
    responseSize = JSON.stringify(obj).length;
    return originalJson.call(this, obj);
  };

  res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), cb?: (() => void)) {
    const duration = Date.now() - startTime;
    
    // Calculate response size if not already captured
    if (!responseSize && chunk) {
      responseSize = typeof chunk === 'string' ? chunk.length : chunk?.length || 0;
    }

    // Log response
    const responseInfo = {
      requestId: req.requestId,
      statusCode: res.statusCode,
      duration,
      responseSize,
      userId: req.user?.sub,
      clinicId: req.clinicId,
      cached: res.get('x-cache-hit') === 'true',
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      success: res.statusCode < 400,
      timestamp: new Date().toISOString()
    };

    // Log to performance logger
    performanceLogger.info('Request completed', responseInfo);

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        ...responseInfo,
        slowRequestThreshold: 1000
      });
    }

    // Log error responses
    if (res.statusCode >= 400) {
      const logLevel = res.statusCode >= 500 ? 'error' : 'warn';
      logger[logLevel]('Request failed', {
        ...responseInfo,
        errorResponse: sanitizeResponseForLogging(responseBody)
      });
    }

    // Log successful requests in debug mode
    if (res.statusCode < 400 && process.env.LOG_LEVEL === 'debug') {
      logger.debug('Request successful', responseInfo);
    }

    return originalEnd.call(this, chunk, encoding as any, cb);
  };

  next();
};

/**
 * Sanitize response data for logging (remove PHI and sensitive info)
 */
function sanitizeResponseForLogging(responseBody: any): any {
  if (!responseBody || typeof responseBody !== 'object') {
    return responseBody;
  }

  const sanitized = { ...responseBody };

  // Remove sensitive fields
  const sensitiveFields = [
    'password', 'token', 'accessToken', 'refreshToken', 'apiKey',
    'ssn', 'creditCard', 'bankAccount', 'encryptedFields'
  ];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  // Sanitize nested data arrays
  if (sanitized.data && Array.isArray(sanitized.data)) {
    sanitized.data = sanitized.data.map((item: any) => {
      if (typeof item === 'object' && item !== null) {
        const sanitizedItem = { ...item };
        
        // Remove PHI fields commonly found in medical records
        const phiFields = [
          'firstName', 'lastName', 'fullName', 'phone', 'email', 
          'address', 'dateOfBirth', 'ssn', 'patientName', 'patientPhone'
        ];
        
        phiFields.forEach(field => {
          if (sanitizedItem[field]) {
            sanitizedItem[field] = '[PHI_REDACTED]';
          }
        });
        
        return sanitizedItem;
      }
      return item;
    });
    
    // Limit array size in logs
    if (sanitized.data.length > 10) {
      sanitized.data = [
        ...sanitized.data.slice(0, 5),
        `[... ${sanitized.data.length - 10} more items ...]`,
        ...sanitized.data.slice(-5)
      ];
    }
  }

  return sanitized;
}

/**
 * Health check request logger (minimal logging for health checks)
 */
export const healthCheckLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Only log health check requests in debug mode
  if (process.env.LOG_LEVEL === 'debug') {
    logger.debug('Health check request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Error request context logger
 * Captures additional context when errors occur
 */
export const errorContextLogger = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Store original request body for error logging
  let requestBody: any = null;
  
  if (req.body && Object.keys(req.body).length > 0) {
    // Sanitize request body before storing
    requestBody = sanitizeRequestBodyForLogging(req.body);
  }

  // Store in request object for error handler access
  (req as any).sanitizedBody = requestBody;

  next();
};

/**
 * Sanitize request body for error logging
 */
function sanitizeRequestBodyForLogging(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };

  // Remove sensitive fields
  const sensitiveFields = [
    'password', 'currentPassword', 'newPassword', 'token',
    'ssn', 'socialSecurityNumber', 'creditCard', 'bankAccount'
  ];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  // Remove PHI fields
  const phiFields = [
    'firstName', 'lastName', 'dateOfBirth', 'phone', 'email',
    'address', 'emergencyContact', 'insurance'
  ];

  phiFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[PHI_REDACTED]';
    }
  });

  return sanitized;
}

/**
 * API version logger
 * Logs API version usage for analytics
 */
export const apiVersionLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const apiVersion = req.path.match(/\/v(\d+)\//)?.[1] || 'unknown';
  
  // Add API version to request for other middleware
  (req as any).apiVersion = apiVersion;
  
  // Log API version usage (aggregated)
  if (Math.random() < 0.01) { // Sample 1% of requests
    logger.info('API version usage', {
      version: apiVersion,
      endpoint: req.path,
      method: req.method,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Request correlation logger
 * Tracks requests across microservices
 */
export const correlationLogger = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Check for existing correlation ID from upstream services
  const correlationId = req.headers['x-correlation-id'] as string || 
                       req.headers['x-request-id'] as string ||
                       req.requestId;

  // Set correlation ID on request and response
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  // Log correlation tracking
  logger.debug('Request correlation', {
    correlationId,
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    timestamp: new Date().toISOString()
  });

  next();
};

export { };