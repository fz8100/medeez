import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
interface FrontendStackProps extends cdk.StackProps {
    environment: string;
    config: EnvironmentConfig;
    apiUrl: string;
    userPool: cognito.UserPool;
    userPoolClient: cognito.UserPoolClient;
}
export declare class FrontendStack extends cdk.Stack {
    readonly cloudFrontDistribution: cloudfront.Distribution;
    readonly webUrl: string;
    constructor(scope: Construct, id: string, props: FrontendStackProps);
}
export {};
