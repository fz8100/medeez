# Medeez v2 API

HIPAA-compliant solo doctor practice management system API built with Express.js, DynamoDB, and AWS Lambda.

## Features

- **HIPAA Compliant**: End-to-end encryption of PHI using AWS KMS
- **Multi-tenant**: Secure tenant isolation with clinic-scoped data access
- **Cost Optimized**: DynamoDB single-table design with efficient GSI patterns
- **Serverless Ready**: Designed for AWS Lambda with serverless-http
- **Comprehensive Audit Logging**: Full HIPAA compliance audit trail
- **Rate Limited**: Protection against abuse with adaptive rate limiting
- **Encrypted at Rest**: All PHI fields encrypted using KMS envelope encryption

## Architecture

### Single-Table DynamoDB Design

```
Table: medeez-table
PK: TENANT#{clinicId}
SK: {entityType}#{entityId}

GSI1 (ByEntityType): 
- PK: ENTITY#{entityType}
- SK: {clinicId}#{entityId}

GSI2 (ByPatient):
- PK: PATIENT#{patientId} 
- SK: {entityType}#{timestamp}

GSI3 (ByProviderTime):
- PK: PROVIDER#{providerId}
- SK: {timestamp}#{appointmentId}

GSI4 (ByStatus):
- PK: STATUS#{status}
- SK: {clinicId}#{timestamp}

GSI5 (ExternalIDs):
- PK: EMAIL#{email} | DATE#{date} | SLUG#{slug}
- SK: {entityType}
```

### Cost Optimization Features

- **ProjectionExpression**: Always fetch only required attributes
- **BatchGetItem**: Batch operations instead of multiple single gets  
- **Sparse GSIs**: Reduce storage costs with conditional indexing
- **TTL**: Automatic cleanup of temporary data
- **Compression**: Large text fields compressed before storage
- **Query Optimization**: Efficient access patterns using GSIs

## Quick Start

### Prerequisites

- Node.js 18+
- AWS CLI configured
- DynamoDB table created
- KMS key for encryption
- Cognito User Pool

### Installation

```bash
cd apps/api
npm install
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your AWS configuration
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

## API Documentation

### Authentication

All protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

### Core Endpoints

#### Patients
- `GET /v1/patients` - List patients
- `GET /v1/patients/:id` - Get patient by ID
- `POST /v1/patients` - Create patient
- `PUT /v1/patients/:id` - Update patient
- `DELETE /v1/patients/:id` - Soft delete patient
- `GET /v1/patients/search?q=term` - Search patients
- `GET /v1/patients/by-state/:state` - Filter by state
- `GET /v1/patients/export` - Export patient data

#### Appointments
- `GET /v1/appointments` - List appointments
- `GET /v1/appointments/:id` - Get appointment
- `POST /v1/appointments` - Create appointment
- `PUT /v1/appointments/:id` - Update appointment
- `DELETE /v1/appointments/:id` - Cancel appointment
- `GET /v1/appointments/by-date` - Get by date range
- `GET /v1/appointments/by-patient/:patientId` - Patient appointments
- `GET /v1/appointments/by-provider/:providerId` - Provider schedule

#### SOAP Notes
- `GET /v1/notes` - List notes
- `GET /v1/notes/:id` - Get note
- `POST /v1/notes` - Create note
- `PUT /v1/notes/:id` - Update note
- `POST /v1/notes/:id/sign` - Digital signature
- `GET /v1/notes/by-patient/:patientId` - Patient notes

#### Invoices
- `GET /v1/invoices` - List invoices
- `GET /v1/invoices/:id` - Get invoice
- `POST /v1/invoices` - Create invoice
- `PUT /v1/invoices/:id` - Update invoice
- `POST /v1/invoices/:id/payments` - Record payment
- `GET /v1/invoices/:id/pdf` - Generate PDF

### Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "req_123456"
}
```

Error responses:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable error message",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "req_123456"
}
```

## Security

### PHI Encryption

All PHI (Protected Health Information) is encrypted using AWS KMS envelope encryption:

1. Generate data key using KMS
2. Encrypt PHI with data key (AES-256-GCM)
3. Store encrypted data key with encrypted PHI
4. Decrypt by first decrypting data key with KMS

### Multi-Tenancy

- All data scoped by `clinicId`
- Cross-tenant access prevented by middleware
- Audit logging for all data access

### Rate Limiting

Different rate limits for different endpoint types:

- Authentication: 10 attempts/15min per IP
- General API: 1000 requests/15min per user
- Search: 200 requests/5min per user
- Export: 10 requests/hour per user
- File Upload: 50 uploads/hour per user

## HIPAA Compliance

### Audit Logging

All PHI access is logged with:
- User ID and clinic ID
- IP address and user agent
- Action performed (CREATE/READ/UPDATE/DELETE)
- Resource accessed
- Success/failure status
- Timestamp

### Data Retention

- Audit logs: 7 years
- Patient data: Indefinite (per clinic policy)
- Session tokens: 1 hour
- Magic links: 10 minutes
- Password reset tokens: 15 minutes

### Access Controls

- Role-based permissions (Admin, Doctor, Staff)
- Principle of least privilege
- Session timeout after 1 hour
- Failed login attempt protection

## Deployment

### AWS Lambda

The API is designed to run on AWS Lambda using serverless-http:

```javascript
export const handler = serverless(app);
```

### Environment Variables

Required environment variables:

- `AWS_REGION`: AWS region
- `DYNAMODB_TABLE_NAME`: DynamoDB table name
- `KMS_KEY_ID`: KMS key for encryption
- `COGNITO_USER_POOL_ID`: Cognito user pool
- `ALLOWED_ORIGINS`: CORS origins

### Infrastructure as Code

Use AWS CDK for infrastructure deployment:

```bash
cd infra/cdk
npm run deploy
```

## Monitoring

### Logging

Structured JSON logging with:
- Request/response logging
- Performance metrics
- Security events
- HIPAA audit trails

### Metrics

Key metrics to monitor:
- API response times
- Error rates
- DynamoDB consumed capacity
- KMS encryption calls
- Authentication failures

## Development

### Code Structure

```
src/
├── handlers/          # Lambda handlers
├── middleware/        # Express middleware
├── models/           # Data models and validation
├── repositories/     # DynamoDB data access
├── routes/          # API route handlers
├── services/        # Business logic services
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

### Testing

```bash
npm test                # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```

### Code Quality

```bash
npm run lint           # ESLint
npm run type-check     # TypeScript check
npm run format         # Prettier format
```

## Cost Optimization

### DynamoDB Best Practices

- Use ProjectionExpression for selective attribute retrieval
- Implement BatchGetItem for multiple record queries  
- Use sparse GSIs to reduce storage costs
- Enable TTL for automatic data cleanup
- Monitor RCU/WCU consumption

### Target Costs

- DynamoDB: <$8/month per doctor
- Lambda: <$15/month per doctor
- S3 Storage: <$5/month per doctor
- Total AWS: <$35/month per doctor

## Support

For technical support or questions about the API:

1. Check the API documentation
2. Review the error logs
3. Consult the troubleshooting guide
4. Contact the development team

## License

Proprietary - All rights reserved