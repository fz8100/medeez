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
exports.MonitoringStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
class MonitoringStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, config, dynamoTable, apiFunction, apiGateway, cloudFrontDistribution } = props;
        // SNS Topic for alerts
        this.alertTopic = new sns.Topic(this, 'AlertTopic', {
            topicName: `medeez-${environment}-alerts`,
            displayName: `Medeez ${environment} Alerts`,
        });
        // Email subscription for alerts
        this.alertTopic.addSubscription(new snsSubscriptions.EmailSubscription(config.monitoring.alertEmail));
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
        this.dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'Lambda Performance',
            left: [lambdaInvocationsMetric, lambdaErrorsMetric],
            right: [lambdaDurationMetric],
            width: 24,
            height: 6,
        }));
        this.dashboard.addWidgets(new cloudwatch.GraphWidget({
            title: 'DynamoDB Errors',
            left: [dynamoReadThrottleMetric, dynamoWriteThrottleMetric],
            width: 24,
            height: 6,
        }));
        // Alarms
        const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
            alarmName: `medeez-${environment}-lambda-errors`,
            alarmDescription: 'Lambda function high error rate',
            metric: lambdaErrorsMetric,
            threshold: 5,
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });
        lambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        const lambdaDurationAlarm = new cloudwatch.Alarm(this, 'LambdaDurationAlarm', {
            alarmName: `medeez-${environment}-lambda-duration`,
            alarmDescription: 'Lambda function high duration',
            metric: lambdaDurationMetric,
            threshold: 10000, // 10 seconds
            evaluationPeriods: 3,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });
        lambdaDurationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
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
exports.MonitoringStack = MonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21vbml0b3Jpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFDeEUseURBQTJDO0FBQzNDLG9GQUFzRTtBQUd0RSxtRUFBcUQ7QUFFckQsMkRBQTZDO0FBQzdDLHlEQUEyQztBQWEzQyxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFJNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxzQkFBc0IsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUVwRyx1QkFBdUI7UUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNsRCxTQUFTLEVBQUUsVUFBVSxXQUFXLFNBQVM7WUFDekMsV0FBVyxFQUFFLFVBQVUsV0FBVyxTQUFTO1NBQzVDLENBQUMsQ0FBQztRQUVILGdDQUFnQztRQUNoQyxJQUFJLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FDN0IsSUFBSSxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUNyRSxDQUFDO1FBRUYsdUJBQXVCO1FBQ3ZCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxVQUFVLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNqRSxhQUFhLEVBQUUsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLGFBQWEsSUFBSSxXQUFXLEVB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QUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhO1lBQ25DLFdBQVcsRUFBRSwyQkFBMkI7WUFDeEMsVUFBVSxFQUFFLHVCQUF1QixXQUFXLEVBQUU7U0FDakQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUTtZQUMvQixXQUFXLEVBQUUscUJBQXFCO1lBQ2xDLFVBQVUsRUFBRSx1QkFBdUIsV0FBVyxFQUFFO1NBQ2pELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3RDLEtBQUssRUFBRSxXQUFXLElBQUksQ0FBQyxNQUFNLGtEQUFrRCxJQUFJLENBQUMsTUFBTSxvQkFBb0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUU7WUFDNUksV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsc0JBQXNCLFdBQVcsRUFBRTtTQUNoRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1SUQsMENBNElDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzbnNTdWJzY3JpcHRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuaW50ZXJmYWNlIE1vbml0b3JpbmdTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnO1xuICBkeW5hbW9UYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIGFwaUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG4gIGFwaUdhdGV3YXk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcbiAgY2xvdWRGcm9udERpc3RyaWJ1dGlvbj86IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xufVxuXG5leHBvcnQgY2xhc3MgTW9uaXRvcmluZ1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGRhc2hib2FyZDogY2xvdWR3YXRjaC5EYXNoYm9hcmQ7XG4gIHB1YmxpYyByZWFkb25seSBhbGVydFRvcGljOiBzbnMuVG9waWM7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE1vbml0b3JpbmdTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBjb25maWcsIGR5bmFtb1RhYmxlLCBhcGlGdW5jdGlvbiwgYXBpR2F0ZXdheSwgY2xvdWRGcm9udERpc3RyaWJ1dGlvbiB9ID0gcHJvcHM7XG5cbiAgICAvLyBTTlMgVG9waWMgZm9yIGFsZXJ0c1xuICAgIHRoaXMuYWxlcnRUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0FsZXJ0VG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tYWxlcnRzYCxcbiAgICAgIGRpc3BsYXlOYW1lOiBgTWVkZWV6ICR7ZW52aXJvbm1lbnR9IEFsZXJ0c2AsXG4gICAgfSk7XG5cbiAgICAvLyBFbWFpbCBzdWJzY3JpcHRpb24gZm9yIGFsZXJ0c1xuICAgIHRoaXMuYWxlcnRUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgc25zU3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihjb25maWcubW9uaXRvcmluZy5hbGVydEVtYWlsKVxuICAgICk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIERhc2hib2FyZFxuICAgIHRoaXMuZGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdNZWRlZXpEYXNoYm9hcmQnLCB7XG4gICAgICBkYXNoYm9hcmROYW1lOiBgJHtjb25maWcubW9uaXRvcmluZy5kYXNoYm9hcmROYW1lfS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZWZhdWx0SW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBNZXRyaWNzXG4gICAgY29uc3QgbGFtYmRhRXJyb3JzTWV0cmljID0gYXBpRnVuY3Rpb24ubWV0cmljRXJyb3JzKHtcbiAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbGFtYmRhRHVyYXRpb25NZXRyaWMgPSBhcGlGdW5jdGlvbi5tZXRyaWNEdXJhdGlvbih7XG4gICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgfSk7XG5cbiAgICBjb25zdCBsYW1iZGFJbnZvY2F0aW9uc01ldHJpYyA9IGFwaUZ1bmN0aW9uLm1ldHJpY0ludm9jYXRpb25zKHtcbiAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgTWV0cmljc1xuICAgIGNvbnN0IGR5bmFtb1JlYWRUaHJvdHRsZU1ldHJpYyA9IGR5bmFtb1RhYmxlLm1ldHJpY1VzZXJFcnJvcnMoe1xuICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgfSk7XG5cbiAgICBjb25zdCBkeW5hbW9Xcml0ZVRocm90dGxlTWV0cmljID0gZHluYW1vVGFibGUubWV0cmljU3lzdGVtRXJyb3JzRm9yT3BlcmF0aW9ucyh7XG4gICAgICBvcGVyYXRpb25zOiBbZHluYW1vZGIuT3BlcmF0aW9uLlBVVF9JVEVNLCBkeW5hbW9kYi5PcGVyYXRpb24uVVBEQVRFX0lURU1dLFxuICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgfSk7XG5cbiAgICAvLyBEYXNoYm9hcmQgV2lkZ2V0c1xuICAgIHRoaXMuZGFzaGJvYXJkLmFkZFdpZGdldHMoXG4gICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgIHRpdGxlOiAnTGFtYmRhIFBlcmZvcm1hbmNlJyxcbiAgICAgICAgbGVmdDogW2xhbWJkYUludm9jYXRpb25zTWV0cmljLCBsYW1iZGFFcnJvcnNNZXRyaWNdLFxuICAgICAgICByaWdodDogW2xhbWJkYUR1cmF0aW9uTWV0cmljXSxcbiAgICAgICAgd2lkdGg6IDI0LFxuICAgICAgICBoZWlnaHQ6IDYsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLmRhc2hib2FyZC5hZGRXaWRnZXRzKFxuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogJ0R5bmFtb0RCIEVycm9ycycsXG4gICAgICAgIGxlZnQ6IFtkeW5hbW9SZWFkVGhyb3R0bGVNZXRyaWMsIGR5bmFtb1dyaXRlVGhyb3R0bGVNZXRyaWNdLFxuICAgICAgICB3aWR0aDogMjQsXG4gICAgICAgIGhlaWdodDogNixcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFsYXJtc1xuICAgIGNvbnN0IGxhbWJkYUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnTGFtYmRhRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1sYW1iZGEtZXJyb3JzYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdMYW1iZGEgZnVuY3Rpb24gaGlnaCBlcnJvciByYXRlJyxcbiAgICAgIG1ldHJpYzogbGFtYmRhRXJyb3JzTWV0cmljLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgfSk7XG5cbiAgICBsYW1iZGFFcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKFxuICAgICAgbmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpXG4gICAgKTtcblxuICAgIGNvbnN0IGxhbWJkYUR1cmF0aW9uQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnTGFtYmRhRHVyYXRpb25BbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1sYW1iZGEtZHVyYXRpb25gLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBoaWdoIGR1cmF0aW9uJyxcbiAgICAgIG1ldHJpYzogbGFtYmRhRHVyYXRpb25NZXRyaWMsXG4gICAgICB0aHJlc2hvbGQ6IDEwMDAwLCAvLyAxMCBzZWNvbmRzXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX1RIUkVTSE9MRCxcbiAgICB9KTtcblxuICAgIGxhbWJkYUR1cmF0aW9uQWxhcm0uYWRkQWxhcm1BY3Rpb24oXG4gICAgICBuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYylcbiAgICApO1xuXG4gICAgLy8gTG9nIEdyb3VwcyBmb3IgcHJvcGVyIHJldGVudGlvblxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBcGlMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7YXBpRnVuY3Rpb24uZnVuY3Rpb25OYW1lfWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIGNvbmZpZ3VyYXRpb24gaW4gUGFyYW1ldGVyIFN0b3JlXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0Rhc2hib2FyZFVybFBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L21vbml0b3JpbmcvZGFzaGJvYXJkLXVybGAsXG4gICAgICBzdHJpbmdWYWx1ZTogYGh0dHBzOi8vJHt0aGlzLnJlZ2lvbn0uY29uc29sZS5hd3MuYW1hem9uLmNvbS9jbG91ZHdhdGNoL2hvbWU/cmVnaW9uPSR7dGhpcy5yZWdpb259I2Rhc2hib2FyZHM6bmFtZT0ke3RoaXMuZGFzaGJvYXJkLmRhc2hib2FyZE5hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRXYXRjaCBEYXNoYm9hcmQgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdBbGVydFRvcGljQXJuUGFyYW1ldGVyJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9tZWRlZXovJHtlbnZpcm9ubWVudH0vbW9uaXRvcmluZy9hbGVydC10b3BpYy1hcm5gLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMuYWxlcnRUb3BpYy50b3BpY0FybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU05TIEFsZXJ0IFRvcGljIEFSTicsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Rhc2hib2FyZE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kYXNoYm9hcmQuZGFzaGJvYXJkTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRXYXRjaCBEYXNoYm9hcmQgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6RGFzaGJvYXJkTmFtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxlcnRUb3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFsZXJ0VG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyBBbGVydCBUb3BpYyBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlekFsZXJ0VG9waWNBcm4tJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Rhc2hib2FyZFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3RoaXMucmVnaW9ufS5jb25zb2xlLmF3cy5hbWF6b24uY29tL2Nsb3Vkd2F0Y2gvaG9tZT9yZWdpb249JHt0aGlzLnJlZ2lvbn0jZGFzaGJvYXJkczpuYW1lPSR7dGhpcy5kYXNoYm9hcmQuZGFzaGJvYXJkTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZFdhdGNoIERhc2hib2FyZCBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlekRhc2hib2FyZFVybC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG4gIH1cbn0iXX0=