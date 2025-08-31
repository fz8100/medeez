import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-client';
import { AuthenticatedRequest, UnauthorizedError, ForbiddenError } from '@/types';
import { logger, securityLogger, logSecurityEvent } from '@/utils/logger';

interface CognitoJWTPayload {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  token_use: 'access' | 'id';
  email?: string;
  email_verified?: boolean;
  'cognito:groups'?: string[];
  'cognito:username': string;
  'custom:clinicId'?: string;
  'custom:role'?: string;
}

export class AuthenticationService {
  private jwksClient: jwksClient.JwksClient;
  private userPoolId: string;
  private region: string;

  constructor() {
    this.userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    this.region = process.env.AWS_REGION || 'us-east-1';
    
    if (!this.userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID environment variable is required');
    }

    // Initialize JWKS client for Cognito token validation
    this.jwksClient = jwksClient({
      jwksUri: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }

  /**
   * Get signing key for JWT verification
   */
  private async getSigningKey(kid: string): Promise<string> {
    try {
      const key = await this.jwksClient.getSigningKey(kid);
      return key.getPublicKey();
    } catch (error) {
      logger.error('Failed to get signing key', { kid, error });
      throw new UnauthorizedError('Invalid token signature');
    }
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<CognitoJWTPayload> {
    try {
      // Decode header to get key ID
      const header = jwt.decode(token, { complete: true });
      if (!header || typeof header === 'string' || !header.header.kid) {
        throw new Error('Invalid token structure');
      }

      // Get public key for verification
      const publicKey = await this.getSigningKey(header.header.kid);

      // Verify token
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`,
        maxAge: '1h' // Tokens expire after 1 hour
      }) as CognitoJWTPayload;

      // Additional validations
      if (decoded.token_use !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;

    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedError('Invalid token');
      } else {
        logger.error('Token verification failed', error);
        throw new UnauthorizedError('Token verification failed');
      }
    }
  }

  /**
   * Extract user information from token payload
   */
  extractUserInfo(payload: CognitoJWTPayload): {
    sub: string;
    email: string;
    clinicId: string;
    role: string;
    groups: string[];
  } {
    const email = payload.email || payload['cognito:username'];
    const clinicId = payload['custom:clinicId'];
    const role = payload['custom:role'] || 'STAFF';
    const groups = payload['cognito:groups'] || [];

    if (!clinicId) {
      throw new ForbiddenError('User not associated with any clinic');
    }

    return {
      sub: payload.sub,
      email,
      clinicId,
      role,
      groups
    };
  }

  /**
   * Check if user has required permission
   */
  hasPermission(userGroups: string[], requiredPermission: string): boolean {
    // System admin has all permissions
    if (userGroups.includes('SystemAdmin')) {
      return true;
    }

    // Check specific permission groups
    const permissionGroups: Record<string, string[]> = {
      'patients:read': ['Doctor', 'Admin', 'Staff'],
      'patients:write': ['Doctor', 'Admin'],
      'notes:read': ['Doctor', 'Admin'],
      'notes:write': ['Doctor', 'Admin'],
      'invoices:read': ['Doctor', 'Admin', 'Staff'],
      'invoices:write': ['Doctor', 'Admin'],
      'appointments:read': ['Doctor', 'Admin', 'Staff'],
      'appointments:write': ['Doctor', 'Admin', 'Staff'],
      'dashboard:read': ['Doctor', 'Admin', 'Staff', 'SystemAdmin'],
      'analytics:read': ['Doctor', 'Admin', 'Staff', 'SystemAdmin'],
      'analytics:export': ['Doctor', 'Admin', 'SystemAdmin'],
      'settings:read': ['Doctor', 'Admin', 'Staff', 'SystemAdmin'],
      'settings:write': ['Admin', 'SystemAdmin'],
      'clinic:update': ['Admin', 'SystemAdmin'],
      'system:manage': ['SystemAdmin'],
      'admin:access': ['Admin', 'SystemAdmin']
    };

    const allowedGroups = permissionGroups[requiredPermission] || [];
    return userGroups.some(group => allowedGroups.includes(group));
  }
}

const authService = new AuthenticationService();

/**
 * Authentication middleware
 * Validates JWT tokens and extracts user information
 */
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logSecurityEvent('missing_auth_token', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        url: req.originalUrl
      }, 'warn');
      
      throw new UnauthorizedError('Access token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = await authService.verifyToken(token);
    const userInfo = authService.extractUserInfo(payload);

    // Attach user information to request
    req.user = {
      sub: userInfo.sub,
      email: userInfo.email,
      clinicId: userInfo.clinicId,
      role: userInfo.role as any,
      'cognito:groups': userInfo.groups
    };

    // Set clinic ID for tenant scoping
    req.clinicId = userInfo.clinicId;

    // Log successful authentication
    logger.debug('User authenticated', {
      userId: userInfo.sub,
      clinicId: userInfo.clinicId,
      role: userInfo.role
    });

    next();

  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      logSecurityEvent('auth_failure', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        url: req.originalUrl
      }, 'warn');
      
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('Authentication middleware error', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Authentication failed',
        timestamp: new Date().toISOString()
      });
    }
  }
};

/**
 * Permission check middleware factory
 * Creates middleware that checks for specific permissions
 */
export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    const hasPermission = authService.hasPermission(
      req.user['cognito:groups'] || [],
      permission
    );

    if (!hasPermission) {
      logSecurityEvent('permission_denied', {
        userId: req.user.sub,
        clinicId: req.user.clinicId,
        requiredPermission: permission,
        userGroups: req.user['cognito:groups'],
        ip: req.ip,
        url: req.originalUrl
      }, 'warn');

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * Role-based access control middleware
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    const userGroups = req.user['cognito:groups'] || [];
    const hasAllowedRole = allowedRoles.some(role => 
      userGroups.includes(role) || userGroups.includes('SystemAdmin')
    );

    if (!hasAllowedRole) {
      logSecurityEvent('role_access_denied', {
        userId: req.user.sub,
        clinicId: req.user.clinicId,
        allowedRoles,
        userGroups,
        ip: req.ip,
        url: req.originalUrl
      }, 'warn');

      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Role access denied',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Validates token if present but doesn't require it
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const payload = await authService.verifyToken(token);
      const userInfo = authService.extractUserInfo(payload);

      req.user = {
        sub: userInfo.sub,
        email: userInfo.email,
        clinicId: userInfo.clinicId,
        role: userInfo.role as any,
        'cognito:groups': userInfo.groups
      };

      req.clinicId = userInfo.clinicId;
    } catch (error) {
      // Ignore auth errors for optional auth
      logger.debug('Optional auth failed, continuing without user', error);
    }
  }

  next();
};

/**
 * Admin-only middleware
 */
export const adminOnly = requireRole('Admin', 'SystemAdmin');

/**
 * Doctor-only middleware
 */
export const doctorOnly = requireRole('Doctor', 'Admin', 'SystemAdmin');

/**
 * Staff+ middleware (Staff, Admin, or SystemAdmin)
 */
export const staffOnly = requireRole('Staff', 'Doctor', 'Admin', 'SystemAdmin');

export { };