import { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

interface TrialEligibilityCheck {
  isEligible: boolean;
  reason?: string;
  existingTrialCount?: number;
}

const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridge = new EventBridgeClient({ region: process.env.REGION });

/**
 * Pre Sign-up Trigger
 * Validates email domains, trial eligibility, and invitation codes
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  console.log('Pre Sign-up trigger invoked:', JSON.stringify(event, null, 2));

  try {
    const { userAttributes, validationData } = event.request;
    const email = userAttributes.email?.toLowerCase();
    const invitationCode = validationData?.invitationCode;

    if (!email) {
      throw new Error('Email is required for registration');
    }

    // Check if this is an invited user
    if (invitationCode) {
      await validateInvitationCode(email, invitationCode);
    } else {
      // Check trial eligibility for new clinic registrations
      const eligibility = await checkTrialEligibility(email);
      if (!eligibility.isEligible) {
        throw new Error(eligibility.reason || 'Not eligible for trial registration');
      }
    }

    // Validate email domain (optional business rule)
    await validateEmailDomain(email);

    // Auto-confirm user (skip email verification for invited users)
    if (invitationCode) {
      event.response.autoConfirmUser = true;
      event.response.autoVerifyEmail = true;
    }

    // Log registration attempt
    await logSecurityEvent('user_registration_attempt', {
      email,
      hasInvitationCode: !!invitationCode,
      userPoolId: event.userPoolId,
      clientId: event.callerContext.clientId,
    });

    return event;

  } catch (error: any) {
    console.error('Pre Sign-up validation failed:', error);

    // Log failed registration attempt
    await logSecurityEvent('user_registration_failed', {
      email: event.request.userAttributes.email,
      error: error.message,
      userPoolId: event.userPoolId,
    });

    throw new Error(error.message);
  }
};

async function validateInvitationCode(email: string, invitationCode: string): Promise<void> {
  const command = new QueryCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-invitations`,
    IndexName: 'InvitationCodeIndex',
    KeyConditionExpression: 'invitationCode = :code',
    ExpressionAttributeValues: {
      ':code': invitationCode,
      ':email': email,
      ':now': new Date().toISOString(),
    },
    FilterExpression: 'invitedEmail = :email AND expiresAt > :now AND #status = :status',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ...arguments,
      ':status': 'PENDING',
    },
  });

  const result = await docClient.send(command);

  if (!result.Items || result.Items.length === 0) {
    throw new Error('Invalid or expired invitation code');
  }

  const invitation = result.Items[0];
  if (invitation.usedAt) {
    throw new Error('Invitation code has already been used');
  }
}

async function checkTrialEligibility(email: string): Promise<TrialEligibilityCheck> {
  const emailDomain = email.split('@')[1];

  // Check for existing trials by email domain
  const command = new QueryCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-clinics`,
    IndexName: 'EmailDomainIndex',
    KeyConditionExpression: 'emailDomain = :domain',
    ExpressionAttributeValues: {
      ':domain': emailDomain,
      ':trial': 'trial',
    },
    FilterExpression: 'subscriptionStatus = :trial',
  });

  const result = await docClient.send(command);
  const existingTrials = result.Items || [];

  // Business rule: Maximum 1 trial per email domain
  if (existingTrials.length >= 1) {
    return {
      isEligible: false,
      reason: 'Trial limit exceeded for this email domain',
      existingTrialCount: existingTrials.length,
    };
  }

  // Check for suspicious patterns (multiple attempts from same IP, etc.)
  // This would require additional tracking in a separate table

  return {
    isEligible: true,
  };
}

async function validateEmailDomain(email: string): Promise<void> {
  const emailDomain = email.split('@')[1];

  // Block disposable email domains
  const disposableDomains = [
    '10minutemail.com',
    'tempmail.org',
    'guerrillamail.com',
    'mailinator.com',
    // Add more as needed
  ];

  if (disposableDomains.includes(emailDomain)) {
    throw new Error('Disposable email addresses are not allowed');
  }

  // Optional: Validate against known professional domains
  // This could be enhanced with a more comprehensive domain validation service
}

async function logSecurityEvent(eventType: string, details: any): Promise<void> {
  try {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'medeez.cognito.pre-signup',
          DetailType: 'User Registration Event',
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
    console.error('Failed to log security event:', error);
    // Don't throw error here to avoid blocking the registration process
  }
}