# Medeez v2 Database Setup Documentation

## Overview

This document describes the database infrastructure setup for Medeez v2, including DynamoDB table structure, GSI patterns, and security configurations.

## Environment: dev

### Database Architecture

#### Single-Table Design (DynamoDB)
- **Table Name**: medeez-dev-app
- **Partition Key**: PK (String)
- **Sort Key**: SK (String)
- **Billing Mode**: Pay-per-request
- **Encryption**: Server-side encryption with KMS

#### Global Secondary Indexes (GSIs)

1. **GSI1 - ByEntityType**
   - PK: GSI1PK (ENTITY#{entityType})
   - SK: GSI1SK ({clinicId}#{entityId})
   - Use Case: Query all entities of a specific type across tenants

2. **GSI2 - ByPatient**
   - PK: GSI2PK (PATIENT#{patientId})
   - SK: GSI2SK ({entityType}#{timestamp}#{entityId})
   - Use Case: Query all records related to a specific patient

3. **GSI3 - ByProviderTime**
   - PK: GSI3PK (PROVIDER#{providerId})
   - SK: GSI3SK ({startTime}#{appointmentId})
   - Use Case: Query appointments by provider and time for scheduling

4. **GSI4 - ByStatus**
   - PK: GSI4PK (STATUS#{status} or STATE#{state} or ROLE#{role})
   - SK: GSI4SK ({clinicId}#{timestamp}#{entityId})
   - Use Case: Query records by status for workflow management

5. **GSI5 - ExternalIDs**
   - PK: GSI5PK (EMAIL#{email} or PHONE#{phone} or EXTERNAL#{systemName}#{id})
   - SK: GSI5SK ({entityType})
   - Use Case: Query by external identifiers

### Entity Types

- **CLINIC**: Clinic/practice information
- **USER**: System users (doctors, staff, admins)
- **PATIENT**: Patient demographics and medical history
- **APPOINTMENT**: Appointment scheduling and status
- **NOTE**: SOAP notes and clinical documentation
- **INVOICE**: Billing and payment information

### Data Encryption

All PHI (Protected Health Information) data is encrypted using:
- **KMS Key**: mock-kms-key-dev
- **Algorithm**: AES-256-GCM
- **Method**: Field-level encryption with envelope encryption

### Compliance Features

- **HIPAA Compliance**: All PHI encrypted at rest and in transit
- **Audit Logging**: All data access logged to RDS PostgreSQL
- **Access Control**: Fine-grained permissions and tenant isolation
- **Data Retention**: Automatic cleanup with TTL attributes

### Performance Optimization

- **Projection Type**: ALL (for development, optimized projections for production)
- **Read/Write Capacity**: On-demand (automatic scaling)
- **Caching**: Application-level caching with Redis
- **Query Patterns**: Optimized for common access patterns

### Backup and Recovery

- **Point-in-Time Recovery**: Enabled
- **DynamoDB Streams**: Enabled for audit trails
- **Cross-region Backup**: Configured for production

### Cost Optimization

Estimated monthly costs for development:
- DynamoDB: $5-15 (depending on usage)
- S3: $1-5 (storage and requests)
- KMS: $1-3 (key usage)
- **Total**: $7-23/month for small development usage

### Local Development

For local development, use the provided Docker Compose setup:

```bash
# Start local services
./start-local.sh

# Stop local services
./stop-local.sh
```

### Security Considerations

1. **Tenant Isolation**: All data is scoped by clinicId
2. **Encryption at Rest**: KMS encryption for all sensitive data
3. **Encryption in Transit**: TLS 1.2+ for all connections
4. **Access Logging**: Comprehensive audit trails
5. **Key Rotation**: Automated key rotation (production)

### Monitoring and Alerting

- CloudWatch metrics for DynamoDB performance
- Custom metrics for application-level monitoring
- Alerts for high latency, errors, and cost thresholds

### Development Setup

1. Install dependencies: `npm install`
2. Start local services: `./start-local.sh`
3. Generate seed data: `node scripts/seed-generator.js generate dev`
4. Run tests: `npm test`

### Production Deployment

1. Deploy CDK stacks: `cdk deploy --all`
2. Initialize database schema: `node scripts/database-setup.js setup prod`
3. Configure monitoring: `node scripts/setup-monitoring.js`
4. Validate setup: `node scripts/validate-setup.js`

---

Generated on: 2025-09-01T05:37:56.843Z
Environment: dev
