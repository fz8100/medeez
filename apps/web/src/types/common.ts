// Common types used throughout the application

export type Status = 'active' | 'inactive' | 'pending' | 'archived';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface PhoneNumber {
  type: 'mobile' | 'home' | 'work' | 'fax';
  number: string;
  primary?: boolean;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phoneNumber: string;
  email?: string;
}

export interface Insurance {
  primary: {
    company: string;
    policyNumber: string;
    groupNumber?: string;
    subscriberId: string;
    relationship: 'self' | 'spouse' | 'child' | 'other';
  };
  secondary?: {
    company: string;
    policyNumber: string;
    groupNumber?: string;
    subscriberId: string;
    relationship: 'self' | 'spouse' | 'child' | 'other';
  };
}

export interface Pagination {
  nextToken?: string;
  hasMore: boolean;
  total?: number;
  limit: number;
}

export interface SearchFilters {
  query?: string;
  status?: Status;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: any;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FileAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  description?: string;
  tags?: string[];
  url?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userEmail: string;
  timestamp: string;
  changes?: Record<string, { from: any; to: any }>;
  ipAddress?: string;
  userAgent?: string;
}

// Form validation types
export interface ValidationError {
  field: string;
  message: string;
}

export interface FormState<T = any> {
  data: T;
  errors: ValidationError[];
  isSubmitting: boolean;
  isDirty: boolean;
  isValid: boolean;
}

// UI Component types
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
}

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, row: any) => React.ReactNode;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

// Medical specific types
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type Gender = 'male' | 'female' | 'other' | 'prefer-not-to-say';

export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'separated';

export interface Allergy {
  id: string;
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe';
  reaction: string;
  notes?: string;
  onsetDate?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  route: 'oral' | 'topical' | 'injection' | 'inhalation' | 'other';
  prescribedDate: string;
  prescribedBy: string;
  status: 'active' | 'discontinued' | 'completed';
  notes?: string;
}

export interface VitalSigns {
  systolicBP?: number;
  diastolicBP?: number;
  heartRate?: number;
  temperature?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  recordedAt: string;
  recordedBy: string;
  notes?: string;
}

// Notification types
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

// Theme and UI preferences
export type Theme = 'light' | 'dark' | 'system';

export interface UIPreferences {
  theme: Theme;
  sidebarCollapsed: boolean;
  defaultTablePageSize: number;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  field?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
}