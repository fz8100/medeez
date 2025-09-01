import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { requirePermission } from '@/middleware/authMiddleware';
import { fileUploadRateLimiter } from '@/middleware/rateLimiter';
import { AuthenticatedRequest, ValidationError } from '@/types';
import { s3Service } from '@/services/s3Service';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * Create presigned upload URL for file attachment
 * POST /v1/attachments/upload
 */
router.post('/upload',
  requirePermission('attachments:write'),
  fileUploadRateLimiter,
  [
    body('fileName').isString().isLength({ min: 1, max: 255 }),
    body('contentType').isString().matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/),
    body('fileSize').isInt({ min: 1, max: 50 * 1024 * 1024 }), // 50MB max
    body('category').isIn(['attachments', 'invoices', 'reports', 'signatures', 'body-charts']),
    body('patientId').optional().isString()
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid upload parameters', errors.array());
    }

    const clinicId = req.clinicId!;
    const userId = req.user!.sub;
    const { fileName, contentType, fileSize, category, patientId } = req.body;
    
    try {
      const presignedUpload = await s3Service.createPresignedUpload({
        clinicId,
        patientId,
        category,
        contentType,
        fileName,
        fileSize,
        userId
      });

      logger.info('Created presigned upload URL', {
        clinicId,
        userId,
        uploadId: presignedUpload.uploadId,
        category,
        fileName
      });
    
      res.status(201).json({
        success: true,
        data: {
          uploadId: presignedUpload.uploadId,
          uploadUrl: presignedUpload.presignedPost.url,
          fields: presignedUpload.presignedPost.fields,
          expiresIn: presignedUpload.expiresIn
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to create upload URL', error);
      throw error;
    }
  })
);

/**
 * List attachments
 * GET /v1/attachments
 */
router.get('/',
  requirePermission('attachments:read'),
  [
    query('category').optional().isIn(['attachments', 'invoices', 'reports', 'signatures', 'body-charts']),
    query('patientId').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('nextToken').optional().isString()
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid query parameters', errors.array());
    }

    const clinicId = req.clinicId!;
    const { category, patientId, limit, nextToken } = req.query;
    
    try {
      const result = await s3Service.listFiles(clinicId, {
        category: category as string,
        patientId: patientId as string,
        limit: limit ? parseInt(limit as string) : undefined,
        nextToken: nextToken as string
      });

      res.json({
        success: true,
        data: {
          files: result.files,
          nextToken: result.nextToken,
          hasMore: result.hasMore,
          count: result.files.length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to list attachments', error);
      throw error;
    }
  })
);

/**
 * Get attachment metadata by S3 key
 * GET /v1/attachments/by-key/:key
 */
router.get('/by-key/*',
  requirePermission('attachments:read'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const key = req.params[0]; // Capture the full path after by-key/
    
    if (!key) {
      throw new ValidationError('File key is required');
    }

    try {
      const metadata = await s3Service.getFileMetadata(key, clinicId);
      
      if (!metadata) {
        return res.status(404).json({
          success: false,
          error: 'FILE_NOT_FOUND',
          message: 'File not found',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: metadata,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to get file metadata', error);
      throw error;
    }
  })
);

/**
 * Download attachment by S3 key
 * GET /v1/attachments/download/*
 */
router.get('/download/*',
  requirePermission('attachments:read'),
  [
    query('inline').optional().isBoolean()
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const key = req.params[0]; // Capture the full path after download/
    const inline = req.query.inline === 'true';
    
    if (!key) {
      throw new ValidationError('File key is required');
    }

    try {
      // Check if file exists and user has access
      const metadata = await s3Service.getFileMetadata(key, clinicId);
      if (!metadata) {
        return res.status(404).json({
          success: false,
          error: 'FILE_NOT_FOUND',
          message: 'File not found',
          timestamp: new Date().toISOString()
        });
      }

      // Generate presigned download URL
      const downloadUrl = await s3Service.createDownloadUrl(key, clinicId, 900); // 15 minutes
      
      if (inline) {
        // Return URL for inline display
        res.json({
          success: true,
          data: {
            downloadUrl,
            expiresIn: 900,
            metadata
          },
          timestamp: new Date().toISOString()
        });
      } else {
        // Redirect to S3 URL for direct download
        res.redirect(downloadUrl);
      }

    } catch (error) {
      logger.error('Failed to create download URL', error);
      throw error;
    }
  })
);

/**
 * Delete attachment
 * DELETE /v1/attachments/*
 */
router.delete('/*',
  requirePermission('attachments:write'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clinicId = req.clinicId!;
    const key = req.params[0]; // Capture the full path
    
    if (!key) {
      throw new ValidationError('File key is required');
    }

    try {
      // Verify file exists and user has access
      const metadata = await s3Service.getFileMetadata(key, clinicId);
      if (!metadata) {
        return res.status(404).json({
          success: false,
          error: 'FILE_NOT_FOUND',
          message: 'File not found',
          timestamp: new Date().toISOString()
        });
      }

      await s3Service.deleteFile(key, clinicId);
      
      logger.info('File deleted', {
        key,
        clinicId,
        deletedBy: req.user!.sub
      });

      res.json({
        success: true,
        message: 'File deleted successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to delete file', error);
      throw error;
    }
  })
);

export { router as attachmentsRouter };