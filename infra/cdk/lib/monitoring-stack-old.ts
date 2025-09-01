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
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // API Gateway Metrics
    const apiErrorsMetric = apiGateway.metricClientError({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const api4xxErrorsMetric = apiGateway.metric4XXError({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const api5xxErrorsMetric = apiGateway.metric5XXError({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const apiLatencyMetric = apiGateway.metricLatency({
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const apiRequestsMetric = apiGateway.metricCount({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
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

    const lambdaThrottlesMetric = apiFunction.metricThrottles({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const lambdaConcurrentExecutionsMetric = apiFunction.metricConcurrentExecutions({
      statistic: 'Maximum',
      period: cdk.Duration.minutes(5),
    });

    // DynamoDB Metrics
    const dynamoReadThrottleMetric = dynamoTable.metricSystemErrorsForOperations({
      operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY, dynamodb.Operation.SCAN],
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const dynamoWriteThrottleMetric = dynamoTable.metricSystemErrorsForOperations({
      operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM, dynamodb.Operation.DELETE_ITEM],
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const dynamoConsumedReadCapacityMetric = dynamoTable.metricConsumedReadCapacityUnits({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const dynamoConsumedWriteCapacityMetric = dynamoTable.metricConsumedWriteCapacityUnits({
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // CloudFront Metrics (if available)
    let cloudfrontErrorRateMetric: cloudwatch.Metric | undefined;
    let cloudfrontOriginLatencyMetric: cloudwatch.Metric | undefined;

    if (cloudFrontDistribution) {
      cloudfrontErrorRateMetric = cloudFrontDistribution.metricErrorRate({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      });

      cloudfrontOriginLatencyMetric = cloudFrontDistribution.metricOriginLatency({
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      });
    }

    // Custom Business Metrics
    const appointmentsCreatedMetric = new cloudwatch.Metric({
      namespace: `Medeez/${environment}`,
      metricName: 'AppointmentsCreated',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const patientsRegisteredMetric = new cloudwatch.Metric({
      namespace: `Medeez/${environment}`,
      metricName: 'PatientsRegistered',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const invoicesGeneratedMetric = new cloudwatch.Metric({
      namespace: `Medeez/${environment}`,
      metricName: 'InvoicesGenerated',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const claimsSubmittedMetric = new cloudwatch.Metric({
      namespace: `Medeez/${environment}`,
      metricName: 'ClaimsSubmitted',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // Dashboard Widgets
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests & Errors',
        left: [apiRequestsMetric, api4xxErrorsMetric, api5xxErrorsMetric],
        width: 12,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'API Latency (ms)',
        metrics: [apiLatencyMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Error Rate %',
        metrics: [
          new cloudwatch.MathExpression({
            expression: '(m1 + m2) / m3 * 100',
            usingMetrics: {
              m1: api4xxErrorsMetric,
              m2: api5xxErrorsMetric,
              m3: apiRequestsMetric,
            },
            label: 'Error Rate %',
          })
        ],
        width: 6,
        height: 6,
      })
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Performance',
        left: [lambdaInvocationsMetric, lambdaErrorsMetric, lambdaThrottlesMetric],
        right: [lambdaDurationMetric],
        width: 12,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Lambda Duration (ms)',
        metrics: [lambdaDurationMetric],
        width: 6,
        height: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Concurrent Executions',
        metrics: [lambdaConcurrentExecutionsMetric],
        width: 6,
        height: 6,
      })
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB Capacity & Throttling',
        left: [dynamoConsumedReadCapacityMetric, dynamoConsumedWriteCapacityMetric],
        right: [dynamoReadThrottleMetric, dynamoWriteThrottleMetric],
        width: 12,
        height: 6,
      })
    );

    if (cloudfrontErrorRateMetric && cloudfrontOriginLatencyMetric) {
      this.dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'CloudFront Performance',
          left: [cloudfrontErrorRateMetric],
          right: [cloudfrontOriginLatencyMetric],
          width: 12,
          height: 6,
        })
      );
    }

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Business Metrics',
        left: [appointmentsCreatedMetric, patientsRegisteredMetric],
        right: [invoicesGeneratedMetric, claimsSubmittedMetric],
        width: 12,
        height: 6,
      })
    );

    // CloudWatch Alarms
    
    // API Gateway Error Rate Alarm
    const apiErrorRateAlarm = new cloudwatch.Alarm(this, 'ApiErrorRateAlarm', {
      alarmName: `medeez-${environment}-api-error-rate`,
      alarmDescription: 'API Gateway error rate is too high',
      metric: new cloudwatch.MathExpression({
        expression: '(m1 + m2) / m3 * 100',
        usingMetrics: {
          m1: api4xxErrorsMetric,
          m2: api5xxErrorsMetric,
          m3: apiRequestsMetric,
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: environment === 'prod' ? 5 : 10, // 5% in prod, 10% in dev/staging
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiErrorRateAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // Lambda Error Rate Alarm
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: `medeez-${environment}-lambda-errors`,
      alarmDescription: 'Lambda function error rate is too high',
      metric: lambdaErrorsMetric,
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    lambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // Lambda Duration Alarm
    const lambdaDurationAlarm = new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
      alarmName: `medeez-${environment}-lambda-duration`,
      alarmDescription: 'Lambda function duration is too high',
      metric: lambdaDurationMetric,
      threshold: 10000, // 10 seconds
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    lambdaDurationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // DynamoDB Throttling Alarm
    const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
      alarmName: `medeez-${environment}-dynamo-throttling`,
      alarmDescription: 'DynamoDB throttling detected',
      metric: new cloudwatch.MathExpression({
        expression: 'm1 + m2',
        usingMetrics: {
          m1: dynamoReadThrottleMetric,
          m2: dynamoWriteThrottleMetric,
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dynamoThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));

    // Cost Monitoring Lambda
    const costMonitoringFunction = new lambda.Function(this, 'CostMonitoringFunction', {
      functionName: `medeez-${environment}-cost-monitoring`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromInline(`
import json
import boto3
import datetime
from decimal import Decimal

def lambda_handler(event, context):
    """
    Monitor AWS costs and publish custom metrics
    """
    ce_client = boto3.client('ce')
    cloudwatch = boto3.client('cloudwatch')
    
    # Get cost data for current month
    end_date = datetime.date.today()
    start_date = end_date.replace(day=1)
    
    try:
        response = ce_client.get_cost_and_usage(
            TimePeriod={
                'Start': start_date.strftime('%Y-%m-%d'),
                'End': end_date.strftime('%Y-%m-%d')
            },
            Granularity='MONTHLY',
            Metrics=['UnblendedCost'],
            GroupBy=[
                {'Type': 'DIMENSION', 'Key': 'SERVICE'}
            ]
        )
        
        # Process cost data
        total_cost = 0
        service_costs = {}
        
        for result in response['ResultsByTime']:
            for group in result['Groups']:
                service = group['Keys'][0]
                cost = float(group['Metrics']['UnblendedCost']['Amount'])
                service_costs[service] = cost
                total_cost += cost
        
        # Publish custom metrics
        metrics = []
        
        # Total cost
        metrics.append({
            'MetricName': 'TotalMonthlyCost',
            'Value': total_cost,
            'Unit': 'None'
        })
        
        # Service-specific costs
        for service, cost in service_costs.items():
            metrics.append({
                'MetricName': f'{service}Cost',
                'Value': cost,
                'Unit': 'None'
            })
        
        # Publish metrics
        cloudwatch.put_metric_data(
            Namespace=f'Medeez/${event.get("environment", "unknown")}/Costs',
            MetricData=metrics
        )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'total_cost': total_cost,
                'service_costs': service_costs
            })
        }
        
    except Exception as e:
        print(f"Error monitoring costs: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
      `),
      environment: {
        ENVIRONMENT: environment,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });

    // Grant permissions for cost monitoring
    costMonitoringFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ce:GetCostAndUsage',
          'ce:GetDimensionValues',
          'ce:GetReservationCoverage',
          'ce:GetReservationPurchaseRecommendation',
          'ce:GetReservationUtilization',
          'cloudwatch:PutMetricData',
        ],
        resources: ['*'],
      })
    );

    // Schedule cost monitoring
    const costMonitoringRule = new cdk.aws_events.Rule(this, 'CostMonitoringRule', {
      ruleName: `medeez-${environment}-cost-monitoring-rule`,
      description: 'Daily cost monitoring',
      schedule: cdk.aws_events.Schedule.rate(cdk.Duration.hours(24)),
      targets: [
        new cdk.aws_events_targets.LambdaFunction(costMonitoringFunction, {
          event: cdk.aws_events.RuleTargetInput.fromObject({ environment }),
        }),
      ],
    });

    // Log retention settings
    new logs.LogRetentionPolicy(this, 'ApiLogRetention', {
      logGroupName: `/aws/lambda/${apiFunction.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    new logs.LogRetentionPolicy(this, 'CostMonitoringLogRetention', {
      logGroupName: `/aws/lambda/${costMonitoringFunction.functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    // Store monitoring configuration in Parameter Store
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
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
      exportName: `MedeezDashboardUrl-${environment}`,
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS Alert Topic ARN',
      exportName: `MedeezAlertTopicArn-${environment}`,
    });
  }
}