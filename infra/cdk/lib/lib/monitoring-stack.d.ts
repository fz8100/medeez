import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';
interface MonitoringStackProps extends cdk.StackProps {
    environment: string;
    config: EnvironmentConfig;
    dynamoTable: dynamodb.Table;
    apiFunction: lambda.Function;
    apiGateway: apigateway.RestApi;
    cloudFrontDistribution?: cloudfront.Distribution;
}
export declare class MonitoringStack extends cdk.Stack {
    readonly dashboard: cloudwatch.Dashboard;
    readonly alertTopic: sns.Topic;
    constructor(scope: Construct, id: string, props: MonitoringStackProps);
}
export {};
