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
// API Stack (Lambda, API Gateway, Cognito)
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
    userPool: apiStack.userPool,
    userPoolClient: apiStack.userPoolClient,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vYmluL2FwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBQ25DLDBEQUFzRDtBQUN0RCwwREFBc0Q7QUFDdEQsZ0RBQTRDO0FBQzVDLDBEQUFzRDtBQUN0RCw4REFBMEQ7QUFDMUQsc0RBQWtEO0FBQ2xELDBDQUFxRDtBQUVyRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiwrQkFBK0I7QUFDL0IsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDO0FBQ25FLE1BQU0sTUFBTSxHQUFHLElBQUEsNkJBQW9CLEVBQUMsV0FBVyxDQUFDLENBQUM7QUFFakQscUJBQXFCO0FBQ3JCLE1BQU0sVUFBVSxHQUFHO0lBQ2pCLFdBQVcsRUFBRSxXQUFXO0lBQ3hCLE9BQU8sRUFBRSxRQUFRO0lBQ2pCLFNBQVMsRUFBRSxLQUFLO0lBQ2hCLFVBQVUsRUFBRSxhQUFhO0lBQ3pCLFVBQVUsRUFBRSxPQUFPO0NBQ3BCLENBQUM7QUFFRix5QkFBeUI7QUFDekIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUNqRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQzFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDekMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMs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RUFBRSxFQUFFO0lBQ25FLEtBQUssRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLGdCQUFnQjtJQUMvQyxXQUFXLEVBQUUsNkJBQTZCO0lBQzFDLFVBQVUsRUFBRSwwQkFBMEIsV0FBVyxFQUFFO0NBQ3BELENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBEYXRhYmFzZVN0YWNrIH0gZnJvbSAnLi4vbGliL2RhdGFiYXNlLXN0YWNrJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuLi9saWIvc2VjdXJpdHktc3RhY2snO1xuaW1wb3J0IHsgQXBpU3RhY2sgfSBmcm9tICcuLi9saWIvYXBpLXN0YWNrJztcbmltcG9ydCB7IEZyb250ZW5kU3RhY2sgfSBmcm9tICcuLi9saWIvZnJvbnRlbmQtc3RhY2snO1xuaW1wb3J0IHsgTW9uaXRvcmluZ1N0YWNrIH0gZnJvbSAnLi4vbGliL21vbml0b3Jpbmctc3RhY2snO1xuaW1wb3J0IHsgQmFja3VwU3RhY2sgfSBmcm9tICcuLi9saWIvYmFja3VwLXN0YWNrJztcbmltcG9ydCB7IGdldEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vbGliL2NvbmZpZyc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIEdldCBlbnZpcm9ubWVudCBmcm9tIGNvbnRleHRcbmNvbnN0IGVudmlyb25tZW50ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52aXJvbm1lbnQnKSB8fCAnZGV2JztcbmNvbnN0IGNvbmZpZyA9IGdldEVudmlyb25tZW50Q29uZmlnKGVudmlyb25tZW50KTtcblxuLy8gRGVmaW5lIGNvbW1vbiB0YWdzXG5jb25zdCBjb21tb25UYWdzID0ge1xuICBFbnZpcm9ubWVudDogZW52aXJvbm1lbnQsXG4gIFByb2plY3Q6ICdNZWRlZXonLFxuICBNYW5hZ2VkQnk6ICdDREsnLFxuICBDb3N0Q2VudGVyOiAnRW5naW5lZXJpbmcnLFxuICBDb21wbGlhbmNlOiAnSElQQUEnLFxufTtcblxuLy8gQWRkIHRhZ3MgdG8gYWxsIHN0YWNrc1xuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ0Vudmlyb25tZW50JywgZW52aXJvbm1lbnQpO1xuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ1Byb2plY3QnLCAnTWVkZWV6Jyk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnTWFuYWdlZEJ5JywgJ0NESycpO1xuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ0Nvc3RDZW50ZXInLCAnRW5naW5lZXJpbmcnKTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdDb21wbGlhbmNlJywgJ0hJUEFBJyk7XG5cbi8vIFNlY3VyaXR5IFN0YWNrIChLTVMsIFNlY3JldHMsIElBTSByb2xlcylcbmNvbnN0IHNlY3VyaXR5U3RhY2sgPSBuZXcgU2VjdXJpdHlTdGFjayhhcHAsIGBNZWRlZXpTZWN1cml0eVN0YWNrLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9LFxuICBlbnZpcm9ubWVudCxcbiAgY29uZmlnLFxuICB0YWdzOiBjb21tb25UYWdzLFxufSk7XG5cbi8vIERhdGFiYXNlIFN0YWNrIChEeW5hbW9EQiwgUzMpXG5jb25zdCBkYXRhYmFzZVN0YWNrID0gbmV3IERhdGFiYXNlU3RhY2soYXBwLCBgTWVkZWV6RGF0YWJhc2VTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAga21zS2V5OiBzZWN1cml0eVN0YWNrLmttc0tleSxcbiAgdGFnczogY29tbW9uVGFncyxcbn0pO1xuXG4vLyBBUEkgU3RhY2sgKExhbWJkYSwgQVBJIEdhdGV3YXksIENvZ25pdG8pXG5jb25zdCBhcGlTdGFjayA9IG5ldyBBcGlTdGFjayhhcHAsIGBNZWRlZXpBcGlTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAgZHluYW1vVGFibGU6IGRhdGFiYXNlU3RhY2suZHluYW1vVGFibGUsXG4gIHMzQnVja2V0OiBkYXRhYmFzZVN0YWNrLnMzQnVja2V0LFxuICBrbXNLZXk6IHNlY3VyaXR5U3RhY2sua21zS2V5LFxuICBhcGlSb2xlOiBzZWN1cml0eVN0YWNrLmFwaVJvbGUsXG4gIHRhZ3M6IGNvbW1vblRhZ3MsXG59KTtcblxuLy8gRnJvbnRlbmQgU3RhY2sgKENsb3VkRnJvbnQsIEFtcGxpZnkpXG5jb25zdCBmcm9udGVuZFN0YWNrID0gbmV3IEZyb250ZW5kU3RhY2soYXBwLCBgTWVkZWV6RnJvbnRlbmRTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAgYXBpVXJsOiBhcGlTdGFjay5hcGlVcmwsXG4gIHVzZXJQb29sOiBhcGlTdGFjay51c2VyUG9vbCxcbiAgdXNlclBvb2xDbGllbnQ6IGFwaVN0YWNrLnVzZXJQb29sQ2xpZW50LFxuICB0YWdzOiBjb21tb25UYWdzLFxufSk7XG5cbi8vIE1vbml0b3JpbmcgU3RhY2sgKENsb3VkV2F0Y2gsIEFsYXJtcylcbmNvbnN0IG1vbml0b3JpbmdTdGFjayA9IG5ldyBNb25pdG9yaW5nU3RhY2soYXBwLCBgTWVkZWV6TW9uaXRvcmluZ1N0YWNrLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9LFxuICBlbnZpcm9ubWVudCxcbiAgY29uZmlnLFxuICBkeW5hbW9UYWJsZTogZGF0YWJhc2VTdGFjay5keW5hbW9UYWJsZSxcbiAgYXBpRnVuY3Rpb246IGFwaVN0YWNrLmFwaUZ1bmN0aW9uLFxuICBhcGlHYXRld2F5OiBhcGlTdGFjay5hcGlHYXRld2F5LFxuICBjbG91ZEZyb250RGlzdHJpYnV0aW9uOiBmcm9udGVuZFN0YWNrLmNsb3VkRnJvbnREaXN0cmlidXRpb24sXG4gIHRhZ3M6IGNvbW1vblRhZ3MsXG59KTtcblxuLy8gQmFja3VwIFN0YWNrIChEeW5hbW9EQiBQSVRSLCBTMyBSZXBsaWNhdGlvbilcbmNvbnN0IGJhY2t1cFN0YWNrID0gbmV3IEJhY2t1cFN0YWNrKGFwcCwgYE1lZGVlekJhY2t1cFN0YWNrLSR7ZW52aXJvbm1lbnR9YCwge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9LFxuICBlbnZpcm9ubWVudCxcbiAgY29uZmlnLFxuICBkeW5hbW9UYWJsZTogZGF0YWJhc2VTdGFjay5keW5hbW9UYWJsZSxcbiAgczNCdWNrZXQ6IGRhdGFiYXNlU3RhY2suczNCdWNrZXQsXG4gIGttc0tleTogc2VjdXJpdHlTdGFjay5rbXNLZXksXG4gIHRhZ3M6IGNvbW1vblRhZ3MsXG59KTtcblxuLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXNcbm5ldyBjZGsuQ2ZuT3V0cHV0KGFwaVN0YWNrLCBgTWVkZWV6QXBpVXJsLSR7ZW52aXJvbm1lbnR9YCwge1xuICB2YWx1ZTogYXBpU3RhY2suYXBpVXJsLFxuICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCcsXG4gIGV4cG9ydE5hbWU6IGBNZWRlZXpBcGlVcmwtJHtlbnZpcm9ubWVudH1gLFxufSk7XG5cbm5ldyBjZGsuQ2ZuT3V0cHV0KGZyb250ZW5kU3RhY2ssIGBNZWRlZXpXZWJVcmwtJHtlbnZpcm9ubWVudH1gLCB7XG4gIHZhbHVlOiBmcm9udGVuZFN0YWNrLndlYlVybCxcbiAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBVUkwnLFxuICBleHBvcnROYW1lOiBgTWVkZWV6V2ViVXJsLSR7ZW52aXJvbm1lbnR9YCxcbn0pO1xuXG5uZXcgY2RrLkNmbk91dHB1dChhcGlTdGFjaywgYE1lZGVlelVzZXJQb29sSWQtJHtlbnZpcm9ubWVudH1gLCB7XG4gIHZhbHVlOiBhcGlTdGFjay51c2VyUG9vbC51c2VyUG9vbElkLFxuICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgZXhwb3J0TmFtZTogYE1lZGVlelVzZXJQb29sSWQtJHtlbnZpcm9ubWVudH1gLFxufSk7XG5cbm5ldyBjZGsuQ2ZuT3V0cHV0KGFwaVN0YWNrLCBgTWVkZWV6VXNlclBvb2xDbGllbnRJZC0ke2Vudmlyb25tZW50fWAsIHtcbiAgdmFsdWU6IGFwaVN0YWNrLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgZXhwb3J0TmFtZTogYE1lZGVlelVzZXJQb29sQ2xpZW50SWQtJHtlbnZpcm9ubWVudH1gLFxufSk7Il19