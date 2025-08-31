import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface DatabaseStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
  kmsKey: kms.Key;
}

export class DatabaseStack extends cdk.Stack {
  public readonly dynamoTable: dynamodb.Table;
  public readonly s3Bucket: s3.Bucket;
  public readonly backupBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { environment, config, kmsKey } = props;

    // DynamoDB Table with single-table design
    this.dynamoTable = new dynamodb.Table(this, 'MedeezTable', {
      tableName: `medeez-${environment}-app`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: config.dynamodb.billingMode === 'PAY_PER_REQUEST' 
        ? dynamodb.BillingMode.PAY_PER_REQUEST 
        : dynamodb.BillingMode.PROVISIONED,
      encryption: config.dynamodb.encryption 
        ? dynamodb.TableEncryption.CUSTOMER_MANAGED 
        : dynamodb.TableEncryption.DEFAULT,
      encryptionKey: config.dynamodb.encryption ? kmsKey : undefined,
      pointInTimeRecovery: config.dynamodb.pointInTimeRecovery,
      contributorInsightsEnabled: environment === 'prod',
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI1 - ByEntityType for admin queries
    this.dynamoTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2 - ByPatient for patient history
    this.dynamoTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3 - ByProviderTime for calendar queries
    this.dynamoTable.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: {
        name: 'GSI3PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI3SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI4 - ByStatus for invoices and claims worklists
    this.dynamoTable.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: {
        name: 'GSI4PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI4SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI5 - ByExternalId for third-party integrations
    this.dynamoTable.addGlobalSecondaryIndex({
      indexName: 'GSI5',
      partitionKey: {
        name: 'GSI5PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI5SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // S3 Bucket for attachments and file storage
    this.s3Bucket = new s3.Bucket(this, 'MedeezBucket', {
      bucketName: `medeez-${environment}-attachments-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      intelligentTieringConfigurations: [
        {
          id: 'EntireBucket',
          status: s3.IntelligentTieringStatus.ENABLED,
        },
      ],
      lifecycleRules: [
        {
          id: 'DeleteIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: [
            `https://${config.domainName}`,
            `https://www.${config.domainName}`,
            `https://book.${config.domainName}`,
          ],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      notificationsHandlerRole: cdk.Arn.format({
        service: 'iam',
        resource: 'role',
        resourceName: 'service-role/LambdaNotificationsRole',
      }, this),
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // S3 Bucket for backups (if cross-region replication is enabled)
    if (config.backup.crossRegionReplication && config.backup.backupRegion) {
      this.backupBucket = new s3.Bucket(this, 'MedeezBackupBucket', {
        bucketName: `medeez-${environment}-backup-${this.account}`,
        encryption: s3.BucketEncryption.KMS,
        encryptionKey: kmsKey,
        versioned: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        enforceSSL: true,
        lifecycleRules: [
          {
            id: 'RetentionPolicy',
            expiration: cdk.Duration.days(config.backup.retentionDays),
          },
        ],
        removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      });

      // Cross-region replication
      this.s3Bucket.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          principals: [new cdk.aws_iam.ServicePrincipal('s3.amazonaws.com')],
          actions: ['s3:ReplicateObject', 's3:ReplicateDelete'],
          resources: [`${this.backupBucket.bucketArn}/*`],
        })
      );
    }

    // Lambda function for S3 event processing
    const s3EventProcessor = new lambda.Function(this, 'S3EventProcessor', {
      functionName: `medeez-${environment}-s3-processor`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('S3 Event:', JSON.stringify(event, null, 2));
          
          for (const record of event.Records) {
            const bucket = record.s3.bucket.name;
            const key = record.s3.object.key;
            const eventName = record.eventName;
            
            console.log(\`Processing \${eventName} for \${bucket}/\${key}\`);
            
            // Add your custom logic here for:
            // - Image processing/thumbnails
            // - PDF generation
            // - Virus scanning
            // - Audit logging
          }
          
          return { statusCode: 200, body: 'Processed successfully' };
        };
      `),
      environment: {
        DYNAMO_TABLE_NAME: this.dynamoTable.tableName,
        KMS_KEY_ID: kmsKey.keyId,
        ENVIRONMENT: environment,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // Grant permissions to the S3 event processor
    this.dynamoTable.grantReadWriteData(s3EventProcessor);
    kmsKey.grantEncryptDecrypt(s3EventProcessor);

    // Add S3 event notification
    this.s3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(s3EventProcessor),
      { prefix: 'uploads/' }
    );

    this.s3Bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.LambdaDestination(s3EventProcessor)
    );

    // DynamoDB Stream processor for audit logging
    const streamProcessor = new lambda.Function(this, 'StreamProcessor', {
      functionName: `medeez-${environment}-stream-processor`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('DynamoDB Stream Event:', JSON.stringify(event, null, 2));
          
          for (const record of event.Records) {
            const eventName = record.eventName;
            const dynamodb = record.dynamodb;
            
            console.log(\`Processing \${eventName} event\`);
            
            // Add your custom logic here for:
            // - Audit logging
            // - Change notifications
            // - Search index updates
            // - Analytics events
          }
          
          return { batchItemFailures: [] };
        };
      `),
      environment: {
        ENVIRONMENT: environment,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });

    // Add DynamoDB Stream event source
    streamProcessor.addEventSourceMapping('StreamEventSourceMapping', {
      eventSourceArn: this.dynamoTable.tableStreamArn!,
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.seconds(5),
      retryAttempts: 3,
    });

    // Store configuration in Parameter Store
    new ssm.StringParameter(this, 'DynamoTableNameParameter', {
      parameterName: `/medeez/${environment}/dynamo/table-name`,
      stringValue: this.dynamoTable.tableName,
      description: 'DynamoDB table name',
    });

    new ssm.StringParameter(this, 'S3BucketNameParameter', {
      parameterName: `/medeez/${environment}/s3/bucket-name`,
      stringValue: this.s3Bucket.bucketName,
      description: 'S3 bucket name for attachments',
    });

    if (this.backupBucket) {
      new ssm.StringParameter(this, 'BackupBucketNameParameter', {
        parameterName: `/medeez/${environment}/s3/backup-bucket-name`,
        stringValue: this.backupBucket.bucketName,
        description: 'S3 backup bucket name',
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'DynamoTableName', {
      value: this.dynamoTable.tableName,
      description: 'DynamoDB table name',
      exportName: `MedeezDynamoTableName-${environment}`,
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: this.s3Bucket.bucketName,
      description: 'S3 bucket name for attachments',
      exportName: `MedeezS3BucketName-${environment}`,
    });

    new cdk.CfnOutput(this, 'DynamoTableStreamArn', {
      value: this.dynamoTable.tableStreamArn!,
      description: 'DynamoDB table stream ARN',
      exportName: `MedeezDynamoTableStreamArn-${environment}`,
    });
  }
}