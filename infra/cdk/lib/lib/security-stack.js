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
exports.SecurityStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const kms = __importStar(require("aws-cdk-lib/aws-kms"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const wafv2 = __importStar(require("aws-cdk-lib/aws-wafv2"));
class SecurityStack extends cdk.Stack {
    constructor(scope, id, props) {
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
    createSecrets(environment) {
        const secrets = {};
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
    createWebAcl(environment) {
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
    createIPWhitelist(environment) {
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
exports.SecurityStack = SecurityStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zZWN1cml0eS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLCtFQUFpRTtBQUNqRSx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDZEQUErQztBQVMvQyxNQUFhLGFBQWMsU0FBUSxHQUFHLENBQUMsS0FBSztJQU0xQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXRDLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQzlDLEtBQUssRUFBRSxVQUFVLFdBQVcsTUFBTTtZQUNsQyxXQUFXLEVBQUUsc0JBQXNCLFdBQVcsY0FBYztZQUM1RCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGNBQWMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7WUFDdEMsYUFBYSxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDNUYsTUFBTSxFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztnQkFDN0IsVUFBVSxFQUFFO29CQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzt3QkFDdEIsR0FBRyxFQUFFLDBCQUEwQjt3QkFDL0IsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzt3QkFD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cnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBzZWNyZXRzbWFuYWdlciBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VjcmV0c21hbmFnZXInO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgd2FmdjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXdhZnYyJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2NvbmZpZyc7XG5cbmludGVyZmFjZSBTZWN1cml0eVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWc7XG59XG5cbmV4cG9ydCBjbGFzcyBTZWN1cml0eVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGttc0tleToga21zLktleTtcbiAgcHVibGljIHJlYWRvbmx5IGFwaVJvbGU6IGlhbS5Sb2xlO1xuICAvLyBwdWJsaWMgcmVhZG9ubHkgd2ViQWNsOiB3YWZ2Mi5DZm5XZWJBQ0w7XG4gIHB1YmxpYyByZWFkb25seSBzZWNyZXRzOiBSZWNvcmQ8c3RyaW5nLCBzZWNyZXRzbWFuYWdlci5TZWNyZXQ+O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTZWN1cml0eVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGNvbmZpZyB9ID0gcHJvcHM7XG5cbiAgICAvLyBLTVMgS2V5IGZvciBlbmNyeXB0aW9uIGF0IHJlc3RcbiAgICB0aGlzLmttc0tleSA9IG5ldyBrbXMuS2V5KHRoaXMsICdNZWRlZXpLTVNLZXknLCB7XG4gICAgICBhbGlhczogYG1lZGVlei0ke2Vudmlyb25tZW50fS1rZXlgLFxuICAgICAgZGVzY3JpcHRpb246IGBLTVMga2V5IGZvciBNZWRlZXogJHtlbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgZW5hYmxlS2V5Um90YXRpb246IHRydWUsXG4gICAgICByb3RhdGlvblBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMzY1KSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHNpZDogJ0VuYWJsZUlBTVVzZXJQZXJtaXNzaW9ucycsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BY2NvdW50Um9vdFByaW5jaXBhbCgpXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFsna21zOionXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgfSksXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgc2lkOiAnQWxsb3dDbG91ZFdhdGNoTG9ncycsXG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKGBsb2dzLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb21gKV0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICdrbXM6RW5jcnlwdCcsXG4gICAgICAgICAgICAgICdrbXM6RGVjcnlwdCcsXG4gICAgICAgICAgICAgICdrbXM6UmVFbmNyeXB0KicsXG4gICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5KicsXG4gICAgICAgICAgICAgICdrbXM6RGVzY3JpYmVLZXknLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIElBTSBSb2xlIGZvciBBUEkgTGFtYmRhXG4gICAgdGhpcy5hcGlSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBcGlSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tYXBpLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogJ0lBTSByb2xlIGZvciBNZWRlZXogQVBJIExhbWJkYSBmdW5jdGlvbnMnLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FXU1hSYXlEYWVtb25Xcml0ZUFjY2VzcycpLFxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIER5bmFtb0RCUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpCYXRjaEdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRSZWNvcmRzJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0U2hhcmRJdGVyYXRvcicsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkRlc2NyaWJlU3RyZWFtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6TGlzdFN0cmVhbXMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvbWVkZWV6LSR7ZW52aXJvbm1lbnR9LSpgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9tZWRlZXotJHtlbnZpcm9ubWVudH0tKi9pbmRleC8qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvbWVkZWV6LSR7ZW52aXJvbm1lbnR9LSovc3RyZWFtLypgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIFMzUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uJyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0QWNsJyxcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0QWNsJyxcbiAgICAgICAgICAgICAgICAnczM6QWJvcnRNdWx0aXBhcnRVcGxvYWQnLFxuICAgICAgICAgICAgICAgICdzMzpMaXN0TXVsdGlwYXJ0VXBsb2FkUGFydHMnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzMzo6Om1lZGVlei0ke2Vudmlyb25tZW50fS0qLypgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgICAgICAgICAnczM6R2V0QnVja2V0TG9jYXRpb24nLFxuICAgICAgICAgICAgICAgICdzMzpHZXRCdWNrZXRWZXJzaW9uaW5nJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6czM6OjptZWRlZXotJHtlbnZpcm9ubWVudH0tKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgICAgS01TUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdrbXM6RW5jcnlwdCcsXG4gICAgICAgICAgICAgICAgJ2ttczpEZWNyeXB0JyxcbiAgICAgICAgICAgICAgICAna21zOlJlRW5jcnlwdConLFxuICAgICAgICAgICAgICAgICdrbXM6R2VuZXJhdGVEYXRhS2V5KicsXG4gICAgICAgICAgICAgICAgJ2ttczpEZXNjcmliZUtleScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3RoaXMua21zS2V5LmtleUFybl0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgICAgU2VjcmV0c01hbmFnZXJQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6RGVzY3JpYmVTZWNyZXQnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c2VjcmV0Om1lZGVlei0ke2Vudmlyb25tZW50fS0qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBTU01Qb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVycycsXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXJzQnlQYXRoJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6c3NtOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpwYXJhbWV0ZXIvbWVkZWV6LyR7ZW52aXJvbm1lbnR9LypgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIENsb3VkV2F0Y2hQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJyxcbiAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBFdmVudEJyaWRnZVBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZXZlbnRzOlB1dEV2ZW50cycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOmV2ZW50czoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZXZlbnQtYnVzL21lZGVlei0ke2Vudmlyb25tZW50fS0qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBBV1MgU2VjcmV0cyBNYW5hZ2VyIHNlY3JldHNcbiAgICB0aGlzLnNlY3JldHMgPSB0aGlzLmNyZWF0ZVNlY3JldHMoZW52aXJvbm1lbnQpO1xuXG4gICAgLy8gVE9ETzogV0FGIFdlYiBBQ0wgZm9yIEFQSSBwcm90ZWN0aW9uXG4gICAgLy8gdGhpcy53ZWJBY2wgPSB0aGlzLmNyZWF0ZVdlYkFjbChlbnZpcm9ubWVudCk7XG5cbiAgICAvLyBTdG9yZSBzZWN1cml0eSBjb25maWd1cmF0aW9uIGluIFBhcmFtZXRlciBTdG9yZVxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdLTVNLZXlJZFBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2ttcy9rZXktaWRgLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMua21zS2V5LmtleUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgS2V5IElEIGZvciBlbmNyeXB0aW9uJyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdLbXNLZXlBcm4nLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL21lZGVlei8ke2Vudmlyb25tZW50fS9rbXMva2V5LWFybmAsXG4gICAgICBzdHJpbmdWYWx1ZTogdGhpcy5rbXNLZXkua2V5QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgS2V5IEFSTiBmb3IgZW5jcnlwdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQXBpUm9sZUFyblBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2lhbS9hcGktcm9sZS1hcm5gLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMuYXBpUm9sZS5yb2xlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgTGFtYmRhIHJvbGUgQVJOJyxcbiAgICB9KTtcblxuICAgIC8vIFRPRE86IEFkZCBXQUYgV2ViIEFDTCBwYXJhbWV0ZXIgd2hlbiBpbXBsZW1lbnRlZFxuICAgIC8vIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdXZWJBY2xBcm4nLCB7XG4gICAgLy8gICBwYXJhbWV0ZXJOYW1lOiBgL21lZGVlei8ke2Vudmlyb25tZW50fS93YWYvd2ViLWFjbC1hcm5gLFxuICAgIC8vICAgc3RyaW5nVmFsdWU6IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgLy8gICBkZXNjcmlwdGlvbjogJ1dBRiBXZWIgQUNMIEFSTicsXG4gICAgLy8gfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0tNU0tleUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMua21zS2V5LmtleUlkLFxuICAgICAgZGVzY3JpcHRpb246ICdLTVMgS2V5IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpLbXNLZXlJZC0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpUm9sZUFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaVJvbGUucm9sZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIExhbWJkYSBSb2xlIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6QXBpUm9sZUFybi0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICAvLyBUT0RPOiBBZGQgV0FGIFdlYiBBQ0wgb3V0cHV0IHdoZW4gaW1wbGVtZW50ZWRcbiAgICAvLyBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnV2ViQWNsQXJuJywge1xuICAgIC8vICAgdmFsdWU6IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgLy8gICBkZXNjcmlwdGlvbjogJ1dBRiBXZWIgQUNMIEFSTicsXG4gICAgLy8gICBleHBvcnROYW1lOiBgTWVkZWV6V2ViQWNsQXJuLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAvLyB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU2VjcmV0cyhlbnZpcm9ubWVudDogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc2VjcmV0c21hbmFnZXIuU2VjcmV0PiB7XG4gICAgY29uc3Qgc2VjcmV0czogUmVjb3JkPHN0cmluZywgc2VjcmV0c21hbmFnZXIuU2VjcmV0PiA9IHt9O1xuXG4gICAgLy8gSldUIFNlY3JldFxuICAgIHNlY3JldHMuand0U2VjcmV0ID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnSnd0U2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1qd3Qtc2VjcmV0YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSldUIHNpZ25pbmcgc2VjcmV0IGZvciBhdXRoZW50aWNhdGlvbiB0b2tlbnMnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHt9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdzZWNyZXQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJyAlK35gIyQmKigpfFtde306Ozw+PyFcXCcvQFwiXFxcXCcsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiA2NCxcbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICB9KTtcblxuICAgIC8vIEVuY3J5cHRpb24gS2V5IGZvciBQSEkgZGF0YVxuICAgIHNlY3JldHMuZW5jcnlwdGlvbktleSA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ0VuY3J5cHRpb25LZXknLCB7XG4gICAgICBzZWNyZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWVuY3J5cHRpb24ta2V5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW5jcnlwdGlvbiBrZXkgZm9yIFBISSBkYXRhIGF0IGFwcGxpY2F0aW9uIGxldmVsJyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7fSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAna2V5JyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICcgJSt+YCMkJiooKXxbXXt9Ojs8Pj8hXFwnL0BcIlxcXFwnLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogMzIsXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgfSk7XG5cbiAgICAvLyBTZXNzaW9uIFNlY3JldFxuICAgIHNlY3JldHMuc2Vzc2lvblNlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1Nlc3Npb25TZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LXNlc3Npb24tc2VjcmV0YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2Vzc2lvbiBzaWduaW5nIHNlY3JldCBmb3Igd2ViIHNlc3Npb25zJyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0U3RyaW5nOiB7XG4gICAgICAgIHNlY3JldFN0cmluZ1RlbXBsYXRlOiBKU09OLnN0cmluZ2lmeSh7fSksXG4gICAgICAgIGdlbmVyYXRlU3RyaW5nS2V5OiAnc2VjcmV0JyxcbiAgICAgICAgZXhjbHVkZUNoYXJhY3RlcnM6ICcgJSt+YCMkJiooKXxbXXt9Ojs8Pj8hXFwnL0BcIlxcXFwnLFxuICAgICAgICBwYXNzd29yZExlbmd0aDogNjQsXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgfSk7XG5cbiAgICAvLyBXZWJob29rIFNlY3JldFxuICAgIHNlY3JldHMud2ViaG9va1NlY3JldCA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1dlYmhvb2tTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LXdlYmhvb2stc2VjcmV0YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjcmV0IGZvciB3ZWJob29rIHNpZ25hdHVyZSB2ZXJpZmljYXRpb24nLFxuICAgICAgZ2VuZXJhdGVTZWNyZXRTdHJpbmc6IHtcbiAgICAgICAgc2VjcmV0U3RyaW5nVGVtcGxhdGU6IEpTT04uc3RyaW5naWZ5KHt9KSxcbiAgICAgICAgZ2VuZXJhdGVTdHJpbmdLZXk6ICdzZWNyZXQnLFxuICAgICAgICBleGNsdWRlQ2hhcmFjdGVyczogJyAlK35gIyQmKigpfFtde306Ozw+PyFcXCcvQFwiXFxcXCcsXG4gICAgICAgIHBhc3N3b3JkTGVuZ3RoOiAzMixcbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICB9KTtcblxuICAgIC8vIFR3aWxpbyBDb25maWd1cmF0aW9uIChwbGFjZWhvbGRlcilcbiAgICBzZWNyZXRzLnR3aWxpbyA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1R3aWxpb1NlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tdHdpbGlvYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHdpbGlvIEFQSSBjcmVkZW50aWFscyBmb3IgU01TL3ZvaWNlJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIGFjY291bnRfc2lkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9BQ0NPVU5UX1NJRCcpLFxuICAgICAgICBhdXRoX3Rva2VuOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9BVVRIX1RPS0VOJyksXG4gICAgICAgIHBob25lX251bWJlcjogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfUEhPTkVfTlVNQkVSJyksXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgfSk7XG5cbiAgICAvLyBTdHJpcGUgQ29uZmlndXJhdGlvbiAocGxhY2Vob2xkZXIpXG4gICAgc2VjcmV0cy5zdHJpcGUgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdTdHJpcGVTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LXN0cmlwZWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1N0cmlwZSBBUEkgY3JlZGVudGlhbHMgZm9yIHBheW1lbnQgcHJvY2Vzc2luZycsXG4gICAgICBzZWNyZXRPYmplY3RWYWx1ZToge1xuICAgICAgICBwdWJsaXNoYWJsZV9rZXk6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX1BVQkxJU0hBQkxFX0tFWScpLFxuICAgICAgICBzZWNyZXRfa2V5OiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9TRUNSRVRfS0VZJyksXG4gICAgICAgIHdlYmhvb2tfc2VjcmV0OiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9XRUJIT09LX1NFQ1JFVCcpLFxuICAgICAgfSxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgIH0pO1xuXG4gICAgLy8gUGFkZGxlIENvbmZpZ3VyYXRpb24gKHBsYWNlaG9sZGVyKVxuICAgIHNlY3JldHMucGFkZGxlID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnUGFkZGxlU2VjcmV0Jywge1xuICAgICAgc2VjcmV0TmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1wYWRkbGVgLFxuICAgICAgZGVzY3JpcHRpb246ICdQYWRkbGUgQVBJIGNyZWRlbnRpYWxzIGZvciBzdWJzY3JpcHRpb24gbWFuYWdlbWVudCcsXG4gICAgICBzZWNyZXRPYmplY3RWYWx1ZToge1xuICAgICAgICB2ZW5kb3JfaWQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX1ZFTkRPUl9JRCcpLFxuICAgICAgICBhcGlfa2V5OiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9BUElfS0VZJyksXG4gICAgICAgIHB1YmxpY19rZXk6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX1BVQkxJQ19LRVknKSxcbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICB9KTtcblxuICAgIC8vIEdvb2dsZSBBUEkgQ29uZmlndXJhdGlvbiAocGxhY2Vob2xkZXIpXG4gICAgc2VjcmV0cy5nb29nbGUgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdHb29nbGVTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWdvb2dsZWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBBUEkgY3JlZGVudGlhbHMgZm9yIGNhbGVuZGFyIGFuZCBtYXBzIGludGVncmF0aW9uJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIGNsaWVudF9pZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfQ0xJRU5UX0lEJyksXG4gICAgICAgIGNsaWVudF9zZWNyZXQ6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0NMSUVOVF9TRUNSRVQnKSxcbiAgICAgICAgbWFwc19hcGlfa2V5OiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9NQVBTX0FQSV9LRVknKSxcbiAgICAgIH0sXG4gICAgICBlbmNyeXB0aW9uS2V5OiB0aGlzLmttc0tleSxcbiAgICB9KTtcblxuICAgIC8vIFNlbnRyeSBDb25maWd1cmF0aW9uIChwbGFjZWhvbGRlcilcbiAgICBzZWNyZXRzLnNlbnRyeSA9IG5ldyBzZWNyZXRzbWFuYWdlci5TZWNyZXQodGhpcywgJ1NlbnRyeVNlY3JldCcsIHtcbiAgICAgIHNlY3JldE5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tc2VudHJ5YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VudHJ5IGNvbmZpZ3VyYXRpb24gZm9yIGVycm9yIHRyYWNraW5nJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIGRzbjogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfU0VOVFJZX0RTTicpLFxuICAgICAgICBhdXRoX3Rva2VuOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9BVVRIX1RPS0VOJyksXG4gICAgICB9LFxuICAgICAgZW5jcnlwdGlvbktleTogdGhpcy5rbXNLZXksXG4gICAgfSk7XG5cbiAgICAvLyBEYXRhYmFzZSBVUkwgKGZvciBSRFMgYXVkaXQgbG9ncylcbiAgICBzZWNyZXRzLmRhdGFiYXNlVXJsID0gbmV3IHNlY3JldHNtYW5hZ2VyLlNlY3JldCh0aGlzLCAnRGF0YWJhc2VTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWRhdGFiYXNlLXVybGAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIGNvbm5lY3Rpb24gc3RyaW5nIGZvciBhdWRpdCBsb2dzJyxcbiAgICAgIHNlY3JldE9iamVjdFZhbHVlOiB7XG4gICAgICAgIHVybDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnUExBQ0VIT0xERVJfREFUQUJBU0VfVVJMJyksXG4gICAgICAgIGhvc3Q6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0hPU1QnKSxcbiAgICAgICAgcG9ydDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCgnNTQzMicpLFxuICAgICAgICBkYm5hbWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX0RCX05BTUUnKSxcbiAgICAgICAgdXNlcm5hbWU6IGNkay5TZWNyZXRWYWx1ZS51bnNhZmVQbGFpblRleHQoJ1BMQUNFSE9MREVSX1VTRVJOQU1FJyksXG4gICAgICAgIHBhc3N3b3JkOiBjZGsuU2VjcmV0VmFsdWUudW5zYWZlUGxhaW5UZXh0KCdQTEFDRUhPTERFUl9QQVNTV09SRCcpLFxuICAgICAgfSxcbiAgICAgIGVuY3J5cHRpb25LZXk6IHRoaXMua21zS2V5LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHNlY3JldHM7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVdlYkFjbChlbnZpcm9ubWVudDogc3RyaW5nKTogd2FmdjIuQ2ZuV2ViQUNMIHtcbiAgICByZXR1cm4gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCAnTWVkZWV6V2ViQWNsJywge1xuICAgICAgbmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS13ZWItYWNsYCxcbiAgICAgIHNjb3BlOiAnUkVHSU9OQUwnLFxuICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgIGRlc2NyaXB0aW9uOiBgV0FGIFdlYiBBQ0wgZm9yIE1lZGVleiAke2Vudmlyb25tZW50fSBlbnZpcm9ubWVudGAsXG4gICAgICBydWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgIG92ZXJyaWRlQWN0aW9uOiB7IG5vbmU6IHt9IH0sXG4gICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIHZlbmRvck5hbWU6ICdBV1MnLFxuICAgICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdDb21tb25SdWxlU2V0TWV0cmljJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0tub3duQmFkSW5wdXRzUnVsZVNldCcsXG4gICAgICAgICAgcHJpb3JpdHk6IDIsXG4gICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnS25vd25CYWRJbnB1dHNSdWxlU2V0TWV0cmljJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc1NRTGlSdWxlU2V0JyxcbiAgICAgICAgICBwcmlvcml0eTogMyxcbiAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc1NRTGlSdWxlU2V0JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ1NRTGlSdWxlU2V0TWV0cmljJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ1JhdGVMaW1pdFJ1bGUnLFxuICAgICAgICAgIHByaW9yaXR5OiA0LFxuICAgICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBsaW1pdDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIwMDAgOiA1MDAwLFxuICAgICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnUmF0ZUxpbWl0TWV0cmljJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0dlb0Jsb2NrUnVsZScsXG4gICAgICAgICAgcHJpb3JpdHk6IDUsXG4gICAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgZ2VvTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgLy8gQmxvY2sgcmVxdWVzdHMgZnJvbSBjb3VudHJpZXMga25vd24gZm9yIG1hbGljaW91cyBhY3Rpdml0eVxuICAgICAgICAgICAgICBjb3VudHJ5Q29kZXM6IFsnQ04nLCAnUlUnLCAnS1AnLCAnSVInXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0dlb0Jsb2NrTWV0cmljJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ0lQV2hpdGVsaXN0UnVsZScsXG4gICAgICAgICAgcHJpb3JpdHk6IDYsXG4gICAgICAgICAgYWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgaXBTZXRSZWZlcmVuY2VTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgYXJuOiB0aGlzLmNyZWF0ZUlQV2hpdGVsaXN0KGVudmlyb25tZW50KS5hdHRyQXJuLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnSVBXaGl0ZWxpc3RNZXRyaWMnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBNZWRlZXpXZWJBQ0wke2Vudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVJUFdoaXRlbGlzdChlbnZpcm9ubWVudDogc3RyaW5nKTogd2FmdjIuQ2ZuSVBTZXQge1xuICAgIHJldHVybiBuZXcgd2FmdjIuQ2ZuSVBTZXQodGhpcywgJ0lQV2hpdGVsaXN0Jywge1xuICAgICAgbmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1pcC13aGl0ZWxpc3RgLFxuICAgICAgc2NvcGU6ICdSRUdJT05BTCcsXG4gICAgICBpcEFkZHJlc3NWZXJzaW9uOiAnSVBWNCcsXG4gICAgICBhZGRyZXNzZXM6IFtcbiAgICAgICAgLy8gQWRkIHRydXN0ZWQgSVAgYWRkcmVzc2VzIGhlcmVcbiAgICAgICAgLy8gRm9yIG5vdywgd2UnbGwgYWxsb3cgYWxsIElQcyBieSBub3Qgc3BlY2lmeWluZyBhbnkgKGVtcHR5IGxpc3QgYmxvY2tzIG5vbmUpXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246ICdJUCB3aGl0ZWxpc3QgZm9yIHRydXN0ZWQgc291cmNlcycsXG4gICAgfSk7XG4gIH1cbn0iXX0=