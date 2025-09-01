import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
interface DatabaseStackProps extends cdk.StackProps {
    environment: string;
    config: EnvironmentConfig;
    kmsKey?: kms.IKey;
}
export declare class DatabaseStack extends cdk.Stack {
    readonly dynamoTable: dynamodb.Table;
    readonly s3Bucket: s3.Bucket;
    readonly backupBucket: s3.Bucket;
    constructor(scope: Construct, id: string, props: DatabaseStackProps);
}
export {};
