import { PostConfirmationTriggerEvent, PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { nanoid } from 'nanoid';

const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const eventBridge = new EventBridgeClient({ region: process.env.REGION });

/**
 * Post Confirmation Trigger
 * Creates clinic and user records, assigns roles and permissions
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('Post Confirmation trigger invoked:', JSON.stringify(event, null, 2));

  try {
    const { userAttributes } = event.request;
    const userId = event.request.userAttributes.sub;
    const email = userAttributes.email?.toLowerCase();
    const givenName = userAttributes.given_name;
    const familyName = userAttributes.family_name;

    if (!email || !userId) {
      throw new Error('Required user attributes missing');
    }

    // Check if user was invited
    const invitation = await getInvitationByEmail(email);
    let clinicId: string;
    let userRole: string;
    let permissions: string[];

    if (invitation) {
      // User was invited to existing clinic
      clinicId = invitation.clinicId;
      userRole = invitation.role;
      permissions = getRolePermissions(userRole);

      // Mark invitation as used
      await markInvitationAsUsed(invitation.invitationCode, userId);
    } else {
      // New clinic registration (trial)
      clinicId = `clinic_${nanoid()}`;
      userRole = 'Admin';
      permissions = getRolePermissions(userRole);

      // Create new clinic record
      await createClinic(clinicId, email, givenName, familyName);
    }

    // Create user record in DynamoDB
    await createUserRecord(userId, email, clinicId, userRole, permissions, givenName, familyName, invitation);

    // Add user to Cognito group
    await addUserToGroup(event.userPoolId, userId, userRole);

    // Update Cognito user attributes
    await updateCognitoUserAttributes(event.userPoolId, userId, {
      'custom:clinicId': clinicId,
      'custom:role': userRole,
      'custom:permissions': JSON.stringify(permissions),
      'custom:subscriptionStatus': invitation ? 'active' : 'trial',
      'custom:trialEndDate': invitation ? '' : getTrialEndDate(),
      'custom:onboardingComplete': 'false',
      'custom:invitedBy': invitation ? invitation.invitedBy : '',
    });

    // Log user creation event
    await logUserEvent('user_created', {
      userId,
      email,
      clinicId,
      role: userRole,
      isInvited: !!invitation,
      userPoolId: event.userPoolId,
    });

    // Send welcome events
    await sendWelcomeEvents(userId, email, clinicId, userRole, !!invitation);

    console.log(`User ${userId} successfully processed and added to clinic ${clinicId} with role ${userRole}`);

    return event;

  } catch (error: any) {
    console.error('Post Confirmation processing failed:', error);

    // Log failure event
    await logUserEvent('user_creation_failed', {
      userId: event.request.userAttributes.sub,
      email: event.request.userAttributes.email,
      error: error.message,
      userPoolId: event.userPoolId,
    });

    // Note: We don't throw here to avoid preventing user login
    // Instead, we'll handle incomplete setup in the API
    console.warn('User creation partially failed, user can still login but may need manual intervention');

    return event;
  }
};

async function getInvitationByEmail(email: string) {
  const command = new QueryCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-invitations`,
    IndexName: 'EmailIndex',
    KeyConditionExpression: 'invitedEmail = :email',
    ExpressionAttributeValues: {
      ':email': email,
      ':status': 'PENDING',
      ':now': new Date().toISOString(),
    },
    FilterExpression: '#status = :status AND expiresAt > :now',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
  });

  const result = await docClient.send(command);
  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

async function createClinic(clinicId: string, adminEmail: string, adminFirstName: string, adminLastName: string) {
  const clinic = {
    PK: `CLINIC#${clinicId}`,
    SK: `CLINIC#${clinicId}`,
    clinicId,
    name: `${adminFirstName} ${adminLastName}'s Practice`,
    adminEmail,
    adminName: `${adminFirstName} ${adminLastName}`,
    emailDomain: adminEmail.split('@')[1],
    subscriptionStatus: 'trial',
    subscriptionTier: 'starter',
    trialStartDate: new Date().toISOString(),
    trialEndDate: getTrialEndDate(),
    maxUsers: 5,
    maxPatients: 100,
    features: ['patient-management', 'appointments', 'notes', 'invoicing'],
    settings: {
      timezone: 'UTC',
      dateFormat: 'MM/dd/yyyy',
      currency: 'USD',
      enableSMSNotifications: false,
      enableEmailNotifications: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    GSI1PK: `DOMAIN#${adminEmail.split('@')[1]}`,
    GSI1SK: `CLINIC#${clinicId}`,
  };

  const command = new PutCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-clinics`,
    Item: clinic,
    ConditionExpression: 'attribute_not_exists(PK)',
  });

  await docClient.send(command);
}

async function createUserRecord(
  userId: string,
  email: string,
  clinicId: string,
  role: string,
  permissions: string[],
  givenName: string,
  familyName: string,
  invitation: any
) {
  const user = {
    PK: `USER#${userId}`,
    SK: `USER#${userId}`,
    GSI1PK: `CLINIC#${clinicId}`,
    GSI1SK: `USER#${userId}`,
    userId,
    email,
    clinicId,
    role,
    permissions,
    firstName: givenName,
    lastName: familyName,
    fullName: `${givenName} ${familyName}`,
    isActive: true,
    isEmailVerified: true,
    onboardingComplete: false,
    lastLoginAt: null,
    invitedBy: invitation ? invitation.invitedBy : null,
    invitedAt: invitation ? invitation.createdAt : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      theme: 'light',
      notifications: {
        email: true,
        sms: false,
        push: true,
      },
      timezone: 'UTC',
    },
  };

  const command = new PutCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-users`,
    Item: user,
  });

  await docClient.send(command);
}

async function addUserToGroup(userPoolId: string, userId: string, role: string) {
  const command = new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: userId,
    GroupName: role,
  });

  await cognitoClient.send(command);
}

async function updateCognitoUserAttributes(userPoolId: string, userId: string, attributes: Record<string, string>) {
  const { AdminUpdateUserAttributesCommand } = await import('@aws-sdk/client-cognito-identity-provider');

  const userAttributes = Object.entries(attributes).map(([name, value]) => ({
    Name: name,
    Value: value,
  }));

  const command = new AdminUpdateUserAttributesCommand({
    UserPoolId: userPoolId,
    Username: userId,
    UserAttributes: userAttributes,
  });

  await cognitoClient.send(command);
}

async function markInvitationAsUsed(invitationCode: string, userId: string) {
  const command = new UpdateCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-invitations`,
    Key: { invitationCode },
    UpdateExpression: 'SET #status = :status, usedAt = :usedAt, usedBy = :userId',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': 'USED',
      ':usedAt': new Date().toISOString(),
      ':userId': userId,
    },
  });

  await docClient.send(command);
}

function getRolePermissions(role: string): string[] {
  const rolePermissions: Record<string, string[]> = {
    SystemAdmin: ['*'],
    Admin: [
      'clinic:read',
      'clinic:write',
      'users:read',
      'users:write',
      'patients:read',
      'patients:write',
      'appointments:read',
      'appointments:write',
      'notes:read',
      'notes:write',
      'invoices:read',
      'invoices:write',
      'analytics:read',
      'analytics:export',
      'settings:read',
      'settings:write',
    ],
    Doctor: [
      'patients:read',
      'patients:write',
      'appointments:read',
      'appointments:write',
      'notes:read',
      'notes:write',
      'invoices:read',
      'analytics:read',
      'settings:read',
    ],
    Staff: [
      'patients:read',
      'appointments:read',
      'appointments:write',
      'invoices:read',
      'settings:read',
    ],
  };

  return rolePermissions[role] || rolePermissions.Staff;
}

function getTrialEndDate(): string {
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 7); // 7-day trial
  return trialEndDate.toISOString();
}

async function logUserEvent(eventType: string, details: any): Promise<void> {
  try {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'medeez.cognito.post-confirmation',
          DetailType: 'User Lifecycle Event',
          Detail: JSON.stringify({
            eventType,
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            ...details,
          }),
          EventBusName: `medeez-${process.env.ENVIRONMENT}-event-bus`,
        },
      ],
    });

    await eventBridge.send(command);
  } catch (error) {
    console.error('Failed to log user event:', error);
  }
}

async function sendWelcomeEvents(userId: string, email: string, clinicId: string, role: string, isInvited: boolean) {
  const events = [];

  // Welcome email event
  events.push({
    Source: 'medeez.user.onboarding',
    DetailType: isInvited ? 'User Invitation Accepted' : 'New User Welcome',
    Detail: JSON.stringify({
      userId,
      email,
      clinicId,
      role,
      isInvited,
      timestamp: new Date().toISOString(),
      environment: process.env.ENVIRONMENT,
    }),
    EventBusName: `medeez-${process.env.ENVIRONMENT}-event-bus`,
  });

  // Analytics tracking event
  events.push({
    Source: 'medeez.analytics.user',
    DetailType: 'User Registration Completed',
    Detail: JSON.stringify({
      userId,
      clinicId,
      role,
      registrationType: isInvited ? 'invitation' : 'trial_signup',
      timestamp: new Date().toISOString(),
      environment: process.env.ENVIRONMENT,
    }),
    EventBusName: `medeez-${process.env.ENVIRONMENT}-event-bus`,
  });

  try {
    const command = new PutEventsCommand({
      Entries: events,
    });

    await eventBridge.send(command);
  } catch (error) {
    console.error('Failed to send welcome events:', error);
  }
}