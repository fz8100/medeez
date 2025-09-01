import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface SecurityStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
}

export class SecurityStack extends cdk.Stack {
  public readonly kmsKey: kms.Key;
  public readonly apiRole: iam.Role;
  // public readonly webAcl: wafv2.CfnWebACL;
  public readonly secrets: Record<string, secretsmanager.Secret>;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    const { environment, config } = props;

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

    // IAM Role for API Lambda
    this.apiRole = new iam.Role(this, 'ApiRole', {
      roleName: `medeez-${environment}-api-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Medeez API Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
      inlinePolicies: {
        DynamoDBPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:BatchGetItem',
                'dynamodb:BatchWriteItem',
                'dynamodb:DeleteItem',
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:Query',
                'dynamodb:Scan',
                'dynamodb:UpdateItem',
                'dynamodb:GetRecords',
                'dynamodb:GetShardIterator',
                'dynamodb:DescribeStream',
                'dynamodb:ListStreams',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/medeez-${environment}-*`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/medeez-${environment}-*/index/*`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/medeez-${environment}-*/stream/*`,
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
                's3:GetObjectAcl',
                's3:AbortMultipartUpload',
                's3:ListMultipartUploadParts',
              ],
              resources: [
                `arn:aws:s3:::medeez-${environment}-*/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:ListBucket',
                's3:GetBucketLocation',
                's3:GetBucketVersioning',
              ],
              resources: [
                `arn:aws:s3:::medeez-${environment}-*`,
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
        SSMPolicy: new iam.PolicyDocument({
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
        CloudWatchPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'cloudwatch:PutMetricData',
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

    // Create AWS Secrets Manager secrets
    this.secrets = this.createSecrets(environment);

    // TODO: WAF Web ACL for API protection
    // this.webAcl = this.createWebAcl(environment);

    // Store security configuration in Parameter Store
    new ssm.StringParameter(this, 'KMSKeyIdParameter', {
      parameterName: `/medeez/${environment}/kms/key-id`,
      stringValue: this.kmsKey.keyId,
      description: 'KMS Key ID for encryption',
    });

    new ssm.StringParameter(this, 'KmsKeyArn', {
      parameterName: `/medeez/${environment}/kms/key-arn`,
      stringValue: this.kmsKey.keyArn,
      description: 'KMS Key ARN for encryption',
    });

    new ssm.StringParameter(this, 'ApiRoleArnParameter', {
      parameterName: `/medeez/${environment}/iam/api-role-arn`,
      stringValue: this.apiRole.roleArn,
      description: 'API Lambda role ARN',
    });

    // TODO: Add WAF Web ACL parameter when implemented
    // new ssm.StringParameter(this, 'WebAclArn', {
    //   parameterName: `/medeez/${environment}/waf/web-acl-arn`,
    //   stringValue: this.webAcl.attrArn,
    //   description: 'WAF Web ACL ARN',
    // });

    // Outputs
    new cdk.CfnOutput(this, 'KMSKeyId', {
      value: this.kmsKey.keyId,
      description: 'KMS Key ID',
      exportName: `MedeezKmsKeyId-${environment}`,
    });

    new cdk.CfnOutput(this, 'ApiRoleArn', {
      value: this.apiRole.roleArn,
      description: 'API Lambda Role ARN',
      exportName: `MedeezApiRoleArn-${environment}`,
    });

    // TODO: Add WAF Web ACL output when implemented
    // new cdk.CfnOutput(this, 'WebAclArn', {
    //   value: this.webAcl.attrArn,
    //   description: 'WAF Web ACL ARN',
    //   exportName: `MedeezWebAclArn-${environment}`,
    // });
  }

  private createSecrets(environment: string): Record<string, secretsmanager.Secret> {
    const secrets: Record<string, secretsmanager.Secret> = {};

    // JWT Secret
    secrets.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `medeez-${environment}-jwt-secret`,
      description: 'JWT signing secret for authentication tokens',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        passwordLength: 64,
      },
      encryptionKey: this.kmsKey,
    });

    // Encryption Key for PHI data
    secrets.encryptionKey = new secretsmanager.Secret(this, 'EncryptionKey', {
      secretName: `medeez-${environment}-encryption-key`,
      description: 'Encryption key for PHI data at application level',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'key',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        passwordLength: 32,
      },
      encryptionKey: this.kmsKey,
    });

    // Session Secret
    secrets.sessionSecret = new secretsmanager.Secret(this, 'SessionSecret', {
      secretName: `medeez-${environment}-session-secret`,
      description: 'Session signing secret for web sessions',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        passwordLength: 64,
      },
      encryptionKey: this.kmsKey,
    });

    // Webhook Secret
    secrets.webhookSecret = new secretsmanager.Secret(this, 'WebhookSecret', {
      secretName: `medeez-${environment}-webhook-secret`,
      description: 'Secret for webhook signature verification',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
        passwordLength: 32,
      },
      encryptionKey: this.kmsKey,
    });

    // Twilio Configuration (placeholder)
    secrets.twilio = new secretsmanager.Secret(this, 'TwilioSecret', {
      secretName: `medeez-${environment}-twilio`,
      description: 'Twilio API credentials for SMS/voice',
      secretObjectValue: {
        account_sid: cdk.SecretValue.unsafePlainText('PLACEHOLDER_ACCOUNT_SID'),
        auth_token: cdk.SecretValue.unsafePlainText('PLACEHOLDER_AUTH_TOKEN'),
        phone_number: cdk.SecretValue.unsafePlainText('PLACEHOLDER_PHONE_NUMBER'),
      },
      encryptionKey: this.kmsKey,
    });

    // Stripe Configuration (placeholder)
    secrets.stripe = new secretsmanager.Secret(this, 'StripeSecret', {
      secretName: `medeez-${environment}-stripe`,
      description: 'Stripe API credentials for payment processing',
      secretObjectValue: {
        publishable_key: cdk.SecretValue.unsafePlainText('PLACEHOLDER_PUBLISHABLE_KEY'),
        secret_key: cdk.SecretValue.unsafePlainText('PLACEHOLDER_SECRET_KEY'),
        webhook_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_WEBHOOK_SECRET'),
      },
      encryptionKey: this.kmsKey,
    });

    // Paddle Configuration (placeholder)
    secrets.paddle = new secretsmanager.Secret(this, 'PaddleSecret', {
      secretName: `medeez-${environment}-paddle`,
      description: 'Paddle API credentials for subscription management',
      secretObjectValue: {
        vendor_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_VENDOR_ID'),
        api_key: cdk.SecretValue.unsafePlainText('PLACEHOLDER_API_KEY'),
        public_key: cdk.SecretValue.unsafePlainText('PLACEHOLDER_PUBLIC_KEY'),
      },
      encryptionKey: this.kmsKey,
    });

    // Google API Configuration (placeholder)
    secrets.google = new secretsmanager.Secret(this, 'GoogleSecret', {
      secretName: `medeez-${environment}-google`,
      description: 'Google API credentials for calendar and maps integration',
      secretObjectValue: {
        client_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_CLIENT_ID'),
        client_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_CLIENT_SECRET'),
        maps_api_key: cdk.SecretValue.unsafePlainText('PLACEHOLDER_MAPS_API_KEY'),
      },
      encryptionKey: this.kmsKey,
    });

    // Sentry Configuration (placeholder)
    secrets.sentry = new secretsmanager.Secret(this, 'SentrySecret', {
      secretName: `medeez-${environment}-sentry`,
      description: 'Sentry configuration for error tracking',
      secretObjectValue: {
        dsn: cdk.SecretValue.unsafePlainText('PLACEHOLDER_SENTRY_DSN'),
        auth_token: cdk.SecretValue.unsafePlainText('PLACEHOLDER_AUTH_TOKEN'),
      },
      encryptionKey: this.kmsKey,
    });

    // Database URL (for RDS audit logs)
    secrets.databaseUrl = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `medeez-${environment}-database-url`,
      description: 'Database connection string for audit logs',
      secretObjectValue: {
        url: cdk.SecretValue.unsafePlainText('PLACEHOLDER_DATABASE_URL'),
        host: cdk.SecretValue.unsafePlainText('PLACEHOLDER_HOST'),
        port: cdk.SecretValue.unsafePlainText('5432'),
        dbname: cdk.SecretValue.unsafePlainText('PLACEHOLDER_DB_NAME'),
        username: cdk.SecretValue.unsafePlainText('PLACEHOLDER_USERNAME'),
        password: cdk.SecretValue.unsafePlainText('PLACEHOLDER_PASSWORD'),
      },
      encryptionKey: this.kmsKey,
    });

    return secrets;
  }

  private createWebAcl(environment: string): wafv2.CfnWebACL {
    return new wafv2.CfnWebACL(this, 'MedeezWebAcl', {
      name: `medeez-${environment}-web-acl`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      description: `WAF Web ACL for Medeez ${environment} environment`,
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric',
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsRuleSetMetric',
          },
        },
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSetMetric',
          },
        },
        {
          name: 'RateLimitRule',
          priority: 4,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: environment === 'prod' ? 2000 : 5000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitMetric',
          },
        },
        {
          name: 'GeoBlockRule',
          priority: 5,
          action: { block: {} },
          statement: {
            geoMatchStatement: {
              // Block requests from countries known for malicious activity
              countryCodes: ['CN', 'RU', 'KP', 'IR'],
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'GeoBlockMetric',
          },
        },
        {
          name: 'IPWhitelistRule',
          priority: 6,
          action: { allow: {} },
          statement: {
            ipSetReferenceStatement: {
              arn: this.createIPWhitelist(environment).attrArn,
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'IPWhitelistMetric',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `MedeezWebACL${environment}`,
      },
    });
  }

  private createIPWhitelist(environment: string): wafv2.CfnIPSet {
    return new wafv2.CfnIPSet(this, 'IPWhitelist', {
      name: `medeez-${environment}-ip-whitelist`,
      scope: 'REGIONAL',
      ipAddressVersion: 'IPV4',
      addresses: [
        // Add trusted IP addresses here
        // For now, we'll allow all IPs by not specifying any (empty list blocks none)
      ],
      description: 'IP whitelist for trusted sources',
    });
  }
}