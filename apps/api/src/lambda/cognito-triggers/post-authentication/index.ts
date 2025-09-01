import { PostAuthenticationTriggerEvent, PostAuthenticationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridge = new EventBridgeClient({ region: process.env.REGION });

/**
 * Post Authentication Trigger
 * Logs successful logins, updates last login time, tracks security events
 */
export const handler: PostAuthenticationTriggerHandler = async (event) => {
  console.log('Post Authentication trigger invoked:', JSON.stringify(event, null, 2));

  try {
    const { userAttributes } = event.request;
    const userId = userAttributes.sub;
    const email = userAttributes.email?.toLowerCase();
    const clinicId = userAttributes['custom:clinicId'];
    const role = userAttributes['custom:role'];

    if (!userId || !email || !clinicId) {
      console.error('Missing required user attributes');
      return event;
    }

    const loginTimestamp = new Date().toISOString();
    const sourceIp = event.callerContext.sourceIp;
    const clientId = event.callerContext.clientId;
    const userAgent = event.request.userAgent || 'Unknown';

    // Update user's last login time and login count
    await updateUserLastLogin(userId, loginTimestamp, sourceIp);

    // Create login audit log
    await createLoginAuditLog(userId, email, clinicId, role, sourceIp, userAgent, clientId);

    // Update clinic's last activity
    await updateClinicLastActivity(clinicId, loginTimestamp);

    // Check for security anomalies
    await checkSecurityAnomalies(userId, email, sourceIp, userAgent);

    // Send analytics events
    await sendAnalyticsEvents(userId, email, clinicId, role, sourceIp);

    // Log successful authentication
    await logSecurityEvent('user_login_success', {
      userId,
      email,
      clinicId,
      role,
      sourceIp,
      userAgent,
      userPoolId: event.userPoolId,
      clientId,
    });

    console.log(`User ${userId} successfully logged in from ${sourceIp}`);

    return event;

  } catch (error: any) {
    console.error('Post Authentication processing failed:', error);

    // Log the error but don't fail the authentication
    await logSecurityEvent('post_auth_processing_error', {
      userId: event.request.userAttributes.sub,
      email: event.request.userAttributes.email,
      error: error.message,
      userPoolId: event.userPoolId,
      sourceIp: event.callerContext.sourceIp,
    });

    return event;
  }
};

async function updateUserLastLogin(userId: string, loginTimestamp: string, sourceIp: string): Promise<void> {
  const command = new UpdateCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-users`,
    Key: {
      PK: `USER#${userId}`,
      SK: `USER#${userId}`,
    },
    UpdateExpression: 'SET lastLoginAt = :timestamp, lastLoginIp = :ip, loginCount = if_not_exists(loginCount, :zero) + :one, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':timestamp': loginTimestamp,
      ':ip': sourceIp,
      ':zero': 0,
      ':one': 1,
    },
  });

  await docClient.send(command);
}

async function createLoginAuditLog(
  userId: string,
  email: string,
  clinicId: string,
  role: string,
  sourceIp: string,
  userAgent: string,
  clientId: string
): Promise<void> {
  const auditId = `login_${userId}_${Date.now()}`;
  const timestamp = new Date().toISOString();

  const auditLog = {
    PK: `AUDIT#${clinicId}`,
    SK: `LOGIN#${timestamp}#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `LOGIN#${timestamp}`,
    auditId,
    eventType: 'user_login',
    userId,
    email,
    clinicId,
    role,
    sourceIp,
    userAgent,
    clientId,
    timestamp,
    success: true,
    environment: process.env.ENVIRONMENT,
    // TTL: Remove audit logs older than 2 years (HIPAA requirement)
    ttl: Math.floor(Date.now() / 1000) + (2 * 365 * 24 * 60 * 60),
  };

  const command = new PutCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-audit-logs`,
    Item: auditLog,
  });

  await docClient.send(command);
}

async function updateClinicLastActivity(clinicId: string, timestamp: string): Promise<void> {
  const command = new UpdateCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-clinics`,
    Key: {
      PK: `CLINIC#${clinicId}`,
      SK: `CLINIC#${clinicId}`,
    },
    UpdateExpression: 'SET lastActivityAt = :timestamp, updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':timestamp': timestamp,
    },
  });

  await docClient.send(command);
}

async function checkSecurityAnomalies(
  userId: string,
  email: string,
  sourceIp: string,
  userAgent: string
): Promise<void> {
  try {
    // Check for login from new IP address
    await checkNewIpAddress(userId, sourceIp);

    // Check for unusual user agent
    await checkUserAgent(userId, userAgent);

    // Check for concurrent sessions (if tracking active sessions)
    await checkConcurrentSessions(userId);

    // Check for geo-location anomalies (would require IP geolocation service)
    // await checkGeolocationAnomalies(userId, sourceIp);

  } catch (error) {
    console.error('Security anomaly check failed:', error);
    // Don't throw error - this is informational only
  }
}

async function checkNewIpAddress(userId: string, sourceIp: string): Promise<void> {
  // This is a simplified implementation
  // In production, you'd maintain a list of known IP addresses per user
  
  const command = new UpdateCommand({
    TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-user-security`,
    Key: {
      PK: `USER#${userId}`,
      SK: 'SECURITY_PROFILE',
    },
    UpdateExpression: 'SET knownIps = list_append(if_not_exists(knownIps, :empty_list), :ip_list), updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':empty_list': [],
      ':ip_list': [sourceIp],
      ':timestamp': new Date().toISOString(),
    },
  });

  try {
    await docClient.send(command);
  } catch (error) {
    // If item doesn't exist, create it
    if (error.name === 'ConditionalCheckFailedException') {
      const createCommand = new PutCommand({
        TableName: `${process.env.DYNAMODB_TABLE_PREFIX}-user-security`,
        Item: {
          PK: `USER#${userId}`,
          SK: 'SECURITY_PROFILE',
          userId,
          knownIps: [sourceIp],
          knownUserAgents: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      await docClient.send(createCommand);
    }
  }
}

async function checkUserAgent(userId: string, userAgent: string): Promise<void> {
  // Log unusual user agents for security monitoring
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /wget/i,
    /curl/i,
  ];

  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));

  if (isSuspicious) {
    await logSecurityEvent('suspicious_user_agent', {
      userId,
      userAgent,
      timestamp: new Date().toISOString(),
    });
  }
}

async function checkConcurrentSessions(userId: string): Promise<void> {
  // This would require session tracking
  // For now, just log that we're checking
  console.log(`Checking concurrent sessions for user ${userId}`);
}

async function sendAnalyticsEvents(
  userId: string,
  email: string,
  clinicId: string,
  role: string,
  sourceIp: string
): Promise<void> {
  const events = [
    {
      Source: 'medeez.analytics.login',
      DetailType: 'User Login',
      Detail: JSON.stringify({
        userId,
        email,
        clinicId,
        role,
        sourceIp,
        timestamp: new Date().toISOString(),
        environment: process.env.ENVIRONMENT,
      }),
      EventBusName: `medeez-${process.env.ENVIRONMENT}-event-bus`,
    },
    {
      Source: 'medeez.metrics.usage',
      DetailType: 'Clinic Activity',
      Detail: JSON.stringify({
        clinicId,
        activityType: 'user_login',
        userId,
        timestamp: new Date().toISOString(),
        environment: process.env.ENVIRONMENT,
      }),
      EventBusName: `medeez-${process.env.ENVIRONMENT}-event-bus`,
    },
  ];

  try {
    const command = new PutEventsCommand({
      Entries: events,
    });

    await eventBridge.send(command);
  } catch (error) {
    console.error('Failed to send analytics events:', error);
  }
}

async function logSecurityEvent(eventType: string, details: any): Promise<void> {
  try {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'medeez.cognito.post-authentication',
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
  }
}