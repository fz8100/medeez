import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, AuditAction } from '@/types';
import { auditLogger, logAuditEvent } from '@/utils/logger';
import { rdsService } from '@/services/rdsService';

/**
 * HIPAA audit logging middleware
 * Logs all access to PHI and other sensitive operations
 */
export const auditLogger = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Capture request start time
  const startTime = Date.now();
  
  // Store original res.json to capture response
  const originalJson = res.json;
  let responseData: any = null;
  let responseSize = 0;

  res.json = function(data: any) {
    responseData = data;
    responseSize = JSON.stringify(data).length;
    return originalJson.call(this, data);
  };

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const isSuccess = res.statusCode < 400;
    
    // Determine audit action based on HTTP method and route
    const auditAction = determineAuditAction(req.method, req.route?.path || req.path);
    
    // Determine resource type from route
    const resourceType = determineResourceType(req.route?.path || req.path);
    
    // Extract resource ID from params or body
    const resourceId = extractResourceId(req);

    // Check if this operation accessed PHI
    const phiAccessed = isPHIAccess(resourceType, auditAction);

    // Create audit log entry
    const auditEntry = {
      auditType: 'API_ACCESS',
      action: auditAction,
      resourceType,
      resourceId,
      userId: req.user?.sub || 'ANONYMOUS',
      clinicId: req.clinicId || 'UNKNOWN',
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || '',
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      success: isSuccess,
      duration,
      requestSize: req.get('content-length') ? parseInt(req.get('content-length')!) : 0,
      responseSize,
      phiAccessed,
      details: {
        queryParams: sanitizeQueryParams(req.query),
        pathParams: req.params,
        hasRequestBody: !!req.body && Object.keys(req.body).length > 0,
        responseType: responseData?.data ? 'success' : (responseData?.error ? 'error' : 'unknown'),
        errorCode: responseData?.error?.code
      }
    };

    // Log to audit logger
    auditLogger.info('API Access', auditEntry);

    // Additional logging for high-risk operations
    if (phiAccessed || !isSuccess || duration > 5000) {
      const logLevel = !isSuccess ? 'warn' : (duration > 5000 ? 'warn' : 'info');
      auditLogger[logLevel]('High Risk Operation', {
        ...auditEntry,
        riskFactors: {
          phiAccessed,
          failed: !isSuccess,
          slowResponse: duration > 5000,
          largeBulkOperation: responseSize > 100000
        }
      });
    }

    // Log specific HIPAA events
    if (phiAccessed) {
      logAuditEvent(
        auditAction,
        resourceType,
        resourceId,
        req.user?.sub || 'ANONYMOUS',
        req.clinicId || 'UNKNOWN',
        {
          success: isSuccess,
          duration,
          dataSize: responseSize,
          accessMethod: 'API'
        },
        req
      );
    }
  });

  // Continue to next middleware
  next();
};

/**
 * Determine audit action from HTTP method and route
 */
function determineAuditAction(method: string, path: string): AuditAction {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'READ';
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return 'READ';
  }
}

/**
 * Determine resource type from route path
 */
function determineResourceType(path: string): string {
  const pathSegments = path.split('/').filter(segment => segment && !segment.startsWith(':'));
  
  // Map route segments to resource types
  const resourceMap: Record<string, string> = {
    'patients': 'PATIENT',
    'appointments': 'APPOINTMENT',
    'notes': 'NOTE',
    'invoices': 'INVOICE',
    'claims': 'CLAIM',
    'users': 'USER',
    'clinics': 'CLINIC',
    'attachments': 'ATTACHMENT',
    'integrations': 'INTEGRATION',
    'auth': 'AUTHENTICATION',
    'webhooks': 'WEBHOOK'
  };

  // Find the main resource in the path
  for (const segment of pathSegments) {
    if (resourceMap[segment]) {
      return resourceMap[segment];
    }
  }

  return 'UNKNOWN';
}

/**
 * Extract resource ID from request parameters or body
 */
function extractResourceId(req: AuthenticatedRequest): string {
  // Try to get ID from path parameters
  const idParams = ['id', 'patientId', 'appointmentId', 'noteId', 'invoiceId', 'userId'];
  
  for (const param of idParams) {
    if (req.params[param]) {
      return req.params[param];
    }
  }

  // Try to get ID from request body (for create operations)
  if (req.body) {
    for (const param of idParams) {
      if (req.body[param]) {
        return req.body[param];
      }
    }
  }

  return 'UNKNOWN';
}

/**
 * Check if operation accesses PHI
 */
function isPHIAccess(resourceType: string, action: AuditAction): boolean {
  const phiResources = ['PATIENT', 'APPOINTMENT', 'NOTE', 'INVOICE', 'CLAIM'];
  return phiResources.includes(resourceType);
}

/**
 * Sanitize query parameters for logging (remove PHI)
 */
function sanitizeQueryParams(query: any): any {
  const sanitized = { ...query };
  
  // Remove potential PHI fields from query params
  const phiFields = [
    'firstName', 'lastName', 'name', 'phone', 'email', 
    'ssn', 'dateOfBirth', 'address', 'search'
  ];
  
  phiFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[PHI_REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Middleware for logging specific HIPAA events
 */
export const logHIPAAEvent = (eventType: string, details: any = {}) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Log the HIPAA event
    auditLogger.info(`HIPAA Event: ${eventType}`, {
      auditType: 'HIPAA_EVENT',
      eventType,
      userId: req.user?.sub,
      clinicId: req.clinicId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      details
    });

    next();
  };
};

/**
 * Middleware for logging data exports (special HIPAA requirement)
 */
export const logDataExport = (exportType: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data: any) {
      // Log the export event
      auditLogger.warn('Data Export Event', {
        auditType: 'DATA_EXPORT',
        exportType,
        userId: req.user?.sub,
        clinicId: req.clinicId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        dataSize: typeof data === 'string' ? data.length : JSON.stringify(data).length,
        success: res.statusCode < 400,
        details: {
          format: req.query.format || 'json',
          filters: sanitizeQueryParams(req.query)
        }
      });

      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Middleware for logging authentication events
 */
export const logAuthEvent = (eventType: 'LOGIN' | 'LOGOUT' | 'TOKEN_REFRESH' | 'PASSWORD_RESET') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    
    res.json = function(data: any) {
      const isSuccess = res.statusCode < 400;
      
      auditLogger.info(`Auth Event: ${eventType}`, {
        auditType: 'AUTHENTICATION',
        action: eventType,
        userId: req.user?.sub || req.body?.username || 'UNKNOWN',
        clinicId: req.user?.clinicId || req.body?.clinicId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        success: isSuccess,
        details: {
          method: req.method,
          url: req.originalUrl,
          errorCode: data?.error?.code,
          mfaUsed: req.body?.mfaCode ? true : false
        }
      });

      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Middleware for logging administrative actions
 */
export const logAdminAction = (actionType: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    
    res.json = function(data: any) {
      const isSuccess = res.statusCode < 400;
      
      auditLogger.warn(`Admin Action: ${actionType}`, {
        auditType: 'ADMINISTRATIVE',
        action: actionType,
        adminUserId: req.user?.sub,
        targetUserId: req.params?.userId || req.body?.userId,
        clinicId: req.clinicId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        success: isSuccess,
        details: {
          changes: req.body,
          targetResource: extractResourceId(req),
          errorCode: data?.error?.code
        }
      });

      return originalJson.call(this, data);
    };

    next();
  };
};

export { };