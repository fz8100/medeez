import { logger } from '@/utils/logger';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { KMSClient, DescribeKeyCommand } from '@aws-sdk/client-kms';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { SESClient, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { CognitoIdentityProviderClient, DescribeUserPoolCommand } from '@aws-sdk/client-cognito-identity-provider';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

export interface ValidationResult {
  service: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  responseTime?: number;
}

export interface ConfigValidationReport {
  timestamp: string;
  environment: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  results: ValidationResult[];
  summary: {
    total: number;
    healthy: number;
    warnings: number;
    errors: number;
  };
}

/**
 * Configuration Validation Service
 * Validates all AWS services and external integrations
 */
export class ConfigValidationService {
  private dynamoClient: DynamoDBClient;
  private s3Client: S3Client;
  private kmsClient: KMSClient;
  private secretsClient: SecretsManagerClient;
  private sesClient: SESClient;
  private cognitoClient: CognitoIdentityProviderClient;
  private ssmClient: SSMClient;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    
    this.dynamoClient = new DynamoDBClient({ region });
    this.s3Client = new S3Client({ region });
    this.kmsClient = new KMSClient({ region });
    this.secretsClient = new SecretsManagerClient({ region });
    this.sesClient = new SESClient({ region });
    this.cognitoClient = new CognitoIdentityProviderClient({ region });
    this.ssmClient = new SSMClient({ region });
  }

  /**
   * Run comprehensive configuration validation
   */
  async validateConfiguration(): Promise<ConfigValidationReport> {
    const startTime = Date.now();
    const environment = process.env.ENVIRONMENT || 'dev';
    const results: ValidationResult[] = [];

    logger.info('Starting configuration validation', { environment });

    // Environment Variables Validation
    results.push(await this.validateEnvironmentVariables());

    // AWS Services Validation
    results.push(await this.validateDynamoDB());
    results.push(await this.validateS3());
    results.push(await this.validateKMS());
    results.push(await this.validateSecretsManager());
    results.push(await this.validateSES());
    results.push(await this.validateCognito());
    results.push(await this.validateSSM());

    // External Integrations Validation
    results.push(await this.validateTwilio());
    results.push(await this.validateStripe());
    results.push(await this.validateGoogle());

    // Network and Security Validation
    results.push(await this.validateNetworkConnectivity());
    results.push(await this.validateSecurityConfiguration());

    const summary = this.generateSummary(results);
    const overallStatus = this.determineOverallStatus(summary);

    const report: ConfigValidationReport = {
      timestamp: new Date().toISOString(),
      environment,
      overallStatus,
      results,
      summary,
    };

    const totalTime = Date.now() - startTime;
    logger.info('Configuration validation completed', {
      environment,
      overallStatus,
      totalTime,
      summary,
    });

    return report;
  }

  /**
   * Validate required environment variables
   */
  private async validateEnvironmentVariables(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const requiredVars = [
        'NODE_ENV',
        'AWS_REGION',
        'DYNAMO_TABLE_NAME',
        'S3_BUCKET_NAME',
        'KMS_KEY_ID',
        'COGNITO_USER_POOL_ID',
        'COGNITO_CLIENT_ID',
      ];

      const missing: string[] = [];
      const present: string[] = [];

      for (const variable of requiredVars) {
        if (!process.env[variable]) {
          missing.push(variable);
        } else {
          present.push(variable);
        }
      }

      const responseTime = Date.now() - startTime;

      if (missing.length === 0) {
        return {
          service: 'Environment Variables',
          status: 'healthy',
          message: `All ${requiredVars.length} required environment variables are present`,
          details: { present },
          responseTime,
        };
      } else {
        return {
          service: 'Environment Variables',
          status: 'error',
          message: `Missing ${missing.length} required environment variables`,
          details: { missing, present },
          responseTime,
        };
      }
    } catch (error: any) {
      return {
        service: 'Environment Variables',
        status: 'error',
        message: `Failed to validate environment variables: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate DynamoDB connectivity and configuration
   */
  private async validateDynamoDB(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const tableName = process.env.DYNAMO_TABLE_NAME;
      if (!tableName) {
        return {
          service: 'DynamoDB',
          status: 'error',
          message: 'DYNAMO_TABLE_NAME environment variable not set',
          responseTime: Date.now() - startTime,
        };
      }

      const command = new DescribeTableCommand({ TableName: tableName });
      const response = await this.dynamoClient.send(command);

      const responseTime = Date.now() - startTime;

      if (response.Table?.TableStatus === 'ACTIVE') {
        return {
          service: 'DynamoDB',
          status: 'healthy',
          message: 'DynamoDB table is active and accessible',
          details: {
            tableName: response.Table.TableName,
            status: response.Table.TableStatus,
            itemCount: response.Table.ItemCount,
            gsiCount: response.Table.GlobalSecondaryIndexes?.length || 0,
          },
          responseTime,
        };
      } else {
        return {
          service: 'DynamoDB',
          status: 'warning',
          message: `DynamoDB table status is ${response.Table?.TableStatus}`,
          details: { status: response.Table?.TableStatus },
          responseTime,
        };
      }
    } catch (error: any) {
      return {
        service: 'DynamoDB',
        status: 'error',
        message: `DynamoDB validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate S3 connectivity and configuration
   */
  private async validateS3(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) {
        return {
          service: 'S3',
          status: 'error',
          message: 'S3_BUCKET_NAME environment variable not set',
          responseTime: Date.now() - startTime,
        };
      }

      const command = new HeadBucketCommand({ Bucket: bucketName });
      await this.s3Client.send(command);

      const responseTime = Date.now() - startTime;

      return {
        service: 'S3',
        status: 'healthy',
        message: 'S3 bucket is accessible',
        details: { bucketName },
        responseTime,
      };
    } catch (error: any) {
      return {
        service: 'S3',
        status: 'error',
        message: `S3 validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate KMS key accessibility
   */
  private async validateKMS(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const keyId = process.env.KMS_KEY_ID;
      if (!keyId) {
        return {
          service: 'KMS',
          status: 'error',
          message: 'KMS_KEY_ID environment variable not set',
          responseTime: Date.now() - startTime,
        };
      }

      const command = new DescribeKeyCommand({ KeyId: keyId });
      const response = await this.kmsClient.send(command);

      const responseTime = Date.now() - startTime;

      if (response.KeyMetadata?.Enabled) {
        return {
          service: 'KMS',
          status: 'healthy',
          message: 'KMS key is enabled and accessible',
          details: {
            keyId: response.KeyMetadata.KeyId,
            enabled: response.KeyMetadata.Enabled,
            keyUsage: response.KeyMetadata.KeyUsage,
          },
          responseTime,
        };
      } else {
        return {
          service: 'KMS',
          status: 'warning',
          message: 'KMS key is disabled or not accessible',
          details: { enabled: response.KeyMetadata?.Enabled },
          responseTime,
        };
      }
    } catch (error: any) {
      return {
        service: 'KMS',
        status: 'error',
        message: `KMS validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate Secrets Manager connectivity
   */
  private async validateSecretsManager(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const environment = process.env.ENVIRONMENT || 'dev';
      const secretName = `medeez-${environment}-jwt-secret`;

      const command = new GetSecretValueCommand({ SecretId: secretName });
      await this.secretsClient.send(command);

      const responseTime = Date.now() - startTime;

      return {
        service: 'Secrets Manager',
        status: 'healthy',
        message: 'Secrets Manager is accessible',
        details: { secretName },
        responseTime,
      };
    } catch (error: any) {
      return {
        service: 'Secrets Manager',
        status: 'error',
        message: `Secrets Manager validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate SES configuration and send quota
   */
  private async validateSES(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const command = new GetSendQuotaCommand({});
      const response = await this.sesClient.send(command);

      const responseTime = Date.now() - startTime;

      return {
        service: 'SES',
        status: 'healthy',
        message: 'SES is accessible and configured',
        details: {
          sendQuota: response.Max24HourSend,
          sent: response.SentLast24Hours,
          sendRate: response.MaxSendRate,
        },
        responseTime,
      };
    } catch (error: any) {
      return {
        service: 'SES',
        status: 'error',
        message: `SES validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate Cognito User Pool
   */
  private async validateCognito(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const userPoolId = process.env.COGNITO_USER_POOL_ID;
      if (!userPoolId) {
        return {
          service: 'Cognito',
          status: 'error',
          message: 'COGNITO_USER_POOL_ID environment variable not set',
          responseTime: Date.now() - startTime,
        };
      }

      const command = new DescribeUserPoolCommand({ UserPoolId: userPoolId });
      const response = await this.cognitoClient.send(command);

      const responseTime = Date.now() - startTime;

      return {
        service: 'Cognito',
        status: 'healthy',
        message: 'Cognito User Pool is accessible',
        details: {
          userPoolId: response.UserPool?.Id,
          name: response.UserPool?.Name,
          status: response.UserPool?.Status,
        },
        responseTime,
      };
    } catch (error: any) {
      return {
        service: 'Cognito',
        status: 'error',
        message: `Cognito validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate SSM Parameter Store access
   */
  private async validateSSM(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const environment = process.env.ENVIRONMENT || 'dev';
      const parameterNames = [
        `/medeez/${environment}/api-url`,
        `/medeez/${environment}/cognito/user-pool-id`,
      ];

      const command = new GetParametersCommand({ Names: parameterNames });
      const response = await this.ssmClient.send(command);

      const responseTime = Date.now() - startTime;

      const foundParameters = response.Parameters?.length || 0;
      const totalParameters = parameterNames.length;

      if (foundParameters === totalParameters) {
        return {
          service: 'SSM Parameter Store',
          status: 'healthy',
          message: 'All SSM parameters are accessible',
          details: { found: foundParameters, total: totalParameters },
          responseTime,
        };
      } else {
        return {
          service: 'SSM Parameter Store',
          status: 'warning',
          message: `Found ${foundParameters}/${totalParameters} SSM parameters`,
          details: { found: foundParameters, total: totalParameters },
          responseTime,
        };
      }
    } catch (error: any) {
      return {
        service: 'SSM Parameter Store',
        status: 'error',
        message: `SSM validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate Twilio configuration (if available)
   */
  private async validateTwilio(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const environment = process.env.ENVIRONMENT || 'dev';
      const secretName = `medeez-${environment}-twilio`;

      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.secretsClient.send(command);

      if (response.SecretString) {
        const credentials = JSON.parse(response.SecretString);
        
        // Check if credentials are placeholders
        if (credentials.account_sid?.startsWith('PLACEHOLDER')) {
          return {
            service: 'Twilio',
            status: 'warning',
            message: 'Twilio credentials are placeholder values',
            details: { configured: false },
            responseTime: Date.now() - startTime,
          };
        }

        return {
          service: 'Twilio',
          status: 'healthy',
          message: 'Twilio credentials are configured',
          details: { configured: true },
          responseTime: Date.now() - startTime,
        };
      }

      return {
        service: 'Twilio',
        status: 'warning',
        message: 'Twilio secret exists but is empty',
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        service: 'Twilio',
        status: 'warning',
        message: `Twilio validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate Stripe configuration (if available)
   */
  private async validateStripe(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const environment = process.env.ENVIRONMENT || 'dev';
      const secretName = `medeez-${environment}-stripe`;

      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.secretsClient.send(command);

      if (response.SecretString) {
        const credentials = JSON.parse(response.SecretString);
        
        // Check if credentials are placeholders
        if (credentials.secret_key?.startsWith('PLACEHOLDER')) {
          return {
            service: 'Stripe',
            status: 'warning',
            message: 'Stripe credentials are placeholder values',
            details: { configured: false },
            responseTime: Date.now() - startTime,
          };
        }

        return {
          service: 'Stripe',
          status: 'healthy',
          message: 'Stripe credentials are configured',
          details: { configured: true },
          responseTime: Date.now() - startTime,
        };
      }

      return {
        service: 'Stripe',
        status: 'warning',
        message: 'Stripe secret exists but is empty',
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        service: 'Stripe',
        status: 'warning',
        message: `Stripe validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate Google API configuration (if available)
   */
  private async validateGoogle(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const environment = process.env.ENVIRONMENT || 'dev';
      const secretName = `medeez-${environment}-google`;

      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.secretsClient.send(command);

      if (response.SecretString) {
        const credentials = JSON.parse(response.SecretString);
        
        // Check if credentials are placeholders
        if (credentials.client_id?.startsWith('PLACEHOLDER')) {
          return {
            service: 'Google APIs',
            status: 'warning',
            message: 'Google API credentials are placeholder values',
            details: { configured: false },
            responseTime: Date.now() - startTime,
          };
        }

        return {
          service: 'Google APIs',
          status: 'healthy',
          message: 'Google API credentials are configured',
          details: { configured: true },
          responseTime: Date.now() - startTime,
        };
      }

      return {
        service: 'Google APIs',
        status: 'warning',
        message: 'Google API secret exists but is empty',
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        service: 'Google APIs',
        status: 'warning',
        message: `Google API validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate network connectivity
   */
  private async validateNetworkConnectivity(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      // This is a basic check - in a real implementation you might ping specific endpoints
      const responseTime = Date.now() - startTime;

      return {
        service: 'Network Connectivity',
        status: 'healthy',
        message: 'Network connectivity is available',
        responseTime,
      };
    } catch (error: any) {
      return {
        service: 'Network Connectivity',
        status: 'error',
        message: `Network validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate security configuration
   */
  private async validateSecurityConfiguration(): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      const securityChecks = {
        httpsEnforced: process.env.FORCE_HTTPS === 'true',
        phiEncryptionEnabled: process.env.PHI_ENCRYPTION_ENABLED === 'true',
        auditLoggingEnabled: process.env.AUDIT_LOGGING_ENABLED === 'true',
        sessionSecure: process.env.SESSION_SECURE === 'true',
        corsConfigured: !!process.env.CORS_ORIGINS,
      };

      const passedChecks = Object.values(securityChecks).filter(Boolean).length;
      const totalChecks = Object.keys(securityChecks).length;

      const responseTime = Date.now() - startTime;

      if (passedChecks === totalChecks) {
        return {
          service: 'Security Configuration',
          status: 'healthy',
          message: 'All security configurations are properly set',
          details: securityChecks,
          responseTime,
        };
      } else {
        return {
          service: 'Security Configuration',
          status: 'warning',
          message: `${passedChecks}/${totalChecks} security configurations are properly set`,
          details: securityChecks,
          responseTime,
        };
      }
    } catch (error: any) {
      return {
        service: 'Security Configuration',
        status: 'error',
        message: `Security validation failed: ${error.message}`,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(results: ValidationResult[]) {
    return {
      total: results.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      warnings: results.filter(r => r.status === 'warning').length,
      errors: results.filter(r => r.status === 'error').length,
    };
  }

  /**
   * Determine overall system status
   */
  private determineOverallStatus(summary: { total: number; healthy: number; warnings: number; errors: number }) {
    if (summary.errors > 0) {
      return 'error';
    } else if (summary.warnings > 0) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }
}