import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, ForbiddenError } from '@/types';
import { logger, logSecurityEvent } from '@/utils/logger';

/**
 * Tenant isolation middleware
 * Ensures all operations are scoped to the user's clinic (tenant)
 * Critical for multi-tenant security and HIPAA compliance
 */
export const tenantMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // User must be authenticated before tenant scoping
    if (!req.user || !req.user.clinicId) {
      throw new ForbiddenError('Tenant context required');
    }

    // Extract clinic ID from various sources and validate consistency
    const clinicSources = {
      user: req.user.clinicId,
      header: req.headers['x-clinic-id'] as string,
      body: req.body?.clinicId,
      params: req.params?.clinicId,
      query: req.query?.clinicId as string
    };

    // Primary source is always the authenticated user's clinic
    const userClinicId = req.user.clinicId;
    req.clinicId = userClinicId;

    // Validate that any provided clinic IDs match the user's clinic
    Object.entries(clinicSources).forEach(([source, clinicId]) => {
      if (clinicId && clinicId !== userClinicId) {
        logSecurityEvent('tenant_isolation_violation', {
          userId: req.user?.sub,
          userClinicId,
          attemptedClinicId: clinicId,
          source,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          url: req.originalUrl,
          method: req.method
        }, 'error');

        throw new ForbiddenError('Cross-tenant access denied');
      }
    });

    // Override any clinic IDs in request body with user's clinic ID
    if (req.body && typeof req.body === 'object') {
      req.body.clinicId = userClinicId;
    }

    // Add tenant context to response headers for debugging
    if (process.env.NODE_ENV === 'development') {
      res.setHeader('X-Tenant-Id', userClinicId);
    }

    logger.debug('Tenant middleware applied', {
      userId: req.user.sub,
      clinicId: userClinicId,
      url: req.originalUrl
    });

    next();

  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('Tenant middleware error', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Tenant validation failed',
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Cross-tenant access middleware for system admins
 * Allows system administrators to access different tenants
 * Should be used sparingly and with audit logging
 */
export const systemAdminTenantOverride = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('Authentication required');
    }

    const userGroups = req.user['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');

    if (!isSystemAdmin) {
      // Fall back to normal tenant middleware
      return tenantMiddleware(req, res, next);
    }

    // System admin can specify target clinic
    const targetClinicId = req.headers['x-target-clinic-id'] as string || 
                          req.query.targetClinicId as string ||
                          req.user.clinicId;

    req.clinicId = targetClinicId;

    // Log system admin cross-tenant access
    if (targetClinicId !== req.user.clinicId) {
      logSecurityEvent('system_admin_cross_tenant_access', {
        adminUserId: req.user.sub,
        adminClinicId: req.user.clinicId,
        targetClinicId,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        url: req.originalUrl,
        method: req.method
      }, 'warn');
    }

    // Override clinic ID in request body
    if (req.body && typeof req.body === 'object') {
      req.body.clinicId = targetClinicId;
    }

    logger.debug('System admin tenant override applied', {
      adminUserId: req.user.sub,
      targetClinicId,
      url: req.originalUrl
    });

    next();

  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('System admin tenant middleware error', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Tenant validation failed',
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Validate tenant context in database operations
 * Helper function to ensure all DB queries include proper tenant scoping
 */
export function validateTenantContext(
  requestClinicId: string | undefined,
  resourceClinicId: string,
  operation: string = 'access'
): void {
  if (!requestClinicId) {
    throw new ForbiddenError('Missing tenant context');
  }

  if (requestClinicId !== resourceClinicId) {
    logSecurityEvent('tenant_data_access_violation', {
      requestClinicId,
      resourceClinicId,
      operation
    }, 'error');

    throw new ForbiddenError('Cross-tenant data access denied');
  }
}

/**
 * Ensure tenant scoping in DynamoDB partition keys
 * Helper function to format partition keys with tenant prefix
 */
export function createTenantPartitionKey(clinicId: string, entityType?: string): string {
  if (!clinicId) {
    throw new Error('Clinic ID required for tenant partition key');
  }

  return entityType ? `TENANT#${clinicId}#${entityType}` : `TENANT#${clinicId}`;
}

/**
 * Extract clinic ID from tenant partition key
 */
export function extractClinicIdFromPartitionKey(partitionKey: string): string {
  const match = partitionKey.match(/^TENANT#([^#]+)/);
  if (!match) {
    throw new Error(`Invalid tenant partition key format: ${partitionKey}`);
  }
  return match[1];
}

/**
 * Middleware to validate resource ownership
 * Ensures users can only access resources within their tenant
 */
export const validateResourceOwnership = (getResourceClinicId: (req: AuthenticatedRequest) => Promise<string>) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.clinicId) {
        throw new ForbiddenError('Tenant context required');
      }

      const resourceClinicId = await getResourceClinicId(req);
      validateTenantContext(req.clinicId, resourceClinicId, 'resource_access');

      next();

    } catch (error) {
      if (error instanceof ForbiddenError) {
        res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('Resource ownership validation failed', error);
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Resource validation failed',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
};

export { };