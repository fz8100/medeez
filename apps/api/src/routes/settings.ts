import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware/errorHandler';
import { requirePermission, requireRole } from '@/middleware/authMiddleware';
import { AuthenticatedRequest, ValidationError, NotFoundError } from '@/types';
import { logger } from '@/utils/logger';
import { SettingsRepository } from '@/repositories/settingsRepository';

const router = Router();
const settingsRepository = new SettingsRepository();

// Validation schemas
const UpdateUserSettingsSchema = z.object({
  preferences: z.object({
    timezone: z.string().optional(),
    dateFormat: z.string().optional(),
    timeFormat: z.enum(['12h', '24h']).optional(),
    language: z.string().optional(),
    notifications: z.object({
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      push: z.boolean().optional(),
      appointmentReminders: z.boolean().optional(),
      taskReminders: z.boolean().optional(),
      invoiceUpdates: z.boolean().optional()
    }).optional()
  }).optional(),
  avatar: z.object({
    url: z.string().url().optional(),
    uploadKey: z.string().optional()
  }).optional(),
  signature: z.string().max(500).optional()
});

const UpdateClinicSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional()
  }).optional(),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    website: z.string().url().optional()
  }).optional(),
  businessHours: z.array(z.object({
    day: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    open: z.string(),
    close: z.string(),
    closed: z.boolean()
  })).optional(),
  appointmentSettings: z.object({
    defaultDuration: z.number().min(5).max(480).optional(),
    bufferTime: z.number().min(0).max(60).optional(),
    allowOnlineBooking: z.boolean().optional(),
    requireConfirmation: z.boolean().optional(),
    cancellationPolicy: z.string().optional()
  }).optional(),
  invoiceSettings: z.object({
    defaultPaymentTerms: z.number().optional(),
    lateFeeRate: z.number().min(0).max(50).optional(),
    reminderDays: z.array(z.number()).optional(),
    autoSendReminders: z.boolean().optional()
  }).optional()
});

const UpdateSystemSettingsSchema = z.object({
  platform: z.object({
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().optional(),
    featureFlags: z.record(z.boolean()).optional(),
    rateLimits: z.record(z.number()).optional()
  }).optional(),
  security: z.object({
    sessionTimeout: z.number().min(300).max(86400).optional(),
    passwordPolicy: z.object({
      minLength: z.number().min(8).max(128).optional(),
      requireNumbers: z.boolean().optional(),
      requireSymbols: z.boolean().optional(),
      requireUppercase: z.boolean().optional(),
      requireLowercase: z.boolean().optional()
    }).optional(),
    mfaRequired: z.boolean().optional()
  }).optional(),
  integrations: z.object({
    enabledServices: z.array(z.string()).optional(),
    webhookRetryPolicy: z.object({
      maxRetries: z.number().optional(),
      backoffMultiplier: z.number().optional()
    }).optional()
  }).optional()
});

/**
 * Get role-adaptive settings
 * GET /v1/settings
 * 
 * Returns different settings based on user role:
 * - Doctor/Staff: User settings and limited clinic settings
 * - Admin: User settings and full clinic settings
 * - SuperAdmin: All settings including system-wide configuration
 */
router.get('/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const isAdmin = userGroups.includes('Admin') || isSystemAdmin;
    
    try {
      let settingsData: any = {};
      
      // Always include user settings
      settingsData.user = await settingsRepository.getUserSettings(req.user?.sub!);
      
      if (isSystemAdmin) {
        // SuperAdmin gets system-wide settings
        settingsData.system = await settingsRepository.getSystemSettings();
        settingsData.platform = await settingsRepository.getPlatformSettings();
        
        // SuperAdmin can also get clinic settings if specified
        const targetClinicId = req.query.clinicId as string;
        if (targetClinicId) {
          settingsData.clinic = await settingsRepository.getClinicSettings(targetClinicId);
        }
        
        logger.info('System settings accessed', {
          userId: req.user?.sub,
          targetClinicId
        });
      } else if (isAdmin) {
        // Admin gets full clinic settings
        const clinicId = req.clinicId!;
        settingsData.clinic = await settingsRepository.getClinicSettings(clinicId);
        
        logger.debug('Admin clinic settings accessed', {
          userId: req.user?.sub,
          clinicId
        });
      } else {
        // Regular users get limited clinic information
        const clinicId = req.clinicId!;
        settingsData.clinic = await settingsRepository.getLimitedClinicSettings(clinicId);
        
        logger.debug('Limited clinic settings accessed', {
          userId: req.user?.sub,
          clinicId
        });
      }

      res.json({
        success: true,
        data: settingsData,
        metadata: {
          userRole: isSystemAdmin ? 'SystemAdmin' : req.user?.role,
          accessLevel: isSystemAdmin ? 'system' : isAdmin ? 'admin' : 'user',
          generatedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Settings fetch failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Update user settings
 * PUT /v1/settings/user
 */
router.put('/user',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.sub!;
    
    try {
      const validatedData = UpdateUserSettingsSchema.parse(req.body);
      
      const updatedSettings = await settingsRepository.updateUserSettings(userId, validatedData);
      
      logger.info('User settings updated', {
        userId,
        updatedFields: Object.keys(validatedData)
      });

      res.json({
        success: true,
        data: updatedSettings,
        message: 'User settings updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('User settings update failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Update clinic settings
 * PUT /v1/settings/clinic
 */
router.put('/clinic',
  requirePermission('clinic:update'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    
    // Determine target clinic ID
    const targetClinicId = isSystemAdmin && req.body.clinicId 
      ? req.body.clinicId 
      : req.clinicId!;
    
    try {
      const validatedData = UpdateClinicSettingsSchema.parse(req.body);
      
      const updatedSettings = await settingsRepository.updateClinicSettings(
        targetClinicId, 
        validatedData,
        req.user?.sub!
      );
      
      logger.info('Clinic settings updated', {
        userId: req.user?.sub,
        clinicId: targetClinicId,
        updatedFields: Object.keys(validatedData),
        isSystemAdmin
      });

      res.json({
        success: true,
        data: updatedSettings,
        message: 'Clinic settings updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Clinic settings update failed', {
        userId: req.user?.sub,
        clinicId: targetClinicId,
        isSystemAdmin,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Update system settings (SuperAdmin only)
 * PUT /v1/settings/system
 */
router.put('/system',
  requireRole('SystemAdmin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = UpdateSystemSettingsSchema.parse(req.body);
      
      const updatedSettings = await settingsRepository.updateSystemSettings(
        validatedData,
        req.user?.sub!
      );
      
      logger.warn('System settings updated', {
        userId: req.user?.sub,
        updatedFields: Object.keys(validatedData)
      });

      res.json({
        success: true,
        data: updatedSettings,
        message: 'System settings updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('System settings update failed', {
        userId: req.user?.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get available time zones
 * GET /v1/settings/timezones
 */
router.get('/timezones',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const timezones = await settingsRepository.getAvailableTimezones();

      res.json({
        success: true,
        data: timezones,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Timezones fetch failed', {
        userId: req.user?.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get notification templates
 * GET /v1/settings/notification-templates
 */
router.get('/notification-templates',
  requirePermission('clinic:update'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const clinicId = req.clinicId!;
    
    try {
      let templates;
      
      if (isSystemAdmin) {
        templates = await settingsRepository.getAllNotificationTemplates();
      } else {
        templates = await settingsRepository.getClinicNotificationTemplates(clinicId);
      }

      res.json({
        success: true,
        data: templates,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Notification templates fetch failed', {
        userId: req.user?.sub,
        clinicId,
        isSystemAdmin,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Update notification template
 * PUT /v1/settings/notification-templates/:templateId
 */
router.put('/notification-templates/:templateId',
  requirePermission('clinic:update'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { templateId } = req.params;
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const clinicId = req.clinicId!;
    
    try {
      const updatedTemplate = await settingsRepository.updateNotificationTemplate(
        templateId,
        req.body,
        isSystemAdmin ? undefined : clinicId,
        req.user?.sub!
      );
      
      if (!updatedTemplate) {
        throw new NotFoundError('Notification template');
      }

      logger.info('Notification template updated', {
        userId: req.user?.sub,
        templateId,
        clinicId: isSystemAdmin ? 'system' : clinicId
      });

      res.json({
        success: true,
        data: updatedTemplate,
        message: 'Notification template updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Notification template update failed', {
        userId: req.user?.sub,
        templateId,
        clinicId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get feature flags
 * GET /v1/settings/feature-flags
 */
router.get('/feature-flags',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const clinicId = req.clinicId!;
    
    try {
      let featureFlags;
      
      if (isSystemAdmin) {
        featureFlags = await settingsRepository.getAllFeatureFlags();
      } else {
        featureFlags = await settingsRepository.getClinicFeatureFlags(clinicId);
      }

      res.json({
        success: true,
        data: featureFlags,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Feature flags fetch failed', {
        userId: req.user?.sub,
        clinicId,
        isSystemAdmin,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Update feature flags (SuperAdmin only)
 * PUT /v1/settings/feature-flags
 */
router.put('/feature-flags',
  requireRole('SystemAdmin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const updatedFlags = await settingsRepository.updateFeatureFlags(
        req.body,
        req.user?.sub!
      );

      logger.warn('Feature flags updated', {
        userId: req.user?.sub,
        updatedFlags: Object.keys(req.body)
      });

      res.json({
        success: true,
        data: updatedFlags,
        message: 'Feature flags updated successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Feature flags update failed', {
        userId: req.user?.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Reset settings to default
 * POST /v1/settings/reset
 */
router.post('/reset',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { type } = req.body; // 'user', 'clinic', or 'all'
    const userGroups = req.user?.['cognito:groups'] || [];
    const isAdmin = userGroups.includes('Admin') || userGroups.includes('SystemAdmin');
    
    if (type === 'clinic' && !isAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions to reset clinic settings',
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      let resetResults: any = {};
      
      if (type === 'user' || type === 'all') {
        resetResults.user = await settingsRepository.resetUserSettings(req.user?.sub!);
      }
      
      if ((type === 'clinic' || type === 'all') && isAdmin) {
        resetResults.clinic = await settingsRepository.resetClinicSettings(
          req.clinicId!,
          req.user?.sub!
        );
      }

      logger.info('Settings reset', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        resetType: type,
        isAdmin
      });

      res.json({
        success: true,
        data: resetResults,
        message: `${type} settings reset to defaults successfully`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Settings reset failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        resetType: type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

export { router as settingsRouter };