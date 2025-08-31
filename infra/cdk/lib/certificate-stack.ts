import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface CertificateStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
}

export class CertificateStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const { environment, config } = props;

    if (!config.domainName) {
      throw new Error('Domain name is required for certificate stack');
    }

    // Import or create hosted zone
    if (config.hostedZoneId) {
      this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: config.hostedZoneId,
        zoneName: config.domainName,
      });
    } else {
      this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
        zoneName: config.domainName,
        comment: `Hosted zone for Medeez ${environment} environment`,
      });

      // Store the hosted zone ID in Parameter Store
      new ssm.StringParameter(this, 'HostedZoneIdParameter', {
        parameterName: `/medeez/${environment}/route53/hosted-zone-id`,
        stringValue: this.hostedZone.hostedZoneId,
        description: 'Route53 Hosted Zone ID',
      });
    }

    // Create wildcard certificate for the domain and its subdomains
    const subjectAlternativeNames = environment === 'prod' ? [
      `www.${config.domainName}`,
      `api.${config.domainName}`,
      `book.${config.domainName}`,
      `admin.${config.domainName}`,
      `*.${config.domainName}` // Wildcard for additional subdomains
    ] : [
      `${environment}.${config.domainName}`,
      `api-${environment}.${config.domainName}`,
      `book-${environment}.${config.domainName}`,
      `admin-${environment}.${config.domainName}`,
      `*.${environment}.${config.domainName}`
    ];

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: environment === 'prod' ? config.domainName : `${environment}.${config.domainName}`,
      subjectAlternativeNames,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
      transparencyLoggingEnabled: true,
    });

    // Create additional certificates for different regions if needed
    if (environment === 'prod') {
      // CloudFront requires certificates in us-east-1
      const cloudfrontCertificate = new acm.Certificate(this, 'CloudFrontCertificate', {
        domainName: config.domainName,
        subjectAlternativeNames,
        validation: acm.CertificateValidation.fromDns(this.hostedZone),
        transparencyLoggingEnabled: true,
        region: 'us-east-1',
      });

      // Store CloudFront certificate ARN
      new ssm.StringParameter(this, 'CloudFrontCertificateArnParameter', {
        parameterName: `/medeez/${environment}/acm/cloudfront-certificate-arn`,
        stringValue: cloudfrontCertificate.certificateArn,
        description: 'ACM Certificate ARN for CloudFront (us-east-1)',
      });

      new cdk.CfnOutput(this, 'CloudFrontCertificateArn', {
        value: cloudfrontCertificate.certificateArn,
        description: 'ACM Certificate ARN for CloudFront',
        exportName: `MedeezCloudFrontCertificateArn-${environment}`,
      });
    }

    // Certificate monitoring and alerting
    const certificateAlarm = new cdk.aws_cloudwatch.Alarm(this, 'CertificateExpiryAlarm', {
      alarmName: `medeez-${environment}-certificate-expiry`,
      alarmDescription: 'SSL certificate is approaching expiry',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/CertificateManager',
        metricName: 'DaysToExpiry',
        dimensionsMap: {
          CertificateArn: this.certificate.certificateArn,
        },
        statistic: 'Minimum',
        period: cdk.Duration.days(1),
      }),
      threshold: 30, // Alert 30 days before expiry
      evaluationPeriods: 1,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.BREACHING,
    });

    // Create SNS topic for certificate alerts
    const alertTopic = new cdk.aws_sns.Topic(this, 'CertificateAlertTopic', {
      topicName: `medeez-${environment}-certificate-alerts`,
      displayName: `Medeez ${environment} Certificate Alerts`,
    });

    alertTopic.addSubscription(
      new cdk.aws_sns_subscriptions.EmailSubscription(config.monitoring.alertEmail)
    );

    certificateAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(alertTopic)
    );

    // Lambda function for certificate validation checking
    const certificateCheckerFunction = new cdk.aws_lambda.Function(this, 'CertificateChecker', {
      functionName: `medeez-${environment}-certificate-checker`,
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_11,
      handler: 'index.lambda_handler',
      code: cdk.aws_lambda.Code.fromInline(`
import json
import boto3
import ssl
import socket
import datetime
from urllib.parse import urlparse

def lambda_handler(event, context):
    """
    Check SSL certificate validity and expiration
    """
    acm_client = boto3.client('acm')
    cloudwatch = boto3.client('cloudwatch')
    
    domain_name = event.get('domain_name')
    certificate_arn = event.get('certificate_arn')
    
    try:
        # Check ACM certificate
        if certificate_arn:
            cert_details = acm_client.describe_certificate(CertificateArn=certificate_arn)
            cert_status = cert_details['Certificate']['Status']
            
            if cert_status != 'ISSUED':
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': f'Certificate status is {cert_status}',
                        'certificate_arn': certificate_arn
                    })
                }
        
        # Check domain SSL certificate
        if domain_name:
            context = ssl.create_default_context()
            
            try:
                with socket.create_connection((domain_name, 443), timeout=10) as sock:
                    with context.wrap_socket(sock, server_hostname=domain_name) as ssock:
                        cert = ssock.getpeercert()
                        
                        # Parse expiry date
                        expiry_date = datetime.datetime.strptime(
                            cert['notAfter'], 
                            '%b %d %H:%M:%S %Y %Z'
                        )
                        days_to_expiry = (expiry_date - datetime.datetime.now()).days
                        
                        # Send metric to CloudWatch
                        cloudwatch.put_metric_data(
                            Namespace=f'Medeez/{event.get("environment", "unknown")}/SSL',
                            MetricData=[
                                {
                                    'MetricName': 'DaysToExpiry',
                                    'Value': days_to_expiry,
                                    'Unit': 'Count',
                                    'Dimensions': [
                                        {
                                            'Name': 'Domain',
                                            'Value': domain_name
                                        }
                                    ]
                                }
                            ]
                        )
                        
                        return {
                            'statusCode': 200,
                            'body': json.dumps({
                                'domain': domain_name,
                                'days_to_expiry': days_to_expiry,
                                'expiry_date': expiry_date.isoformat(),
                                'issuer': cert['issuer'],
                                'subject': cert['subject']
                            })
                        }
                        
            except Exception as e:
                return {
                    'statusCode': 500,
                    'body': json.dumps({
                        'error': f'SSL check failed: {str(e)}',
                        'domain': domain_name
                    })
                }
        
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'No domain or certificate specified'})
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
      `),
      environment: {
        ENVIRONMENT: environment,
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
    });

    // Grant permissions to the certificate checker
    certificateCheckerFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'acm:DescribeCertificate',
          'acm:ListCertificates',
          'cloudwatch:PutMetricData',
        ],
        resources: ['*'],
      })
    );

    // Schedule certificate checker
    new cdk.aws_events.Rule(this, 'CertificateCheckRule', {
      ruleName: `medeez-${environment}-certificate-check`,
      description: 'Daily SSL certificate check',
      schedule: cdk.aws_events.Schedule.rate(cdk.Duration.hours(24)),
      targets: [
        new cdk.aws_events_targets.LambdaFunction(certificateCheckerFunction, {
          event: cdk.aws_events.RuleTargetInput.fromObject({
            environment,
            domain_name: config.domainName,
            certificate_arn: this.certificate.certificateArn,
          }),
        }),
      ],
    });

    // Store certificate configuration in Parameter Store
    new ssm.StringParameter(this, 'CertificateArnParameter', {
      parameterName: `/medeez/${environment}/acm/certificate-arn`,
      stringValue: this.certificate.certificateArn,
      description: 'ACM Certificate ARN',
    });

    new ssm.StringParameter(this, 'DomainNameParameter', {
      parameterName: `/medeez/${environment}/domain-name`,
      stringValue: config.domainName,
      description: 'Domain name',
    });

    // Certificate renewal automation (for external certificates)
    if (environment === 'prod') {
      const renewalFunction = new cdk.aws_lambda.Function(this, 'CertificateRenewal', {
        functionName: `medeez-${environment}-certificate-renewal`,
        runtime: cdk.aws_lambda.Runtime.PYTHON_3_11,
        handler: 'index.lambda_handler',
        code: cdk.aws_lambda.Code.fromInline(`
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    Handle certificate renewal notifications and actions
    """
    acm_client = boto3.client('acm')
    sns = boto3.client('sns')
    
    try:
        # Check for certificates nearing expiration
        certificates = acm_client.list_certificates(
            CertificateStatuses=['ISSUED']
        )
        
        renewals_needed = []
        
        for cert in certificates['CertificateSummaryList']:
            cert_arn = cert['CertificateArn']
            domain_name = cert['DomainName']
            
            # Get certificate details
            cert_details = acm_client.describe_certificate(CertificateArn=cert_arn)
            
            # ACM automatically renews certificates, but check status
            renewal_status = cert_details['Certificate'].get('RenewalEligibility')
            
            if renewal_status == 'INELIGIBLE':
                renewals_needed.append({
                    'domain': domain_name,
                    'certificate_arn': cert_arn,
                    'reason': 'Manual renewal required'
                })
        
        if renewals_needed:
            message = {
                'message': 'SSL certificates require attention',
                'certificates': renewals_needed,
                'environment': event.get('environment'),
                'timestamp': context.aws_request_id
            }
            
            # Send notification
            sns.publish(
                TopicArn=event.get('alert_topic_arn'),
                Subject='SSL Certificate Renewal Required',
                Message=json.dumps(message, indent=2)
            )
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'certificates_checked': len(certificates['CertificateSummaryList']),
                'renewals_needed': len(renewals_needed)
            })
        }
        
    except Exception as e:
        logger.error(f"Certificate renewal check failed: {str(e)}")
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

      renewalFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'acm:ListCertificates',
            'acm:DescribeCertificate',
            'sns:Publish',
          ],
          resources: ['*'],
        })
      );

      // Schedule renewal check
      new cdk.aws_events.Rule(this, 'CertificateRenewalCheckRule', {
        ruleName: `medeez-${environment}-certificate-renewal-check`,
        description: 'Weekly certificate renewal check',
        schedule: cdk.aws_events.Schedule.rate(cdk.Duration.days(7)),
        targets: [
          new cdk.aws_events_targets.LambdaFunction(renewalFunction, {
            event: cdk.aws_events.RuleTargetInput.fromObject({
              environment,
              alert_topic_arn: alertTopic.topicArn,
            }),
          }),
        ],
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM Certificate ARN',
      exportName: `MedeezCertificateArn-${environment}`,
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Route53 Hosted Zone ID',
      exportName: `MedeezHostedZoneId-${environment}`,
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: config.domainName,
      description: 'Domain name',
      exportName: `MedeezDomainName-${environment}`,
    });

    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(',', this.hostedZone.hostedZoneNameServers || []),
      description: 'Route53 Name Servers',
      exportName: `MedeezNameServers-${environment}`,
    });
  }
}