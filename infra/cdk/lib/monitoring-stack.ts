import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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

export class MonitoringStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { environment, config, dynamoTable, apiFunction, apiGateway, cloudFrontDistribution } = props;

    // SNS Topic for alerts
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `medeez-${environment}-alerts`,
      displayName: `Medeez ${environment} Alerts`,
    });

    // Email subscription for alerts
    this.alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(config.monitoring.alertEmail)
    );

    // CloudWatch Dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'MedeezDashboard', {
      dashboardName: `${config.monitoring.dashboardName}-${environment}`,
      defaultInterval: cdk.Duration.hours(1),
    });

    // Lambda Metrics
    const lambdaErrorsMetric = apiFunction.metricErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const lambdaDurationMetric = apiFunction.metricDuration({
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const lambdaInvocationsMetric = apiFunction.metricInvocations({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // DynamoDB Metrics
    const dynamoReadThrottleMetric = dynamoTable.metricUserErrors({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const dynamoWriteThrottleMetric = dynamoTable.metricSystemErrorsForOperations({
      operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM],
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // Dashboard Widgets
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Performance',
        left: [lambdaInvocationsMetric, lambdaErrorsMetric],
        right: [lambdaDurationMetric],
        width: 24,
        height: 6,
      })
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Errors',
        left: [dynamoReadThrottleMetric, dynamoWriteThrottleMetric],
        width: 24,
        height: 6,
      })
    );

    // Alarms
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: `medeez-${environment}-lambda-errors`,
      alarmDescription: 'Lambda function high error rate',
      metric: lambdaErrorsMetric,
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    lambdaErrorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alertTopic)
    );

    const lambdaDurationAlarm = new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
      alarmName: `medeez-${environment}-lambda-duration`,
      alarmDescription: 'Lambda function high duration',
      metric: lambdaDurationMetric,
      threshold: 10000, // 10 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    lambdaDurationAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(this.alertTopic)
    );

    // Log Groups for proper retention
    new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/lambda/${apiFunction.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Store configuration in Parameter Store
    new ssm.StringParameter(this, 'DashboardUrlParameter', {
      parameterName: `/medeez/${environment}/monitoring/dashboard-url`,
      stringValue: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    new ssm.StringParameter(this, 'AlertTopicArnParameter', {
      parameterName: `/medeez/${environment}/monitoring/alert-topic-arn`,
      stringValue: this.alertTopic.topicArn,
      description: 'SNS Alert Topic ARN',
    });

    // Outputs
    new cdk.CfnOutput(this, 'DashboardName', {
      value: this.dashboard.dashboardName,
      description: 'CloudWatch Dashboard Name',
      exportName: `MedeezDashboardName-${environment}`,
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS Alert Topic ARN',
      exportName: `MedeezAlertTopicArn-${environment}`,
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
      exportName: `MedeezDashboardUrl-${environment}`,
    });
  }
}