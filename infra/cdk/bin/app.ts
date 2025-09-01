#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { SecurityStack } from '../lib/security-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { BackupStack } from '../lib/backup-stack';
import { getEnvironmentConfig } from '../lib/config';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';
const config = getEnvironmentConfig(environment);

// Define common tags
const commonTags = {
  Environment: environment,
  Project: 'Medeez',
  ManagedBy: 'CDK',
  CostCenter: 'Engineering',
  Compliance: 'HIPAA',
};

// Add tags to all stacks
cdk.Tags.of(app).add('Environment', environment);
cdk.Tags.of(app).add('Project', 'Medeez');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('CostCenter', 'Engineering');
cdk.Tags.of(app).add('Compliance', 'HIPAA');

// Security Stack (KMS, Secrets, IAM roles)
const securityStack = new SecurityStack(app, `MedeezSecurityStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  config,
  tags: commonTags,
});

// Database Stack (DynamoDB, S3)
const databaseStack = new DatabaseStack(app, `MedeezDatabaseStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  config,
  kmsKey: securityStack.kmsKey,
  tags: commonTags,
});

// API Stack (Lambda, API Gateway, Cognito)
const apiStack = new ApiStack(app, `MedeezApiStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  config,
  dynamoTable: databaseStack.dynamoTable,
  s3Bucket: databaseStack.s3Bucket,
  kmsKey: securityStack.kmsKey,
  apiRole: securityStack.apiRole,
  tags: commonTags,
});

// Frontend Stack (CloudFront, Amplify)
const frontendStack = new FrontendStack(app, `MedeezFrontendStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  config,
  apiUrl: apiStack.apiUrl,
  userPool: apiStack.userPool,
  userPoolClient: apiStack.userPoolClient,
  tags: commonTags,
});

// Monitoring Stack (CloudWatch, Alarms)
const monitoringStack = new MonitoringStack(app, `MedeezMonitoringStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  config,
  dynamoTable: databaseStack.dynamoTable,
  apiFunction: apiStack.apiFunction,
  apiGateway: apiStack.apiGateway,
  cloudFrontDistribution: frontendStack.cloudFrontDistribution,
  tags: commonTags,
});

// Backup Stack (DynamoDB PITR, S3 Replication)
const backupStack = new BackupStack(app, `MedeezBackupStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  config,
  dynamoTable: databaseStack.dynamoTable,
  s3Bucket: databaseStack.s3Bucket,
  kmsKey: securityStack.kmsKey,
  tags: commonTags,
});

// Output important values
new cdk.CfnOutput(apiStack, `MedeezApiUrl-${environment}`, {
  value: apiStack.apiUrl,
  description: 'API Gateway URL',
  exportName: `MedeezApiUrl-${environment}`,
});

new cdk.CfnOutput(frontendStack, `MedeezWebUrl-${environment}`, {
  value: frontendStack.webUrl,
  description: 'CloudFront Distribution URL',
  exportName: `MedeezWebUrl-${environment}`,
});

new cdk.CfnOutput(apiStack, `MedeezUserPoolId-${environment}`, {
  value: apiStack.userPool.userPoolId,
  description: 'Cognito User Pool ID',
  exportName: `MedeezUserPoolId-${environment}`,
});

new cdk.CfnOutput(apiStack, `MedeezUserPoolClientId-${environment}`, {
  value: apiStack.userPoolClient.userPoolClientId,
  description: 'Cognito User Pool Client ID',
  exportName: `MedeezUserPoolClientId-${environment}`,
});