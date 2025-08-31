import { z } from 'zod';
import { BaseEntity, AppointmentStatus, EncryptedField } from '@/types';

// Zod schemas
export const CreateAppointmentSchema = z.object({
  patientId: z.string().min(1),
  providerId: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  appointmentType: z.string().min(1).max(100),
  reason: z.string().min(1).max(500),
  notes: z.string().max(2000).optional(),
  isUrgent: z.boolean().default(false),
  reminderEnabled: z.boolean().default(true),
  telehealth: z.boolean().default(false),
  teleheathLink: z.string().url().optional()
});

export const UpdateAppointmentSchema = z.object({
  patientId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  appointmentType: z.string().min(1).max(100).optional(),
  reason: z.string().min(1).max(500).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  isUrgent: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  telehealth: z.boolean().optional(),
  teleheathLink: z.string().url().optional()
});

export const AppointmentSearchSchema = z.object({
  patientId: z.string().optional(),
  providerId: z.string().optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  appointmentType: z.string().optional(),
  isUrgent: z.boolean().optional(),
  telehealth: z.boolean().optional()
});

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;
export type AppointmentSearchInput = z.infer<typeof AppointmentSearchSchema>;

export interface Appointment extends BaseEntity {
  // PK: TENANT#{clinicId}
  // SK: APPOINTMENT#{appointmentId}
  // GSI1PK: ENTITY#APPOINTMENT
  // GSI1SK: {clinicId}#{appointmentId}
  // GSI2PK: PATIENT#{patientId}
  // GSI2SK: APPOINTMENT#{startTime}
  // GSI3PK: PROVIDER#{providerId}
  // GSI3SK: {startTime}#{appointmentId}
  // GSI4PK: STATUS#{status}
  // GSI4SK: {clinicId}#{startTime}
  
  appointmentId: string;
  patientId: string;
  providerId: string;
  
  // Scheduling
  startTime: string; // ISO datetime
  endTime: string;   // ISO datetime
  duration: number;  // minutes (computed)
  
  // Appointment details
  appointmentType: string; // 'consultation', 'follow-up', 'procedure', etc.
  reason: EncryptedField;  // PHI - reason for visit
  status: AppointmentStatus;
  
  // Provider and location
  providerName: string; // Denormalized for quick access
  location: {
    type: 'in-person' | 'telehealth';
    room?: string;
    address?: string;
    teleheathLink?: string;
  };
  
  // Patient information (denormalized for calendar display)
  patientName: EncryptedField;
  patientPhone: EncryptedField;
  patientEmail?: EncryptedField;
  
  // Administrative
  notes?: EncryptedField; // Administrative notes
  isUrgent: boolean;
  isRecurring: boolean;
  recurringPattern?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: string;
    occurrences?: number;
  };
  
  // External system integration
  externalIds: {
    googleCalendarEventId?: string;
    syncedAt?: string;
  };
  
  // Reminders
  reminders: {
    enabled: boolean;
    sentAt?: string[];
    smsEnabled: boolean;
    emailEnabled: boolean;
    reminderTimes: number[]; // hours before appointment
  };
  
  // Financial
  estimatedCost?: number;
  insuranceCovered?: boolean;
  copay?: number;
  
  // Status tracking
  statusHistory: {
    status: AppointmentStatus;
    changedAt: string;
    changedBy: string;
    reason?: string;
  }[];
  
  // Completion details
  completedAt?: string;
  completedBy?: string;
  noShowReason?: string;
  cancellationReason?: string;
  cancellationFee?: number;
  
  // Related records
  soapNoteId?: string;
  invoiceId?: string;
  
  // Search and filtering helpers
  dateSlot: string;     // YYYY-MM-DD for daily queries
  timeSlot: string;     // HH:mm for time-based queries
  weekSlot: string;     // YYYY-WW for weekly views
  monthSlot: string;    // YYYY-MM for monthly views
}

// Database key generation helpers
export class AppointmentKeys {
  static primary(clinicId: string, appointmentId: string) {
    return {
      PK: `TENANT#${clinicId}`,
      SK: `APPOINTMENT#${appointmentId}`
    };
  }
  
  static gsi1(clinicId: string, appointmentId: string) {
    return {
      GSI1PK: 'ENTITY#APPOINTMENT',
      GSI1SK: `${clinicId}#${appointmentId}`
    };
  }
  
  static byPatient(patientId: string, startTime: string) {
    return {
      GSI2PK: `PATIENT#${patientId}`,
      GSI2SK: `APPOINTMENT#${startTime}`
    };
  }
  
  static byProvider(providerId: string, startTime: string, appointmentId: string) {
    return {
      GSI3PK: `PROVIDER#${providerId}`,
      GSI3SK: `${startTime}#${appointmentId}`
    };
  }
  
  static byStatus(status: AppointmentStatus, clinicId: string, startTime: string) {
    return {
      GSI4PK: `STATUS#${status}`,
      GSI4SK: `${clinicId}#${startTime}`
    };
  }
  
  static byDate(clinicId: string, date: string) {
    return {
      GSI5PK: `DATE#${date}`,
      GSI5SK: `${clinicId}#APPOINTMENT`
    };
  }
  
  static forCreation(
    clinicId: string, 
    appointmentId: string, 
    patientId: string, 
    providerId: string, 
    startTime: string, 
    status: AppointmentStatus
  ) {
    const dateSlot = startTime.split('T')[0]; // Extract YYYY-MM-DD
    return {
      ...this.primary(clinicId, appointmentId),
      ...this.gsi1(clinicId, appointmentId),
      ...this.byPatient(patientId, startTime),
      ...this.byProvider(providerId, startTime, appointmentId),
      ...this.byStatus(status, clinicId, startTime),
      GSI5PK: `DATE#${dateSlot}`,
      GSI5SK: `${clinicId}#APPOINTMENT`
    };
  }
}

// Helper functions
export function generateTimeSlots(startTime: string, endTime: string): {
  dateSlot: string;
  timeSlot: string;
  weekSlot: string;
  monthSlot: string;
} {
  const start = new Date(startTime);
  const dateSlot = start.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeSlot = start.toTimeString().slice(0, 5); // HH:mm
  
  // Get ISO week number
  const yearStart = new Date(start.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((((start.getTime() - yearStart.getTime()) / 86400000) + yearStart.getDay() + 1) / 7);
  const weekSlot = `${start.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  
  const monthSlot = dateSlot.slice(0, 7); // YYYY-MM
  
  return { dateSlot, timeSlot, weekSlot, monthSlot };
}

export function calculateDuration(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return Math.floor((end.getTime() - start.getTime()) / 60000); // minutes
}

export function isAppointmentConflict(
  existing: { startTime: string; endTime: string },
  proposed: { startTime: string; endTime: string }
): boolean {
  const existingStart = new Date(existing.startTime);
  const existingEnd = new Date(existing.endTime);
  const proposedStart = new Date(proposed.startTime);
  const proposedEnd = new Date(proposed.endTime);
  
  return (proposedStart < existingEnd && proposedEnd > existingStart);
}

// Default reminder settings
export const defaultReminders = {
  enabled: true,
  smsEnabled: true,
  emailEnabled: false,
  reminderTimes: [24, 2] // 24 hours and 2 hours before
};

// Status transition rules
export const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: [], // Cannot transition from completed
  CANCELLED: ['SCHEDULED'], // Can reschedule
  NO_SHOW: ['SCHEDULED'] // Can reschedule
};

export { };