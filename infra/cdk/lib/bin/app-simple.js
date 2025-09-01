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
const security_stack_1 = require("../lib/security-stack");
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
// Security Stack only (KMS, Secrets, IAM roles)
const securityStack = new security_stack_1.SecurityStack(app, `MedeezSecurityStack-${environment}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    environment,
    config,
    tags: commonTags,
});
// Outputs are already defined in SecurityStack
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLXNpbXBsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2Jpbi9hcHAtc2ltcGxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFxQztBQUNyQyxpREFBbUM7QUFDbkMsMERBQXNEO0FBQ3RELDBDQUFxRDtBQUVyRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiwrQkFBK0I7QUFDL0IsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxDQUFDO0FBQ25FLE1BQU0sTUFBTSxHQUFHLElBQUEsNkJBQW9CLEVBQUMsV0FBVyxDQUFDLENBQUM7QUFFakQscUJBQXFCO0FBQ3JCLE1BQU0sVUFBVSxHQUFHO0lBQ2pCLFdBQVcsRUFBRSxXQUFXO0lBQ3hCLE9BQU8sRUFBRSxRQUFRO0lBQ2pCLFNBQVMsRUFBRSxLQUFLO0lBQ2hCLFVBQVUsRUFBRSxhQUFhO0lBQ3pCLFVBQVUsRUFBRSxPQUFPO0NBQ3BCLENBQUM7QUFFRix5QkFBeUI7QUFDekIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztBQUNqRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0FBQzFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDekMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsQ0FBQztBQUNsRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBRTVDLGdEQUFnRDtBQUNoRCxNQUFNLGFBQWEsR0FBRyxJQUFJLDhCQUFhLENBQUMsR0FBRyxFQUFFLHVCQUF1QixXQUFXLEVBQUUsRUFBRTtJQUNqRixHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7UUFDeEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVztLQUN0RDtJQUNELFdBQVc7SUFDWCxNQUFNO0lBQ04sSUFBSSxFQUFFLFVBQVU7Q0FDakIsQ0FBQyxDQUFDO0FBRUgsK0NBQStDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFNlY3VyaXR5U3RhY2sgfSBmcm9tICcuLi9saWIvc2VjdXJpdHktc3RhY2snO1xuaW1wb3J0IHsgZ2V0RW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuLi9saWIvY29uZmlnJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gR2V0IGVudmlyb25tZW50IGZyb20gY29udGV4dFxuY29uc3QgZW52aXJvbm1lbnQgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnZpcm9ubWVudCcpIHx8ICdkZXYnO1xuY29uc3QgY29uZmlnID0gZ2V0RW52aXJvbm1lbnRDb25maWcoZW52aXJvbm1lbnQpO1xuXG4vLyBEZWZpbmUgY29tbW9uIHRhZ3NcbmNvbnN0IGNvbW1vblRhZ3MgPSB7XG4gIEVudmlyb25tZW50OiBlbnZpcm9ubWVudCxcbiAgUHJvamVjdDogJ01lZGVleicsXG4gIE1hbmFnZWRCeTogJ0NESycsXG4gIENvc3RDZW50ZXI6ICdFbmdpbmVlcmluZycsXG4gIENvbXBsaWFuY2U6ICdISVBBQScsXG59O1xuXG4vLyBBZGQgdGFncyB0byBhbGwgc3RhY2tzXG5jZGsuVGFncy5vZihhcHApLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnUHJvamVjdCcsICdNZWRlZXonKTtcbmNkay5UYWdzLm9mKGFwcCkuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XG5jZGsuVGFncy5vZihhcHApLmFkZCgnQ29zdENlbnRlcicsICdFbmdpbmVlcmluZycpO1xuY2RrLlRhZ3Mub2YoYXBwKS5hZGQoJ0NvbXBsaWFuY2UnLCAnSElQQUEnKTtcblxuLy8gU2VjdXJpdHkgU3RhY2sgb25seSAoS01TLCBTZWNyZXRzLCBJQU0gcm9sZXMpXG5jb25zdCBzZWN1cml0eVN0YWNrID0gbmV3IFNlY3VyaXR5U3RhY2soYXBwLCBgTWVkZWV6U2VjdXJpdHlTdGFjay0ke2Vudmlyb25tZW50fWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSxcbiAgZW52aXJvbm1lbnQsXG4gIGNvbmZpZyxcbiAgdGFnczogY29tbW9uVGFncyxcbn0pO1xuXG4vLyBPdXRwdXRzIGFyZSBhbHJlYWR5IGRlZmluZWQgaW4gU2VjdXJpdHlTdGFjayJdfQ==