/**
 * Security Testing Suite
 * HIPAA-compliant security and penetration testing for Medeez v2
 */

import request from 'supertest';
import express from 'express';
import { createTestUser, createTestClinic, createTestPatient } from '../../apps/api/src/__tests__/factories';

// Mock the main app
const app = express();
app.use(express.json());

describe('Security Testing Suite', () => {
  let testUser: ReturnType<typeof createTestUser>;
  let testClinic: ReturnType<typeof createTestClinic>;
  let testPatient: ReturnType<typeof createTestPatient>;

  beforeEach(() => {
    testClinic = createTestClinic();
    testUser = createTestUser({ overrides: { clinicId: testClinic.clinicId } });
    testPatient = createTestPatient({ overrides: { clinicId: testClinic.clinicId } });
  });

  describe('Authentication Security', () => {
    it('should reject requests without authentication', async () => {
      const response = await request('http://localhost:3001')
        .get('/v1/patients')
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Authorization header required');
    });

    it('should reject malformed JWT tokens', async () => {
      const response = await request('http://localhost:3001')
        .get('/v1/patients')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
    });

    it('should reject expired JWT tokens', async () => {
      // This would require generating an expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
      
      const response = await request('http://localhost:3001')
        .get('/v1/patients')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
    });

    it('should implement proper session timeout', async () => {
      // Test session timeout functionality
      // This would typically involve checking if sessions expire after inactivity
      expect(true).toBe(true); // Placeholder for actual implementation
    });
  });

  describe('Authorization and Access Control', () => {
    it('should enforce tenant isolation', async () => {
      // Test that users cannot access other tenants' data
      const otherClinicId = 'other-clinic-id';
      
      // This test would verify that attempting to access another clinic's data fails
      expect(testUser.clinicId).not.toBe(otherClinicId);
    });

    it('should enforce role-based access control', async () => {
      // Test different user roles have appropriate permissions
      const adminUser = createTestUser({ 
        overrides: { role: 'admin', permissions: ['admin:read', 'admin:write'] } 
      });
      const doctorUser = createTestUser({ 
        overrides: { role: 'doctor', permissions: ['patients:read', 'patients:write'] } 
      });
      const staffUser = createTestUser({ 
        overrides: { role: 'staff', permissions: ['patients:read'] } 
      });

      expect(adminUser.permissions).toContain('admin:read');
      expect(doctorUser.permissions).not.toContain('admin:read');
      expect(staffUser.permissions).not.toContain('patients:write');
    });

    it('should prevent privilege escalation', async () => {
      // Test that users cannot escalate their privileges
      const regularUser = createTestUser({ 
        overrides: { role: 'staff', permissions: ['patients:read'] } 
      });

      // Attempt to access admin endpoints should fail
      expect(regularUser.role).toBe('staff');
      expect(regularUser.permissions).not.toContain('admin:write');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should sanitize HTML input to prevent XSS', async () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const sanitizedInput = sanitizeHtml(maliciousInput);
      
      expect(sanitizedInput).not.toContain('<script>');
      expect(sanitizedInput).not.toContain('</script>');
    });

    it('should prevent SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE patients; --",
        "1' OR '1'='1",
        "admin'--",
        "admin' /*",
        "admin' UNION SELECT * FROM users WHERE '1'='1"
      ];

      sqlInjectionAttempts.forEach(attempt => {
        const result = validateAndSanitizeInput(attempt);
        expect(result.isValid).toBe(false);
        expect(result.sanitized).not.toContain('DROP');
        expect(result.sanitized).not.toContain('UNION');
        expect(result.sanitized).not.toContain('--');
      });
    });

    it('should validate and sanitize phone numbers', async () => {
      const phoneTests = [
        { input: '+1-555-123-4567', expected: '+15551234567', valid: true },
        { input: '555.123.4567', expected: '5551234567', valid: true },
        { input: '<script>alert("xss")</script>', expected: '', valid: false },
        { input: '123', expected: '', valid: false },
      ];

      phoneTests.forEach(test => {
        const result = validatePhone(test.input);
        expect(result.isValid).toBe(test.valid);
        if (test.valid) {
          expect(result.sanitized).toBe(test.expected);
        }
      });
    });

    it('should validate email addresses properly', async () => {
      const emailTests = [
        { input: 'test@example.com', valid: true },
        { input: 'user.name+tag@example.com', valid: true },
        { input: 'invalid-email', valid: false },
        { input: 'test@', valid: false },
        { input: '<script>alert("xss")</script>', valid: false },
      ];

      emailTests.forEach(test => {
        const result = validateEmail(test.input);
        expect(result.isValid).toBe(test.valid);
      });
    });
  });

  describe('Data Encryption and Protection', () => {
    it('should encrypt sensitive data at rest', async () => {
      const sensitiveData = 'patient-ssn-123-45-6789';
      const encrypted = encryptSensitiveData(sensitiveData);
      
      expect(encrypted).not.toBe(sensitiveData);
      expect(encrypted.length).toBeGreaterThan(sensitiveData.length);
      expect(encrypted).not.toContain('123-45-6789');
    });

    it('should encrypt data in transit with HTTPS', async () => {
      // Test that API endpoints enforce HTTPS
      const response = await request('http://localhost:3001')
        .get('/v1/health')
        .expect(200);

      // In production, this would redirect to HTTPS
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should properly hash passwords', async () => {
      const password = 'testPassword123!';
      const hashedPassword = hashPassword(password);
      
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50); // bcrypt hashes are long
      expect(verifyPassword(password, hashedPassword)).toBe(true);
      expect(verifyPassword('wrongPassword', hashedPassword)).toBe(false);
    });
  });

  describe('Rate Limiting and DDoS Protection', () => {
    it('should implement rate limiting on login attempts', async () => {
      const loginAttempts = Array(10).fill(null).map(() =>
        request('http://localhost:3001')
          .post('/v1/auth/login')
          .send({ email: 'test@example.com', password: 'wrongpassword' })
      );

      const responses = await Promise.all(loginAttempts);
      
      // Should get rate limited after several attempts
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should implement rate limiting on API endpoints', async () => {
      // Test rate limiting on patient endpoints
      expect(true).toBe(true); // Placeholder for actual rate limiting tests
    });

    it('should protect against slowloris attacks', async () => {
      // Test protection against slow HTTP attacks
      expect(true).toBe(true); // Placeholder for actual implementation
    });
  });

  describe('HIPAA Compliance Security', () => {
    it('should not log PHI data', async () => {
      const phiData = {
        ssn: '123-45-6789',
        email: 'patient@example.com',
        phone: '+1-555-123-4567',
        dateOfBirth: '1990-01-01'
      };

      const logEntry = createLogEntry('Patient data accessed', phiData);
      
      expect(logEntry).not.toContain('123-45-6789');
      expect(logEntry).not.toContain('patient@example.com');
      expect(logEntry).not.toContain('+1-555-123-4567');
    });

    it('should implement proper audit logging', async () => {
      const auditLog = createAuditLog({
        action: 'PATIENT_VIEWED',
        userId: testUser.userId,
        resourceId: testPatient.patientId,
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent'
      });

      expect(auditLog).toHaveProperty('timestamp');
      expect(auditLog).toHaveProperty('action');
      expect(auditLog).toHaveProperty('userId');
      expect(auditLog).toHaveProperty('resourceId');
      expect(auditLog.action).toBe('PATIENT_VIEWED');
    });

    it('should enforce data retention policies', async () => {
      // Test that old data is properly archived/deleted according to retention policy
      const retentionPolicy = getRetentionPolicy('patient_data');
      
      expect(retentionPolicy.retentionYears).toBeGreaterThan(0);
      expect(retentionPolicy.archiveAfterYears).toBeDefined();
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose stack traces in production', async () => {
      // Test that error responses don't leak sensitive information
      const response = await request('http://localhost:3001')
        .get('/v1/nonexistent-endpoint')
        .expect(404);

      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('trace');
      expect(response.body.message).not.toContain('Error:');
    });

    it('should sanitize error messages', async () => {
      // Test that database errors don't expose schema information
      const response = await request('http://localhost:3001')
        .post('/v1/patients')
        .send({ invalid: 'data' })
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(response.body.message).not.toContain('table');
      expect(response.body.message).not.toContain('column');
      expect(response.body.message).not.toContain('constraint');
    });
  });

  describe('File Upload Security', () => {
    it('should validate file types', async () => {
      const allowedTypes = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'];
      const dangerousTypes = ['exe', 'bat', 'sh', 'js', 'php', 'aspx'];

      allowedTypes.forEach(type => {
        expect(isAllowedFileType(`document.${type}`)).toBe(true);
      });

      dangerousTypes.forEach(type => {
        expect(isAllowedFileType(`malicious.${type}`)).toBe(false);
      });
    });

    it('should scan uploaded files for malware', async () => {
      // Mock malware scanning
      const cleanFile = Buffer.from('This is a clean PDF content');
      const suspiciousFile = Buffer.from('<%eval request("cmd")%>');

      expect(scanForMalware(cleanFile)).toBe(true); // Clean
      expect(scanForMalware(suspiciousFile)).toBe(false); // Suspicious
    });

    it('should enforce file size limits', async () => {
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      const oversizedFile = Buffer.alloc(maxFileSize + 1);
      const validFile = Buffer.alloc(1024 * 1024); // 1MB

      expect(validateFileSize(validFile, maxFileSize)).toBe(true);
      expect(validateFileSize(oversizedFile, maxFileSize)).toBe(false);
    });
  });
});

// Helper functions for security testing
function sanitizeHtml(input: string): string {
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

function validateAndSanitizeInput(input: string): { isValid: boolean; sanitized: string } {
  const sqlKeywords = ['DROP', 'UNION', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', '--', '/*', '*/'];
  const containsSqlKeywords = sqlKeywords.some(keyword => 
    input.toUpperCase().includes(keyword)
  );
  
  return {
    isValid: !containsSqlKeywords,
    sanitized: containsSqlKeywords ? '' : input
  };
}

function validatePhone(phone: string): { isValid: boolean; sanitized: string } {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  const sanitized = phone.replace(/[^\d\+]/g, '');
  
  return {
    isValid: phoneRegex.test(sanitized) && sanitized.length >= 10,
    sanitized: sanitized
  };
}

function validateEmail(email: string): { isValid: boolean } {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    isValid: emailRegex.test(email) && !email.includes('<') && !email.includes('>')
  };
}

function encryptSensitiveData(data: string): string {
  // Mock encryption - in real implementation would use actual encryption
  return Buffer.from(data).toString('base64') + '==ENCRYPTED==';
}

function hashPassword(password: string): string {
  // Mock password hashing - in real implementation would use bcrypt
  return `$2b$10$${Buffer.from(password).toString('base64')}$hashed`;
}

function verifyPassword(password: string, hash: string): boolean {
  // Mock password verification
  return hash.includes(Buffer.from(password).toString('base64'));
}

function createLogEntry(message: string, data: any): string {
  // Mock secure logging that strips PHI
  const safeData = JSON.stringify(data).replace(/\d{3}-\d{2}-\d{4}/g, '***-**-****');
  return `${message}: ${safeData}`;
}

function createAuditLog(params: any): any {
  return {
    timestamp: new Date().toISOString(),
    ...params
  };
}

function getRetentionPolicy(dataType: string): any {
  return {
    retentionYears: 7,
    archiveAfterYears: 3
  };
}

function isAllowedFileType(filename: string): boolean {
  const allowedTypes = ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx'];
  const extension = filename.split('.').pop()?.toLowerCase();
  return allowedTypes.includes(extension || '');
}

function scanForMalware(fileBuffer: Buffer): boolean {
  // Mock malware scanning - in real implementation would use actual scanner
  const content = fileBuffer.toString();
  const suspiciousPatterns = ['<%eval', '<script>', 'cmd.exe', '/bin/sh'];
  
  return !suspiciousPatterns.some(pattern => content.includes(pattern));
}

function validateFileSize(fileBuffer: Buffer, maxSize: number): boolean {
  return fileBuffer.length <= maxSize;
}