import { z } from 'zod';
import { BaseEntity, EncryptedField } from '@/types';

// Zod schemas for validation
export const ClinicSettingsSchema = z.object({
  timezone: z.string().default('America/New_York'),
  workingHours: z.object({
    monday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }),
    tuesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }),
    wednesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }),
    thursday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }),
    friday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }),
    saturday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }),
    sunday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() })
  }),
  appointmentDuration: z.number().min(15).max(240).default(30),
  bookingAdvance: z.number().min(1).max(365).default(30), // days
  autoConfirmBookings: z.boolean().default(false),
  requirePatientPhone: z.boolean().default(true),
  requirePatientEmail: z.boolean().default(false)
});

export const CreateClinicSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  address: z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    state: z.string().length(2),
    zipCode: z.string().min(5).max(10),
    country: z.string().default('US')
  }),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  email: z.string().email(),
  website: z.string().url().optional(),
  npi: z.string().length(10).regex(/^\d{10}$/),
  taxId: z.string().min(9).max(11).regex(/^\d{2}-?\d{7}$/),
  settings: ClinicSettingsSchema.optional()
});

export const UpdateClinicSchema = CreateClinicSchema.partial().omit({ slug: true });

export type ClinicSettings = z.infer<typeof ClinicSettingsSchema>;
export type CreateClinicInput = z.infer<typeof CreateClinicSchema>;
export type UpdateClinicInput = z.infer<typeof UpdateClinicSchema>;

export interface Clinic extends BaseEntity {
  // PK: TENANT#{clinicId}
  // SK: CLINIC
  // GSI1PK: ENTITY#CLINIC
  // GSI1SK: {clinicId}
  // GSI5PK: SLUG#{slug}
  // GSI5SK: CLINIC
  
  clinicId: string;
  name: string;
  slug: string;
  description?: string;
  
  // Contact information
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  phone: string;
  email: string;
  website?: string;
  
  // Professional identifiers (PHI - encrypted)
  npi: EncryptedField;
  taxId: EncryptedField;
  
  // Business settings
  settings: ClinicSettings;
  
  // Subscription info
  subscriptionId?: string;
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  
  // Feature flags
  features: {
    telehealth: boolean;
    ePrescribing: boolean;
    claimsProcessing: boolean;
    patientPortal: boolean;
    googleCalendar: boolean;
    smsReminders: boolean;
    emailReminders: boolean;
  };
  
  // Usage metrics (for cost monitoring)
  usage: {
    patients: number;
    appointments: number;
    notes: number;
    invoices: number;
    storage: number; // in bytes
  };
  
  // Compliance
  hipaaSignedAt?: string;
  baaSigned?: boolean;
  
  // Status
  isActive: boolean;
  verifiedAt?: string;
  suspendedAt?: string;
  suspensionReason?: string;
}

// Database key generation helpers
export class ClinicKeys {
  static primary(clinicId: string) {
    return {
      PK: `TENANT#${clinicId}`,
      SK: 'CLINIC'
    };
  }
  
  static gsi1() {
    return {
      GSI1PK: 'ENTITY#CLINIC'
    };
  }
  
  static bySlug(slug: string) {
    return {
      GSI5PK: `SLUG#${slug}`,
      GSI5SK: 'CLINIC'
    };
  }
  
  static forCreation(clinicId: string, slug: string) {
    return {
      ...this.primary(clinicId),
      ...this.gsi1(),
      GSI1SK: clinicId,
      ...this.bySlug(slug)
    };
  }
}

// Default clinic settings
export const defaultClinicSettings: ClinicSettings = {
  timezone: 'America/New_York',
  workingHours: {
    monday: { start: '09:00', end: '17:00', enabled: true },
    tuesday: { start: '09:00', end: '17:00', enabled: true },
    wednesday: { start: '09:00', end: '17:00', enabled: true },
    thursday: { start: '09:00', end: '17:00', enabled: true },
    friday: { start: '09:00', end: '17:00', enabled: true },
    saturday: { start: '09:00', end: '13:00', enabled: false },
    sunday: { start: '09:00', end: '13:00', enabled: false }
  },
  appointmentDuration: 30,
  bookingAdvance: 30,
  autoConfirmBookings: false,
  requirePatientPhone: true,
  requirePatientEmail: false
};

// Default feature flags
export const defaultFeatures = {
  telehealth: false,
  ePrescribing: false,
  claimsProcessing: true,
  patientPortal: true,
  googleCalendar: true,
  smsReminders: true,
  emailReminders: true
};

export { };