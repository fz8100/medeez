import { Router } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { requirePermission, requireRole } from '@/middleware/authMiddleware';
import { systemAdminTenantOverride, tenantMiddleware } from '@/middleware/tenantMiddleware';
import { AuthenticatedRequest } from '@/types';
import { logger } from '@/utils/logger';
import { DashboardRepository } from '@/repositories/dashboardRepository';

const router = Router();
const dashboardRepository = new DashboardRepository();

/**
 * Get role-adaptive dashboard data
 * GET /v1/dashboard
 * 
 * Returns different data based on user role:
 * - Doctor/Staff: Clinic-specific KPIs and metrics
 * - SuperAdmin: Platform-wide metrics and health
 */
router.get('/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    
    try {
      let dashboardData;
      
      if (isSystemAdmin) {
        // SuperAdmin gets platform-wide dashboard
        dashboardData = await dashboardRepository.getPlatformDashboard({
          userId: req.user?.sub!,
          timeRange: req.query.timeRange as string || '30d'
        });
        
        logger.info('Platform dashboard accessed', {
          userId: req.user?.sub,
          timeRange: req.query.timeRange
        });
      } else {
        // Regular users get clinic-specific dashboard
        const clinicId = req.clinicId!;
        dashboardData = await dashboardRepository.getClinicDashboard(clinicId, {
          userId: req.user?.sub!,
          role: req.user?.role!,
          timeRange: req.query.timeRange as string || '30d'
        });
        
        logger.debug('Clinic dashboard accessed', {
          userId: req.user?.sub,
          clinicId,
          role: req.user?.role,
          timeRange: req.query.timeRange
        });
      }

      res.json({
        success: true,
        data: dashboardData,
        metadata: {
          userRole: isSystemAdmin ? 'SystemAdmin' : req.user?.role,
          dataScope: isSystemAdmin ? 'platform' : 'clinic',
          generatedAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Dashboard data fetch failed', {
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
 * Get quick stats for dashboard cards
 * GET /v1/dashboard/quick-stats
 */
router.get('/quick-stats',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    
    try {
      let quickStats;
      
      if (isSystemAdmin) {
        quickStats = await dashboardRepository.getPlatformQuickStats();
      } else {
        const clinicId = req.clinicId!;
        quickStats = await dashboardRepository.getClinicQuickStats(clinicId);
      }

      res.json({
        success: true,
        data: quickStats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Quick stats fetch failed', {
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
 * Get recent activity feed
 * GET /v1/dashboard/activity
 */
router.get('/activity',
  requirePermission('dashboard:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { limit = '10', activityTypes } = req.query;
    
    try {
      let activityData;
      
      if (isSystemAdmin) {
        activityData = await dashboardRepository.getPlatformActivity({
          limit: Math.min(parseInt(limit as string), 50),
          types: activityTypes ? (activityTypes as string).split(',') : undefined
        });
      } else {
        const clinicId = req.clinicId!;
        activityData = await dashboardRepository.getClinicActivity(clinicId, {
          limit: Math.min(parseInt(limit as string), 50),
          types: activityTypes ? (activityTypes as string).split(',') : undefined
        });
      }

      res.json({
        success: true,
        data: activityData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Activity feed fetch failed', {
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
 * Get performance metrics
 * GET /v1/dashboard/metrics
 */
router.get('/metrics',
  requirePermission('dashboard:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { 
      timeRange = '30d', 
      metricType,
      compareWith 
    } = req.query;
    
    try {
      let metricsData;
      
      if (isSystemAdmin) {
        metricsData = await dashboardRepository.getPlatformMetrics({
          timeRange: timeRange as string,
          metricType: metricType as string,
          compareWith: compareWith as string
        });
      } else {
        const clinicId = req.clinicId!;
        metricsData = await dashboardRepository.getClinicMetrics(clinicId, {
          timeRange: timeRange as string,
          metricType: metricType as string,
          compareWith: compareWith as string
        });
      }

      res.json({
        success: true,
        data: metricsData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Metrics fetch failed', {
        userId: req.user?.sub,
        clinicId: req.clinicId,
        isSystemAdmin,
        timeRange,
        metricType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get alerts and notifications
 * GET /v1/dashboard/alerts
 */
router.get('/alerts',
  requirePermission('dashboard:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userGroups = req.user?.['cognito:groups'] || [];
    const isSystemAdmin = userGroups.includes('SystemAdmin');
    const { severity, limit = '20' } = req.query;
    
    try {
      let alertsData;
      
      if (isSystemAdmin) {
        alertsData = await dashboardRepository.getPlatformAlerts({
          severity: severity as string,
          limit: Math.min(parseInt(limit as string), 100)
        });
      } else {
        const clinicId = req.clinicId!;
        alertsData = await dashboardRepository.getClinicAlerts(clinicId, {
          severity: severity as string,
          limit: Math.min(parseInt(limit as string), 100)
        });
      }

      res.json({
        success: true,
        data: alertsData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Alerts fetch failed', {
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
 * SuperAdmin only: Get clinic health overview
 * GET /v1/dashboard/clinic-health
 */
router.get('/clinic-health',
  requireRole('SystemAdmin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { limit = '50', sortBy = 'lastActivity' } = req.query;
    
    try {
      const clinicHealthData = await dashboardRepository.getClinicHealthOverview({
        limit: Math.min(parseInt(limit as string), 200),
        sortBy: sortBy as string
      });

      res.json({
        success: true,
        data: clinicHealthData,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Clinic health overview fetch failed', {
        userId: req.user?.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * SuperAdmin only: Get system health status
 * GET /v1/dashboard/system-health
 */
router.get('/system-health',
  requireRole('SystemAdmin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    try {
      const systemHealth = await dashboardRepository.getSystemHealthStatus();

      res.json({
        success: true,
        data: systemHealth,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('System health status fetch failed', {
        userId: req.user?.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

export { router as dashboardRouter };