import { BaseEntity } from './common';

export interface Appointment extends BaseEntity {
  appointmentId: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  
  // Scheduling
  startTime: string;
  endTime: string;
  duration: number; // in minutes
  timeZone: string;
  
  // Appointment details
  type: AppointmentType;
  status: AppointmentStatus;
  priority: AppointmentPriority;
  title?: string;
  description?: string;
  location?: AppointmentLocation;
  
  // Medical information
  reasonForVisit: string;
  chiefComplaint?: string;
  visitType: VisitType;
  
  // Recurring appointment info
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  parentAppointmentId?: string;
  
  // Check-in/check-out
  checkedInAt?: string;
  checkedOutAt?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  actualDuration?: number;
  
  // Cancellation/rescheduling
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  rescheduledFrom?: string;
  rescheduledTo?: string;
  rescheduledReason?: string;
  
  // Notifications and reminders
  remindersSent: ReminderRecord[];
  patientNotifications: NotificationPreference;
  
  // Follow-up
  followUpRequired?: boolean;
  followUpInstructions?: string;
  
  // Billing
  billableServices?: BillableService[];
  copayAmount?: number;
  copayCollected?: boolean;
  
  // Notes and attachments
  notes?: string;
  attachments?: string[];
  
  // Metadata
  tags?: string[];
  customFields?: Record<string, any>;
}

export type AppointmentType = 
  | 'consultation'
  | 'follow-up'
  | 'routine-checkup'
  | 'procedure'
  | 'surgery'
  | 'telehealth'
  | 'urgent-care'
  | 'emergency'
  | 'screening'
  | 'vaccination'
  | 'lab-results'
  | 'other';

export type AppointmentStatus = 
  | 'scheduled'
  | 'confirmed'
  | 'checked-in'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'no-show'
  | 'rescheduled';

export type AppointmentPriority = 'low' | 'normal' | 'high' | 'urgent';

export type VisitType = 'new-patient' | 'established-patient' | 'consultation' | 'follow-up' | 'urgent';

export interface AppointmentLocation {
  type: 'in-person' | 'telehealth' | 'home-visit' | 'other';
  room?: string;
  building?: string;
  address?: string;
  meetingLink?: string;
  meetingId?: string;
  instructions?: string;
}

export interface RecurrencePattern {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // Every N days/weeks/months/years
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc.
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: string;
  occurrences?: number;
  excludeDates?: string[];
}

export interface ReminderRecord {
  type: 'email' | 'sms' | 'phone' | 'push';
  sentAt: string;
  status: 'sent' | 'delivered' | 'failed';
  scheduledFor: string;
}

export interface NotificationPreference {
  email: boolean;
  sms: boolean;
  phone: boolean;
  push: boolean;
  reminderTiming: number[]; // Hours before appointment
}

export interface BillableService {
  cptCode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers?: string[];
}

// Calendar view types
export interface CalendarEvent extends Appointment {
  allDay?: boolean;
  resource?: any;
}

export interface CalendarSlot {
  start: Date;
  end: Date;
  available: boolean;
  appointmentId?: string;
  blocked?: boolean;
  blockReason?: string;
}

export interface ProviderSchedule {
  providerId: string;
  providerName: string;
  workingHours: WorkingHours[];
  blockedSlots: BlockedSlot[];
  appointments: Appointment[];
}

export interface WorkingHours {
  dayOfWeek: number; // 0 = Sunday
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  isAvailable: boolean;
  lunchBreak?: {
    startTime: string;
    endTime: string;
  };
}

export interface BlockedSlot {
  id: string;
  startTime: string;
  endTime: string;
  reason: string;
  type: 'personal' | 'training' | 'meeting' | 'holiday' | 'maintenance' | 'other';
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
}

// Appointment creation/update types
export interface CreateAppointmentRequest {
  patientId: string;
  providerId: string;
  startTime: string;
  duration: number;
  type: AppointmentType;
  reasonForVisit: string;
  visitType: VisitType;
  priority?: AppointmentPriority;
  location?: AppointmentLocation;
  isRecurring?: boolean;
  recurrencePattern?: RecurrencePattern;
  notes?: string;
  notificationPreferences?: NotificationPreference;
}

export interface UpdateAppointmentRequest extends Partial<CreateAppointmentRequest> {
  appointmentId: string;
  reason?: string; // Reason for update
}

export interface RescheduleAppointmentRequest {
  appointmentId: string;
  newStartTime: string;
  newDuration?: number;
  reason: string;
  notifyPatient: boolean;
}

export interface CancelAppointmentRequest {
  appointmentId: string;
  reason: string;
  refundAmount?: number;
  notifyPatient: boolean;
}

// Search and filter types
export interface AppointmentFilters {
  dateFrom?: string;
  dateTo?: string;
  providerId?: string;
  patientId?: string;
  status?: AppointmentStatus[];
  type?: AppointmentType[];
  priority?: AppointmentPriority[];
  location?: string;
  isRecurring?: boolean;
  tags?: string[];
}

export interface AppointmentSearchResult {
  appointmentId: string;
  patientName: string;
  providerName: string;
  startTime: string;
  type: AppointmentType;
  status: AppointmentStatus;
  reasonForVisit: string;
  relevanceScore: number;
}

// Statistics and analytics
export interface AppointmentStats {
  total: number;
  byStatus: Record<AppointmentStatus, number>;
  byType: Record<AppointmentType, number>;
  completionRate: number;
  averageDuration: number;
  noShowRate: number;
  cancellationRate: number;
  revenue: {
    total: number;
    collected: number;
    pending: number;
  };
}

export interface ProviderStats {
  providerId: string;
  providerName: string;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShows: number;
  averageRating?: number;
  totalRevenue: number;
  utilizationRate: number; // Percentage of available slots filled
}

// Waitlist management
export interface WaitlistEntry {
  id: string;
  patientId: string;
  patientName: string;
  preferredTimes: TimePreference[];
  reasonForVisit: string;
  priority: 'normal' | 'high' | 'urgent';
  createdAt: string;
  notificationPreferences: NotificationPreference;
  maxWaitDays?: number;
  notes?: string;
}

export interface TimePreference {
  dayOfWeek: number[];
  startTime: string;
  endTime: string;
  providerId?: string;
}

// Appointment conflicts
export interface AppointmentConflict {
  type: 'double-booking' | 'provider-unavailable' | 'outside-hours' | 'holiday' | 'blocked-time';
  message: string;
  conflictingAppointments?: Appointment[];
  suggestedTimes?: string[];
}