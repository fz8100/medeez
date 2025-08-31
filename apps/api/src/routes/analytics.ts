import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { requirePermission, requireRole } from '@/middleware/authMiddleware';
import { AuthenticatedRequest, ValidationError } from '@/types';
import { logger } from '@/utils/logger';
import { AnalyticsRepository } from '@/repositories/analyticsRepository';

const router = Router();
const analyticsRepository = new AnalyticsRepository();

/**
 * Get role-specific analytics data
 * GET /v1/analytics
 * 
 * Returns different data based on user role:
 * - Doctor/Staff: Clinic usage and performance data
 * - SuperAdmin: Platform analytics, conversion rates, system health
 */
router.get('/',
  requirePermission('analytics:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { 
      timeRange = '30d', 
      granularity = 'day',
      metrics
    } = req.query;
    
    // Validate time range
    const validTimeRanges = ['7d', '30d', '90d', '1y'];
    if (!validTimeRanges.includes(timeRange as string)) {
      throw new ValidationError('Invalid time range. Must be one of: 7d, 30d, 90d, 1y');
    }

    try {
      let analyticsData;
      
      if (isSystemAdmin) {
        // SuperAdmin gets platform-wide analytics
        analyticsData = await analyticsRepository.getPlatformAnalytics({
          timeRange: timeRange as string,
          granularity: granularity as string,
          metrics: metrics ? (metrics as string).split(',') : undefined
        });
        
        logger.info('Platform analytics accessed', {
          userId: req.user?.sub,
          timeRange,
          granularity,
          metrics
        });
      } else {
        // Regular users get clinic-specific analytics
        const clinicId = req.clinicId!;
        analyticsData = await analyticsRepository.getClinicAnalytics(clinicId, {
          timeRange: timeRange as string,
          granularity: granularity as string,
          metrics: metrics ? (metrics as string).split(',') : undefined,
          role: req.user?.role!
        });
        
        logger.debug('Clinic analytics accessed', {
          userId: req.user?.sub,
          clinicId,
          role: req.user?.role,
          timeRange,
          granularity
        });
      }

      res.json({
        success: true,
        data: analyticsData,
        metadata: {
          userRole: isSystemAdmin ? 'SystemAdmin' : req.user?.role,
          dataScope: isSystemAdmin ? 'platform' : 'clinic',
          timeRange,
          granularity,
          generatedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Analytics data fetch failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get usage analytics
 * GET /v1/analytics/usage
 */
router.get('/usage',
  requirePermission('analytics:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { 
      timeRange = '30d',
      feature,
      breakdownBy = 'day' 
    } = req.query;
    
    try {
      let usageData;
      
      if (isSystemAdmin) {
        usageData = await analyticsRepository.getPlatformUsageAnalytics({
          timeRange: timeRange as string,
          feature: feature as string,
          breakdownBy: breakdownBy as string
        });
      } else {
        const clinicId = req.clinicId!;
        usageData = await analyticsRepository.getClinicUsageAnalytics(clinicId, {
          timeRange: timeRange as string,
          feature: feature as string,
          breakdownBy: breakdownBy as string
        });
      }

      res.json({
        success: true,
        data: usageData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Usage analytics fetch failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        timeRange,
        feature,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get financial analytics
 * GET /v1/analytics/financial
 */
router.get('/financial',
  requirePermission('analytics:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { 
      timeRange = '30d',
      currency = 'USD',
      includeProjections = 'false'
    } = req.query;
    
    try {
      let financialData;
      
      if (isSystemAdmin) {
        financialData = await analyticsRepository.getPlatformFinancialAnalytics({
          timeRange: timeRange as string,
          currency: currency as string,
          includeProjections: includeProjections === 'true'
        });
      } else {
        const clinicId = req.clinicId!;
        financialData = await analyticsRepository.getClinicFinancialAnalytics(clinicId, {
          timeRange: timeRange as string,
          currency: currency as string,
          includeProjections: includeProjections === 'true'
        });
      }

      res.json({
        success: true,
        data: financialData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Financial analytics fetch failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get patient analytics
 * GET /v1/analytics/patients
 */
router.get('/patients',
  requirePermission('patients:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    
    // SystemAdmin cannot access patient analytics (HIPAA compliance)
    if (isSystemAdmin) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Patient analytics not accessible to system administrators',
        timestamp: new Date().toISOString()
      });
    }
    
    const clinicId = req.clinicId!;
    const { 
      timeRange = '30d',
      ageGroups = 'false',
      demographics = 'false'
    } = req.query;
    
    try {
      const patientAnalytics = await analyticsRepository.getPatientAnalytics(clinicId, {
        timeRange: timeRange as string,
        includeAgeGroups: ageGroups === 'true',
        includeDemographics: demographics === 'true'
      });

      res.json({
        success: true,
        data: patientAnalytics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Patient analytics fetch failed', {
        userId: req.user?.sub,
        clinicId,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get appointment analytics
 * GET /v1/analytics/appointments
 */
router.get('/appointments',
  requirePermission('appointments:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { 
      timeRange = '30d',
      providerId,
      includeNoShows = 'true'
    } = req.query;
    
    try {
      let appointmentAnalytics;
      
      if (isSystemAdmin) {
        appointmentAnalytics = await analyticsRepository.getPlatformAppointmentAnalytics({
          timeRange: timeRange as string,
          includeNoShows: includeNoShows === 'true'
        });
      } else {
        const clinicId = req.clinicId!;
        appointmentAnalytics = await analyticsRepository.getClinicAppointmentAnalytics(clinicId, {
          timeRange: timeRange as string,
          providerId: providerId as string,
          includeNoShows: includeNoShows === 'true'
        });
      }

      res.json({
        success: true,
        data: appointmentAnalytics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Appointment analytics fetch failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * SuperAdmin only: Get conversion analytics
 * GET /v1/analytics/conversion
 */
router.get('/conversion',
  requireRole('SystemAdmin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { 
      timeRange = '30d',
      funnelType = 'signup',
      segmentation 
    } = req.query;
    
    try {
      const conversionAnalytics = await analyticsRepository.getConversionAnalytics({
        timeRange: timeRange as string,
        funnelType: funnelType as string,
        segmentation: segmentation as string
      });

      res.json({
        success: true,
        data: conversionAnalytics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Conversion analytics fetch failed', {
        userId: req.user?.sub,
        timeRange,
        funnelType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * SuperAdmin only: Get platform health metrics
 * GET /v1/analytics/platform-health
 */
router.get('/platform-health',
  requireRole('SystemAdmin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { 
      timeRange = '7d',
      includeRegions = 'false'
    } = req.query;
    
    try {
      const healthMetrics = await analyticsRepository.getPlatformHealthMetrics({
        timeRange: timeRange as string,
        includeRegions: includeRegions === 'true'
      });

      res.json({
        success: true,
        data: healthMetrics,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Platform health metrics fetch failed', {
        userId: req.user?.sub,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Export analytics data
 * GET /v1/analytics/export
 */
router.get('/export',
  requirePermission('analytics:export'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { 
      format = 'json',
      timeRange = '30d',
      dataType = 'summary'
    } = req.query;

    if (!['json', 'csv', 'xlsx'].includes(format as string)) {
      throw new ValidationError('Format must be json, csv, or xlsx');
    }
    
    try {
      let exportData;
      
      if (isSystemAdmin) {
        exportData = await analyticsRepository.exportPlatformAnalytics({
          format: format as string,
          timeRange: timeRange as string,
          dataType: dataType as string
        });
      } else {
        const clinicId = req.clinicId!;
        exportData = await analyticsRepository.exportClinicAnalytics(clinicId, {
          format: format as string,
          timeRange: timeRange as string,
          dataType: dataType as string
        });
      }

      // Set appropriate headers based on format
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(exportData);
      } else if (format === 'xlsx') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.xlsx"`);
        res.send(exportData);
      } else {
        res.json({
          success: true,
          data: exportData,
          metadata: {
            exportedAt: new Date().toISOString(),
            timeRange,
            dataType,
            format
          }
        });
      }

      logger.info('Analytics data exported', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        format,
        timeRange,
        dataType
      });

    } catch (error) {
      logger.error('Analytics export failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        format,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

export { router as analyticsRouter };