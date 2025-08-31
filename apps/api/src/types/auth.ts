// Extended type definitions for role-based permissions
import { AuthenticatedRequest } from '@/types';

declare module '@/types' {
  interface AuthenticatedRequest {
    roleContext?: {
      accessLevel: 'system' | 'clinic' | 'user';
      isSystemAdmin: boolean;
      isClinicAdmin: boolean;
      isProvider: boolean;
      maxLimit: number;
      timeRestriction: { maxDays: number; allowHistorical: boolean };
    };
    crossTenantAccess?: boolean;
    exportLimits?: {
      maxRecords: number;
      allowPHI: boolean;
      formatRestrictions: string[];
    };
  }
}

export interface RolePermissions {
  patients: {
    read: boolean;
    write: boolean;
    delete: boolean;
    export: boolean;
  };
  appointments: {
    read: boolean;
    write: boolean;
    delete: boolean;
    manage: boolean;
  };
  notes: {
    read: boolean;
    write: boolean;
    delete: boolean;
  };
  invoices: {
    read: boolean;
    write: boolean;
    delete: boolean;
  };
  dashboard: {
    read: boolean;
    platform: boolean;
  };
  analytics: {
    read: boolean;
    export: boolean;
    platform: boolean;
  };
  settings: {
    read: boolean;
    write: boolean;
    system: boolean;
  };
  admin: {
    access: boolean;
    system: boolean;
  };
}

export interface RoleBasedEndpoint {
  endpoint: string;
  description: string;
  systemAdminData: string;
  clinicAdminData: string;
  staffDoctorData: string;
  restrictions: string[];
  hipaaCompliant: boolean;
}

export const API_ENDPOINTS: RoleBasedEndpoint[] = [
  {
    endpoint: '/api/v1/dashboard',
    description: 'Role-adaptive dashboard data',
    systemAdminData: 'Platform-wide metrics, system health, clinic overview',
    clinicAdminData: 'Clinic-specific KPIs, staff performance, financial metrics',
    staffDoctorData: 'Personal performance, patient statistics, appointments',
    restrictions: ['Time-based access limits', 'Data export restrictions'],
    hipaaCompliant: true
  },
  {
    endpoint: '/api/v1/analytics',
    description: 'Role-filtered analytics data',
    systemAdminData: 'Platform analytics, conversion rates, system performance',
    clinicAdminData: 'Clinic usage, financial analytics, staff productivity',
    staffDoctorData: 'Personal metrics, patient analytics (aggregated)',
    restrictions: ['PHI exclusion for system admins', 'Export limits by role'],
    hipaaCompliant: true
  },
  {
    endpoint: '/api/v1/patients',
    description: 'Patient management with PHI protection',
    systemAdminData: 'Not accessible (HIPAA compliance)',
    clinicAdminData: 'Full patient records, demographics, medical history',
    staffDoctorData: 'Assigned patients, treatment records, appointments',
    restrictions: ['Cross-tenant access denied', 'PHI access logging'],
    hipaaCompliant: true
  },
  {
    endpoint: '/api/v1/settings',
    description: 'Role-adaptive configuration options',
    systemAdminData: 'System settings, feature flags, platform configuration',
    clinicAdminData: 'Clinic settings, user management, integration settings',
    staffDoctorData: 'Personal preferences, notification settings',
    restrictions: ['System settings require SuperAdmin', 'Audit logging'],
    hipaaCompliant: true
  }
];

export const ROLE_BASED_PERMISSIONS: Record<string, RolePermissions> = {
  SystemAdmin: {
    patients: { read: false, write: false, delete: false, export: false }, // HIPAA compliance
    appointments: { read: true, write: false, delete: false, manage: true },
    notes: { read: false, write: false, delete: false }, // HIPAA compliance
    invoices: { read: true, write: false, delete: false },
    dashboard: { read: true, platform: true },
    analytics: { read: true, export: true, platform: true },
    settings: { read: true, write: true, system: true },
    admin: { access: true, system: true }
  },
  Admin: {
    patients: { read: true, write: true, delete: true, export: true },
    appointments: { read: true, write: true, delete: true, manage: true },
    notes: { read: true, write: true, delete: false },
    invoices: { read: true, write: true, delete: false },
    dashboard: { read: true, platform: false },
    analytics: { read: true, export: true, platform: false },
    settings: { read: true, write: true, system: false },
    admin: { access: true, system: false }
  },
  Doctor: {
    patients: { read: true, write: true, delete: false, export: false },
    appointments: { read: true, write: true, delete: false, manage: false },
    notes: { read: true, write: true, delete: false },
    invoices: { read: true, write: true, delete: false },
    dashboard: { read: true, platform: false },
    analytics: { read: true, export: false, platform: false },
    settings: { read: true, write: false, system: false },
    admin: { access: false, system: false }
  },
  Staff: {
    patients: { read: true, write: true, delete: false, export: false },
    appointments: { read: true, write: true, delete: false, manage: false },
    notes: { read: false, write: false, delete: false },
    invoices: { read: true, write: true, delete: false },
    dashboard: { read: true, platform: false },
    analytics: { read: true, export: false, platform: false },
    settings: { read: true, write: false, system: false },
    admin: { access: false, system: false }
  }
};

export { };