import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
  AdminAddUserToGroupCommand,
  RespondToAuthChallengeCommand,
  MessageActionType,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { logger } from '@/utils/logger';
import {
  LoginRequest,
  LoginResponse,
  SignupRequest,
  SignupResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  RefreshTokenRequest,
  RefreshTokenResponse,
  MagicLinkRequest,
  MagicLinkResponse,
  InviteUserRequest,
  InviteUserResponse,
  UserInvitation,
  MagicLinkToken,
  UserRole,
  SubscriptionStatus,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '@/types';

export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;
  private docClient: DynamoDBDocumentClient;
  private sesClient: SESClient;
  private userPoolId: string;
  private clientId: string;
  private region: string;
  private tablePrefix: string;
  private frontendUrl: string;

  constructor(
    cognitoClient: CognitoIdentityProviderClient,
    docClient: DynamoDBDocumentClient,
    sesClient: SESClient
  ) {
    this.cognitoClient = cognitoClient;
    this.docClient = docClient;
    this.sesClient = sesClient;
    this.userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    this.clientId = process.env.COGNITO_CLIENT_ID || '';
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.tablePrefix = process.env.DYNAMODB_TABLE_PREFIX || 'medeez-dev';
    this.frontendUrl = process.env.FRONTEND_URL || 'https://app.medeez.com';

    if (!this.userPoolId || !this.clientId) {
      throw new Error('Missing required Cognito configuration');
    }
  }

  /**
   * User login with email/password and optional MFA
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    try {
      logger.info('Initiating user login', { email: request.email });

      const command = new InitiateAuthCommand({
        AuthFlow: 'USER_SRP_AUTH',
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: request.email,
          PASSWORD: request.password,
          SRP_A: 'placeholder', // This would be calculated by the client
        },
      });

      let authResult = await this.cognitoClient.send(command);

      // Handle MFA challenge if required
      if (authResult.ChallengeName === 'CUSTOM_CHALLENGE') {
        if (!request.mfaCode) {
          throw new UnauthorizedError('MFA code required');
        }

        const challengeCommand = new RespondToAuthChallengeCommand({
          ClientId: this.clientId,
          ChallengeName: authResult.ChallengeName,
          Session: authResult.Session,
          ChallengeResponses: {
            USERNAME: request.email,
            ANSWER: request.mfaCode,
          },
        });

        authResult = await this.cognitoClient.send(challengeCommand);
      }

      if (!authResult.AuthenticationResult) {
        throw new UnauthorizedError('Authentication failed');
      }

      const { AccessToken, RefreshToken, IdToken, ExpiresIn, TokenType } = authResult.AuthenticationResult;

      if (!AccessToken || !RefreshToken || !IdToken) {
        throw new UnauthorizedError('Invalid authentication response');
      }

      // Decode tokens to get user information
      const idTokenPayload = jwt.decode(IdToken) as any;
      const accessTokenPayload = jwt.decode(AccessToken) as any;

      const userId = idTokenPayload.sub;
      const email = idTokenPayload.email;
      const clinicId = idTokenPayload['custom:clinicId'];

      // Get user and clinic details
      const [userDetails, clinicDetails] = await Promise.all([
        this.getUserDetails(userId),
        this.getClinicDetails(clinicId),
      ]);

      const response: LoginResponse = {
        accessToken: AccessToken,
        refreshToken: RefreshToken,
        idToken: IdToken,
        expiresIn: ExpiresIn || 3600,
        tokenType: TokenType || 'Bearer',
        user: {
          id: userId,
          email: email,
          firstName: userDetails.firstName,
          lastName: userDetails.lastName,
          role: userDetails.role,
          clinicId: clinicId,
          permissions: userDetails.permissions || [],
          onboardingComplete: userDetails.onboardingComplete || false,
          subscriptionStatus: idTokenPayload['custom:subscriptionStatus'],
          trialEndDate: idTokenPayload['custom:trialEndDate'],
        },
        clinic: {
          id: clinicId,
          name: clinicDetails.name,
          subscriptionStatus: clinicDetails.subscriptionStatus,
          subscriptionTier: clinicDetails.subscriptionTier,
          trialEndDate: clinicDetails.trialEndDate,
          features: clinicDetails.features || [],
        },
      };

      logger.info('User login successful', { userId, email, clinicId });
      return response;

    } catch (error: any) {
      logger.error('Login failed', { email: request.email, error: error.message });
      throw error;
    }
  }

  /**
   * User signup for new clinic or invited user
   */
  async signup(request: SignupRequest): Promise<SignupResponse> {
    try {
      logger.info('Initiating user signup', { email: request.email, hasInvitation: !!request.invitationCode });

      // Validate invitation code if provided
      if (request.invitationCode) {
        await this.validateInvitationCode(request.email, request.invitationCode);
      }

      const command = new SignUpCommand({
        ClientId: this.clientId,
        Username: request.email,
        Password: request.password,
        UserAttributes: [
          { Name: 'email', Value: request.email },
          { Name: 'given_name', Value: request.firstName },
          { Name: 'family_name', Value: request.lastName },
        ],
        ValidationData: request.invitationCode ? [{ Name: 'invitationCode', Value: request.invitationCode }] : undefined,
      });

      const result = await this.cognitoClient.send(command);

      const response: SignupResponse = {
        success: true,
        message: request.invitationCode 
          ? 'Account created successfully. You can now log in.' 
          : 'Account created successfully. Please verify your email address.',
        requiresVerification: !request.invitationCode,
        userId: result.UserSub,
      };

      logger.info('User signup successful', { 
        userId: result.UserSub, 
        email: request.email, 
        hasInvitation: !!request.invitationCode 
      });

      return response;

    } catch (error: any) {
      logger.error('Signup failed', { email: request.email, error: error.message });
      throw error;
    }
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(request: ForgotPasswordRequest): Promise<{ success: boolean; message: string }> {
    try {
      const command = new ForgotPasswordCommand({
        ClientId: this.clientId,
        Username: request.email,
      });

      await this.cognitoClient.send(command);

      return {
        success: true,
        message: 'Password reset code has been sent to your email address.',
      };

    } catch (error: any) {
      logger.error('Forgot password failed', { email: request.email, error: error.message });
      throw error;
    }
  }

  /**
   * Reset password with confirmation code
   */
  async resetPassword(request: ResetPasswordRequest): Promise<{ success: boolean; message: string }> {
    try {
      const command = new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        Username: request.email,
        ConfirmationCode: request.confirmationCode,
        Password: request.newPassword,
      });

      await this.cognitoClient.send(command);

      return {
        success: true,
        message: 'Password has been reset successfully.',
      };

    } catch (error: any) {
      logger.error('Reset password failed', { email: request.email, error: error.message });
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: this.clientId,
        AuthParameters: {
          REFRESH_TOKEN: request.refreshToken,
        },
      });

      const result = await this.cognitoClient.send(command);

      if (!result.AuthenticationResult) {
        throw new UnauthorizedError('Token refresh failed');
      }

      const { AccessToken, IdToken, ExpiresIn, TokenType } = result.AuthenticationResult;

      if (!AccessToken || !IdToken) {
        throw new UnauthorizedError('Invalid token refresh response');
      }

      return {
        accessToken: AccessToken,
        idToken: IdToken,
        expiresIn: ExpiresIn || 3600,
        tokenType: TokenType || 'Bearer',
      };

    } catch (error: any) {
      logger.error('Token refresh failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate magic link for patient portal access
   */
  async generateMagicLink(request: MagicLinkRequest): Promise<MagicLinkResponse> {
    try {
      const tokenId = nanoid();
      const expiresIn = request.expiresIn || 24 * 60 * 60; // 24 hours default
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Create JWT token with patient information
      const tokenPayload = {
        tokenId,
        patientEmail: request.patientEmail,
        clinicId: request.clinicId,
        type: 'magic_link',
        exp: Math.floor(Date.now() / 1000) + expiresIn,
        iat: Math.floor(Date.now() / 1000),
      };

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'default-secret');

      // Store magic link token in database
      const magicLinkToken: MagicLinkToken = {
        PK: `MAGIC_LINK#${tokenId}`,
        SK: `MAGIC_LINK#${tokenId}`,
        GSI1PK: `CLINIC#${request.clinicId}`,
        GSI1SK: `MAGIC_LINK#${expiresAt}`,
        entityType: 'AUDIT',
        clinicId: request.clinicId,
        token: tokenId,
        patientEmail: request.patientEmail,
        expiresAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + expiresIn + (7 * 24 * 60 * 60), // Keep for 7 days after expiry
      };

      const command = new PutCommand({
        TableName: `${this.tablePrefix}-tokens`,
        Item: magicLinkToken,
      });

      await this.docClient.send(command);

      const magicLink = `${this.frontendUrl}/patient/login?token=${token}`;

      return {
        magicLink,
        token,
        expiresAt,
      };

    } catch (error: any) {
      logger.error('Magic link generation failed', { 
        patientEmail: request.patientEmail, 
        clinicId: request.clinicId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Invite user to clinic
   */
  async inviteUser(request: InviteUserRequest, invitedBy: string): Promise<InviteUserResponse> {
    try {
      const invitationCode = nanoid();
      const expiresIn = request.expiresIn || 7 * 24 * 60 * 60; // 7 days default
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Create invitation record
      const invitation: UserInvitation = {
        PK: `INVITATION#${invitationCode}`,
        SK: `INVITATION#${invitationCode}`,
        GSI1PK: `CLINIC#${request.clinicId}`,
        GSI1SK: `INVITATION#${expiresAt}`,
        GSI2PK: `EMAIL#${request.email}`,
        GSI2SK: `INVITATION#${expiresAt}`,
        entityType: 'AUDIT',
        clinicId: request.clinicId,
        invitationCode,
        invitedEmail: request.email,
        invitedBy,
        role: request.role,
        firstName: request.firstName,
        lastName: request.lastName,
        permissions: request.permissions,
        status: 'PENDING',
        expiresAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + expiresIn + (30 * 24 * 60 * 60), // Keep for 30 days after expiry
      };

      const command = new PutCommand({
        TableName: `${this.tablePrefix}-invitations`,
        Item: invitation,
      });

      await this.docClient.send(command);

      // Send invitation email
      await this.sendInvitationEmail(invitation);

      const invitationLink = `${this.frontendUrl}/signup?invitation=${invitationCode}`;

      return {
        invitationCode,
        invitationLink,
        expiresAt,
      };

    } catch (error: any) {
      logger.error('User invitation failed', { 
        email: request.email, 
        clinicId: request.clinicId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Disable/Enable user account
   */
  async setUserEnabled(userId: string, enabled: boolean): Promise<void> {
    try {
      const command = enabled
        ? new AdminEnableUserCommand({
            UserPoolId: this.userPoolId,
            Username: userId,
          })
        : new AdminDisableUserCommand({
            UserPoolId: this.userPoolId,
            Username: userId,
          });

      await this.cognitoClient.send(command);

      // Update user record in DynamoDB
      const updateCommand = new UpdateCommand({
        TableName: `${this.tablePrefix}-users`,
        Key: {
          PK: `USER#${userId}`,
          SK: `USER#${userId}`,
        },
        UpdateExpression: 'SET isActive = :enabled, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':enabled': enabled,
          ':updatedAt': new Date().toISOString(),
        },
      });

      await this.docClient.send(updateCommand);

      logger.info(`User ${enabled ? 'enabled' : 'disabled'}`, { userId });

    } catch (error: any) {
      logger.error(`Failed to ${enabled ? 'enable' : 'disable'} user`, { userId, error: error.message });
      throw error;
    }
  }

  // Private helper methods

  private async validateInvitationCode(email: string, invitationCode: string): Promise<void> {
    const command = new GetCommand({
      TableName: `${this.tablePrefix}-invitations`,
      Key: {
        PK: `INVITATION#${invitationCode}`,
        SK: `INVITATION#${invitationCode}`,
      },
    });

    const result = await this.docClient.send(command);
    const invitation = result.Item;

    if (!invitation) {
      throw new ValidationError('Invalid invitation code');
    }

    if (invitation.status !== 'PENDING') {
      throw new ValidationError('Invitation has already been used or expired');
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      throw new ValidationError('Invitation has expired');
    }

    if (invitation.invitedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new ValidationError('Invitation is not for this email address');
    }
  }

  private async getUserDetails(userId: string): Promise<any> {
    const command = new GetCommand({
      TableName: `${this.tablePrefix}-users`,
      Key: {
        PK: `USER#${userId}`,
        SK: `USER#${userId}`,
      },
    });

    const result = await this.docClient.send(command);
    return result.Item || {};
  }

  private async getClinicDetails(clinicId: string): Promise<any> {
    const command = new GetCommand({
      TableName: `${this.tablePrefix}-clinics`,
      Key: {
        PK: `CLINIC#${clinicId}`,
        SK: `CLINIC#${clinicId}`,
      },
    });

    const result = await this.docClient.send(command);
    return result.Item || {};
  }

  private async sendInvitationEmail(invitation: UserInvitation): Promise<void> {
    const invitationLink = `${this.frontendUrl}/signup?invitation=${invitation.invitationCode}`;

    const emailParams = {
      Source: process.env.SES_FROM_EMAIL || 'noreply@medeez.com',
      Destination: {
        ToAddresses: [invitation.invitedEmail],
      },
      Message: {
        Subject: {
          Data: 'You\'re invited to join Medeez',
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: this.createInvitationEmailHtml(invitation, invitationLink),
            Charset: 'UTF-8',
          },
          Text: {
            Data: `You've been invited to join ${invitation.firstName} ${invitation.lastName}'s practice on Medeez.\n\nClick here to accept the invitation: ${invitationLink}\n\nThis invitation will expire on ${new Date(invitation.expiresAt).toLocaleDateString()}.`,
            Charset: 'UTF-8',
          },
        },
      },
    };

    const command = new SendEmailCommand(emailParams);
    await this.sesClient.send(command);
  }

  private createInvitationEmailHtml(invitation: UserInvitation, invitationLink: string): string {
    const expiryDate = new Date(invitation.expiresAt).toLocaleDateString();

    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>You're invited to join Medeez</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  line-height: 1.6;
                  color: #333333;
                  background-color: #f8fafc;
                  margin: 0;
                  padding: 0;
              }
              .container {
                  max-width: 600px;
                  margin: 0 auto;
                  background-color: #ffffff;
                  border-radius: 8px;
                  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                  overflow: hidden;
              }
              .header {
                  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                  color: white;
                  padding: 30px 20px;
                  text-align: center;
              }
              .content {
                  padding: 40px 30px;
              }
              .cta-button {
                  display: inline-block;
                  padding: 15px 30px;
                  background-color: #2563eb;
                  color: white;
                  text-decoration: none;
                  border-radius: 6px;
                  font-weight: 600;
                  text-align: center;
                  margin: 20px 0;
              }
              .footer {
                  background-color: #f8fafc;
                  padding: 20px 30px;
                  border-top: 1px solid #e2e8f0;
                  text-align: center;
                  font-size: 14px;
                  color: #64748b;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Medeez</h1>
                  <p>Healthcare Practice Management</p>
              </div>
              
              <div class="content">
                  <h2>You're invited to join a practice on Medeez!</h2>
                  
                  <p>Hello ${invitation.firstName},</p>
                  
                  <p>You've been invited to join a healthcare practice on Medeez as a <strong>${invitation.role}</strong>.</p>
                  
                  <p>Medeez helps healthcare practices manage patients, appointments, notes, and billing all in one secure, HIPAA-compliant platform.</p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                      <a href="${invitationLink}" class="cta-button">Accept Invitation</a>
                  </div>
                  
                  <p style="font-size: 14px; color: #64748b;">
                      This invitation will expire on ${expiryDate}. If you didn't expect this invitation, you can safely ignore this email.
                  </p>
              </div>
              
              <div class="footer">
                  <p>&copy; 2024 Medeez. All rights reserved.</p>
              </div>
          </div>
      </body>
      </html>
    `;
  }
}