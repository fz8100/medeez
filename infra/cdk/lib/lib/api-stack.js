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
exports.ApiStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const route53targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
class ApiStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, config, dynamoTable, s3Bucket, kmsKey, apiRole, userPool, userPoolClient } = props;
        // Use provided Cognito User Pool or create new one
        this.userPool = userPool || new cognito.UserPool(this, 'MedeezUserPool', {
            userPoolName: `medeez-${environment}-users`,
            selfSignUpEnabled: true,
            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            passwordPolicy: {
                minLength: config.cognito.passwordPolicy.minLength,
                requireLowercase: config.cognito.passwordPolicy.requireLowercase,
                requireUppercase: config.cognito.passwordPolicy.requireUppercase,
                requireDigits: config.cognito.passwordPolicy.requireDigits,
                requireSymbols: config.cognito.passwordPolicy.requireSymbols,
            },
            mfa: config.cognito.mfaConfiguration === 'OFF' ? cognito.Mfa.OFF :
                config.cognito.mfaConfiguration === 'OPTIONAL' ? cognito.Mfa.OPTIONAL :
                    cognito.Mfa.REQUIRED,
            mfaSecondFactor: {
                sms: true,
                otp: true,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            userVerification: {
                emailSubject: 'Welcome to Medeez - Verify your email',
                emailBody: 'Thank you for signing up to Medeez! Your verification code is {####}',
                emailStyle: cognito.VerificationEmailStyle.CODE,
            },
            userInvitation: {
                emailSubject: 'Welcome to Medeez',
                emailBody: 'Hello {username}, you have been invited to join Medeez. Your temporary password is {####}',
            },
            deviceTracking: {
                challengeRequiredOnNewDevice: true,
                deviceOnlyRememberedOnUserPrompt: false,
            },
            standardAttributes: {
                email: {
                    required: true,
                    mutable: true,
                },
                givenName: {
                    required: true,
                    mutable: true,
                },
                familyName: {
                    required: true,
                    mutable: true,
                },
            },
            customAttributes: {
                npi: new cognito.StringAttribute({ mutable: true }),
                clinicId: new cognito.StringAttribute({ mutable: true }),
                timezone: new cognito.StringAttribute({ mutable: true }),
                role: new cognito.StringAttribute({ mutable: true }),
            },
            removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
        });
        // Use provided User Pool Client or create new one
        this.userPoolClient = userPoolClient || new cognito.UserPoolClient(this, 'MedeezUserPoolClient', {
            userPool: this.userPool,
            userPoolClientName: `medeez-${environment}-client`,
            generateSecret: false,
            authFlows: {
                userPassword: true,
                userSrp: true,
                custom: true,
                adminUserPassword: true,
            },
            preventUserExistenceErrors: true,
            refreshTokenValidity: cdk.Duration.days(30),
            accessTokenValidity: cdk.Duration.hours(1),
            idTokenValidity: cdk.Duration.hours(1),
            enableTokenRevocation: true,
            oAuth: {
                flows: {
                    authorizationCodeGrant: true,
                    implicitCodeGrant: false,
                },
                scopes: [
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callbackUrls: [
                    `https://${config.domainName}/auth/callback`,
                    'http://localhost:3000/auth/callback',
                ],
                logoutUrls: [
                    `https://${config.domainName}/auth/logout`,
                    'http://localhost:3000/auth/logout',
                ],
            },
        });
        // User Pool Domain
        const userPoolDomain = new cognito.UserPoolDomain(this, 'MedeezUserPoolDomain', {
            userPool: this.userPool,
            cognitoDomain: {
                domainPrefix: `medeez-${environment}-auth`,
            },
        });
        // Main API Lambda function
        this.apiFunction = new lambda.Function(this, 'MedeezApiFunction', {
            functionName: `medeez-${environment}-api`,
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('../../apps/api/dist'),
            role: apiRole,
            environment: {
                NODE_ENV: config.lambda.environment.NODE_ENV,
                LOG_LEVEL: config.lambda.environment.LOG_LEVEL,
                ENVIRONMENT: environment,
                DYNAMO_TABLE_NAME: dynamoTable.tableName,
                S3_BUCKET_NAME: s3Bucket.bucketName,
                KMS_KEY_ID: kmsKey.keyId,
                USER_POOL_ID: this.userPool.userPoolId,
                USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
                REGION: this.region,
                CORS_ORIGINS: `https://${config.domainName},https://www.${config.domainName},https://book.${config.domainName}`,
            },
            timeout: cdk.Duration.seconds(config.lambda.timeout),
            memorySize: config.lambda.memorySize,
            reservedConcurrentExecutions: config.lambda.reservedConcurrency,
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_229_0,
            // TODO: Add DLQ after resolving circular dependency
            // deadLetterQueue: new sqs.Queue(this, 'ApiDLQ', {
            //   queueName: `medeez-${environment}-api-dlq`,
            //   encryption: sqs.QueueEncryption.KMS,
            //   encryptionMasterKey: kmsKey,
            //   retentionPeriod: cdk.Duration.days(14),
            // }),
        });
        // Grant permissions to the API function
        dynamoTable.grantReadWriteData(this.apiFunction);
        s3Bucket.grantReadWrite(this.apiFunction);
        kmsKey.grantEncryptDecrypt(this.apiFunction);
        // API Gateway
        this.apiGateway = new apigateway.RestApi(this, 'MedeezApiGateway', {
            restApiName: `medeez-${environment}-api`,
            description: `Medeez API Gateway for ${environment} environment`,
            deployOptions: {
                stageName: 'v1',
                throttlingRateLimit: 1000,
                throttlingBurstLimit: 2000,
                metricsEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: environment !== 'prod',
                cachingEnabled: environment === 'prod',
                cacheClusterEnabled: environment === 'prod',
                cacheClusterSize: environment === 'prod' ? '0.5' : undefined,
                cacheTtl: cdk.Duration.minutes(5),
            },
            defaultCorsPreflightOptions: {
                allowOrigins: [
                    `https://${config.domainName}`,
                    `https://www.${config.domainName}`,
                    `https://book.${config.domainName}`,
                    ...(environment !== 'prod' ? ['http://localhost:3000'] : []),
                ],
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                    'X-Amz-User-Agent',
                ],
                allowCredentials: true,
            },
            policy: new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        effect: iam.Effect.ALLOW,
                        principals: [new iam.AnyPrincipal()],
                        actions: ['execute-api:Invoke'],
                        resources: ['*'],
                        conditions: {
                            StringEquals: {
                                'aws:SourceVpc': environment === 'prod' ? 'vpc-restrictive' : undefined,
                            },
                        },
                    }),
                ],
            }),
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL],
            },
        });
        // Cognito Authorizer
        const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [this.userPool],
            authorizerName: `medeez-${environment}-authorizer`,
            identitySource: 'method.request.header.Authorization',
            resultsCacheTtl: cdk.Duration.minutes(5),
        });
        // Lambda integration
        const lambdaIntegration = new apigateway.LambdaIntegration(this.apiFunction, {
            proxy: true,
            allowTestInvoke: environment !== 'prod',
        });
        // API routes
        const api = this.apiGateway.root.addResource('api');
        const v1 = api.addResource('v1');
        // Public routes (no auth)
        const publicRoutes = v1.addResource('public');
        publicRoutes.addMethod('ANY', lambdaIntegration);
        publicRoutes.addProxy({
            defaultIntegration: lambdaIntegration,
        });
        // Protected routes (require Cognito auth)
        const protectedRoutes = v1.addResource('auth');
        protectedRoutes.addMethod('ANY', lambdaIntegration, {
            authorizer: cognitoAuthorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        protectedRoutes.addProxy({
            defaultIntegration: lambdaIntegration,
        });
        // Health check endpoint (no auth)
        const health = v1.addResource('health');
        health.addMethod('GET', lambdaIntegration);
        // Webhooks (API key auth)
        const apiKey = this.apiGateway.addApiKey(`MedeezApiKey-${environment}`, {
            apiKeyName: `medeez-${environment}-webhook-key`,
            description: 'API key for webhook endpoints',
        });
        const usagePlan = this.apiGateway.addUsagePlan(`MedeezUsagePlan-${environment}`, {
            name: `medeez-${environment}-usage-plan`,
            throttle: {
                rateLimit: 100,
                burstLimit: 200,
            },
            quota: {
                limit: 10000,
                period: apigateway.Period.MONTH,
            },
        });
        usagePlan.addApiKey(apiKey);
        usagePlan.addApiStage({
            stage: this.apiGateway.deploymentStage,
        });
        const webhooks = v1.addResource('webhooks');
        webhooks.addMethod('ANY', lambdaIntegration, {
            apiKeyRequired: true,
        });
        webhooks.addProxy({
            defaultIntegration: lambdaIntegration,
        });
        // Custom domain for API
        if (config.certificateArn) {
            const certificate = acm.Certificate.fromCertificateArn(this, 'ApiCertificate', config.certificateArn);
            const domainName = new apigateway.DomainName(this, 'ApiDomainName', {
                domainName: `api.${config.domainName}`,
                certificate,
                endpointType: apigateway.EndpointType.REGIONAL,
                securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
            });
            domainName.addBasePathMapping(this.apiGateway, {
                basePath: '',
            });
            // Route53 record
            if (config.hostedZoneId) {
                const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
                    hostedZoneId: config.hostedZoneId,
                    zoneName: config.domainName,
                });
                new route53.ARecord(this, 'ApiAliasRecord', {
                    zone: hostedZone,
                    recordName: 'api',
                    target: route53.RecordTarget.fromAlias(new route53targets.ApiGatewayDomain(domainName)),
                });
            }
            this.apiUrl = `https://api.${config.domainName}/api/v1`;
        }
        else {
            this.apiUrl = `${this.apiGateway.url}api/v1`;
        }
        // EventBridge for background jobs
        const eventBus = new events.EventBus(this, 'MedeezEventBus', {
            eventBusName: `medeez-${environment}-events`,
        });
        // Reminder scheduler function
        const reminderFunction = new lambda.Function(this, 'ReminderFunction', {
            functionName: `medeez-${environment}-reminders`,
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Reminder Event:', JSON.stringify(event, null, 2));
          
          // Query DynamoDB for appointments needing reminders
          // Send SMS/email via doctor's BYO credentials
          // Update reminder status
          
          return { statusCode: 200, body: 'Reminders processed' };
        };
      `),
            role: apiRole,
            environment: {
                DYNAMO_TABLE_NAME: dynamoTable.tableName,
                EVENT_BUS_NAME: eventBus.eventBusName,
                ENVIRONMENT: environment,
            },
            timeout: cdk.Duration.minutes(5),
            memorySize: 256,
        });
        // Schedule reminders every 5 minutes
        const reminderRule = new events.Rule(this, 'ReminderRule', {
            ruleName: `medeez-${environment}-reminder-rule`,
            schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
            targets: [new targets.LambdaFunction(reminderFunction)],
        });
        // Store configuration in Parameter Store
        new ssm.StringParameter(this, 'ApiUrlParameter', {
            parameterName: `/medeez/${environment}/api-url`,
            stringValue: this.apiUrl,
            description: 'API Gateway URL',
        });
        new ssm.StringParameter(this, 'UserPoolIdParameter', {
            parameterName: `/medeez/${environment}/cognito/user-pool-id`,
            stringValue: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
        });
        new ssm.StringParameter(this, 'UserPoolClientIdParameter', {
            parameterName: `/medeez/${environment}/cognito/user-pool-client-id`,
            stringValue: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
        });
        new ssm.StringParameter(this, 'EventBusNameParameter', {
            parameterName: `/medeez/${environment}/eventbridge/bus-name`,
            stringValue: eventBus.eventBusName,
            description: 'EventBridge Bus Name',
        });
        // Outputs
        new cdk.CfnOutput(this, 'UserPoolId', {
            value: this.userPool.userPoolId,
            description: 'Cognito User Pool ID',
            exportName: `MedeezUserPoolId-${environment}`,
        });
        new cdk.CfnOutput(this, 'UserPoolClientId', {
            value: this.userPoolClient.userPoolClientId,
            description: 'Cognito User Pool Client ID',
            exportName: `MedeezUserPoolClientId-${environment}`,
        });
        new cdk.CfnOutput(this, 'UserPoolDomain', {
            value: userPoolDomain.domainName,
            description: 'Cognito User Pool Domain',
            exportName: `MedeezUserPoolDomain-${environment}`,
        });
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: this.apiUrl,
            description: 'API Gateway URL',
            exportName: `MedeezApiGatewayUrl-${environment}`,
        });
        new cdk.CfnOutput(this, 'ApiKeyId', {
            value: apiKey.keyId,
            description: 'API Key ID for webhooks',
            exportName: `MedeezApiKeyId-${environment}`,
        });
    }
}
exports.ApiStack = ApiStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vYXBpLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQywrREFBaUQ7QUFDakQsdUVBQXlEO0FBQ3pELGlFQUFtRDtBQUluRCx5REFBMkM7QUFDM0MsK0RBQWlEO0FBQ2pELHdFQUEwRDtBQUMxRCx5REFBMkM7QUFDM0Msd0VBQTBEO0FBQzFELGlFQUFtRDtBQUNuRCxnRkFBa0U7QUFnQmxFLE1BQWEsUUFBUyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBT3JDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDNUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxjQUFjLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFeEcsbURBQW1EO1FBQ25ELElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxJQUFJLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDdkUsWUFBWSxFQUFFLFVBQVUsV0FBVyxRQUFRO1lBQzNDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxVQUFVLEVBQUU7Z0JBQ1YsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELGNBQWMsRUFBRTtnQkFDZCxTQUFTLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsU0FBUztnQkFDbEQsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsZ0JBQWdCO2dCQUNoRSxnQkFBZ0IsRUFBRSxNQUFNLENB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LFdBQVcsRUFBRSwwQkFBMEI7WUFDdkMsVUFBVSxFQUFFLHdCQUF3QixXQUFXLEVBQUU7U0FDbEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ2xCLFdBQVcsRUFBRSxpQkFBaUI7WUFDOUIsVUFBVSxFQUFFLHVCQUF1QixXQUFXLEVBQUU7U0FDakQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDbEMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLO1lBQ25CLFdBQVcsRUFBRSx5QkFBeUI7WUFDdEMsVUFBVSxFQUFFLGtCQUFrQixXQUFXLEVBQUU7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOVpELDRCQThaQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTN0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBFbnZpcm9ubWVudENvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuaW50ZXJmYWNlIEFwaVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWc7XG4gIGR5bmFtb1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgczNCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAga21zS2V5OiBrbXMuS2V5O1xuICBhcGlSb2xlOiBpYW0uUm9sZTtcbiAgdXNlclBvb2w/OiBjb2duaXRvLlVzZXJQb29sO1xuICB1c2VyUG9vbENsaWVudD86IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XG59XG5cbmV4cG9ydCBjbGFzcyBBcGlTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBhcGlGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYXBpR2F0ZXdheTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbENsaWVudDogY29nbml0by5Vc2VyUG9vbENsaWVudDtcbiAgcHVibGljIHJlYWRvbmx5IGFwaVVybDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBcGlTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBjb25maWcsIGR5bmFtb1RhYmxlLCBzM0J1Y2tldCwga21zS2V5LCBhcGlSb2xlLCB1c2VyUG9vbCwgdXNlclBvb2xDbGllbnQgfSA9IHByb3BzO1xuXG4gICAgLy8gVXNlIHByb3ZpZGVkIENvZ25pdG8gVXNlciBQb29sIG9yIGNyZWF0ZSBuZXcgb25lXG4gICAgdGhpcy51c2VyUG9vbCA9IHVzZXJQb29sIHx8IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdNZWRlZXpVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IGNvbmZpZy5jb2duaXRvLnBhc3N3b3JkUG9saWN5Lm1pbkxlbmd0aCxcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogY29uZmlnLmNvZ25pdG8ucGFzc3dvcmRQb2xpY3kucmVxdWlyZUxvd2VyY2FzZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogY29uZmlnLmNvZ25pdG8ucGFzc3dvcmRQb2xpY3kucmVxdWlyZVVwcGVyY2FzZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogY29uZmlnLmNvZ25pdG8ucGFzc3dvcmRQb2xpY3kucmVxdWlyZURpZ2l0cyxcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGNvbmZpZy5jb2duaXRvLnBhc3N3b3JkUG9saWN5LnJlcXVpcmVTeW1ib2xzLFxuICAgICAgfSxcbiAgICAgIG1mYTogY29uZmlnLmNvZ25pdG8ubWZhQ29uZmlndXJhdGlvbiA9PT0gJ09GRicgPyBjb2duaXRvLk1mYS5PRkYgOiBcbiAgICAgICAgICAgY29uZmlnLmNvZ25pdG8ubWZhQ29uZmlndXJhdGlvbiA9PT0gJ09QVElPTkFMJyA/IGNvZ25pdG8uTWZhLk9QVElPTkFMIDogXG4gICAgICAgICAgIGNvZ25pdG8uTWZhLlJFUVVJUkVELFxuICAgICAgbWZhU2Vjb25kRmFjdG9yOiB7XG4gICAgICAgIHNtczogdHJ1ZSxcbiAgICAgICAgb3RwOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHVzZXJWZXJpZmljYXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnV2VsY29tZSB0byBNZWRlZXogLSBWZXJpZnkgeW91ciBlbWFpbCcsXG4gICAgICAgIGVtYWlsQm9keTogJ1RoYW5rIHlvdSBmb3Igc2lnbmluZyB1cCB0byBNZWRlZXohIFlvdXIgdmVyaWZpY2F0aW9uIGNvZGUgaXMgeyMjIyN9JyxcbiAgICAgICAgZW1haWxTdHlsZTogY29nbml0by5WZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXG4gICAgICB9LFxuICAgICAgdXNlckludml0YXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnV2VsY29tZSB0byBNZWRlZXonLFxuICAgICAgICBlbWFpbEJvZHk6ICdIZWxsbyB7dXNlcm5hbWV9LCB5b3UgaGF2ZSBiZWVuIGludml0ZWQgdG8gam9pbiBNZWRlZXouIFlvdXIgdGVtcG9yYXJ5IHBhc3N3b3JkIGlzIHsjIyMjfScsXG4gICAgICB9LFxuICAgICAgZGV2aWNlVHJhY2tpbmc6IHtcbiAgICAgICAgY2hhbGxlbmdlUmVxdWlyZWRPbk5ld0RldmljZTogdHJ1ZSxcbiAgICAgICAgZGV2aWNlT25seVJlbWVtYmVyZWRPblVzZXJQcm9tcHQ6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIHN0YW5kYXJkQXR0cmlidXRlczoge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGdpdmVuTmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGZhbWlseU5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGN1c3RvbUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgbnBpOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoeyBtdXRhYmxlOiB0cnVlIH0pLFxuICAgICAgICBjbGluaWNJZDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgdGltZXpvbmU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICAgIHJvbGU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7IG11dGFibGU6IHRydWUgfSksXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBVc2UgcHJvdmlkZWQgVXNlciBQb29sIENsaWVudCBvciBjcmVhdGUgbmV3IG9uZVxuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSB1c2VyUG9vbENsaWVudCB8fCBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnTWVkZWV6VXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1jbGllbnRgLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcbiAgICAgIHJlZnJlc2hUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICBhY2Nlc3NUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICAgIGVuYWJsZVRva2VuUmV2b2NhdGlvbjogdHJ1ZSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtcbiAgICAgICAgICBgaHR0cHM6Ly8ke2NvbmZpZy5kb21haW5OYW1lfS9hdXRoL2NhbGxiYWNrYCxcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbXG4gICAgICAgICAgYGh0dHBzOi8vJHtjb25maWcuZG9tYWluTmFtZX0vYXV0aC9sb2dvdXRgLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvYXV0aC9sb2dvdXQnLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgUG9vbCBEb21haW5cbiAgICBjb25zdCB1c2VyUG9vbERvbWFpbiA9IG5ldyBjb2duaXRvLlVzZXJQb29sRG9tYWluKHRoaXMsICdNZWRlZXpVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHVzZXJQb29sOiB0aGlzLnVzZXJQb29sLFxuICAgICAgY29nbml0b0RvbWFpbjoge1xuICAgICAgICBkb21haW5QcmVmaXg6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tYXV0aGAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTWFpbiBBUEkgTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5hcGlGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01lZGVlekFwaUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWFwaWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vLi4vYXBwcy9hcGkvZGlzdCcpLFxuICAgICAgcm9sZTogYXBpUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBjb25maWcubGFtYmRhLmVudmlyb25tZW50Lk5PREVfRU5WLFxuICAgICAgICBMT0dfTEVWRUw6IGNvbmZpZy5sYW1iZGEuZW52aXJvbm1lbnQuTE9HX0xFVkVMLFxuICAgICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICAgIERZTkFNT19UQUJMRV9OQU1FOiBkeW5hbW9UYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFMzX0JVQ0tFVF9OQU1FOiBzM0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBLTVNfS0VZX0lEOiBrbXNLZXkua2V5SWQsXG4gICAgICAgIFVTRVJfUE9PTF9JRDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBVU0VSX1BPT0xfQ0xJRU5UX0lEOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgIFJFR0lPTjogdGhpcy5yZWdpb24sXG4gICAgICAgIENPUlNfT1JJR0lOUzogYGh0dHBzOi8vJHtjb25maWcuZG9tYWluTmFtZX0saHR0cHM6Ly93d3cuJHtjb25maWcuZG9tYWluTmFtZX0saHR0cHM6Ly9ib29rLiR7Y29uZmlnLmRvbWFpbk5hbWV9YCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyhjb25maWcubGFtYmRhLnRpbWVvdXQpLFxuICAgICAgbWVtb3J5U2l6ZTogY29uZmlnLmxhbWJkYS5tZW1vcnlTaXplLFxuICAgICAgcmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogY29uZmlnLmxhbWJkYS5yZXNlcnZlZENvbmN1cnJlbmN5LFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgICAgaW5zaWdodHNWZXJzaW9uOiBsYW1iZGEuTGFtYmRhSW5zaWdodHNWZXJzaW9uLlZFUlNJT05fMV8wXzIyOV8wLFxuICAgICAgLy8gVE9ETzogQWRkIERMUSBhZnRlciByZXNvbHZpbmcgY2lyY3VsYXIgZGVwZW5kZW5jeVxuICAgICAgLy8gZGVhZExldHRlclF1ZXVlOiBuZXcgc3FzLlF1ZXVlKHRoaXMsICdBcGlETFEnLCB7XG4gICAgICAvLyAgIHF1ZXVlTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1hcGktZGxxYCxcbiAgICAgIC8vICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5LTVMsXG4gICAgICAvLyAgIGVuY3J5cHRpb25NYXN0ZXJLZXk6IGttc0tleSxcbiAgICAgIC8vICAgcmV0ZW50aW9uUGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxNCksXG4gICAgICAvLyB9KSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIHRvIHRoZSBBUEkgZnVuY3Rpb25cbiAgICBkeW5hbW9UYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5hcGlGdW5jdGlvbik7XG4gICAgczNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUodGhpcy5hcGlGdW5jdGlvbik7XG4gICAga21zS2V5LmdyYW50RW5jcnlwdERlY3J5cHQodGhpcy5hcGlGdW5jdGlvbik7XG5cbiAgICAvLyBBUEkgR2F0ZXdheVxuICAgIHRoaXMuYXBpR2F0ZXdheSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ01lZGVlekFwaUdhdGV3YXknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1hcGlgLFxuICAgICAgZGVzY3JpcHRpb246IGBNZWRlZXogQVBJIEdhdGV3YXkgZm9yICR7ZW52aXJvbm1lbnR9IGVudmlyb25tZW50YCxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiAndjEnLFxuICAgICAgICB0aHJvdHRsaW5nUmF0ZUxpbWl0OiAxMDAwLFxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogMjAwMCxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgICAgY2FjaGluZ0VuYWJsZWQ6IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICAgIGNhY2hlQ2x1c3RlckVuYWJsZWQ6IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICAgIGNhY2hlQ2x1c3RlclNpemU6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAnMC41JyA6IHVuZGVmaW5lZCxcbiAgICAgICAgY2FjaGVUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IFtcbiAgICAgICAgICBgaHR0cHM6Ly8ke2NvbmZpZy5kb21haW5OYW1lfWAsXG4gICAgICAgICAgYGh0dHBzOi8vd3d3LiR7Y29uZmlnLmRvbWFpbk5hbWV9YCxcbiAgICAgICAgICBgaHR0cHM6Ly9ib29rLiR7Y29uZmlnLmRvbWFpbk5hbWV9YCxcbiAgICAgICAgICAuLi4oZW52aXJvbm1lbnQgIT09ICdwcm9kJyA/IFsnaHR0cDovL2xvY2FsaG9zdDozMDAwJ10gOiBbXSksXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgICAgJ1gtQW16LVVzZXItQWdlbnQnLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbJ2V4ZWN1dGUtYXBpOkludm9rZSddLFxuICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgICAgJ2F3czpTb3VyY2VWcGMnOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gJ3ZwYy1yZXN0cmljdGl2ZScgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgICBlbmRwb2ludENvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgdHlwZXM6IFthcGlnYXRld2F5LkVuZHBvaW50VHlwZS5SRUdJT05BTF0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBBdXRob3JpemVyXG4gICAgY29uc3QgY29nbml0b0F1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnQ29nbml0b0F1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdGhpcy51c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1hdXRob3JpemVyYCxcbiAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgICAgcmVzdWx0c0NhY2hlVHRsOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBpbnRlZ3JhdGlvblxuICAgIGNvbnN0IGxhbWJkYUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5hcGlGdW5jdGlvbiwge1xuICAgICAgcHJveHk6IHRydWUsXG4gICAgICBhbGxvd1Rlc3RJbnZva2U6IGVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgfSk7XG5cbiAgICAvLyBBUEkgcm91dGVzXG4gICAgY29uc3QgYXBpID0gdGhpcy5hcGlHYXRld2F5LnJvb3QuYWRkUmVzb3VyY2UoJ2FwaScpO1xuICAgIGNvbnN0IHYxID0gYXBpLmFkZFJlc291cmNlKCd2MScpO1xuXG4gICAgLy8gUHVibGljIHJvdXRlcyAobm8gYXV0aClcbiAgICBjb25zdCBwdWJsaWNSb3V0ZXMgPSB2MS5hZGRSZXNvdXJjZSgncHVibGljJyk7XG4gICAgcHVibGljUm91dGVzLmFkZE1ldGhvZCgnQU5ZJywgbGFtYmRhSW50ZWdyYXRpb24pO1xuICAgIHB1YmxpY1JvdXRlcy5hZGRQcm94eSh7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGxhbWJkYUludGVncmF0aW9uLFxuICAgIH0pO1xuXG4gICAgLy8gUHJvdGVjdGVkIHJvdXRlcyAocmVxdWlyZSBDb2duaXRvIGF1dGgpXG4gICAgY29uc3QgcHJvdGVjdGVkUm91dGVzID0gdjEuYWRkUmVzb3VyY2UoJ2F1dGgnKTtcbiAgICBwcm90ZWN0ZWRSb3V0ZXMuYWRkTWV0aG9kKCdBTlknLCBsYW1iZGFJbnRlZ3JhdGlvbiwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIHByb3RlY3RlZFJvdXRlcy5hZGRQcm94eSh7XG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGxhbWJkYUludGVncmF0aW9uLFxuICAgIH0pO1xuXG4gICAgLy8gSGVhbHRoIGNoZWNrIGVuZHBvaW50IChubyBhdXRoKVxuICAgIGNvbnN0IGhlYWx0aCA9IHYxLmFkZFJlc291cmNlKCdoZWFsdGgnKTtcbiAgICBoZWFsdGguYWRkTWV0aG9kKCdHRVQnLCBsYW1iZGFJbnRlZ3JhdGlvbik7XG5cbiAgICAvLyBXZWJob29rcyAoQVBJIGtleSBhdXRoKVxuICAgIGNvbnN0IGFwaUtleSA9IHRoaXMuYXBpR2F0ZXdheS5hZGRBcGlLZXkoYE1lZGVlekFwaUtleS0ke2Vudmlyb25tZW50fWAsIHtcbiAgICAgIGFwaUtleU5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0td2ViaG9vay1rZXlgLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkga2V5IGZvciB3ZWJob29rIGVuZHBvaW50cycsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2FnZVBsYW4gPSB0aGlzLmFwaUdhdGV3YXkuYWRkVXNhZ2VQbGFuKGBNZWRlZXpVc2FnZVBsYW4tJHtlbnZpcm9ubWVudH1gLCB7XG4gICAgICBuYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LXVzYWdlLXBsYW5gLFxuICAgICAgdGhyb3R0bGU6IHtcbiAgICAgICAgcmF0ZUxpbWl0OiAxMDAsXG4gICAgICAgIGJ1cnN0TGltaXQ6IDIwMCxcbiAgICAgIH0sXG4gICAgICBxdW90YToge1xuICAgICAgICBsaW1pdDogMTAwMDAsXG4gICAgICAgIHBlcmlvZDogYXBpZ2F0ZXdheS5QZXJpb2QuTU9OVEgsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdXNhZ2VQbGFuLmFkZEFwaUtleShhcGlLZXkpO1xuICAgIHVzYWdlUGxhbi5hZGRBcGlTdGFnZSh7XG4gICAgICBzdGFnZTogdGhpcy5hcGlHYXRld2F5LmRlcGxveW1lbnRTdGFnZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHdlYmhvb2tzID0gdjEuYWRkUmVzb3VyY2UoJ3dlYmhvb2tzJyk7XG4gICAgd2ViaG9va3MuYWRkTWV0aG9kKCdBTlknLCBsYW1iZGFJbnRlZ3JhdGlvbiwge1xuICAgICAgYXBpS2V5UmVxdWlyZWQ6IHRydWUsXG4gICAgfSk7XG4gICAgd2ViaG9va3MuYWRkUHJveHkoe1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBsYW1iZGFJbnRlZ3JhdGlvbixcbiAgICB9KTtcblxuICAgIC8vIEN1c3RvbSBkb21haW4gZm9yIEFQSVxuICAgIGlmIChjb25maWcuY2VydGlmaWNhdGVBcm4pIHtcbiAgICAgIGNvbnN0IGNlcnRpZmljYXRlID0gYWNtLkNlcnRpZmljYXRlLmZyb21DZXJ0aWZpY2F0ZUFybihcbiAgICAgICAgdGhpcyxcbiAgICAgICAgJ0FwaUNlcnRpZmljYXRlJyxcbiAgICAgICAgY29uZmlnLmNlcnRpZmljYXRlQXJuXG4gICAgICApO1xuXG4gICAgICBjb25zdCBkb21haW5OYW1lID0gbmV3IGFwaWdhdGV3YXkuRG9tYWluTmFtZSh0aGlzLCAnQXBpRG9tYWluTmFtZScsIHtcbiAgICAgICAgZG9tYWluTmFtZTogYGFwaS4ke2NvbmZpZy5kb21haW5OYW1lfWAsXG4gICAgICAgIGNlcnRpZmljYXRlLFxuICAgICAgICBlbmRwb2ludFR5cGU6IGFwaWdhdGV3YXkuRW5kcG9pbnRUeXBlLlJFR0lPTkFMLFxuICAgICAgICBzZWN1cml0eVBvbGljeTogYXBpZ2F0ZXdheS5TZWN1cml0eVBvbGljeS5UTFNfMV8yLFxuICAgICAgfSk7XG5cbiAgICAgIGRvbWFpbk5hbWUuYWRkQmFzZVBhdGhNYXBwaW5nKHRoaXMuYXBpR2F0ZXdheSwge1xuICAgICAgICBiYXNlUGF0aDogJycsXG4gICAgICB9KTtcblxuICAgICAgLy8gUm91dGU1MyByZWNvcmRcbiAgICAgIGlmIChjb25maWcuaG9zdGVkWm9uZUlkKSB7XG4gICAgICAgIGNvbnN0IGhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUhvc3RlZFpvbmVBdHRyaWJ1dGVzKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgICAgIGhvc3RlZFpvbmVJZDogY29uZmlnLmhvc3RlZFpvbmVJZCxcbiAgICAgICAgICB6b25lTmFtZTogY29uZmlnLmRvbWFpbk5hbWUhLFxuICAgICAgICB9KTtcblxuICAgICAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdBcGlBbGlhc1JlY29yZCcsIHtcbiAgICAgICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgICAgIHJlY29yZE5hbWU6ICdhcGknLFxuICAgICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICAgICAgbmV3IHJvdXRlNTN0YXJnZXRzLkFwaUdhdGV3YXlEb21haW4oZG9tYWluTmFtZSlcbiAgICAgICAgICApLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5hcGlVcmwgPSBgaHR0cHM6Ly9hcGkuJHtjb25maWcuZG9tYWluTmFtZX0vYXBpL3YxYDtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5hcGlVcmwgPSBgJHt0aGlzLmFwaUdhdGV3YXkudXJsfWFwaS92MWA7XG4gICAgfVxuXG4gICAgLy8gRXZlbnRCcmlkZ2UgZm9yIGJhY2tncm91bmQgam9ic1xuICAgIGNvbnN0IGV2ZW50QnVzID0gbmV3IGV2ZW50cy5FdmVudEJ1cyh0aGlzLCAnTWVkZWV6RXZlbnRCdXMnLCB7XG4gICAgICBldmVudEJ1c05hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tZXZlbnRzYCxcbiAgICB9KTtcblxuICAgIC8vIFJlbWluZGVyIHNjaGVkdWxlciBmdW5jdGlvblxuICAgIGNvbnN0IHJlbWluZGVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSZW1pbmRlckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LXJlbWluZGVyc2AsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICBleHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnUmVtaW5kZXIgRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBRdWVyeSBEeW5hbW9EQiBmb3IgYXBwb2ludG1lbnRzIG5lZWRpbmcgcmVtaW5kZXJzXG4gICAgICAgICAgLy8gU2VuZCBTTVMvZW1haWwgdmlhIGRvY3RvcidzIEJZTyBjcmVkZW50aWFsc1xuICAgICAgICAgIC8vIFVwZGF0ZSByZW1pbmRlciBzdGF0dXNcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4geyBzdGF0dXNDb2RlOiAyMDAsIGJvZHk6ICdSZW1pbmRlcnMgcHJvY2Vzc2VkJyB9O1xuICAgICAgICB9O1xuICAgICAgYCksXG4gICAgICByb2xlOiBhcGlSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRFlOQU1PX1RBQkxFX05BTUU6IGR5bmFtb1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgRVZFTlRfQlVTX05BTUU6IGV2ZW50QnVzLmV2ZW50QnVzTmFtZSxcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgIH0pO1xuXG4gICAgLy8gU2NoZWR1bGUgcmVtaW5kZXJzIGV2ZXJ5IDUgbWludXRlc1xuICAgIGNvbnN0IHJlbWluZGVyUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnUmVtaW5kZXJSdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tcmVtaW5kZXItcnVsZWAsXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSkpLFxuICAgICAgdGFyZ2V0czogW25ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHJlbWluZGVyRnVuY3Rpb24pXSxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIGNvbmZpZ3VyYXRpb24gaW4gUGFyYW1ldGVyIFN0b3JlXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0FwaVVybFBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2FwaS11cmxgLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMuYXBpVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1VzZXJQb29sSWRQYXJhbWV0ZXInLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL21lZGVlei8ke2Vudmlyb25tZW50fS9jb2duaXRvL3VzZXItcG9vbC1pZGAsXG4gICAgICBzdHJpbmdWYWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnVXNlclBvb2xDbGllbnRJZFBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2NvZ25pdG8vdXNlci1wb29sLWNsaWVudC1pZGAsXG4gICAgICBzdHJpbmdWYWx1ZTogdGhpcy51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0V2ZW50QnVzTmFtZVBhcmFtZXRlcicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2V2ZW50YnJpZGdlL2J1cy1uYW1lYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiBldmVudEJ1cy5ldmVudEJ1c05hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0V2ZW50QnJpZGdlIEJ1cyBOYW1lJyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpVc2VyUG9vbElkLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpVc2VyUG9vbENsaWVudElkLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlelVzZXJQb29sRG9tYWluLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlekFwaUdhdGV3YXlVcmwtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUtleUlkJywge1xuICAgICAgdmFsdWU6IGFwaUtleS5rZXlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEtleSBJRCBmb3Igd2ViaG9va3MnLFxuICAgICAgZXhwb3J0TmFtZTogYE1lZGVlekFwaUtleUlkLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcbiAgfVxufSJdfQ==