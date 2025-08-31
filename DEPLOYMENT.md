# Medeez v2 Deployment Guide

**Solo Doctor SaaS Platform - HIPAA Compliant Deployment Infrastructure**

This document provides comprehensive instructions for deploying and managing the Medeez v2 platform across different environments (dev, staging, prod).

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [AWS Deployment](#aws-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring & Alerting](#monitoring--alerting)
- [Security & Compliance](#security--compliance)
- [Backup & Recovery](#backup--recovery)
- [Troubleshooting](#troubleshooting)
- [Runbooks](#runbooks)

## Quick Start

For immediate deployment, follow these steps:

```bash
# 1. Clone repository
git clone <repository-url>
cd medeez-v2

# 2. Install dependencies
npm install -g pnpm aws-cdk
pnpm install

# 3. Start local development
docker-compose up -d
pnpm dev

# 4. Deploy to AWS (after configuration)
cd infra/cdk
pnpm cdk deploy --all --context environment=dev
```

## Prerequisites

### Required Software

- **Node.js 20+** - JavaScript runtime
- **pnpm 8+** - Package manager
- **Docker & Docker Compose** - Containerization
- **AWS CDK** - Infrastructure as Code
- **AWS CLI** - AWS command line interface
- **Git** - Version control

### AWS Account Setup

1. **AWS Account** with appropriate permissions
2. **IAM User** with programmatic access
3. **Domain Registration** (for production)
4. **Route53 Hosted Zone** (if using custom domain)

### Required AWS Services

- **DynamoDB** - Primary database
- **S3** - File storage
- **Lambda** - Serverless compute
- **API Gateway** - API management
- **Cognito** - Authentication
- **CloudFront** - CDN
- **Route53** - DNS management
- **ACM** - SSL certificates
- **KMS** - Encryption keys
- **CloudWatch** - Monitoring
- **EventBridge** - Event routing
- **SNS** - Notifications
- **AWS Backup** - Data protection

## Environment Setup

### Environment Variables

Create environment-specific configuration files:

#### Development (.env.dev)
```env
NODE_ENV=development
AWS_REGION=us-east-1
DOMAIN_NAME=dev.medeez.com
ALERT_EMAIL=dev-alerts@medeez.com
```

#### Staging (.env.staging)
```env
NODE_ENV=staging
AWS_REGION=us-east-1
DOMAIN_NAME=staging.medeez.com
ALERT_EMAIL=staging-alerts@medeez.com
```

#### Production (.env.prod)
```env
NODE_ENV=production
AWS_REGION=us-east-1
DOMAIN_NAME=medeez.com
ALERT_EMAIL=alerts@medeez.com
```

### AWS Credentials

Configure AWS credentials using one of these methods:

```bash
# Method 1: AWS CLI
aws configure

# Method 2: Environment variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1

# Method 3: IAM Roles (recommended for EC2/Lambda)
# Attach appropriate IAM role to your compute instance
```

## Local Development

### Using Docker Compose

The fastest way to start local development:

```bash
# Start all services
docker-compose up -d

# Check service health
docker-compose ps

# View logs
docker-compose logs -f [service-name]

# Stop services
docker-compose down
```

#### Available Services

- **Web App**: http://localhost:3000
- **API Server**: http://localhost:3001
- **DynamoDB Admin**: http://localhost:8001
- **Redis Commander**: http://localhost:8081
- **Mailhog**: http://localhost:8025
- **LocalStack**: http://localhost:4566

### Manual Setup

If you prefer running services individually:

```bash
# 1. Start databases
docker run -p 8000:8000 amazon/dynamodb-local
docker run -p 6379:6379 redis:7-alpine

# 2. Setup database
node scripts/database-migration.js migrate dev

# 3. Start API
cd apps/api
pnpm dev

# 4. Start web app
cd apps/web
pnpm dev
```

### Development URLs

- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001/api/v1
- **Health Check**: http://localhost:3001/health
- **API Docs**: http://localhost:3001/api/v1/docs

## AWS Deployment

### Certificate Management

First, deploy certificates (production only):

```bash
cd infra/cdk
pnpm cdk deploy MedeezCertificateStack-prod --context environment=prod
```

### Infrastructure Deployment

Deploy infrastructure stacks in order:

```bash
cd infra/cdk

# 1. Security stack (KMS, IAM roles, secrets)
pnpm cdk deploy MedeezSecurityStack-dev --context environment=dev

# 2. Database stack (DynamoDB, S3)
pnpm cdk deploy MedeezDatabaseStack-dev --context environment=dev

# 3. API stack (Lambda, API Gateway, Cognito)
pnpm cdk deploy MedeezApiStack-dev --context environment=dev

# 4. Frontend stack (CloudFront, Amplify)
pnpm cdk deploy MedeezFrontendStack-dev --context environment=dev

# 5. Monitoring stack (CloudWatch, alarms)
pnpm cdk deploy MedeezMonitoringStack-dev --context environment=dev

# 6. Backup stack (AWS Backup, disaster recovery)
pnpm cdk deploy MedeezBackupStack-dev --context environment=dev

# Or deploy all at once
pnpm cdk deploy --all --context environment=dev
```

### Environment-Specific Deployment

#### Development
```bash
pnpm deploy:dev
```

#### Staging
```bash
pnpm deploy:staging
```

#### Production
```bash
pnpm deploy:prod
```

### Post-Deployment Setup

After infrastructure deployment:

```bash
# 1. Migrate database
node scripts/database-migration.js migrate <environment>

# 2. Seed sample data (dev only)
node scripts/database-migration.js seed dev

# 3. Verify deployment
curl https://api-dev.medeez.com/health
```

## CI/CD Pipeline

### GitHub Actions Workflows

The platform includes several automated workflows:

#### Main CI/CD Pipeline (.github/workflows/ci-cd.yml)
- Triggered on push to main/dev/staging branches
- Runs security scans, tests, builds, and deploys
- Includes cost analysis and E2E testing
- Sends notifications on success/failure

#### Security Scanning (.github/workflows/security-scan.yml)
- Daily security scans
- Dependency vulnerability checking
- Infrastructure compliance validation
- HIPAA compliance verification

#### Test Suite (.github/workflows/test.yml)
- Unit, integration, API, and E2E tests
- Performance and accessibility testing
- Mobile responsiveness validation
- Test result reporting

### Pipeline Configuration

#### Required Secrets

Add these secrets to your GitHub repository:

```bash
# AWS Credentials
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY

# Security Scanning
SNYK_TOKEN
CODECOV_TOKEN
SONAR_TOKEN

# Notifications
SLACK_WEBHOOK_URL
SLACK_SECURITY_WEBHOOK_URL

# Testing
TEST_USER_EMAIL
TEST_USER_PASSWORD
```

#### Required Variables

Configure these variables per environment:

```bash
# Development
AWS_REGION=us-east-1
ENVIRONMENT=dev
DOMAIN_NAME=dev.medeez.com
BASE_URL=https://dev.medeez.com
API_URL=https://api-dev.medeez.com

# Staging
AWS_REGION=us-east-1
ENVIRONMENT=staging
DOMAIN_NAME=staging.medeez.com
BASE_URL=https://staging.medeez.com
API_URL=https://api-staging.medeez.com

# Production
AWS_REGION=us-east-1
ENVIRONMENT=prod
DOMAIN_NAME=medeez.com
BASE_URL=https://medeez.com
API_URL=https://api.medeez.com
```

### Manual Deployment

To deploy manually outside of CI/CD:

```bash
# Build applications
pnpm build

# Deploy infrastructure
cd infra/cdk
pnpm cdk deploy --all --context environment=prod

# Deploy applications
aws lambda update-function-code \
  --function-name medeez-prod-api \
  --zip-file fileb://apps/api/dist/deployment.zip

aws amplify start-deployment \
  --app-id $AMPLIFY_APP_ID \
  --branch-name main
```

## Monitoring & Alerting

### CloudWatch Dashboards

Access monitoring dashboards:

- **Development**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=MedeezDashboard-dev
- **Staging**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=MedeezDashboard-staging  
- **Production**: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=MedeezDashboard-prod

### Key Metrics

Monitor these critical metrics:

#### API Performance
- Request count and latency
- 4xx/5xx error rates
- Lambda duration and errors
- API Gateway throttling

#### Database Performance  
- DynamoDB read/write capacity
- Throttling events
- GSI performance
- Item count and storage

#### Business Metrics
- User registrations
- Appointments created
- Revenue metrics
- Feature adoption rates

### Alerting Rules

Alerts are configured for:

- **High Error Rate** (>5% in prod, >10% in dev)
- **High Latency** (>2s average response time)
- **Database Throttling** (any throttling events)
- **Certificate Expiry** (<30 days until expiration)
- **High Costs** (monthly budget exceeded)
- **Security Issues** (failed security scans)

### Cost Monitoring

Monitor costs using automated scripts:

```bash
# Analyze current costs
python scripts/cost-analysis.py --environment prod

# Run cost optimization
python scripts/cost-optimization.py --environment prod --execute

# Generate cost report
python scripts/cost-analysis.py --environment prod --output cost-report.json
```

## Security & Compliance

### HIPAA Compliance Checklist

Run automated compliance checks:

```bash
# Full compliance scan
python scripts/security-compliance-check.py --environment prod

# Generate compliance report
python scripts/security-compliance-check.py \
  --environment prod \
  --output compliance-report.json
```

### Security Best Practices

#### Data Encryption
- ✅ Encryption at rest (DynamoDB, S3, RDS)
- ✅ Encryption in transit (HTTPS/TLS 1.2+)
- ✅ KMS key management with rotation
- ✅ Application-level encryption for PHI

#### Access Control
- ✅ IAM least privilege permissions
- ✅ MFA for admin accounts
- ✅ Role-based access control (RBAC)
- ✅ Regular access reviews

#### Audit & Logging
- ✅ CloudTrail for API logging
- ✅ Application audit logs
- ✅ Log retention policies
- ✅ Security monitoring

#### Network Security
- ✅ VPC security groups
- ✅ NACLs for additional protection  
- ✅ WAF for API protection
- ✅ DDoS protection with CloudFront

### Security Scanning

Automated security scans include:

- **Secret Scanning** (TruffleHog, GitLeaks)
- **Dependency Scanning** (Snyk, NPM Audit)
- **Container Scanning** (Trivy)
- **Infrastructure Scanning** (Checkov, TFSec)
- **Code Quality** (SonarCloud)

## Backup & Recovery

### Automated Backups

#### DynamoDB
- Point-in-time recovery enabled
- Daily automated backups
- Cross-region replication (prod only)
- 35-day retention policy

#### S3 Data
- Versioning enabled
- Cross-region replication
- Intelligent tiering for cost optimization
- Lifecycle policies for archival

### Manual Backup Operations

```bash
# Create on-demand backup
node scripts/database-backup.js create prod manual-backup-$(date +%Y%m%d)

# Export data to file
node scripts/database-backup.js export prod backup-$(date +%Y%m%d).json.gz

# List existing backups
node scripts/database-backup.js list prod

# Validate backup file
node scripts/database-backup.js validate backup-20240101.json.gz
```

### Disaster Recovery

#### RTO/RPO Targets
- **Development**: RTO 4 hours, RPO 24 hours
- **Staging**: RTO 2 hours, RPO 12 hours  
- **Production**: RTO 1 hour, RPO 4 hours

#### Recovery Procedures

1. **Database Recovery**
```bash
# Point-in-time recovery
aws dynamodb restore-table-to-point-in-time \
  --source-table-name medeez-prod-app \
  --target-table-name medeez-prod-app-recovered \
  --restore-date-time 2024-01-01T12:00:00.000Z

# From backup
aws dynamodb restore-table-from-backup \
  --target-table-name medeez-prod-app-recovered \
  --backup-arn arn:aws:dynamodb:us-east-1:123456789012:table/medeez-prod-app/backup/01234567890123-abcd1234
```

2. **Infrastructure Recovery**
```bash
# Redeploy infrastructure
cd infra/cdk
pnpm cdk deploy --all --context environment=prod

# Verify deployment
python scripts/security-compliance-check.py --environment prod
```

3. **Application Recovery**
```bash
# Redeploy applications
aws lambda update-function-code --function-name medeez-prod-api --zip-file fileb://api.zip
aws amplify start-deployment --app-id $AMPLIFY_APP_ID --branch-name main
```

## Troubleshooting

### Common Issues

#### Deployment Failures

**Issue**: CDK deployment fails with permission errors
```bash
# Solution: Check IAM permissions
aws sts get-caller-identity
aws iam get-user
```

**Issue**: Lambda function timeout
```bash
# Solution: Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/medeez
aws logs get-log-events --log-group-name /aws/lambda/medeez-prod-api --log-stream-name [stream-name]
```

#### Database Issues

**Issue**: DynamoDB throttling
```bash
# Solution: Check capacity and usage
aws dynamodb describe-table --table-name medeez-prod-app
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=medeez-prod-app \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

#### API Issues

**Issue**: 5xx errors in API Gateway
```bash
# Check Lambda logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time 1609459200000 \
  --filter-pattern "ERROR"

# Check API Gateway logs
aws logs describe-log-groups --log-group-name-prefix API-Gateway-Execution-Logs
```

### Debug Commands

```bash
# Check service health
curl -v https://api.medeez.com/health

# Test database connection
node -e "
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
dynamodb.scan({TableName: 'medeez-prod-app', Limit: 1}).promise()
  .then(data => console.log('✅ Database connected'))
  .catch(err => console.error('❌ Database error:', err));
"

# Validate AWS credentials
aws sts get-caller-identity

# Check CDK diff
cd infra/cdk
pnpm cdk diff --context environment=prod
```

### Performance Issues

#### Slow API Response
1. Check CloudWatch metrics for Lambda duration
2. Review DynamoDB query patterns
3. Check for N+1 query problems
4. Monitor cold start frequency

#### High Costs
1. Run cost analysis script
2. Check DynamoDB read/write patterns
3. Review S3 storage classes
4. Optimize Lambda memory allocation

## Runbooks

### Daily Operations

#### Morning Health Check
```bash
#!/bin/bash
# daily-health-check.sh

echo "🏥 Daily Medeez Health Check - $(date)"
echo "=================================="

# API Health
echo "📡 Checking API health..."
curl -s https://api.medeez.com/health | jq .

# Database Health  
echo "💾 Checking database metrics..."
python scripts/cost-analysis.py --environment prod --format summary

# Security Scan
echo "🔒 Running security check..."
python scripts/security-compliance-check.py --environment prod --format summary

# Backup Verification
echo "💾 Verifying backups..."
node scripts/database-backup.js stats prod

echo "✅ Health check completed"
```

#### Weekly Maintenance
```bash
#!/bin/bash
# weekly-maintenance.sh

echo "🔧 Weekly Maintenance - $(date)"
echo "=========================="

# Clean up old backups
echo "🗑️ Cleaning up old backups..."
node scripts/database-backup.js cleanup prod 30

# Cost optimization
echo "💰 Running cost optimization..."
python scripts/cost-optimization.py --environment prod

# Update dependencies (dev environment)
echo "📦 Updating dependencies..."
pnpm update --latest

# Generate reports
echo "📊 Generating weekly reports..."
python scripts/cost-analysis.py --environment prod --output weekly-cost-report.json
python scripts/security-compliance-check.py --environment prod --output weekly-compliance-report.json

echo "✅ Weekly maintenance completed"
```

### Emergency Procedures

#### Incident Response
```bash
#!/bin/bash
# incident-response.sh

echo "🚨 INCIDENT RESPONSE ACTIVATED 🚨"
echo "================================="

# 1. Assess impact
echo "📊 Checking system status..."
curl -s https://api.medeez.com/health
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 5XXError \
  --dimensions Name=ApiName,Value=medeez-prod-api \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# 2. Enable detailed logging
echo "🔍 Enabling detailed logging..."
# (Implementation would depend on specific issue)

# 3. Scale up resources if needed
echo "⚡ Scaling resources..."
# (Implementation for emergency scaling)

# 4. Notify stakeholders
echo "📢 Sending notifications..."
# (Implementation for emergency notifications)

echo "📋 Incident response checklist initiated"
echo "1. [ ] Assess impact and scope"
echo "2. [ ] Implement immediate fixes"
echo "3. [ ] Scale resources if needed" 
echo "4. [ ] Communicate with stakeholders"
echo "5. [ ] Document incident details"
echo "6. [ ] Schedule post-mortem review"
```

#### Database Recovery
```bash
#!/bin/bash
# database-recovery.sh

ENV=${1:-prod}
RECOVERY_TIME=${2:-$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)}

echo "💾 Database Recovery Procedure"
echo "=============================="
echo "Environment: $ENV"
echo "Recovery Time: $RECOVERY_TIME"

# 1. Create recovery table
echo "📋 Creating recovery table..."
aws dynamodb restore-table-to-point-in-time \
  --source-table-name medeez-$ENV-app \
  --target-table-name medeez-$ENV-app-recovery-$(date +%Y%m%d%H%M) \
  --restore-date-time $RECOVERY_TIME

# 2. Wait for table creation
echo "⏳ Waiting for table creation..."
aws dynamodb wait table-exists --table-name medeez-$ENV-app-recovery-$(date +%Y%m%d%H%M)

# 3. Validate recovery data
echo "✅ Validating recovered data..."
node -e "
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
dynamodb.scan({
  TableName: 'medeez-$ENV-app-recovery-$(date +%Y%m%d%H%M)',
  Select: 'COUNT'
}).promise().then(data => console.log('Recovered items:', data.Count));
"

echo "🎉 Database recovery completed"
echo "Next steps:"
echo "1. Validate data integrity"
echo "2. Update application configuration"
echo "3. Test functionality"
echo "4. Switch traffic to recovered table"
```

### Performance Optimization

#### Lambda Optimization
```bash
#!/bin/bash
# optimize-lambda.sh

echo "⚡ Lambda Optimization"
echo "==================="

# Get function metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=medeez-prod-api \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Maximum

# Check memory utilization
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '1 day ago' +%s)000 \
  --filter-pattern "REPORT" \
  --limit 100

# Recommendations
echo "📊 Optimization recommendations:"
echo "1. Review memory allocation based on usage"
echo "2. Optimize cold start performance"  
echo "3. Consider provisioned concurrency for high-traffic functions"
echo "4. Review package size and dependencies"
```

#### Database Optimization  
```bash
#!/bin/bash
# optimize-database.sh

echo "💾 Database Optimization"
echo "======================"

# Check table metrics
aws dynamodb describe-table --table-name medeez-prod-app

# Analyze access patterns
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=medeez-prod-app \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum,Average

# Check for throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests \
  --dimensions Name=TableName,Value=medeez-prod-app \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum

echo "📊 Optimization recommendations:"
echo "1. Review GSI usage and projections"
echo "2. Optimize query patterns"
echo "3. Consider data archiving for old records"
echo "4. Monitor hot partitions"
```

## Support and Documentation

### Additional Resources

- **AWS CDK Documentation**: https://docs.aws.amazon.com/cdk/
- **AWS Well-Architected Framework**: https://aws.amazon.com/architecture/well-architected/
- **HIPAA on AWS**: https://aws.amazon.com/compliance/hipaa-compliance/
- **DynamoDB Best Practices**: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html

### Getting Help

1. **Internal Documentation**: Check README.md files in each component
2. **CloudWatch Logs**: Review application and AWS service logs
3. **AWS Support**: Use AWS Support cases for infrastructure issues
4. **Community Resources**: Stack Overflow, AWS forums
5. **Emergency Contacts**: Maintain on-call rotation for production issues

### Deployment Checklist

Before deploying to production:

- [ ] All tests passing (unit, integration, E2E)
- [ ] Security scan results reviewed and approved
- [ ] Performance testing completed
- [ ] Database migrations tested
- [ ] Backup procedures verified
- [ ] Monitoring and alerting configured
- [ ] Rollback plan documented
- [ ] Stakeholders notified
- [ ] Change management approval obtained
- [ ] Post-deployment verification plan ready

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Maintained By**: DevOps Team  
**Review Schedule**: Monthly