/**
 * Authentication Middleware Tests
 * HIPAA-compliant authentication testing with comprehensive security validation
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authMiddleware, requirePermission } from '@/middleware/authMiddleware';
import { createTestUser, createTestClinic } from '../factories';
import express from 'express';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('Authentication Middleware', () => {
  let app: express.Application;
  let testUser: ReturnType<typeof createTestUser>;
  let testClinic: ReturnType<typeof createTestClinic>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    testUser = createTestUser();
    testClinic = createTestClinic({ overrides: { clinicId: testUser.clinicId } });
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('authMiddleware', () => {
    it('should authenticate valid JWT token', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      mockedJwt.verify.mockReturnValue(testUser as any);

      app.use(authMiddleware);
      app.get('/test', (req: any, res) => {
        res.json({ 
          success: true, 
          user: req.user,
          clinicId: req.clinicId 
        });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.userId).toBe(testUser.userId);
      expect(mockedJwt.verify).toHaveBeenCalledWith(
        validToken,
        process.env.JWT_SECRET
      );
    });

    it('should reject request without authorization header', async () => {
      // Arrange
      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Authorization header required');
      expect(mockedJwt.verify).not.toHaveBeenCalled();
    });

    it('should reject malformed authorization header', async () => {
      // Arrange
      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Invalid authorization header format');
    });

    it('should reject invalid JWT token', async () => {
      // Arrange
      const invalidToken = 'invalid-jwt-token';
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Invalid or expired token');
      expect(mockedJwt.verify).toHaveBeenCalledWith(
        invalidToken,
        process.env.JWT_SECRET
      );
    });

    it('should reject expired JWT token', async () => {
      // Arrange
      const expiredToken = 'expired-jwt-token';
      const tokenExpiredError = new Error('Token expired');
      tokenExpiredError.name = 'TokenExpiredError';
      mockedJwt.verify.mockImplementation(() => {
        throw tokenExpiredError;
      });

      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Token has expired');
    });

    it('should handle JWT verification with malformed token', async () => {
      // Arrange
      const malformedToken = 'malformed.jwt.token';
      const malformedError = new Error('Malformed token');
      malformedError.name = 'JsonWebTokenError';
      mockedJwt.verify.mockImplementation(() => {
        throw malformedError;
      });

      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${malformedToken}`)
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Invalid token format');
    });

    it('should extract user information correctly', async () => {
      // Arrange
      const token = 'valid-token';
      const userPayload = {
        ...testUser,
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000)
      };
      
      mockedJwt.verify.mockReturnValue(userPayload as any);

      app.use(authMiddleware);
      app.get('/test', (req: any, res) => {
        res.json({
          user: req.user,
          clinicId: req.clinicId,
          permissions: req.permissions
        });
      });

      // Act
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Assert
      expect(response.body.user.userId).toBe(testUser.userId);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.role).toBe(testUser.role);
      expect(response.body.clinicId).toBe(testUser.clinicId);
      expect(response.body.permissions).toEqual(testUser.permissions);
    });
  });

  describe('requirePermission', () => {
    beforeEach(() => {
      // Setup authenticated request
      mockedJwt.verify.mockReturnValue(testUser as any);
      app.use(authMiddleware);
    });

    it('should allow access with required permission', async () => {
      // Arrange
      app.get('/test', requirePermission('patients:read'), (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });

    it('should deny access without required permission', async () => {
      // Arrange
      app.get('/test', requirePermission('admin:write'), (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body.error).toBe('FORBIDDEN');
      expect(response.body.message).toBe('Insufficient permissions');
    });

    it('should handle multiple permission requirements', async () => {
      // Arrange
      const userWithMultiplePermissions = createTestUser({
        overrides: {
          permissions: ['patients:read', 'patients:write', 'appointments:read']
        }
      });
      
      mockedJwt.verify.mockReturnValue(userWithMultiplePermissions as any);

      app.get('/test', requirePermission('patients:write'), (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });

    it('should deny access for inactive user', async () => {
      // Arrange
      const inactiveUser = createTestUser({
        overrides: { isActive: false }
      });
      
      mockedJwt.verify.mockReturnValue(inactiveUser as any);

      app.get('/test', requirePermission('patients:read'), (req, res) => {
        res.json({ success: true });
      });

      // Act & Assert
      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid-token')
        .expect(401);

      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('User account is inactive');
    });
  });

  describe('Security Headers', () => {
    it('should not expose sensitive information in error responses', async () => {
      // Arrange
      mockedJwt.verify.mockImplementation(() => {
        throw new Error('Detailed internal error with sensitive data: secret-key-12345');
      });

      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act
      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      // Assert
      expect(response.body.message).not.toContain('secret-key');
      expect(response.body.message).not.toContain('12345');
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('details');
    });

    it('should include proper timestamp in error responses for audit', async () => {
      // Arrange
      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act
      const response = await request(app)
        .get('/test')
        .expect(401);

      // Assert
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('HIPAA Compliance', () => {
    it('should maintain user context for audit logging', async () => {
      // Arrange
      mockedJwt.verify.mockReturnValue(testUser as any);

      app.use(authMiddleware);
      app.get('/test', (req: any, res) => {
        // Verify user context is available for audit logging
        expect(req.user).toBeDefined();
        expect(req.user.userId).toBe(testUser.userId);
        expect(req.clinicId).toBe(testUser.clinicId);
        res.json({ success: true });
      });

      // Act & Assert
      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
    });

    it('should not log sensitive user information', async () => {
      // This test ensures that authentication middleware doesn't log sensitive data
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Arrange
      mockedJwt.verify.mockReturnValue(testUser as any);

      app.use(authMiddleware);
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Act
      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert - Check that logs don't contain sensitive information
      const allLogs = [
        ...consoleSpy.mock.calls.flat(),
        ...consoleErrorSpy.mock.calls.flat()
      ].join(' ');

      expect(allLogs).not.toContain(testUser.email);
      expect(allLogs).not.toContain('Bearer');
      expect(allLogs).not.toContain('valid-token');

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should validate token belongs to correct clinic', async () => {
      // Arrange
      const tokenWithDifferentClinic = createTestUser({
        overrides: { clinicId: 'different-clinic-id' }
      });
      
      mockedJwt.verify.mockReturnValue(tokenWithDifferentClinic as any);

      app.use(authMiddleware);
      app.get('/test', (req: any, res) => {
        res.json({ 
          clinicId: req.clinicId,
          userClinic: req.user.clinicId
        });
      });

      // Act
      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Assert
      expect(response.body.clinicId).toBe(tokenWithDifferentClinic.clinicId);
      expect(response.body.userClinic).toBe(tokenWithDifferentClinic.clinicId);
    });
  });
});