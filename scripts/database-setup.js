#!/usr/bin/env node
/**
 * Database Setup Script for Medeez v2
 * 
 * This script creates the complete database infrastructure including:
 * - DynamoDB table with GSIs
 * - S3 bucket for attachments
 * - KMS keys for encryption
 * - IAM roles and policies
 * - Parameter store values
 * - Seed data generation
 */

const { 
  DynamoDBClient, 
  CreateTableCommand, 
  DescribeTableCommand,
  ListTablesCommand,
  waitUntilTableExists 
} = require('@aws-sdk/client-dynamodb');
const { 
  S3Client, 
  CreateBucketCommand, 
  HeadBucketCommand,
  PutBucketEncryptionCommand,
  PutBucketVersioningCommand,
  PutBucketPublicAccessBlockCommand 
} = require('@aws-sdk/client-s3');
const { 
  KMSClient, 
  CreateKeyCommand, 
  CreateAliasCommand,
  DescribeKeyCommand 
} = require('@aws-sdk/client-kms');
const { 
  SSMClient, 
  PutParameterCommand, 
  GetParameterCommand 
} = require('@aws-sdk/client-ssm');
const { 
  IAMClient, 
  CreateRoleCommand, 
  AttachRolePolicyCommand,
  CreatePolicyCommand 
} = require('@aws-sdk/client-iam');

class DatabaseSetup {
  constructor(environment = 'dev', region = 'us-east-1') {
    this.environment = environment;
    this.region = region;
    this.tableName = `medeez-${environment}-app`;
    this.bucketName = `medeez-${environment}-attachments-${Date.now()}`;
    this.kmsAlias = `alias/medeez-${environment}-key`;
    
    // Initialize AWS clients
    this.dynamoClient = new DynamoDBClient({ region });
    this.s3Client = new S3Client({ region });
    this.kmsClient = new KMSClient({ region });
    this.ssmClient = new SSMClient({ region });
    this.iamClient = new IAMClient({ region });
    
    this.resources = {};
  }

  async log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async createKMSKey() {
    try {
      this.log('Creating KMS key for encryption...');
      
      const keyPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'Enable IAM User Permissions',
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::${await this.getAccountId()}:root`
            },
            Action: 'kms:*',
            Resource: '*'
          },
          {
            Sid: 'Allow DynamoDB Service',
            Effect: 'Allow',
            Principal: {
              Service: 'dynamodb.amazonaws.com'
            },
            Action: [
              'kms:Decrypt',
              'kms:DescribeKey'
            ],
            Resource: '*'
          },
          {
            Sid: 'Allow S3 Service',
            Effect: 'Allow',
            Principal: {
              Service: 's3.amazonaws.com'
            },
            Action: [
              'kms:Decrypt',
              'kms:DescribeKey',
              'kms:Encrypt',
              'kms:GenerateDataKey*',
              'kms:ReEncrypt*'
            ],
            Resource: '*'
          }
        ]
      };

      const createKeyResult = await this.kmsClient.send(new CreateKeyCommand({
        Description: `Medeez ${this.environment} encryption key`,
        KeyUsage: 'ENCRYPT_DECRYPT',
        KeySpec: 'SYMMETRIC_DEFAULT',
        Origin: 'AWS_KMS',
        MultiRegion: false,
        Policy: JSON.stringify(keyPolicy),
        Tags: [
          { TagKey: 'Environment', TagValue: this.environment },
          { TagKey: 'Project', TagValue: 'Medeez' },
          { TagKey: 'Purpose', TagValue: 'Database Encryption' }
        ]
      }));

      const keyId = createKeyResult.KeyMetadata.KeyId;
      this.resources.kmsKeyId = keyId;
      this.resources.kmsKeyArn = createKeyResult.KeyMetadata.Arn;

      // Create alias
      try {
        await this.kmsClient.send(new CreateAliasCommand({
          AliasName: this.kmsAlias,
          TargetKeyId: keyId
        }));
        this.log(`Created KMS key alias: ${this.kmsAlias}`);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
        this.log('KMS key alias already exists');
      }

      this.log(`Created KMS key: ${keyId}`);
      return keyId;
    } catch (error) {
      this.log(`Error creating KMS key: ${error.message}`);
      throw error;
    }
  }

  async createDynamoDBTable() {
    try {
      this.log('Creating DynamoDB table...');
      
      const tableExists = await this.checkTableExists(this.tableName);
      if (tableExists) {
        this.log(`Table ${this.tableName} already exists`);
        const describeResult = await this.dynamoClient.send(new DescribeTableCommand({
          TableName: this.tableName
        }));
        this.resources.dynamoTableArn = describeResult.Table.TableArn;
        this.resources.dynamoTableName = this.tableName;
        return;
      }

      const createTableParams = {
        TableName: this.tableName,
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
          { Key: 'ManagedBy', Value: 'DatabaseSetup' },
          { Key: 'Compliance', Value: 'HIPAA' }
        ]
      };

      await this.dynamoClient.send(new CreateTableCommand(createTableParams));
      
      // Wait for table to become active
      this.log('Waiting for table to become active...');
      await waitUntilTableExists({ client: this.dynamoClient, maxWaitTime: 300 }, { TableName: this.tableName });
      
      const describeResult = await this.dynamoClient.send(new DescribeTableCommand({
        TableName: this.tableName
      }));
      
      this.resources.dynamoTableArn = describeResult.Table.TableArn;
      this.resources.dynamoTableName = this.tableName;
      this.resources.dynamoStreamArn = describeResult.Table.LatestStreamArn;

      this.log(`Created DynamoDB table: ${this.tableName}`);
    } catch (error) {
      this.log(`Error creating DynamoDB table: ${error.message}`);
      throw error;
    }
  }

  async createS3Bucket() {
    try {
      this.log('Creating S3 bucket...');
      
      const bucketExists = await this.checkBucketExists(this.bucketName);
      if (bucketExists) {
        this.log(`Bucket ${this.bucketName} already exists`);
        this.resources.s3BucketName = this.bucketName;
        this.resources.s3BucketArn = `arn:aws:s3:::${this.bucketName}`;
        return;
      }

      // Create bucket
      const createBucketParams = { Bucket: this.bucketName };
      if (this.region !== 'us-east-1') {
        createBucketParams.CreateBucketConfiguration = {
          LocationConstraint: this.region
        };
      }

      await this.s3Client.send(new CreateBucketCommand(createBucketParams));

      // Enable versioning
      await this.s3Client.send(new PutBucketVersioningCommand({
        Bucket: this.bucketName,
        VersioningConfiguration: { Status: 'Enabled' }
      }));

      // Configure encryption
      await this.s3Client.send(new PutBucketEncryptionCommand({
        Bucket: this.bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [{
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
              KMSMasterKeyID: this.resources.kmsKeyArn
            },
            BucketKeyEnabled: true
          }]
        }
      }));

      // Block public access
      await this.s3Client.send(new PutBucketPublicAccessBlockCommand({
        Bucket: this.bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true
        }
      }));

      this.resources.s3BucketName = this.bucketName;
      this.resources.s3BucketArn = `arn:aws:s3:::${this.bucketName}`;

      this.log(`Created S3 bucket: ${this.bucketName}`);
    } catch (error) {
      this.log(`Error creating S3 bucket: ${error.message}`);
      throw error;
    }
  }

  async storeParameters() {
    try {
      this.log('Storing configuration parameters...');
      
      const parameters = [
        {
          Name: `/medeez/${this.environment}/dynamo/table-name`,
          Value: this.resources.dynamoTableName,
          Description: 'DynamoDB table name',
          Type: 'String'
        },
        {
          Name: `/medeez/${this.environment}/dynamo/table-arn`,
          Value: this.resources.dynamoTableArn,
          Description: 'DynamoDB table ARN',
          Type: 'String'
        },
        {
          Name: `/medeez/${this.environment}/dynamo/stream-arn`,
          Value: this.resources.dynamoStreamArn,
          Description: 'DynamoDB stream ARN',
          Type: 'String'
        },
        {
          Name: `/medeez/${this.environment}/s3/bucket-name`,
          Value: this.resources.s3BucketName,
          Description: 'S3 bucket name for attachments',
          Type: 'String'
        },
        {
          Name: `/medeez/${this.environment}/s3/bucket-arn`,
          Value: this.resources.s3BucketArn,
          Description: 'S3 bucket ARN',
          Type: 'String'
        },
        {
          Name: `/medeez/${this.environment}/kms/key-id`,
          Value: this.resources.kmsKeyId,
          Description: 'KMS key ID for encryption',
          Type: 'String'
        },
        {
          Name: `/medeez/${this.environment}/kms/key-arn`,
          Value: this.resources.kmsKeyArn,
          Description: 'KMS key ARN',
          Type: 'String'
        }
      ];

      for (const param of parameters) {
        await this.ssmClient.send(new PutParameterCommand({
          ...param,
          Overwrite: true,
          Tags: [
            { Key: 'Environment', Value: this.environment },
            { Key: 'Project', Value: 'Medeez' }
          ]
        }));
      }

      this.log('Stored configuration parameters in Parameter Store');
    } catch (error) {
      this.log(`Error storing parameters: ${error.message}`);
      throw error;
    }
  }

  async createIAMRoles() {
    try {
      this.log('Creating IAM roles and policies...');
      
      // Lambda execution role for DynamoDB and S3 access
      const lambdaRoleName = `medeez-${this.environment}-lambda-role`;
      const lambdaPolicyName = `medeez-${this.environment}-lambda-policy`;

      const assumeRolePolicy = {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'lambda.amazonaws.com' },
          Action: 'sts:AssumeRole'
        }]
      };

      try {
        await this.iamClient.send(new CreateRoleCommand({
          RoleName: lambdaRoleName,
          AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
          Description: 'Lambda execution role for Medeez API',
          Tags: [
            { Key: 'Environment', Value: this.environment },
            { Key: 'Project', Value: 'Medeez' }
          ]
        }));

        // Create custom policy for DynamoDB, S3, and KMS access
        const customPolicy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:Query',
                'dynamodb:Scan',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:BatchGetItem',
                'dynamodb:BatchWriteItem',
                'dynamodb:ConditionCheckItem',
                'dynamodb:DescribeTable',
                'dynamodb:DescribeStream',
                'dynamodb:GetRecords',
                'dynamodb:GetShardIterator',
                'dynamodb:ListStreams'
              ],
              Resource: [
                this.resources.dynamoTableArn,
                `${this.resources.dynamoTableArn}/index/*`,
                this.resources.dynamoStreamArn
              ]
            },
            {
              Effect: 'Allow',
              Action: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:GetObjectVersion',
                's3:ListBucket'
              ],
              Resource: [
                this.resources.s3BucketArn,
                `${this.resources.s3BucketArn}/*`
              ]
            },
            {
              Effect: 'Allow',
              Action: [
                'kms:Decrypt',
                'kms:Encrypt',
                'kms:GenerateDataKey*',
                'kms:ReEncrypt*',
                'kms:DescribeKey'
              ],
              Resource: this.resources.kmsKeyArn
            },
            {
              Effect: 'Allow',
              Action: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
              ],
              Resource: 'arn:aws:logs:*:*:*'
            },
            {
              Effect: 'Allow',
              Action: [
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath'
              ],
              Resource: `arn:aws:ssm:${this.region}:*:parameter/medeez/${this.environment}/*`
            }
          ]
        };

        const createPolicyResult = await this.iamClient.send(new CreatePolicyCommand({
          PolicyName: lambdaPolicyName,
          PolicyDocument: JSON.stringify(customPolicy),
          Description: 'Custom policy for Medeez Lambda functions',
          Tags: [
            { Key: 'Environment', Value: this.environment },
            { Key: 'Project', Value: 'Medeez' }
          ]
        }));

        // Attach policies to role
        await this.iamClient.send(new AttachRolePolicyCommand({
          RoleName: lambdaRoleName,
          PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        }));

        await this.iamClient.send(new AttachRolePolicyCommand({
          RoleName: lambdaRoleName,
          PolicyArn: createPolicyResult.Policy.Arn
        }));

        this.resources.lambdaRoleArn = `arn:aws:iam::${await this.getAccountId()}:role/${lambdaRoleName}`;
        this.log(`Created IAM role: ${lambdaRoleName}`);

      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
        this.log('IAM roles already exist');
        this.resources.lambdaRoleArn = `arn:aws:iam::${await this.getAccountId()}:role/${lambdaRoleName}`;
      }

    } catch (error) {
      this.log(`Error creating IAM roles: ${error.message}`);
      throw error;
    }
  }

  async checkTableExists(tableName) {
    try {
      const result = await this.dynamoClient.send(new ListTablesCommand({}));
      return result.TableNames.includes(tableName);
    } catch (error) {
      return false;
    }
  }

  async checkBucketExists(bucketName) {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
      return true;
    } catch (error) {
      return false;
    }
  }

  async getAccountId() {
    // Get account ID from STS (assuming AWS credentials are configured)
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const stsClient = new STSClient({ region: this.region });
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    return identity.Account;
  }

  async setupDatabase() {
    try {
      this.log(`Setting up Medeez v2 database infrastructure for environment: ${this.environment}`);
      this.log(`Region: ${this.region}`);
      this.log('================================================================================');

      const startTime = Date.now();

      // Step 1: Create KMS key for encryption
      await this.createKMSKey();

      // Step 2: Create DynamoDB table with GSIs
      await this.createDynamoDBTable();

      // Step 3: Create S3 bucket for attachments
      await this.createS3Bucket();

      // Step 4: Create IAM roles and policies
      await this.createIAMRoles();

      // Step 5: Store configuration parameters
      await this.storeParameters();

      const duration = (Date.now() - startTime) / 1000;

      this.log('================================================================================');
      this.log(`Database infrastructure setup completed successfully in ${duration.toFixed(2)} seconds!`);
      this.log('');
      this.log('Resources Created:');
      this.log(`  - DynamoDB Table: ${this.resources.dynamoTableName}`);
      this.log(`  - S3 Bucket: ${this.resources.s3BucketName}`);
      this.log(`  - KMS Key: ${this.resources.kmsKeyId}`);
      this.log(`  - Lambda Role: ${this.resources.lambdaRoleArn}`);
      this.log('');
      this.log('Next Steps:');
      this.log('  1. Run seed data generation: node scripts/seed-generator.js generate dev');
      this.log('  2. Test database connectivity');
      this.log('  3. Deploy Lambda functions');
      this.log('  4. Configure API Gateway');

      return {
        success: true,
        duration: duration,
        resources: this.resources,
        environment: this.environment,
        region: this.region
      };

    } catch (error) {
      this.log(`Database setup failed: ${error.message}`);
      throw error;
    }
  }

  async validateSetup() {
    try {
      this.log('Validating database setup...');

      // Check DynamoDB table
      const tableResult = await this.dynamoClient.send(new DescribeTableCommand({
        TableName: this.tableName
      }));

      if (tableResult.Table.TableStatus !== 'ACTIVE') {
        throw new Error(`DynamoDB table is not active: ${tableResult.Table.TableStatus}`);
      }

      // Verify GSIs are active
      const gsiNames = ['GSI1', 'GSI2', 'GSI3', 'GSI4', 'GSI5'];
      const inactiveGSIs = tableResult.Table.GlobalSecondaryIndexes.filter(
        gsi => !gsiNames.includes(gsi.IndexName) || gsi.IndexStatus !== 'ACTIVE'
      );

      if (inactiveGSIs.length > 0) {
        throw new Error(`Some GSIs are not active: ${inactiveGSIs.map(g => g.IndexName).join(', ')}`);
      }

      // Check S3 bucket
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));

      // Verify parameters in Parameter Store
      const requiredParams = [
        `/medeez/${this.environment}/dynamo/table-name`,
        `/medeez/${this.environment}/s3/bucket-name`,
        `/medeez/${this.environment}/kms/key-id`
      ];

      for (const paramName of requiredParams) {
        await this.ssmClient.send(new GetParameterCommand({ Name: paramName }));
      }

      this.log('Database setup validation successful!');
      return true;

    } catch (error) {
      this.log(`Validation failed: ${error.message}`);
      return false;
    }
  }

  async generateCostEstimate() {
    this.log('================================================================================');
    this.log('ESTIMATED MONTHLY COSTS (USD):');
    this.log('================================================================================');
    this.log('');
    this.log('DynamoDB:');
    this.log('  - Table (Pay-per-request): $0.50 - $50.00 depending on usage');
    this.log('  - 5 GSIs (Pay-per-request): $2.50 - $250.00 depending on usage');
    this.log('  - Point-in-time recovery: ~10% of storage costs');
    this.log('  - DynamoDB Streams: $0.02 per 100K read requests');
    this.log('');
    this.log('S3:');
    this.log('  - Standard storage: $0.023 per GB');
    this.log('  - Requests: $0.0004 per 1K PUT, $0.0004 per 10K GET');
    this.log('  - Versioning overhead: ~100% storage increase if enabled');
    this.log('');
    this.log('KMS:');
    this.log('  - Key usage: $0.03 per 10K requests');
    this.log('  - Key storage: $1.00 per month per key');
    this.log('');
    this.log('Typical small clinic (100 patients, 500 appointments/month):');
    this.log('  - DynamoDB: $5-15/month');
    this.log('  - S3: $2-10/month');
    this.log('  - KMS: $1-3/month');
    this.log('  - Total: $8-28/month');
    this.log('');
    this.log('Note: These are estimates. Actual costs depend on usage patterns.');
    this.log('================================================================================');
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const environment = args[1] || process.env.NODE_ENV || 'dev';
  const region = args[2] || process.env.AWS_DEFAULT_REGION || 'us-east-1';

  const setup = new DatabaseSetup(environment, region);

  try {
    switch (command) {
      case 'setup':
        console.log(`Setting up database infrastructure for environment: ${environment}`);
        const result = await setup.setupDatabase();
        await setup.generateCostEstimate();
        console.log('\nSetup completed successfully!');
        break;

      case 'validate':
        console.log(`Validating database setup for environment: ${environment}`);
        const isValid = await setup.validateSetup();
        if (isValid) {
          console.log('Validation passed!');
        } else {
          console.log('Validation failed!');
          process.exit(1);
        }
        break;

      case 'cost':
        await setup.generateCostEstimate();
        break;

      default:
        console.log('Usage: node database-setup.js [command] [environment] [region]');
        console.log('');
        console.log('Commands:');
        console.log('  setup     - Create complete database infrastructure');
        console.log('  validate  - Validate existing database setup');
        console.log('  cost      - Show estimated monthly costs');
        console.log('');
        console.log('Examples:');
        console.log('  node database-setup.js setup dev us-east-1');
        console.log('  node database-setup.js validate prod us-west-2');
        console.log('  node database-setup.js cost');
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

module.exports = DatabaseSetup;