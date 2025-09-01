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
exports.CognitoStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
class CognitoStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'authenticated',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
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
        apiRole.addToPolicy(new iam.PolicyStatement({
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
        }));
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
exports.CognitoStack = CognitoStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2NvZ25pdG8tc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLGlFQUFtRDtBQUNuRCwrREFBaUQ7QUFDakQseURBQTJDO0FBQzNDLHlEQUEyQztBQVkzQyxNQUFhLFlBQWEsU0FBUSxHQUFHLENBQUMsS0FBSztJQU16QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXdCO1FBQ2hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFdkQsNkNBQTZDO1FBQzdDLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDM0QsUUFBUSxFQUFFLFVBQVUsV0FBVyx1QkFBdUI7WUFDdEQsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO1lBQzNELFdBQVcsRUFBRSxzQ0FBc0M7WUFDbkQsZUFBZSxFQUFFO2dCQUNmLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsMENBQTBDLENBQUM7YUFDdkY7WUFDRCxjQUFjLEVBQUU7Z0JBQ2QsY0FBYyxFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztvQkFDckMsVUFBVSxFQUFFO3dCQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0QkFDdEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSzs0QkFDeEIsT0FBTyxFQUFFO2dDQUNQLGtCQUFrQjtnQ0FDbEIsa0JBQWtCO2dDQUNsQixxQkFBcUI7Z0NBQ3JCLGdCQUFnQjtnQ0FDaEIsZUFB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QUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUc7WUFDNUIsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsd0JBQXdCLFdBQVcsRUFBRTtTQUNsRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzNDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDaEMsV0FBVyxFQUFFLHVCQUF1QjtZQUNwQyxVQUFVLEVBQUUscUJBQXFCLFdBQVcsRUFBRTtTQUMvQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE3aUJELG9DQTZpQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgKiBhcyBrbXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWttcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9jb25maWcnO1xuXG5pbnRlcmZhY2UgQ29nbml0b1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWc7XG4gIGttc0tleToga21zLktleTtcbiAgYXBpUm9sZTogaWFtLlJvbGU7XG59XG5cbmV4cG9ydCBjbGFzcyBDb2duaXRvU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbENsaWVudDogY29nbml0by5Vc2VyUG9vbENsaWVudDtcbiAgcHVibGljIHJlYWRvbmx5IGlkZW50aXR5UG9vbDogY29nbml0by5DZm5JZGVudGl0eVBvb2w7XG4gIHB1YmxpYyByZWFkb25seSBsYW1iZGFUcmlnZ2VyczogUmVjb3JkPHN0cmluZywgbGFtYmRhLkZ1bmN0aW9uPjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQ29nbml0b1N0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGNvbmZpZywga21zS2V5LCBhcGlSb2xlIH0gPSBwcm9wcztcblxuICAgIC8vIExhbWJkYSBleGVjdXRpb24gcm9sZSBmb3IgQ29nbml0byB0cmlnZ2Vyc1xuICAgIGNvbnN0IHRyaWdnZXJSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDb2duaXRvVHJpZ2dlclJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1jb2duaXRvLXRyaWdnZXItcm9sZWAsXG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUFNIHJvbGUgZm9yIENvZ25pdG8gTGFtYmRhIHRyaWdnZXJzJyxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBEeW5hbW9EQlBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpTY2FuJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL21lZGVlei0ke2Vudmlyb25tZW50fS0qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvbWVkZWV6LSR7ZW52aXJvbm1lbnR9LSovaW5kZXgvKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgICAgQ29nbml0b1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5DcmVhdGVVc2VyJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5TZXRVc2VyUGFzc3dvcmQnLFxuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pblVwZGF0ZVVzZXJBdHRyaWJ1dGVzJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5EaXNhYmxlVXNlcicsXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluRW5hYmxlVXNlcicsXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluQWRkVXNlclRvR3JvdXAnLFxuICAgICAgICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pblJlbW92ZVVzZXJGcm9tR3JvdXAnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIFNFU1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc2VzOlNlbmRFbWFpbCcsXG4gICAgICAgICAgICAgICAgJ3NlczpTZW5kUmF3RW1haWwnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIEV2ZW50QnJpZGdlUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdldmVudHM6UHV0RXZlbnRzJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6ZXZlbnRzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpldmVudC1idXMvbWVkZWV6LSR7ZW52aXJvbm1lbnR9LSpgLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIFRyaWdnZXJzXG4gICAgdGhpcy5sYW1iZGFUcmlnZ2VycyA9IHt9O1xuXG4gICAgLy8gUHJlIFNpZ24tdXAgVHJpZ2dlclxuICAgIHRoaXMubGFtYmRhVHJpZ2dlcnMucHJlU2lnblVwID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUHJlU2lnblVwVHJpZ2dlcicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1jb2duaXRvLXByZS1zaWdudXBgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uLy4uLy4uL2FwcHMvYXBpL2Rpc3QvbGFtYmRhL2NvZ25pdG8tdHJpZ2dlcnMvcHJlLXNpZ251cCcpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgcm9sZTogdHJpZ2dlclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogZW52aXJvbm1lbnQsXG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgS01TX0tFWV9JRDoga21zS2V5LmtleUlkLFxuICAgICAgICBSRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgICBEWU5BTU9EQl9UQUJMRV9QUkVGSVg6IGBtZWRlZXotJHtlbnZpcm9ubWVudH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFBvc3QgQ29uZmlybWF0aW9uIFRyaWdnZXJcbiAgICB0aGlzLmxhbWJkYVRyaWdnZXJzLnBvc3RDb25maXJtYXRpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQb3N0Q29uZmlybWF0aW9uVHJpZ2dlcicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1jb2duaXRvLXBvc3QtY29uZmlybWF0aW9uYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi8uLi8uLi9hcHBzL2FwaS9kaXN0L2xhbWJkYS9jb2duaXRvLXRyaWdnZXJzL3Bvc3QtY29uZmlybWF0aW9uJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICByb2xlOiB0cmlnZ2VyUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBlbnZpcm9ubWVudCxcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBLTVNfS0VZX0lEOiBrbXNLZXkua2V5SWQsXG4gICAgICAgIFJFR0lPTjogdGhpcy5yZWdpb24sXG4gICAgICAgIERZTkFNT0RCX1RBQkxFX1BSRUZJWDogYG1lZGVlei0ke2Vudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUHJlIEF1dGhlbnRpY2F0aW9uIFRyaWdnZXJcbiAgICB0aGlzLmxhbWJkYVRyaWdnZXJzLnByZUF1dGhlbnRpY2F0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUHJlQXV0aGVudGljYXRpb25UcmlnZ2VyJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWNvZ25pdG8tcHJlLWF1dGhgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uLy4uLy4uL2FwcHMvYXBpL2Rpc3QvbGFtYmRhL2NvZ25pdG8tdHJpZ2dlcnMvcHJlLWF1dGhlbnRpY2F0aW9uJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICByb2xlOiB0cmlnZ2VyUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIE5PREVfRU5WOiBlbnZpcm9ubWVudCxcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICBLTVNfS0VZX0lEOiBrbXNLZXkua2V5SWQsXG4gICAgICAgIFJFR0lPTjogdGhpcy5yZWdpb24sXG4gICAgICAgIERZTkFNT0RCX1RBQkxFX1BSRUZJWDogYG1lZGVlei0ke2Vudmlyb25tZW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gUG9zdCBBdXRoZW50aWNhdGlvbiBUcmlnZ2VyXG4gICAgdGhpcy5sYW1iZGFUcmlnZ2Vycy5wb3N0QXV0aGVudGljYXRpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQb3N0QXV0aGVudGljYXRpb25UcmlnZ2VyJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWNvZ25pdG8tcG9zdC1hdXRoYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi8uLi8uLi9hcHBzL2FwaS9kaXN0L2xhbWJkYS9jb2duaXRvLXRyaWdnZXJzL3Bvc3QtYXV0aGVudGljYXRpb24nKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIHJvbGU6IHRyaWdnZXJSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IGVudmlyb25tZW50LFxuICAgICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICAgIEtNU19LRVlfSUQ6IGttc0tleS5rZXlJZCxcbiAgICAgICAgUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgRFlOQU1PREJfVEFCTEVfUFJFRklYOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQXV0aCBDaGFsbGVuZ2UgVHJpZ2dlciAoZm9yIE1GQSlcbiAgICB0aGlzLmxhbWJkYVRyaWdnZXJzLmNyZWF0ZUF1dGhDaGFsbGVuZ2UgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDcmVhdGVBdXRoQ2hhbGxlbmdlVHJpZ2dlcicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1jb2duaXRvLWNyZWF0ZS1hdXRoLWNoYWxsZW5nZWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vLi4vLi4vYXBwcy9hcGkvZGlzdC9sYW1iZGEvY29nbml0by10cmlnZ2Vycy9jcmVhdGUtYXV0aC1jaGFsbGVuZ2UnKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIHJvbGU6IHRyaWdnZXJSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgTk9ERV9FTlY6IGVudmlyb25tZW50LFxuICAgICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICAgIEtNU19LRVlfSUQ6IGttc0tleS5rZXlJZCxcbiAgICAgICAgUkVHSU9OOiB0aGlzLnJlZ2lvbixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBEZWZpbmUgQXV0aCBDaGFsbGVuZ2UgVHJpZ2dlclxuICAgIHRoaXMubGFtYmRhVHJpZ2dlcnMuZGVmaW5lQXV0aENoYWxsZW5nZSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RlZmluZUF1dGhDaGFsbGVuZ2VUcmlnZ2VyJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWNvZ25pdG8tZGVmaW5lLWF1dGgtY2hhbGxlbmdlYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi8uLi8uLi9hcHBzL2FwaS9kaXN0L2xhbWJkYS9jb2duaXRvLXRyaWdnZXJzL2RlZmluZS1hdXRoLWNoYWxsZW5nZScpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgcm9sZTogdHJpZ2dlclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogZW52aXJvbm1lbnQsXG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgS01TX0tFWV9JRDoga21zS2V5LmtleUlkLFxuICAgICAgICBSRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFZlcmlmeSBBdXRoIENoYWxsZW5nZSBSZXNwb25zZSBUcmlnZ2VyXG4gICAgdGhpcy5sYW1iZGFUcmlnZ2Vycy52ZXJpZnlBdXRoQ2hhbGxlbmdlUmVzcG9uc2UgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdWZXJpZnlBdXRoQ2hhbGxlbmdlUmVzcG9uc2VUcmlnZ2VyJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgbWVkZWV6LSR7ZW52aXJvbm1lbnR9LWNvZ25pdG8tdmVyaWZ5LWF1dGgtY2hhbGxlbmdlYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi8uLi8uLi9hcHBzL2FwaS9kaXN0L2xhbWJkYS9jb2duaXRvLXRyaWdnZXJzL3ZlcmlmeS1hdXRoLWNoYWxsZW5nZS1yZXNwb25zZScpLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgcm9sZTogdHJpZ2dlclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBOT0RFX0VOVjogZW52aXJvbm1lbnQsXG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgICAgS01TX0tFWV9JRDoga21zS2V5LmtleUlkLFxuICAgICAgICBSRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgUG9vbFxuICAgIHRoaXMudXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCAnTWVkZWV6VXNlclBvb2wnLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tdXNlci1wb29sYCxcbiAgICAgIHNpZ25JbkNhc2VTZW5zaXRpdmU6IGZhbHNlLFxuICAgICAgc2lnbkluQWxpYXNlczoge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxuICAgICAgICBwaG9uZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBnaXZlbk5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmYW1pbHlOYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgcGhvbmVOdW1iZXI6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XG4gICAgICAgIGNsaW5pY0lkOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMSxcbiAgICAgICAgICBtYXhMZW46IDUwLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgICByb2xlOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMSxcbiAgICAgICAgICBtYXhMZW46IDIwLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0pLFxuICAgICAgICB0cmlhbEVuZERhdGU6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7XG4gICAgICAgICAgbWluTGVuOiAwLFxuICAgICAgICAgIG1heExlbjogMzAsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICAgIHN1YnNjcmlwdGlvblN0YXR1czogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHtcbiAgICAgICAgICBtaW5MZW46IDEsXG4gICAgICAgICAgbWF4TGVuOiAyMCxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgICAgcGVybWlzc2lvbnM6IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7XG4gICAgICAgICAgbWluTGVuOiAwLFxuICAgICAgICAgIG1heExlbjogMjA0OCxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgICAgaW52aXRlZEJ5OiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMCxcbiAgICAgICAgICBtYXhMZW46IDEyOCxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9KSxcbiAgICAgICAgb25ib2FyZGluZ0NvbXBsZXRlOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMSxcbiAgICAgICAgICBtYXhMZW46IDUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICBkZWxldGlvblByb3RlY3Rpb246IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGxhbWJkYVRyaWdnZXJzOiB7XG4gICAgICAgIHByZVNpZ25VcDogdGhpcy5sYW1iZGFUcmlnZ2Vycy5wcmVTaWduVXAsXG4gICAgICAgIHBvc3RDb25maXJtYXRpb246IHRoaXMubGFtYmRhVHJpZ2dlcnMucG9zdENvbmZpcm1hdGlvbixcbiAgICAgICAgcHJlQXV0aGVudGljYXRpb246IHRoaXMubGFtYmRhVHJpZ2dlcnMucHJlQXV0aGVudGljYXRpb24sXG4gICAgICAgIHBvc3RBdXRoZW50aWNhdGlvbjogdGhpcy5sYW1iZGFUcmlnZ2Vycy5wb3N0QXV0aGVudGljYXRpb24sXG4gICAgICAgIGNyZWF0ZUF1dGhDaGFsbGVuZ2U6IHRoaXMubGFtYmRhVHJpZ2dlcnMuY3JlYXRlQXV0aENoYWxsZW5nZSxcbiAgICAgICAgZGVmaW5lQXV0aENoYWxsZW5nZTogdGhpcy5sYW1iZGFUcmlnZ2Vycy5kZWZpbmVBdXRoQ2hhbGxlbmdlLFxuICAgICAgICB2ZXJpZnlBdXRoQ2hhbGxlbmdlUmVzcG9uc2U6IHRoaXMubGFtYmRhVHJpZ2dlcnMudmVyaWZ5QXV0aENoYWxsZW5nZVJlc3BvbnNlLFxuICAgICAgfSxcbiAgICAgIHVzZXJWZXJpZmljYXRpb246IHtcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnV2VsY29tZSB0byBNZWRlZXogLSBWZXJpZnkgeW91ciBhY2NvdW50JyxcbiAgICAgICAgZW1haWxCb2R5OiBgXG4gICAgICAgICAgPGRpdiBzdHlsZT1cImZvbnQtZmFtaWx5OiBBcmlhbCwgc2Fucy1zZXJpZjsgbWF4LXdpZHRoOiA2MDBweDsgbWFyZ2luOiAwIGF1dG87IHBhZGRpbmc6IDIwcHg7XCI+XG4gICAgICAgICAgICA8ZGl2IHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBib3JkZXItYm90dG9tOiAycHggc29saWQgIzI1NjNlYjsgcGFkZGluZy1ib3R0b206IDIwcHg7XCI+XG4gICAgICAgICAgICAgIDxoMSBzdHlsZT1cImNvbG9yOiAjMjU2M2ViOyBtYXJnaW46IDA7XCI+TWVkZWV6PC9oMT5cbiAgICAgICAgICAgICAgPHAgc3R5bGU9XCJjb2xvcjogIzY0NzQ4YjsgbWFyZ2luOiA1cHggMCAwIDA7XCI+SGVhbHRoY2FyZSBQcmFjdGljZSBNYW5hZ2VtZW50PC9wPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJwYWRkaW5nOiAzMHB4IDA7XCI+XG4gICAgICAgICAgICAgIDxoMiBzdHlsZT1cImNvbG9yOiAjMWUyOTNiOyBtYXJnaW4tYm90dG9tOiAyMHB4O1wiPldlbGNvbWUgdG8gTWVkZWV6ITwvaDI+XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICA8cCBzdHlsZT1cImNvbG9yOiAjNDc1NTY5OyBsaW5lLWhlaWdodDogMS42OyBtYXJnaW4tYm90dG9tOiAyNXB4O1wiPlxuICAgICAgICAgICAgICAgIFRoYW5rIHlvdSBmb3Igam9pbmluZyBNZWRlZXouIFBsZWFzZSB2ZXJpZnkgeW91ciBlbWFpbCBhZGRyZXNzIHRvIGNvbXBsZXRlIHlvdXIgYWNjb3VudCBzZXR1cCBhbmQgc3RhcnQgbWFuYWdpbmcgeW91ciBoZWFsdGhjYXJlIHByYWN0aWNlIG1vcmUgZWZmaWNpZW50bHkuXG4gICAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJ0ZXh0LWFsaWduOiBjZW50ZXI7IG1hcmdpbjogMzBweCAwO1wiPlxuICAgICAgICAgICAgICAgIDxwIHN0eWxlPVwiY29sb3I6ICM0NzU1Njk7IGZvbnQtc2l6ZTogMThweDsgZm9udC13ZWlnaHQ6IGJvbGQ7IG1hcmdpbi1ib3R0b206IDE1cHg7XCI+XG4gICAgICAgICAgICAgICAgICBZb3VyIHZlcmlmaWNhdGlvbiBjb2RlIGlzOlxuICAgICAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgICAgICA8ZGl2IHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjogI2YxZjVmOTsgYm9yZGVyOiAycHggc29saWQgI2UyZThmMDsgYm9yZGVyLXJhZGl1czogOHB4OyBwYWRkaW5nOiAyMHB4OyBkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XCI+XG4gICAgICAgICAgICAgICAgICA8c3BhbiBzdHlsZT1cImZvbnQtZmFtaWx5OiAnQ291cmllciBOZXcnLCBtb25vc3BhY2U7IGZvbnQtc2l6ZTogMjRweDsgZm9udC13ZWlnaHQ6IGJvbGQ7IGNvbG9yOiAjMjU2M2ViOyBsZXR0ZXItc3BhY2luZzogM3B4O1wiPlxuICAgICAgICAgICAgICAgICAgICB7IyMjI31cbiAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICA8cCBzdHlsZT1cImNvbG9yOiAjNjQ3NDhiOyBmb250LXNpemU6IDE0cHg7IGxpbmUtaGVpZ2h0OiAxLjU7XCI+XG4gICAgICAgICAgICAgICAgVGhpcyBjb2RlIHdpbGwgZXhwaXJlIGluIDI0IGhvdXJzLiBJZiB5b3UgZGlkbid0IHJlcXVlc3QgdGhpcyB2ZXJpZmljYXRpb24sIHBsZWFzZSBpZ25vcmUgdGhpcyBlbWFpbC5cbiAgICAgICAgICAgICAgPC9wPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIDxkaXYgc3R5bGU9XCJib3JkZXItdG9wOiAxcHggc29saWQgI2UyZThmMDsgcGFkZGluZy10b3A6IDIwcHg7IHRleHQtYWxpZ246IGNlbnRlcjtcIj5cbiAgICAgICAgICAgICAgPHAgc3R5bGU9XCJjb2xvcjogIzk0YTNiODsgZm9udC1zaXplOiAxMnB4OyBtYXJnaW46IDA7XCI+XG4gICAgICAgICAgICAgICAgJmNvcHk7IDIwMjQgTWVkZWV6LiBBbGwgcmlnaHRzIHJlc2VydmVkLjxicj5cbiAgICAgICAgICAgICAgICBUaGlzIGVtYWlsIHdhcyBzZW50IHRvIHZlcmlmeSB5b3VyIGFjY291bnQgcmVnaXN0cmF0aW9uLlxuICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgYCxcbiAgICAgICAgZW1haWxTdHlsZTogY29nbml0by5WZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXG4gICAgICB9LFxuICAgICAgZGV2aWNlVHJhY2tpbmc6IHtcbiAgICAgICAgY2hhbGxlbmdlUmVxdWlyZWRPbk5ld0RldmljZTogdHJ1ZSxcbiAgICAgICAgZGV2aWNlT25seVJlbWVtYmVyZWRPblVzZXJQcm9tcHQ6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgUG9vbCBHcm91cHMgZm9yIFJvbGUtQmFzZWQgQWNjZXNzIENvbnRyb2xcbiAgICBjb25zdCBncm91cHMgPSBbXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdTeXN0ZW1BZG1pbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3lzdGVtIGFkbWluaXN0cmF0b3JzIHdpdGggZnVsbCBwbGF0Zm9ybSBhY2Nlc3MnLFxuICAgICAgICBwcmVjZWRlbmNlOiAwLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ0FkbWluJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdDbGluaWMgYWRtaW5pc3RyYXRvcnMgd2l0aCBmdWxsIGNsaW5pYyBtYW5hZ2VtZW50IGFjY2VzcycsXG4gICAgICAgIHByZWNlZGVuY2U6IDEwLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ0RvY3RvcicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnSGVhbHRoY2FyZSBwcm92aWRlcnMgd2l0aCBwYXRpZW50IGNhcmUgYWNjZXNzJyxcbiAgICAgICAgcHJlY2VkZW5jZTogMjAsXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICBuYW1lOiAnU3RhZmYnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0NsaW5pYyBzdGFmZiB3aXRoIGxpbWl0ZWQgYWNjZXNzJyxcbiAgICAgICAgcHJlY2VkZW5jZTogMzAsXG4gICAgICB9LFxuICAgIF07XG5cbiAgICBncm91cHMuZm9yRWFjaCgoZ3JvdXApID0+IHtcbiAgICAgIG5ldyBjb2duaXRvLkNmblVzZXJQb29sR3JvdXAodGhpcywgYCR7Z3JvdXAubmFtZX1Hcm91cGAsIHtcbiAgICAgICAgdXNlclBvb2xJZDogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgICBncm91cE5hbWU6IGdyb3VwLm5hbWUsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBncm91cC5kZXNjcmlwdGlvbixcbiAgICAgICAgcHJlY2VkZW5jZTogZ3JvdXAucHJlY2VkZW5jZSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gVXNlciBQb29sIENsaWVudFxuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnTWVkZWV6VXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS13ZWItY2xpZW50YCxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSwgLy8gUHVibGljIGNsaWVudCBmb3Igd2ViL21vYmlsZVxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJQYXNzd29yZDogdHJ1ZSxcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgY3VzdG9tOiB0cnVlLCAvLyBFbmFibGUgY3VzdG9tIGF1dGggZmxvd3MgZm9yIE1GQVxuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogZmFsc2UsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICAgIGltcGxpY2l0Q29kZUdyYW50OiBmYWxzZSxcbiAgICAgICAgICBjbGllbnRDcmVkZW50aWFsczogZmFsc2UsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW1xuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFLFxuICAgICAgICBdLFxuICAgICAgICBjYWxsYmFja1VybHM6IGNvbmZpZy5hbGxvd2VkT3JpZ2lucy5tYXAob3JpZ2luID0+IGAke29yaWdpbn0vYXV0aC9jYWxsYmFja2ApLFxuICAgICAgICBsb2dvdXRVcmxzOiBjb25maWcuYWxsb3dlZE9yaWdpbnMubWFwKG9yaWdpbiA9PiBgJHtvcmlnaW59L2F1dGgvbG9nb3V0YCksXG4gICAgICB9LFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgIF0sXG4gICAgICByZWZyZXNoVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICBhY2Nlc3NUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLFxuICAgICAgZW5hYmxlVG9rZW5SZXZvY2F0aW9uOiB0cnVlLFxuICAgICAgcmVhZEF0dHJpYnV0ZXM6IG5ldyBjb2duaXRvLkNsaWVudEF0dHJpYnV0ZXMoKVxuICAgICAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyh7XG4gICAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICAgICAgZW1haWxWZXJpZmllZDogdHJ1ZSxcbiAgICAgICAgICBnaXZlbk5hbWU6IHRydWUsXG4gICAgICAgICAgZmFtaWx5TmFtZTogdHJ1ZSxcbiAgICAgICAgICBwaG9uZU51bWJlcjogdHJ1ZSxcbiAgICAgICAgfSlcbiAgICAgICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKCdjbGluaWNJZCcsICdyb2xlJywgJ3RyaWFsRW5kRGF0ZScsICdzdWJzY3JpcHRpb25TdGF0dXMnLCAncGVybWlzc2lvbnMnKSxcbiAgICAgIHdyaXRlQXR0cmlidXRlczogbmV3IGNvZ25pdG8uQ2xpZW50QXR0cmlidXRlcygpXG4gICAgICAgIC53aXRoU3RhbmRhcmRBdHRyaWJ1dGVzKHtcbiAgICAgICAgICBnaXZlbk5hbWU6IHRydWUsXG4gICAgICAgICAgZmFtaWx5TmFtZTogdHJ1ZSxcbiAgICAgICAgICBwaG9uZU51bWJlcjogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyBJZGVudGl0eSBQb29sIGZvciBmZWRlcmF0ZWQgaWRlbnRpdGllcyAoaWYgbmVlZGVkIGZvciBtb2JpbGUvU0RLIGFjY2VzcylcbiAgICB0aGlzLmlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbCh0aGlzLCAnTWVkZWV6SWRlbnRpdHlQb29sJywge1xuICAgICAgaWRlbnRpdHlQb29sTmFtZTogYG1lZGVlei0ke2Vudmlyb25tZW50fS1pZGVudGl0eS1wb29sYCxcbiAgICAgIGFsbG93VW5hdXRoZW50aWNhdGVkSWRlbnRpdGllczogZmFsc2UsXG4gICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGNsaWVudElkOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgcHJvdmlkZXJOYW1lOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICAgIHNlcnZlclNpZGVUb2tlbkNoZWNrOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIElkZW50aXR5IFBvb2wgUm9sZXNcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29nbml0b0F1dGhlbnRpY2F0ZWRSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGBtZWRlZXotJHtlbnZpcm9ubWVudH0tY29nbml0by1hdXRoZW50aWNhdGVkLXJvbGVgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7XG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICdhdXRoZW50aWNhdGVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknXG4gICAgICApLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ29nbml0b0F1dGhlbnRpY2F0ZWQ6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ21vYmlsZWFuYWx5dGljczpQdXRFdmVudHMnLFxuICAgICAgICAgICAgICAgICdjb2duaXRvLXN5bmM6KicsXG4gICAgICAgICAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHk6KicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2V4ZWN1dGUtYXBpOkludm9rZScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToqLyovR0VULypgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmV4ZWN1dGUtYXBpOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fToqLyovUE9TVC8qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06Ki8qL1BVVC8qYCxcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06Ki8qL0RFTEVURS8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KHRoaXMsICdJZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudCcsIHtcbiAgICAgIGlkZW50aXR5UG9vbElkOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICByb2xlczoge1xuICAgICAgICBhdXRoZW50aWNhdGVkOiBhdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBDb2duaXRvIHBlcm1pc3Npb25zIHRvIGV4aXN0aW5nIEFQSSByb2xlXG4gICAgYXBpUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluQ3JlYXRlVXNlcicsXG4gICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluU2V0VXNlclBhc3N3b3JkJyxcbiAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5VcGRhdGVVc2VyQXR0cmlidXRlcycsXG4gICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluR2V0VXNlcicsXG4gICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluRGlzYWJsZVVzZXInLFxuICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkVuYWJsZVVzZXInLFxuICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkFkZFVzZXJUb0dyb3VwJyxcbiAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5SZW1vdmVVc2VyRnJvbUdyb3VwJyxcbiAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5MaXN0R3JvdXBzRm9yVXNlcicsXG4gICAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluSW5pdGlhdGVBdXRoJyxcbiAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5SZXNwb25kVG9BdXRoQ2hhbGxlbmdlJyxcbiAgICAgICAgICAnY29nbml0by1pZHA6TGlzdFVzZXJzJyxcbiAgICAgICAgICAnY29nbml0by1pZHA6TGlzdFVzZXJzSW5Hcm91cCcsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW3RoaXMudXNlclBvb2wudXNlclBvb2xBcm5dLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gU3RvcmUgY29uZmlndXJhdGlvbiBpbiBQYXJhbWV0ZXIgU3RvcmVcbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2NvZ25pdG8vdXNlci1wb29sLWlkYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9tZWRlZXovJHtlbnZpcm9ubWVudH0vY29nbml0by91c2VyLXBvb2wtY2xpZW50LWlkYCxcbiAgICAgIHN0cmluZ1ZhbHVlOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnSWRlbnRpdHlQb29sSWQnLCB7XG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgL21lZGVlei8ke2Vudmlyb25tZW50fS9jb2duaXRvL2lkZW50aXR5LXBvb2wtaWRgLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBJZGVudGl0eSBQb29sIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdVc2VyUG9vbEFybicsIHtcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAvbWVkZWV6LyR7ZW52aXJvbm1lbnR9L2NvZ25pdG8vdXNlci1wb29sLWFybmAsXG4gICAgICBzdHJpbmdWYWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQVJOJyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZE91dHB1dCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpVc2VyUG9vbElkLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkT3V0cHV0Jywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBNZWRlZXpVc2VyUG9vbENsaWVudElkLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdJZGVudGl0eVBvb2xJZE91dHB1dCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmlkZW50aXR5UG9vbC5yZWYsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gSWRlbnRpdHkgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6SWRlbnRpdHlQb29sSWQtJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQXJuT3V0cHV0Jywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgTWVkZWV6VXNlclBvb2xBcm4tJHtlbnZpcm9ubWVudH1gLFxuICAgIH0pO1xuICB9XG59Il19