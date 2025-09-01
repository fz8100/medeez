import {
  SESClient,
  SendEmailCommand,
  SendBulkEmailCommand,
  SendTemplatedEmailCommand,
  CreateTemplateCommand,
  UpdateTemplateCommand,
  DeleteTemplateCommand,
  GetTemplateCommand,
  ListTemplatesCommand,
  GetAccountSendingEnabledCommand,
  PutConfigurationSetEventDestinationCommand
} from '@aws-sdk/client-ses';
import { logger } from '@/utils/logger';
import { AppError } from '@/types';

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailTemplate {
  templateName: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface EmailMessage {
  to: EmailAddress[];
  from: EmailAddress;
  replyTo?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
  templateName?: string;
  templateData?: Record<string, any>;
  tags?: Record<string, string>;
}

export interface BulkEmailMessage {
  to: EmailAddress[];
  templateName: string;
  templateData: Record<string, any>[];
  from: EmailAddress;
  replyTo?: EmailAddress[];
  tags?: Record<string, string>;
}

export interface EmailStats {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  rejected: number;
}

export class EmailService {
  private client: SESClient;
  private region: string;
  private configurationSet: string;
  private fromDomain: string;
  private noReplyEmail: string;
  private supportEmail: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.configurationSet = process.env.SES_CONFIGURATION_SET || 'medeez-email';
    this.fromDomain = process.env.EMAIL_DOMAIN || 'medeez.com';
    this.noReplyEmail = `no-reply@${this.fromDomain}`;
    this.supportEmail = `support@${this.fromDomain}`;

    logger.debug('Initializing SES client', {
      region: this.region,
      configurationSet: this.configurationSet,
      fromDomain: this.fromDomain,
      environment: process.env.NODE_ENV
    });

    this.client = new SESClient({
      region: this.region,
      maxAttempts: 3,
      retryMode: 'adaptive',
      // Use IAM role in production, local credentials in development
      ...(process.env.NODE_ENV === 'development' && {
        credentials: process.env.AWS_PROFILE ? undefined : {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
        }
      })
    });

    logger.info('Email service initialized', {
      region: this.region,
      configurationSet: this.configurationSet
    });
  }

  /**
   * Format email address for SES
   */
  private formatEmailAddress(address: EmailAddress): string {
    return address.name ? `${address.name} <${address.email}>` : address.email;
  }

  /**
   * Validate email addresses
   */
  private validateEmailAddresses(addresses: EmailAddress[]): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    for (const address of addresses) {
      if (!emailRegex.test(address.email)) {
        throw new AppError(`Invalid email address: ${address.email}`, 400, 'INVALID_EMAIL');
      }
      
      // Additional validation for clinic domain emails
      if (address.email.endsWith(`@${this.fromDomain}`) && 
          !['no-reply', 'support', 'admin', 'notifications'].some(prefix => 
            address.email.startsWith(`${prefix}@`)
          )) {
        logger.warn('Potential spoofing attempt', { email: address.email });
      }
    }
  }

  /**
   * Send single email
   */
  async sendEmail(message: EmailMessage): Promise<{ messageId: string }> {
    try {
      this.validateEmailAddresses([message.from, ...message.to]);
      
      if (message.cc) this.validateEmailAddresses(message.cc);
      if (message.bcc) this.validateEmailAddresses(message.bcc);
      if (message.replyTo) this.validateEmailAddresses(message.replyTo);

      // Use template if specified
      if (message.templateName && message.templateData) {
        return await this.sendTemplatedEmail(message);
      }

      const command = new SendEmailCommand({
        Source: this.formatEmailAddress(message.from),
        Destination: {
          ToAddresses: message.to.map(addr => this.formatEmailAddress(addr)),
          CcAddresses: message.cc?.map(addr => this.formatEmailAddress(addr)),
          BccAddresses: message.bcc?.map(addr => this.formatEmailAddress(addr))
        },
        Message: {
          Subject: {
            Data: message.subject,
            Charset: 'UTF-8'
          },
          Body: {
            ...(message.htmlBody && {
              Html: {
                Data: message.htmlBody,
                Charset: 'UTF-8'
              }
            }),
            ...(message.textBody && {
              Text: {
                Data: message.textBody,
                Charset: 'UTF-8'
              }
            })
          }
        },
        ReplyToAddresses: message.replyTo?.map(addr => this.formatEmailAddress(addr)),
        ConfigurationSetName: this.configurationSet,
        Tags: message.tags ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value })) : []
      });

      const result = await this.client.send(command);
      
      logger.info('Email sent successfully', {
        messageId: result.MessageId,
        to: message.to.map(addr => addr.email),
        subject: message.subject,
        configurationSet: this.configurationSet
      });

      return { messageId: result.MessageId! };

    } catch (error) {
      logger.error('Failed to send email', error);
      throw new AppError('Failed to send email');
    }
  }

  /**
   * Send templated email
   */
  async sendTemplatedEmail(message: EmailMessage): Promise<{ messageId: string }> {
    try {
      if (!message.templateName || !message.templateData) {
        throw new AppError('Template name and data required for templated email');
      }

      this.validateEmailAddresses([message.from, ...message.to]);

      const command = new SendTemplatedEmailCommand({
        Source: this.formatEmailAddress(message.from),
        Destination: {
          ToAddresses: message.to.map(addr => this.formatEmailAddress(addr)),
          CcAddresses: message.cc?.map(addr => this.formatEmailAddress(addr)),
          BccAddresses: message.bcc?.map(addr => this.formatEmailAddress(addr))
        },
        Template: message.templateName,
        TemplateData: JSON.stringify(message.templateData),
        ReplyToAddresses: message.replyTo?.map(addr => this.formatEmailAddress(addr)),
        ConfigurationSetName: this.configurationSet,
        Tags: message.tags ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value })) : []
      });

      const result = await this.client.send(command);
      
      logger.info('Templated email sent successfully', {
        messageId: result.MessageId,
        template: message.templateName,
        to: message.to.map(addr => addr.email)
      });

      return { messageId: result.MessageId! };

    } catch (error) {
      logger.error('Failed to send templated email', error);
      throw new AppError('Failed to send templated email');
    }
  }

  /**
   * Send bulk emails using templates
   */
  async sendBulkEmail(message: BulkEmailMessage): Promise<{ messageIds: string[] }> {
    try {
      this.validateEmailAddresses([message.from, ...message.to]);

      if (message.templateData.length !== message.to.length) {
        throw new AppError('Template data array length must match recipients array length');
      }

      const destinations = message.to.map((recipient, index) => ({
        Destination: {
          ToAddresses: [this.formatEmailAddress(recipient)]
        },
        ReplacementTemplateData: JSON.stringify(message.templateData[index])
      }));

      const command = new SendBulkEmailCommand({
        Source: this.formatEmailAddress(message.from),
        Template: message.templateName,
        DefaultTemplateData: JSON.stringify({}),
        Destinations: destinations,
        ReplyToAddresses: message.replyTo?.map(addr => this.formatEmailAddress(addr)),
        ConfigurationSetName: this.configurationSet,
        Tags: message.tags ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value })) : []
      });

      const result = await this.client.send(command);
      
      const messageIds = result.Status?.map(status => status.MessageId).filter(Boolean) as string[];
      
      logger.info('Bulk email sent successfully', {
        messageIds,
        template: message.templateName,
        recipientCount: message.to.length
      });

      return { messageIds };

    } catch (error) {
      logger.error('Failed to send bulk email', error);
      throw new AppError('Failed to send bulk email');
    }
  }

  /**
   * Create email template
   */
  async createTemplate(template: EmailTemplate): Promise<void> {
    try {
      const command = new CreateTemplateCommand({
        Template: {
          TemplateName: template.templateName,
          SubjectPart: template.subject,
          HtmlPart: template.htmlBody,
          TextPart: template.textBody
        }
      });

      await this.client.send(command);
      
      logger.info('Email template created', {
        templateName: template.templateName
      });

    } catch (error) {
      logger.error('Failed to create email template', error);
      throw new AppError('Failed to create email template');
    }
  }

  /**
   * Update email template
   */
  async updateTemplate(template: EmailTemplate): Promise<void> {
    try {
      const command = new UpdateTemplateCommand({
        Template: {
          TemplateName: template.templateName,
          SubjectPart: template.subject,
          HtmlPart: template.htmlBody,
          TextPart: template.textBody
        }
      });

      await this.client.send(command);
      
      logger.info('Email template updated', {
        templateName: template.templateName
      });

    } catch (error) {
      logger.error('Failed to update email template', error);
      throw new AppError('Failed to update email template');
    }
  }

  /**
   * Delete email template
   */
  async deleteTemplate(templateName: string): Promise<void> {
    try {
      const command = new DeleteTemplateCommand({
        TemplateName: templateName
      });

      await this.client.send(command);
      
      logger.info('Email template deleted', { templateName });

    } catch (error) {
      logger.error('Failed to delete email template', error);
      throw new AppError('Failed to delete email template');
    }
  }

  /**
   * Get email template
   */
  async getTemplate(templateName: string): Promise<EmailTemplate | null> {
    try {
      const command = new GetTemplateCommand({
        TemplateName: templateName
      });

      const result = await this.client.send(command);
      
      if (!result.Template) {
        return null;
      }

      return {
        templateName: result.Template.TemplateName!,
        subject: result.Template.SubjectPart!,
        htmlBody: result.Template.HtmlPart!,
        textBody: result.Template.TextPart
      };

    } catch (error: any) {
      if (error.name === 'TemplateDoesNotExistException') {
        return null;
      }
      logger.error('Failed to get email template', error);
      throw new AppError('Failed to get email template');
    }
  }

  /**
   * List email templates
   */
  async listTemplates(maxItems: number = 50): Promise<string[]> {
    try {
      const command = new ListTemplatesCommand({
        MaxItems: maxItems
      });

      const result = await this.client.send(command);
      
      return result.TemplatesMetadata?.map(template => template.Name!) || [];

    } catch (error) {
      logger.error('Failed to list email templates', error);
      throw new AppError('Failed to list email templates');
    }
  }

  /**
   * Check if SES sending is enabled
   */
  async isSendingEnabled(): Promise<boolean> {
    try {
      const command = new GetAccountSendingEnabledCommand({});
      const result = await this.client.send(command);
      
      return result.Enabled || false;

    } catch (error) {
      logger.error('Failed to check SES sending status', error);
      return false;
    }
  }

  /**
   * Send appointment reminder email
   */
  async sendAppointmentReminder(
    patientEmail: string,
    patientName: string,
    appointmentDate: string,
    appointmentTime: string,
    doctorName: string,
    clinicName: string,
    clinicPhone: string
  ): Promise<{ messageId: string }> {
    const message: EmailMessage = {
      to: [{ email: patientEmail, name: patientName }],
      from: { email: this.noReplyEmail, name: clinicName },
      replyTo: [{ email: this.supportEmail, name: `${clinicName} Support` }],
      subject: `Appointment Reminder - ${appointmentDate}`,
      templateName: 'appointment-reminder',
      templateData: {
        patientName,
        appointmentDate,
        appointmentTime,
        doctorName,
        clinicName,
        clinicPhone,
        rescheduleUrl: `https://${this.fromDomain}/appointments/reschedule`,
        cancelUrl: `https://${this.fromDomain}/appointments/cancel`
      },
      tags: {
        type: 'appointment-reminder',
        clinic: clinicName.toLowerCase().replace(/\s+/g, '-')
      }
    };

    return await this.sendEmail(message);
  }

  /**
   * Send welcome email to new patient
   */
  async sendWelcomeEmail(
    patientEmail: string,
    patientName: string,
    clinicName: string,
    portalUrl: string
  ): Promise<{ messageId: string }> {
    const message: EmailMessage = {
      to: [{ email: patientEmail, name: patientName }],
      from: { email: this.noReplyEmail, name: clinicName },
      replyTo: [{ email: this.supportEmail, name: `${clinicName} Support` }],
      subject: `Welcome to ${clinicName}`,
      templateName: 'patient-welcome',
      templateData: {
        patientName,
        clinicName,
        portalUrl,
        supportEmail: this.supportEmail
      },
      tags: {
        type: 'welcome',
        clinic: clinicName.toLowerCase().replace(/\s+/g, '-')
      }
    };

    return await this.sendEmail(message);
  }

  /**
   * Send invoice email
   */
  async sendInvoiceEmail(
    patientEmail: string,
    patientName: string,
    invoiceNumber: string,
    amount: string,
    dueDate: string,
    clinicName: string,
    paymentUrl: string
  ): Promise<{ messageId: string }> {
    const message: EmailMessage = {
      to: [{ email: patientEmail, name: patientName }],
      from: { email: this.noReplyEmail, name: clinicName },
      replyTo: [{ email: this.supportEmail, name: `${clinicName} Support` }],
      subject: `Invoice ${invoiceNumber} - Amount Due: ${amount}`,
      templateName: 'invoice-notification',
      templateData: {
        patientName,
        invoiceNumber,
        amount,
        dueDate,
        clinicName,
        paymentUrl,
        supportEmail: this.supportEmail
      },
      tags: {
        type: 'invoice',
        clinic: clinicName.toLowerCase().replace(/\s+/g, '-')
      }
    };

    return await this.sendEmail(message);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    userEmail: string,
    userName: string,
    resetUrl: string,
    expiresIn: string
  ): Promise<{ messageId: string }> {
    const message: EmailMessage = {
      to: [{ email: userEmail, name: userName }],
      from: { email: this.noReplyEmail, name: 'Medeez Security' },
      subject: 'Password Reset Request',
      templateName: 'password-reset',
      templateData: {
        userName,
        resetUrl,
        expiresIn,
        supportEmail: this.supportEmail
      },
      tags: {
        type: 'security',
        action: 'password-reset'
      }
    };

    return await this.sendEmail(message);
  }

  /**
   * Send system notification to admin
   */
  async sendSystemNotification(
    adminEmail: string,
    subject: string,
    message: string,
    priority: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<{ messageId: string }> {
    const emailMessage: EmailMessage = {
      to: [{ email: adminEmail }],
      from: { email: this.noReplyEmail, name: 'Medeez System' },
      subject: `[${priority.toUpperCase()}] ${subject}`,
      htmlBody: `
        <h2>System Notification</h2>
        <p><strong>Priority:</strong> ${priority.toUpperCase()}</p>
        <p><strong>Message:</strong></p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 4px;">
          ${message.replace(/\n/g, '<br>')}
        </div>
        <hr>
        <p><small>This is an automated message from the Medeez system.</small></p>
      `,
      textBody: `
System Notification

Priority: ${priority.toUpperCase()}
Message: ${message}

---
This is an automated message from the Medeez system.
      `,
      tags: {
        type: 'system-notification',
        priority
      }
    };

    return await this.sendEmail(emailMessage);
  }
}

// Singleton instance
export const emailService = new EmailService();