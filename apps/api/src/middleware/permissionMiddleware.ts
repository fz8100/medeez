import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, ForbiddenError } from '@/types';
import { logger, logSecurityEvent } from '@/utils/logger';

/**
 * Role-based data filtering middleware
 * Provides utilities for filtering data based on user roles and permissions
 */
export class RoleBasedFilter {
  /**
   * Check if user is system administrator
   */
  static isSystemAdmin(req: AuthenticatedRequest): boolean {
    const userGroups = req.user?.['cognito:groups'] || [];
    return userGroups.includes('SystemAdmin');
  }

  /**
   * Check if user is clinic administrator
   */
  static isClinicAdmin(req: AuthenticatedRequest): boolean {
    const userGroups = req.user?.['cognito:groups'] || [];
    return userGroups.includes('Admin') || userGroups.includes('SystemAdmin');
  }

  /**
   * Check if user is a healthcare provider (Doctor)
   */
  static isProvider(req: AuthenticatedRequest): boolean {
    const userGroups = req.user?.['cognito:groups'] || [];
    return userGroups.includes('Doctor') || 
           userGroups.includes('Admin') || 
           userGroups.includes('SystemAdmin');
  }

  /**
   * Get user's access level for data filtering
   */
  static getAccessLevel(req: AuthenticatedRequest): 'system' | 'clinic' | 'user' {
    if (this.isSystemAdmin(req)) return 'system';
    if (this.isClinicAdmin(req)) return 'clinic';
    return 'user';
  }

  /**
   * Filter sensitive data based on user role
   */
  static filterSensitiveData<T extends Record<string, any>>(
    data: T,
    req: AuthenticatedRequest,
    sensitiveFields: string[] = []
  ): Partial<T> {
    const isSystemAdmin = this.isSystemAdmin(req);
    const isAdmin = this.isClinicAdmin(req);
    
    // System admins see all data except PHI
    if (isSystemAdmin) {
      const filtered = { ...data };
      const phiFields = ['ssn', 'medicalRecord', 'diagnosis', 'medications', 'allergies'];
      phiFields.forEach(field => delete filtered[field]);
      return filtered;
    }

    // Clinic admins see clinic-relevant data
    if (isAdmin) {
      const filtered = { ...data };
      sensitiveFields.forEach(field => delete filtered[field]);
      return filtered;
    }

    // Staff/Doctors see limited data
    const allowedFields = [
      'id', 'name', 'email', 'phone', 'address', 'dateOfBirth', 
      'appointmentHistory', 'invoiceHistory', 'createdAt', 'updatedAt'
    ];
    
    const filtered: Partial<T> = {};
    allowedFields.forEach(field => {
      if (field in data) {
        (filtered as any)[field] = data[field];
      }
    });

    return filtered;
  }

  /**
   * Apply pagination limits based on user role
   */
  static getRoleBasisedLimit(req: AuthenticatedRequest, requestedLimit?: number): number {
    const defaultLimit = requestedLimit || 25;
    const maxLimits = {
      system: 500,    // SystemAdmin can fetch more for platform analytics
      clinic: 200,    // Clinic admins need higher limits for management
      user: 50        // Regular users have conservative limits
    };

    const accessLevel = this.getAccessLevel(req);
    return Math.min(defaultLimit, maxLimits[accessLevel]);
  }

  /**
   * Get time range restrictions based on user role
   */
  static getTimeRangeRestriction(req: AuthenticatedRequest): {
    maxDays: number;
    allowHistorical: boolean;
  } {
    const accessLevel = this.getAccessLevel(req);
    
    switch (accessLevel) {
      case 'system':
        return { maxDays: 3650, allowHistorical: true }; // 10 years for system admins
      case 'clinic':
        return { maxDays: 730, allowHistorical: true };  // 2 years for clinic admins
      default:
        return { maxDays: 180, allowHistorical: true };  // 6 months for regular users
    }
  }
}

/**
 * Middleware to enforce role-based data access restrictions
 */
export const roleBasedAccess = (options?: {
  allowedRoles?: string[];
  requireClinicAccess?: boolean;
  allowSystemAdminOverride?: boolean;
}) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const userGroups = req.user['cognito:groups'] || [];
      const isSystemAdmin = userGroups.includes('SystemAdmin');
      
      // System admin override check
      if (isSystemAdmin && options?.allowSystemAdminOverride !== false) {
        // Log system admin access for audit
        logSecurityEvent('system_admin_access', {
          userId: req.user.sub,
          endpoint: req.originalUrl,
          method: req.method,
          targetClinic: req.clinicId,
          ip: req.ip
        }, 'info');
        
        return next();
      }

      // Role-based access check
      if (options?.allowedRoles) {
        const hasAllowedRole = options.allowedRoles.some(role => 
          userGroups.includes(role) || isSystemAdmin
        );
        
        if (!hasAllowedRole) {
          logSecurityEvent('role_access_denied', {
            userId: req.user.sub,
            allowedRoles: options.allowedRoles,
            userRoles: userGroups,
            endpoint: req.originalUrl
          }, 'warn');
          
          throw new ForbiddenError('Insufficient role permissions');
        }
      }

      // Clinic access requirement
      if (options?.requireClinicAccess && !req.clinicId && !isSystemAdmin) {
        throw new ForbiddenError('Clinic access required');
      }

      next();

    } catch (error) {
      if (error instanceof ForbiddenError) {
        res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('Role-based access middleware error', error);
        res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Access control validation failed',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
};

/**
 * Middleware to add role context to request
 */
export const addRoleContext = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user) {
    req.roleContext = {
      accessLevel: RoleBasedFilter.getAccessLevel(req),
      isSystemAdmin: RoleBasedFilter.isSystemAdmin(req),
      isClinicAdmin: RoleBasedFilter.isClinicAdmin(req),
      isProvider: RoleBasedFilter.isProvider(req),
      maxLimit: RoleBasedFilter.getRoleBasisedLimit(req),
      timeRestriction: RoleBasedFilter.getTimeRangeRestriction(req)
    };
  }
  
  next();
};

/**
 * Cross-tenant access validation for SuperAdmin
 */
export const validateCrossTenantAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    
    if (!isSystemAdmin) {
      // Regular users can only access their own clinic data
      return next();
    }

    // SystemAdmin cross-tenant access
    const targetClinicId = req.headers['x-target-clinic'] as string || 
                          req.query.clinicId as string ||
                          req.body?.clinicId;

    if (targetClinicId && targetClinicId !== req.user?.clinicId) {
      // Log cross-tenant access
      logSecurityEvent('cross_tenant_access', {
        adminUserId: req.user?.sub,
        adminClinicId: req.user?.clinicId,
        targetClinicId,
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip
      }, 'warn');

      // Override clinic ID for this request
      req.clinicId = targetClinicId;
      req.crossTenantAccess = true;
    }

    next();

  } catch (error) {
    logger.error('Cross-tenant validation error', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Cross-tenant validation failed',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * PHI access logging middleware
 */
export const logPhiAccess = (resourceType: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Track PHI access for HIPAA compliance
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Log PHI access after successful response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        logSecurityEvent('phi_access', {
          userId: req.user?.sub,
          clinicId: req.clinicId,
          resourceType,
          resourceId: req.params?.id || req.params?.patientId,
          endpoint: req.originalUrl,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          crossTenantAccess: req.crossTenantAccess || false
        }, 'info');
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
};

/**
 * Data export restrictions
 */
export const exportRestrictions = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const isAdmin = userGroups.includes('Admin');
    
    // Only admins and system admins can export data
    if (!isAdmin && !isSystemAdmin) {
      throw new ForbiddenError('Data export requires administrative privileges');
    }

    // Apply export limits
    const maxRecords = isSystemAdmin ? 10000 : 1000;
    req.exportLimits = {
      maxRecords,
      allowPHI: isAdmin && !isSystemAdmin, // Only clinic admins can export PHI
      formatRestrictions: isSystemAdmin ? [] : ['raw'] // System admins can export raw format
    };

    next();

  } catch (error) {
    if (error instanceof ForbiddenError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('Export restrictions middleware error', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Export validation failed',
        timestamp: new Date().toISOString()
      });
    }
  }
};

// Extend AuthenticatedRequest interface
declare module '@/types' {
  interface AuthenticatedRequest {
    roleContext?: {
      accessLevel: 'system' | 'clinic' | 'user';
      isSystemAdmin: boolean;
      isClinicAdmin: boolean;
      isProvider: boolean;
      maxLimit: number;
      timeRestriction: { maxDays: number; allowHistorical: boolean };
    };
    crossTenantAccess?: boolean;
    exportLimits?: {
      maxRecords: number;
      allowPHI: boolean;
      formatRestrictions: string[];
    };
  }
}