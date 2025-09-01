import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { EnvironmentConfig } from './config';

interface SesStackProps extends cdk.StackProps {
  environment: string;
  config: EnvironmentConfig;
  hostedZone?: route53.IHostedZone;
}

export class SesStack extends cdk.Stack {
  public readonly configurationSet: ses.ConfigurationSet;
  public readonly emailIdentity: ses.EmailIdentity;
  public readonly sesRole: iam.Role;

  constructor(scope: Construct, id: string, props: SesStackProps) {
    super(scope, id, props);

    const { environment, config, hostedZone } = props;

    // SES Configuration Set for tracking and deliverability
    this.configurationSet = new ses.ConfigurationSet(this, 'MedeezConfigurationSet', {
      configurationSetName: `medeez-${environment}-config-set`,
      deliveryOptions: {
        tlsPolicy: ses.TlsPolicy.REQUIRE,
      },
      reputationMetrics: true,
      sendingEnabled: true,
      suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS,
    });

    // Event destinations for bounce and complaint tracking
    this.configurationSet.addEventDestination('BounceEventDestination', {
      destination: ses.EventDestination.cloudWatchDimensions({
        dimensions: {
          'EmailAddress': ses.CloudWatchDimensionSource.messageTag('emailAddress'),
          'MessageTag': ses.CloudWatchDimensionSource.messageTag('messageTag'),
        },
        dimensionsName: `medeez-${environment}-bounce-tracking`,
      }),
      events: [ses.EmailSendingEvent.BOUNCE],
    });

    this.configurationSet.addEventDestination('ComplaintEventDestination', {
      destination: ses.EventDestination.cloudWatchDimensions({
        dimensions: {
          'EmailAddress': ses.CloudWatchDimensionSource.messageTag('emailAddress'),
          'MessageTag': ses.CloudWatchDimensionSource.messageTag('messageTag'),
        },
        dimensionsName: `medeez-${environment}-complaint-tracking`,
      }),
      events: [ses.EmailSendingEvent.COMPLAINT],
    });

    this.configurationSet.addEventDestination('DeliveryEventDestination', {
      destination: ses.EventDestination.cloudWatchDimensions({
        dimensions: {
          'EmailAddress': ses.CloudWatchDimensionSource.messageTag('emailAddress'),
          'MessageTag': ses.CloudWatchDimensionSource.messageTag('messageTag'),
        },
        dimensionsName: `medeez-${environment}-delivery-tracking`,
      }),
      events: [ses.EmailSendingEvent.DELIVERY, ses.EmailSendingEvent.SEND],
    });

    // Email Identity for domain verification
    const domainName = config.domainName || `${environment}.medeez.com`;
    
    this.emailIdentity = new ses.EmailIdentity(this, 'MedeezEmailIdentity', {
      identity: ses.Identity.domain(domainName),
      configurationSet: this.configurationSet,
      feedbackForwarding: false, // We handle bounces/complaints through CloudWatch
      mailFromDomain: `mail.${domainName}`,
      dkimSigning: true,
    });

    // Add DNS records to Route53 if hosted zone is provided
    if (hostedZone && config.domainName) {
      // DKIM records will be automatically created by CDK
      this.emailIdentity.dkimRecords.forEach((record, index) => {
        new route53.CnameRecord(this, `DkimRecord${index}`, {
          zone: hostedZone,
          recordName: record.name,
          domainName: record.value,
          ttl: cdk.Duration.minutes(5),
        });
      });

      // MX record for mail delivery
      new route53.MxRecord(this, 'MailFromMxRecord', {
        zone: hostedZone,
        recordName: `mail.${config.domainName}`,
        values: [
          {
            hostName: `feedback-smtp.${this.region}.amazonses.com`,
            priority: 10,
          },
        ],
        ttl: cdk.Duration.minutes(5),
      });

      // SPF record
      new route53.TxtRecord(this, 'SpfRecord', {
        zone: hostedZone,
        recordName: `mail.${config.domainName}`,
        values: ['v=spf1 include:amazonses.com ~all'],
        ttl: cdk.Duration.minutes(5),
      });

      // DMARC record
      new route53.TxtRecord(this, 'DmarcRecord', {
        zone: hostedZone,
        recordName: `_dmarc.${config.domainName}`,
        values: [
          `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@${config.domainName}; ruf=mailto:dmarc-failures@${config.domainName}; fo=1; adkim=s; aspf=s`,
        ],
        ttl: cdk.Duration.minutes(5),
      });
    }

    // IAM role for SES access
    this.sesRole = new iam.Role(this, 'SesRole', {
      roleName: `medeez-${environment}-ses-role`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ServicePrincipal('apigateway.amazonaws.com')
      ),
      description: 'IAM role for SES email sending',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        SesPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'ses:SendEmail',
                'ses:SendRawEmail',
                'ses:SendTemplatedEmail',
                'ses:SendBulkTemplatedEmail',
                'ses:GetSendQuota',
                'ses:GetSendStatistics',
                'ses:GetIdentityDkimAttributes',
                'ses:GetIdentityVerificationAttributes',
                'ses:GetIdentityNotificationAttributes',
                'ses:ListIdentities',
                'ses:ListVerifiedEmailAddresses',
                'ses:VerifyEmailIdentity',
                'ses:GetTemplate',
                'ses:ListTemplates',
              ],
              resources: [
                `arn:aws:ses:${this.region}:${this.account}:identity/${domainName}`,
                `arn:aws:ses:${this.region}:${this.account}:template/*`,
                `arn:aws:ses:${this.region}:${this.account}:configuration-set/${this.configurationSet.configurationSetName}`,
              ],
            }),
            // CloudWatch permissions for bounce/complaint handling
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cloudwatch:PutMetricData',
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Create email templates
    this.createEmailTemplates(environment);

    // Store SES configuration in Parameter Store
    new ssm.StringParameter(this, 'SesConfigurationSet', {
      parameterName: `/medeez/${environment}/ses/configuration-set`,
      stringValue: this.configurationSet.configurationSetName,
      description: 'SES Configuration Set Name',
    });

    new ssm.StringParameter(this, 'SesFromEmail', {
      parameterName: `/medeez/${environment}/ses/from-email`,
      stringValue: `noreply@${domainName}`,
      description: 'SES From Email Address',
    });

    new ssm.StringParameter(this, 'SesReplyToEmail', {
      parameterName: `/medeez/${environment}/ses/reply-to-email`,
      stringValue: `support@${domainName}`,
      description: 'SES Reply-To Email Address',
    });

    new ssm.StringParameter(this, 'SesDomainIdentity', {
      parameterName: `/medeez/${environment}/ses/domain-identity`,
      stringValue: domainName,
      description: 'SES Domain Identity',
    });

    // Outputs
    new cdk.CfnOutput(this, 'SesConfigurationSetName', {
      value: this.configurationSet.configurationSetName,
      description: 'SES Configuration Set Name',
      exportName: `MedeezSesConfigurationSet-${environment}`,
    });

    new cdk.CfnOutput(this, 'SesFromEmail', {
      value: `noreply@${domainName}`,
      description: 'SES From Email Address',
      exportName: `MedeezSesFromEmail-${environment}`,
    });

    new cdk.CfnOutput(this, 'SesDomainIdentity', {
      value: domainName,
      description: 'SES Domain Identity',
      exportName: `MedeezSesDomainIdentity-${environment}`,
    });
  }

  private createEmailTemplates(environment: string) {
    // Welcome Email Template
    const welcomeTemplate = new ses.CfnTemplate(this, 'WelcomeEmailTemplate', {
      template: {
        templateName: `medeez-${environment}-welcome`,
        subjectPart: 'Welcome to Medeez - Your Healthcare Practice Management Solution',
        htmlPart: this.getWelcomeEmailHtml(),
        textPart: this.getWelcomeEmailText(),
      },
    });

    // User Invitation Template
    const invitationTemplate = new ses.CfnTemplate(this, 'InvitationEmailTemplate', {
      template: {
        templateName: `medeez-${environment}-invitation`,
        subjectPart: 'You\'ve been invited to join {{clinicName}} on Medeez',
        htmlPart: this.getInvitationEmailHtml(),
        textPart: this.getInvitationEmailText(),
      },
    });

    // Password Reset Template
    const passwordResetTemplate = new ses.CfnTemplate(this, 'PasswordResetEmailTemplate', {
      template: {
        templateName: `medeez-${environment}-password-reset`,
        subjectPart: 'Reset Your Medeez Password',
        htmlPart: this.getPasswordResetEmailHtml(),
        textPart: this.getPasswordResetEmailText(),
      },
    });

    // Appointment Reminder Template
    const appointmentReminderTemplate = new ses.CfnTemplate(this, 'AppointmentReminderEmailTemplate', {
      template: {
        templateName: `medeez-${environment}-appointment-reminder`,
        subjectPart: 'Appointment Reminder - {{appointmentDate}} at {{appointmentTime}}',
        htmlPart: this.getAppointmentReminderEmailHtml(),
        textPart: this.getAppointmentReminderEmailText(),
      },
    });

    // Magic Link Template
    const magicLinkTemplate = new ses.CfnTemplate(this, 'MagicLinkEmailTemplate', {
      template: {
        templateName: `medeez-${environment}-magic-link`,
        subjectPart: 'Access Your Patient Portal - {{clinicName}}',
        htmlPart: this.getMagicLinkEmailHtml(),
        textPart: this.getMagicLinkEmailText(),
      },
    });

    // Store template names in Parameter Store
    new ssm.StringParameter(this, 'WelcomeTemplateParameter', {
      parameterName: `/medeez/${environment}/ses/welcome-template`,
      stringValue: welcomeTemplate.template!.templateName!,
      description: 'SES Welcome Email Template Name',
    });

    new ssm.StringParameter(this, 'InvitationTemplateParameter', {
      parameterName: `/medeez/${environment}/ses/invitation-template`,
      stringValue: invitationTemplate.template!.templateName!,
      description: 'SES Invitation Email Template Name',
    });

    new ssm.StringParameter(this, 'PasswordResetTemplateParameter', {
      parameterName: `/medeez/${environment}/ses/password-reset-template`,
      stringValue: passwordResetTemplate.template!.templateName!,
      description: 'SES Password Reset Email Template Name',
    });

    new ssm.StringParameter(this, 'AppointmentReminderTemplateParameter', {
      parameterName: `/medeez/${environment}/ses/reminder-template`,
      stringValue: appointmentReminderTemplate.template!.templateName!,
      description: 'SES Appointment Reminder Email Template Name',
    });

    new ssm.StringParameter(this, 'MagicLinkTemplateParameter', {
      parameterName: `/medeez/${environment}/ses/magic-link-template`,
      stringValue: magicLinkTemplate.template!.templateName!,
      description: 'SES Magic Link Email Template Name',
    });
  }

  private getWelcomeEmailHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Medeez</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
        .header p { color: #e0e7ff; margin: 10px 0 0 0; font-size: 16px; }
        .content { padding: 40px 30px; }
        .content h2 { color: #1e293b; font-size: 24px; margin-bottom: 20px; }
        .content p { color: #475569; line-height: 1.7; margin-bottom: 20px; font-size: 16px; }
        .button { display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 20px 0; transition: background-color 0.3s; }
        .button:hover { background-color: #1d4ed8; }
        .features { margin: 30px 0; }
        .feature { margin: 20px 0; padding: 20px; background-color: #f1f5f9; border-radius: 8px; border-left: 4px solid #2563eb; }
        .feature h3 { color: #1e293b; margin: 0 0 10px 0; font-size: 18px; }
        .feature p { color: #64748b; margin: 0; font-size: 14px; line-height: 1.6; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #94a3b8; font-size: 14px; margin: 5px 0; }
        .footer a { color: #2563eb; text-decoration: none; }
        @media (max-width: 600px) {
            .container { margin: 0 10px; }
            .header, .content, .footer { padding: 20px; }
            .header h1 { font-size: 24px; }
            .button { display: block; text-align: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Medeez!</h1>
            <p>Your Healthcare Practice Management Solution</p>
        </div>
        
        <div class="content">
            <h2>Welcome, {{firstName}}!</h2>
            
            <p>Thank you for choosing Medeez to manage your healthcare practice. We're excited to help you streamline your operations, improve patient care, and grow your practice.</p>
            
            <div style="text-align: center;">
                <a href="{{loginUrl}}" class="button">Get Started</a>
            </div>
            
            <div class="features">
                <div class="feature">
                    <h3>🏥 Practice Management</h3>
                    <p>Manage appointments, patient records, and staff efficiently in one integrated platform.</p>
                </div>
                
                <div class="feature">
                    <h3>📅 Smart Scheduling</h3>
                    <p>Automated appointment scheduling with conflict detection and patient notifications.</p>
                </div>
                
                <div class="feature">
                    <h3>💰 Billing & Claims</h3>
                    <p>Streamlined billing processes with automated claim submissions and payment tracking.</p>
                </div>
                
                <div class="feature">
                    <h3>🔒 HIPAA Compliant</h3>
                    <p>Enterprise-grade security ensuring all patient data is protected and compliant.</p>
                </div>
            </div>
            
            <p>If you have any questions or need assistance getting started, our support team is here to help. You can reach us at <a href="mailto:support@medeez.com">support@medeez.com</a> or visit our <a href="{{helpCenterUrl}}">Help Center</a>.</p>
            
            <p>Best regards,<br>The Medeez Team</p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 Medeez Inc. All rights reserved.</p>
            <p><a href="{{privacyUrl}}">Privacy Policy</a> | <a href="{{termsUrl}}">Terms of Service</a> | <a href="{{unsubscribeUrl}}">Unsubscribe</a></p>
            <p>Medeez Inc., 123 Healthcare Ave, Medical City, MC 12345</p>
        </div>
    </div>
</body>
</html>`;
  }

  private getWelcomeEmailText(): string {
    return `Welcome to Medeez!

Hello {{firstName}},

Thank you for choosing Medeez to manage your healthcare practice. We're excited to help you streamline your operations, improve patient care, and grow your practice.

Get started: {{loginUrl}}

What you can do with Medeez:

• Practice Management: Manage appointments, patient records, and staff efficiently
• Smart Scheduling: Automated appointment scheduling with conflict detection
• Billing & Claims: Streamlined billing with automated claim submissions
• HIPAA Compliant: Enterprise-grade security for all patient data

Need help? Contact our support team at support@medeez.com or visit {{helpCenterUrl}}

Best regards,
The Medeez Team

© 2024 Medeez Inc. All rights reserved.
Privacy Policy: {{privacyUrl}}
Terms of Service: {{termsUrl}}
Unsubscribe: {{unsubscribeUrl}}`;
  }

  private getInvitationEmailHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invitation to Join Medeez</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
        .content { padding: 40px 30px; }
        .content h2 { color: #1e293b; font-size: 24px; margin-bottom: 20px; }
        .content p { color: #475569; line-height: 1.7; margin-bottom: 20px; font-size: 16px; }
        .button { display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .invite-details { background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #94a3b8; font-size: 14px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>You're Invited!</h1>
        </div>
        
        <div class="content">
            <h2>Join {{clinicName}} on Medeez</h2>
            
            <p>Hello {{firstName}},</p>
            
            <p>{{invitedByName}} has invited you to join <strong>{{clinicName}}</strong> on Medeez, our healthcare practice management platform.</p>
            
            <div class="invite-details">
                <h3>Invitation Details:</h3>
                <p><strong>Clinic:</strong> {{clinicName}}</p>
                <p><strong>Role:</strong> {{role}}</p>
                <p><strong>Invited by:</strong> {{invitedByName}}</p>
                <p><strong>Expires:</strong> {{expirationDate}}</p>
            </div>
            
            <div style="text-align: center;">
                <a href="{{invitationUrl}}" class="button">Accept Invitation</a>
            </div>
            
            <p>This invitation will expire on {{expirationDate}}. If you have any questions, please contact {{invitedByEmail}} or reach out to our support team at support@medeez.com.</p>
            
            <p>Welcome to the team!</p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 Medeez Inc. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private getInvitationEmailText(): string {
    return `You're Invited to Join {{clinicName}} on Medeez!

Hello {{firstName}},

{{invitedByName}} has invited you to join {{clinicName}} on Medeez, our healthcare practice management platform.

Invitation Details:
- Clinic: {{clinicName}}
- Role: {{role}}
- Invited by: {{invitedByName}}
- Expires: {{expirationDate}}

Accept your invitation: {{invitationUrl}}

This invitation will expire on {{expirationDate}}. If you have any questions, please contact {{invitedByEmail}} or our support team at support@medeez.com.

Welcome to the team!

© 2024 Medeez Inc. All rights reserved.`;
  }

  private getPasswordResetEmailHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Medeez Password</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
        .content { padding: 40px 30px; }
        .content h2 { color: #1e293b; font-size: 24px; margin-bottom: 20px; }
        .content p { color: #475569; line-height: 1.7; margin-bottom: 20px; font-size: 16px; }
        .button { display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .security-notice { background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #94a3b8; font-size: 14px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset</h1>
        </div>
        
        <div class="content">
            <h2>Reset Your Password</h2>
            
            <p>Hello {{firstName}},</p>
            
            <p>We received a request to reset the password for your Medeez account. If you made this request, click the button below to reset your password:</p>
            
            <div style="text-align: center;">
                <a href="{{resetUrl}}" class="button">Reset Password</a>
            </div>
            
            <p>This password reset link will expire in {{expirationHours}} hours for security purposes.</p>
            
            <div class="security-notice">
                <h3>Security Notice</h3>
                <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
                <p>For security reasons, this link can only be used once and will expire automatically.</p>
            </div>
            
            <p>If you continue to have problems, please contact our support team at support@medeez.com.</p>
            
            <p>Best regards,<br>The Medeez Security Team</p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 Medeez Inc. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
  }

  private getPasswordResetEmailText(): string {
    return `Reset Your Medeez Password

Hello {{firstName}},

We received a request to reset the password for your Medeez account. If you made this request, use the link below to reset your password:

{{resetUrl}}

This password reset link will expire in {{expirationHours}} hours for security purposes.

Security Notice:
If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

For security reasons, this link can only be used once and will expire automatically.

If you continue to have problems, please contact our support team at support@medeez.com.

Best regards,
The Medeez Security Team

© 2024 Medeez Inc. All rights reserved.`;
  }

  private getAppointmentReminderEmailHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Appointment Reminder</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
        .content { padding: 40px 30px; }
        .appointment-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 25px; margin: 20px 0; }
        .appointment-detail { display: flex; align-items: center; margin: 10px 0; }
        .appointment-detail strong { min-width: 100px; color: #1e293b; }
        .button { display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin: 10px 5px; }
        .button.secondary { background-color: #64748b; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #94a3b8; font-size: 14px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Appointment Reminder</h1>
        </div>
        
        <div class="content">
            <h2>Your upcoming appointment</h2>
            
            <p>Hello {{patientName}},</p>
            
            <p>This is a reminder about your upcoming appointment with {{clinicName}}.</p>
            
            <div class="appointment-card">
                <h3>Appointment Details</h3>
                <div class="appointment-detail">
                    <strong>Date:</strong> {{appointmentDate}}
                </div>
                <div class="appointment-detail">
                    <strong>Time:</strong> {{appointmentTime}}
                </div>
                <div class="appointment-detail">
                    <strong>Provider:</strong> {{providerName}}
                </div>
                <div class="appointment-detail">
                    <strong>Type:</strong> {{appointmentType}}
                </div>
                <div class="appointment-detail">
                    <strong>Location:</strong> {{clinicAddress}}
                </div>
                {{#if appointmentNotes}}
                <div class="appointment-detail">
                    <strong>Notes:</strong> {{appointmentNotes}}
                </div>
                {{/if}}
            </div>
            
            <div style="text-align: center;">
                <a href="{{confirmUrl}}" class="button">Confirm Appointment</a>
                <a href="{{rescheduleUrl}}" class="button secondary">Reschedule</a>
            </div>
            
            <p><strong>Important:</strong> Please arrive 15 minutes early for check-in. If you need to cancel or reschedule, please do so at least {{cancellationHours}} hours in advance.</p>
            
            <p>If you have any questions, please contact us at {{clinicPhone}} or reply to this email.</p>
            
            <p>We look forward to seeing you!</p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{clinicName}}. All rights reserved.</p>
            <p>Powered by Medeez</p>
        </div>
    </div>
</body>
</html>`;
  }

  private getAppointmentReminderEmailText(): string {
    return `Appointment Reminder

Hello {{patientName}},

This is a reminder about your upcoming appointment with {{clinicName}}.

Appointment Details:
- Date: {{appointmentDate}}
- Time: {{appointmentTime}}
- Provider: {{providerName}}
- Type: {{appointmentType}}
- Location: {{clinicAddress}}
{{#if appointmentNotes}}- Notes: {{appointmentNotes}}{{/if}}

Confirm your appointment: {{confirmUrl}}
Reschedule: {{rescheduleUrl}}

Important: Please arrive 15 minutes early for check-in. If you need to cancel or reschedule, please do so at least {{cancellationHours}} hours in advance.

If you have any questions, please contact us at {{clinicPhone}}.

We look forward to seeing you!

© 2024 {{clinicName}}. All rights reserved.
Powered by Medeez`;
  }

  private getMagicLinkEmailHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Your Patient Portal</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%); padding: 40px 30px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; }
        .content { padding: 40px 30px; }
        .content h2 { color: #1e293b; font-size: 24px; margin-bottom: 20px; }
        .content p { color: #475569; line-height: 1.7; margin-bottom: 20px; font-size: 16px; }
        .button { display: inline-block; background-color: #0891b2; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .security-notice { background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .footer { background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
        .footer p { color: #94a3b8; font-size: 14px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Patient Portal Access</h1>
        </div>
        
        <div class="content">
            <h2>Access Your Patient Portal</h2>
            
            <p>Hello {{patientName}},</p>
            
            <p>{{clinicName}} has provided you with secure access to your patient portal. Click the button below to access your health information, appointment history, and more.</p>
            
            <div style="text-align: center;">
                <a href="{{magicLinkUrl}}" class="button">Access Patient Portal</a>
            </div>
            
            <div class="security-notice">
                <h3>Security Information</h3>
                <p>This secure link will expire in {{expirationHours}} hours for your protection.</p>
                <p>The link can only be used {{maxUses}} time(s) and is unique to your account.</p>
            </div>
            
            <p>In the patient portal, you can:</p>
            <ul>
                <li>View your appointment history and upcoming appointments</li>
                <li>Access your medical records and test results</li>
                <li>Update your contact information</li>
                <li>Download important documents</li>
                <li>Communicate securely with your healthcare team</li>
            </ul>
            
            <p>If you have any questions or need assistance, please contact {{clinicName}} at {{clinicPhone}} or {{clinicEmail}}.</p>
            
            <p>Thank you for choosing {{clinicName}} for your healthcare needs.</p>
        </div>
        
        <div class="footer">
            <p>&copy; 2024 {{clinicName}}. All rights reserved.</p>
            <p>Powered by Medeez</p>
        </div>
    </div>
</body>
</html>`;
  }

  private getMagicLinkEmailText(): string {
    return `Access Your Patient Portal

Hello {{patientName}},

{{clinicName}} has provided you with secure access to your patient portal.

Access your portal: {{magicLinkUrl}}

Security Information:
- This secure link will expire in {{expirationHours}} hours
- The link can only be used {{maxUses}} time(s)
- This link is unique to your account

In the patient portal, you can:
• View your appointment history and upcoming appointments
• Access your medical records and test results
• Update your contact information
• Download important documents
• Communicate securely with your healthcare team

If you have any questions or need assistance, please contact {{clinicName}} at {{clinicPhone}} or {{clinicEmail}}.

Thank you for choosing {{clinicName}} for your healthcare needs.

© 2024 {{clinicName}}. All rights reserved.
Powered by Medeez`;
  }
}