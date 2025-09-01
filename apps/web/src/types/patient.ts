import { BaseEntity, Address, PhoneNumber, EmergencyContact, Insurance, BloodType, Gender, MaritalStatus, Allergy, Medication, VitalSigns, FileAttachment } from './common';

export interface Patient extends BaseEntity {
  patientId: string;
  clinicId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  preferredName?: string;
  dateOfBirth: string;
  gender: Gender;
  maritalStatus: MaritalStatus;
  ssn?: string; // Encrypted
  
  // Contact information
  email?: string;
  phoneNumbers: PhoneNumber[];
  address: Address;
  emergencyContact: EmergencyContact;
  
  // Medical information
  bloodType?: BloodType;
  allergies: Allergy[];
  currentMedications: Medication[];
  medicalHistory: MedicalHistory[];
  
  // Insurance
  insurance?: Insurance;
  
  // Demographics
  ethnicity?: string;
  race?: string;
  language?: string;
  occupation?: string;
  
  // Care team
  primaryPhysician?: string;
  referringPhysician?: string;
  
  // Status and metadata
  status: 'active' | 'inactive' | 'deceased';
  isNewPatient: boolean;
  lastVisitDate?: string;
  nextAppointmentDate?: string;
  
  // Attachments and files
  profilePicture?: string;
  attachments: FileAttachment[];
  
  // Privacy and consent
  consentToTreat: boolean;
  consentToEmail: boolean;
  consentToSMS: boolean;
  hipaaAcknowledgment: boolean;
  
  // Notes
  notes?: string;
  tags?: string[];
}

export interface MedicalHistory {
  id: string;
  condition: string;
  diagnosedDate?: string;
  resolvedDate?: string;
  status: 'active' | 'resolved' | 'chronic';
  severity?: 'mild' | 'moderate' | 'severe';
  notes?: string;
  diagnosedBy?: string;
}

export interface PatientSummary {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  lastVisitDate?: string;
  nextAppointmentDate?: string;
  status: 'active' | 'inactive' | 'deceased';
  hasAlerts: boolean;
  profilePicture?: string;
}

export interface PatientSearchResult extends PatientSummary {
  email?: string;
  phoneNumber?: string;
  address?: {
    city: string;
    state: string;
  };
  relevanceScore: number;
}

export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  gender: Gender;
  ssn?: string;
  email?: string;
  phoneNumbers: PhoneNumber[];
  address: Address;
  emergencyContact: EmergencyContact;
  insurance?: Insurance;
  primaryPhysician?: string;
  consentToTreat: boolean;
  hipaaAcknowledgment: boolean;
  notes?: string;
}

export interface UpdatePatientRequest extends Partial<CreatePatientRequest> {
  patientId: string;
}

export interface PatientFilters {
  status?: 'active' | 'inactive' | 'deceased';
  gender?: Gender;
  ageRange?: {
    min: number;
    max: number;
  };
  hasAllergies?: boolean;
  hasInsurance?: boolean;
  primaryPhysician?: string;
  lastVisitDateRange?: {
    from: string;
    to: string;
  };
  tags?: string[];
}

export interface PatientStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
  averageAge: number;
  genderDistribution: {
    male: number;
    female: number;
    other: number;
  };
  insuranceStats: {
    insured: number;
    uninsured: number;
    pending: number;
  };
}

export interface PatientVisit extends BaseEntity {
  visitId: string;
  patientId: string;
  appointmentId?: string;
  visitDate: string;
  visitType: 'routine' | 'follow-up' | 'urgent' | 'emergency' | 'consultation';
  chiefComplaint?: string;
  diagnosis?: string[];
  treatmentPlan?: string;
  providerId: string;
  providerName: string;
  duration?: number; // in minutes
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  vitalSigns?: VitalSigns;
  notes?: string;
  followUpRequired?: boolean;
  followUpDate?: string;
  attachments: FileAttachment[];
}

export interface PatientAlert {
  id: string;
  patientId: string;
  type: 'allergy' | 'medication' | 'condition' | 'insurance' | 'contact' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface PatientCommunication {
  id: string;
  patientId: string;
  type: 'email' | 'sms' | 'phone' | 'in-person' | 'portal';
  direction: 'inbound' | 'outbound';
  subject?: string;
  content: string;
  sender: string;
  recipient: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: FileAttachment[];
}

// Form validation schemas
export interface PatientFormData {
  personalInfo: {
    firstName: string;
    lastName: string;
    middleName?: string;
    preferredName?: string;
    dateOfBirth: string;
    gender: Gender;
    maritalStatus: MaritalStatus;
    ssn?: string;
  };
  contactInfo: {
    email?: string;
    phoneNumbers: PhoneNumber[];
    address: Address;
    emergencyContact: EmergencyContact;
  };
  medicalInfo: {
    bloodType?: BloodType;
    allergies: Allergy[];
    currentMedications: Medication[];
    medicalHistory: MedicalHistory[];
  };
  insuranceInfo?: Insurance;
  preferences: {
    primaryPhysician?: string;
    language?: string;
    consentToEmail: boolean;
    consentToSMS: boolean;
  };
  legal: {
    consentToTreat: boolean;
    hipaaAcknowledgment: boolean;
  };
  notes?: string;
}

export interface PatientFormErrors {
  personalInfo?: Record<string, string>;
  contactInfo?: Record<string, string>;
  medicalInfo?: Record<string, string>;
  insuranceInfo?: Record<string, string>;
  preferences?: Record<string, string>;
  legal?: Record<string, string>;
}

export type PatientFormStep = 'personal' | 'contact' | 'medical' | 'insurance' | 'preferences' | 'legal' | 'review';