import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvironmentConfig, getSecretNames } from './config';

interface SecurityStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
}

export class SecurityStack extends cdk.Stack {
  public readonly kmsKey: kms.Key;
  public readonly apiRole: iam.Role;
  public readonly secrets: Record<string, secretsmanager.Secret>;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    const { environment, config } = props;
    const secretNames = getSecretNames(environment);

    // KMS Key for encryption at rest
    this.kmsKey = new kms.Key(this, 'MedeezKMSKey', {
      alias: `medeez-${environment}-key`,
      description: `KMS key for Medeez ${environment} environment`,
      enableKeyRotation: true,
      rotationPeriod: cdk.Duration.days(365),
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'EnableIAMUserPermissions',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'AllowCloudWatchLogs',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
            actions: [
              'kms:Encrypt',
              'kms:Decrypt',
              'kms:ReEncrypt*',
              'kms:GenerateDataKey*',
              'kms:DescribeKey',
            ],
            resources: ['*'],
          }),
        ],
      }),
    });

    // IAM Role for Lambda functions
    this.apiRole = new iam.Role(this, 'ApiRole', {
      roleName: `medeez-${environment}-api-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Medeez API Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
      inlinePolicies: {
        DynamoDBPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:Query',
                'dynamodb:Scan',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:BatchGetItem',
                'dynamodb:BatchWriteItem',
                'dynamodb:DescribeTable',
                'dynamodb:ConditionCheckItem',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/medeez-${environment}-*`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/medeez-${environment}-*/index/*`,
              ],
            }),
          ],
        }),
        S3Policy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:GetObjectVersion',
                's3:PutObjectAcl',
                's3:GetBucketLocation',
              ],
              resources: [
                `arn:aws:s3:::medeez-${environment}-*`,
                `arn:aws:s3:::medeez-${environment}-*/*`,
              ],
            }),
          ],
        }),
        KMSPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'kms:Encrypt',
                'kms:Decrypt',
                'kms:ReEncrypt*',
                'kms:GenerateDataKey*',
                'kms:DescribeKey',
              ],
              resources: [this.kmsKey.keyArn],
            }),
          ],
        }),
        SecretsManagerPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
              ],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:medeez-${environment}-*`,
              ],
            }),
          ],
        }),
        ParameterStorePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath',
              ],
              resources: [
                `arn:aws:ssm:${this.region}:${this.account}:parameter/medeez/${environment}/*`,
              ],
            }),
          ],
        }),
        SESPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
              ],
              resources: ['*'],
            }),
          ],
        }),
        EventBridgePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'events:PutEvents',
              ],
              resources: [
                `arn:aws:events:${this.region}:${this.account}:event-bus/medeez-${environment}-*`,
              ],
            }),
          ],
        }),
      },
    });

    // Create secrets for sensitive configuration
    this.secrets = {};

    // JWT Secret
    this.secrets.jwtSecret = new secretsmanager.Secret(this, 'JWTSecret', {
      secretName: secretNames.jwtSecret,
      description: 'JWT signing secret for Medeez API',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'medeez' }),
        generateStringKey: 'secret',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        passwordLength: 64,
      },
      encryptionKey: this.kmsKey,
    });

    // Paddle API Key Secret
    this.secrets.paddleApiKey = new secretsmanager.Secret(this, 'PaddleApiKey', {
      secretName: secretNames.paddleApiKey,
      description: 'Paddle API key for subscription management',
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder-paddle-api-key'),
      encryptionKey: this.kmsKey,
    });

    // Google Client Secret
    this.secrets.googleClientSecret = new secretsmanager.Secret(this, 'GoogleClientSecret', {
      secretName: secretNames.googleClientSecret,
      description: 'Google OAuth client secret for calendar integration',
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder-google-client-secret'),
      encryptionKey: this.kmsKey,
    });

    // Slack Webhook Secret
    this.secrets.slackWebhook = new secretsmanager.Secret(this, 'SlackWebhook', {
      secretName: secretNames.slackWebhook,
      description: 'Slack webhook URL for notifications',
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder-slack-webhook'),
      encryptionKey: this.kmsKey,
    });

    // Sentry DSN Secret
    this.secrets.sentry = new secretsmanager.Secret(this, 'SentryDSN', {
      secretName: secretNames.sentry,
      description: 'Sentry DSN for error tracking',
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder-sentry-dsn'),
      encryptionKey: this.kmsKey,
    });

    // Security headers policy for CloudFront
    const securityHeadersPolicy = new cdk.CfnResource(this, 'SecurityHeadersPolicy', {
      type: 'AWS::CloudFront::ResponseHeadersPolicy',
      properties: {
        ResponseHeadersPolicyConfig: {
          Name: `medeez-${environment}-security-headers`,
          SecurityHeadersConfig: {
            StrictTransportSecurity: {
              AccessControlMaxAgeSec: 31536000,
              IncludeSubdomains: true,
              Override: false,
            },
            ContentTypeOptions: {
              Override: false,
            },
            FrameOptions: {
              FrameOption: 'DENY',
              Override: false,
            },
            ReferrerPolicy: {
              ReferrerPolicy: 'strict-origin-when-cross-origin',
              Override: false,
            },
            ContentSecurityPolicy: {
              ContentSecurityPolicy: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.paddle.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.amazonaws.com wss://*.amazonaws.com; frame-src https://sandbox-checkout.paddle.com https://checkout.paddle.com;`,
              Override: false,
            },
          },
        },
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'KMSKeyId', {
      value: this.kmsKey.keyId,
      description: 'KMS Key ID for encryption',
      exportName: `MedeezKMSKeyId-${environment}`,
    });

    new cdk.CfnOutput(this, 'ApiRoleArn', {
      value: this.apiRole.roleArn,
      description: 'API Lambda Role ARN',
      exportName: `MedeezApiRoleArn-${environment}`,
    });

    new cdk.CfnOutput(this, 'SecurityHeadersPolicyId', {
      value: securityHeadersPolicy.ref,
      description: 'CloudFront Security Headers Policy ID',
      exportName: `MedeezSecurityHeadersPolicyId-${environment}`,
    });

    // Store common configuration in Parameter Store
    new ssm.StringParameter(this, 'KMSKeyIdParameter', {
      parameterName: `/medeez/${environment}/kms/key-id`,
      stringValue: this.kmsKey.keyId,
      description: 'KMS Key ID for encryption',
    });

    new ssm.StringParameter(this, 'ApiRoleArnParameter', {
      parameterName: `/medeez/${environment}/iam/api-role-arn`,
      stringValue: this.apiRole.roleArn,
      description: 'API Lambda Role ARN',
    });
  }
}