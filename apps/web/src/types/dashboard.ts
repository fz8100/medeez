// Dashboard types for different user roles

export interface DashboardStats {
  patients: PatientStats;
  appointments: AppointmentStats;
  billing: BillingStats;
  notes: NoteStats;
  performance: PerformanceMetrics;
}

export interface PatientStats {
  total: number;
  active: number;
  newThisMonth: number;
  recentlyViewed: PatientSummary[];
  upcomingBirthdays: PatientBirthday[];
  alertsCount: number;
}

export interface PatientSummary {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  lastVisit?: string;
  nextAppointment?: string;
  alerts: number;
}

export interface PatientBirthday {
  patientId: string;
  firstName: string;
  lastName: string;
  birthday: string;
  age: number;
  daysUntil: number;
}

export interface AppointmentStats {
  today: {
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    noShows: number;
  };
  thisWeek: {
    total: number;
    scheduled: number;
    availability: number; // percentage of slots available
  };
  thisMonth: {
    total: number;
    revenue: number;
    averagePerDay: number;
  };
  upcoming: UpcomingAppointment[];
  recent: RecentAppointment[];
}

export interface UpcomingAppointment {
  appointmentId: string;
  patientName: string;
  startTime: string;
  type: string;
  status: string;
  isUrgent: boolean;
}

export interface RecentAppointment {
  appointmentId: string;
  patientName: string;
  completedAt: string;
  duration: number;
  type: string;
  hasNote: boolean;
}

export interface BillingStats {
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    lastMonth: number;
    percentChange: number;
  };
  outstanding: {
    total: number;
    current: number; // 0-30 days
    overdue: number; // 30+ days
    count: number;
  };
  recent: {
    payments: RecentPayment[];
    invoices: RecentInvoice[];
  };
  insurance: {
    pendingClaims: number;
    deniedClaims: number;
    averagePaymentTime: number;
  };
}

export interface RecentPayment {
  paymentId: string;
  patientName: string;
  amount: number;
  paymentDate: string;
  method: string;
}

export interface RecentInvoice {
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  amount: number;
  status: string;
  dueDate: string;
}

export interface NoteStats {
  total: number;
  drafts: number;
  pending: number;
  signed: number;
  averageCompletionTime: number;
  recentNotes: RecentNote[];
}

export interface RecentNote {
  noteId: string;
  patientName: string;
  noteType: string;
  createdAt: string;
  status: string;
  isUrgent: boolean;
}

export interface PerformanceMetrics {
  productivity: {
    patientsPerDay: number;
    revenuePerPatient: number;
    utilizationRate: number; // percentage of available time slots used
    averageAppointmentDuration: number;
  };
  quality: {
    patientSatisfaction?: number;
    noteCompletionRate: number;
    onTimePerformance: number;
    noShowRate: number;
  };
  efficiency: {
    averageWaitTime: number;
    documentationTime: number;
    followUpCompliance: number;
  };
}

// Quick actions for dashboard
export interface QuickAction {
  id: string;
  title: string;
  description?: string;
  icon: string;
  action: string;
  href?: string;
  requiresRole?: string[];
  badge?: {
    text: string;
    variant: 'default' | 'primary' | 'warning' | 'error' | 'success';
  };
}

// Dashboard widgets
export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  size: 'sm' | 'md' | 'lg' | 'xl';
  position: { x: number; y: number };
  config: WidgetConfig;
  isVisible: boolean;
  allowedRoles: string[];
}

export type WidgetType = 
  | 'patient-stats'
  | 'appointment-calendar'
  | 'recent-notes'
  | 'billing-summary'
  | 'quick-actions'
  | 'alerts'
  | 'performance-metrics'
  | 'schedule-overview'
  | 'patient-birthdays'
  | 'task-list'
  | 'announcements';

export interface WidgetConfig {
  refreshInterval?: number;
  showLegend?: boolean;
  dateRange?: 'today' | 'week' | 'month' | 'quarter' | 'year';
  maxItems?: number;
  showFilters?: boolean;
  customFilters?: Record<string, any>;
}

// Alerts and notifications
export interface DashboardAlert {
  id: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  actionRequired: boolean;
  actionUrl?: string;
  actionText?: string;
  expiresAt?: string;
  relatedEntity?: {
    type: 'patient' | 'appointment' | 'invoice' | 'note';
    id: string;
    name: string;
  };
}

export type AlertType = 
  | 'appointment-reminder'
  | 'overdue-payment'
  | 'insurance-expiry'
  | 'medication-refill'
  | 'lab-results'
  | 'patient-birthday'
  | 'system-maintenance'
  | 'security-alert'
  | 'compliance-reminder'
  | 'backup-status'
  | 'integration-error';

// Tasks and reminders
export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  assignedTo: string;
  assignedBy: string;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
  relatedEntity?: {
    type: 'patient' | 'appointment' | 'invoice' | 'note';
    id: string;
    name: string;
  };
  tags?: string[];
}

export type TaskType = 
  | 'follow-up-call'
  | 'insurance-verification'
  | 'lab-order'
  | 'referral-coordination'
  | 'prior-authorization'
  | 'billing-inquiry'
  | 'documentation'
  | 'patient-education'
  | 'medication-review'
  | 'other';

// Calendar events for dashboard
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'appointment' | 'break' | 'meeting' | 'personal' | 'holiday';
  status?: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled';
  patientId?: string;
  patientName?: string;
  color?: string;
  isAllDay?: boolean;
  location?: string;
  notes?: string;
}

// Activity feed
export interface ActivityItem {
  id: string;
  type: ActivityType;
  description: string;
  timestamp: string;
  actor: {
    id: string;
    name: string;
    role: string;
  };
  target?: {
    type: 'patient' | 'appointment' | 'invoice' | 'note' | 'user';
    id: string;
    name: string;
  };
  metadata?: Record<string, any>;
}

export type ActivityType = 
  | 'patient-created'
  | 'patient-updated'
  | 'appointment-scheduled'
  | 'appointment-completed'
  | 'appointment-cancelled'
  | 'note-created'
  | 'note-signed'
  | 'invoice-sent'
  | 'payment-received'
  | 'user-login'
  | 'user-logout'
  | 'system-backup'
  | 'settings-updated';

// Role-specific dashboard configurations
export interface DashboardConfig {
  role: string;
  defaultWidgets: DashboardWidget[];
  availableWidgets: WidgetType[];
  quickActions: QuickAction[];
  alertTypes: AlertType[];
  customization: {
    allowReorder: boolean;
    allowResize: boolean;
    allowAddRemove: boolean;
    maxWidgets: number;
  };
}

// Performance trending data
export interface TrendData {
  period: string;
  value: number;
  change?: number;
  changePercent?: number;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
    type?: 'line' | 'bar' | 'area';
  }>;
}

// Dashboard preferences
export interface DashboardPreferences {
  userId: string;
  layout: DashboardWidget[];
  theme: 'light' | 'dark' | 'auto';
  refreshInterval: number;
  showNotifications: boolean;
  compactMode: boolean;
  timeZone: string;
  dateFormat: string;
  defaultDateRange: 'today' | 'week' | 'month';
  customFilters: Record<string, any>;
}