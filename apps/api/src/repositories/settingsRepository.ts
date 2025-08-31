import { BaseRepository } from './base';
import { logger } from '@/utils/logger';
import { defaultUserPreferences, defaultOnboardingSteps } from '@/models/user';

export interface UserSettings {
  userId: string;
  preferences: {
    timezone: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
    language: string;
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
      appointmentReminders: boolean;
      taskReminders: boolean;
      invoiceUpdates: boolean;
    };
  };
  avatar?: {
    url: string;
    uploadKey: string;
  };
  signature?: string;
  updatedAt: string;
}

export interface ClinicSettings {
  clinicId: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  contact: {
    phone: string;
    email: string;
    website?: string;
  };
  businessHours: Array<{
    day: string;
    open: string;
    close: string;
    closed: boolean;
  }>;
  appointmentSettings: {
    defaultDuration: number;
    bufferTime: number;
    allowOnlineBooking: boolean;
    requireConfirmation: boolean;
    cancellationPolicy: string;
  };
  invoiceSettings: {
    defaultPaymentTerms: number;
    lateFeeRate: number;
    reminderDays: number[];
    autoSendReminders: boolean;
  };
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  updatedAt: string;
}

export interface SystemSettings {
  platform: {
    maintenanceMode: boolean;
    maintenanceMessage?: string;
    featureFlags: Record<string, boolean>;
    rateLimits: Record<string, number>;
  };
  security: {
    sessionTimeout: number;
    passwordPolicy: {
      minLength: number;
      requireNumbers: boolean;
      requireSymbols: boolean;
      requireUppercase: boolean;
      requireLowercase: boolean;
    };
    mfaRequired: boolean;
  };
  integrations: {
    enabledServices: string[];
    webhookRetryPolicy: {
      maxRetries: number;
      backoffMultiplier: number;
    };
  };
  updatedAt: string;
}

export interface NotificationTemplate {
  id: string;
  clinicId?: string;
  type: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  isActive: boolean;
  isSystem: boolean;
  updatedBy: string;
  updatedAt: string;
}

export class SettingsRepository extends BaseRepository {
  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettings> {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: 'SETTINGS'
        }
      };

      const result = await this.get(params);
      
      if (!result.Item) {
        // Return default settings if none exist
        return {
          userId,
          preferences: defaultUserPreferences,
          updatedAt: new Date().toISOString()
        };
      }

      return {
        userId,
        preferences: result.Item.preferences || defaultUserPreferences,
        avatar: result.Item.avatar,
        signature: result.Item.signature,
        updatedAt: result.Item.updatedAt
      };

    } catch (error) {
      logger.error('Failed to get user settings', { userId, error });
      throw error;
    }
  }

  /**
   * Update user settings
   */
  async updateUserSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
    try {
      const currentSettings = await this.getUserSettings(userId);
      const updatedSettings = {
        ...currentSettings,
        ...updates,
        userId,
        updatedAt: new Date().toISOString()
      };

      const params = {
        TableName: this.tableName,
        Item: {
          PK: `USER#${userId}`,
          SK: 'SETTINGS',
          entityType: 'USER_SETTINGS',
          userId,
          preferences: updatedSettings.preferences,
          avatar: updatedSettings.avatar,
          signature: updatedSettings.signature,
          updatedAt: updatedSettings.updatedAt,
          ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year TTL
        }
      };

      await this.put(params);
      
      logger.info('User settings updated', { userId });
      return updatedSettings;

    } catch (error) {
      logger.error('Failed to update user settings', { userId, error });
      throw error;
    }
  }

  /**
   * Get clinic settings
   */
  async getClinicSettings(clinicId: string): Promise<ClinicSettings> {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: `TENANT#${clinicId}`,
          SK: 'CLINIC#SETTINGS'
        }
      };

      const result = await this.get(params);
      
      if (!result.Item) {
        throw new Error(`Clinic settings not found for clinic ${clinicId}`);
      }

      return {
        clinicId,
        name: result.Item.name,
        address: result.Item.address,
        contact: result.Item.contact,
        businessHours: result.Item.businessHours || this.getDefaultBusinessHours(),
        appointmentSettings: result.Item.appointmentSettings || this.getDefaultAppointmentSettings(),
        invoiceSettings: result.Item.invoiceSettings || this.getDefaultInvoiceSettings(),
        branding: result.Item.branding,
        updatedAt: result.Item.updatedAt
      };

    } catch (error) {
      logger.error('Failed to get clinic settings', { clinicId, error });
      throw error;
    }
  }

  /**
   * Get limited clinic settings for non-admin users
   */
  async getLimitedClinicSettings(clinicId: string): Promise<Partial<ClinicSettings>> {
    try {
      const fullSettings = await this.getClinicSettings(clinicId);
      
      // Return only non-sensitive information
      return {
        clinicId,
        name: fullSettings.name,
        businessHours: fullSettings.businessHours,
        appointmentSettings: {
          defaultDuration: fullSettings.appointmentSettings.defaultDuration,
          allowOnlineBooking: fullSettings.appointmentSettings.allowOnlineBooking,
          requireConfirmation: fullSettings.appointmentSettings.requireConfirmation,
          cancellationPolicy: fullSettings.appointmentSettings.cancellationPolicy,
          bufferTime: 0 // Don't expose buffer time to non-admins
        },
        branding: fullSettings.branding
      };

    } catch (error) {
      logger.error('Failed to get limited clinic settings', { clinicId, error });
      throw error;
    }
  }

  /**
   * Update clinic settings
   */
  async updateClinicSettings(clinicId: string, updates: Partial<ClinicSettings>, updatedBy: string): Promise<ClinicSettings> {
    try {
      const currentSettings = await this.getClinicSettings(clinicId);
      const updatedSettings = {
        ...currentSettings,
        ...updates,
        clinicId,
        updatedAt: new Date().toISOString()
      };

      const params = {
        TableName: this.tableName,
        Item: {
          PK: `TENANT#${clinicId}`,
          SK: 'CLINIC#SETTINGS',
          entityType: 'CLINIC_SETTINGS',
          clinicId,
          name: updatedSettings.name,
          address: updatedSettings.address,
          contact: updatedSettings.contact,
          businessHours: updatedSettings.businessHours,
          appointmentSettings: updatedSettings.appointmentSettings,
          invoiceSettings: updatedSettings.invoiceSettings,
          branding: updatedSettings.branding,
          updatedAt: updatedSettings.updatedAt,
          updatedBy
        }
      };

      await this.put(params);
      
      logger.info('Clinic settings updated', { clinicId, updatedBy });
      return updatedSettings;

    } catch (error) {
      logger.error('Failed to update clinic settings', { clinicId, error });
      throw error;
    }
  }

  /**
   * Get system settings (SuperAdmin only)
   */
  async getSystemSettings(): Promise<SystemSettings> {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: 'SYSTEM',
          SK: 'SETTINGS'
        }
      };

      const result = await this.get(params);
      
      if (!result.Item) {
        // Return default system settings
        return this.getDefaultSystemSettings();
      }

      return {
        platform: result.Item.platform,
        security: result.Item.security,
        integrations: result.Item.integrations,
        updatedAt: result.Item.updatedAt
      };

    } catch (error) {
      logger.error('Failed to get system settings', { error });
      throw error;
    }
  }

  /**
   * Get platform settings for system overview
   */
  async getPlatformSettings(): Promise<any> {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: 'PLATFORM',
          SK: 'SETTINGS'
        }
      };

      const result = await this.get(params);
      
      return result.Item || {};

    } catch (error) {
      logger.error('Failed to get platform settings', { error });
      throw error;
    }
  }

  /**
   * Update system settings (SuperAdmin only)
   */
  async updateSystemSettings(updates: Partial<SystemSettings>, updatedBy: string): Promise<SystemSettings> {
    try {
      const currentSettings = await this.getSystemSettings();
      const updatedSettings = {
        ...currentSettings,
        ...updates,
        updatedAt: new Date().toISOString()
      };

      const params = {
        TableName: this.tableName,
        Item: {
          PK: 'SYSTEM',
          SK: 'SETTINGS',
          entityType: 'SYSTEM_SETTINGS',
          platform: updatedSettings.platform,
          security: updatedSettings.security,
          integrations: updatedSettings.integrations,
          updatedAt: updatedSettings.updatedAt,
          updatedBy
        }
      };

      await this.put(params);
      
      logger.warn('System settings updated', { updatedBy, changes: Object.keys(updates) });
      return updatedSettings;

    } catch (error) {
      logger.error('Failed to update system settings', { error });
      throw error;
    }
  }

  /**
   * Get available timezones
   */
  async getAvailableTimezones(): Promise<Array<{ value: string; label: string; offset: string }>> {
    // This could be cached or stored in the database
    const timezones = [
      { value: 'America/New_York', label: 'Eastern Time', offset: 'UTC-5/-4' },
      { value: 'America/Chicago', label: 'Central Time', offset: 'UTC-6/-5' },
      { value: 'America/Denver', label: 'Mountain Time', offset: 'UTC-7/-6' },
      { value: 'America/Los_Angeles', label: 'Pacific Time', offset: 'UTC-8/-7' },
      { value: 'Europe/London', label: 'GMT', offset: 'UTC+0/+1' },
      { value: 'Europe/Paris', label: 'CET', offset: 'UTC+1/+2' },
      { value: 'Asia/Tokyo', label: 'JST', offset: 'UTC+9' },
      { value: 'Australia/Sydney', label: 'AEST', offset: 'UTC+10/+11' }
    ];

    return timezones;
  }

  /**
   * Get notification templates for clinic
   */
  async getClinicNotificationTemplates(clinicId: string): Promise<NotificationTemplate[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `TEMPLATES#${clinicId}`
        }
      };

      const result = await this.query(params);
      
      return (result.Items || []).map(item => ({
        id: item.SK.replace('TEMPLATE#', ''),
        clinicId: item.clinicId,
        type: item.type,
        name: item.name,
        subject: item.subject,
        body: item.body,
        variables: item.variables || [],
        isActive: item.isActive !== false,
        isSystem: false,
        updatedBy: item.updatedBy,
        updatedAt: item.updatedAt
      }));

    } catch (error) {
      logger.error('Failed to get clinic notification templates', { clinicId, error });
      return [];
    }
  }

  /**
   * Get all notification templates (SuperAdmin only)
   */
  async getAllNotificationTemplates(): Promise<NotificationTemplate[]> {
    try {
      const params = {
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'TEMPLATES#SYSTEM'
        }
      };

      const result = await this.query(params);
      
      return (result.Items || []).map(item => ({
        id: item.SK.replace('TEMPLATE#', ''),
        type: item.type,
        name: item.name,
        subject: item.subject,
        body: item.body,
        variables: item.variables || [],
        isActive: item.isActive !== false,
        isSystem: true,
        updatedBy: item.updatedBy,
        updatedAt: item.updatedAt
      }));

    } catch (error) {
      logger.error('Failed to get all notification templates', { error });
      return [];
    }
  }

  /**
   * Update notification template
   */
  async updateNotificationTemplate(
    templateId: string, 
    updates: Partial<NotificationTemplate>, 
    clinicId: string | undefined, 
    updatedBy: string
  ): Promise<NotificationTemplate | null> {
    try {
      const pk = clinicId ? `TENANT#${clinicId}` : 'SYSTEM';
      const gsi1pk = clinicId ? `TEMPLATES#${clinicId}` : 'TEMPLATES#SYSTEM';

      const params = {
        TableName: this.tableName,
        Key: {
          PK: pk,
          SK: `TEMPLATE#${templateId}`
        }
      };

      const existing = await this.get(params);
      if (!existing.Item) {
        return null;
      }

      const updatedTemplate = {
        ...existing.Item,
        ...updates,
        updatedBy,
        updatedAt: new Date().toISOString()
      };

      const putParams = {
        TableName: this.tableName,
        Item: {
          ...updatedTemplate,
          GSI1PK: gsi1pk,
          GSI1SK: `TEMPLATE#${templateId}`
        }
      };

      await this.put(putParams);

      return {
        id: templateId,
        clinicId,
        type: updatedTemplate.type,
        name: updatedTemplate.name,
        subject: updatedTemplate.subject,
        body: updatedTemplate.body,
        variables: updatedTemplate.variables,
        isActive: updatedTemplate.isActive,
        isSystem: !clinicId,
        updatedBy,
        updatedAt: updatedTemplate.updatedAt
      };

    } catch (error) {
      logger.error('Failed to update notification template', { templateId, clinicId, error });
      throw error;
    }
  }

  /**
   * Get feature flags for clinic
   */
  async getClinicFeatureFlags(clinicId: string): Promise<Record<string, boolean>> {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: `TENANT#${clinicId}`,
          SK: 'FEATURE_FLAGS'
        }
      };

      const result = await this.get(params);
      
      if (!result.Item) {
        return this.getDefaultFeatureFlags();
      }

      return result.Item.flags || this.getDefaultFeatureFlags();

    } catch (error) {
      logger.error('Failed to get clinic feature flags', { clinicId, error });
      return this.getDefaultFeatureFlags();
    }
  }

  /**
   * Get all feature flags (SuperAdmin only)
   */
  async getAllFeatureFlags(): Promise<Record<string, boolean>> {
    try {
      const params = {
        TableName: this.tableName,
        Key: {
          PK: 'SYSTEM',
          SK: 'FEATURE_FLAGS'
        }
      };

      const result = await this.get(params);
      
      return result.Item?.flags || this.getDefaultFeatureFlags();

    } catch (error) {
      logger.error('Failed to get all feature flags', { error });
      return this.getDefaultFeatureFlags();
    }
  }

  /**
   * Update feature flags (SuperAdmin only)
   */
  async updateFeatureFlags(flags: Record<string, boolean>, updatedBy: string): Promise<Record<string, boolean>> {
    try {
      const currentFlags = await this.getAllFeatureFlags();
      const updatedFlags = { ...currentFlags, ...flags };

      const params = {
        TableName: this.tableName,
        Item: {
          PK: 'SYSTEM',
          SK: 'FEATURE_FLAGS',
          entityType: 'FEATURE_FLAGS',
          flags: updatedFlags,
          updatedBy,
          updatedAt: new Date().toISOString()
        }
      };

      await this.put(params);
      
      logger.warn('Feature flags updated', { updatedBy, changedFlags: Object.keys(flags) });
      return updatedFlags;

    } catch (error) {
      logger.error('Failed to update feature flags', { error });
      throw error;
    }
  }

  /**
   * Reset user settings to defaults
   */
  async resetUserSettings(userId: string): Promise<UserSettings> {
    try {
      const defaultSettings: UserSettings = {
        userId,
        preferences: defaultUserPreferences,
        updatedAt: new Date().toISOString()
      };

      await this.updateUserSettings(userId, defaultSettings);
      
      logger.info('User settings reset to defaults', { userId });
      return defaultSettings;

    } catch (error) {
      logger.error('Failed to reset user settings', { userId, error });
      throw error;
    }
  }

  /**
   * Reset clinic settings to defaults
   */
  async resetClinicSettings(clinicId: string, updatedBy: string): Promise<Partial<ClinicSettings>> {
    try {
      const defaultSettings = {
        businessHours: this.getDefaultBusinessHours(),
        appointmentSettings: this.getDefaultAppointmentSettings(),
        invoiceSettings: this.getDefaultInvoiceSettings()
      };

      const updatedSettings = await this.updateClinicSettings(clinicId, defaultSettings, updatedBy);
      
      logger.info('Clinic settings reset to defaults', { clinicId, updatedBy });
      return updatedSettings;

    } catch (error) {
      logger.error('Failed to reset clinic settings', { clinicId, error });
      throw error;
    }
  }

  // Default settings helpers
  private getDefaultBusinessHours() {
    return [
      { day: 'monday', open: '09:00', close: '17:00', closed: false },
      { day: 'tuesday', open: '09:00', close: '17:00', closed: false },
      { day: 'wednesday', open: '09:00', close: '17:00', closed: false },
      { day: 'thursday', open: '09:00', close: '17:00', closed: false },
      { day: 'friday', open: '09:00', close: '17:00', closed: false },
      { day: 'saturday', open: '09:00', close: '12:00', closed: false },
      { day: 'sunday', open: '00:00', close: '00:00', closed: true }
    ];
  }

  private getDefaultAppointmentSettings() {
    return {
      defaultDuration: 30,
      bufferTime: 10,
      allowOnlineBooking: true,
      requireConfirmation: true,
      cancellationPolicy: 'Appointments can be cancelled up to 24 hours in advance.'
    };
  }

  private getDefaultInvoiceSettings() {
    return {
      defaultPaymentTerms: 30,
      lateFeeRate: 5.0,
      reminderDays: [7, 3, 1],
      autoSendReminders: true
    };
  }

  private getDefaultSystemSettings(): SystemSettings {
    return {
      platform: {
        maintenanceMode: false,
        featureFlags: this.getDefaultFeatureFlags(),
        rateLimits: {
          api: 1000,
          auth: 50,
          export: 10
        }
      },
      security: {
        sessionTimeout: 3600,
        passwordPolicy: {
          minLength: 8,
          requireNumbers: true,
          requireSymbols: true,
          requireUppercase: true,
          requireLowercase: true
        },
        mfaRequired: false
      },
      integrations: {
        enabledServices: ['google_calendar', 'twilio', 'sendgrid'],
        webhookRetryPolicy: {
          maxRetries: 3,
          backoffMultiplier: 2
        }
      },
      updatedAt: new Date().toISOString()
    };
  }

  private getDefaultFeatureFlags(): Record<string, boolean> {
    return {
      onlineBooking: true,
      telehealth: false,
      aiAssistant: false,
      advancedAnalytics: true,
      bulkOperations: true,
      customTemplates: true,
      apiAccess: false,
      whiteLabeling: false
    };
  }
}