import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { KMSClient, DescribeKeyCommand } from '@aws-sdk/client-kms';
import { logger } from '@/utils/logger';
import { rdsService } from './rdsService';
import { s3Service } from './s3Service';
import { emailService } from './emailService';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  details: Record<string, any>;
  error?: string;
}

export interface OverallHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  totalResponseTime: number;
  checks: Record<string, HealthCheckResult>;
  environment: string;
  region: string;
}

export class HealthMonitoringService {
  private dynamoClient: DynamoDBClient;
  private kmsClient: KMSClient;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    
    this.dynamoClient = new DynamoDBClient({
      region,
      maxAttempts: 2
    });

    this.kmsClient = new KMSClient({
      region,
      maxAttempts: 2
    });
  }

  /**
   * Check DynamoDB health
   */
  async checkDynamoDBHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      const tableName = process.env.DYNAMODB_TABLE_NAME || 'medeez-main';
      const command = new DescribeTableCommand({ TableName: tableName });
      const result = await this.dynamoClient.send(command);
      
      return {
        service: 'dynamodb',
        status: result.Table?.TableStatus === 'ACTIVE' ? 'healthy' : 'degraded',
        responseTime: Date.now() - start,
        details: {
          tableName: result.Table?.TableName,
          tableStatus: result.Table?.TableStatus,
          itemCount: result.Table?.ItemCount || 0,
          tableSizeBytes: result.Table?.TableSizeBytes || 0,
          provisionedThroughput: {
            readCapacityUnits: result.Table?.ProvisionedThroughput?.ReadCapacityUnits,
            writeCapacityUnits: result.Table?.ProvisionedThroughput?.WriteCapacityUnits
          },
          billingMode: result.Table?.BillingModeSummary?.BillingMode,
          gsiCount: result.Table?.GlobalSecondaryIndexes?.length || 0
        }
      };
    } catch (error: any) {
      return {
        service: 'dynamodb',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        details: {},
        error: error.message || 'DynamoDB connection failed'
      };
    }
  }

  /**
   * Check RDS PostgreSQL health
   */
  async checkRDSHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      const rdsHealth = await rdsService.healthCheck();
      
      return {
        service: 'rds',
        status: rdsHealth.healthy ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - start,
        details: rdsHealth.details
      };
    } catch (error: any) {
      return {
        service: 'rds',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        details: {},
        error: error.message || 'RDS connection failed'
      };
    }
  }

  /**
   * Check S3 health
   */
  async checkS3Health(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      // Simple connectivity test - check if bucket is accessible
      const bucketName = process.env.S3_BUCKET_NAME || 'medeez-app-data-1756661993';
      
      // Try to check if a health check file exists
      try {
        await s3Service.fileExists('health-check/ping.txt', 'system');
      } catch (error: any) {
        // If it's an access error, the bucket is accessible
        if (!error.message?.includes('Access denied to file')) {
          throw error;
        }
      }
      
      return {
        service: 's3',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: {
          bucketName,
          region: process.env.AWS_REGION || 'us-east-1',
          accessible: true
        }
      };
    } catch (error: any) {
      return {
        service: 's3',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        details: {},
        error: error.message || 'S3 connection failed'
      };
    }
  }

  /**
   * Check SES health
   */
  async checkSESHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      const sendingEnabled = await emailService.isSendingEnabled();
      const templates = await emailService.listTemplates(5);
      
      return {
        service: 'ses',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: {
          sendingEnabled,
          region: process.env.AWS_REGION || 'us-east-1',
          templatesCount: templates.length,
          configurationSet: process.env.SES_CONFIGURATION_SET || 'medeez-email'
        }
      };
    } catch (error: any) {
      return {
        service: 'ses',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        details: {},
        error: error.message || 'SES connection failed'
      };
    }
  }

  /**
   * Check KMS health
   */
  async checkKMSHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      // Check AWS managed S3 key as a connectivity test
      const command = new DescribeKeyCommand({
        KeyId: 'alias/aws/s3'
      });
      
      const result = await this.kmsClient.send(command);
      
      return {
        service: 'kms',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: {
          region: process.env.AWS_REGION || 'us-east-1',
          keyArn: result.KeyMetadata?.Arn,
          keyUsage: result.KeyMetadata?.KeyUsage,
          keyState: result.KeyMetadata?.KeyState
        }
      };
    } catch (error: any) {
      return {
        service: 'kms',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        details: {},
        error: error.message || 'KMS connection failed'
      };
    }
  }

  /**
   * Check application-level health
   */
  async checkApplicationHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Check memory usage thresholds
      const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      const status = memoryUsagePercent > 90 ? 'degraded' : 'healthy';
      
      return {
        service: 'application',
        status,
        responseTime: Date.now() - start,
        details: {
          uptime,
          memoryUsage: {
            rss: Math.round(memUsage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024), // MB
            heapUsedPercent: Math.round(memoryUsagePercent)
          },
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          environment: process.env.NODE_ENV || 'unknown'
        }
      };
    } catch (error: any) {
      return {
        service: 'application',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        details: {},
        error: error.message || 'Application health check failed'
      };
    }
  }

  /**
   * Run comprehensive health check on all services
   */
  async runFullHealthCheck(): Promise<OverallHealth> {
    const start = Date.now();
    
    // Run all health checks in parallel
    const [
      appHealth,
      dynamoHealth,
      rdsHealth,
      s3Health,
      sesHealth,
      kmsHealth
    ] = await Promise.all([
      this.checkApplicationHealth(),
      this.checkDynamoDBHealth(),
      this.checkRDSHealth(),
      this.checkS3Health(),
      this.checkSESHealth(),
      this.checkKMSHealth()
    ]);

    const checks = {
      application: appHealth,
      dynamodb: dynamoHealth,
      rds: rdsHealth,
      s3: s3Health,
      ses: sesHealth,
      kms: kmsHealth
    };

    // Determine overall status
    const statuses = Object.values(checks).map(check => check.status);
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    const totalResponseTime = Date.now() - start;

    // Record metrics
    try {
      await rdsService.recordMetric(
        'health_check_duration',
        totalResponseTime,
        'milliseconds',
        {
          overall_status: overallStatus,
          environment: process.env.NODE_ENV || 'unknown'
        }
      );

      // Record individual service metrics
      for (const [serviceName, check] of Object.entries(checks)) {
        await rdsService.recordMetric(
          `service_health_${serviceName}`,
          check.status === 'healthy' ? 1 : 0,
          'boolean',
          {
            service: serviceName,
            response_time: check.responseTime,
            environment: process.env.NODE_ENV || 'unknown'
          }
        );
      }
    } catch (error) {
      logger.warn('Failed to record health check metrics', error);
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      totalResponseTime,
      checks,
      environment: process.env.NODE_ENV || 'unknown',
      region: process.env.AWS_REGION || 'us-east-1'
    };
  }

  /**
   * Check if service is ready to handle requests
   */
  async checkReadiness(): Promise<{
    ready: boolean;
    checks: Record<string, boolean>;
    timestamp: string;
  }> {
    try {
      // Basic readiness checks - critical services must be healthy
      const [dynamoHealth, rdsHealth] = await Promise.all([
        this.checkDynamoDBHealth(),
        this.checkRDSHealth()
      ]);

      const checks = {
        database: dynamoHealth.status === 'healthy',
        auditStorage: rdsHealth.status === 'healthy'
      };

      const ready = Object.values(checks).every(check => check);

      return {
        ready,
        checks,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Readiness check failed', error);
      return {
        ready: false,
        checks: {
          database: false,
          auditStorage: false
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Simple liveness check
   */
  checkLiveness(): {
    alive: boolean;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    timestamp: string;
  } {
    return {
      alive: true,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Run periodic health checks and alert on issues
   */
  async runPeriodicHealthCheck(): Promise<void> {
    try {
      const health = await this.runFullHealthCheck();
      
      if (health.status === 'unhealthy') {
        logger.error('System health check failed', {
          status: health.status,
          failedServices: Object.entries(health.checks)
            .filter(([_, check]) => check.status === 'unhealthy')
            .map(([service, check]) => ({
              service,
              error: check.error,
              responseTime: check.responseTime
            }))
        });

        // Send alert email to admin
        const failedServices = Object.entries(health.checks)
          .filter(([_, check]) => check.status === 'unhealthy')
          .map(([service, check]) => `${service}: ${check.error}`)
          .join('\n');

        try {
          await emailService.sendSystemNotification(
            process.env.ADMIN_EMAIL || 'admin@medeez.com',
            'System Health Alert',
            `System health check failed.\n\nFailed services:\n${failedServices}\n\nTotal response time: ${health.totalResponseTime}ms`,
            'high'
          );
        } catch (emailError) {
          logger.error('Failed to send health alert email', emailError);
        }
      } else if (health.status === 'degraded') {
        logger.warn('System health degraded', {
          status: health.status,
          degradedServices: Object.entries(health.checks)
            .filter(([_, check]) => check.status === 'degraded')
            .map(([service, check]) => ({
              service,
              details: check.details,
              responseTime: check.responseTime
            }))
        });
      }
    } catch (error) {
      logger.error('Periodic health check failed', error);
    }
  }
}

// Singleton instance
export const healthMonitoringService = new HealthMonitoringService();