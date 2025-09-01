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
exports.DatabaseStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const s3n = __importStar(require("aws-cdk-lib/aws-s3-notifications"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
class DatabaseStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            this.s3Bucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                principals: [new cdk.aws_iam.ServicePrincipal('s3.amazonaws.com')],
                actions: ['s3:ReplicateObject', 's3:ReplicateDelete'],
                resources: [`${this.backupBucket.bucketArn}/*`],
            }));
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
                KMS_KEY_ID: kmsKey?.keyId || 'default',
                ENVIRONMENT: environment,
            },
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
        });
        // Grant permissions to the S3 event processor
        this.dynamoTable.grantReadWriteData(s3EventProcessor);
        if (kmsKey) {
            kmsKey.grantEncryptDecrypt(s3EventProcessor);
        }
        // Add S3 event notification
        this.s3Bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(s3EventProcessor), { prefix: 'uploads/' });
        this.s3Bucket.addEventNotification(s3.EventType.OBJECT_REMOVED, new s3n.LambdaDestination(s3EventProcessor));
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
        // Grant permissions for DynamoDB Stream access
        this.dynamoTable.grantStreamRead(streamProcessor);
        // Add DynamoDB Stream event source
        streamProcessor.addEventSourceMapping('StreamEventSourceMapping', {
            eventSourceArn: this.dynamoTable.tableStreamArn,
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
            value: this.dynamoTable.tableStreamArn,
            description: 'DynamoDB table stream ARN',
            exportName: `MedeezDynamoTableStreamArn-${environment}`,
        });
    }
}
exports.DatabaseStack = DatabaseStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YWJhc2Utc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9kYXRhYmFzZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsbUVBQXFEO0FBQ3JELHVEQUF5QztBQUN6QyxzRUFBd0Q7QUFDeEQsK0RBQWlEO0FBRWpELHlEQUEyQztBQVUzQyxNQUFhLGFBQWMsU0FBUSxHQUFHLENBQUMsS0FBSztJQUsxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QywwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN6RCxTQUFTLEVBQUUsVUFBVSxXQUFXLE1BQU07WUFDdEMsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxJQUFJO2dCQUNWLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxPQUFPLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLElBQUk7Z0JBQ1YsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELFdBQVcsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsS0FBSyxpQkFBaUI7Z0JBQzVELENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7Z0JBQ3RDLENBQUMsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFdBQVc7WUFDcEMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVTtnQkFDcEMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxl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LHlCQUF5QixXQUFXLEVBQUU7U0FDbkQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdEMsS0FBSyxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVTtZQUMvQixXQUFXLEVBQUUsZ0NBQWdDO1lBQzdDLFVBQVUsRUFBRSxzQkFBc0IsV0FBVyxFQUFFO1NBQ2hELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsY0FBZTtZQUN2QyxXQUFXLEVBQUUsMkJBQTJCO1lBQ3hDLFVBQVUsRUFBRSw4QkFBOEIsV0FBVyxFQUFFO1NBQ3hELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTdURCxzQ0E2VEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzM24gZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLW5vdGlmaWNhdGlvbnMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMga21zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1rbXMnO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuaW50ZXJmYWNlIERhdGFiYXNlU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZztcbiAga21zS2V5Pzoga21zLklLZXk7XG59XG5cbmV4cG9ydCBjbGFzcyBEYXRhYmFzZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGR5bmFtb1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IHMzQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBiYWNrdXBCdWNrZXQ6IHMzLkJ1Y2tldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGF0YWJhc2VTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBjb25maWcsIGttc0tleSB9ID0gcHJvcHM7XG5cbiAgICAvLyBEeW5hbW9EQiBUYWJsZSB3aXRoIHNpbmdsZS10YWJsZSBkZXNpZ25cbiAgICB0aGlzLmR5bmFtb1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdNZWRlZXpUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1hcHBgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdQSycsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ1NLJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGNvbmZpZy5keW5hbW9kYi5iaWxsaW5nTW9kZSA9PT0gJ1BBWV9QRVJfUkVRVUVTVCcgXG4gICAgICAgID8gZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNUIFxuICAgICAgICA6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBST1ZJU0lPTkVELFxuICAgICAgZW5jcnlwdGlvbjogY29uZmlnLmR5bmFtb2RiLmVuY3J5cHRpb24gXG4gICAgICAgID8gZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkNVU1RPTUVSX01BTkFHRUQgXG4gICAgICAgIDogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkRFRkFVTFQsXG4gICAgICBlbmNyeXB0aW9uS2V5OiBjb25maWcuZHluYW1vZGIuZW5jcnlwdGlvbiA/IGttc0tleSA6IHVuZGVmaW5lZCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGNvbmZpZy5keW5hbW9kYi5wb2ludEluVGltZVJlY292ZXJ5LFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiAndHRsJyxcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxuICAgIH0pO1xuXG4gICAgLy8gR1NJMSAtIEJ5RW50aXR5VHlwZSBmb3IgYWRtaW4gcXVlcmllc1xuICAgIHRoaXMuZHluYW1vVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnR1NJMScsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ0dTSTFQSycsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ0dTSTFTSycsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBHU0kyIC0gQnlQYXRpZW50IGZvciBwYXRpZW50IGhpc3RvcnlcbiAgICB0aGlzLmR5bmFtb1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ0dTSTInLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdHU0kyUEsnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdHU0kyU0snLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLy8gR1NJMyAtIEJ5UHJvdmlkZXJUaW1lIGZvciBjYWxlbmRhciBxdWVyaWVzXG4gICAgdGhpcy5keW5hbW9UYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdHU0kzJyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnR1NJM1BLJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnR1NJM1NLJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIEdTSTQgLSBCeVN0YXR1cyBmb3IgaW52b2ljZXMgYW5kIGNsYWltcyB3b3JrbGlzdHNcbiAgICB0aGlzLmR5bmFtb1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ0dTSTQnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdHU0k0UEsnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdHU0k0U0snLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLy8gR1NJNSAtIEJ5RXh0ZXJuYWxJZCBmb3IgdGhpcmQtcGFydHkgaW50ZWdyYXRpb25zXG4gICAgdGhpcy5keW5hbW9UYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdHU0k1JyxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAnR1NJNVBLJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnR1NJNVNLJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgYXR0YWNobWVudHMgYW5kIGZpbGUgc3RvcmFnZVxuICAgIHRoaXMuczNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdNZWRlZXpCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWF0dGFjaG1lbnRzLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLktNUyxcbiAgICAgIGVuY3J5cHRpb25LZXk6IGttc0tleSxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBlbmZvcmNlU1NMOiB0cnVlLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlSW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZHMnLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnVHJhbnNpdGlvblRvSUEnLFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLklORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLkdMQUNJRVIsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGNvcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBbXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5HRVQsXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QT1NULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUFVULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuREVMRVRFLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcbiAgICAgICAgICAgIGBodHRwczovLyR7Y29uZmlnLmRvbWFpbk5hbWV9YCxcbiAgICAgICAgICAgIGBodHRwczovL3d3dy4ke2NvbmZpZy5kb21haW5OYW1lfWAsXG4gICAgICAgICAgICBgaHR0cHM6Ly9ib29rLiR7Y29uZmlnLmRvbWFpbk5hbWV9YCxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBTMyBCdWNrZXQgZm9yIGJhY2t1cHMgKGlmIGNyb3NzLXJlZ2lvbiByZXBsaWNhdGlvbiBpcyBlbmFibGVkKVxuICAgIGlmIChjb25maWcuYmFja3VwLmNyb3NzUmVnaW9uUmVwbGljYXRpb24gJiYgY29uZmlnLmJhY2t1cC5iYWNrdXBSZWdpb24pIHtcbiAgICAgIHRoaXMuYmFja3VwQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnTWVkZWV6QmFja3VwQnVja2V0Jywge1xuICAgICAgICBidWNrZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWJhY2t1cC0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLktNUyxcbiAgICAgICAgZW5jcnlwdGlvbktleToga21zS2V5LFxuICAgICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICAgIGVuZm9yY2VTU0w6IHRydWUsXG4gICAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6ICdSZXRlbnRpb25Qb2xpY3knLFxuICAgICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoY29uZmlnLmJhY2t1cC5yZXRlbnRpb25EYXlzKSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDcm9zcy1yZWdpb24gcmVwbGljYXRpb25cbiAgICAgIHRoaXMuczNCdWNrZXQuYWRkVG9SZXNvdXJjZVBvbGljeShcbiAgICAgICAgbmV3IGNkay5hd3NfaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgZWZmZWN0OiBjZGsuYXdzX2lhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgcHJpbmNpcGFsczogW25ldyBjZGsuYXdzX2lhbS5TZXJ2aWNlUHJpbmNpcGFsKCdzMy5hbWF6b25hd3MuY29tJyldLFxuICAgICAgICAgIGFjdGlvbnM6IFsnczM6UmVwbGljYXRlT2JqZWN0JywgJ3MzOlJlcGxpY2F0ZURlbGV0ZSddLFxuICAgICAgICAgIHJlc291cmNlczogW2Ake3RoaXMuYmFja3VwQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gZm9yIFMzIGV2ZW50IHByb2Nlc3NpbmdcbiAgICBjb25zdCBzM0V2ZW50UHJvY2Vzc29yID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUzNFdmVudFByb2Nlc3NvcicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1zMy1wcm9jZXNzb3JgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbiAgICAgICAgZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1MzIEV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gICAgICAgICAgXG4gICAgICAgICAgZm9yIChjb25zdCByZWNvcmQgb2YgZXZlbnQuUmVjb3Jkcykge1xuICAgICAgICAgICAgY29uc3QgYnVja2V0ID0gcmVjb3JkLnMzLmJ1Y2tldC5uYW1lO1xuICAgICAgICAgICAgY29uc3Qga2V5ID0gcmVjb3JkLnMzLm9iamVjdC5rZXk7XG4gICAgICAgICAgICBjb25zdCBldmVudE5hbWUgPSByZWNvcmQuZXZlbnROYW1lO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcXGBQcm9jZXNzaW5nIFxcJHtldmVudE5hbWV9IGZvciBcXCR7YnVja2V0fS9cXCR7a2V5fVxcYCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEFkZCB5b3VyIGN1c3RvbSBsb2dpYyBoZXJlIGZvcjpcbiAgICAgICAgICAgIC8vIC0gSW1hZ2UgcHJvY2Vzc2luZy90aHVtYm5haWxzXG4gICAgICAgICAgICAvLyAtIFBERiBnZW5lcmF0aW9uXG4gICAgICAgICAgICAvLyAtIFZpcnVzIHNjYW5uaW5nXG4gICAgICAgICAgICAvLyAtIEF1ZGl0IGxvZ2dpbmdcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHsgc3RhdHVzQ29kZTogMjAwLCBib2R5OiAnUHJvY2Vzc2VkIHN1Y2Nlc3NmdWxseScgfTtcbiAgICAgICAgfTtcbiAgICAgIGApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRFlOQU1PX1RBQkxFX05BTUU6IHRoaXMuZHluYW1vVGFibGUudGFibGVOYW1lLFxuICAgICAgICBLTVNfS0VZX0lEOiBrbXNLZXk/LmtleUlkIHx8ICdkZWZhdWx0JyxcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgdG8gdGhlIFMzIGV2ZW50IHByb2Nlc3NvclxuICAgIHRoaXMuZHluYW1vVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHMzRXZlbnRQcm9jZXNzb3IpO1xuICAgIGlmIChrbXNLZXkpIHtcbiAgICAgIGttc0tleS5ncmFudEVuY3J5cHREZWNyeXB0KHMzRXZlbnRQcm9jZXNzb3IpO1xuICAgIH1cblxuICAgIC8vIEFkZCBTMyBldmVudCBub3RpZmljYXRpb25cbiAgICB0aGlzLnMzQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxuICAgICAgbmV3IHMzbi5MYW1iZGFEZXN0aW5hdGlvbihzM0V2ZW50UHJvY2Vzc29yKSxcbiAgICAgIHsgcHJlZml4OiAndXBsb2Fkcy8nIH1cbiAgICApO1xuXG4gICAgdGhpcy5zM0J1Y2tldC5hZGRFdmVudE5vdGlmaWNhdGlvbihcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfUkVNT1ZFRCxcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24oczNFdmVudFByb2Nlc3NvcilcbiAgICApO1xuXG4gICAgLy8gRHluYW1vREIgU3RyZWFtIHByb2Nlc3NvciBmb3IgYXVkaXQgbG9nZ2luZ1xuICAgIGNvbnN0IHN0cmVhbVByb2Nlc3NvciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1N0cmVhbVByb2Nlc3NvcicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1zdHJlYW0tcHJvY2Vzc29yYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG4gICAgICAgIGV4cG9ydHMuaGFuZGxlciA9IGFzeW5jIChldmVudCkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdEeW5hbW9EQiBTdHJlYW0gRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgICAgICAgICBcbiAgICAgICAgICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgICAgICAgICBjb25zdCBldmVudE5hbWUgPSByZWNvcmQuZXZlbnROYW1lO1xuICAgICAgICAgICAgY29uc3QgZHluYW1vZGIgPSByZWNvcmQuZHluYW1vZGI7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxcYFByb2Nlc3NpbmcgXFwke2V2ZW50TmFtZX0gZXZlbnRcXGApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBBZGQgeW91ciBjdXN0b20gbG9naWMgaGVyZSBmb3I6XG4gICAgICAgICAgICAvLyAtIEF1ZGl0IGxvZ2dpbmdcbiAgICAgICAgICAgIC8vIC0gQ2hhbmdlIG5vdGlmaWNhdGlvbnNcbiAgICAgICAgICAgIC8vIC0gU2VhcmNoIGluZGV4IHVwZGF0ZXNcbiAgICAgICAgICAgIC8vIC0gQW5hbHl0aWNzIGV2ZW50c1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4geyBiYXRjaEl0ZW1GYWlsdXJlczogW10gfTtcbiAgICAgICAgfTtcbiAgICAgIGApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnMgZm9yIER5bmFtb0RCIFN0cmVhbSBhY2Nlc3NcbiAgICB0aGlzLmR5bmFtb1RhYmxlLmdyYW50U3RyZWFtUmVhZChzdHJlYW1Qcm9jZXNzb3IpO1xuXG4gICAgLy8gQWRkIER5bmFtb0RCIFN0cmVhbSBldmVudCBzb3VyY2VcbiAgICBzdHJlYW1Qcm9jZXNzb3IuYWRkRXZlbnRTb3VyY2VNYXBwaW5nKCdTdHJlYW1FdmVudFNvdXJjZU1hcHBpbmcnLCB7XG4gICAgICBldmVudFNvdXJjZUFybjogdGhpcy5keW5hbW9UYWJsZS50YWJsZVN0cmVhbUFybiEsXG4gICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5UUklNX0hPUklaT04sXG4gICAgICBiYXRjaFNpemU6IDEwLFxuICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgcmV0cnlBdHRlbXB0czogMyxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIGNvbmZpZ3VyYXRpb24gaW4gUGFyYW1ldGVyIFN0b3JlXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0R5bmFtb1RhYmxlTmFtZVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2R5bmFtby90YWJsZS1uYW1lYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiB0aGlzLmR5bmFtb1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnUzNCdWNrZXROYW1lUGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9tZWRlZXovJHtlbnZpcm9ubWVudH0vczMvYnVja2V0LW5hbWVgLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMuczNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IG5hbWUgZm9yIGF0dGFjaG1lbnRzJyxcbiAgICB9KTtcblxuICAgIGlmICh0aGlzLmJhY2t1cEJ1Y2tldCkge1xuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0JhY2t1cEJ1Y2tldE5hbWVQYXJhbWV0ZXInLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L3MzL2JhY2t1cC1idWNrZXQtbmFtZWAsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiB0aGlzLmJhY2t1cEJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1MzIGJhY2t1cCBidWNrZXQgbmFtZScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0R5bmFtb1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmR5bmFtb1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZScsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6RHluYW1vVGFibGVOYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTM0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zM0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBidWNrZXQgbmFtZSBmb3IgYXR0YWNobWVudHMnLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlelMzQnVja2V0TmFtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRHluYW1vVGFibGVTdHJlYW1Bcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5keW5hbW9UYWJsZS50YWJsZVN0cmVhbUFybiEsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIHN0cmVhbSBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlekR5bmFtb1RhYmxlU3RyZWFtQXJuLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcbiAgfVxufSJdfQ==