/**
 * Jest Test Setup for Medeez v2 API
 * HIPAA-compliant testing environment configuration
 */

import { config } from 'dotenv';
import { logger } from '@/utils/logger';

// Load test environment variables
config({ path: '.env.test' });

// Global test environment setup
beforeAll(async () => {
  // Suppress logs during testing unless VERBOSE_TESTS is set
  if (!process.env.VERBOSE_TESTS) {
    logger.transports.forEach((transport) => {
      transport.silent = true;
    });
  }

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.AWS_REGION = 'us-east-1';
  process.env.STAGE = 'test';
  
  // Mock AWS services for testing
  process.env.PATIENTS_TABLE = 'test-patients';
  process.env.APPOINTMENTS_TABLE = 'test-appointments';
  process.env.NOTES_TABLE = 'test-notes';
  process.env.INVOICES_TABLE = 'test-invoices';
  process.env.ATTACHMENTS_BUCKET = 'test-attachments';
  process.env.AUDIT_LOG_STREAM = 'test-audit-logs';
  
  // Security and encryption settings for testing
  process.env.ENCRYPTION_KEY_ID = 'test-key-id';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  
  // Rate limiting - more lenient for testing
  process.env.RATE_LIMIT_MAX = '1000';
  process.env.RATE_LIMIT_WINDOW = '60000';

  console.log('🧪 Test environment initialized');
});

// Global test cleanup
afterAll(async () => {
  // Cleanup any test resources
  console.log('🧹 Test cleanup completed');
});

// Test isolation - reset between tests
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset any global state
  delete (global as any).testDb;
  delete (global as any).testUser;
  delete (global as any).testClinic;
});

// Global error handler for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process in tests, just log the error
});

// Custom matchers for HIPAA compliance testing
declare global {
  namespace jest {
    interface Matchers<R> {
      toBePhiCompliant(): R;
      toHaveAuditLog(): R;
      toBeEncrypted(): R;
      toHaveProperTenantIsolation(): R;
    }
  }
}

// PHI Compliance matcher
expect.extend({
  toBePhiCompliant(received: any) {
    const pass = !this.containsSensitiveData(received);
    
    if (pass) {
      return {
        message: () => `Expected data to contain PHI, but it was compliant`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected data to be PHI compliant, but found sensitive information`,
        pass: false,
      };
    }
  },
  
  toHaveAuditLog(received: any) {
    const hasAuditLog = received && 
      received.timestamp && 
      received.action && 
      received.userId;
    
    return {
      message: () => hasAuditLog 
        ? `Expected no audit log, but found one`
        : `Expected audit log with timestamp, action, and userId`,
      pass: hasAuditLog,
    };
  },
  
  toBeEncrypted(received: string) {
    // Simple check - encrypted data shouldn't be readable plain text
    const isEncrypted = received && 
      !received.includes('patient') &&
      !received.includes('email') &&
      (received.includes('==') || received.includes('++') || received.length > 100);
    
    return {
      message: () => isEncrypted
        ? `Expected plain text, but data appears encrypted`
        : `Expected encrypted data, but appears to be plain text`,
      pass: isEncrypted,
    };
  },
  
  toHaveProperTenantIsolation(received: any) {
    const hasTenantId = received && received.clinicId;
    
    return {
      message: () => hasTenantId
        ? `Data has proper tenant isolation`
        : `Data missing tenant isolation (clinicId)`,
      pass: hasTenantId,
    };
  },
});

// Helper function to check for sensitive data
(expect as any).containsSensitiveData = (data: any): boolean => {
  const dataString = JSON.stringify(data).toLowerCase();
  
  const sensitivePatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
    /\b\d{16}\b/, // Credit card pattern
    /password/i,
    /ssn/i,
    /social.security/i,
    /credit.card/i,
    /bank.account/i,
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(dataString));
};

// Mock AWS SDK modules
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-ses');
jest.mock('@aws-sdk/client-kms');
jest.mock('@aws-sdk/client-secrets-manager');

// Mock external services
jest.mock('jsonwebtoken');
jest.mock('crypto-js');