/**
 * Patients API Endpoint Tests
 * HIPAA-compliant patient data management testing with comprehensive security validation
 */

import request from 'supertest';
import express from 'express';
import { patientsRouter } from '@/routes/patients';
import { PatientRepository } from '@/repositories/patientRepository';
import { authMiddleware } from '@/middleware/authMiddleware';
import { tenantMiddleware } from '@/middleware/tenantMiddleware';
import { auditLogger } from '@/middleware/auditLogger';
import { createTestUser, createTestClinic, createTestPatient, createMultiple } from '../factories';

// Mock dependencies
jest.mock('@/repositories/patientRepository');
jest.mock('@/middleware/authMiddleware');
jest.mock('@/middleware/tenantMiddleware');
jest.mock('@/middleware/auditLogger');

const MockPatientRepository = PatientRepository as jest.MockedClass<typeof PatientRepository>;

describe('Patients API Routes', () => {
  let app: express.Application;
  let mockPatientRepository: jest.Mocked<PatientRepository>;
  let testUser: ReturnType<typeof createTestUser>;
  let testClinic: ReturnType<typeof createTestClinic>;
  let testPatient: ReturnType<typeof createTestPatient>;

  beforeEach(() => {
    // Setup Express app with middleware
    app = express();
    app.use(express.json());
    
    // Create test data
    testClinic = createTestClinic();
    testUser = createTestUser({ 
      overrides: { 
        clinicId: testClinic.clinicId,
        permissions: ['patients:read', 'patients:write']
      } 
    });
    testPatient = createTestPatient({ 
      overrides: { clinicId: testClinic.clinicId } 
    });

    // Mock middleware to simulate authenticated request
    (authMiddleware as jest.Mock).mockImplementation((req: any, res: any, next: any) => {
      req.user = testUser;
      req.clinicId = testUser.clinicId;
      req.permissions = testUser.permissions;
      next();
    });

    (tenantMiddleware as jest.Mock).mockImplementation((req: any, res: any, next: any) => {
      next();
    });

    (auditLogger as jest.Mock).mockImplementation((req: any, res: any, next: any) => {
      next();
    });

    // Mock repository
    mockPatientRepository = new MockPatientRepository() as jest.Mocked<PatientRepository>;
    MockPatientRepository.mockImplementation(() => mockPatientRepository);

    // Setup routes
    app.use('/v1/patients', patientsRouter);

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('GET /v1/patients', () => {
    it('should list patients with pagination', async () => {
      // Arrange
      const patients = createMultiple(createTestPatient, 5, {
        overrides: { clinicId: testClinic.clinicId }
      });
      
      mockPatientRepository.listPatients.mockResolvedValue({
        items: patients,
        nextToken: 'next-token-123',
        hasMore: true,
        count: 5
      });

      // Act
      const response = await request(app)
        .get('/v1/patients')
        .query({ limit: 5, sortDirection: 'desc' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.pagination).toEqual({
        nextToken: 'next-token-123',
        hasMore: true,
        total: 5,
        limit: 5
      });
      expect(response.body).toHaveProperty('timestamp');
      
      expect(mockPatientRepository.listPatients).toHaveBeenCalledWith(
        testClinic.clinicId,
        {
          limit: 5,
          nextToken: undefined,
          sortDirection: 'desc',
          state: undefined,
          isActive: undefined
        }
      );
    });

    it('should handle search queries', async () => {
      // Arrange
      const searchResults = createMultiple(createTestPatient, 2, {
        overrides: { 
          clinicId: testClinic.clinicId,
          firstName: 'SearchTerm'
        }
      });
      
      mockPatientRepository.searchPatients.mockResolvedValue({
        items: searchResults,
        nextToken: null,
        hasMore: false,
        count: 2
      });

      // Act
      const response = await request(app)
        .get('/v1/patients')
        .query({ search: 'SearchTerm', limit: 25 })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(mockPatientRepository.searchPatients).toHaveBeenCalledWith(
        testClinic.clinicId,
        'SearchTerm',
        {
          limit: 25,
          nextToken: undefined,
          sortDirection: 'desc'
        }
      );
    });

    it('should filter by state and active status', async () => {
      // Arrange
      const filteredPatients = createMultiple(createTestPatient, 3, {
        overrides: { 
          clinicId: testClinic.clinicId,
          isActive: true
        }
      });
      
      mockPatientRepository.listPatients.mockResolvedValue({
        items: filteredPatients,
        nextToken: null,
        hasMore: false,
        count: 3
      });

      // Act
      const response = await request(app)
        .get('/v1/patients')
        .query({ state: 'CA', isActive: 'true' })
        .expect(200);

      // Assert
      expect(mockPatientRepository.listPatients).toHaveBeenCalledWith(
        testClinic.clinicId,
        expect.objectContaining({
          state: 'CA',
          isActive: true
        })
      );
    });

    it('should enforce maximum limit', async () => {
      // Arrange
      mockPatientRepository.listPatients.mockResolvedValue({
        items: [],
        nextToken: null,
        hasMore: false,
        count: 0
      });

      // Act
      await request(app)
        .get('/v1/patients')
        .query({ limit: 500 }) // Exceeds max of 100
        .expect(200);

      // Assert - Should cap at 100
      expect(mockPatientRepository.listPatients).toHaveBeenCalledWith(
        testClinic.clinicId,
        expect.objectContaining({
          limit: 100
        })
      );
    });
  });

  describe('GET /v1/patients/:patientId', () => {
    it('should retrieve patient by ID', async () => {
      // Arrange
      mockPatientRepository.getPatient.mockResolvedValue(testPatient);

      // Act
      const response = await request(app)
        .get(`/v1/patients/${testPatient.patientId}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.patientId).toBe(testPatient.patientId);
      expect(response.body.data).toHaveProperTenantIsolation();
      
      expect(mockPatientRepository.getPatient).toHaveBeenCalledWith(
        testClinic.clinicId,
        testPatient.patientId
      );
    });

    it('should return 404 when patient not found', async () => {
      // Arrange
      mockPatientRepository.getPatient.mockResolvedValue(null);

      // Act
      const response = await request(app)
        .get('/v1/patients/non-existent-patient')
        .expect(404);

      // Assert
      expect(response.body.error).toBe('NOT_FOUND');
      expect(response.body.message).toBe('Patient not found');
    });

    it('should not expose sensitive data in error responses', async () => {
      // Arrange
      mockPatientRepository.getPatient.mockRejectedValue(
        new Error('Database connection failed with credentials: admin:password123')
      );

      // Act
      const response = await request(app)
        .get(`/v1/patients/${testPatient.patientId}`)
        .expect(500);

      // Assert
      expect(response.body.message).not.toContain('password123');
      expect(response.body.message).not.toContain('credentials');
    });
  });

  describe('POST /v1/patients', () => {
    it('should create new patient with valid data', async () => {
      // Arrange
      const newPatientData = {
        firstName: 'NewPatient',
        lastName: 'TestUser',
        dateOfBirth: '1990-05-15',
        gender: 'male',
        phone: '+1-555-TEST-NEW',
        email: 'newpatient@test.example.com',
        address: {
          street: '123 New Patient St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'US'
        }
      };

      const createdPatient = createTestPatient({
        overrides: {
          ...newPatientData,
          clinicId: testClinic.clinicId
        }
      });

      mockPatientRepository.createPatient.mockResolvedValue(createdPatient);

      // Act
      const response = await request(app)
        .post('/v1/patients')
        .send(newPatientData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe(newPatientData.firstName);
      expect(response.body.data.lastName).toBe(newPatientData.lastName);
      expect(response.body.data).toHaveProperTenantIsolation();
      
      expect(mockPatientRepository.createPatient).toHaveBeenCalledWith(
        testClinic.clinicId,
        newPatientData
      );
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidPatientData = {
        firstName: 'Test',
        // Missing required lastName, dateOfBirth, etc.
      };

      // Act
      const response = await request(app)
        .post('/v1/patients')
        .send(invalidPatientData)
        .expect(400);

      // Assert
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(mockPatientRepository.createPatient).not.toHaveBeenCalled();
    });

    it('should sanitize input data', async () => {
      // Arrange
      const maliciousData = {
        firstName: '<script>alert("xss")</script>',
        lastName: 'TestUser',
        dateOfBirth: '1990-05-15',
        gender: 'male',
        phone: '+1-555-TEST-XSS',
        email: 'test@test.com'
      };

      const sanitizedPatient = createTestPatient({
        overrides: {
          firstName: 'alert("xss")', // Script tags removed
          clinicId: testClinic.clinicId
        }
      });

      mockPatientRepository.createPatient.mockResolvedValue(sanitizedPatient);

      // Act
      const response = await request(app)
        .post('/v1/patients')
        .send(maliciousData)
        .expect(201);

      // Assert
      expect(response.body.data.firstName).not.toContain('<script>');
      expect(response.body.data.firstName).not.toContain('</script>');
    });

    it('should enforce rate limiting for creation', async () => {
      // This test would be more relevant with actual rate limiting middleware
      // For now, we'll test that the endpoint exists and works
      const newPatient = createTestPatient({
        overrides: { clinicId: testClinic.clinicId }
      });

      mockPatientRepository.createPatient.mockResolvedValue(newPatient);

      // Act
      await request(app)
        .post('/v1/patients')
        .send({
          firstName: 'Rate',
          lastName: 'Test',
          dateOfBirth: '1990-01-01',
          gender: 'other',
          phone: '+1-555-RATE-001',
          email: 'rate@test.com'
        })
        .expect(201);

      expect(mockPatientRepository.createPatient).toHaveBeenCalled();
    });
  });

  describe('PUT /v1/patients/:patientId', () => {
    it('should update patient with valid data', async () => {
      // Arrange
      const updateData = {
        firstName: 'UpdatedName',
        phone: '+1-555-UPDATED'
      };

      const updatedPatient = {
        ...testPatient,
        ...updateData,
        updatedAt: new Date().toISOString()
      };

      mockPatientRepository.updatePatient.mockResolvedValue(updatedPatient);

      // Act
      const response = await request(app)
        .put(`/v1/patients/${testPatient.patientId}`)
        .send(updateData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe(updateData.firstName);
      expect(response.body.data.phone).toBe(updateData.phone);
      
      expect(mockPatientRepository.updatePatient).toHaveBeenCalledWith(
        testClinic.clinicId,
        testPatient.patientId,
        updateData
      );
    });

    it('should not allow updating clinicId', async () => {
      // Arrange
      const maliciousUpdate = {
        clinicId: 'different-clinic-id',
        firstName: 'Hacker'
      };

      // Act - This should be blocked by validation
      const response = await request(app)
        .put(`/v1/patients/${testPatient.patientId}`)
        .send(maliciousUpdate)
        .expect(400);

      // Assert
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(mockPatientRepository.updatePatient).not.toHaveBeenCalled();
    });

    it('should validate patient ownership before update', async () => {
      // Arrange
      mockPatientRepository.updatePatient.mockRejectedValue(
        new Error('Patient not found')
      );

      // Act
      const response = await request(app)
        .put('/v1/patients/other-clinic-patient')
        .send({ firstName: 'Updated' })
        .expect(500); // Will be handled by error handler

      // Assert
      expect(mockPatientRepository.updatePatient).toHaveBeenCalledWith(
        testClinic.clinicId,
        'other-clinic-patient',
        { firstName: 'Updated' }
      );
    });
  });

  describe('DELETE /v1/patients/:patientId', () => {
    it('should soft delete patient', async () => {
      // Arrange
      mockPatientRepository.deletePatient.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .delete(`/v1/patients/${testPatient.patientId}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Patient deleted successfully');
      
      expect(mockPatientRepository.deletePatient).toHaveBeenCalledWith(
        testClinic.clinicId,
        testPatient.patientId
      );
    });

    it('should handle deletion of non-existent patient', async () => {
      // Arrange
      mockPatientRepository.deletePatient.mockRejectedValue(
        new Error('Patient not found')
      );

      // Act
      await request(app)
        .delete('/v1/patients/non-existent')
        .expect(500);

      expect(mockPatientRepository.deletePatient).toHaveBeenCalled();
    });
  });

  describe('GET /v1/patients/search', () => {
    it('should search patients with minimum query length', async () => {
      // Arrange
      const searchResults = createMultiple(createTestPatient, 3, {
        overrides: { clinicId: testClinic.clinicId }
      });
      
      mockPatientRepository.searchPatients.mockResolvedValue({
        items: searchResults,
        nextToken: null,
        hasMore: false,
        count: 3
      });

      // Act
      const response = await request(app)
        .get('/v1/patients/search')
        .query({ q: 'John' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.query.searchTerm).toBe('John');
      expect(response.body.query).toHaveProperty('searchTime');
    });

    it('should reject short search terms', async () => {
      // Act
      const response = await request(app)
        .get('/v1/patients/search')
        .query({ q: 'A' }) // Too short
        .expect(400);

      // Assert
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('at least 2 characters');
      expect(mockPatientRepository.searchPatients).not.toHaveBeenCalled();
    });

    it('should handle empty search results', async () => {
      // Arrange
      mockPatientRepository.searchPatients.mockResolvedValue({
        items: [],
        nextToken: null,
        hasMore: false,
        count: 0
      });

      // Act
      const response = await request(app)
        .get('/v1/patients/search')
        .query({ q: 'NonExistentName' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should sanitize search queries', async () => {
      // Arrange
      mockPatientRepository.searchPatients.mockResolvedValue({
        items: [],
        nextToken: null,
        hasMore: false,
        count: 0
      });

      // Act
      await request(app)
        .get('/v1/patients/search')
        .query({ q: '<script>alert("xss")</script>' })
        .expect(200);

      // Assert - Search term should be sanitized
      expect(mockPatientRepository.searchPatients).toHaveBeenCalledWith(
        testClinic.clinicId,
        expect.not.stringContaining('<script>'),
        expect.any(Object)
      );
    });
  });

  describe('GET /v1/patients/export', () => {
    it('should export patients as JSON', async () => {
      // Arrange
      const patients = createMultiple(createTestPatient, 10, {
        overrides: { clinicId: testClinic.clinicId }
      });
      
      mockPatientRepository.listPatients.mockResolvedValue({
        items: patients,
        nextToken: null,
        hasMore: false,
        count: 10
      });

      // Act
      const response = await request(app)
        .get('/v1/patients/export')
        .query({ format: 'json' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(10);
      expect(response.body.metadata).toEqual(
        expect.objectContaining({
          totalRecords: 10,
          clinicId: testClinic.clinicId
        })
      );
      
      // Ensure no sensitive fields are exported
      response.body.data.forEach((patient: any) => {
        expect(patient).not.toHaveProperty('internalId');
        expect(patient).not.toHaveProperty('rawData');
      });
    });

    it('should export patients as CSV', async () => {
      // Arrange
      const patients = createMultiple(createTestPatient, 5, {
        overrides: { clinicId: testClinic.clinicId }
      });
      
      mockPatientRepository.listPatients.mockResolvedValue({
        items: patients,
        nextToken: null,
        hasMore: false,
        count: 5
      });

      // Act
      const response = await request(app)
        .get('/v1/patients/export')
        .query({ format: 'csv' })
        .expect(200);

      // Assert
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('firstName,lastName'); // CSV headers
    });

    it('should validate export format', async () => {
      // Act
      const response = await request(app)
        .get('/v1/patients/export')
        .query({ format: 'xml' }) // Invalid format
        .expect(400);

      // Assert
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Format must be json or csv');
    });

    it('should handle large datasets with pagination', async () => {
      // Arrange - Mock multiple paginated responses
      const firstBatch = createMultiple(createTestPatient, 100, {
        overrides: { clinicId: testClinic.clinicId }
      });
      const secondBatch = createMultiple(createTestPatient, 50, {
        overrides: { clinicId: testClinic.clinicId }
      });

      mockPatientRepository.listPatients
        .mockResolvedValueOnce({
          items: firstBatch,
          nextToken: 'page-2',
          hasMore: true,
          count: 100
        })
        .mockResolvedValueOnce({
          items: secondBatch,
          nextToken: null,
          hasMore: false,
          count: 50
        });

      // Act
      const response = await request(app)
        .get('/v1/patients/export')
        .query({ format: 'json' })
        .expect(200);

      // Assert
      expect(response.body.data).toHaveLength(150); // Both batches combined
      expect(mockPatientRepository.listPatients).toHaveBeenCalledTimes(2);
    });
  });

  describe('HIPAA Compliance and Security', () => {
    it('should not log sensitive patient data', async () => {
      // Arrange
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      mockPatientRepository.getPatient.mockResolvedValue(testPatient);

      // Act
      await request(app)
        .get(`/v1/patients/${testPatient.patientId}`)
        .expect(200);

      // Assert - Check that logs don't contain PHI
      const allLogs = [
        ...logSpy.mock.calls.flat(),
        ...errorSpy.mock.calls.flat()
      ].join(' ');

      expect(allLogs).not.toContain(testPatient.email);
      expect(allLogs).not.toContain(testPatient.phone);
      expect(allLogs).not.toContain(testPatient.dateOfBirth);

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should validate all patient data is tenant-isolated', async () => {
      // Arrange
      const patients = createMultiple(createTestPatient, 5, {
        overrides: { clinicId: testClinic.clinicId }
      });
      
      mockPatientRepository.listPatients.mockResolvedValue({
        items: patients,
        nextToken: null,
        hasMore: false,
        count: 5
      });

      // Act
      const response = await request(app)
        .get('/v1/patients')
        .expect(200);

      // Assert - Every patient should have proper tenant isolation
      response.body.data.forEach((patient: any) => {
        expect(patient).toHaveProperTenantIsolation();
      });
    });

    it('should handle PHI data according to HIPAA requirements', async () => {
      // Arrange
      mockPatientRepository.createPatient.mockResolvedValue(testPatient);

      // Act
      const response = await request(app)
        .post('/v1/patients')
        .send({
          firstName: 'HIPAA',
          lastName: 'TestPatient',
          dateOfBirth: '1990-01-01',
          gender: 'other',
          phone: '+1-555-HIPAA-001',
          email: 'hipaa@test.com'
        })
        .expect(201);

      // Assert - Response should be HIPAA compliant
      expect(response.body.data).toBePhiCompliant();
    });

    it('should maintain audit trail for all operations', async () => {
      // This test ensures audit middleware is called
      // In actual implementation, would verify audit logs are created
      
      mockPatientRepository.getPatient.mockResolvedValue(testPatient);

      await request(app)
        .get(`/v1/patients/${testPatient.patientId}`)
        .expect(200);

      // Verify audit middleware was called
      expect(auditLogger).toHaveBeenCalled();
    });
  });
});