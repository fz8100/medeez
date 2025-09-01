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
// For dev environment, we don't need KMS since encryption is disabled
// TODO: Add KMS key import for staging/prod environments
const kmsKey = undefined;
// Database Stack (DynamoDB, S3)
const databaseStack = new database_stack_1.DatabaseStack(app, `MedeezDatabaseStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    environment,
    config,
    kmsKey: kmsKey,
    tags: commonTags,
});
// Outputs are already defined in DatabaseStack
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLWRhdGFiYXNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vYmluL2FwcC1kYXRhYmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSx1Q0FBcUM7QUFDckMsaURBQW1DO0FBRW5DLDBEQUFzRDtBQUN0RCwwQ0FBcUQ7QUFFckQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsK0JBQStCO0FBQy9CLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUNuRSxNQUFNLE1BQU0sR0FBRyxJQUFBLDZCQUFvQixFQUFDLFdBQVcsQ0FBQyxDQUFDO0FBRWpELHFCQUFxQjtBQUNyQixNQUFNLFVBQVUsR0FBRztJQUNqQixXQUFXLEVBQUUsV0FBVztJQUN4QixPQUFPLEVBQUUsUUFBUTtJQUNqQixTQUFTLEVBQUUsS0FBSztJQUNoQixVQUFVLEVBQUUsYUFBYTtJQUN6QixVQUFVLEVBQUUsT0FBTztDQUNwQixDQUFDO0FBRUYseUJBQXlCO0FBQ3pCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFDakQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUMxQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ3pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUM7QUFDbEQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQztBQUU1QyxzRUFBc0U7QUFDdEUseURBQXlEO0FBQ3pELE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQztBQUV6QixnQ0FBZ0M7QUFDaEMsTUFBTSxhQUFhLEdBQUcsSUFBSSw4QkFBYSxDQUFDLEdBQUcsRUFBRSx1QkFBdUIsV0FBVyxFQUFFLEVBQUU7SUFDakYsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7S0FDdEQ7SUFDRCxXQUFXO0lBQ1gsTUFBTTtJQUNOLE1BQU0sRUFBRSxNQUFNO0lBQ2QsSUFBSSxFQUFFLFVBQVU7Q0FDakIsQ0FBQyxDQUFDO0FBRUgsK0NBQStDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCB7IERhdGFiYXNlU3RhY2sgfSBmcm9tICcuLi9saWIvZGF0YWJhc2Utc3RhY2snO1xuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9saWIvY29uZmlnJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gR2V0IGVudmlyb25tZW50IGZyb20gY29udGV4dFxuY29uc3QgZW52aXJvbm1lbnQgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnZpcm9ubWVudCcpIHx8ICdkZXYnO1xuY29uc3QgY29uZmlnID0gZ2V0RW52aXJvbm1lbnRDb25maWcoZW52aXJvbm1lbnQpO1xuXG4vLyBEZWZpbmUgY29tbW9uIHRhZ3NcbmNvbnN0IGNvbW1vblRhZ3MgPSB7XG4gIEVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgUHJvamVjdDogJ01lZGVleicsXG4gIE1hbmFnZWRCeTogJ0NESycsXG4gIENvc3RDZW50ZXI6ICdFbmdpbmVlcmluZycsXG4gIENvbXBsaWFuY2U6ICdISVBBQScsXG59O1xuXG4vLyBBZGQgdGFncyB0byBhbGwgc3RhY2tzXG5jZGsuVGFncy5vZihhcHApLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnUHJvamVjdCcsICdNZWRlZXonKTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnQ29zdENlbnRlcicsICdFbmdpbmVlcmluZycpO1xuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ0NvbXBsaWFuY2UnLCAnSElQQUEnKTtcblxuLy8gRm9yIGRldiBlbnZpcm9ubWVudCwgd2UgZG9uJ3QgbmVlZCBLTVMgc2luY2UgZW5jcnlwdGlvbiBpcyBkaXNhYmxlZFxuLy8gVE9ETzogQWRkIEtNUyBrZXkgaW1wb3J0IGZvciBzdGFnaW5nL3Byb2QgZW52aXJvbm1lbnRzXG5jb25zdCBrbXNLZXkgPSB1bmRlZmluZWQ7XG5cbi8vIERhdGFiYXNlIFN0YWNrIChEeW5hbW9EQiwgUzMpXG5jb25zdCBkYXRhYmFzZVN0YWNrID0gbmV3IERhdGFiYXNlU3RhY2soYXBwLCBgTWVkZWV6RGF0YWJhc2VTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAga21zS2V5OiBrbXNLZXksXG4gIHRhZ3M6IGNvbW1vblRhZ3MsXG59KTtcblxuLy8gT3V0cHV0cyBhcmUgYWxyZWFkeSBkZWZpbmVkIGluIERhdGFiYXNlU3RhY2siXX0=