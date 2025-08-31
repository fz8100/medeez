import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/types';
import { logger, logSecurityEvent } from '@/utils/logger';
import { createRateLimitError } from './errorHandler';

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

/**
 * Create a rate limiter with custom configuration
 */
function createRateLimiter(config: RateLimitConfig) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    skipFailedRequests: config.skipFailedRequests || false,
    
    keyGenerator: config.keyGenerator || ((req: Request) => {
      const authReq = req as AuthenticatedRequest;
      // Use user ID if authenticated, otherwise IP address
      return authReq.user?.sub || req.ip;
    }),
    
    handler: (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      
      // Log rate limit exceeded event
      logSecurityEvent('rate_limit_exceeded', {
        ip: req.ip,
        userId: authReq.user?.sub,
        clinicId: authReq.clinicId,
        userAgent: req.get('user-agent'),
        url: req.originalUrl,
        method: req.method,
        rateLimitType: 'general'
      }, 'warn');

      const error = createRateLimitError(Math.ceil(config.windowMs / 1000));
      res.status(429).json({
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    },

    onLimitReached: (req: Request) => {
      const authReq = req as AuthenticatedRequest;
      
      logger.warn('Rate limit reached', {
        ip: req.ip,
        userId: authReq.user?.sub,
        clinicId: authReq.clinicId,
        url: req.originalUrl,
        method: req.method
      });
    }
  });
}

/**
 * General API rate limiter
 * 1000 requests per 15 minutes per user/IP
 */
export const rateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many API requests, please try again later'
});

/**
 * Authentication rate limiter
 * 10 login attempts per 15 minutes per IP
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: (req: Request) => req.ip // Always use IP for auth attempts
});

/**
 * Password reset rate limiter
 * 5 password reset requests per hour per IP
 */
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many password reset requests, please try again later',
  keyGenerator: (req: Request) => req.ip
});

/**
 * File upload rate limiter
 * 50 file uploads per hour per user
 */
export const fileUploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: 'Too many file uploads, please try again later'
});

/**
 * Search rate limiter
 * 200 searches per 5 minutes per user (to prevent data scraping)
 */
export const searchRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 200,
  message: 'Too many search requests, please slow down'
});

/**
 * Export rate limiter
 * 10 data exports per hour per user (HIPAA compliance)
 */
export const exportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many export requests, please try again later'
});

/**
 * Webhook rate limiter
 * 1000 webhook calls per 5 minutes per source
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000,
  message: 'Too many webhook requests',
  keyGenerator: (req: Request) => {
    // Use webhook source or IP
    const source = req.headers['x-webhook-source'] as string || 
                   req.headers['user-agent'] as string ||
                   req.ip;
    return source;
  }
});

/**
 * Strict rate limiter for sensitive operations
 * 30 requests per 10 minutes per user
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  message: 'Rate limit exceeded for sensitive operation'
});

/**
 * Email/SMS rate limiter
 * 100 messages per hour per clinic
 */
export const messagingRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many messages sent, please try again later',
  keyGenerator: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.clinicId || req.ip;
  }
});

/**
 * Public booking rate limiter
 * 20 booking attempts per hour per IP (for public booking pages)
 */
export const bookingRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many booking requests, please try again later',
  keyGenerator: (req: Request) => req.ip
});

/**
 * Magic link rate limiter
 * 5 magic links per hour per email/phone
 */
export const magicLinkRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many magic link requests, please try again later',
  keyGenerator: (req: Request) => {
    // Use email or phone from request body
    const identifier = req.body?.email || req.body?.phone || req.ip;
    return identifier;
  }
});

/**
 * Advanced rate limiter with dynamic limits based on user tier
 */
export const dynamicRateLimiter = (baseLimits: RateLimitConfig) => {
  return createRateLimiter({
    ...baseLimits,
    max: (req: Request) => {
      const authReq = req as AuthenticatedRequest;
      const userGroups = authReq.user?.['cognito:groups'] || [];
      
      // Different limits based on user type
      if (userGroups.includes('SystemAdmin')) {
        return baseLimits.max * 10; // 10x limit for system admins
      } else if (userGroups.includes('Admin')) {
        return baseLimits.max * 3; // 3x limit for clinic admins
      } else if (userGroups.includes('Doctor')) {
        return baseLimits.max * 2; // 2x limit for doctors
      }
      
      return baseLimits.max; // Base limit for staff
    }
  });
};

/**
 * Cost-optimization rate limiter for expensive operations
 * Limits expensive DynamoDB operations
 */
export const expensiveOperationRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: 'Too many resource-intensive requests, please slow down',
  keyGenerator: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    return `${authReq.clinicId || 'unknown'}:expensive`;
  }
});

/**
 * Middleware to apply different rate limits based on endpoint sensitivity
 */
export const adaptiveRateLimiter = (req: Request, res: Response, next: Function) => {
  const path = req.path.toLowerCase();
  const method = req.method.toLowerCase();
  
  // Determine which rate limiter to apply
  if (path.includes('/auth/login') || path.includes('/auth/register')) {
    return authRateLimiter(req, res, next);
  } else if (path.includes('/auth/reset-password') || path.includes('/auth/forgot-password')) {
    return passwordResetRateLimiter(req, res, next);
  } else if (path.includes('/upload') || method === 'post' && path.includes('/attachments')) {
    return fileUploadRateLimiter(req, res, next);
  } else if (path.includes('/search') || req.query.search) {
    return searchRateLimiter(req, res, next);
  } else if (path.includes('/export') || req.query.export) {
    return exportRateLimiter(req, res, next);
  } else if (path.includes('/webhooks')) {
    return webhookRateLimiter(req, res, next);
  } else if (path.includes('/magic-link')) {
    return magicLinkRateLimiter(req, res, next);
  } else if (path.includes('/book') && !req.headers.authorization) {
    // Public booking endpoints
    return bookingRateLimiter(req, res, next);
  } else {
    // Default rate limiter
    return rateLimiter(req, res, next);
  }
};

export { };