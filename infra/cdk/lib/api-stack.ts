import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface ApiStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
  dynamoTable: dynamodb.Table;
  s3Bucket: s3.Bucket;
  kmsKey: kms.Key;
  apiRole: iam.Role;
  userPool?: cognito.UserPool;
  userPoolClient?: cognito.UserPoolClient;
}

export class ApiStack extends cdk.Stack {
  public readonly apiFunction: lambda.Function;
  public readonly apiGateway: apigateway.RestApi;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
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
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'ApiCertificate',
        config.certificateArn
      );

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
          zoneName: config.domainName!,
        });

        new route53.ARecord(this, 'ApiAliasRecord', {
          zone: hostedZone,
          recordName: 'api',
          target: route53.RecordTarget.fromAlias(
            new route53targets.ApiGatewayDomain(domainName)
          ),
        });
      }

      this.apiUrl = `https://api.${config.domainName}/api/v1`;
    } else {
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