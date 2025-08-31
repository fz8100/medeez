# Medeez v2 Operational Runbooks

**Critical Procedures for Production Operations and Incident Management**

## Table of Contents

- [Emergency Procedures](#emergency-procedures)
- [System Recovery](#system-recovery)
- [Performance Issues](#performance-issues)
- [Security Incidents](#security-incidents)
- [Database Operations](#database-operations)
- [Deployment Issues](#deployment-issues)
- [Monitoring & Alerting](#monitoring--alerting)
- [Cost Management](#cost-management)

---

## Emergency Procedures

### 🚨 Critical System Outage

**When to Use**: Complete system unavailability, 5xx errors > 50%

#### Immediate Actions (0-15 minutes)

1. **Assess Impact**
```bash
# Check system health
curl -I https://api.medeez.com/health
curl -I https://medeez.com

# Check CloudWatch dashboard
# Navigate to: https://console.aws.amazon.com/cloudwatch/home#dashboards:name=MedeezDashboard-prod
```

2. **Activate Incident Response**
```bash
# Send emergency notification
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:123456789012:medeez-prod-emergency \
  --subject "🚨 CRITICAL: Medeez System Outage" \
  --message "Critical system outage detected. Incident response activated."
```

3. **Check Recent Deployments**
```bash
# Check recent GitHub deployments
gh run list --limit 5

# Check Lambda function updates
aws lambda list-versions-by-function --function-name medeez-prod-api --max-items 5
```

#### Investigation (15-30 minutes)

4. **Check Infrastructure Health**
```bash
# API Gateway health
aws apigateway get-rest-apis
aws apigateway test-invoke-method --rest-api-id [API-ID] --resource-id [RESOURCE-ID] --http-method GET

# Lambda function health
aws lambda invoke --function-name medeez-prod-api /tmp/test-response.json
cat /tmp/test-response.json

# DynamoDB health
aws dynamodb describe-table --table-name medeez-prod-app
aws dynamodb scan --table-name medeez-prod-app --limit 1
```

5. **Check Logs**
```bash
# API Gateway logs
aws logs filter-log-events \
  --log-group-name API-Gateway-Execution-Logs_[API-ID]/prod \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"

# Lambda logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR"
```

#### Resolution Actions

6. **Immediate Fixes**
```bash
# Option 1: Rollback to previous version
aws lambda update-function-code \
  --function-name medeez-prod-api \
  --s3-bucket medeez-prod-deployments \
  --s3-key previous-version.zip

# Option 2: Scale up resources
aws lambda put-provisioned-concurrency-config \
  --function-name medeez-prod-api \
  --qualifier $LATEST \
  --provisioned-concurrency-config ProvisionedConcurrencyLevel=10

# Option 3: Enable maintenance mode
# Update CloudFront to serve maintenance page
```

7. **Verify Recovery**
```bash
# Test critical paths
curl -X POST https://api.medeez.com/api/v1/health \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check metrics recovery
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=medeez-prod-api \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum
```

### 🔥 Database Corruption/Data Loss

**When to Use**: Data integrity issues, missing records, corrupted data

#### Immediate Actions (0-10 minutes)

1. **Stop Write Operations**
```bash
# Enable read-only mode (if implemented in application)
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --environment Variables='{READ_ONLY_MODE=true,EXISTING_VAR=value}'

# Or scale down write capacity
aws dynamodb update-table \
  --table-name medeez-prod-app \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=10,WriteCapacityUnits=1
```

2. **Assess Damage**
```bash
# Check table status
aws dynamodb describe-table --table-name medeez-prod-app

# Quick data integrity check
node scripts/data-integrity-check.js prod

# Check recent backups
aws dynamodb list-backups --table-name medeez-prod-app --max-results 10
```

#### Recovery Actions (10-60 minutes)

3. **Point-in-Time Recovery**
```bash
# Identify recovery point
RECOVERY_TIME=$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S)
echo "Recovery time: $RECOVERY_TIME"

# Create recovery table
aws dynamodb restore-table-to-point-in-time \
  --source-table-name medeez-prod-app \
  --target-table-name medeez-prod-app-recovery-$(date +%Y%m%d%H%M) \
  --restore-date-time $RECOVERY_TIME

# Wait for table creation
aws dynamodb wait table-exists --table-name medeez-prod-app-recovery-$(date +%Y%m%d%H%M)
```

4. **Data Validation**
```bash
# Validate recovered data
node -e "
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

async function validate() {
  const original = await dynamodb.scan({
    TableName: 'medeez-prod-app',
    Select: 'COUNT'
  }).promise();
  
  const recovery = await dynamodb.scan({
    TableName: 'medeez-prod-app-recovery-$(date +%Y%m%d%H%M)',
    Select: 'COUNT'
  }).promise();
  
  console.log('Original count:', original.Count);
  console.log('Recovery count:', recovery.Count);
  console.log('Difference:', original.Count - recovery.Count);
}

validate().catch(console.error);
"
```

5. **Switch to Recovery Table**
```bash
# Backup current table
aws dynamodb create-backup \
  --table-name medeez-prod-app \
  --backup-name emergency-backup-$(date +%Y%m%d%H%M)

# Update application configuration
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --environment Variables='{DYNAMO_TABLE_NAME=medeez-prod-app-recovery-$(date +%Y%m%d%H%M),READ_ONLY_MODE=false}'
```

---

## System Recovery

### Lambda Function Recovery

**Symptoms**: 5xx errors, timeouts, function not responding

#### Quick Diagnosis
```bash
# Check function configuration
aws lambda get-function --function-name medeez-prod-api

# Check recent invocations
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '30 minutes ago' +%s)000 \
  --filter-pattern "REPORT"

# Check error rate
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=medeez-prod-api \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

#### Recovery Steps
```bash
# 1. Restart function (update configuration to force restart)
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --timeout 30

# 2. Increase memory if needed
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --memory-size 1024

# 3. Enable provisioned concurrency for consistent performance
aws lambda put-provisioned-concurrency-config \
  --function-name medeez-prod-api \
  --qualifier $LATEST \
  --provisioned-concurrency-config ProvisionedConcurrencyLevel=5

# 4. Rollback if issues persist
aws lambda update-function-code \
  --function-name medeez-prod-api \
  --s3-bucket medeez-prod-deployments \
  --s3-key lambda/previous-stable-version.zip
```

### API Gateway Recovery

**Symptoms**: Gateway timeouts, throttling, incorrect routing

#### Diagnosis
```bash
# Check API Gateway health
aws apigateway get-rest-apis

# Check throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name ThrottleCount \
  --dimensions Name=ApiName,Value=medeez-prod-api \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

#### Recovery Steps
```bash
# 1. Flush API Gateway cache
aws apigateway flush-stage-cache \
  --rest-api-id [YOUR-API-ID] \
  --stage-name prod

# 2. Redeploy API if needed
aws apigateway create-deployment \
  --rest-api-id [YOUR-API-ID] \
  --stage-name prod \
  --description "Emergency redeployment $(date)"

# 3. Increase throttle limits temporarily
aws apigateway update-stage \
  --rest-api-id [YOUR-API-ID] \
  --stage-name prod \
  --patch-ops op=replace,path=/throttle/rateLimit,value=2000
```

---

## Performance Issues

### High Latency Response

**Symptoms**: Response times > 2 seconds, slow API calls

#### Investigation
```bash
# Check Lambda duration metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=medeez-prod-api \
  --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum

# Check DynamoDB performance
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name SuccessfulRequestLatency \
  --dimensions Name=TableName,Value=medeez-prod-app \
  --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum

# Analyze slow queries
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "[timestamp, requestId, level=\"WARN\", message=\"Slow*\"]"
```

#### Optimization Actions
```bash
# 1. Increase Lambda memory (CPU scales with memory)
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --memory-size 2048

# 2. Enable connection pooling for DynamoDB
# (This would be done in application code)

# 3. Add DynamoDB auto-scaling if not present
aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id table/medeez-prod-app \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --min-capacity 5 \
  --max-capacity 100

# 4. Enable CloudWatch Insights for detailed analysis
aws logs start-query \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '2 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @duration, @requestId | filter @duration > 5000'
```

### DynamoDB Throttling

**Symptoms**: ThrottledRequests > 0, ProvisionedThroughputExceeded errors

#### Immediate Actions
```bash
# Check current capacity and usage
aws dynamodb describe-table --table-name medeez-prod-app

# Check throttling metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests \
  --dimensions Name=TableName,Value=medeez-prod-app \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Identify hot partitions
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "ProvisionedThroughputExceededException"
```

#### Resolution
```bash
# 1. Switch to On-Demand billing temporarily
aws dynamodb update-table \
  --table-name medeez-prod-app \
  --billing-mode PAY_PER_REQUEST

# 2. Or increase provisioned capacity
aws dynamodb update-table \
  --table-name medeez-prod-app \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=100,WriteCapacityUnits=100

# 3. Enable auto-scaling for the future
aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id table/medeez-prod-app \
  --scalable-dimension dynamodb:table:WriteCapacityUnits \
  --min-capacity 10 \
  --max-capacity 200
```

---

## Security Incidents

### Suspected Security Breach

**When to Use**: Unauthorized access attempts, unusual traffic patterns, security alerts

#### Immediate Response (0-15 minutes)

1. **Isolate the Threat**
```bash
# Enable WAF rate limiting
aws wafv2 update-rule-group \
  --scope CLOUDFRONT \
  --id [RULE-GROUP-ID] \
  --rules file://emergency-rate-limit-rules.json

# Check recent authentication attempts
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '2 hours ago' +%s)000 \
  --filter-pattern "[timestamp, requestId, level, message=\"AUTH*FAILED*\"]"
```

2. **Assess Impact**
```bash
# Check CloudTrail for suspicious API calls
aws logs filter-log-events \
  --log-group-name CloudTrail/medeez-audit-trail \
  --start-time $(date -d '4 hours ago' +%s)000 \
  --filter-pattern "{ $.errorCode EXISTS || $.sourceIPAddress != \"*.amazonaws.com\" }"

# Check for unauthorized data access
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '2 hours ago' +%s)000 \
  --filter-pattern "[timestamp, requestId, level, message=\"DATA*ACCESS*\", userId]"
```

3. **Secure the Environment**
```bash
# Rotate API keys
aws apigateway update-api-key \
  --api-key [API-KEY-ID] \
  --patch-ops op=replace,path=/enabled,value=false

# Force password reset for all users (if applicable)
# This would be done through Cognito or application logic

# Enable additional logging
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --environment Variables='{LOG_LEVEL=debug,SECURITY_MODE=enhanced}'
```

#### Investigation (15-60 minutes)

4. **Forensic Analysis**
```bash
# Download CloudTrail logs for analysis
aws s3 sync s3://medeez-prod-cloudtrail/AWSLogs/[ACCOUNT-ID]/CloudTrail/us-east-1/$(date +%Y/%m/%d)/ ./forensics/

# Analyze access patterns
python scripts/security-analysis.py \
  --cloudtrail-path ./forensics/ \
  --start-time "$(date -d '4 hours ago' +%Y-%m-%dT%H:%M:%S)" \
  --output security-incident-report.json

# Check for data exfiltration
aws logs filter-log-events \
  --log-group-name /aws/lambda/medeez-prod-api \
  --start-time $(date -d '4 hours ago' +%s)000 \
  --filter-pattern "[timestamp, requestId, level, bytes > 1000000]"
```

#### Recovery Actions

5. **Remediation**
```bash
# Update security groups
aws ec2 authorize-security-group-ingress \
  --group-id sg-12345678 \
  --protocol tcp \
  --port 443 \
  --source-group sg-87654321

# Update IAM policies (revoke suspicious permissions)
aws iam detach-user-policy \
  --user-name suspicious-user \
  --policy-arn arn:aws:iam::123456789012:policy/TemporaryAccess

# Enable GuardDuty findings
aws guardduty list-findings \
  --detector-id [DETECTOR-ID] \
  --finding-criteria Criterion='{service.action.actionType={Eq=["NETWORK_CONNECTION"]}}'
```

### HIPAA Compliance Violation

**When to Use**: PHI exposure, unauthorized data access, compliance alerts

#### Immediate Actions
```bash
# 1. Document the incident
echo "$(date): HIPAA incident detected" >> /var/log/hipaa-incidents.log

# 2. Identify affected records
python scripts/phi-audit.py \
  --incident-time "$(date -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
  --output affected-records.json

# 3. Notify compliance officer
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:123456789012:medeez-compliance-alerts \
  --subject "URGENT: HIPAA Incident" \
  --message "PHI exposure incident detected. Immediate investigation required."

# 4. Secure affected data
node scripts/secure-phi-data.js --incident-id $(date +%Y%m%d%H%M%S)
```

---

## Database Operations

### Emergency Database Maintenance

**When to Use**: Corruption issues, performance degradation, urgent schema changes

#### Pre-Maintenance
```bash
# 1. Create emergency backup
aws dynamodb create-backup \
  --table-name medeez-prod-app \
  --backup-name emergency-maintenance-$(date +%Y%m%d%H%M)

# 2. Enable maintenance mode
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --environment Variables='{MAINTENANCE_MODE=true,MAINTENANCE_MESSAGE="Database maintenance in progress"}'

# 3. Monitor active connections
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=medeez-prod-app \
  --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum
```

#### Maintenance Operations
```bash
# Data cleanup
node scripts/database-cleanup.js --environment prod --dry-run=false

# Index optimization
python scripts/optimize-gsi.py --table medeez-prod-app --analyze-only=false

# Data migration (if needed)
node scripts/database-migration.js migrate-schema prod
```

#### Post-Maintenance
```bash
# 1. Validate data integrity
node scripts/data-integrity-check.js prod

# 2. Disable maintenance mode
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --environment Variables='{MAINTENANCE_MODE=false}'

# 3. Monitor performance
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=medeez-prod-api \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Average
```

### Database Migration Rollback

**When to Use**: Failed migrations, data corruption after migration

```bash
# 1. Stop all write operations
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --environment Variables='{READ_ONLY_MODE=true}'

# 2. Restore from backup
BACKUP_ARN=$(aws dynamodb list-backups --table-name medeez-prod-app --query 'BackupSummaries[0].BackupArn' --output text)

aws dynamodb restore-table-from-backup \
  --target-table-name medeez-prod-app-rollback \
  --backup-arn $BACKUP_ARN

# 3. Wait for restore completion
aws dynamodb wait table-exists --table-name medeez-prod-app-rollback

# 4. Validate rollback data
node scripts/validate-rollback.js medeez-prod-app-rollback

# 5. Switch to rollback table
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --environment Variables='{DYNAMO_TABLE_NAME=medeez-prod-app-rollback,READ_ONLY_MODE=false}'

# 6. Update DNS/routing if needed
# (Implementation depends on setup)
```

---

## Deployment Issues

### Failed Deployment Recovery

**When to Use**: CDK deployment failures, application deployment issues

#### CDK Deployment Failures
```bash
# 1. Check stack status
aws cloudformation describe-stacks --stack-name MedeezApiStack-prod

# 2. View stack events
aws cloudformation describe-stack-events --stack-name MedeezApiStack-prod

# 3. Rollback to previous version
aws cloudformation cancel-update-stack --stack-name MedeezApiStack-prod

# 4. Manual rollback if needed
aws cloudformation continue-update-rollback --stack-name MedeezApiStack-prod

# 5. Redeploy with fixes
cd infra/cdk
pnpm cdk deploy MedeezApiStack-prod --context environment=prod
```

#### Lambda Deployment Rollback
```bash
# 1. List function versions
aws lambda list-versions-by-function --function-name medeez-prod-api

# 2. Get previous stable version
PREVIOUS_VERSION=$(aws lambda list-versions-by-function --function-name medeez-prod-api --query 'Versions[-2].Version' --output text)

# 3. Update alias to previous version
aws lambda update-alias \
  --function-name medeez-prod-api \
  --name PROD \
  --function-version $PREVIOUS_VERSION

# 4. Verify rollback
curl https://api.medeez.com/health
```

### Blue/Green Deployment Issues

**When to Use**: Partial failures during blue/green deployments

```bash
# 1. Check both environments
curl -H "Host: blue.api.medeez.com" https://api.medeez.com/health
curl -H "Host: green.api.medeez.com" https://api.medeez.com/health

# 2. Route all traffic to stable environment
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --change-batch file://route-to-stable.json

# 3. Verify traffic routing
dig api.medeez.com
curl https://api.medeez.com/health

# 4. Scale down failed environment
aws lambda update-function-configuration \
  --function-name medeez-prod-api-green \
  --reserved-concurrent-executions 0
```

---

## Monitoring & Alerting

### Alert Fatigue Management

**When to Use**: Too many false positives, unclear alerts

#### Tune Alert Thresholds
```bash
# Update CloudWatch alarms
aws cloudwatch put-metric-alarm \
  --alarm-name "medeez-prod-api-error-rate" \
  --alarm-description "API error rate too high" \
  --metric-name "4XXError" \
  --namespace "AWS/ApiGateway" \
  --statistic "Sum" \
  --period 300 \
  --threshold 10 \
  --comparison-operator "GreaterThanThreshold" \
  --dimensions Name=ApiName,Value=medeez-prod-api \
  --evaluation-periods 2 \
  --treat-missing-data "notBreaching"

# Review alert history
aws logs filter-log-events \
  --log-group-name "/aws/events/medeez-alerts" \
  --start-time $(date -d '7 days ago' +%s)000 \
  --filter-pattern "FALSE_POSITIVE"
```

#### Create Custom Metrics
```bash
# Add business metrics
aws cloudwatch put-metric-data \
  --namespace "Medeez/Business" \
  --metric-data MetricName=ActiveUsers,Value=150,Unit=Count MetricName=RevenuePerHour,Value=125.50,Unit=None

# Create composite alarms
aws cloudwatch put-composite-alarm \
  --alarm-name "medeez-prod-system-health" \
  --alarm-description "Overall system health" \
  --alarm-rule "(ALARM('medeez-prod-api-error-rate') OR ALARM('medeez-prod-database-throttling'))" \
  --actions-enabled \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:medeez-prod-alerts
```

---

## Cost Management

### Emergency Cost Controls

**When to Use**: Unexpected cost spikes, budget overruns

#### Immediate Cost Reduction
```bash
# 1. Check current spend
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '1 month ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# 2. Scale down non-critical resources
aws lambda update-function-configuration \
  --function-name medeez-prod-api \
  --reserved-concurrent-executions 10

# 3. Reduce DynamoDB capacity
aws dynamodb update-table \
  --table-name medeez-prod-app \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5

# 4. Enable cost controls
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://emergency-budget.json \
  --notifications-with-subscribers file://emergency-budget-notifications.json

# 5. Run cost optimization
python scripts/cost-optimization.py --environment prod --execute
```

#### Cost Analysis and Reporting
```bash
# Generate detailed cost report
python scripts/cost-analysis.py \
  --environment prod \
  --output detailed-cost-report-$(date +%Y%m%d).json

# Identify cost anomalies
aws ce get-anomalies \
  --monitor-arn arn:aws:ce::123456789012:anomaly-monitor/12345678-1234-1234-1234-123456789012 \
  --date-interval Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d)

# Check Reserved Instance utilization
aws ce get-reservation-utilization \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY
```

---

## Contact Information

### Emergency Contacts

- **On-Call Engineer**: +1-XXX-XXX-XXXX
- **DevOps Lead**: devops@medeez.com
- **Security Officer**: security@medeez.com
- **Compliance Officer**: compliance@medeez.com

### Escalation Matrix

1. **Level 1**: On-Call Engineer (0-30 min)
2. **Level 2**: DevOps Lead (30-60 min)
3. **Level 3**: CTO/Architecture Team (60+ min)
4. **Level 4**: External Vendor Support

### External Support

- **AWS Support**: https://console.aws.amazon.com/support/
- **GitHub Support**: support@github.com
- **Third-party Vendor Contacts**: [Maintain list]

---

**Document Version**: 1.0  
**Last Updated**: $(date)  
**Review Schedule**: Quarterly  
**Owner**: DevOps Team