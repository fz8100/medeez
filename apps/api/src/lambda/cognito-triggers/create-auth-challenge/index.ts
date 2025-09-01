import { CreateAuthChallengeTriggerEvent, CreateAuthChallengeTriggerHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import * as crypto from 'crypto';

const sesClient = new SESClient({ region: process.env.REGION });

/**
 * Create Auth Challenge Trigger
 * Creates custom authentication challenges for MFA
 */
export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  console.log('Create Auth Challenge trigger invoked:', JSON.stringify(event, null, 2));

  try {
    const { challengeName } = event.request;
    const userAttributes = event.request.userAttributes;
    const email = userAttributes.email;

    if (challengeName === 'CUSTOM_CHALLENGE') {
      // Generate a 6-digit verification code
      const verificationCode = generateVerificationCode();
      
      // Store the code in the challenge metadata (encrypted)
      event.response.publicChallengeParameters = {
        email: email,
        challengeType: 'EMAIL_VERIFICATION',
      };

      // Store the encrypted code for verification
      event.response.privateChallengeParameters = {
        verificationCode: verificationCode,
      };

      event.response.challengeMetadata = 'EMAIL_VERIFICATION_CHALLENGE';

      // Send verification code via email
      await sendVerificationEmail(email, verificationCode);

      console.log(`Verification code sent to ${email}`);
    }

    return event;

  } catch (error: any) {
    console.error('Create Auth Challenge failed:', error);
    throw error;
  }
};

function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendVerificationEmail(email: string, verificationCode: string): Promise<void> {
  const emailParams = {
    Source: process.env.SES_FROM_EMAIL || 'noreply@medeez.com',
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Subject: {
        Data: 'Medeez - Verification Code',
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: createVerificationEmailHtml(verificationCode),
          Charset: 'UTF-8',
        },
        Text: {
          Data: `Your Medeez verification code is: ${verificationCode}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
          Charset: 'UTF-8',
        },
      },
    },
  };

  const command = new SendEmailCommand(emailParams);
  await sesClient.send(command);
}

function createVerificationEmailHtml(verificationCode: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Medeez Verification Code</title>
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
            .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 700;
            }
            .header p {
                margin: 8px 0 0 0;
                opacity: 0.9;
                font-size: 16px;
            }
            .content {
                padding: 40px 30px;
            }
            .verification-code {
                background-color: #f1f5f9;
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                padding: 25px;
                text-align: center;
                margin: 30px 0;
            }
            .code {
                font-family: 'Courier New', Consolas, monospace;
                font-size: 32px;
                font-weight: bold;
                color: #2563eb;
                letter-spacing: 4px;
                margin: 10px 0;
            }
            .footer {
                background-color: #f8fafc;
                padding: 20px 30px;
                border-top: 1px solid #e2e8f0;
                text-align: center;
                font-size: 14px;
                color: #64748b;
            }
            .security-notice {
                background-color: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }
            .security-notice p {
                margin: 0;
                color: #92400e;
                font-size: 14px;
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
                <h2 style="color: #1e293b; margin-bottom: 20px;">Security Verification Required</h2>
                
                <p>We received a request to sign in to your Medeez account. To complete the sign-in process, please use the verification code below:</p>
                
                <div class="verification-code">
                    <p style="margin: 0 0 10px 0; font-weight: 600; color: #475569;">Your verification code is:</p>
                    <div class="code">${verificationCode}</div>
                    <p style="margin: 10px 0 0 0; font-size: 14px; color: #64748b;">Enter this code in your browser to continue</p>
                </div>
                
                <div class="security-notice">
                    <p><strong>Security Notice:</strong> This code will expire in 10 minutes. If you didn't request this verification, please ignore this email and ensure your account is secure.</p>
                </div>
                
                <p style="margin-top: 30px; font-size: 14px; color: #64748b;">
                    For your security, never share this code with anyone. Medeez support will never ask for your verification codes.
                </p>
            </div>
            
            <div class="footer">
                <p>&copy; 2024 Medeez. All rights reserved.</p>
                <p>This email was sent for account security verification.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}