/**
 * Test Data Factories for Medeez v2 API
 * HIPAA-compliant synthetic data generation for testing
 */

import { nanoid } from 'nanoid';
import { addDays, subDays, format } from 'date-fns';

// Base factory interface
interface FactoryOptions {
  overrides?: Record<string, any>;
  count?: number;
}

/**
 * HIPAA-Compliant Test User Factory
 * Generates synthetic user data that doesn't resemble real PHI
 */
export const createTestUser = (options: FactoryOptions = {}) => {
  const { overrides = {} } = options;
  
  const userId = `test-user-${nanoid(10)}`;
  
  return {
    userId,
    sub: userId,
    email: `testuser-${nanoid(6)}@test.example.com`,
    firstName: 'Test',
    lastName: `User${nanoid(3)}`,
    role: 'doctor',
    clinicId: `test-clinic-${nanoid(8)}`,
    permissions: [
      'patients:read',
      'patients:write',
      'appointments:read',
      'appointments:write',
      'notes:read',
      'notes:write',
      'invoices:read',
      'invoices:write'
    ],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

/**
 * HIPAA-Compliant Test Clinic Factory
 * Generates synthetic clinic data
 */
export const createTestClinic = (options: FactoryOptions = {}) => {
  const { overrides = {} } = options;
  
  const clinicId = `test-clinic-${nanoid(10)}`;
  
  return {
    clinicId,
    name: `Test Medical Clinic ${nanoid(4)}`,
    npi: '1234567890', // Test NPI number
    address: {
      street: `${Math.floor(Math.random() * 9999)} Test Medical Dr`,
      city: 'Test City',
      state: 'TS', // Test State
      zipCode: '12345',
      country: 'US'
    },
    phone: '+1-555-TEST-001',
    email: `clinic-${nanoid(6)}@test.example.com`,
    website: `https://test-clinic-${nanoid(4)}.example.com`,
    timezone: 'America/New_York',
    settings: {
      businessHours: {
        monday: { start: '09:00', end: '17:00', enabled: true },
        tuesday: { start: '09:00', end: '17:00', enabled: true },
        wednesday: { start: '09:00', end: '17:00', enabled: true },
        thursday: { start: '09:00', end: '17:00', enabled: true },
        friday: { start: '09:00', end: '17:00', enabled: true },
        saturday: { start: '09:00', end: '13:00', enabled: false },
        sunday: { start: '09:00', end: '13:00', enabled: false }
      },
      appointmentDuration: 30,
      enableReminders: true,
      reminderDays: 1
    },
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

/**
 * HIPAA-Compliant Test Patient Factory
 * Generates synthetic patient data - NO REAL PHI
 */
export const createTestPatient = (options: FactoryOptions = {}) => {
  const { overrides = {} } = options;
  
  const patientId = `test-patient-${nanoid(10)}`;
  const clinicId = overrides.clinicId || `test-clinic-${nanoid(8)}`;
  
  return {
    patientId,
    clinicId,
    firstName: `TestPatient${nanoid(3)}`,
    lastName: `LastName${nanoid(4)}`,
    dateOfBirth: '1990-01-01', // Fixed test date
    gender: 'other', // Neutral for testing
    phone: `+1-555-TEST-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    email: `testpatient-${nanoid(6)}@test.example.com`,
    address: {
      street: `${Math.floor(Math.random() * 9999)} Test Patient St`,
      city: 'Test City',
      state: 'TS',
      zipCode: '12345',
      country: 'US'
    },
    emergencyContact: {
      name: `TestContact${nanoid(3)}`,
      relationship: 'family',
      phone: `+1-555-EMER-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
    },
    insurance: {
      provider: 'Test Insurance Co',
      policyNumber: `TEST${nanoid(8)}`,
      groupNumber: `GRP${nanoid(6)}`
    },
    medicalHistory: {
      allergies: ['No known allergies'],
      medications: [],
      conditions: []
    },
    preferredLanguage: 'en',
    isActive: true,
    stats: {
      totalAppointments: 0,
      totalInvoices: 0,
      totalAmountDue: 0,
      lastVisit: null
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

/**
 * Test Appointment Factory
 */
export const createTestAppointment = (options: FactoryOptions = {}) => {
  const { overrides = {} } = options;
  
  const appointmentId = `test-appointment-${nanoid(10)}`;
  const tomorrow = addDays(new Date(), 1);
  
  return {
    appointmentId,
    clinicId: overrides.clinicId || `test-clinic-${nanoid(8)}`,
    patientId: overrides.patientId || `test-patient-${nanoid(8)}`,
    doctorId: overrides.doctorId || `test-doctor-${nanoid(8)}`,
    startTime: tomorrow.toISOString(),
    endTime: addDays(tomorrow, 0.5).toISOString(),
    type: 'consultation',
    status: 'scheduled',
    reason: 'Test consultation',
    notes: 'Test appointment notes',
    duration: 30,
    metadata: {
      source: 'test',
      testData: true
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

/**
 * Test SOAP Note Factory
 */
export const createTestNote = (options: FactoryOptions = {}) => {
  const { overrides = {} } = options;
  
  const noteId = `test-note-${nanoid(10)}`;
  
  return {
    noteId,
    clinicId: overrides.clinicId || `test-clinic-${nanoid(8)}`,
    patientId: overrides.patientId || `test-patient-${nanoid(8)}`,
    appointmentId: overrides.appointmentId || `test-appointment-${nanoid(8)}`,
    doctorId: overrides.doctorId || `test-doctor-${nanoid(8)}`,
    type: 'soap',
    template: 'general',
    content: {
      subjective: 'Test subjective content',
      objective: 'Test objective content',
      assessment: 'Test assessment content',
      plan: 'Test plan content'
    },
    status: 'draft',
    metadata: {
      version: 1,
      testData: true
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

/**
 * Test Invoice Factory
 */
export const createTestInvoice = (options: FactoryOptions = {}) => {
  const { overrides = {} } = options;
  
  const invoiceId = `test-invoice-${nanoid(10)}`;
  
  return {
    invoiceId,
    clinicId: overrides.clinicId || `test-clinic-${nanoid(8)}`,
    patientId: overrides.patientId || `test-patient-${nanoid(8)}`,
    appointmentId: overrides.appointmentId || `test-appointment-${nanoid(8)}`,
    invoiceNumber: `TEST-INV-${nanoid(6)}`,
    status: 'pending',
    items: [
      {
        description: 'Test consultation',
        quantity: 1,
        unitPrice: 100.00,
        total: 100.00,
        cptCode: '99213'
      }
    ],
    subtotal: 100.00,
    tax: 0.00,
    total: 100.00,
    dueDate: addDays(new Date(), 30).toISOString(),
    notes: 'Test invoice notes',
    metadata: {
      testData: true
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
};

/**
 * Test Audit Log Factory
 */
export const createTestAuditLog = (options: FactoryOptions = {}) => {
  const { overrides = {} } = options;
  
  return {
    logId: `test-audit-${nanoid(10)}`,
    clinicId: overrides.clinicId || `test-clinic-${nanoid(8)}`,
    userId: overrides.userId || `test-user-${nanoid(8)}`,
    action: 'test_action',
    resource: 'test_resource',
    resourceId: `test-resource-${nanoid(8)}`,
    details: {
      method: 'GET',
      endpoint: '/test/endpoint',
      userAgent: 'Test User Agent',
      ipAddress: '127.0.0.1'
    },
    timestamp: new Date().toISOString(),
    ...overrides
  };
};

/**
 * Create multiple test entities
 */
export const createMultiple = <T>(
  factory: (options?: FactoryOptions) => T,
  count: number,
  baseOptions: FactoryOptions = {}
): T[] => {
  return Array.from({ length: count }, (_, index) =>
    factory({
      ...baseOptions,
      overrides: {
        ...baseOptions.overrides,
        index
      }
    })
  );
};

/**
 * Create related test data set
 * Returns a complete set of related test entities for comprehensive testing
 */
export const createTestDataSet = (options: FactoryOptions = {}) => {
  const clinic = createTestClinic(options);
  const doctor = createTestUser({ overrides: { clinicId: clinic.clinicId, role: 'doctor' } });
  const patient = createTestPatient({ overrides: { clinicId: clinic.clinicId } });
  const appointment = createTestAppointment({
    overrides: {
      clinicId: clinic.clinicId,
      patientId: patient.patientId,
      doctorId: doctor.userId
    }
  });
  const note = createTestNote({
    overrides: {
      clinicId: clinic.clinicId,
      patientId: patient.patientId,
      appointmentId: appointment.appointmentId,
      doctorId: doctor.userId
    }
  });
  const invoice = createTestInvoice({
    overrides: {
      clinicId: clinic.clinicId,
      patientId: patient.patientId,
      appointmentId: appointment.appointmentId
    }
  });

  return {
    clinic,
    doctor,
    patient,
    appointment,
    note,
    invoice
  };
};

// Export all factories
export {
  createTestUser,
  createTestClinic,
  createTestPatient,
  createTestAppointment,
  createTestNote,
  createTestInvoice,
  createTestAuditLog,
  createMultiple,
  createTestDataSet
};