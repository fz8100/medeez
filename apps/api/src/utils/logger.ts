import winston from 'winston';

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Remove PHI from logs for HIPAA compliance
    const sanitizedMeta = sanitizeLogData(meta);
    
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...sanitizedMeta
    });
  })
);

// PHI patterns to redact from logs
const PHI_PATTERNS = [
  /\b\d{3}-?\d{2}-?\d{4}\b/g,           // SSN
  /\b\d{3}-?\d{3}-?\d{4}\b/g,           // Phone numbers
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,       // Dates (MM/DD/YYYY)
  /\b\d{4}-\d{2}-\d{2}\b/g,             // Dates (YYYY-MM-DD)
  /\b\d{1,5}\s+[A-Za-z0-9\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/gi, // Addresses
];

const PHI_FIELD_PATTERNS = [
  'firstName', 'lastName', 'fullName', 'name',
  'phone', 'email', 'address', 'ssn', 'dateOfBirth',
  'patientName', 'patientPhone', 'patientEmail',
  'emergencyContact', 'insurance'
];

/**
 * Sanitize log data to remove PHI for HIPAA compliance
 */
function sanitizeLogData(data: any): any {
  if (typeof data === 'string') {
    return sanitizeString(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }
  
  if (data && typeof data === 'object') {
    const sanitized: any = {};
    
    Object.keys(data).forEach(key => {
      const lowerKey = key.toLowerCase();
      
      // Check if field name suggests PHI
      if (PHI_FIELD_PATTERNS.some(pattern => lowerKey.includes(pattern))) {
        sanitized[key] = '[PHI_REDACTED]';
      }
      // Check for encrypted fields
      else if (data[key] && typeof data[key] === 'object' && data[key].encrypted) {
        sanitized[key] = '[ENCRYPTED_PHI]';
      }
      // Recursively sanitize nested objects
      else {
        sanitized[key] = sanitizeLogData(data[key]);
      }
    });
    
    return sanitized;
  }
  
  return data;
}

/**
 * Sanitize string data to remove PHI patterns
 */
function sanitizeString(str: string): string {
  let sanitized = str;
  
  PHI_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[PHI_REDACTED]');
  });
  
  return sanitized;
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: {
    service: 'medeez-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development' 
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : customFormat
    }),
    
    // File transport for production
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    ] : [])
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({ filename: 'logs/exceptions.log' })
    ] : [])
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.Console(),
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({ filename: 'logs/rejections.log' })
    ] : [])
  ]
});

/**
 * HIPAA audit logger - special logger for compliance tracking
 */
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level: 'AUDIT',
        message,
        auditType: meta.auditType || 'GENERAL',
        userId: meta.userId || 'SYSTEM',
        clinicId: meta.clinicId,
        resourceType: meta.resourceType,
        resourceId: meta.resourceId,
        action: meta.action,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        success: meta.success !== false,
        details: meta.details ? sanitizeLogData(meta.details) : undefined
      });
    })
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/audit.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
    ...(process.env.NODE_ENV === 'development' ? [
      new winston.transports.Console({ level: 'debug' })
    ] : [])
  ]
});

/**
 * Performance logger for monitoring API performance
 */
export const performanceLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/performance.log',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    })
  ]
});

/**
 * Security logger for security events
 */
export const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/security.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.Console({ level: 'warn' })
  ]
});

/**
 * Helper function to create request context for logging
 */
export function createRequestContext(req: any) {
  return {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('user-agent'),
    ip: req.ip,
    userId: req.user?.sub,
    clinicId: req.clinicId
  };
}

/**
 * Helper function to log API requests
 */
export function logAPIRequest(req: any, res: any, duration: number) {
  const context = createRequestContext(req);
  
  performanceLogger.info('API Request', {
    ...context,
    statusCode: res.statusCode,
    contentLength: res.get('content-length'),
    duration
  });
}

/**
 * Helper function to log security events
 */
export function logSecurityEvent(
  event: string,
  details: any,
  severity: 'info' | 'warn' | 'error' = 'info'
) {
  securityLogger[severity](`Security Event: ${event}`, {
    event,
    ...sanitizeLogData(details),
    timestamp: new Date().toISOString()
  });
}

/**
 * Helper function to log HIPAA audit events
 */
export function logAuditEvent(
  action: string,
  resourceType: string,
  resourceId: string,
  userId: string,
  clinicId: string,
  details: any = {},
  req?: any
) {
  auditLogger.info(`HIPAA Audit: ${action}`, {
    auditType: 'HIPAA_COMPLIANCE',
    action,
    resourceType,
    resourceId,
    userId,
    clinicId,
    ipAddress: req?.ip,
    userAgent: req?.get('user-agent'),
    requestId: req?.requestId,
    details: sanitizeLogData(details),
    phiAccessed: isResourceContainsPHI(resourceType)
  });
}

/**
 * Check if a resource type typically contains PHI
 */
function isResourceContainsPHI(resourceType: string): boolean {
  const phiResources = ['PATIENT', 'APPOINTMENT', 'NOTE', 'INVOICE', 'CLAIM'];
  return phiResources.includes(resourceType.toUpperCase());
}

/**
 * Create child logger with default context
 */
export function createChildLogger(context: any) {
  return logger.child(sanitizeLogData(context));
}

export { };