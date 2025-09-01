import { DefineAuthChallengeTriggerEvent, DefineAuthChallengeTriggerHandler } from 'aws-lambda';

/**
 * Define Auth Challenge Trigger
 * Defines the authentication challenge flow for custom MFA
 */
export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  console.log('Define Auth Challenge trigger invoked:', JSON.stringify(event, null, 2));

  try {
    const { session } = event.request;
    const userAttributes = event.request.userAttributes;
    const challengeName = event.request.challengeName;

    // Check if MFA is required for this user
    const mfaRequired = shouldRequireMFA(userAttributes);

    // If this is the first challenge and MFA is required
    if (session.length === 0 && mfaRequired) {
      // Start with custom challenge (email verification)
      event.response.challengeName = 'CUSTOM_CHALLENGE';
      event.response.issueTokens = false;
    }
    // If the user has completed the password challenge and MFA is required
    else if (
      session.length === 1 &&
      session[0].challengeName === 'SRP_A' &&
      mfaRequired
    ) {
      event.response.challengeName = 'CUSTOM_CHALLENGE';
      event.response.issueTokens = false;
    }
    // If the user has completed the custom challenge successfully
    else if (
      session.length > 0 &&
      session[session.length - 1].challengeName === 'CUSTOM_CHALLENGE' &&
      session[session.length - 1].challengeResult === true
    ) {
      event.response.issueTokens = true;
    }
    // If the user failed too many attempts
    else if (session.length >= 3) {
      // Too many failed attempts - fail authentication
      event.response.issueTokens = false;
      event.response.failAuthentication = true;
    }
    // Continue with the current challenge if still in progress
    else {
      event.response.challengeName = challengeName;
      event.response.issueTokens = false;
    }

    console.log(`Authentication flow decision: ${JSON.stringify({
      sessionLength: session.length,
      challengeName: event.response.challengeName,
      issueTokens: event.response.issueTokens,
      failAuthentication: event.response.failAuthentication,
      mfaRequired,
    })}`);

    return event;

  } catch (error: any) {
    console.error('Define Auth Challenge failed:', error);
    throw error;
  }
};

function shouldRequireMFA(userAttributes: any): boolean {
  // MFA requirements based on user role and settings
  const role = userAttributes['custom:role'];
  const clinicId = userAttributes['custom:clinicId'];
  
  // Always require MFA for system admins
  if (role === 'SystemAdmin') {
    return true;
  }

  // Always require MFA for admin users
  if (role === 'Admin') {
    return true;
  }

  // Check if user has opted into MFA (this would be stored in user attributes)
  const mfaEnabled = userAttributes['custom:mfaEnabled'] === 'true';
  if (mfaEnabled) {
    return true;
  }

  // Check if clinic has mandatory MFA policy (this would be checked against clinic settings)
  // For now, we'll implement a basic policy
  
  // Require MFA for doctors by default (can be made configurable)
  if (role === 'Doctor') {
    return true;
  }

  // Default: no MFA required for staff (but can be enabled)
  return false;
}

function hasCompletedChallenge(session: any[], challengeName: string): boolean {
  return session.some(
    (challenge) =>
      challenge.challengeName === challengeName &&
      challenge.challengeResult === true
  );
}

function getLastChallengeResult(session: any[]): boolean | null {
  if (session.length === 0) {
    return null;
  }
  
  return session[session.length - 1].challengeResult;
}

function countFailedAttempts(session: any[], challengeName: string): number {
  return session.filter(
    (challenge) =>
      challenge.challengeName === challengeName &&
      challenge.challengeResult === false
  ).length;
}