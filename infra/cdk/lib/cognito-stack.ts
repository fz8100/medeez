import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface CognitoStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
  kmsKey: kms.Key;
  apiRole: iam.Role;
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly lambdaTriggers: Record<string, lambda.Function>;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    const { environment, config, kmsKey, apiRole } = props;

    // Lambda execution role for Cognito triggers
    const triggerRole = new iam.Role(this, 'CognitoTriggerRole', {
      roleName: `medeez-${environment}-cognito-trigger-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Cognito Lambda triggers',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        DynamoDBPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/medeez-${environment}-*`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/medeez-${environment}-*/index/*`,
              ],
            }),
          ],
        }),
        CognitoPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-idp:AdminCreateUser',
                'cognito-idp:AdminSetUserPassword',
                'cognito-idp:AdminUpdateUserAttributes',
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminDisableUser',
                'cognito-idp:AdminEnableUser',
                'cognito-idp:AdminAddUserToGroup',
                'cognito-idp:AdminRemoveUserFromGroup',
              ],
              resources: ['*'],
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

    // Lambda Triggers
    this.lambdaTriggers = {};

    // Pre Sign-up Trigger
    this.lambdaTriggers.preSignUp = new lambda.Function(this, 'PreSignUpTrigger', {
      functionName: `medeez-${environment}-cognito-pre-signup`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../../apps/api/dist/lambda/cognito-triggers/pre-signup'),
      timeout: cdk.Duration.seconds(30),
      role: triggerRole,
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
        KMS_KEY_ID: kmsKey.keyId,
        REGION: this.region,
        DYNAMODB_TABLE_PREFIX: `medeez-${environment}`,
      },
    });

    // Post Confirmation Trigger
    this.lambdaTriggers.postConfirmation = new lambda.Function(this, 'PostConfirmationTrigger', {
      functionName: `medeez-${environment}-cognito-post-confirmation`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../../apps/api/dist/lambda/cognito-triggers/post-confirmation'),
      timeout: cdk.Duration.seconds(30),
      role: triggerRole,
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
        KMS_KEY_ID: kmsKey.keyId,
        REGION: this.region,
        DYNAMODB_TABLE_PREFIX: `medeez-${environment}`,
      },
    });

    // Pre Authentication Trigger
    this.lambdaTriggers.preAuthentication = new lambda.Function(this, 'PreAuthenticationTrigger', {
      functionName: `medeez-${environment}-cognito-pre-auth`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../../apps/api/dist/lambda/cognito-triggers/pre-authentication'),
      timeout: cdk.Duration.seconds(30),
      role: triggerRole,
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
        KMS_KEY_ID: kmsKey.keyId,
        REGION: this.region,
        DYNAMODB_TABLE_PREFIX: `medeez-${environment}`,
      },
    });

    // Post Authentication Trigger
    this.lambdaTriggers.postAuthentication = new lambda.Function(this, 'PostAuthenticationTrigger', {
      functionName: `medeez-${environment}-cognito-post-auth`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../../apps/api/dist/lambda/cognito-triggers/post-authentication'),
      timeout: cdk.Duration.seconds(30),
      role: triggerRole,
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
        KMS_KEY_ID: kmsKey.keyId,
        REGION: this.region,
        DYNAMODB_TABLE_PREFIX: `medeez-${environment}`,
      },
    });

    // Create Auth Challenge Trigger (for MFA)
    this.lambdaTriggers.createAuthChallenge = new lambda.Function(this, 'CreateAuthChallengeTrigger', {
      functionName: `medeez-${environment}-cognito-create-auth-challenge`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../../apps/api/dist/lambda/cognito-triggers/create-auth-challenge'),
      timeout: cdk.Duration.seconds(30),
      role: triggerRole,
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
        KMS_KEY_ID: kmsKey.keyId,
        REGION: this.region,
      },
    });

    // Define Auth Challenge Trigger
    this.lambdaTriggers.defineAuthChallenge = new lambda.Function(this, 'DefineAuthChallengeTrigger', {
      functionName: `medeez-${environment}-cognito-define-auth-challenge`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../../apps/api/dist/lambda/cognito-triggers/define-auth-challenge'),
      timeout: cdk.Duration.seconds(30),
      role: triggerRole,
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
        KMS_KEY_ID: kmsKey.keyId,
        REGION: this.region,
      },
    });

    // Verify Auth Challenge Response Trigger
    this.lambdaTriggers.verifyAuthChallengeResponse = new lambda.Function(this, 'VerifyAuthChallengeResponseTrigger', {
      functionName: `medeez-${environment}-cognito-verify-auth-challenge`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../../../apps/api/dist/lambda/cognito-triggers/verify-auth-challenge-response'),
      timeout: cdk.Duration.seconds(30),
      role: triggerRole,
      environment: {
        NODE_ENV: environment,
        ENVIRONMENT: environment,
        KMS_KEY_ID: kmsKey.keyId,
        REGION: this.region,
      },
    });

    // User Pool
    this.userPool = new cognito.UserPool(this, 'MedeezUserPool', {
      userPoolName: `medeez-${environment}-user-pool`,
      signInCaseSensitive: false,
      signInAliases: {
        email: true,
        username: false,
        phone: false,
      },
      autoVerify: {
        email: true,
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
        phoneNumber: {
          required: false,
          mutable: true,
        },
      },
      customAttributes: {
        clinicId: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: true,
        }),
        role: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 20,
          mutable: true,
        }),
        trialEndDate: new cognito.StringAttribute({
          minLen: 0,
          maxLen: 30,
          mutable: true,
        }),
        subscriptionStatus: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 20,
          mutable: true,
        }),
        permissions: new cognito.StringAttribute({
          minLen: 0,
          maxLen: 2048,
          mutable: true,
        }),
        invitedBy: new cognito.StringAttribute({
          minLen: 0,
          maxLen: 128,
          mutable: true,
        }),
        onboardingComplete: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 5,
          mutable: true,
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: environment === 'prod',
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      lambdaTriggers: {
        preSignUp: this.lambdaTriggers.preSignUp,
        postConfirmation: this.lambdaTriggers.postConfirmation,
        preAuthentication: this.lambdaTriggers.preAuthentication,
        postAuthentication: this.lambdaTriggers.postAuthentication,
        createAuthChallenge: this.lambdaTriggers.createAuthChallenge,
        defineAuthChallenge: this.lambdaTriggers.defineAuthChallenge,
        verifyAuthChallengeResponse: this.lambdaTriggers.verifyAuthChallengeResponse,
      },
      userVerification: {
        emailSubject: 'Welcome to Medeez - Verify your account',
        emailBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
              <h1 style="color: #2563eb; margin: 0;">Medeez</h1>
              <p style="color: #64748b; margin: 5px 0 0 0;">Healthcare Practice Management</p>
            </div>
            
            <div style="padding: 30px 0;">
              <h2 style="color: #1e293b; margin-bottom: 20px;">Welcome to Medeez!</h2>
              
              <p style="color: #475569; line-height: 1.6; margin-bottom: 25px;">
                Thank you for joining Medeez. Please verify your email address to complete your account setup and start managing your healthcare practice more efficiently.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #475569; font-size: 18px; font-weight: bold; margin-bottom: 15px;">
                  Your verification code is:
                </p>
                <div style="background-color: #f1f5f9; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; display: inline-block;">
                  <span style="font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; color: #2563eb; letter-spacing: 3px;">
                    {####}
                  </span>
                </div>
              </div>
              
              <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
                This code will expire in 24 hours. If you didn't request this verification, please ignore this email.
              </p>
            </div>
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                &copy; 2024 Medeez. All rights reserved.<br>
                This email was sent to verify your account registration.
              </p>
            </div>
          </div>
        `,
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: false,
      },
    });

    // User Pool Groups for Role-Based Access Control
    const groups = [
      {
        name: 'SystemAdmin',
        description: 'System administrators with full platform access',
        precedence: 0,
      },
      {
        name: 'Admin',
        description: 'Clinic administrators with full clinic management access',
        precedence: 10,
      },
      {
        name: 'Doctor',
        description: 'Healthcare providers with patient care access',
        precedence: 20,
      },
      {
        name: 'Staff',
        description: 'Clinic staff with limited access',
        precedence: 30,
      },
    ];

    groups.forEach((group) => {
      new cognito.CfnUserPoolGroup(this, `${group.name}Group`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group.name,
        description: group.description,
        precedence: group.precedence,
      });
    });

    // User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'MedeezUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `medeez-${environment}-web-client`,
      generateSecret: false, // Public client for web/mobile
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true, // Enable custom auth flows for MFA
        adminUserPassword: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: config.allowedOrigins.map(origin => `${origin}/auth/callback`),
        logoutUrls: config.allowedOrigins.map(origin => `${origin}/auth/logout`),
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      refreshTokenValidity: cdk.Duration.days(7),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true,
          familyName: true,
          phoneNumber: true,
        })
        .withCustomAttributes('clinicId', 'role', 'trialEndDate', 'subscriptionStatus', 'permissions'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          givenName: true,
          familyName: true,
          phoneNumber: true,
        }),
    });

    // Identity Pool for federated identities (if needed for mobile/SDK access)
    this.identityPool = new cognito.CfnIdentityPool(this, 'MedeezIdentityPool', {
      identityPoolName: `medeez-${environment}-identity-pool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
    });

    // Identity Pool Roles
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      roleName: `medeez-${environment}-cognito-authenticated-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        CognitoAuthenticated: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'mobileanalytics:PutEvents',
                'cognito-sync:*',
                'cognito-identity:*',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'execute-api:Invoke',
              ],
              resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/GET/*`,
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/POST/*`,
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/PUT/*`,
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/DELETE/*`,
              ],
            }),
          ],
        }),
      },
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // Add Cognito permissions to existing API role
    apiRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminSetUserPassword',
          'cognito-idp:AdminUpdateUserAttributes',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminDisableUser',
          'cognito-idp:AdminEnableUser',
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:AdminRemoveUserFromGroup',
          'cognito-idp:AdminListGroupsForUser',
          'cognito-idp:AdminInitiateAuth',
          'cognito-idp:AdminRespondToAuthChallenge',
          'cognito-idp:ListUsers',
          'cognito-idp:ListUsersInGroup',
        ],
        resources: [this.userPool.userPoolArn],
      })
    );

    // Store configuration in Parameter Store
    new ssm.StringParameter(this, 'UserPoolId', {
      parameterName: `/medeez/${environment}/cognito/user-pool-id`,
      stringValue: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new ssm.StringParameter(this, 'UserPoolClientId', {
      parameterName: `/medeez/${environment}/cognito/user-pool-client-id`,
      stringValue: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new ssm.StringParameter(this, 'IdentityPoolId', {
      parameterName: `/medeez/${environment}/cognito/identity-pool-id`,
      stringValue: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
    });

    new ssm.StringParameter(this, 'UserPoolArn', {
      parameterName: `/medeez/${environment}/cognito/user-pool-arn`,
      stringValue: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `MedeezUserPoolId-${environment}`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientIdOutput', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `MedeezUserPoolClientId-${environment}`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolIdOutput', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `MedeezIdentityPoolId-${environment}`,
    });

    new cdk.CfnOutput(this, 'UserPoolArnOutput', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `MedeezUserPoolArn-${environment}`,
    });
  }
}