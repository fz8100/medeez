import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
interface CognitoStackProps extends cdk.StackProps {
    environment: string;
    config: EnvironmentConfig;
    kmsKey: kms.Key;
    apiRole: iam.Role;
}
export declare class CognitoStack extends cdk.Stack {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly identityPool: cognito.CfnIdentityPool;
    readonly lambdaTriggers: Record<string, lambda.Function>;
    constructor(scope: Construct, id: string, props: CognitoStackProps);
}
export {};
