export interface EnvironmentConfig {
  environment: string;
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
  allowedOrigins: string[];
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
    pointInTimeRecovery: boolean;
    encryption: boolean;
    backupRetentionDays: number;
  };
  lambda: {
    memorySize: number;
    timeout: number;
    reservedConcurrency?: number;
    environment: Record<string, string>;
  };
  monitoring: {
    alertEmail: string;
    dashboardName: string;
    logRetentionDays: number;
  };
  backup: {
    crossRegionReplication: boolean;
    backupRegion?: string;
    retentionDays: number;
  };
  cognito: {
    passwordPolicy: {
      minLength: number;
      requireUppercase: boolean;
      requireLowercase: boolean;
      requireDigits: boolean;
      requireSymbols: boolean;
    };
    mfaConfiguration: 'OFF' | 'OPTIONAL' | 'REQUIRED';
  };
  costThresholds: {
    monthlyBudget: number;
    costPerDoctor: number;
    warningThreshold: number;
  };
}

const baseConfig: Omit<EnvironmentConfig, 'environment' | 'domainName' | 'certificateArn' | 'hostedZoneId'> = {
  allowedOrigins: ['http://localhost:3000'],
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST',
    pointInTimeRecovery: true,
    encryption: true,
    backupRetentionDays: 35,
  },
  lambda: {
    memorySize: 1024,
    timeout: 30,
    environment: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
    },
  },
  monitoring: {
    alertEmail: process.env.ALERT_EMAIL || 'alerts@medeez.com',
    dashboardName: 'MedeezDashboard',
    logRetentionDays: 30,
  },
  backup: {
    crossRegionReplication: false,
    retentionDays: 90,
  },
  cognito: {
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireDigits: true,
      requireSymbols: true,
    },
    mfaConfiguration: 'OPTIONAL',
  },
  costThresholds: {
    monthlyBudget: 1000,
    costPerDoctor: 50,
    warningThreshold: 80,
  },
};

export function getEnvironmentConfig(environment: string): EnvironmentConfig {
  const configs: Record<string, Partial<EnvironmentConfig>> = {
    dev: {
      environment: 'dev',
      domainName: 'dev.medeez.com',
      allowedOrigins: ['http://localhost:3000', 'https://dev.medeez.com'],
      dynamodb: {
        ...baseConfig.dynamodb,
        encryption: false, // Disable customer-managed encryption for dev to avoid circular dependency
      },
      lambda: {
        ...baseConfig.lambda,
        memorySize: 512,
        environment: {
          ...baseConfig.lambda.environment,
          NODE_ENV: 'development',
          LOG_LEVEL: 'debug',
        },
      },
      monitoring: {
        ...baseConfig.monitoring,
        logRetentionDays: 7,
      },
      backup: {
        ...baseConfig.backup,
        crossRegionReplication: false,
        retentionDays: 30,
      },
      cognito: {
        ...baseConfig.cognito,
        passwordPolicy: {
          ...baseConfig.cognito.passwordPolicy,
          minLength: 8,
          requireSymbols: false,
        },
        mfaConfiguration: 'OFF',
      },
      costThresholds: {
        monthlyBudget: 200,
        costPerDoctor: 20,
        warningThreshold: 70,
      },
    },
    staging: {
      environment: 'staging',
      domainName: 'staging.medeez.com',
      allowedOrigins: ['https://staging.medeez.com'],
      lambda: {
        ...baseConfig.lambda,
        memorySize: 768,
        environment: {
          ...baseConfig.lambda.environment,
          NODE_ENV: 'staging',
          LOG_LEVEL: 'info',
        },
      },
      monitoring: {
        ...baseConfig.monitoring,
        logRetentionDays: 14,
      },
      backup: {
        ...baseConfig.backup,
        crossRegionReplication: true,
        backupRegion: 'us-west-2',
        retentionDays: 60,
      },
      costThresholds: {
        monthlyBudget: 500,
        costPerDoctor: 35,
        warningThreshold: 75,
      },
    },
    prod: {
      environment: 'prod',
      domainName: 'medeez.com',
      allowedOrigins: ['https://medeez.com'],
      lambda: {
        ...baseConfig.lambda,
        memorySize: 1024,
        reservedConcurrency: 100,
        environment: {
          ...baseConfig.lambda.environment,
          NODE_ENV: 'production',
          LOG_LEVEL: 'warn',
        },
      },
      monitoring: {
        ...baseConfig.monitoring,
        logRetentionDays: 90,
      },
      backup: {
        ...baseConfig.backup,
        crossRegionReplication: true,
        backupRegion: 'us-west-2',
        retentionDays: 365,
      },
      cognito: {
        ...baseConfig.cognito,
        mfaConfiguration: 'REQUIRED',
      },
      costThresholds: {
        monthlyBudget: 2000,
        costPerDoctor: 50,
        warningThreshold: 85,
      },
    },
  };

  const envConfig = configs[environment];
  if (!envConfig) {
    throw new Error(`Unknown environment: ${environment}`);
  }

  return {
    ...baseConfig,
    ...envConfig,
  } as EnvironmentConfig;
}

export function getSecretNames(environment: string) {
  const prefix = `medeez-${environment}`;
  return {
    databaseUrl: `${prefix}-database-url`,
    jwtSecret: `${prefix}-jwt-secret`,
    paddleApiKey: `${prefix}-paddle-api-key`,
    paddlePublicKey: `${prefix}-paddle-public-key`,
    googleClientSecret: `${prefix}-google-client-secret`,
    slackWebhook: `${prefix}-slack-webhook`,
    sentry: `${prefix}-sentry-dsn`,
  };
}

export function getParameterNames(environment: string) {
  const prefix = `/medeez/${environment}`;
  return {
    domainName: `${prefix}/domain-name`,
    apiUrl: `${prefix}/api-url`,
    webUrl: `${prefix}/web-url`,
    userPoolId: `${prefix}/cognito/user-pool-id`,
    userPoolClientId: `${prefix}/cognito/user-pool-client-id`,
    dynamoTableName: `${prefix}/dynamo/table-name`,
    s3BucketName: `${prefix}/s3/bucket-name`,
    kmsKeyId: `${prefix}/kms/key-id`,
  };
}