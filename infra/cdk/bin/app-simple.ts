#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SecurityStack } from '../lib/security-stack';
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

// Security Stack only (KMS, Secrets, IAM roles)
const securityStack = new SecurityStack(app, `MedeezSecurityStack-${environment}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  environment,
  config,
  tags: commonTags,
});

// Outputs are already defined in SecurityStack