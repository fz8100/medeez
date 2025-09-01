#!/usr/bin/env node
/**
 * Local Database Setup for Medeez v2 Development
 * 
 * Creates a complete local database setup without AWS dependencies
 * Uses mock implementations for development and testing
 */

const fs = require('fs');
const path = require('path');

class LocalDatabaseSetup {
  constructor(environment = 'dev') {
    this.environment = environment;
    this.basePath = path.join(__dirname, '..');
    this.dataPath = path.join(this.basePath, 'data');
    this.configPath = path.join(this.dataPath, 'config');
    
    // Mock AWS resource configurations
    this.resources = {
      dynamoTableName: `medeez-${environment}-app`,
      s3BucketName: `medeez-${environment}-attachments-local`,
      kmsKeyId: `mock-kms-key-${environment}`,
      region: 'us-east-1'
    };
  }

  async log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async ensureDirectories() {
    const dirs = [this.dataPath, this.configPath];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.log(`Created directory: ${dir}`);
      }
    }
  }

  async createMockDynamoDBConfig() {
    this.log('Creating DynamoDB table configuration...');
    
    const tableConfig = {
      TableName: this.resources.dynamoTableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
        { AttributeName: 'GSI2PK', AttributeType: 'S' },
        { AttributeName: 'GSI2SK', AttributeType: 'S' },
        { AttributeName: 'GSI3PK', AttributeType: 'S' },
        { AttributeName: 'GSI3SK', AttributeType: 'S' },
        { AttributeName: 'GSI4PK', AttributeType: 'S' },
        { AttributeName: 'GSI4SK', AttributeType: 'S' },
        { AttributeName: 'GSI5PK', AttributeType: 'S' },
        { AttributeName: 'GSI5SK', AttributeType: 'S' }
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' }
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'GSI2',
          KeySchema: [
            { AttributeName: 'GSI2PK', KeyType: 'HASH' },
            { AttributeName: 'GSI2SK', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'GSI3',
          KeySchema: [
            { AttributeName: 'GSI3PK', KeyType: 'HASH' },
            { AttributeName: 'GSI3SK', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'GSI4',
          KeySchema: [
            { AttributeName: 'GSI4PK', KeyType: 'HASH' },
            { AttributeName: 'GSI4SK', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        },
        {
          IndexName: 'GSI5',
          KeySchema: [
            { AttributeName: 'GSI5PK', KeyType: 'HASH' },
            { AttributeName: 'GSI5SK', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' }
        }
      ],
      SSESpecification: {
        Enabled: true,
        SSEType: 'KMS',
        KMSMasterKeyId: this.resources.kmsKeyId
      },
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true
      },
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: 'NEW_AND_OLD_IMAGES'
      },
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true
      },
      Tags: [
        { Key: 'Environment', Value: this.environment },
        { Key: 'Project', Value: 'Medeez' },
        { Key: 'ManagedBy', Value: 'LocalDatabaseSetup' },
        { Key: 'Compliance', Value: 'HIPAA' }
      ],
      CreatedDate: new Date().toISOString(),
      TableStatus: 'ACTIVE',
      TableArn: `arn:aws:dynamodb:${this.resources.region}:123456789012:table/${this.resources.dynamoTableName}`,
      StreamArn: `arn:aws:dynamodb:${this.resources.region}:123456789012:table/${this.resources.dynamoTableName}/stream/2024-01-01T00:00:00.000`
    };

    const configFile = path.join(this.configPath, 'dynamodb-table.json');
    fs.writeFileSync(configFile, JSON.stringify(tableConfig, null, 2));
    
    this.log(`DynamoDB table configuration saved to: ${configFile}`);
    return tableConfig;
  }

  async createMockS3Config() {
    this.log('Creating S3 bucket configuration...');
    
    const bucketConfig = {
      BucketName: this.resources.s3BucketName,
      Region: this.resources.region,
      CreationDate: new Date().toISOString(),
      Encryption: {
        Rules: [{
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: 'aws:kms',
            KMSMasterKeyID: this.resources.kmsKeyId
          },
          BucketKeyEnabled: true
        }]
      },
      Versioning: { Status: 'Enabled' },
      PublicAccessBlock: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true
      },
      LifecycleRules: [
        {
          Id: 'DeleteIncompleteMultipartUploads',
          Status: 'Enabled',
          AbortIncompleteMultipartUpload: {
            DaysAfterInitiation: 7
          }
        },
        {
          Id: 'TransitionToIA',
          Status: 'Enabled',
          Transitions: [
            {
              Days: 30,
              StorageClass: 'STANDARD_IA'
            },
            {
              Days: 90,
              StorageClass: 'GLACIER'
            }
          ]
        }
      ],
      CorsConfiguration: [
        {
          AllowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
          AllowedOrigins: [
            'https://dev.medeez.com',
            'https://localhost:3000',
            'http://localhost:3000'
          ],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 3600
        }
      ],
      Tags: [
        { Key: 'Environment', Value: this.environment },
        { Key: 'Project', Value: 'Medeez' }
      ]
    };

    const configFile = path.join(this.configPath, 's3-bucket.json');
    fs.writeFileSync(configFile, JSON.stringify(bucketConfig, null, 2));
    
    this.log(`S3 bucket configuration saved to: ${configFile}`);
    return bucketConfig;
  }

  async createMockKMSConfig() {
    this.log('Creating KMS key configuration...');
    
    const kmsConfig = {
      KeyId: this.resources.kmsKeyId,
      Arn: `arn:aws:kms:${this.resources.region}:123456789012:key/${this.resources.kmsKeyId}`,
      CreationDate: new Date().toISOString(),
      Enabled: true,
      Description: `Medeez ${this.environment} encryption key for PHI data`,
      KeyUsage: 'ENCRYPT_DECRYPT',
      KeySpec: 'SYMMETRIC_DEFAULT',
      KeyState: 'Enabled',
      Origin: 'AWS_KMS',
      MultiRegion: false,
      Aliases: [`alias/medeez-${this.environment}-key`],
      Tags: [
        { TagKey: 'Environment', TagValue: this.environment },
        { TagKey: 'Project', TagValue: 'Medeez' },
        { TagKey: 'Purpose', TagValue: 'Database Encryption' }
      ]
    };

    const configFile = path.join(this.configPath, 'kms-key.json');
    fs.writeFileSync(configFile, JSON.stringify(kmsConfig, null, 2));
    
    this.log(`KMS key configuration saved to: ${configFile}`);
    return kmsConfig;
  }

  async createEnvironmentConfig() {
    this.log('Creating environment configuration...');
    
    const envConfig = {
      environment: this.environment,
      region: this.resources.region,
      setup: {
        date: new Date().toISOString(),
        version: '2.0.0',
        type: 'local-development'
      },
      aws: {
        dynamodb: {
          tableName: this.resources.dynamoTableName,
          region: this.resources.region
        },
        s3: {
          bucketName: this.resources.s3BucketName,
          region: this.resources.region
        },
        kms: {
          keyId: this.resources.kmsKeyId,
          region: this.resources.region
        }
      },
      database: {
        type: 'dynamodb',
        encryption: true,
        backup: true,
        pointInTimeRecovery: true
      },
      features: {
        encryption: true,
        audit: true,
        compliance: true,
        search: true
      }
    };

    const configFile = path.join(this.configPath, 'environment.json');
    fs.writeFileSync(configFile, JSON.stringify(envConfig, null, 2));
    
    // Also create a .env file for the application
    const envFile = path.join(this.basePath, '.env.local');
    const envContent = `
# Medeez v2 Local Development Configuration
NODE_ENV=${this.environment}
AWS_REGION=${this.resources.region}

# DynamoDB Configuration
DYNAMODB_TABLE_NAME=${this.resources.dynamoTableName}
DYNAMODB_ENDPOINT=http://localhost:8000

# S3 Configuration  
S3_BUCKET_NAME=${this.resources.s3BucketName}
S3_ENDPOINT=http://localhost:9000

# KMS Configuration
KMS_KEY_ID=${this.resources.kmsKeyId}

# Application Configuration
API_PORT=3001
WEB_PORT=3000
LOG_LEVEL=debug

# Security Configuration
JWT_SECRET=local-dev-jwt-secret-key-${Date.now()}
ENCRYPTION_KEY=local-dev-encryption-key-${Date.now()}

# Feature Flags
ENABLE_ENCRYPTION=true
ENABLE_AUDIT_LOGGING=true
ENABLE_COMPLIANCE_MODE=true

# Local Services
REDIS_URL=redis://localhost:6379
POSTGRES_URL=postgresql://postgres:password@localhost:5432/medeez_dev

# Mock External Services
MOCK_SERVICES=true
STRIPE_WEBHOOK_SECRET=whsec_local_dev
TWILIO_AUTH_TOKEN=local_dev_token
`.trim();

    fs.writeFileSync(envFile, envContent);
    
    this.log(`Environment configuration saved to: ${configFile}`);
    this.log(`Environment variables saved to: ${envFile}`);
    return envConfig;
  }

  async createParameterStoreConfig() {
    this.log('Creating parameter store configuration...');
    
    const parameters = {
      [`/medeez/${this.environment}/dynamo/table-name`]: {
        Name: `/medeez/${this.environment}/dynamo/table-name`,
        Value: this.resources.dynamoTableName,
        Type: 'String',
        Description: 'DynamoDB table name'
      },
      [`/medeez/${this.environment}/s3/bucket-name`]: {
        Name: `/medeez/${this.environment}/s3/bucket-name`,
        Value: this.resources.s3BucketName,
        Type: 'String',
        Description: 'S3 bucket name for attachments'
      },
      [`/medeez/${this.environment}/kms/key-id`]: {
        Name: `/medeez/${this.environment}/kms/key-id`,
        Value: this.resources.kmsKeyId,
        Type: 'String',
        Description: 'KMS key ID for encryption'
      }
    };

    const configFile = path.join(this.configPath, 'parameter-store.json');
    fs.writeFileSync(configFile, JSON.stringify(parameters, null, 2));
    
    this.log(`Parameter store configuration saved to: ${configFile}`);
    return parameters;
  }

  async createLocalDockerCompose() {
    this.log('Creating Docker Compose configuration for local services...');
    
    const dockerCompose = `version: '3.8'
services:
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    container_name: medeez-dynamodb-local
    ports:
      - "8000:8000"
    command: ["-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"]
    networks:
      - medeez-dev
    
  minio:
    image: minio/minio:latest
    container_name: medeez-minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    networks:
      - medeez-dev
    
  redis:
    image: redis:7-alpine
    container_name: medeez-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - medeez-dev
    
  postgres:
    image: postgres:15-alpine
    container_name: medeez-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: medeez_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./rds-audit-schema.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - medeez-dev

volumes:
  minio_data:
  redis_data:
  postgres_data:

networks:
  medeez-dev:
    driver: bridge
`;

    const dockerFile = path.join(this.basePath, 'docker-compose.local.yml');
    fs.writeFileSync(dockerFile, dockerCompose);
    
    this.log(`Docker Compose configuration saved to: ${dockerFile}`);
    return dockerCompose;
  }

  async createSetupScripts() {
    this.log('Creating setup scripts...');
    
    // Create start script
    const startScript = `#!/bin/bash
# Start local development environment for Medeez v2

echo "Starting Medeez v2 local development environment..."

# Start Docker services
docker-compose -f docker-compose.local.yml up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 10

# Create DynamoDB table
echo "Creating DynamoDB table..."
node scripts/create-local-table.js

# Create S3 buckets
echo "Creating S3 buckets..."
node scripts/create-local-buckets.js

# Generate seed data
echo "Generating seed data..."
node scripts/seed-generator.js generate dev

echo "Local development environment is ready!"
echo "Services available:"
echo "  - DynamoDB Admin: http://localhost:8000"
echo "  - MinIO Console: http://localhost:9001 (admin/admin123)"
echo "  - Redis: localhost:6379"
echo "  - PostgreSQL: localhost:5432"
`;

    const startFile = path.join(this.basePath, 'start-local.sh');
    fs.writeFileSync(startFile, startScript);
    
    // Create stop script
    const stopScript = `#!/bin/bash
# Stop local development environment for Medeez v2

echo "Stopping Medeez v2 local development environment..."

docker-compose -f docker-compose.local.yml down

echo "Local development environment stopped."
`;

    const stopFile = path.join(this.basePath, 'stop-local.sh');
    fs.writeFileSync(stopFile, stopScript);
    
    this.log(`Setup scripts created: ${startFile}, ${stopFile}`);
    
    // Make scripts executable (Unix/Linux)
    try {
      const { exec } = require('child_process');
      exec(`chmod +x "${startFile}" "${stopFile}"`, (error) => {
        if (error) {
          this.log('Note: Could not make scripts executable (Windows/Unix compatibility)');
        }
      });
    } catch (error) {
      // Ignore on Windows
    }
  }

  async generateDatabaseDocumentation() {
    this.log('Generating database documentation...');
    
    const documentation = `# Medeez v2 Database Setup Documentation

## Overview

This document describes the database infrastructure setup for Medeez v2, including DynamoDB table structure, GSI patterns, and security configurations.

## Environment: ${this.environment}

### Database Architecture

#### Single-Table Design (DynamoDB)
- **Table Name**: ${this.resources.dynamoTableName}
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
- **KMS Key**: ${this.resources.kmsKeyId}
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

\`\`\`bash
# Start local services
./start-local.sh

# Stop local services
./stop-local.sh
\`\`\`

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

1. Install dependencies: \`npm install\`
2. Start local services: \`./start-local.sh\`
3. Generate seed data: \`node scripts/seed-generator.js generate dev\`
4. Run tests: \`npm test\`

### Production Deployment

1. Deploy CDK stacks: \`cdk deploy --all\`
2. Initialize database schema: \`node scripts/database-setup.js setup prod\`
3. Configure monitoring: \`node scripts/setup-monitoring.js\`
4. Validate setup: \`node scripts/validate-setup.js\`

---

Generated on: ${new Date().toISOString()}
Environment: ${this.environment}
`;

    const docFile = path.join(this.basePath, 'DATABASE_SETUP.md');
    fs.writeFileSync(docFile, documentation);
    
    this.log(`Database documentation saved to: ${docFile}`);
    return documentation;
  }

  async setupLocalDatabase() {
    try {
      this.log(`Setting up local Medeez v2 database for environment: ${this.environment}`);
      this.log('================================================================================');

      const startTime = Date.now();

      // Step 1: Create directory structure
      await this.ensureDirectories();

      // Step 2: Create service configurations
      await this.createMockDynamoDBConfig();
      await this.createMockS3Config();
      await this.createMockKMSConfig();

      // Step 3: Create environment configuration
      await this.createEnvironmentConfig();
      await this.createParameterStoreConfig();

      // Step 4: Create Docker Compose setup
      await this.createLocalDockerCompose();
      await this.createSetupScripts();

      // Step 5: Generate documentation
      await this.generateDatabaseDocumentation();

      const duration = (Date.now() - startTime) / 1000;

      this.log('================================================================================');
      this.log(`Local database setup completed successfully in ${duration.toFixed(2)} seconds!`);
      this.log('');
      this.log('Resources Created:');
      this.log(`  - DynamoDB Config: ${this.resources.dynamoTableName}`);
      this.log(`  - S3 Config: ${this.resources.s3BucketName}`);
      this.log(`  - KMS Config: ${this.resources.kmsKeyId}`);
      this.log(`  - Environment: ${this.environment}`);
      this.log('');
      this.log('Next Steps:');
      this.log('  1. Start local services: ./start-local.sh');
      this.log('  2. Generate seed data: node scripts/seed-generator.js generate dev');
      this.log('  3. Run application: npm run dev');
      this.log('  4. Access services:');
      this.log('     - DynamoDB: http://localhost:8000');
      this.log('     - MinIO: http://localhost:9001');
      this.log('     - PostgreSQL: localhost:5432');

      return {
        success: true,
        duration: duration,
        resources: this.resources,
        environment: this.environment,
        dataPath: this.dataPath,
        configPath: this.configPath
      };

    } catch (error) {
      this.log(`Local database setup failed: ${error.message}`);
      throw error;
    }
  }

  async validateSetup() {
    this.log('Validating local database setup...');

    const requiredFiles = [
      path.join(this.configPath, 'dynamodb-table.json'),
      path.join(this.configPath, 's3-bucket.json'),
      path.join(this.configPath, 'kms-key.json'),
      path.join(this.configPath, 'environment.json'),
      path.join(this.basePath, '.env.local'),
      path.join(this.basePath, 'docker-compose.local.yml')
    ];

    const missing = requiredFiles.filter(file => !fs.existsSync(file));
    
    if (missing.length > 0) {
      this.log(`Validation failed. Missing files: ${missing.join(', ')}`);
      return false;
    }

    this.log('Local database setup validation successful!');
    return true;
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const environment = args[1] || process.env.NODE_ENV || 'dev';

  const setup = new LocalDatabaseSetup(environment);

  try {
    switch (command) {
      case 'setup':
        console.log(`Setting up local database infrastructure for environment: ${environment}`);
        const result = await setup.setupLocalDatabase();
        console.log('\nLocal setup completed successfully!');
        break;

      case 'validate':
        console.log(`Validating local database setup for environment: ${environment}`);
        const isValid = await setup.validateSetup();
        if (isValid) {
          console.log('Validation passed!');
        } else {
          console.log('Validation failed!');
          process.exit(1);
        }
        break;

      default:
        console.log('Usage: node local-database-setup.js [command] [environment]');
        console.log('');
        console.log('Commands:');
        console.log('  setup     - Create complete local database setup');
        console.log('  validate  - Validate existing local setup');
        console.log('');
        console.log('Examples:');
        console.log('  node local-database-setup.js setup dev');
        console.log('  node local-database-setup.js validate dev');
        process.exit(1);
    }

  } catch (error) {
    console.error('Command failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = LocalDatabaseSetup;