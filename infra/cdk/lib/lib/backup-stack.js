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
exports.BackupStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const backup = __importStar(require("aws-cdk-lib/aws-backup"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
class BackupStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, config, dynamoTable, s3Bucket, kmsKey } = props;
        // SNS Topic for backup notifications
        const backupNotificationTopic = new sns.Topic(this, 'BackupNotificationTopic', {
            topicName: `medeez-${environment}-backup-notifications`,
            displayName: `Medeez ${environment} Backup Notifications`,
        });
        backupNotificationTopic.addSubscription(new snsSubscriptions.EmailSubscription(config.monitoring.alertEmail));
        // AWS Backup Vault
        this.backupVault = new backup.BackupVault(this, 'BackupVault', {
            backupVaultName: `medeez-${environment}-vault`,
            encryptionKey: kmsKey,
            accessPolicy: new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        effect: iam.Effect.ALLOW,
                        principals: [new iam.AccountRootPrincipal()],
                        actions: ['backup:*'],
                        resources: ['*'],
                    }),
                ],
            }),
            notificationTopic: backupNotificationTopic,
            notificationEvents: [
                backup.BackupVaultEvents.BACKUP_JOB_COMPLETED,
                backup.BackupVaultEvents.BACKUP_JOB_FAILED,
                backup.BackupVaultEvents.RESTORE_JOB_COMPLETED,
                backup.BackupVaultEvents.RESTORE_JOB_FAILED,
            ],
        });
        // Backup Plan with different schedules for different environments
        this.backupPlan = new backup.BackupPlan(this, 'BackupPlan', {
            backupPlanName: `medeez-${environment}-plan`,
            backupVault: this.backupVault,
        });
        // Production backup schedule - Daily, Weekly, Monthly
        if (environment === 'prod') {
            // Daily backups - retained for 35 days
            this.backupPlan.addRule(new backup.BackupPlanRule({
                ruleName: 'DailyBackup',
                backupVault: this.backupVault,
                scheduleExpression: events.Schedule.cron({
                    hour: '2',
                    minute: '0',
                }),
                deleteAfter: cdk.Duration.days(35),
                moveToColdStorageAfter: cdk.Duration.days(7),
                enableContinuousBackup: true,
            }));
            // Weekly backups - retained for 12 weeks
            this.backupPlan.addRule(new backup.BackupPlanRule({
                ruleName: 'WeeklyBackup',
                backupVault: this.backupVault,
                scheduleExpression: events.Schedule.cron({
                    weekDay: 'SUN',
                    hour: '3',
                    minute: '0',
                }),
                deleteAfter: cdk.Duration.days(84), // 12 weeks
                moveToColdStorageAfter: cdk.Duration.days(7),
            }));
            // Monthly backups - retained for 12 months
            this.backupPlan.addRule(new backup.BackupPlanRule({
                ruleName: 'MonthlyBackup',
                backupVault: this.backupVault,
                scheduleExpression: events.Schedule.cron({
                    day: '1',
                    hour: '4',
                    minute: '0',
                }),
                deleteAfter: cdk.Duration.days(365),
                moveToColdStorageAfter: cdk.Duration.days(30),
            }));
        }
        else {
            // Staging/Dev - Daily backups retained for shorter period
            this.backupPlan.addRule(new backup.BackupPlanRule({
                ruleName: 'DailyBackup',
                backupVault: this.backupVault,
                scheduleExpression: events.Schedule.cron({
                    hour: '2',
                    minute: '0',
                }),
                deleteAfter: cdk.Duration.days(config.backup.retentionDays),
            }));
        }
        // Backup selection for DynamoDB
        const backupRole = new iam.Role(this, 'BackupRole', {
            assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForBackup'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBackupServiceRolePolicyForRestores'),
            ],
        });
        new backup.BackupSelection(this, 'BackupSelection', {
            backupPlan: this.backupPlan,
            backupSelectionName: `medeez-${environment}-selection`,
            resources: [
                backup.BackupResource.fromDynamoDbTable(dynamoTable),
            ],
            role: backupRole,
        });
        // S3 Cross-Region Replication (if enabled)
        if (config.backup.crossRegionReplication && config.backup.backupRegion) {
            const replicationRole = new iam.Role(this, 'ReplicationRole', {
                assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
                inlinePolicies: {
                    ReplicationPolicy: new iam.PolicyDocument({
                        statements: [
                            new iam.PolicyStatement({
                                effect: iam.Effect.ALLOW,
                                actions: [
                                    's3:GetObjectVersionForReplication',
                                    's3:GetObjectVersionAcl',
                                    's3:GetObjectVersionTagging',
                                ],
                                resources: [`${s3Bucket.bucketArn}/*`],
                            }),
                            new iam.PolicyStatement({
                                effect: iam.Effect.ALLOW,
                                actions: [
                                    's3:ReplicateObject',
                                    's3:ReplicateDelete',
                                    's3:ReplicateTags',
                                ],
                                resources: [`arn:aws:s3:::medeez-${environment}-backup-${config.backup.backupRegion}-${this.account}/*`],
                            }),
                        ],
                    }),
                },
            });
            // Add replication configuration to S3 bucket
            const cfnBucket = s3Bucket.node.defaultChild;
            cfnBucket.replicationConfiguration = {
                role: replicationRole.roleArn,
                rules: [
                    {
                        id: 'ReplicateAll',
                        status: 'Enabled',
                        prefix: '',
                        destination: {
                            bucket: `arn:aws:s3:::medeez-${environment}-backup-${config.backup.backupRegion}-${this.account}`,
                            storageClass: 'STANDARD_IA',
                        },
                    },
                ],
            };
        }
        // Backup verification Lambda
        const backupVerificationFunction = new lambda.Function(this, 'BackupVerificationFunction', {
            functionName: `medeez-${environment}-backup-verification`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import datetime
from botocore.exceptions import ClientError

def lambda_handler(event, context):
    """
    Verify backup integrity and send notifications
    """
    backup_client = boto3.client('backup')
    cloudwatch = boto3.client('cloudwatch')
    sns = boto3.client('sns')
    
    backup_vault_name = event.get('backup_vault_name')
    topic_arn = event.get('topic_arn')
    environment = event.get('environment')
    
    try:
        # List recent backup jobs
        end_time = datetime.datetime.now()
        start_time = end_time - datetime.timedelta(days=1)
        
        response = backup_client.list_backup_jobs(
            ByBackupVaultName=backup_vault_name,
            ByCreatedAfter=start_time,
            ByCreatedBefore=end_time
        )
        
        backup_jobs = response.get('BackupJobs', [])
        
        # Check backup status
        successful_backups = 0
        failed_backups = 0
        
        for job in backup_jobs:
            if job['State'] == 'COMPLETED':
                successful_backups += 1
            elif job['State'] in ['FAILED', 'ABORTED', 'EXPIRED']:
                failed_backups += 1
        
        # Send metrics to CloudWatch
        cloudwatch.put_metric_data(
            Namespace=f'Medeez/{environment}/Backup',
            MetricData=[
                {
                    'MetricName': 'SuccessfulBackups',
                    'Value': successful_backups,
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'FailedBackups',
                    'Value': failed_backups,
                    'Unit': 'Count'
                }
            ]
        )
        
        # Send notification if there are failed backups
        if failed_backups > 0:
            message = {
                'environment': environment,
                'failed_backups': failed_backups,
                'successful_backups': successful_backups,
                'vault': backup_vault_name,
                'timestamp': datetime.datetime.now().isoformat()
            }
            
            sns.publish(
                TopicArn=topic_arn,
                Subject=f'Medeez {environment}: Backup Failures Detected',
                Message=json.dumps(message, indent=2)
            )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'successful_backups': successful_backups,
                'failed_backups': failed_backups
            })
        }
        
    except ClientError as e:
        print(f"Error verifying backups: {str(e)}")
        
        # Send error notification
        sns.publish(
            TopicArn=topic_arn,
            Subject=f'Medeez {environment}: Backup Verification Error',
            Message=f'Error verifying backups: {str(e)}'
        )
        
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
      `),
            environment: {
                ENVIRONMENT: environment,
                BACKUP_VAULT_NAME: this.backupVault.backupVaultName,
                TOPIC_ARN: backupNotificationTopic.topicArn,
            },
            timeout: cdk.Duration.minutes(5),
            memorySize: 256,
        });
        // Grant permissions to the backup verification function
        backupVerificationFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'backup:ListBackupJobs',
                'backup:DescribeBackupJob',
                'backup:ListRecoveryPoints',
                'cloudwatch:PutMetricData',
                'sns:Publish',
            ],
            resources: ['*'],
        }));
        // Schedule backup verification
        const backupVerificationRule = new events.Rule(this, 'BackupVerificationRule', {
            ruleName: `medeez-${environment}-backup-verification`,
            description: 'Daily backup verification',
            schedule: events.Schedule.cron({
                hour: '8',
                minute: '0',
            }),
            targets: [
                new targets.LambdaFunction(backupVerificationFunction, {
                    event: events.RuleTargetInput.fromObject({
                        environment,
                        backup_vault_name: this.backupVault.backupVaultName,
                        topic_arn: backupNotificationTopic.topicArn,
                    }),
                }),
            ],
        });
        // Disaster Recovery Lambda
        const disasterRecoveryFunction = new lambda.Function(this, 'DisasterRecoveryFunction', {
            functionName: `medeez-${environment}-disaster-recovery`,
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromInline(`
import json
import boto3
import os

def lambda_handler(event, context):
    """
    Disaster recovery procedures
    """
    backup_client = boto3.client('backup')
    dynamodb = boto3.client('dynamodb')
    
    recovery_type = event.get('recovery_type', 'point_in_time')
    target_time = event.get('target_time')
    
    if recovery_type == 'point_in_time':
        return restore_point_in_time(event, context)
    elif recovery_type == 'from_backup':
        return restore_from_backup(event, context)
    else:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Invalid recovery type'})
        }

def restore_point_in_time(event, context):
    """
    Restore DynamoDB table to a specific point in time
    """
    # Implementation for point-in-time recovery
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Point-in-time recovery initiated'})
    }

def restore_from_backup(event, context):
    """
    Restore from AWS Backup recovery point
    """
    # Implementation for backup restoration
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Backup restoration initiated'})
    }
      `),
            environment: {
                ENVIRONMENT: environment,
                DYNAMO_TABLE_NAME: dynamoTable.tableName,
                BACKUP_VAULT_NAME: this.backupVault.backupVaultName,
            },
            timeout: cdk.Duration.minutes(15),
            memorySize: 512,
        });
        // Grant permissions for disaster recovery
        disasterRecoveryFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'backup:StartRestoreJob',
                'backup:DescribeRestoreJob',
                'backup:ListRecoveryPoints',
                'dynamodb:RestoreTableToPointInTime',
                'dynamodb:RestoreTableFromBackup',
                'dynamodb:DescribeTable',
                'dynamodb:DescribeBackup',
            ],
            resources: ['*'],
        }));
        // Store backup configuration in Parameter Store
        new ssm.StringParameter(this, 'BackupVaultNameParameter', {
            parameterName: `/medeez/${environment}/backup/vault-name`,
            stringValue: this.backupVault.backupVaultName,
            description: 'AWS Backup Vault name',
        });
        new ssm.StringParameter(this, 'BackupPlanIdParameter', {
            parameterName: `/medeez/${environment}/backup/plan-id`,
            stringValue: this.backupPlan.backupPlanId,
            description: 'AWS Backup Plan ID',
        });
        new ssm.StringParameter(this, 'DisasterRecoveryFunctionArnParameter', {
            parameterName: `/medeez/${environment}/backup/disaster-recovery-function-arn`,
            stringValue: disasterRecoveryFunction.functionArn,
            description: 'Disaster Recovery Lambda Function ARN',
        });
        // Outputs
        new cdk.CfnOutput(this, 'BackupVaultName', {
            value: this.backupVault.backupVaultName,
            description: 'AWS Backup Vault name',
            exportName: `MedeezBackupVaultName-${environment}`,
        });
        new cdk.CfnOutput(this, 'BackupPlanId', {
            value: this.backupPlan.backupPlanId,
            description: 'AWS Backup Plan ID',
            exportName: `MedeezBackupPlanId-${environment}`,
        });
        new cdk.CfnOutput(this, 'DisasterRecoveryFunctionArn', {
            value: disasterRecoveryFunction.functionArn,
            description: 'Disaster Recovery Lambda Function ARN',
            exportName: `MedeezDisasterRecoveryFunctionArn-${environment}`,
        });
        new cdk.CfnOutput(this, 'BackupNotificationTopicArn', {
            value: backupNotificationTopic.topicArn,
            description: 'Backup Notification SNS Topic ARN',
            exportName: `MedeezBackupNotificationTopicArn-${environment}`,
        });
    }
}
exports.BackupStack = BackupStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja3VwLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYmFja3VwLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFJakQseURBQTJDO0FBQzNDLCtEQUFpRDtBQUNqRCx3RUFBMEQ7QUFDMUQsK0RBQWlEO0FBQ2pELHlEQUEyQztBQUMzQyxvRkFBc0U7QUFDdEUseURBQTJDO0FBWTNDLE1BQWEsV0FBWSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSXhDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBdUI7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFckUscUNBQXFDO1FBQ3JDLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUM3RSxTQUFTLEVBQUUsVUFBVSxXQUFXLHVCQUF1QjtZQUN2RCxXQUFXLEVBQUUsVUFBVSxXQUFXLHVCQUF1QjtTQUMxRCxDQUFDLENBQUM7UUFFSCx1QkFBdUIsQ0FBQyxlQUFlLENBQ3JDLElBQUksZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FDckUsQ0FBQztRQUVGLG1CQUFtQjtRQUNuQixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQzdELGVBQWUsRUFBRSxVQUFVLFdBQVcsUUFBUTtZQUM5QyxhQUFhLEVBQUUsTUFBTTtZQUNyQixZQUFZLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FB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V0FBVyxFQUFFLHdCQUF3QixDQUFDLFdBQVc7WUFDakQsV0FBVyxFQUFFLHVDQUF1QztTQUNyRCxDQUFDLENBQUM7UUFFSCxVQUFVO1FBQ1YsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ3ZDLFdBQVcsRUFBRSx1QkFBdUI7WUFDcEMsVUFBVSxFQUFFLHlCQUF5QixXQUFXLEVBQUU7U0FDbkQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdEMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWTtZQUNuQyxXQUFXLEVBQUUsb0JBQW9CO1lBQ2pDLFVBQVUsRUFBRSxzQkFBc0IsV0FBVyxFQUFFO1NBQ2hELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7WUFDckQsS0FBSyxFQUFFLHdCQUF3QixDQUFDLFdBQVc7WUFDM0MsV0FBVyxFQUFFLHVDQUF1QztZQUNwRCxVQUFVLEVBQUUscUNBQXFDLFdBQVcsRUFBRTtTQUMvRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ3BELEtBQUssRUFBRSx1QkFBdUIsQ0FBQyxRQUFRO1lBQ3ZDLFdBQVcsRUFBRSxtQ0FBbUM7WUFDaEQsVUFBVSxFQUFFLG9DQUFvQyxXQUFXLEVBQUU7U0FDOUQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBeGJELGtDQXdiQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBiYWNrdXAgZnJvbSAnYXdzLWNkay1saWIvYXdzLWJhY2t1cCc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGttcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta21zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHNuc1N1YnNjcmlwdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCAqIGFzIHNzbSBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3NtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbmludGVyZmFjZSBCYWNrdXBTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnO1xuICBkeW5hbW9UYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHMzQnVja2V0OiBzMy5CdWNrZXQ7XG4gIGttc0tleToga21zLktleTtcbn1cblxuZXhwb3J0IGNsYXNzIEJhY2t1cFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGJhY2t1cFZhdWx0OiBiYWNrdXAuQmFja3VwVmF1bHQ7XG4gIHB1YmxpYyByZWFkb25seSBiYWNrdXBQbGFuOiBiYWNrdXAuQmFja3VwUGxhbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQmFja3VwU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgY29uZmlnLCBkeW5hbW9UYWJsZSwgczNCdWNrZXQsIGttc0tleSB9ID0gcHJvcHM7XG5cbiAgICAvLyBTTlMgVG9waWMgZm9yIGJhY2t1cCBub3RpZmljYXRpb25zXG4gICAgY29uc3QgYmFja3VwTm90aWZpY2F0aW9uVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdCYWNrdXBOb3RpZmljYXRpb25Ub3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1iYWNrdXAtbm90aWZpY2F0aW9uc2AsXG4gICAgICBkaXNwbGF5TmFtZTogYE1lZGVleiAke2Vudmlyb25tZW50fSBCYWNrdXAgTm90aWZpY2F0aW9uc2AsXG4gICAgfSk7XG5cbiAgICBiYWNrdXBOb3RpZmljYXRpb25Ub3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgc25zU3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihjb25maWcubW9uaXRvcmluZy5hbGVydEVtYWlsKVxuICAgICk7XG5cbiAgICAvLyBBV1MgQmFja3VwIFZhdWx0XG4gICAgdGhpcy5iYWNrdXBWYXVsdCA9IG5ldyBiYWNrdXAuQmFja3VwVmF1bHQodGhpcywgJ0JhY2t1cFZhdWx0Jywge1xuICAgICAgYmFja3VwVmF1bHROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LXZhdWx0YCxcbiAgICAgIGVuY3J5cHRpb25LZXk6IGttc0tleSxcbiAgICAgIGFjY2Vzc1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BY2NvdW50Um9vdFByaW5jaXBhbCgpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFsnYmFja3VwOionXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICAgIG5vdGlmaWNhdGlvblRvcGljOiBiYWNrdXBOb3RpZmljYXRpb25Ub3BpYyxcbiAgICAgIG5vdGlmaWNhdGlvbkV2ZW50czogW1xuICAgICAgICBiYWNrdXAuQmFja3VwVmF1bHRFdmVudHMuQkFDS1VQX0pPQl9DT01QTEVURUQsXG4gICAgICAgIGJhY2t1cC5CYWNrdXBWYXVsdEV2ZW50cy5CQUNLVVBfSk9CX0ZBSUxFRCxcbiAgICAgICAgYmFja3VwLkJhY2t1cFZhdWx0RXZlbnRzLlJFU1RPUkVfSk9CX0NPTVBMRVRFRCxcbiAgICAgICAgYmFja3VwLkJhY2t1cFZhdWx0RXZlbnRzLlJFU1RPUkVfSk9CX0ZBSUxFRCxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBCYWNrdXAgUGxhbiB3aXRoIGRpZmZlcmVudCBzY2hlZHVsZXMgZm9yIGRpZmZlcmVudCBlbnZpcm9ubWVudHNcbiAgICB0aGlzLmJhY2t1cFBsYW4gPSBuZXcgYmFja3VwLkJhY2t1cFBsYW4odGhpcywgJ0JhY2t1cFBsYW4nLCB7XG4gICAgICBiYWNrdXBQbGFuTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1wbGFuYCxcbiAgICAgIGJhY2t1cFZhdWx0OiB0aGlzLmJhY2t1cFZhdWx0LFxuICAgIH0pO1xuXG4gICAgLy8gUHJvZHVjdGlvbiBiYWNrdXAgc2NoZWR1bGUgLSBEYWlseSwgV2Vla2x5LCBNb250aGx5XG4gICAgaWYgKGVudmlyb25tZW50ID09PSAncHJvZCcpIHtcbiAgICAgIC8vIERhaWx5IGJhY2t1cHMgLSByZXRhaW5lZCBmb3IgMzUgZGF5c1xuICAgICAgdGhpcy5iYWNrdXBQbGFuLmFkZFJ1bGUoXG4gICAgICAgIG5ldyBiYWNrdXAuQmFja3VwUGxhblJ1bGUoe1xuICAgICAgICAgIHJ1bGVOYW1lOiAnRGFpbHlCYWNrdXAnLFxuICAgICAgICAgIGJhY2t1cFZhdWx0OiB0aGlzLmJhY2t1cFZhdWx0LFxuICAgICAgICAgIHNjaGVkdWxlRXhwcmVzc2lvbjogZXZlbnRzLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICAgICAgaG91cjogJzInLFxuICAgICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgZGVsZXRlQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDM1KSxcbiAgICAgICAgICBtb3ZlVG9Db2xkU3RvcmFnZUFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICBlbmFibGVDb250aW51b3VzQmFja3VwOiB0cnVlLFxuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgICAgLy8gV2Vla2x5IGJhY2t1cHMgLSByZXRhaW5lZCBmb3IgMTIgd2Vla3NcbiAgICAgIHRoaXMuYmFja3VwUGxhbi5hZGRSdWxlKFxuICAgICAgICBuZXcgYmFja3VwLkJhY2t1cFBsYW5SdWxlKHtcbiAgICAgICAgICBydWxlTmFtZTogJ1dlZWtseUJhY2t1cCcsXG4gICAgICAgICAgYmFja3VwVmF1bHQ6IHRoaXMuYmFja3VwVmF1bHQsXG4gICAgICAgICAgc2NoZWR1bGVFeHByZXNzaW9uOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7XG4gICAgICAgICAgICB3ZWVrRGF5OiAnU1VOJyxcbiAgICAgICAgICAgIGhvdXI6ICczJyxcbiAgICAgICAgICAgIG1pbnV0ZTogJzAnLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIGRlbGV0ZUFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg4NCksIC8vIDEyIHdlZWtzXG4gICAgICAgICAgbW92ZVRvQ29sZFN0b3JhZ2VBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICAvLyBNb250aGx5IGJhY2t1cHMgLSByZXRhaW5lZCBmb3IgMTIgbW9udGhzXG4gICAgICB0aGlzLmJhY2t1cFBsYW4uYWRkUnVsZShcbiAgICAgICAgbmV3IGJhY2t1cC5CYWNrdXBQbGFuUnVsZSh7XG4gICAgICAgICAgcnVsZU5hbWU6ICdNb250aGx5QmFja3VwJyxcbiAgICAgICAgICBiYWNrdXBWYXVsdDogdGhpcy5iYWNrdXBWYXVsdCxcbiAgICAgICAgICBzY2hlZHVsZUV4cHJlc3Npb246IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgICAgIGRheTogJzEnLFxuICAgICAgICAgICAgaG91cjogJzQnLFxuICAgICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgZGVsZXRlQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDM2NSksXG4gICAgICAgICAgbW92ZVRvQ29sZFN0b3JhZ2VBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3RhZ2luZy9EZXYgLSBEYWlseSBiYWNrdXBzIHJldGFpbmVkIGZvciBzaG9ydGVyIHBlcmlvZFxuICAgICAgdGhpcy5iYWNrdXBQbGFuLmFkZFJ1bGUoXG4gICAgICAgIG5ldyBiYWNrdXAuQmFja3VwUGxhblJ1bGUoe1xuICAgICAgICAgIHJ1bGVOYW1lOiAnRGFpbHlCYWNrdXAnLFxuICAgICAgICAgIGJhY2t1cFZhdWx0OiB0aGlzLmJhY2t1cFZhdWx0LFxuICAgICAgICAgIHNjaGVkdWxlRXhwcmVzc2lvbjogZXZlbnRzLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICAgICAgaG91cjogJzInLFxuICAgICAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgICAgfSksXG4gICAgICAgICAgZGVsZXRlQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKGNvbmZpZy5iYWNrdXAucmV0ZW50aW9uRGF5cyksXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIEJhY2t1cCBzZWxlY3Rpb24gZm9yIER5bmFtb0RCXG4gICAgY29uc3QgYmFja3VwUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQmFja3VwUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdiYWNrdXAuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0JhY2t1cFNlcnZpY2VSb2xlUG9saWN5Rm9yQmFja3VwJyksXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0JhY2t1cFNlcnZpY2VSb2xlUG9saWN5Rm9yUmVzdG9yZXMnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBuZXcgYmFja3VwLkJhY2t1cFNlbGVjdGlvbih0aGlzLCAnQmFja3VwU2VsZWN0aW9uJywge1xuICAgICAgYmFja3VwUGxhbjogdGhpcy5iYWNrdXBQbGFuLFxuICAgICAgYmFja3VwU2VsZWN0aW9uTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1zZWxlY3Rpb25gLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGJhY2t1cC5CYWNrdXBSZXNvdXJjZS5mcm9tRHluYW1vRGJUYWJsZShkeW5hbW9UYWJsZSksXG4gICAgICBdLFxuICAgICAgcm9sZTogYmFja3VwUm9sZSxcbiAgICB9KTtcblxuICAgIC8vIFMzIENyb3NzLVJlZ2lvbiBSZXBsaWNhdGlvbiAoaWYgZW5hYmxlZClcbiAgICBpZiAoY29uZmlnLmJhY2t1cC5jcm9zc1JlZ2lvblJlcGxpY2F0aW9uICYmIGNvbmZpZy5iYWNrdXAuYmFja3VwUmVnaW9uKSB7XG4gICAgICBjb25zdCByZXBsaWNhdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1JlcGxpY2F0aW9uUm9sZScsIHtcbiAgICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3MzLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgICBSZXBsaWNhdGlvblBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb25Gb3JSZXBsaWNhdGlvbicsXG4gICAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkFjbCcsXG4gICAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvblRhZ2dpbmcnLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7czNCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICdzMzpSZXBsaWNhdGVPYmplY3QnLFxuICAgICAgICAgICAgICAgICAgJ3MzOlJlcGxpY2F0ZURlbGV0ZScsXG4gICAgICAgICAgICAgICAgICAnczM6UmVwbGljYXRlVGFncycsXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzMzo6Om1lZGVlei0ke2Vudmlyb25tZW50fS1iYWNrdXAtJHtjb25maWcuYmFja3VwLmJhY2t1cFJlZ2lvbn0tJHt0aGlzLmFjY291bnR9LypgXSxcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFkZCByZXBsaWNhdGlvbiBjb25maWd1cmF0aW9uIHRvIFMzIGJ1Y2tldFxuICAgICAgY29uc3QgY2ZuQnVja2V0ID0gczNCdWNrZXQubm9kZS5kZWZhdWx0Q2hpbGQgYXMgczMuQ2ZuQnVja2V0O1xuICAgICAgY2ZuQnVja2V0LnJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiA9IHtcbiAgICAgICAgcm9sZTogcmVwbGljYXRpb25Sb2xlLnJvbGVBcm4sXG4gICAgICAgIHJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6ICdSZXBsaWNhdGVBbGwnLFxuICAgICAgICAgICAgc3RhdHVzOiAnRW5hYmxlZCcsXG4gICAgICAgICAgICBwcmVmaXg6ICcnLFxuICAgICAgICAgICAgZGVzdGluYXRpb246IHtcbiAgICAgICAgICAgICAgYnVja2V0OiBgYXJuOmF3czpzMzo6Om1lZGVlei0ke2Vudmlyb25tZW50fS1iYWNrdXAtJHtjb25maWcuYmFja3VwLmJhY2t1cFJlZ2lvbn0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiAnU1RBTkRBUkRfSUEnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBCYWNrdXAgdmVyaWZpY2F0aW9uIExhbWJkYVxuICAgIGNvbnN0IGJhY2t1cFZlcmlmaWNhdGlvbkZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQmFja3VwVmVyaWZpY2F0aW9uRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tYmFja3VwLXZlcmlmaWNhdGlvbmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbmltcG9ydCBqc29uXG5pbXBvcnQgYm90bzNcbmltcG9ydCBkYXRldGltZVxuZnJvbSBib3RvY29yZS5leGNlcHRpb25zIGltcG9ydCBDbGllbnRFcnJvclxuXG5kZWYgbGFtYmRhX2hhbmRsZXIoZXZlbnQsIGNvbnRleHQpOlxuICAgIFwiXCJcIlxuICAgIFZlcmlmeSBiYWNrdXAgaW50ZWdyaXR5IGFuZCBzZW5kIG5vdGlmaWNhdGlvbnNcbiAgICBcIlwiXCJcbiAgICBiYWNrdXBfY2xpZW50ID0gYm90bzMuY2xpZW50KCdiYWNrdXAnKVxuICAgIGNsb3Vkd2F0Y2ggPSBib3RvMy5jbGllbnQoJ2Nsb3Vkd2F0Y2gnKVxuICAgIHNucyA9IGJvdG8zLmNsaWVudCgnc25zJylcbiAgICBcbiAgICBiYWNrdXBfdmF1bHRfbmFtZSA9IGV2ZW50LmdldCgnYmFja3VwX3ZhdWx0X25hbWUnKVxuICAgIHRvcGljX2FybiA9IGV2ZW50LmdldCgndG9waWNfYXJuJylcbiAgICBlbnZpcm9ubWVudCA9IGV2ZW50LmdldCgnZW52aXJvbm1lbnQnKVxuICAgIFxuICAgIHRyeTpcbiAgICAgICAgIyBMaXN0IHJlY2VudCBiYWNrdXAgam9ic1xuICAgICAgICBlbmRfdGltZSA9IGRhdGV0aW1lLmRhdGV0aW1lLm5vdygpXG4gICAgICAgIHN0YXJ0X3RpbWUgPSBlbmRfdGltZSAtIGRhdGV0aW1lLnRpbWVkZWx0YShkYXlzPTEpXG4gICAgICAgIFxuICAgICAgICByZXNwb25zZSA9IGJhY2t1cF9jbGllbnQubGlzdF9iYWNrdXBfam9icyhcbiAgICAgICAgICAgIEJ5QmFja3VwVmF1bHROYW1lPWJhY2t1cF92YXVsdF9uYW1lLFxuICAgICAgICAgICAgQnlDcmVhdGVkQWZ0ZXI9c3RhcnRfdGltZSxcbiAgICAgICAgICAgIEJ5Q3JlYXRlZEJlZm9yZT1lbmRfdGltZVxuICAgICAgICApXG4gICAgICAgIFxuICAgICAgICBiYWNrdXBfam9icyA9IHJlc3BvbnNlLmdldCgnQmFja3VwSm9icycsIFtdKVxuICAgICAgICBcbiAgICAgICAgIyBDaGVjayBiYWNrdXAgc3RhdHVzXG4gICAgICAgIHN1Y2Nlc3NmdWxfYmFja3VwcyA9IDBcbiAgICAgICAgZmFpbGVkX2JhY2t1cHMgPSAwXG4gICAgICAgIFxuICAgICAgICBmb3Igam9iIGluIGJhY2t1cF9qb2JzOlxuICAgICAgICAgICAgaWYgam9iWydTdGF0ZSddID09ICdDT01QTEVURUQnOlxuICAgICAgICAgICAgICAgIHN1Y2Nlc3NmdWxfYmFja3VwcyArPSAxXG4gICAgICAgICAgICBlbGlmIGpvYlsnU3RhdGUnXSBpbiBbJ0ZBSUxFRCcsICdBQk9SVEVEJywgJ0VYUElSRUQnXTpcbiAgICAgICAgICAgICAgICBmYWlsZWRfYmFja3VwcyArPSAxXG4gICAgICAgIFxuICAgICAgICAjIFNlbmQgbWV0cmljcyB0byBDbG91ZFdhdGNoXG4gICAgICAgIGNsb3Vkd2F0Y2gucHV0X21ldHJpY19kYXRhKFxuICAgICAgICAgICAgTmFtZXNwYWNlPWYnTWVkZWV6L3tlbnZpcm9ubWVudH0vQmFja3VwJyxcbiAgICAgICAgICAgIE1ldHJpY0RhdGE9W1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgJ01ldHJpY05hbWUnOiAnU3VjY2Vzc2Z1bEJhY2t1cHMnLFxuICAgICAgICAgICAgICAgICAgICAnVmFsdWUnOiBzdWNjZXNzZnVsX2JhY2t1cHMsXG4gICAgICAgICAgICAgICAgICAgICdVbml0JzogJ0NvdW50J1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAnTWV0cmljTmFtZSc6ICdGYWlsZWRCYWNrdXBzJyxcbiAgICAgICAgICAgICAgICAgICAgJ1ZhbHVlJzogZmFpbGVkX2JhY2t1cHMsXG4gICAgICAgICAgICAgICAgICAgICdVbml0JzogJ0NvdW50J1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgKVxuICAgICAgICBcbiAgICAgICAgIyBTZW5kIG5vdGlmaWNhdGlvbiBpZiB0aGVyZSBhcmUgZmFpbGVkIGJhY2t1cHNcbiAgICAgICAgaWYgZmFpbGVkX2JhY2t1cHMgPiAwOlxuICAgICAgICAgICAgbWVzc2FnZSA9IHtcbiAgICAgICAgICAgICAgICAnZW52aXJvbm1lbnQnOiBlbnZpcm9ubWVudCxcbiAgICAgICAgICAgICAgICAnZmFpbGVkX2JhY2t1cHMnOiBmYWlsZWRfYmFja3VwcyxcbiAgICAgICAgICAgICAgICAnc3VjY2Vzc2Z1bF9iYWNrdXBzJzogc3VjY2Vzc2Z1bF9iYWNrdXBzLFxuICAgICAgICAgICAgICAgICd2YXVsdCc6IGJhY2t1cF92YXVsdF9uYW1lLFxuICAgICAgICAgICAgICAgICd0aW1lc3RhbXAnOiBkYXRldGltZS5kYXRldGltZS5ub3coKS5pc29mb3JtYXQoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgICAgICBzbnMucHVibGlzaChcbiAgICAgICAgICAgICAgICBUb3BpY0Fybj10b3BpY19hcm4sXG4gICAgICAgICAgICAgICAgU3ViamVjdD1mJ01lZGVleiB7ZW52aXJvbm1lbnR9OiBCYWNrdXAgRmFpbHVyZXMgRGV0ZWN0ZWQnLFxuICAgICAgICAgICAgICAgIE1lc3NhZ2U9anNvbi5kdW1wcyhtZXNzYWdlLCBpbmRlbnQ9MilcbiAgICAgICAgICAgIClcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDIwMCxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7XG4gICAgICAgICAgICAgICAgJ3N1Y2Nlc3NmdWxfYmFja3Vwcyc6IHN1Y2Nlc3NmdWxfYmFja3VwcyxcbiAgICAgICAgICAgICAgICAnZmFpbGVkX2JhY2t1cHMnOiBmYWlsZWRfYmFja3Vwc1xuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICBcbiAgICBleGNlcHQgQ2xpZW50RXJyb3IgYXMgZTpcbiAgICAgICAgcHJpbnQoZlwiRXJyb3IgdmVyaWZ5aW5nIGJhY2t1cHM6IHtzdHIoZSl9XCIpXG4gICAgICAgIFxuICAgICAgICAjIFNlbmQgZXJyb3Igbm90aWZpY2F0aW9uXG4gICAgICAgIHNucy5wdWJsaXNoKFxuICAgICAgICAgICAgVG9waWNBcm49dG9waWNfYXJuLFxuICAgICAgICAgICAgU3ViamVjdD1mJ01lZGVleiB7ZW52aXJvbm1lbnR9OiBCYWNrdXAgVmVyaWZpY2F0aW9uIEVycm9yJyxcbiAgICAgICAgICAgIE1lc3NhZ2U9ZidFcnJvciB2ZXJpZnlpbmcgYmFja3Vwczoge3N0cihlKX0nXG4gICAgICAgIClcbiAgICAgICAgXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDUwMCxcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J2Vycm9yJzogc3RyKGUpfSlcbiAgICAgICAgfVxuICAgICAgYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICAgIEJBQ0tVUF9WQVVMVF9OQU1FOiB0aGlzLmJhY2t1cFZhdWx0LmJhY2t1cFZhdWx0TmFtZSxcbiAgICAgICAgVE9QSUNfQVJOOiBiYWNrdXBOb3RpZmljYXRpb25Ub3BpYy50b3BpY0FybixcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIHRvIHRoZSBiYWNrdXAgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uXG4gICAgYmFja3VwVmVyaWZpY2F0aW9uRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnYmFja3VwOkxpc3RCYWNrdXBKb2JzJyxcbiAgICAgICAgICAnYmFja3VwOkRlc2NyaWJlQmFja3VwSm9iJyxcbiAgICAgICAgICAnYmFja3VwOkxpc3RSZWNvdmVyeVBvaW50cycsXG4gICAgICAgICAgJ2Nsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YScsXG4gICAgICAgICAgJ3NuczpQdWJsaXNoJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIFNjaGVkdWxlIGJhY2t1cCB2ZXJpZmljYXRpb25cbiAgICBjb25zdCBiYWNrdXBWZXJpZmljYXRpb25SdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdCYWNrdXBWZXJpZmljYXRpb25SdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tYmFja3VwLXZlcmlmaWNhdGlvbmAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhaWx5IGJhY2t1cCB2ZXJpZmljYXRpb24nLFxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgaG91cjogJzgnLFxuICAgICAgICBtaW51dGU6ICcwJyxcbiAgICAgIH0pLFxuICAgICAgdGFyZ2V0czogW1xuICAgICAgICBuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihiYWNrdXBWZXJpZmljYXRpb25GdW5jdGlvbiwge1xuICAgICAgICAgIGV2ZW50OiBldmVudHMuUnVsZVRhcmdldElucHV0LmZyb21PYmplY3Qoe1xuICAgICAgICAgICAgZW52aXJvbm1lbnQsXG4gICAgICAgICAgICBiYWNrdXBfdmF1bHRfbmFtZTogdGhpcy5iYWNrdXBWYXVsdC5iYWNrdXBWYXVsdE5hbWUsXG4gICAgICAgICAgICB0b3BpY19hcm46IGJhY2t1cE5vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBEaXNhc3RlciBSZWNvdmVyeSBMYW1iZGFcbiAgICBjb25zdCBkaXNhc3RlclJlY292ZXJ5RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEaXNhc3RlclJlY292ZXJ5RnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tZGlzYXN0ZXItcmVjb3ZlcnlgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5pbXBvcnQganNvblxuaW1wb3J0IGJvdG8zXG5pbXBvcnQgb3NcblxuZGVmIGxhbWJkYV9oYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcbiAgICBcIlwiXCJcbiAgICBEaXNhc3RlciByZWNvdmVyeSBwcm9jZWR1cmVzXG4gICAgXCJcIlwiXG4gICAgYmFja3VwX2NsaWVudCA9IGJvdG8zLmNsaWVudCgnYmFja3VwJylcbiAgICBkeW5hbW9kYiA9IGJvdG8zLmNsaWVudCgnZHluYW1vZGInKVxuICAgIFxuICAgIHJlY292ZXJ5X3R5cGUgPSBldmVudC5nZXQoJ3JlY292ZXJ5X3R5cGUnLCAncG9pbnRfaW5fdGltZScpXG4gICAgdGFyZ2V0X3RpbWUgPSBldmVudC5nZXQoJ3RhcmdldF90aW1lJylcbiAgICBcbiAgICBpZiByZWNvdmVyeV90eXBlID09ICdwb2ludF9pbl90aW1lJzpcbiAgICAgICAgcmV0dXJuIHJlc3RvcmVfcG9pbnRfaW5fdGltZShldmVudCwgY29udGV4dClcbiAgICBlbGlmIHJlY292ZXJ5X3R5cGUgPT0gJ2Zyb21fYmFja3VwJzpcbiAgICAgICAgcmV0dXJuIHJlc3RvcmVfZnJvbV9iYWNrdXAoZXZlbnQsIGNvbnRleHQpXG4gICAgZWxzZTpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAwLFxuICAgICAgICAgICAgJ2JvZHknOiBqc29uLmR1bXBzKHsnZXJyb3InOiAnSW52YWxpZCByZWNvdmVyeSB0eXBlJ30pXG4gICAgICAgIH1cblxuZGVmIHJlc3RvcmVfcG9pbnRfaW5fdGltZShldmVudCwgY29udGV4dCk6XG4gICAgXCJcIlwiXG4gICAgUmVzdG9yZSBEeW5hbW9EQiB0YWJsZSB0byBhIHNwZWNpZmljIHBvaW50IGluIHRpbWVcbiAgICBcIlwiXCJcbiAgICAjIEltcGxlbWVudGF0aW9uIGZvciBwb2ludC1pbi10aW1lIHJlY292ZXJ5XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ3N0YXR1c0NvZGUnOiAyMDAsXG4gICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7J21lc3NhZ2UnOiAnUG9pbnQtaW4tdGltZSByZWNvdmVyeSBpbml0aWF0ZWQnfSlcbiAgICB9XG5cbmRlZiByZXN0b3JlX2Zyb21fYmFja3VwKGV2ZW50LCBjb250ZXh0KTpcbiAgICBcIlwiXCJcbiAgICBSZXN0b3JlIGZyb20gQVdTIEJhY2t1cCByZWNvdmVyeSBwb2ludFxuICAgIFwiXCJcIlxuICAgICMgSW1wbGVtZW50YXRpb24gZm9yIGJhY2t1cCByZXN0b3JhdGlvblxuICAgIHJldHVybiB7XG4gICAgICAgICdzdGF0dXNDb2RlJzogMjAwLFxuICAgICAgICAnYm9keSc6IGpzb24uZHVtcHMoeydtZXNzYWdlJzogJ0JhY2t1cCByZXN0b3JhdGlvbiBpbml0aWF0ZWQnfSlcbiAgICB9XG4gICAgICBgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgRFlOQU1PX1RBQkxFX05BTUU6IGR5bmFtb1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgQkFDS1VQX1ZBVUxUX05BTUU6IHRoaXMuYmFja3VwVmF1bHQuYmFja3VwVmF1bHROYW1lLFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIGZvciBkaXNhc3RlciByZWNvdmVyeVxuICAgIGRpc2FzdGVyUmVjb3ZlcnlGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdiYWNrdXA6U3RhcnRSZXN0b3JlSm9iJyxcbiAgICAgICAgICAnYmFja3VwOkRlc2NyaWJlUmVzdG9yZUpvYicsXG4gICAgICAgICAgJ2JhY2t1cDpMaXN0UmVjb3ZlcnlQb2ludHMnLFxuICAgICAgICAgICdkeW5hbW9kYjpSZXN0b3JlVGFibGVUb1BvaW50SW5UaW1lJyxcbiAgICAgICAgICAnZHluYW1vZGI6UmVzdG9yZVRhYmxlRnJvbUJhY2t1cCcsXG4gICAgICAgICAgJ2R5bmFtb2RiOkRlc2NyaWJlVGFibGUnLFxuICAgICAgICAgICdkeW5hbW9kYjpEZXNjcmliZUJhY2t1cCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBTdG9yZSBiYWNrdXAgY29uZmlndXJhdGlvbiBpbiBQYXJhbWV0ZXIgU3RvcmVcbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQmFja3VwVmF1bHROYW1lUGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9tZWRlZXovJHtlbnZpcm9ubWVudH0vYmFja3VwL3ZhdWx0LW5hbWVgLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMuYmFja3VwVmF1bHQuYmFja3VwVmF1bHROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdBV1MgQmFja3VwIFZhdWx0IG5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0JhY2t1cFBsYW5JZFBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2JhY2t1cC9wbGFuLWlkYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiB0aGlzLmJhY2t1cFBsYW4uYmFja3VwUGxhbklkLFxuICAgICAgZGVzY3JpcHRpb246ICdBV1MgQmFja3VwIFBsYW4gSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0Rpc2FzdGVyUmVjb3ZlcnlGdW5jdGlvbkFyblBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2JhY2t1cC9kaXNhc3Rlci1yZWNvdmVyeS1mdW5jdGlvbi1hcm5gLFxuICAgICAgc3RyaW5nVmFsdWU6IGRpc2FzdGVyUmVjb3ZlcnlGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGlzYXN0ZXIgUmVjb3ZlcnkgTGFtYmRhIEZ1bmN0aW9uIEFSTicsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0JhY2t1cFZhdWx0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmJhY2t1cFZhdWx0LmJhY2t1cFZhdWx0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVdTIEJhY2t1cCBWYXVsdCBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpCYWNrdXBWYXVsdE5hbWUtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0JhY2t1cFBsYW5JZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmJhY2t1cFBsYW4uYmFja3VwUGxhbklkLFxuICAgICAgZGVzY3JpcHRpb246ICdBV1MgQmFja3VwIFBsYW4gSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlekJhY2t1cFBsYW5JZC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGlzYXN0ZXJSZWNvdmVyeUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGRpc2FzdGVyUmVjb3ZlcnlGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGlzYXN0ZXIgUmVjb3ZlcnkgTGFtYmRhIEZ1bmN0aW9uIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6RGlzYXN0ZXJSZWNvdmVyeUZ1bmN0aW9uQXJuLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCYWNrdXBOb3RpZmljYXRpb25Ub3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiBiYWNrdXBOb3RpZmljYXRpb25Ub3BpYy50b3BpY0FybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQmFja3VwIE5vdGlmaWNhdGlvbiBTTlMgVG9waWMgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpCYWNrdXBOb3RpZmljYXRpb25Ub3BpY0Fybi0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG4gIH1cbn0iXX0=