#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const database_stack_1 = require("../lib/database-stack");
const security_stack_1 = require("../lib/security-stack");
const cognito_stack_1 = require("../lib/cognito-stack");
const api_stack_1 = require("../lib/api-stack");
const frontend_stack_1 = require("../lib/frontend-stack");
const monitoring_stack_1 = require("../lib/monitoring-stack");
const backup_stack_1 = require("../lib/backup-stack");
const config_1 = require("../lib/config");
const app = new cdk.App();
// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';
const config = (0, config_1.getEnvironmentConfig)(environment);
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
const securityStack = new security_stack_1.SecurityStack(app, `MedeezSecurityStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    environment,
    config,
    tags: commonTags,
});
// Database Stack (DynamoDB, S3)
const databaseStack = new database_stack_1.DatabaseStack(app, `MedeezDatabaseStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    environment,
    config,
    kmsKey: securityStack.kmsKey,
    tags: commonTags,
});
// Cognito Stack (User Pool, Identity Pool, Lambda triggers)
const cognitoStack = new cognito_stack_1.CognitoStack(app, `MedeezCognitoStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    environment,
    config,
    kmsKey: securityStack.kmsKey,
    apiRole: securityStack.apiRole,
    tags: commonTags,
});
// API Stack (Lambda, API Gateway)
const apiStack = new api_stack_1.ApiStack(app, `MedeezApiStack-${environment}`, {
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
    userPool: cognitoStack.userPool,
    userPoolClient: cognitoStack.userPoolClient,
    tags: commonTags,
});
// Frontend Stack (CloudFront, Amplify)
const frontendStack = new frontend_stack_1.FrontendStack(app, `MedeezFrontendStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    environment,
    config,
    apiUrl: apiStack.apiUrl,
    userPool: cognitoStack.userPool,
    userPoolClient: cognitoStack.userPoolClient,
    tags: commonTags,
});
// Monitoring Stack (CloudWatch, Alarms)
const monitoringStack = new monitoring_stack_1.MonitoringStack(app, `MedeezMonitoringStack-${environment}`, {
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
const backupStack = new backup_stack_1.BackupStack(app, `MedeezBackupStack-${environment}`, {
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
new cdk.CfnOutput(cognitoStack, `MedeezUserPoolId-${environment}`, {
    value: cognitoStack.userPool.userPoolId,
    description: 'Cognito User Pool ID',
    exportName: `MedeezUserPoolId-${environment}`,
});
new cdk.CfnOutput(cognitoStack, `MedeezUserPoolClientId-${environment}`, {
    value: cognitoStack.userPoolClient.userPoolClientId,
    description: 'Cognito User Pool Client ID',
    exportName: `MedeezUserPoolClientId-${environment}`,
});
new cdk.CfnOutput(cognitoStack, `MedeezIdentityPoolId-${environment}`, {
    value: cognitoStack.identityPool.ref,
    description: 'Cognito Identity Pool ID',
    exportName: `MedeezIdentityPoolId-${environment}`,
});
new cdk.CfnOutput(cognitoStack, `MedeezUserPoolArn-${environment}`, {
    value: cognitoStack.userPool.userPoolArn,
    description: 'Cognito User Pool ARN',
    exportName: `MedeezUserPoolArn-${environment}`,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLXVwZGF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9iaW4vYXBwLXVwZGF0ZWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQywwREFBc0Q7QUFDdEQsMERBQXNEO0FBQ3RELHdEQUFvRDtBQUNwRCxnREFBNEM7QUFDNUMsMERBQXNEO0FBQ3RELDhEQUEwRDtBQUMxRCxzREFBa0Q7QUFDbEQsMENBQXFEO0FBRXJELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLCtCQUErQjtBQUMvQixNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLENBQUM7QUFDbkUsTUFBTSxNQUFNLEdBQUcsSUFBQSw2QkFBb0IsRUFBQyxXQUFXLENBQUMsQ0FBQztBQUVqRCxxQkFBcUI7QUFDckIsTUFBTSxVQUFVLEdBQUc7SUFDakIsV0FBVyxFQUFFLFdBQVc7SUFDeEIsT0FBTyxFQUFFLFFBQVE7SUFDakIsU0FBUyxFQUFFLEtBQUs7SUFDaEIsVUFBVSxFQUFFLGFBQWE7SUFDekIsVUFBVSxFQUFFLE9BQU87Q0FDcEIsQ0FBQztBQUVGLHlCQUF5QjtBQUN6QixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ2pELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDMUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUN6QyxH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WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQgJ3NvdXJjZS1tYXAtc3VwcG9ydC9yZWdpc3Rlcic7XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgRGF0YWJhc2VTdGFjayB9IGZyb20gJy4uL2xpYi9kYXRhYmFzZS1zdGFjayc7XG5pbXBvcnQgeyBTZWN1cml0eVN0YWNrIH0gZnJvbSAnLi4vbGliL3NlY3VyaXR5LXN0YWNrJztcbmltcG9ydCB7IENvZ25pdG9TdGFjayB9IGZyb20gJy4uL2xpYi9jb2duaXRvLXN0YWNrJztcbmltcG9ydCB7IEFwaVN0YWNrIH0gZnJvbSAnLi4vbGliL2FwaS1zdGFjayc7XG5pbXBvcnQgeyBGcm9udGVuZFN0YWNrIH0gZnJvbSAnLi4vbGliL2Zyb250ZW5kLXN0YWNrJztcbmltcG9ydCB7IE1vbml0b3JpbmdTdGFjayB9IGZyb20gJy4uL2xpYi9tb25pdG9yaW5nLXN0YWNrJztcbmltcG9ydCB7IEJhY2t1cFN0YWNrIH0gZnJvbSAnLi4vbGliL2JhY2t1cC1zdGFjayc7XG5pbXBvcnQgeyBnZXRFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4uL2xpYi9jb25maWcnO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0XG5jb25zdCBlbnZpcm9ubWVudCA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2Vudmlyb25tZW50JykgfHwgJ2Rldic7XG5jb25zdCBjb25maWcgPSBnZXRFbnZpcm9ubWVudENvbmZpZyhlbnZpcm9ubWVudCk7XG5cbi8vIERlZmluZSBjb21tb24gdGFnc1xuY29uc3QgY29tbW9uVGFncyA9IHtcbiAgRW52aXJvbm1lbnQ6IGVudmlyb25tZW50LFxuICBQcm9qZWN0OiAnTWVkZWV6JyxcbiAgTWFuYWdlZEJ5OiAnQ0RLJyxcbiAgQ29zdENlbnRlcjogJ0VuZ2luZWVyaW5nJyxcbiAgQ29tcGxpYW5jZTogJ0hJUEFBJyxcbn07XG5cbi8vIEFkZCB0YWdzIHRvIGFsbCBzdGFja3NcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdQcm9qZWN0JywgJ01lZGVleicpO1xuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ01hbmFnZWRCeScsICdDREsnKTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdDb3N0Q2VudGVyJywgJ0VuZ2luZWVyaW5nJyk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnQ29tcGxpYW5jZScsICdISVBBQScpO1xuXG4vLyBTZWN1cml0eSBTdGFjayAoS01TLCBTZWNyZXRzLCBJQU0gcm9sZXMpXG5jb25zdCBzZWN1cml0eVN0YWNrID0gbmV3IFNlY3VyaXR5U3RhY2soYXBwLCBgTWVkZWV6U2VjdXJpdHlTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAgdGFnczogY29tbW9uVGFncyxcbn0pO1xuXG4vLyBEYXRhYmFzZSBTdGFjayAoRHluYW1vREIsIFMzKVxuY29uc3QgZGF0YWJhc2VTdGFjayA9IG5ldyBEYXRhYmFzZVN0YWNrKGFwcCwgYE1lZGVlekRhdGFiYXNlU3RhY2stJHtlbnZpcm9ubWVudH1gLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG4gIH0sXG4gIGVudmlyb25tZW50LFxuICBjb25maWcsXG4gIGttc0tleTogc2VjdXJpdHlTdGFjay5rbXNLZXksXG4gIHRhZ3M6IGNvbW1vblRhZ3MsXG59KTtcblxuLy8gQ29nbml0byBTdGFjayAoVXNlciBQb29sLCBJZGVudGl0eSBQb29sLCBMYW1iZGEgdHJpZ2dlcnMpXG5jb25zdCBjb2duaXRvU3RhY2sgPSBuZXcgQ29nbml0b1N0YWNrKGFwcCwgYE1lZGVlekNvZ25pdG9TdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgYXBpUm9sZTogc2VjdXJpdHlTdGFjay5hcGlSb2xlLFxuICB0YWdzOiBjb21tb25UYWdzLFxufSk7XG5cbi8vIEFQSSBTdGFjayAoTGFtYmRhLCBBUEkgR2F0ZXdheSlcbmNvbnN0IGFwaVN0YWNrID0gbmV3IEFwaVN0YWNrKGFwcCwgYE1lZGVlekFwaVN0YWNrLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9LFxuICBlbnZpcm9ubWVudCxcbiAgY29uZmlnLFxuICBkeW5hbW9UYWJsZTogZGF0YWJhc2VTdGFjay5keW5hbW9UYWJsZSxcbiAgczNCdWNrZXQ6IGRhdGFiYXNlU3RhY2suczNCdWNrZXQsXG4gIGttc0tleTogc2VjdXJpdHlTdGFjay5rbXNLZXksXG4gIGFwaVJvbGU6IHNlY3VyaXR5U3RhY2suYXBpUm9sZSxcbiAgdXNlclBvb2w6IGNvZ25pdG9TdGFjay51c2VyUG9vbCxcbiAgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG9TdGFjay51c2VyUG9vbENsaWVudCxcbiAgdGFnczogY29tbW9uVGFncyxcbn0pO1xuXG4vLyBGcm9udGVuZCBTdGFjayAoQ2xvdWRGcm9udCwgQW1wbGlmeSlcbmNvbnN0IGZyb250ZW5kU3RhY2sgPSBuZXcgRnJvbnRlbmRTdGFjayhhcHAsIGBNZWRlZXpGcm9udGVuZFN0YWNrLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9LFxuICBlbnZpcm9ubWVudCxcbiAgY29uZmlnLFxuICBhcGlVcmw6IGFwaVN0YWNrLmFwaVVybCxcbiAgdXNlclBvb2w6IGNvZ25pdG9TdGFjay51c2VyUG9vbCxcbiAgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG9TdGFjay51c2VyUG9vbENsaWVudCxcbiAgdGFnczogY29tbW9uVGFncyxcbn0pO1xuXG4vLyBNb25pdG9yaW5nIFN0YWNrIChDbG91ZFdhdGNoLCBBbGFybXMpXG5jb25zdCBtb25pdG9yaW5nU3RhY2sgPSBuZXcgTW9uaXRvcmluZ1N0YWNrKGFwcCwgYE1lZGVlek1vbml0b3JpbmdTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAgZHluYW1vVGFibGU6IGRhdGFiYXNlU3RhY2suZHluYW1vVGFibGUsXG4gIGFwaUZ1bmN0aW9uOiBhcGlTdGFjay5hcGlGdW5jdGlvbixcbiAgYXBpR2F0ZXdheTogYXBpU3RhY2suYXBpR2F0ZXdheSxcbiAgY2xvdWRGcm9udERpc3RyaWJ1dGlvbjogZnJvbnRlbmRTdGFjay5jbG91ZEZyb250RGlzdHJpYnV0aW9uLFxuICB0YWdzOiBjb21tb25UYWdzLFxufSk7XG5cbi8vIEJhY2t1cCBTdGFjayAoRHluYW1vREIgUElUUiwgUzMgUmVwbGljYXRpb24pXG5jb25zdCBiYWNrdXBTdGFjayA9IG5ldyBCYWNrdXBTdGFjayhhcHAsIGBNZWRlZXpCYWNrdXBTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAgZHluYW1vVGFibGU6IGRhdGFiYXNlU3RhY2suZHluYW1vVGFibGUsXG4gIHMzQnVja2V0OiBkYXRhYmFzZVN0YWNrLnMzQnVja2V0LFxuICBrbXNLZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICB0YWdzOiBjb21tb25UYWdzLFxufSk7XG5cbi8vIE91dHB1dCBpbXBvcnRhbnQgdmFsdWVzXG5uZXcgY2RrLkNmbk91dHB1dChhcGlTdGFjaywgYE1lZGVlekFwaVVybC0ke2Vudmlyb25tZW50fWAsIHtcbiAgdmFsdWU6IGFwaVN0YWNrLmFwaVVybCxcbiAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICBleHBvcnROYW1lOiBgTWVkZWV6QXBpVXJsLSR7ZW52aXJvbm1lbnR9YCxcbn0pO1xuXG5uZXcgY2RrLkNmbk91dHB1dChmcm9udGVuZFN0YWNrLCBgTWVkZWV6V2ViVXJsLSR7ZW52aXJvbm1lbnR9YCwge1xuICB2YWx1ZTogZnJvbnRlbmRTdGFjay53ZWJVcmwsXG4gIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gVVJMJyxcbiAgZXhwb3J0TmFtZTogYE1lZGVleldlYlVybC0ke2Vudmlyb25tZW50fWAsXG59KTtcblxubmV3IGNkay5DZm5PdXRwdXQoY29nbml0b1N0YWNrLCBgTWVkZWV6VXNlclBvb2xJZC0ke2Vudmlyb25tZW50fWAsIHtcbiAgdmFsdWU6IGNvZ25pdG9TdGFjay51c2VyUG9vbC51c2VyUG9vbElkLFxuICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgZXhwb3J0TmFtZTogYE1lZGVlelVzZXJQb29sSWQtJHtlbnZpcm9ubWVudH1gLFxufSk7XG5cbm5ldyBjZGsuQ2ZuT3V0cHV0KGNvZ25pdG9TdGFjaywgYE1lZGVlelVzZXJQb29sQ2xpZW50SWQtJHtlbnZpcm9ubWVudH1gLCB7XG4gIHZhbHVlOiBjb2duaXRvU3RhY2sudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICBleHBvcnROYW1lOiBgTWVkZWV6VXNlclBvb2xDbGllbnRJZC0ke2Vudmlyb25tZW50fWAsXG59KTtcblxubmV3IGNkay5DZm5PdXRwdXQoY29nbml0b1N0YWNrLCBgTWVkZWV6SWRlbnRpdHlQb29sSWQtJHtlbnZpcm9ubWVudH1gLCB7XG4gIHZhbHVlOiBjb2duaXRvU3RhY2suaWRlbnRpdHlQb29sLnJlZixcbiAgZGVzY3JpcHRpb246ICdDb2duaXRvIElkZW50aXR5IFBvb2wgSUQnLFxuICBleHBvcnROYW1lOiBgTWVkZWV6SWRlbnRpdHlQb29sSWQtJHtlbnZpcm9ubWVudH1gLFxufSk7XG5cbm5ldyBjZGsuQ2ZuT3V0cHV0KGNvZ25pdG9TdGFjaywgYE1lZGVlelVzZXJQb29sQXJuLSR7ZW52aXJvbm1lbnR9YCwge1xuICB2YWx1ZTogY29nbml0b1N0YWNrLnVzZXJQb29sLnVzZXJQb29sQXJuLFxuICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIEFSTicsXG4gIGV4cG9ydE5hbWU6IGBNZWRlZXpVc2VyUG9vbEFybi0ke2Vudmlyb25tZW50fWAsXG59KTsiXX0=