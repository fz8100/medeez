import { VerifyAuthChallengeResponseTriggerEvent, VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda';

/**
 * Verify Auth Challenge Response Trigger
 * Verifies the user's response to custom authentication challenges
 */
export const handler: VerifyAuthChallengeResponseTriggerHandler = async (event) => {
  console.log('Verify Auth Challenge Response trigger invoked:', JSON.stringify(event, null, 2));

  try {
    const { challengeAnswer, privateChallengeParameters } = event.request;
    const challengeMetadata = event.request.challengeMetadata;

    if (challengeMetadata === 'EMAIL_VERIFICATION_CHALLENGE') {
      // Verify the email verification code
      const correctAnswer = privateChallengeParameters?.verificationCode;
      const userAnswer = challengeAnswer?.trim();

      if (!correctAnswer || !userAnswer) {
        event.response.answerCorrect = false;
        console.log('Missing verification code or user answer');
      } else if (userAnswer === correctAnswer) {
        event.response.answerCorrect = true;
        console.log('Verification code verified successfully');
      } else {
        event.response.answerCorrect = false;
        console.log(`Verification code mismatch: expected ${correctAnswer}, got ${userAnswer}`);
      }
    } else {
      // Unknown challenge type
      event.response.answerCorrect = false;
      console.log(`Unknown challenge metadata: ${challengeMetadata}`);
    }

    return event;

  } catch (error: any) {
    console.error('Verify Auth Challenge Response failed:', error);
    event.response.answerCorrect = false;
    return event;
  }
};