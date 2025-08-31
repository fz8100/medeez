import { BaseRepository } from './base';
import { QueryOptions } from '@/types';
import { logger } from '@/utils/logger';

export interface DashboardOptions {
  userId: string;
  role?: string;
  timeRange?: string;
}

export interface QuickStats {
  totalPatients?: number;
  todayAppointments?: number;
  pendingInvoices?: number;
  monthlyRevenue?: number;
  systemHealth?: number;
  activeUsers?: number;
  totalClinics?: number;
  platformRevenue?: number;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  user?: {
    id: string;
    name: string;
    role: string;
  };
  clinic?: {
    id: string;
    name: string;
  };
  metadata?: Record<string, any>;
}

export interface MetricsData {
  timeRange: string;
  dataPoints: Array<{
    timestamp: string;
    value: number;
    label?: string;
  }>;
  comparison?: {
    previousPeriod: number;
    percentageChange: number;
  };
  breakdown?: Record<string, number>;
}

export interface AlertItem {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  actionRequired: boolean;
  metadata?: Record<string, any>;
}

export interface ClinicHealthItem {
  clinicId: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'inactive';
  lastActivity: string;
  metrics: {
    activeUsers: number;
    totalPatients: number;
    monthlyRevenue: number;
    appointmentRate: number;
  };
  issues?: string[];
}

export interface SystemHealthStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  services: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    responseTime?: number;
    uptime?: number;
    lastCheck: string;
  }>;
  infrastructure: {
    database: {
      readLatency: number;
      writeLatency: number;
      connectionPool: number;
    };
    storage: {
      usage: number;
      capacity: number;
    };
    compute: {
      cpuUsage: number;
      memoryUsage: number;
    };
  };
}

export class DashboardRepository extends BaseRepository {
  /**
   * Get clinic-specific dashboard data
   */
  async getClinicDashboard(clinicId: string, options: DashboardOptions) {
    try {
      const timeRange = options.timeRange || '30d';
      const days = this.parseTimeRange(timeRange);
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get clinic overview data
      const [
        patientStats,
        appointmentStats,
        invoiceStats,
        recentActivity
      ] = await Promise.all([
        this.getClinicPatientStats(clinicId, startDate),
        this.getClinicAppointmentStats(clinicId, startDate),
        this.getClinicInvoiceStats(clinicId, startDate),
        this.getClinicActivity(clinicId, { limit: 10 })
      ]);

      return {
        overview: {
          totalPatients: patientStats.total,
          newPatients: patientStats.new,
          activePatients: patientStats.active,
          totalAppointments: appointmentStats.total,
          completedAppointments: appointmentStats.completed,
          cancelledAppointments: appointmentStats.cancelled,
          totalRevenue: invoiceStats.totalRevenue,
          paidInvoices: invoiceStats.paid,
          pendingInvoices: invoiceStats.pending
        },
        trends: {
          patientGrowth: patientStats.trend,
          appointmentRate: appointmentStats.trend,
          revenueGrowth: invoiceStats.trend
        },
        recentActivity: recentActivity.slice(0, 5),
        timeRange,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get clinic dashboard', { clinicId, options, error });
      throw error;
    }
  }

  /**
   * Get platform-wide dashboard data for SuperAdmin
   */
  async getPlatformDashboard(options: DashboardOptions) {
    try {
      const timeRange = options.timeRange || '30d';
      const days = this.parseTimeRange(timeRange);
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Get platform overview data
      const [
        userStats,
        clinicStats,
        revenueStats,
        systemHealth,
        recentActivity
      ] = await Promise.all([
        this.getPlatformUserStats(startDate),
        this.getPlatformClinicStats(startDate),
        this.getPlatformRevenueStats(startDate),
        this.getSystemHealthStatus(),
        this.getPlatformActivity({ limit: 10 })
      ]);

      return {
        overview: {
          totalUsers: userStats.total,
          activeUsers: userStats.active,
          newUsers: userStats.new,
          totalClinics: clinicStats.total,
          activeClinics: clinicStats.active,
          newClinics: clinicStats.new,
          totalRevenue: revenueStats.total,
          mrr: revenueStats.mrr,
          churn: revenueStats.churn
        },
        systemHealth: {
          overall: systemHealth.overall,
          uptime: systemHealth.services.reduce((acc, s) => acc + (s.uptime || 0), 0) / systemHealth.services.length,
          responseTime: systemHealth.services.reduce((acc, s) => acc + (s.responseTime || 0), 0) / systemHealth.services.length
        },
        trends: {
          userGrowth: userStats.trend,
          clinicGrowth: clinicStats.trend,
          revenueGrowth: revenueStats.trend
        },
        recentActivity: recentActivity.slice(0, 10),
        timeRange,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get platform dashboard', { options, error });
      throw error;
    }
  }

  /**
   * Get quick stats for dashboard cards
   */
  async getClinicQuickStats(clinicId: string): Promise<QuickStats> {
    try {
      // Use GSI patterns for efficient queries
      const today = new Date().toISOString().split('T')[0];
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: 'begins_with(SK, :clinicPrefix)',
        ExpressionAttributeValues: {
          ':pk': 'ENTITY#SUMMARY',
          ':clinicPrefix': `${clinicId}#`
        },
        ProjectionExpression: 'entityType, #data, updatedAt',
        ExpressionAttributeNames: {
          '#data': 'data'
        }
      };

      const result = await this.query(params);
      const summaryData = result.Items?.[0]?.data || {};

      return {
        totalPatients: summaryData.totalPatients || 0,
        todayAppointments: summaryData.todayAppointments || 0,
        pendingInvoices: summaryData.pendingInvoices || 0,
        monthlyRevenue: summaryData.monthlyRevenue || 0
      };

    } catch (error) {
      logger.error('Failed to get clinic quick stats', { clinicId, error });
      return {
        totalPatients: 0,
        todayAppointments: 0,
        pendingInvoices: 0,
        monthlyRevenue: 0
      };
    }
  }

  /**
   * Get platform quick stats for SuperAdmin
   */
  async getPlatformQuickStats(): Promise<QuickStats> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'PLATFORM#SUMMARY'
        },
        ProjectionExpression: '#data, updatedAt',
        ExpressionAttributeNames: {
          '#data': 'data'
        }
      };

      const result = await this.query(params);
      const summaryData = result.Items?.[0]?.data || {};

      return {
        systemHealth: summaryData.systemHealth || 95,
        activeUsers: summaryData.activeUsers || 0,
        totalClinics: summaryData.totalClinics || 0,
        platformRevenue: summaryData.platformRevenue || 0
      };

    } catch (error) {
      logger.error('Failed to get platform quick stats', { error });
      return {
        systemHealth: 0,
        activeUsers: 0,
        totalClinics: 0,
        platformRevenue: 0
      };
    }
  }

  /**
   * Get recent activity feed for clinic
   */
  async getClinicActivity(clinicId: string, options: { limit?: number; types?: string[] } = {}): Promise<ActivityItem[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `ACTIVITY#${clinicId}`
        },
        ScanIndexForward: false, // Most recent first
        Limit: options.limit || 20,
        ProjectionExpression: 'SK, entityType, #data, createdAt',
        ExpressionAttributeNames: {
          '#data': 'data'
        }
      };

      if (options.types && options.types.length > 0) {
        params.FilterExpression = '#data.#type IN (:types)';
        params.ExpressionAttributeNames['#type'] = 'type';
        params.ExpressionAttributeValues[':types'] = options.types;
      }

      const result = await this.query(params);
      
      return (result.Items || []).map(item => ({
        id: item.SK.replace('ACTIVITY#', ''),
        type: item.data.type,
        title: item.data.title,
        description: item.data.description,
        timestamp: item.createdAt,
        user: item.data.user,
        metadata: item.data.metadata
      }));

    } catch (error) {
      logger.error('Failed to get clinic activity', { clinicId, options, error });
      return [];
    }
  }

  /**
   * Get recent platform activity for SuperAdmin
   */
  async getPlatformActivity(options: { limit?: number; types?: string[] } = {}): Promise<ActivityItem[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'PLATFORM#ACTIVITY'
        },
        ScanIndexForward: false,
        Limit: options.limit || 50,
        ProjectionExpression: 'SK, #data, createdAt',
        ExpressionAttributeNames: {
          '#data': 'data'
        }
      };

      const result = await this.query(params);
      
      return (result.Items || []).map(item => ({
        id: item.SK.replace('ACTIVITY#', ''),
        type: item.data.type,
        title: item.data.title,
        description: item.data.description,
        timestamp: item.createdAt,
        user: item.data.user,
        clinic: item.data.clinic,
        metadata: item.data.metadata
      }));

    } catch (error) {
      logger.error('Failed to get platform activity', { options, error });
      return [];
    }
  }

  /**
   * Get performance metrics for clinic
   */
  async getClinicMetrics(clinicId: string, options: {
    timeRange?: string;
    metricType?: string;
    compareWith?: string;
  } = {}): Promise<MetricsData> {
    try {
      const timeRange = options.timeRange || '30d';
      const metricType = options.metricType || 'appointments';

      // This would typically query aggregated metrics from GSI patterns
      // For now, returning mock structure
      return {
        timeRange,
        dataPoints: [],
        comparison: {
          previousPeriod: 0,
          percentageChange: 0
        },
        breakdown: {}
      };

    } catch (error) {
      logger.error('Failed to get clinic metrics', { clinicId, options, error });
      throw error;
    }
  }

  /**
   * Get platform metrics for SuperAdmin
   */
  async getPlatformMetrics(options: {
    timeRange?: string;
    metricType?: string;
    compareWith?: string;
  } = {}): Promise<MetricsData> {
    try {
      const timeRange = options.timeRange || '30d';

      // This would query platform-wide aggregated metrics
      return {
        timeRange,
        dataPoints: [],
        comparison: {
          previousPeriod: 0,
          percentageChange: 0
        },
        breakdown: {}
      };

    } catch (error) {
      logger.error('Failed to get platform metrics', { options, error });
      throw error;
    }
  }

  /**
   * Get alerts for clinic
   */
  async getClinicAlerts(clinicId: string, options: { severity?: string; limit?: number } = {}): Promise<AlertItem[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI4',
        KeyConditionExpression: 'GSI4PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `ALERTS#${clinicId}`
        },
        ScanIndexForward: false,
        Limit: options.limit || 20
      };

      if (options.severity) {
        params.FilterExpression = '#data.severity = :severity';
        params.ExpressionAttributeNames = { '#data': 'data' };
        params.ExpressionAttributeValues[':severity'] = options.severity;
      }

      const result = await this.query(params);
      
      return (result.Items || []).map(item => ({
        id: item.SK,
        type: item.data.type,
        severity: item.data.severity,
        title: item.data.title,
        message: item.data.message,
        timestamp: item.createdAt,
        isRead: item.data.isRead || false,
        actionRequired: item.data.actionRequired || false,
        metadata: item.data.metadata
      }));

    } catch (error) {
      logger.error('Failed to get clinic alerts', { clinicId, options, error });
      return [];
    }
  }

  /**
   * Get platform alerts for SuperAdmin
   */
  async getPlatformAlerts(options: { severity?: string; limit?: number } = {}): Promise<AlertItem[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI4',
        KeyConditionExpression: 'GSI4PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'PLATFORM#ALERTS'
        },
        ScanIndexForward: false,
        Limit: options.limit || 50
      };

      const result = await this.query(params);
      
      return (result.Items || []).map(item => ({
        id: item.SK,
        type: item.data.type,
        severity: item.data.severity,
        title: item.data.title,
        message: item.data.message,
        timestamp: item.createdAt,
        isRead: item.data.isRead || false,
        actionRequired: item.data.actionRequired || false,
        metadata: item.data.metadata
      }));

    } catch (error) {
      logger.error('Failed to get platform alerts', { options, error });
      return [];
    }
  }

  /**
   * Get clinic health overview for SuperAdmin
   */
  async getClinicHealthOverview(options: { limit?: number; sortBy?: string } = {}): Promise<ClinicHealthItem[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'ENTITY#CLINIC'
        },
        Limit: options.limit || 50,
        ProjectionExpression: 'clinicId, #data, updatedAt',
        ExpressionAttributeNames: {
          '#data': 'data'
        }
      };

      const result = await this.query(params);
      
      return (result.Items || []).map(item => ({
        clinicId: item.clinicId,
        name: item.data.name,
        status: item.data.status || 'healthy',
        lastActivity: item.data.lastActivity || item.updatedAt,
        metrics: {
          activeUsers: item.data.activeUsers || 0,
          totalPatients: item.data.totalPatients || 0,
          monthlyRevenue: item.data.monthlyRevenue || 0,
          appointmentRate: item.data.appointmentRate || 0
        },
        issues: item.data.issues || []
      }));

    } catch (error) {
      logger.error('Failed to get clinic health overview', { options, error });
      return [];
    }
  }

  /**
   * Get system health status for SuperAdmin
   */
  async getSystemHealthStatus(): Promise<SystemHealthStatus> {
    try {
      // This would typically query real system metrics
      // For now, returning mock structure with realistic data
      return {
        overall: 'healthy',
        services: [
          {
            name: 'API Gateway',
            status: 'healthy',
            responseTime: 45,
            uptime: 99.9,
            lastCheck: new Date().toISOString()
          },
          {
            name: 'Database',
            status: 'healthy',
            responseTime: 12,
            uptime: 99.95,
            lastCheck: new Date().toISOString()
          },
          {
            name: 'Authentication',
            status: 'healthy',
            responseTime: 23,
            uptime: 99.8,
            lastCheck: new Date().toISOString()
          }
        ],
        infrastructure: {
          database: {
            readLatency: 12,
            writeLatency: 18,
            connectionPool: 85
          },
          storage: {
            usage: 65,
            capacity: 1000
          },
          compute: {
            cpuUsage: 35,
            memoryUsage: 60
          }
        }
      };

    } catch (error) {
      logger.error('Failed to get system health status', { error });
      throw error;
    }
  }

  // Helper methods
  private parseTimeRange(timeRange: string): number {
    const rangeMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    return rangeMap[timeRange] || 30;
  }

  private async getClinicPatientStats(clinicId: string, startDate: string) {
    // Mock implementation - would query actual patient data
    return {
      total: 0,
      new: 0,
      active: 0,
      trend: []
    };
  }

  private async getClinicAppointmentStats(clinicId: string, startDate: string) {
    // Mock implementation
    return {
      total: 0,
      completed: 0,
      cancelled: 0,
      trend: []
    };
  }

  private async getClinicInvoiceStats(clinicId: string, startDate: string) {
    // Mock implementation
    return {
      totalRevenue: 0,
      paid: 0,
      pending: 0,
      trend: []
    };
  }

  private async getPlatformUserStats(startDate: string) {
    // Mock implementation
    return {
      total: 0,
      active: 0,
      new: 0,
      trend: []
    };
  }

  private async getPlatformClinicStats(startDate: string) {
    // Mock implementation
    return {
      total: 0,
      active: 0,
      new: 0,
      trend: []
    };
  }

  private async getPlatformRevenueStats(startDate: string) {
    // Mock implementation
    return {
      total: 0,
      mrr: 0,
      churn: 0,
      trend: []
    };
  }
}