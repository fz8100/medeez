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
export declare function getEnvironmentConfig(environment: string): EnvironmentConfig;
export declare function getSecretNames(environment: string): {
    databaseUrl: string;
    jwtSecret: string;
    paddleApiKey: string;
    paddlePublicKey: string;
    googleClientSecret: string;
    slackWebhook: string;
    sentry: string;
};
export declare function getParameterNames(environment: string): {
    domainName: string;
    apiUrl: string;
    webUrl: string;
    userPoolId: string;
    userPoolClientId: string;
    dynamoTableName: string;
    s3BucketName: string;
    kmsKeyId: string;
};
