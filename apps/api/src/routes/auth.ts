import { Router } from 'express';
import { z } from 'zod';
import { authRateLimiter, passwordResetRateLimiter, magicLinkRateLimiter } from '@/middleware/rateLimiter';
import { logAuthEvent, logAdminAction } from '@/middleware/auditLogger';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest, ValidationError, UnauthorizedError, NotFoundError } from '@/types';
import { logger } from '@/utils/logger';

const router = Router();

// Validation schemas
const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  clinicSlug: z.string().optional()
});

const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number and special character'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  clinicName: z.string().min(1, 'Clinic name is required').max(200),
  npi: z.string().length(10).regex(/^\d{10}$/, 'Invalid NPI number'),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
  acceptedTerms: z.boolean().refine(val => val === true, 'Terms must be accepted'),
  acceptedHipaa: z.boolean().refine(val => val === true, 'HIPAA agreement must be accepted')
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number and special character'),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number and special character'),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

const MagicLinkSchema = z.object({
  identifier: z.string().min(1, 'Email or phone is required'),
  type: z.enum(['email', 'phone'], { required_error: 'Type must be email or phone' }),
  returnUrl: z.string().url().optional()
});

/**
 * User login
 * POST /v1/auth/login
 */
router.post('/login', 
  authRateLimiter,
  logAuthEvent('LOGIN'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const validatedData = LoginSchema.parse(req.body);
    
    try {
      // TODO: Implement Cognito login logic
      // This would typically:
      // 1. Call AWS Cognito InitiateAuth
      // 2. Handle MFA if required
      // 3. Return access/refresh tokens
      // 4. Update last login timestamp
      
      // Placeholder response
      const response = {
        success: true,
        data: {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'user-id',
            email: validatedData.email,
            clinicId: 'clinic-id',
            role: 'DOCTOR',
            firstName: 'John',
            lastName: 'Doe'
          }
        },
        timestamp: new Date().toISOString()
      };

      logger.info('User login successful', {
        userId: response.data.user.id,
        email: validatedData.email,
        clinicId: response.data.user.clinicId
      });

      res.json(response);
      
    } catch (error) {
      logger.warn('Login failed', {
        email: validatedData.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new UnauthorizedError('Invalid credentials');
    }
  })
);

/**
 * User registration (7-day free trial)
 * POST /v1/auth/register
 */
router.post('/register',
  authRateLimiter,
  logAuthEvent('LOGIN'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const validatedData = RegisterSchema.parse(req.body);
    
    try {
      // TODO: Implement registration logic
      // This would typically:
      // 1. Check if email already exists
      // 2. Create Cognito user
      // 3. Create clinic record
      // 4. Create user record
      // 5. Setup 7-day trial
      // 6. Send welcome email
      
      const response = {
        success: true,
        data: {
          message: 'Registration successful. Please check your email to verify your account.',
          userId: 'new-user-id',
          clinicId: 'new-clinic-id',
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        },
        timestamp: new Date().toISOString()
      };

      logger.info('User registration successful', {
        email: validatedData.email,
        clinicName: validatedData.clinicName,
        userId: response.data.userId
      });

      res.status(201).json(response);
      
    } catch (error) {
      logger.error('Registration failed', {
        email: validatedData.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  })
);

/**
 * Refresh access token
 * POST /v1/auth/refresh
 */
router.post('/refresh',
  authRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }
    
    try {
      // TODO: Implement token refresh logic
      // This would typically:
      // 1. Validate refresh token with Cognito
      // 2. Generate new access token
      // 3. Optionally rotate refresh token
      
      const response = {
        success: true,
        data: {
          accessToken: 'new-jwt-access-token',
          refreshToken: 'new-jwt-refresh-token',
          expiresIn: 3600
        },
        timestamp: new Date().toISOString()
      };

      res.json(response);
      
    } catch (error) {
      logger.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new UnauthorizedError('Invalid refresh token');
    }
  })
);

/**
 * User logout
 * POST /v1/auth/logout
 */
router.post('/logout',
  logAuthEvent('LOGOUT'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { refreshToken } = req.body;
    
    try {
      // TODO: Implement logout logic
      // This would typically:
      // 1. Revoke refresh token in Cognito
      // 2. Add access token to blacklist
      // 3. Clear session data
      
      logger.info('User logout successful', {
        userId: req.user?.sub
      });

      res.json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Logout failed', {
        userId: req.user?.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Even if logout fails, return success to avoid confusion
      res.json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date().toISOString()
      });
    }
  })
);

/**
 * Forgot password request
 * POST /v1/auth/forgot-password
 */
router.post('/forgot-password',
  passwordResetRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const validatedData = ForgotPasswordSchema.parse(req.body);
    
    try {
      // TODO: Implement forgot password logic
      // This would typically:
      // 1. Check if user exists
      // 2. Generate reset token
      // 3. Send reset email
      // 4. Log the event
      
      logger.info('Password reset requested', {
        email: validatedData.email
      });

      // Always return success for security (don't reveal if email exists)
      res.json({
        success: true,
        message: 'If an account with that email exists, you will receive password reset instructions.',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Forgot password request failed', {
        email: validatedData.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Still return success for security
      res.json({
        success: true,
        message: 'If an account with that email exists, you will receive password reset instructions.',
        timestamp: new Date().toISOString()
      });
    }
  })
);

/**
 * Reset password with token
 * POST /v1/auth/reset-password
 */
router.post('/reset-password',
  passwordResetRateLimiter,
  logAuthEvent('PASSWORD_RESET'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const validatedData = ResetPasswordSchema.parse(req.body);
    
    try {
      // TODO: Implement password reset logic
      // This would typically:
      // 1. Validate reset token
      // 2. Update password in Cognito
      // 3. Invalidate all sessions
      // 4. Log the event
      
      logger.info('Password reset successful', {
        token: validatedData.token.substring(0, 8) + '...' // Log partial token for tracking
      });

      res.json({
        success: true,
        message: 'Password reset successful. Please log in with your new password.',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.warn('Password reset failed', {
        token: validatedData.token.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new ValidationError('Invalid or expired reset token');
    }
  })
);

/**
 * Change password (authenticated users)
 * POST /v1/auth/change-password
 */
router.post('/change-password',
  authRateLimiter,
  logAuthEvent('PASSWORD_RESET'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    
    const validatedData = ChangePasswordSchema.parse(req.body);
    
    try {
      // TODO: Implement password change logic
      // This would typically:
      // 1. Verify current password
      // 2. Update password in Cognito
      // 3. Optionally invalidate other sessions
      // 4. Log the event
      
      logger.info('Password change successful', {
        userId: req.user.sub
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.warn('Password change failed', {
        userId: req.user.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new ValidationError('Current password is incorrect');
    }
  })
);

/**
 * Generate magic link for passwordless login
 * POST /v1/auth/magic-link
 */
router.post('/magic-link',
  magicLinkRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const validatedData = MagicLinkSchema.parse(req.body);
    
    try {
      // TODO: Implement magic link logic
      // This would typically:
      // 1. Validate identifier (email/phone)
      // 2. Generate secure token
      // 3. Store token with expiration
      // 4. Send magic link via email/SMS
      
      logger.info('Magic link requested', {
        identifier: validatedData.identifier,
        type: validatedData.type
      });

      res.json({
        success: true,
        message: `Magic link sent to your ${validatedData.type}`,
        expiresIn: 600, // 10 minutes
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Magic link generation failed', {
        identifier: validatedData.identifier,
        type: validatedData.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  })
);

/**
 * Verify magic link token
 * POST /v1/auth/verify-magic-link
 */
router.post('/verify-magic-link',
  authRateLimiter,
  logAuthEvent('LOGIN'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { token } = req.body;
    
    if (!token) {
      throw new ValidationError('Magic link token is required');
    }
    
    try {
      // TODO: Implement magic link verification
      // This would typically:
      // 1. Validate token
      // 2. Check expiration
      // 3. Generate JWT tokens
      // 4. Clean up used token
      
      const response = {
        success: true,
        data: {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'user-id',
            email: 'user@example.com',
            clinicId: 'clinic-id',
            role: 'DOCTOR'
          }
        },
        timestamp: new Date().toISOString()
      };

      logger.info('Magic link login successful', {
        userId: response.data.user.id,
        token: token.substring(0, 8) + '...'
      });

      res.json(response);
      
    } catch (error) {
      logger.warn('Magic link verification failed', {
        token: token.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new ValidationError('Invalid or expired magic link');
    }
  })
);

/**
 * Get current user profile
 * GET /v1/auth/me
 */
router.get('/me',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    
    try {
      // TODO: Fetch user profile from database
      
      const userProfile = {
        id: req.user.sub,
        email: req.user.email,
        clinicId: req.user.clinicId,
        role: req.user.role,
        firstName: 'John',
        lastName: 'Doe',
        permissions: req.user['cognito:groups'] || [],
        lastLoginAt: new Date().toISOString(),
        onboardingCompleted: true
      };

      res.json({
        success: true,
        data: userProfile,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Failed to fetch user profile', {
        userId: req.user.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new NotFoundError('User profile');
    }
  })
);

export { router as authRouter };