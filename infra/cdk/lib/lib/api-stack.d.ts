import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
interface ApiStackProps extends cdk.StackProps {
    environment: string;
    config: EnvironmentConfig;
    dynamoTable: dynamodb.Table;
    s3Bucket: s3.Bucket;
    kmsKey: kms.Key;
    apiRole: iam.Role;
    userPool?: cognito.UserPool;
    userPoolClient?: cognito.UserPoolClient;
}
export declare class ApiStack extends cdk.Stack {
    readonly apiFunction: lambda.Function;
    readonly apiGateway: apigateway.RestApi;
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly apiUrl: string;
    constructor(scope: Construct, id: string, props: ApiStackProps);
}
export {};
