import * as cdk from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
interface BackupStackProps extends cdk.StackProps {
    environment: string;
    config: EnvironmentConfig;
    dynamoTable: dynamodb.Table;
    s3Bucket: s3.Bucket;
    kmsKey: kms.Key;
}
export declare class BackupStack extends cdk.Stack {
    readonly backupVault: backup.BackupVault;
    readonly backupPlan: backup.BackupPlan;
    constructor(scope: Construct, id: string, props: BackupStackProps);
}
export {};
