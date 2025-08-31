import { z } from 'zod';
import { BaseEntity, UserRole, EncryptedField } from '@/types';

// Zod schemas
export const CreateUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: z.enum(['ADMIN', 'DOCTOR', 'STAFF']),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  title: z.string().max(100).optional(),
  license: z.string().max(50).optional(),
  deaNumber: z.string().max(20).optional()
});

export const UpdateUserSchema = CreateUserSchema.partial();

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export interface User extends BaseEntity {
  // PK: TENANT#{clinicId}
  // SK: USER#{userId}
  // GSI1PK: ENTITY#USER
  // GSI1SK: {clinicId}#{userId}
  // GSI5PK: EMAIL#{email}
  // GSI5SK: USER
  
  userId: string;
  cognitoUserId: string;
  
  // Personal information
  email: string;
  firstName: string;
  lastName: string;
  fullName: string; // computed field
  phone?: string;
  
  // Professional information
  role: UserRole;
  title?: string;
  
  // Medical credentials (PHI - encrypted)
  license?: EncryptedField;
  deaNumber?: EncryptedField;
  npi?: EncryptedField;
  
  // Avatar and branding
  avatarUrl?: string;
  signature?: string; // for notes and prescriptions
  
  // User preferences
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
  
  // Calendar integration
  calendarIntegration?: {
    googleCalendarId?: string;
    syncEnabled: boolean;
    lastSyncAt?: string;
    syncErrors?: string[];
  };
  
  // Access control
  permissions: string[];
  isActive: boolean;
  isTwoFactorEnabled: boolean;
  
  // Login tracking
  lastLoginAt?: string;
  lastLoginIp?: string;
  loginAttempts: number;
  lockedUntil?: string;
  
  // Onboarding
  onboardingCompleted: boolean;
  onboardingSteps: {
    profileSetup: boolean;
    clinicSetup: boolean;
    integrationSetup: boolean;
    firstPatient: boolean;
    firstAppointment: boolean;
  };
  
  // Audit fields
  invitedBy?: string;
  invitedAt?: string;
  activatedAt?: string;
  deactivatedAt?: string;
}

// Database key generation helpers
export class UserKeys {
  static primary(clinicId: string, userId: string) {
    return {
      PK: `TENANT#${clinicId}`,
      SK: `USER#${userId}`
    };
  }
  
  static gsi1(clinicId: string, userId: string) {
    return {
      GSI1PK: 'ENTITY#USER',
      GSI1SK: `${clinicId}#${userId}`
    };
  }
  
  static byEmail(email: string) {
    return {
      GSI5PK: `EMAIL#${email.toLowerCase()}`,
      GSI5SK: 'USER'
    };
  }
  
  static byRole(clinicId: string, role: UserRole) {
    return {
      GSI4PK: `ROLE#${role}`,
      GSI4SK: `${clinicId}#USER`
    };
  }
  
  static forCreation(clinicId: string, userId: string, email: string, role: UserRole) {
    return {
      ...this.primary(clinicId, userId),
      ...this.gsi1(clinicId, userId),
      ...this.byEmail(email),
      GSI4PK: `ROLE#${role}`,
      GSI4SK: `${clinicId}#USER`
    };
  }
}

// Default user preferences
export const defaultUserPreferences = {
  timezone: 'America/New_York',
  dateFormat: 'MM/dd/yyyy',
  timeFormat: '12h' as const,
  language: 'en',
  notifications: {
    email: true,
    sms: false,
    push: true,
    appointmentReminders: true,
    taskReminders: true,
    invoiceUpdates: true
  }
};

// Default onboarding steps
export const defaultOnboardingSteps = {
  profileSetup: false,
  clinicSetup: false,
  integrationSetup: false,
  firstPatient: false,
  firstAppointment: false
};

// Role-based permissions
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: [
    'users:create',
    'users:read',
    'users:update',
    'users:delete',
    'patients:create',
    'patients:read',
    'patients:update',
    'patients:delete',
    'appointments:create',
    'appointments:read',
    'appointments:update',
    'appointments:delete',
    'notes:create',
    'notes:read',
    'notes:update',
    'notes:delete',
    'invoices:create',
    'invoices:read',
    'invoices:update',
    'invoices:delete',
    'clinic:update',
    'integrations:manage',
    'reports:access',
    'audit:read'
  ],
  DOCTOR: [
    'patients:create',
    'patients:read',
    'patients:update',
    'appointments:create',
    'appointments:read',
    'appointments:update',
    'notes:create',
    'notes:read',
    'notes:update',
    'invoices:create',
    'invoices:read',
    'invoices:update',
    'reports:access'
  ],
  STAFF: [
    'patients:create',
    'patients:read',
    'patients:update',
    'appointments:create',
    'appointments:read',
    'appointments:update',
    'invoices:create',
    'invoices:read',
    'invoices:update'
  ]
};

export { };