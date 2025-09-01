import { BaseEntity, Address, PhoneNumber } from './common';
import { UserRole } from './auth';

// Clinic settings
export interface ClinicSettings extends BaseEntity {
  clinicId: string;
  name: string;
  description?: string;
  type: ClinicType;
  specialties: string[];
  
  // Contact information
  address: Address;
  phoneNumbers: PhoneNumber[];
  email: string;
  website?: string;
  fax?: string;
  
  // Business information
  taxId?: string;
  npiNumber?: string;
  licenseNumber?: string;
  accreditation?: string[];
  
  // Operating hours
  operatingHours: OperatingHours[];
  holidays: Holiday[];
  timeZone: string;
  
  // Branding
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  
  // Features and preferences
  features: ClinicFeatures;
  preferences: ClinicPreferences;
  
  // Subscription and billing
  subscription: SubscriptionInfo;
  
  // Compliance and security
  hipaaOfficer?: string;
  securityOfficer?: string;
  complianceSettings: ComplianceSettings;
  
  // Integration settings
  integrations: IntegrationSettings;
  
  // Notification settings
  notifications: NotificationSettings;
}

export type ClinicType = 
  | 'solo-practice'
  | 'group-practice'
  | 'clinic'
  | 'hospital'
  | 'urgent-care'
  | 'specialty-clinic'
  | 'telehealth'
  | 'other';

export interface OperatingHours {
  dayOfWeek: number; // 0 = Sunday
  isOpen: boolean;
  openTime?: string; // HH:MM format
  closeTime?: string; // HH:MM format
  lunchBreak?: {
    startTime: string;
    endTime: string;
  };
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  isRecurring: boolean;
  affectsScheduling: boolean;
}

export interface ClinicFeatures {
  appointments: boolean;
  patientPortal: boolean;
  telehealth: boolean;
  billing: boolean;
  inventory: boolean;
  lab: boolean;
  imaging: boolean;
  pharmacy: boolean;
  referrals: boolean;
  reporting: boolean;
  apiAccess: boolean;
}

export interface ClinicPreferences {
  defaultAppointmentDuration: number; // in minutes
  appointmentBufferTime: number; // in minutes
  maxAdvanceBooking: number; // in days
  allowOnlineBooking: boolean;
  requireInsuranceVerification: boolean;
  defaultTimezone: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  currency: string;
  language: string;
  
  // Automatic features
  autoReminders: boolean;
  autoBackup: boolean;
  autoArchive: boolean;
  autoInvoicing: boolean;
  
  // Privacy settings
  shareAnonymizedData: boolean;
  allowThirdPartyIntegrations: boolean;
  trackUsageAnalytics: boolean;
}

// Subscription and billing
export interface SubscriptionInfo {
  planId: string;
  planName: string;
  planType: 'free' | 'basic' | 'professional' | 'enterprise';
  status: 'active' | 'cancelled' | 'expired' | 'suspended';
  startDate: string;
  endDate?: string;
  renewalDate: string;
  billingCycle: 'monthly' | 'quarterly' | 'annually';
  
  // Usage limits
  limits: {
    users: number;
    patients: number;
    appointments: number;
    storage: number; // in GB
    apiCalls: number;
  };
  
  // Current usage
  usage: {
    users: number;
    patients: number;
    appointments: number;
    storage: number;
    apiCalls: number;
  };
  
  // Billing information
  billingContact: {
    name: string;
    email: string;
    phone?: string;
  };
  
  // Payment method
  paymentMethod?: {
    type: 'credit-card' | 'bank-account' | 'invoice';
    lastFour?: string;
    expiryDate?: string;
  };
  
  // Add-ons
  addOns: Array<{
    id: string;
    name: string;
    price: number;
    isActive: boolean;
  }>;
}

// Compliance settings
export interface ComplianceSettings {
  hipaa: {
    enabled: boolean;
    businessAssociateAgreement: boolean;
    riskAssessmentCompleted: boolean;
    lastAuditDate?: string;
    nextAuditDate?: string;
    breachNotificationProcedure: boolean;
  };
  
  // Data retention
  dataRetention: {
    patientRecords: number; // years
    financialRecords: number; // years
    auditLogs: number; // years
    backups: number; // days
  };
  
  // Access controls
  accessControls: {
    minimumPasswordLength: number;
    requireTwoFactor: boolean;
    sessionTimeout: number; // minutes
    maxFailedAttempts: number;
    accountLockoutDuration: number; // minutes
  };
  
  // Audit settings
  auditSettings: {
    logAllAccess: boolean;
    logDataExports: boolean;
    logPrintActivities: boolean;
    retentionPeriod: number; // days
  };
}

// Integration settings
export interface IntegrationSettings {
  ehr: {
    enabled: boolean;
    provider?: string;
    apiKey?: string;
    webhookUrl?: string;
    syncPatients: boolean;
    syncAppointments: boolean;
    syncNotes: boolean;
  };
  
  lab: {
    enabled: boolean;
    provider?: string;
    apiCredentials?: Record<string, string>;
    autoImportResults: boolean;
    alertOnAbnormal: boolean;
  };
  
  imaging: {
    enabled: boolean;
    provider?: string;
    viewerUrl?: string;
    autoImportResults: boolean;
  };
  
  billing: {
    enabled: boolean;
    provider?: string;
    clearinghouseId?: string;
    autoSubmitClaims: boolean;
    electronicRemittance: boolean;
  };
  
  calendar: {
    googleCalendar: {
      enabled: boolean;
      calendarId?: string;
      syncAppointments: boolean;
    };
    outlookCalendar: {
      enabled: boolean;
      calendarId?: string;
      syncAppointments: boolean;
    };
  };
  
  communication: {
    sms: {
      enabled: boolean;
      provider?: 'twilio' | 'aws-sns' | 'custom';
      apiCredentials?: Record<string, string>;
    };
    email: {
      enabled: boolean;
      provider?: 'sendgrid' | 'ses' | 'smtp';
      apiCredentials?: Record<string, string>;
      fromAddress?: string;
      replyToAddress?: string;
    };
  };
  
  backup: {
    enabled: boolean;
    provider?: 'aws-s3' | 'google-drive' | 'dropbox' | 'local';
    frequency: 'daily' | 'weekly' | 'monthly';
    retentionPeriod: number; // days
    encryptionEnabled: boolean;
  };
}

// Notification settings
export interface NotificationSettings {
  email: {
    enabled: boolean;
    newPatients: boolean;
    appointmentReminders: boolean;
    cancelledAppointments: boolean;
    overduePayments: boolean;
    systemAlerts: boolean;
    backupReports: boolean;
  };
  
  sms: {
    enabled: boolean;
    appointmentReminders: boolean;
    urgentAlerts: boolean;
    paymentReminders: boolean;
  };
  
  push: {
    enabled: boolean;
    appointments: boolean;
    messages: boolean;
    alerts: boolean;
  };
  
  inApp: {
    enabled: boolean;
    showBadges: boolean;
    soundEnabled: boolean;
    desktopNotifications: boolean;
  };
}

// User management
export interface UserSettings extends BaseEntity {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  isActive: boolean;
  lastLoginAt?: string;
  
  // Profile information
  profile: UserProfile;
  
  // Preferences
  preferences: UserPreferences;
  
  // Security settings
  security: UserSecuritySettings;
  
  // Notification preferences
  notifications: UserNotificationSettings;
}

export interface Permission {
  resource: string;
  actions: PermissionAction[];
  conditions?: Record<string, any>;
}

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'manage';

export interface UserProfile {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phoneNumber?: string;
  profilePicture?: string;
  
  // Professional information
  title?: string;
  specialization?: string;
  licenseNumber?: string;
  npiNumber?: string;
  deaNumber?: string;
  
  // Contact preferences
  preferredContactMethod: 'email' | 'phone' | 'sms';
  
  // Address
  address?: Address;
  
  // Bio and notes
  bio?: string;
  notes?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  
  // Dashboard preferences
  defaultDashboard: string;
  dashboardLayout: Record<string, any>;
  
  // Calendar preferences
  defaultCalendarView: 'day' | 'week' | 'month';
  weekStartsOn: 'sunday' | 'monday';
  showWeekends: boolean;
  
  // Table preferences
  defaultPageSize: number;
  compactMode: boolean;
  
  // Shortcuts and hotkeys
  keyboardShortcuts: boolean;
  customShortcuts: Record<string, string>;
}

export interface UserSecuritySettings {
  twoFactorEnabled: boolean;
  passwordLastChanged?: string;
  mustChangePassword: boolean;
  
  // Login restrictions
  allowedIpAddresses?: string[];
  loginHours?: {
    start: string;
    end: string;
    daysOfWeek: number[];
  };
  
  // Session management
  maxConcurrentSessions: number;
  sessionTimeoutMinutes: number;
  
  // Device management
  trustedDevices: TrustedDevice[];
}

export interface TrustedDevice {
  id: string;
  deviceName: string;
  deviceType: 'desktop' | 'tablet' | 'mobile';
  browser: string;
  os: string;
  ipAddress: string;
  location?: string;
  addedAt: string;
  lastUsedAt: string;
  isActive: boolean;
}

export interface UserNotificationSettings {
  email: {
    enabled: boolean;
    appointmentReminders: boolean;
    taskAssignments: boolean;
    systemUpdates: boolean;
    securityAlerts: boolean;
  };
  
  sms: {
    enabled: boolean;
    urgentAlerts: boolean;
    appointmentReminders: boolean;
  };
  
  push: {
    enabled: boolean;
    newMessages: boolean;
    appointmentChanges: boolean;
    taskReminders: boolean;
  };
  
  inApp: {
    enabled: boolean;
    showBadges: boolean;
    soundEnabled: boolean;
    popupNotifications: boolean;
  };
}

// API and webhook settings
export interface ApiSettings {
  enabled: boolean;
  keys: ApiKey[];
  webhooks: WebhookEndpoint[];
  rateLimits: RateLimit[];
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  createdBy: string;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string;
  createdAt: string;
  lastTriggeredAt?: string;
  failureCount: number;
}

export interface RateLimit {
  endpoint: string;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  isActive: boolean;
}

// Backup and export settings
export interface BackupSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // HH:MM format
  includePHI: boolean;
  encryptionEnabled: boolean;
  retentionDays: number;
  storageLocation: 'local' | 'cloud';
  notifyOnComplete: boolean;
  notifyOnFailure: boolean;
}

export interface ExportSettings {
  allowDataExport: boolean;
  allowBulkExport: boolean;
  requireApproval: boolean;
  approverIds: string[];
  logAllExports: boolean;
  maxRecordsPerExport: number;
  allowedFormats: ('csv' | 'xlsx' | 'pdf' | 'json' | 'xml')[];
}