import { z } from 'zod';
import { BaseEntity, EncryptedField } from '@/types';

// Zod schemas
export const PatientContactSchema = z.object({
  street: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().length(2),
  zipCode: z.string().min(5).max(10),
  country: z.string().default('US')
});

export const PatientInsuranceSchema = z.object({
  primary: z.object({
    company: z.string().min(1).max(200),
    memberId: z.string().min(1).max(50),
    groupNumber: z.string().max(50).optional(),
    planName: z.string().max(100).optional(),
    copay: z.number().min(0).optional(),
    deductible: z.number().min(0).optional()
  }).optional(),
  secondary: z.object({
    company: z.string().min(1).max(200),
    memberId: z.string().min(1).max(50),
    groupNumber: z.string().max(50).optional(),
    planName: z.string().max(100).optional()
  }).optional()
});

export const CreatePatientSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['M', 'F', 'O', 'U']), // Male, Female, Other, Unknown
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/).optional(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  email: z.string().email().optional(),
  address: PatientContactSchema,
  emergencyContact: z.object({
    name: z.string().min(1).max(100),
    relationship: z.string().min(1).max(50),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/)
  }).optional(),
  insurance: PatientInsuranceSchema.optional(),
  preferredLanguage: z.string().max(10).default('en'),
  notes: z.string().max(2000).optional()
});

export const UpdatePatientSchema = CreatePatientSchema.partial();

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;

export interface Patient extends BaseEntity {
  // PK: TENANT#{clinicId}
  // SK: PATIENT#{patientId}
  // GSI1PK: ENTITY#PATIENT
  // GSI1SK: {clinicId}#{patientId}
  // GSI2PK: PATIENT#{patientId}
  // GSI2SK: PROFILE
  // GSI5PK: EMAIL#{email}
  // GSI5SK: PATIENT (if email provided)
  
  patientId: string;
  
  // Basic demographics (PHI - encrypted)
  firstName: EncryptedField;
  lastName: EncryptedField;
  fullName: EncryptedField; // computed field for search
  dateOfBirth: EncryptedField;
  gender: 'M' | 'F' | 'O' | 'U';
  ssn?: EncryptedField;
  
  // Contact information (PHI - encrypted)
  phone: EncryptedField;
  email?: EncryptedField;
  address: {
    street: EncryptedField;
    city: EncryptedField;
    state: string; // Not encrypted for filtering
    zipCode: EncryptedField;
    country: string;
  };
  
  // Emergency contact (PHI - encrypted)
  emergencyContact?: {
    name: EncryptedField;
    relationship: EncryptedField;
    phone: EncryptedField;
  };
  
  // Insurance information (PHI - encrypted)
  insurance?: {
    primary?: {
      company: EncryptedField;
      memberId: EncryptedField;
      groupNumber?: EncryptedField;
      planName?: EncryptedField;
      copay?: number;
      deductible?: number;
    };
    secondary?: {
      company: EncryptedField;
      memberId: EncryptedField;
      groupNumber?: EncryptedField;
      planName?: EncryptedField;
    };
  };
  
  // Medical history summary (non-encrypted)
  allergies: {
    allergyId: string;
    allergen: string;
    reaction: string;
    severity: 'mild' | 'moderate' | 'severe';
    notes?: string;
    onsetDate?: string;
  }[];
  
  medications: {
    medicationId: string;
    name: string;
    dosage: string;
    frequency: string;
    prescribedBy: string;
    startDate: string;
    endDate?: string;
    notes?: string;
  }[];
  
  conditions: {
    conditionId: string;
    name: string;
    icd10Code?: string;
    diagnosedDate: string;
    status: 'active' | 'resolved' | 'chronic';
    notes?: string;
  }[];
  
  // Patient preferences
  preferredLanguage: string;
  communicationPreferences: {
    sms: boolean;
    email: boolean;
    phone: boolean;
    reminderTime: number; // hours before appointment
  };
  
  // Portal access
  portalAccess: {
    enabled: boolean;
    lastLoginAt?: string;
    magicLinkSentAt?: string;
    magicLinkExpiresAt?: string;
  };
  
  // Appointment history stats (for quick access)
  stats: {
    totalAppointments: number;
    completedAppointments: number;
    noShowCount: number;
    cancelledCount: number;
    lastAppointmentDate?: string;
    nextAppointmentDate?: string;
  };
  
  // Financial summary
  financial: {
    outstandingBalance: number;
    totalPaid: number;
    totalBilled: number;
    lastPaymentDate?: string;
  };
  
  // Administrative
  isActive: boolean;
  notes?: string; // Administrative notes, not medical
  tags: string[]; // For organization
  referredBy?: string;
  
  // Search and indexing helpers (encrypted for privacy)
  searchTokens: EncryptedField; // Tokenized for search without revealing PHI
}

// Database key generation helpers
export class PatientKeys {
  static primary(clinicId: string, patientId: string) {
    return {
      PK: `TENANT#${clinicId}`,
      SK: `PATIENT#${patientId}`
    };
  }
  
  static gsi1(clinicId: string, patientId: string) {
    return {
      GSI1PK: 'ENTITY#PATIENT',
      GSI1SK: `${clinicId}#${patientId}`
    };
  }
  
  static gsi2Profile(patientId: string) {
    return {
      GSI2PK: `PATIENT#${patientId}`,
      GSI2SK: 'PROFILE'
    };
  }
  
  static byEmail(email?: string) {
    if (!email) return {};
    return {
      GSI5PK: `EMAIL#${email.toLowerCase()}`,
      GSI5SK: 'PATIENT'
    };
  }
  
  static byState(clinicId: string, state: string) {
    return {
      GSI4PK: `STATE#${state}`,
      GSI4SK: `${clinicId}#PATIENT`
    };
  }
  
  static forCreation(clinicId: string, patientId: string, state: string, email?: string) {
    return {
      ...this.primary(clinicId, patientId),
      ...this.gsi1(clinicId, patientId),
      ...this.gsi2Profile(patientId),
      ...this.byEmail(email),
      GSI4PK: `STATE#${state}`,
      GSI4SK: `${clinicId}#PATIENT`
    };
  }
}

// Default values
export const defaultPatientStats = {
  totalAppointments: 0,
  completedAppointments: 0,
  noShowCount: 0,
  cancelledCount: 0
};

export const defaultFinancialSummary = {
  outstandingBalance: 0,
  totalPaid: 0,
  totalBilled: 0
};

export const defaultCommunicationPreferences = {
  sms: true,
  email: false,
  phone: false,
  reminderTime: 24 // 24 hours before
};

export const defaultPortalAccess = {
  enabled: true
};

// Helper function to generate search tokens (for encrypted search)
export function generatePatientSearchTokens(patient: {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}): string {
  const tokens = [
    patient.firstName.toLowerCase(),
    patient.lastName.toLowerCase(),
    `${patient.firstName} ${patient.lastName}`.toLowerCase(),
    patient.phone.replace(/\D/g, ''), // digits only
    patient.email?.toLowerCase()
  ].filter(Boolean);
  
  return tokens.join(' ');
}

export { };