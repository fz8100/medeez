import { BaseRepository } from './base';
import { logger } from '@/utils/logger';

export interface AnalyticsOptions {
  timeRange: string;
  granularity?: string;
  metrics?: string[];
  role?: string;
}

export interface PlatformAnalyticsOptions extends AnalyticsOptions {}

export interface ClinicAnalyticsOptions extends AnalyticsOptions {
  role: string;
}

export interface UsageAnalyticsOptions {
  timeRange: string;
  feature?: string;
  breakdownBy?: string;
}

export interface FinancialAnalyticsOptions {
  timeRange: string;
  currency?: string;
  includeProjections?: boolean;
}

export interface PatientAnalyticsOptions {
  timeRange: string;
  includeAgeGroups?: boolean;
  includeDemographics?: boolean;
}

export interface AppointmentAnalyticsOptions {
  timeRange: string;
  providerId?: string;
  includeNoShows?: boolean;
}

export interface ConversionAnalyticsOptions {
  timeRange: string;
  funnelType: string;
  segmentation?: string;
}

export interface HealthMetricsOptions {
  timeRange: string;
  includeRegions?: boolean;
}

export interface ExportOptions {
  format: string;
  timeRange: string;
  dataType: string;
}

export interface AnalyticsData {
  overview: {
    totalRecords: number;
    periodComparison: {
      current: number;
      previous: number;
      percentageChange: number;
    };
    trends: Array<{
      date: string;
      value: number;
      label?: string;
    }>;
  };
  segments: Record<string, any>;
  insights: string[];
  metadata: {
    timeRange: string;
    granularity: string;
    generatedAt: string;
  };
}

export class AnalyticsRepository extends BaseRepository {
  /**
   * Get clinic-specific analytics data
   */
  async getClinicAnalytics(clinicId: string, options: ClinicAnalyticsOptions): Promise<AnalyticsData> {
    try {
      const { timeRange, granularity = 'day', metrics, role } = options;
      const days = this.parseTimeRange(timeRange);
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      // Role-based metric filtering
      const allowedMetrics = this.getRoleBasedMetrics(role);
      const filteredMetrics = metrics ? metrics.filter(m => allowedMetrics.includes(m)) : allowedMetrics;

      const [
        overviewData,
        trendsData,
        segmentsData
      ] = await Promise.all([
        this.getClinicOverviewMetrics(clinicId, startDate, endDate, filteredMetrics),
        this.getClinicTrends(clinicId, startDate, endDate, granularity, filteredMetrics),
        this.getClinicSegments(clinicId, startDate, endDate, filteredMetrics)
      ]);

      return {
        overview: overviewData,
        segments: segmentsData,
        insights: this.generateInsights(overviewData, trendsData, 'clinic'),
        metadata: {
          timeRange,
          granularity,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Failed to get clinic analytics', { clinicId, options, error });
      throw error;
    }
  }

  /**
   * Get platform-wide analytics for SuperAdmin
   */
  async getPlatformAnalytics(options: PlatformAnalyticsOptions): Promise<AnalyticsData> {
    try {
      const { timeRange, granularity = 'day', metrics } = options;
      const days = this.parseTimeRange(timeRange);
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const defaultMetrics = [
        'users', 'clinics', 'revenue', 'churn', 'conversion',
        'system_performance', 'feature_usage'
      ];
      const selectedMetrics = metrics || defaultMetrics;

      const [
        overviewData,
        trendsData,
        segmentsData
      ] = await Promise.all([
        this.getPlatformOverviewMetrics(startDate, endDate, selectedMetrics),
        this.getPlatformTrends(startDate, endDate, granularity, selectedMetrics),
        this.getPlatformSegments(startDate, endDate, selectedMetrics)
      ]);

      return {
        overview: overviewData,
        segments: segmentsData,
        insights: this.generateInsights(overviewData, trendsData, 'platform'),
        metadata: {
          timeRange,
          granularity,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Failed to get platform analytics', { options, error });
      throw error;
    }
  }

  /**
   * Get usage analytics for platform or clinic
   */
  async getPlatformUsageAnalytics(options: UsageAnalyticsOptions) {
    try {
      const { timeRange, feature, breakdownBy } = options;
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USAGE#PLATFORM#${feature || 'ALL'}`
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      
      return this.processUsageData(result.Items || [], breakdownBy);

    } catch (error) {
      logger.error('Failed to get platform usage analytics', { options, error });
      throw error;
    }
  }

  /**
   * Get clinic usage analytics
   */
  async getClinicUsageAnalytics(clinicId: string, options: UsageAnalyticsOptions) {
    try {
      const { timeRange, feature, breakdownBy } = options;
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `USAGE#${clinicId}#${feature || 'ALL'}`
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      
      return this.processUsageData(result.Items || [], breakdownBy);

    } catch (error) {
      logger.error('Failed to get clinic usage analytics', { clinicId, options, error });
      throw error;
    }
  }

  /**
   * Get financial analytics for platform
   */
  async getPlatformFinancialAnalytics(options: FinancialAnalyticsOptions) {
    try {
      const { timeRange, currency = 'USD', includeProjections } = options;
      
      // Query financial metrics from GSI patterns
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI4',
        KeyConditionExpression: 'GSI4PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `FINANCIAL#PLATFORM#${currency}`
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      const financialData = this.processFinancialData(result.Items || []);

      if (includeProjections) {
        financialData.projections = await this.generateRevenueProjections(financialData);
      }

      return financialData;

    } catch (error) {
      logger.error('Failed to get platform financial analytics', { options, error });
      throw error;
    }
  }

  /**
   * Get clinic financial analytics
   */
  async getClinicFinancialAnalytics(clinicId: string, options: FinancialAnalyticsOptions) {
    try {
      const { timeRange, currency = 'USD', includeProjections } = options;
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI4',
        KeyConditionExpression: 'GSI4PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `FINANCIAL#${clinicId}#${currency}`
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      const financialData = this.processFinancialData(result.Items || []);

      if (includeProjections) {
        financialData.projections = await this.generateRevenueProjections(financialData);
      }

      return financialData;

    } catch (error) {
      logger.error('Failed to get clinic financial analytics', { clinicId, options, error });
      throw error;
    }
  }

  /**
   * Get patient analytics (clinic only - HIPAA compliant)
   */
  async getPatientAnalytics(clinicId: string, options: PatientAnalyticsOptions) {
    try {
      const { timeRange, includeAgeGroups, includeDemographics } = options;
      
      // Query aggregated patient data (no PHI)
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PATIENT_STATS#${clinicId}`
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      
      return this.processPatientAnalytics(result.Items || [], {
        includeAgeGroups: includeAgeGroups || false,
        includeDemographics: includeDemographics || false
      });

    } catch (error) {
      logger.error('Failed to get patient analytics', { clinicId, options, error });
      throw error;
    }
  }

  /**
   * Get appointment analytics
   */
  async getClinicAppointmentAnalytics(clinicId: string, options: AppointmentAnalyticsOptions) {
    try {
      const { timeRange, providerId, includeNoShows } = options;
      
      let pkCondition = `APPOINTMENT_STATS#${clinicId}`;
      if (providerId) {
        pkCondition += `#${providerId}`;
      }
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: {
          ':pk': pkCondition
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      
      return this.processAppointmentAnalytics(result.Items || [], { includeNoShows });

    } catch (error) {
      logger.error('Failed to get appointment analytics', { clinicId, options, error });
      throw error;
    }
  }

  /**
   * Get platform appointment analytics
   */
  async getPlatformAppointmentAnalytics(options: AppointmentAnalyticsOptions) {
    try {
      const { timeRange, includeNoShows } = options;
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'APPOINTMENT_STATS#PLATFORM'
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      
      return this.processAppointmentAnalytics(result.Items || [], { includeNoShows });

    } catch (error) {
      logger.error('Failed to get platform appointment analytics', { options, error });
      throw error;
    }
  }

  /**
   * Get conversion analytics (SuperAdmin only)
   */
  async getConversionAnalytics(options: ConversionAnalyticsOptions) {
    try {
      const { timeRange, funnelType, segmentation } = options;
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI5',
        KeyConditionExpression: 'GSI5PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `CONVERSION#${funnelType.toUpperCase()}`
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      
      return this.processConversionData(result.Items || [], segmentation);

    } catch (error) {
      logger.error('Failed to get conversion analytics', { options, error });
      throw error;
    }
  }

  /**
   * Get platform health metrics (SuperAdmin only)
   */
  async getPlatformHealthMetrics(options: HealthMetricsOptions) {
    try {
      const { timeRange, includeRegions } = options;
      
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI4',
        KeyConditionExpression: 'GSI4PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'HEALTH#PLATFORM'
        },
        FilterExpression: 'createdAt >= :startDate',
        ExpressionAttributeNames: {
          ':startDate': this.getDateFromTimeRange(timeRange)
        }
      };

      const result = await this.query(params);
      
      return this.processHealthMetrics(result.Items || [], { includeRegions });

    } catch (error) {
      logger.error('Failed to get platform health metrics', { options, error });
      throw error;
    }
  }

  /**
   * Export platform analytics data
   */
  async exportPlatformAnalytics(options: ExportOptions) {
    try {
      const { format, timeRange, dataType } = options;
      
      // Get the analytics data to export
      const analyticsData = await this.getPlatformAnalytics({
        timeRange,
        metrics: this.getExportableMetrics(dataType)
      });

      return this.formatExportData(analyticsData, format);

    } catch (error) {
      logger.error('Failed to export platform analytics', { options, error });
      throw error;
    }
  }

  /**
   * Export clinic analytics data
   */
  async exportClinicAnalytics(clinicId: string, options: ExportOptions) {
    try {
      const { format, timeRange, dataType } = options;
      
      const analyticsData = await this.getClinicAnalytics(clinicId, {
        timeRange,
        role: 'Admin', // Export always uses admin permissions
        metrics: this.getExportableMetrics(dataType)
      });

      return this.formatExportData(analyticsData, format);

    } catch (error) {
      logger.error('Failed to export clinic analytics', { clinicId, options, error });
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

  private getDateFromTimeRange(timeRange: string): string {
    const days = this.parseTimeRange(timeRange);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  private getRoleBasedMetrics(role: string): string[] {
    const roleMetrics: Record<string, string[]> = {
      'SystemAdmin': ['all'],
      'Admin': ['patients', 'appointments', 'revenue', 'staff_performance', 'clinic_efficiency'],
      'Doctor': ['appointments', 'patients', 'revenue', 'personal_performance'],
      'Staff': ['appointments', 'basic_stats']
    };

    return roleMetrics[role] || roleMetrics['Staff'];
  }

  private async getClinicOverviewMetrics(clinicId: string, startDate: Date, endDate: Date, metrics: string[]) {
    // Mock implementation - would query actual metrics
    return {
      totalRecords: 0,
      periodComparison: {
        current: 0,
        previous: 0,
        percentageChange: 0
      },
      trends: []
    };
  }

  private async getClinicTrends(clinicId: string, startDate: Date, endDate: Date, granularity: string, metrics: string[]) {
    // Mock implementation
    return [];
  }

  private async getClinicSegments(clinicId: string, startDate: Date, endDate: Date, metrics: string[]) {
    // Mock implementation
    return {};
  }

  private async getPlatformOverviewMetrics(startDate: Date, endDate: Date, metrics: string[]) {
    // Mock implementation
    return {
      totalRecords: 0,
      periodComparison: {
        current: 0,
        previous: 0,
        percentageChange: 0
      },
      trends: []
    };
  }

  private async getPlatformTrends(startDate: Date, endDate: Date, granularity: string, metrics: string[]) {
    // Mock implementation
    return [];
  }

  private async getPlatformSegments(startDate: Date, endDate: Date, metrics: string[]) {
    // Mock implementation
    return {};
  }

  private processUsageData(items: any[], breakdownBy?: string) {
    // Process usage analytics data
    return {
      totalUsage: items.length,
      breakdown: {},
      trends: []
    };
  }

  private processFinancialData(items: any[]) {
    // Process financial analytics data
    return {
      totalRevenue: 0,
      trends: [],
      breakdown: {}
    };
  }

  private async generateRevenueProjections(financialData: any) {
    // Generate revenue projections
    return {
      nextMonth: 0,
      nextQuarter: 0,
      confidence: 0.8
    };
  }

  private processPatientAnalytics(items: any[], options: { includeAgeGroups: boolean; includeDemographics: boolean }) {
    // Process patient analytics (no PHI)
    return {
      totalPatients: items.length,
      trends: [],
      ageGroups: options.includeAgeGroups ? {} : undefined,
      demographics: options.includeDemographics ? {} : undefined
    };
  }

  private processAppointmentAnalytics(items: any[], options: { includeNoShows?: boolean }) {
    // Process appointment analytics
    return {
      totalAppointments: items.length,
      completionRate: 0,
      noShowRate: options.includeNoShows ? 0 : undefined,
      trends: []
    };
  }

  private processConversionData(items: any[], segmentation?: string) {
    // Process conversion funnel data
    return {
      totalConversions: items.length,
      conversionRate: 0,
      funnel: [],
      segments: segmentation ? {} : undefined
    };
  }

  private processHealthMetrics(items: any[], options: { includeRegions?: boolean }) {
    // Process system health metrics
    return {
      overallHealth: 95,
      uptime: 99.9,
      performance: {},
      regions: options.includeRegions ? {} : undefined
    };
  }

  private getExportableMetrics(dataType: string): string[] {
    const exportMetrics: Record<string, string[]> = {
      'summary': ['overview', 'trends'],
      'detailed': ['all'],
      'financial': ['revenue', 'invoices'],
      'usage': ['feature_usage', 'user_activity']
    };

    return exportMetrics[dataType] || exportMetrics['summary'];
  }

  private formatExportData(data: any, format: string) {
    switch (format) {
      case 'csv':
        return this.convertToCSV(data);
      case 'xlsx':
        return this.convertToExcel(data);
      default:
        return data;
    }
  }

  private convertToCSV(data: any): string {
    // Convert analytics data to CSV format
    return 'timestamp,metric,value\n'; // Mock CSV header
  }

  private convertToExcel(data: any): Buffer {
    // Convert analytics data to Excel format
    return Buffer.from(''); // Mock Excel data
  }

  private generateInsights(overview: any, trends: any, scope: 'platform' | 'clinic'): string[] {
    // Generate AI-powered insights
    const insights: string[] = [];
    
    // Add contextual insights based on data patterns
    if (overview.periodComparison.percentageChange > 10) {
      insights.push(`Strong growth of ${overview.periodComparison.percentageChange.toFixed(1)}% compared to previous period`);
    }

    return insights;
  }
}