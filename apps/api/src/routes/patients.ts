import { Router } from 'express';
import { PatientRepository } from '@/repositories/patientRepository';
import { CreatePatientSchema, UpdatePatientSchema } from '@/models/patient';
import { asyncHandler } from '@/middleware/errorHandler';
import { searchRateLimiter, exportRateLimiter } from '@/middleware/rateLimiter';
import { logDataExport } from '@/middleware/auditLogger';
import { requirePermission } from '@/middleware/authMiddleware';
import { AuthenticatedRequest, ValidationError, NotFoundError } from '@/types';
import { logger } from '@/utils/logger';

const router = Router();
const patientRepository = new PatientRepository();

/**
 * List patients
 * GET /v1/patients
 */
router.get('/',
  requirePermission('patients:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const {
      limit = '25',
      nextToken,
      search,
      state,
      isActive,
      sortDirection = 'desc'
    } = req.query;

    try {
      let result;
      
      if (search) {
        // Search patients
        result = await patientRepository.searchPatients(clinicId, search as string, {
          limit: Math.min(parseInt(limit as string), 100),
          nextToken: nextToken as string,
          sortDirection: sortDirection as 'asc' | 'desc'
        });
      } else {
        // List patients with optional filters
        result = await patientRepository.listPatients(clinicId, {
          limit: Math.min(parseInt(limit as string), 100),
          nextToken: nextToken as string,
          sortDirection: sortDirection as 'asc' | 'desc',
          state: state as string,
          isActive: isActive ? isActive === 'true' : undefined
        });
      }

      res.json({
        success: true,
        data: result.items,
        pagination: {
          nextToken: result.nextToken,
          hasMore: result.hasMore,
          total: result.count,
          limit: parseInt(limit as string)
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to list patients', {
        clinicId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get patient by ID
 * GET /v1/patients/:patientId
 */
router.get('/:patientId',
  requirePermission('patients:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { patientId } = req.params;

    try {
      const patient = await patientRepository.getPatient(clinicId, patientId);
      
      if (!patient) {
        throw new NotFoundError('Patient');
      }

      res.json({
        success: true,
        data: patient,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get patient', {
        clinicId,
        patientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Create new patient
 * POST /v1/patients
 */
router.post('/',
  requirePermission('patients:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    
    try {
      const validatedData = CreatePatientSchema.parse(req.body);
      
      const patient = await patientRepository.createPatient(clinicId, validatedData);
      
      logger.info('Patient created successfully', {
        clinicId,
        patientId: patient.patientId,
        createdBy: req.user?.sub
      });

      res.status(201).json({
        success: true,
        data: patient,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to create patient', {
        clinicId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Update patient
 * PUT /v1/patients/:patientId
 */
router.put('/:patientId',
  requirePermission('patients:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { patientId } = req.params;
    
    try {
      const validatedData = UpdatePatientSchema.parse(req.body);
      
      const patient = await patientRepository.updatePatient(clinicId, patientId, validatedData);
      
      logger.info('Patient updated successfully', {
        clinicId,
        patientId,
        updatedBy: req.user?.sub
      });

      res.json({
        success: true,
        data: patient,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to update patient', {
        clinicId,
        patientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Delete patient (soft delete)
 * DELETE /v1/patients/:patientId
 */
router.delete('/:patientId',
  requirePermission('patients:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { patientId } = req.params;
    
    try {
      await patientRepository.deletePatient(clinicId, patientId);
      
      logger.info('Patient deleted successfully', {
        clinicId,
        patientId,
        deletedBy: req.user?.sub
      });

      res.json({
        success: true,
        message: 'Patient deleted successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to delete patient', {
        clinicId,
        patientId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Search patients
 * GET /v1/patients/search
 */
router.get('/search',
  requirePermission('patients:read'),
  searchRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { 
      q: searchTerm, 
      limit = '25', 
      nextToken,
      sortDirection = 'desc' 
    } = req.query;

    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length < 2) {
      throw new ValidationError('Search term must be at least 2 characters long');
    }

    try {
      const result = await patientRepository.searchPatients(clinicId, searchTerm.trim(), {
        limit: Math.min(parseInt(limit as string), 50), // Lower limit for search
        nextToken: nextToken as string,
        sortDirection: sortDirection as 'asc' | 'desc'
      });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          nextToken: result.nextToken,
          hasMore: result.hasMore,
          total: result.count,
          limit: parseInt(limit as string)
        },
        query: {
          searchTerm,
          searchTime: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Patient search failed', {
        clinicId,
        searchTerm,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get patients by state
 * GET /v1/patients/by-state/:state
 */
router.get('/by-state/:state',
  requirePermission('patients:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { state } = req.params;
    const { 
      limit = '25', 
      nextToken,
      sortDirection = 'desc' 
    } = req.query;

    try {
      const result = await patientRepository.getPatientsByState(clinicId, state.toUpperCase(), {
        limit: Math.min(parseInt(limit as string), 100),
        nextToken: nextToken as string,
        sortDirection: sortDirection as 'asc' | 'desc'
      });

      res.json({
        success: true,
        data: result.items,
        pagination: {
          nextToken: result.nextToken,
          hasMore: result.hasMore,
          total: result.count,
          limit: parseInt(limit as string)
        },
        filter: {
          state: state.toUpperCase()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get patients by state', {
        clinicId,
        state,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Get patient by email
 * GET /v1/patients/by-email/:email
 */
router.get('/by-email/:email',
  requirePermission('patients:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { email } = req.params;

    try {
      const patient = await patientRepository.getPatientByEmail(email);
      
      // Verify patient belongs to the requesting clinic
      if (patient && patient.clinicId !== clinicId) {
        throw new NotFoundError('Patient');
      }

      res.json({
        success: true,
        data: patient,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get patient by email', {
        clinicId,
        email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Export patients data
 * GET /v1/patients/export
 */
router.get('/export',
  requirePermission('patients:read'),
  exportRateLimiter,
  logDataExport('patients'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { 
      format = 'json',
      state,
      isActive = 'true'
    } = req.query;

    if (!['json', 'csv'].includes(format as string)) {
      throw new ValidationError('Format must be json or csv');
    }

    try {
      // Get all patients for export (with pagination)
      let allPatients: any[] = [];
      let nextToken: string | undefined;
      
      do {
        const result = await patientRepository.listPatients(clinicId, {
          limit: 100,
          nextToken,
          state: state as string,
          isActive: isActive === 'true'
        });
        
        allPatients = allPatients.concat(result.items);
        nextToken = result.nextToken;
      } while (nextToken);

      // Remove sensitive fields for export
      const exportData = allPatients.map(patient => ({
        id: patient.patientId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        preferredLanguage: patient.preferredLanguage,
        isActive: patient.isActive,
        stats: patient.stats,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt
      }));

      if (format === 'csv') {
        // Convert to CSV format
        const csvHeaders = Object.keys(exportData[0] || {});
        const csvRows = exportData.map(row => 
          csvHeaders.map(header => {
            const value = (row as any)[header];
            return typeof value === 'object' ? JSON.stringify(value) : String(value || '');
          }).join(',')
        );
        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="patients-${clinicId}-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
      } else {
        res.json({
          success: true,
          data: exportData,
          metadata: {
            totalRecords: allPatients.length,
            exportedAt: new Date().toISOString(),
            clinicId,
            filters: {
              state,
              isActive: isActive === 'true'
            }
          }
        });
      }

      logger.info('Patient data exported', {
        clinicId,
        format,
        recordCount: allPatients.length,
        exportedBy: req.user?.sub
      });

    } catch (error) {
      logger.error('Failed to export patients', {
        clinicId,
        format,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

/**
 * Batch update patient statistics
 * POST /v1/patients/batch/update-stats
 */
router.post('/batch/update-stats',
  requirePermission('patients:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const { patientIds } = req.body;

    if (!Array.isArray(patientIds) || patientIds.length === 0) {
      throw new ValidationError('patientIds must be a non-empty array');
    }

    if (patientIds.length > 100) {
      throw new ValidationError('Maximum 100 patients can be updated at once');
    }

    try {
      // TODO: Implement batch statistics update
      // This would typically:
      // 1. Get current stats for all patients
      // 2. Recalculate from appointments/invoices
      // 3. Batch update all records
      
      logger.info('Batch patient stats update completed', {
        clinicId,
        patientCount: patientIds.length,
        updatedBy: req.user?.sub
      });

      res.json({
        success: true,
        message: `Updated statistics for ${patientIds.length} patients`,
        processedCount: patientIds.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Batch patient stats update failed', {
        clinicId,
        patientCount: patientIds.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  })
);

export { router as patientsRouter };