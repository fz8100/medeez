import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService } from '@/services/authService';
import { authMiddleware, requireRole, optionalAuth } from '@/middleware/authMiddleware';
import { rateLimiter } from '@/middleware/rateLimiter';
import { 
  LoginRequest, 
  SignupRequest, 
  ForgotPasswordRequest, 
  ResetPasswordRequest,
  RefreshTokenRequest,
  MagicLinkRequest,
  InviteUserRequest,
  AuthenticatedRequest,
  ValidationError,
} from '@/types';
import { logger } from '@/utils/logger';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { SESClient } from '@aws-sdk/client-ses';

const router = Router();

// Initialize services
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const sesClient = new SESClient({ region: process.env.AWS_REGION });

const authService = new AuthService(cognitoClient, docClient, sesClient);

// Validation middleware
const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('mfaCode').optional().isLength({ min: 6, max: 6 }).withMessage('MFA code must be 6 digits'),
];

const validateSignup = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
  body('firstName').isLength({ min: 1, max: 50 }).withMessage('First name is required'),
  body('lastName').isLength({ min: 1, max: 50 }).withMessage('Last name is required'),
  body('clinicName').optional().isLength({ min: 1, max: 100 }).withMessage('Clinic name must be valid'),
  body('invitationCode').optional().isAlphanumeric().withMessage('Invalid invitation code format'),
];

const validateForgotPassword = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
];

const validateResetPassword = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('confirmationCode').isLength({ min: 6, max: 10 }).withMessage('Confirmation code is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
];

const validateRefreshToken = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
];

const validateMagicLink = [
  body('patientEmail').isEmail().normalizeEmail().withMessage('Valid patient email is required'),
  body('clinicId').notEmpty().withMessage('Clinic ID is required'),
  body('expiresIn').optional().isInt({ min: 300, max: 86400 }).withMessage('Expires in must be between 5 minutes and 24 hours'),
];

const validateInviteUser = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('firstName').isLength({ min: 1, max: 50 }).withMessage('First name is required'),
  body('lastName').isLength({ min: 1, max: 50 }).withMessage('Last name is required'),
  body('role').isIn(['Admin', 'Doctor', 'Staff']).withMessage('Valid role is required'),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  body('expiresIn').optional().isInt({ min: 3600, max: 604800 }).withMessage('Expires in must be between 1 hour and 7 days'),
];

// Helper function to handle validation errors
const handleValidationErrors = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: errors.array(),
      },
      timestamp: new Date().toISOString(),
    });
  }
  next();
};

/**
 * @route   POST /auth/login
 * @desc    User login
 * @access  Public
 */
router.post(
  '/login',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), // 5 attempts per 15 minutes
  validateLogin,
  handleValidationErrors,
  async (req, res) => {
    try {
      const loginRequest: LoginRequest = req.body;
      const result = await authService.login(loginRequest);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Login endpoint error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'LOGIN_ERROR',
          message: error.message || 'Login failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/signup
 * @desc    User registration
 * @access  Public
 */
router.post(
  '/signup',
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }), // 3 attempts per hour
  validateSignup,
  handleValidationErrors,
  async (req, res) => {
    try {
      const signupRequest: SignupRequest = req.body;
      const result = await authService.signup(signupRequest);

      res.status(201).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Signup endpoint error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'SIGNUP_ERROR',
          message: error.message || 'Signup failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  '/forgot-password',
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }), // 3 attempts per hour
  validateForgotPassword,
  handleValidationErrors,
  async (req, res) => {
    try {
      const forgotPasswordRequest: ForgotPasswordRequest = req.body;
      const result = await authService.forgotPassword(forgotPasswordRequest);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Forgot password endpoint error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'FORGOT_PASSWORD_ERROR',
          message: error.message || 'Password reset request failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/reset-password
 * @desc    Reset password with confirmation code
 * @access  Public
 */
router.post(
  '/reset-password',
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 5 }), // 5 attempts per hour
  validateResetPassword,
  handleValidationErrors,
  async (req, res) => {
    try {
      const resetPasswordRequest: ResetPasswordRequest = req.body;
      const result = await authService.resetPassword(resetPasswordRequest);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Reset password endpoint error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'RESET_PASSWORD_ERROR',
          message: error.message || 'Password reset failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh',
  rateLimiter({ windowMs: 5 * 60 * 1000, max: 10 }), // 10 attempts per 5 minutes
  validateRefreshToken,
  handleValidationErrors,
  async (req, res) => {
    try {
      const refreshTokenRequest: RefreshTokenRequest = req.body;
      const result = await authService.refreshToken(refreshTokenRequest);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Refresh token endpoint error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'REFRESH_TOKEN_ERROR',
          message: error.message || 'Token refresh failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/logout
 * @desc    User logout (client-side token invalidation)
 * @access  Private
 */
router.post(
  '/logout',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      // In a JWT-based system, logout is typically handled client-side
      // by removing the tokens. We log the event for audit purposes.
      
      logger.info('User logout', {
        userId: req.user?.sub,
        email: req.user?.email,
        clinicId: req.user?.clinicId,
      });

      res.json({
        success: true,
        data: { message: 'Logged out successfully' },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Logout endpoint error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'LOGOUT_ERROR',
          message: 'Logout failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   GET /auth/me
 * @desc    Get current user information
 * @access  Private
 */
router.get(
  '/me',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      res.json({
        success: true,
        data: {
          user: req.user,
          clinicId: req.clinicId,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Get current user error', { error: error.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'USER_INFO_ERROR',
          message: 'Failed to get user information',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/magic-link
 * @desc    Generate magic link for patient portal
 * @access  Private (Doctor/Admin only)
 */
router.post(
  '/magic-link',
  authMiddleware,
  requireRole('Doctor', 'Admin'),
  validateMagicLink,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res) => {
    try {
      const magicLinkRequest: MagicLinkRequest = {
        ...req.body,
        clinicId: req.clinicId!, // Ensure clinic ID is from authenticated user
      };

      const result = await authService.generateMagicLink(magicLinkRequest);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Magic link endpoint error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'MAGIC_LINK_ERROR',
          message: error.message || 'Magic link generation failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/invite
 * @desc    Invite user to clinic
 * @access  Private (Admin only)
 */
router.post(
  '/invite',
  authMiddleware,
  requireRole('Admin', 'SystemAdmin'),
  validateInviteUser,
  handleValidationErrors,
  async (req: AuthenticatedRequest, res) => {
    try {
      const inviteRequest: InviteUserRequest = {
        ...req.body,
        clinicId: req.clinicId!, // Ensure clinic ID is from authenticated user
      };

      const result = await authService.inviteUser(inviteRequest, req.user!.sub);

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Invite user endpoint error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'INVITE_ERROR',
          message: error.message || 'User invitation failed',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * @route   POST /auth/users/:userId/enable
 * @desc    Enable/disable user account
 * @access  Private (Admin only)
 */
router.post(
  '/users/:userId/enable',
  authMiddleware,
  requireRole('Admin', 'SystemAdmin'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { enabled } = req.body;

      await authService.setUserEnabled(userId, enabled);

      res.json({
        success: true,
        data: { message: `User ${enabled ? 'enabled' : 'disabled'} successfully` },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Set user enabled error', { error: error.message });
      res.status(error.statusCode || 500).json({
        success: false,
        error: {
          code: error.code || 'USER_ENABLE_ERROR',
          message: error.message || 'Failed to update user status',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;