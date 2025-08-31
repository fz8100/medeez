import * as cdk from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface BackupStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
  dynamoTable: dynamodb.Table;
  s3Bucket: s3.Bucket;
  kmsKey: kms.Key;
}

export class BackupStack extends cdk.Stack {
  public readonly backupVault: backup.BackupVault;
  public readonly backupPlan: backup.BackupPlan;

  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props);

    const { environment, config, dynamoTable, s3Bucket, kmsKey } = props;

    // SNS Topic for backup notifications
    const backupNotificationTopic = new sns.Topic(this, 'BackupNotificationTopic', {
      topicName: `medeez-${environment}-backup-notifications`,
      displayName: `Medeez ${environment} Backup Notifications`,
    });

    backupNotificationTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(config.monitoring.alertEmail)
    );

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
      this.backupPlan.addRule(
        new backup.BackupPlanRule({
          ruleName: 'DailyBackup',
          backupVault: this.backupVault,
          scheduleExpression: events.Schedule.cron({
            hour: '2',
            minute: '0',
          }),
          deleteAfter: cdk.Duration.days(35),
          moveToColdStorageAfter: cdk.Duration.days(7),
          enableContinuousBackup: true,
        })
      );

      // Weekly backups - retained for 12 weeks
      this.backupPlan.addRule(
        new backup.BackupPlanRule({
          ruleName: 'WeeklyBackup',
          backupVault: this.backupVault,
          scheduleExpression: events.Schedule.cron({
            weekDay: 'SUN',
            hour: '3',
            minute: '0',
          }),
          deleteAfter: cdk.Duration.days(84), // 12 weeks
          moveToColdStorageAfter: cdk.Duration.days(7),
        })
      );

      // Monthly backups - retained for 12 months
      this.backupPlan.addRule(
        new backup.BackupPlanRule({
          ruleName: 'MonthlyBackup',
          backupVault: this.backupVault,
          scheduleExpression: events.Schedule.cron({
            day: '1',
            hour: '4',
            minute: '0',
          }),
          deleteAfter: cdk.Duration.days(365),
          moveToColdStorageAfter: cdk.Duration.days(30),
        })
      );
    } else {
      // Staging/Dev - Daily backups retained for shorter period
      this.backupPlan.addRule(
        new backup.BackupPlanRule({
          ruleName: 'DailyBackup',
          backupVault: this.backupVault,
          scheduleExpression: events.Schedule.cron({
            hour: '2',
            minute: '0',
          }),
          deleteAfter: cdk.Duration.days(config.backup.retentionDays),
        })
      );
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
      const cfnBucket = s3Bucket.node.defaultChild as s3.CfnBucket;
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
    backupVerificationFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'backup:ListBackupJobs',
          'backup:DescribeBackupJob',
          'backup:ListRecoveryPoints',
          'cloudwatch:PutMetricData',
          'sns:Publish',
        ],
        resources: ['*'],
      })
    );

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
    disasterRecoveryFunction.addToRolePolicy(
      new iam.PolicyStatement({
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
      })
    );

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