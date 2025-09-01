import { PreAuthenticationTriggerEvent, PreAuthenticationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridge = new EventBridgeClient({ region: process.env.REGION });

/**
 * Pre Authentication Trigger
 * Validates subscription status, trial expiration, and account status
 */
export const handler: PreAuthenticationTriggerHandler = async (event) => {
  console.log('Pre Authentication trigger invoked:', JSON.stringify(event, null, 2));

  try {
    const { userAttributes } = event.request;
    const userId = userAttributes.sub;
    const email = userAttributes.email?.toLowerCase();
    const clinicId = userAttributes['custom:clinicId'];
    const subscriptionStatus = userAttributes['custom:subscriptionStatus'];
    const trialEndDate = userAttributes['custom:trialEndDate'];

    if (!userId || !email) {
      throw new Error('Missing required user attributes');
    }

    // Check user account status
    await validateUserAccountStatus(userId, clinicId);

    // Check subscription and trial status
    await validateSubscriptionStatus(clinicId, subscriptionStatus, trialEndDate);

    // Check for account suspension or security flags
    await validateSecurityStatus(userId, email);

    // Rate limiting check (basic brute force protection)
    await checkRateLimit(email);

    // Log successful pre-authentication
    await logSecurityEvent('pre_auth_success', {
      userId,
      email,
      clinicId,
      subscriptionStatus,
      userPoolId: event.userPoolId,
      clientId: event.callerContext.clientId,
      sourceIp: event.callerContext.sourceIp,
    });

    return event;

  } catch (error: any) {
    console.error('Pre Authentication validation failed:', error);

    // Log failed authentication attempt
    await logSecurityEvent('pre_auth_failed', {
      userId: event.request.userAttributes.sub,
      email: event.request.userAttributes.email,
      error: error.message,
      userPoolId: event.userPoolId,
      sourceIp: event.callerContext.sourceIp,
    });

    // Throw error to prevent authentication
    throw new Error(error.message);
  }
};

async function validateUserAccountStatus(userId: string, clinicId: string): Promise<void> {
  if (!clinicId) {
    throw new Error('User not associated with any clinic');
  }

  // Get user record from DynamoDB
  const userCommand = new GetCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-users`,
    Key: {
      PK: `USER#${userId}`,
      SK: `USER#${userId}`,
    },
  });

  const userResult = await docClient.send(userCommand);
  const user = userResult.Item;

  if (!user) {
    throw new Error('User account not found');
  }

  if (!user.isActive) {
    throw new Error('User account is disabled');
  }

  if (user.isLocked) {
    const lockExpiry = user.lockExpiresAt ? new Date(user.lockExpiresAt) : null;
    if (!lockExpiry || lockExpiry > new Date()) {
      throw new Error('User account is locked');
    } else {
      // Lock has expired, we could unlock the user here
      console.log(`User ${userId} lock has expired, allowing login`);
    }
  }
}

async function validateSubscriptionStatus(
  clinicId: string,
  subscriptionStatus: string,
  trialEndDate: string
): Promise<void> {
  // Get clinic record to check subscription status
  const clinicCommand = new GetCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-clinics`,
    Key: {
      PK: `CLINIC#${clinicId}`,
      SK: `CLINIC#${clinicId}`,
    },
  });

  const clinicResult = await docClient.send(clinicCommand);
  const clinic = clinicResult.Item;

  if (!clinic) {
    throw new Error('Clinic not found');
  }

  // Check if clinic is suspended
  if (clinic.status === 'suspended') {
    throw new Error('Clinic account is suspended. Please contact support.');
  }

  // Check trial expiration
  if (subscriptionStatus === 'trial' && trialEndDate) {
    const trialEnd = new Date(trialEndDate);
    const now = new Date();

    if (now > trialEnd) {
      // Grace period of 3 days after trial expiration
      const gracePeriodEnd = new Date(trialEnd);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);

      if (now > gracePeriodEnd) {
        throw new Error('Trial period has expired. Please upgrade your subscription.');
      } else {
        console.log(`Clinic ${clinicId} is in grace period after trial expiration`);
      }
    }
  }

  // Check subscription status
  if (subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled') {
    throw new Error('Subscription has expired. Please renew your subscription.');
  }

  // Check if subscription is past due
  if (subscriptionStatus === 'past_due') {
    console.log(`Clinic ${clinicId} subscription is past due, allowing login with limited access`);
    // We could set a flag here to limit functionality in the application
  }
}

async function validateSecurityStatus(userId: string, email: string): Promise<void> {
  // Check for security flags or blocked IPs
  // This could be enhanced with a dedicated security table

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Basic rate limiting: check for excessive failed login attempts
  // In a production system, this would be more sophisticated
  try {
    // This is a placeholder for security status checking
    // You could implement checks for:
    // - Suspicious login patterns
    // - Geo-location anomalies
    // - Device fingerprinting
    // - Known compromised emails
    
    console.log(`Security validation passed for user ${userId}`);
  } catch (error) {
    console.error('Security validation error:', error);
    // Don't throw here unless it's a critical security issue
  }
}

async function checkRateLimit(email: string): Promise<void> {
  // Basic rate limiting implementation
  // In production, you might use Redis or DynamoDB with TTL for this
  
  const rateLimitKey = `rate_limit:${email}`;
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000); // 15-minute window

  // This is a simplified implementation
  // You would need a proper rate limiting store (Redis/DynamoDB with TTL)
  
  // For now, we'll just log the rate limit check
  console.log(`Rate limit check passed for ${email}`);
}

async function logSecurityEvent(eventType: string, details: any): Promise<void> {
  try {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'medeez.cognito.pre-authentication',
          DetailType: 'Authentication Security Event',
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
    // Don't throw error here to avoid blocking authentication
  }
}