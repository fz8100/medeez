# Medeez v2 Authentication System Deployment Guide

## Overview
This guide covers the deployment of the complete AWS Cognito-based authentication system for the Medeez v2 medical SaaS application, including HIPAA-compliant multi-tenant architecture with role-based access control.

## Prerequisites

### AWS Account Setup
```bash
# Install AWS CLI v2 if not already installed
# Configure AWS credentials
aws configure

# Verify your account ID and region
aws sts get-caller-identity
aws configure get region
```

### Environment Variables
Create `.env` files for each environment:

#### `.env.dev`
```bash
# Environment
NODE_ENV=development
ENVIRONMENT=dev

# AWS Configuration
AWS_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=your-aws-account-id
CDK_DEFAULT_REGION=us-east-1

# Cognito Configuration (will be populated after deployment)
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# DynamoDB Configuration
DYNAMODB_TABLE_PREFIX=medeez-dev

# Application URLs
FRONTEND_URL=https://dev.medeez.com
API_URL=https://api-dev.medeez.com

# Email Configuration
SES_FROM_EMAIL=noreply@medeez.com
SUPPORT_EMAIL=support@medeez.com

# Security
JWT_SECRET=your-jwt-secret-here

# Feature Flags
ENABLE_MFA=true
ENABLE_MAGIC_LINKS=true
TRIAL_DURATION_DAYS=7
```

#### `.env.prod`
```bash
# Environment
NODE_ENV=production
ENVIRONMENT=prod

# AWS Configuration
AWS_REGION=us-east-1
CDK_DEFAULT_ACCOUNT=your-aws-account-id
CDK_DEFAULT_REGION=us-east-1

# Cognito Configuration (will be populated after deployment)
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# DynamoDB Configuration
DYNAMODB_TABLE_PREFIX=medeez-prod

# Application URLs
FRONTEND_URL=https://app.medeez.com
API_URL=https://api.medeez.com

# Email Configuration
SES_FROM_EMAIL=noreply@medeez.com
SUPPORT_EMAIL=support@medeez.com

# Security
JWT_SECRET=your-production-jwt-secret

# Feature Flags
ENABLE_MFA=true
ENABLE_MAGIC_LINKS=true
TRIAL_DURATION_DAYS=7
```

## Deployment Steps

### 1. Install Dependencies

```bash
# Install CDK dependencies
cd infra/cdk
npm install

# Install API dependencies
cd ../../apps/api
npm install

# Install CDK CLI globally if not already installed
npm install -g aws-cdk
```

### 2. Build Lambda Functions

```bash
# Build the API and Lambda triggers
cd apps/api
npm run build

# Ensure Lambda trigger code is built
mkdir -p dist/lambda/cognito-triggers/pre-signup
mkdir -p dist/lambda/cognito-triggers/post-confirmation
mkdir -p dist/lambda/cognito-triggers/pre-authentication
mkdir -p dist/lambda/cognito-triggers/post-authentication
mkdir -p dist/lambda/cognito-triggers/create-auth-challenge
mkdir -p dist/lambda/cognito-triggers/define-auth-challenge
mkdir -p dist/lambda/cognito-triggers/verify-auth-challenge-response

# Copy Lambda trigger files to dist (or set up proper build process)
cp src/lambda/cognito-triggers/pre-signup/index.ts dist/lambda/cognito-triggers/pre-signup/index.js
cp src/lambda/cognito-triggers/post-confirmation/index.ts dist/lambda/cognito-triggers/post-confirmation/index.js
cp src/lambda/cognito-triggers/pre-authentication/index.ts dist/lambda/cognito-triggers/pre-authentication/index.js
cp src/lambda/cognito-triggers/post-authentication/index.ts dist/lambda/cognito-triggers/post-authentication/index.js
cp src/lambda/cognito-triggers/create-auth-challenge/index.ts dist/lambda/cognito-triggers/create-auth-challenge/index.js
cp src/lambda/cognito-triggers/define-auth-challenge/index.ts dist/lambda/cognito-triggers/define-auth-challenge/index.js
cp src/lambda/cognito-triggers/verify-auth-challenge-response/index.ts dist/lambda/cognito-triggers/verify-auth-challenge-response/index.js
```

### 3. Bootstrap CDK (First time only)

```bash
cd infra/cdk
cdk bootstrap --context environment=dev
cdk bootstrap --context environment=prod
```

### 4. Deploy Development Environment

```bash
cd infra/cdk

# Deploy security stack first
cdk deploy MedeezSecurityStack-dev --context environment=dev

# Deploy database stack
cdk deploy MedeezDatabaseStack-dev --context environment=dev

# Deploy Cognito stack
cdk deploy MedeezCognitoStack-dev --context environment=dev

# Deploy API stack
cdk deploy MedeezApiStack-dev --context environment=dev

# Deploy remaining stacks
cdk deploy MedeezFrontendStack-dev --context environment=dev
cdk deploy MedeezMonitoringStack-dev --context environment=dev
cdk deploy MedeezBackupStack-dev --context environment=dev
```

### 5. Configure Environment Variables

After deployment, update your environment variables with the actual Cognito IDs:

```bash
# Get the Cognito configuration
aws ssm get-parameter --name "/medeez/dev/cognito/user-pool-id" --query "Parameter.Value" --output text
aws ssm get-parameter --name "/medeez/dev/cognito/user-pool-client-id" --query "Parameter.Value" --output text
aws ssm get-parameter --name "/medeez/dev/cognito/identity-pool-id" --query "Parameter.Value" --output text
```

### 6. Verify SES Email Configuration

```bash
# Verify your domain for SES (required for sending emails)
aws ses verify-domain-identity --domain medeez.com

# Or verify individual email addresses for testing
aws ses verify-email-identity --email-address noreply@medeez.com
aws ses verify-email-identity --email-address support@medeez.com
```

### 7. Test the Authentication System

```bash
# Test the API endpoints
curl -X POST https://api-dev.medeez.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "firstName": "Test",
    "lastName": "User"
  }'

curl -X POST https://api-dev.medeez.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!"
  }'
```

## Production Deployment

### 1. Production Prerequisites

```bash
# Ensure production secrets are set
aws secretsmanager create-secret \
  --name "medeez-prod-jwt-secret" \
  --secret-string '{"secret":"your-production-jwt-secret"}'

# Set up production domain certificates (if using custom domain)
# This should be done through Certificate Manager
```

### 2. Deploy Production

```bash
cd infra/cdk

# Deploy all stacks to production
cdk deploy MedeezSecurityStack-prod --context environment=prod
cdk deploy MedeezDatabaseStack-prod --context environment=prod
cdk deploy MedeezCognitoStack-prod --context environment=prod
cdk deploy MedeezApiStack-prod --context environment=prod
cdk deploy MedeezFrontendStack-prod --context environment=prod
cdk deploy MedeezMonitoringStack-prod --context environment=prod
cdk deploy MedeezBackupStack-prod --context environment=prod
```

## Authentication System Features

### Implemented Features ✅

1. **AWS Cognito User Pool Configuration**
   - Custom attributes for clinic association and roles
   - Strong password policy
   - Email verification required
   - MFA support (email-based)

2. **Lambda Triggers**
   - Pre Sign-up: Email domain validation, trial eligibility
   - Post Confirmation: Clinic and user record creation
   - Pre Authentication: Subscription and trial validation
   - Post Authentication: Login auditing and security monitoring
   - Custom Auth Challenge: Email-based MFA
   - Define Auth Challenge: MFA flow control
   - Verify Auth Challenge: MFA code verification

3. **Role-Based Access Control (RBAC)**
   - SystemAdmin: Full platform access
   - Admin: Full clinic management
   - Doctor: Patient care and clinical features
   - Staff: Limited access to appointments and basic features

4. **Multi-Tenant Architecture**
   - Clinic-based isolation
   - Cross-tenant access for SystemAdmin
   - Secure tenant validation middleware

5. **Authentication Flows**
   - Email/password login with optional MFA
   - User signup (trial and invitation-based)
   - Forgot/reset password
   - Token refresh
   - Secure logout with audit logging

6. **Magic Link System**
   - Patient portal access via secure tokens
   - 24-hour expiration with single-use validation
   - JWT-based implementation

7. **User Invitation System**
   - Email-based invitations with role assignment
   - Configurable expiration (default 7 days)
   - Professional email templates

8. **Security Features**
   - JWT token validation with Cognito public keys
   - Rate limiting on authentication endpoints
   - Comprehensive audit logging
   - HIPAA-compliant data handling
   - Session management and security monitoring

9. **Trial Management**
   - 7-day free trial without credit card
   - Automated trial expiration handling
   - Grace period for expired accounts
   - Upgrade prompts and conversion tracking

### API Endpoints

#### Public Endpoints
- `POST /auth/login` - User login
- `POST /auth/signup` - User registration
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with code
- `POST /auth/refresh` - Refresh access token

#### Protected Endpoints
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user info
- `POST /auth/magic-link` - Generate magic link (Doctor/Admin)
- `POST /auth/invite` - Invite user to clinic (Admin)
- `POST /auth/users/:userId/enable` - Enable/disable user (Admin)

### Database Tables

1. **Users Table**: `medeez-{env}-users`
   - User profiles and permissions
   - Clinic association and roles
   - Authentication metadata

2. **Clinics Table**: `medeez-{env}-clinics`
   - Clinic information and settings
   - Subscription status and trial data
   - Feature configurations

3. **Invitations Table**: `medeez-{env}-invitations`
   - User invitation tracking
   - Expiration and usage status
   - Role and permission assignments

4. **Tokens Table**: `medeez-{env}-tokens`
   - Magic link tokens
   - Token expiration and usage tracking
   - Security metadata

5. **Audit Logs Table**: `medeez-{env}-audit-logs`
   - Authentication events
   - Security monitoring data
   - HIPAA compliance logging

## Monitoring and Alerting

### CloudWatch Alarms
- Failed login attempts (> 5 in 15 minutes)
- User signup anomalies
- Token refresh failures
- Lambda trigger errors
- Trial expiration notifications

### Security Monitoring
- Cross-tenant access attempts
- Unusual login patterns
- MFA bypass attempts
- Suspicious user agent patterns
- Geographic anomaly detection

## Maintenance and Updates

### Regular Tasks
1. **Weekly**
   - Review failed authentication metrics
   - Check trial conversion rates
   - Monitor invitation acceptance rates

2. **Monthly**
   - Audit user permissions and roles
   - Review and rotate JWT secrets
   - Update Lambda trigger code if needed
   - Check Cognito configuration for updates

3. **Quarterly**
   - Security review and penetration testing
   - Performance optimization review
   - Cost optimization analysis

### Backup and Recovery
- DynamoDB Point-in-Time Recovery enabled
- Cross-region backup for production
- Cognito User Pool backup via AWS Config
- Lambda trigger code versioning

## Troubleshooting

### Common Issues

1. **User Cannot Login**
   - Check user status in Cognito
   - Verify subscription status
   - Check trial expiration dates
   - Review audit logs for failure reasons

2. **MFA Not Working**
   - Verify SES configuration and domain verification
   - Check Lambda trigger logs
   - Validate email delivery status

3. **Invitation Emails Not Sent**
   - Verify SES email verification
   - Check Lambda trigger execution logs
   - Validate email template formatting

4. **Cross-Tenant Access Issues**
   - Verify SystemAdmin role assignment
   - Check tenant middleware configuration
   - Review audit logs for access attempts

### Log Locations
- Lambda triggers: CloudWatch Logs `/aws/lambda/medeez-{env}-cognito-*`
- API logs: CloudWatch Logs `/aws/lambda/medeez-{env}-api`
- Authentication events: EventBridge `medeez-{env}-event-bus`

## Security Compliance

### HIPAA Requirements Met
- ✅ Data encryption at rest and in transit
- ✅ Access controls and user authentication
- ✅ Audit logging and monitoring
- ✅ Multi-tenant data isolation
- ✅ Secure session management
- ✅ Automated security monitoring

### Best Practices Implemented
- Principle of least privilege
- Defense in depth security model
- Regular security monitoring and alerting
- Secure coding practices
- Data minimization and privacy by design

## Cost Optimization

### Estimated Monthly Costs (Development)
- Cognito User Pool: $10-20
- Lambda executions: $5-15
- DynamoDB storage: $10-25
- SES email sending: $5-10
- CloudWatch monitoring: $10-15

### Cost Optimization Strategies
- Use DynamoDB on-demand billing for low usage
- Implement Lambda cold start optimization
- Use CloudWatch Logs retention policies
- Monitor and optimize API Gateway usage
- Implement proper caching strategies

This authentication system provides a robust, secure, and HIPAA-compliant foundation for the Medeez v2 medical SaaS application with comprehensive multi-tenant architecture and role-based access control.