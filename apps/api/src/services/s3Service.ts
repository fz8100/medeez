import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreatePresignedPostCommand,
  ListObjectsV2Command,
  GetObjectCommandInput,
  PutObjectCommandInput
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { nanoid } from 'nanoid';
import { logger } from '@/utils/logger';
import { AppError } from '@/types';

export interface UploadConfig {
  clinicId: string;
  patientId?: string;
  category: 'attachments' | 'invoices' | 'reports' | 'signatures' | 'body-charts';
  contentType: string;
  fileName: string;
  fileSize: number;
  userId: string;
}

export interface PresignedUpload {
  uploadId: string;
  presignedPost: {
    url: string;
    fields: Record<string, string>;
  };
  expiresIn: number;
}

export interface FileMetadata {
  key: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  clinicId: string;
  patientId?: string;
  category: string;
  virusScanned?: boolean;
  scanResult?: 'CLEAN' | 'INFECTED' | 'PENDING';
}

export class S3Service {
  private client: S3Client;
  private bucketName: string;
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.bucketName = process.env.S3_BUCKET_NAME || 'medeez-app-data-1756661993';
    
    logger.debug('Initializing S3 client', {
      bucketName: this.bucketName,
      region: this.region,
      environment: process.env.NODE_ENV
    });

    this.client = new S3Client({
      region: this.region,
      maxAttempts: 3,
      retryMode: 'adaptive',
      // Use IAM role in production, local credentials in development
      ...(process.env.NODE_ENV === 'development' && {
        credentials: process.env.AWS_PROFILE ? undefined : {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
        }
      })
    });

    logger.info('S3 service initialized', {
      bucketName: this.bucketName,
      region: this.region
    });
  }

  /**
   * Generate secure S3 key with proper organization
   * Format: /{clinicId}/{category}/{patientId?}/{uploadId}-{fileName}
   */
  private generateS3Key(config: UploadConfig, uploadId: string): string {
    const parts = [
      config.clinicId,
      config.category,
      ...(config.patientId ? [config.patientId] : []),
      `${uploadId}-${config.fileName}`
    ];
    
    return parts.join('/');
  }

  /**
   * Validate file upload parameters
   */
  private validateUpload(config: UploadConfig): void {
    // File size limits (in bytes)
    const maxSizes = {
      'attachments': 50 * 1024 * 1024,    // 50MB
      'invoices': 10 * 1024 * 1024,       // 10MB
      'reports': 25 * 1024 * 1024,        // 25MB
      'signatures': 2 * 1024 * 1024,      // 2MB
      'body-charts': 15 * 1024 * 1024     // 15MB
    };

    const maxSize = maxSizes[config.category];
    if (config.fileSize > maxSize) {
      throw new AppError(
        `File size exceeds limit for ${config.category}: ${maxSize} bytes`,
        400,
        'FILE_TOO_LARGE'
      );
    }

    // Allowed content types
    const allowedTypes: Record<string, string[]> = {
      'attachments': [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      'invoices': ['application/pdf'],
      'reports': ['application/pdf', 'text/plain', 'text/csv'],
      'signatures': ['image/png', 'image/jpeg'],
      'body-charts': ['image/png', 'image/jpeg', 'image/svg+xml']
    };

    const allowed = allowedTypes[config.category] || [];
    if (!allowed.includes(config.contentType)) {
      throw new AppError(
        `Content type ${config.contentType} not allowed for ${config.category}`,
        400,
        'INVALID_CONTENT_TYPE'
      );
    }

    // Filename validation
    if (!config.fileName || config.fileName.length > 255) {
      throw new AppError('Invalid filename', 400, 'INVALID_FILENAME');
    }

    // Check for malicious filenames
    const dangerousPatterns = [/\.\./g, /[<>:"|?*]/g, /^\./];
    if (dangerousPatterns.some(pattern => pattern.test(config.fileName))) {
      throw new AppError('Invalid filename characters', 400, 'INVALID_FILENAME');
    }
  }

  /**
   * Create presigned POST URL for secure file upload
   */
  async createPresignedUpload(config: UploadConfig): Promise<PresignedUpload> {
    try {
      this.validateUpload(config);
      
      const uploadId = nanoid(16);
      const key = this.generateS3Key(config, uploadId);
      const expiresIn = 900; // 15 minutes
      
      // Presigned POST for direct browser upload
      const command = new CreatePresignedPostCommand({
        Bucket: this.bucketName,
        Key: key,
        Expires: new Date(Date.now() + expiresIn * 1000),
        Conditions: [
          ['content-length-range', 1, config.fileSize * 1.1], // Allow 10% buffer
          ['eq', '$Content-Type', config.contentType],
          ['starts-with', '$key', `${config.clinicId}/`] // Security: Scope to clinic
        ],
        Fields: {
          'Content-Type': config.contentType,
          'x-amz-meta-clinic-id': config.clinicId,
          'x-amz-meta-user-id': config.userId,
          'x-amz-meta-category': config.category,
          'x-amz-meta-original-filename': config.fileName,
          'x-amz-meta-upload-id': uploadId,
          ...(config.patientId && { 'x-amz-meta-patient-id': config.patientId })
        }
      });

      const presignedPost = await this.client.send(command);

      logger.info('Created presigned upload', {
        uploadId,
        key,
        clinicId: config.clinicId,
        category: config.category,
        fileSize: config.fileSize
      });

      return {
        uploadId,
        presignedPost: {
          url: presignedPost.url,
          fields: presignedPost.fields
        },
        expiresIn
      };

    } catch (error) {
      logger.error('Failed to create presigned upload', error);
      if (error instanceof AppError) throw error;
      throw new AppError('Failed to create upload URL');
    }
  }

  /**
   * Generate presigned download URL
   */
  async createDownloadUrl(
    key: string,
    clinicId: string,
    expiresIn: number = 900
  ): Promise<string> {
    try {
      // Security: Ensure key belongs to the clinic
      if (!key.startsWith(`${clinicId}/`)) {
        throw new AppError('Access denied to file', 403, 'ACCESS_DENIED');
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ResponseContentDisposition: 'attachment' // Force download
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      
      logger.info('Created download URL', {
        key,
        clinicId,
        expiresIn
      });

      return url;

    } catch (error) {
      logger.error('Failed to create download URL', error);
      throw new AppError('Failed to create download URL');
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(key: string, clinicId: string): Promise<FileMetadata | null> {
    try {
      // Security: Ensure key belongs to the clinic
      if (!key.startsWith(`${clinicId}/`)) {
        throw new AppError('Access denied to file', 403, 'ACCESS_DENIED');
      }

      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const result = await this.client.send(command);
      
      return {
        key,
        fileName: result.Metadata?.['original-filename'] || key.split('/').pop() || 'unknown',
        contentType: result.ContentType || 'application/octet-stream',
        fileSize: result.ContentLength || 0,
        uploadedAt: result.LastModified?.toISOString() || '',
        uploadedBy: result.Metadata?.['user-id'] || 'unknown',
        clinicId: result.Metadata?.['clinic-id'] || clinicId,
        patientId: result.Metadata?.['patient-id'],
        category: result.Metadata?.['category'] || 'attachments',
        virusScanned: result.Metadata?.['virus-scanned'] === 'true',
        scanResult: (result.Metadata?.['scan-result'] as any) || 'PENDING'
      };

    } catch (error: any) {
      if (error.name === 'NotFound') {
        return null;
      }
      logger.error('Failed to get file metadata', error);
      throw new AppError('Failed to get file information');
    }
  }

  /**
   * Delete file
   */
  async deleteFile(key: string, clinicId: string): Promise<void> {
    try {
      // Security: Ensure key belongs to the clinic
      if (!key.startsWith(`${clinicId}/`)) {
        throw new AppError('Access denied to file', 403, 'ACCESS_DENIED');
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.client.send(command);
      
      logger.info('File deleted', { key, clinicId });

    } catch (error) {
      logger.error('Failed to delete file', error);
      throw new AppError('Failed to delete file');
    }
  }

  /**
   * List files by clinic and category
   */
  async listFiles(
    clinicId: string,
    options: {
      category?: string;
      patientId?: string;
      limit?: number;
      nextToken?: string;
    } = {}
  ): Promise<{
    files: FileMetadata[];
    nextToken?: string;
    hasMore: boolean;
  }> {
    try {
      const prefix = [
        clinicId,
        ...(options.category ? [options.category] : []),
        ...(options.patientId ? [options.patientId] : [])
      ].join('/');

      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: Math.min(options.limit || 25, 100),
        ContinuationToken: options.nextToken
      });

      const result = await this.client.send(command);
      
      const files: FileMetadata[] = await Promise.all(
        (result.Contents || []).map(async (object) => {
          const metadata = await this.getFileMetadata(object.Key!, clinicId);
          return metadata!;
        })
      );

      return {
        files: files.filter(Boolean),
        nextToken: result.NextContinuationToken,
        hasMore: !!result.IsTruncated
      };

    } catch (error) {
      logger.error('Failed to list files', error);
      throw new AppError('Failed to list files');
    }
  }

  /**
   * Direct file upload (for server-side operations)
   */
  async uploadFile(
    config: UploadConfig,
    fileBuffer: Buffer
  ): Promise<{ key: string; uploadId: string }> {
    try {
      this.validateUpload(config);
      
      const uploadId = nanoid(16);
      const key = this.generateS3Key(config, uploadId);

      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: config.contentType,
          Metadata: {
            'clinic-id': config.clinicId,
            'user-id': config.userId,
            'category': config.category,
            'original-filename': config.fileName,
            'upload-id': uploadId,
            ...(config.patientId && { 'patient-id': config.patientId })
          },
          ServerSideEncryption: 'aws:kms',
          StorageClass: 'STANDARD_IA' // Cost optimization for infrequent access
        } as PutObjectCommandInput
      });

      await upload.done();
      
      logger.info('File uploaded directly', {
        uploadId,
        key,
        clinicId: config.clinicId,
        fileSize: config.fileSize
      });

      return { key, uploadId };

    } catch (error) {
      logger.error('Failed to upload file directly', error);
      throw new AppError('Failed to upload file');
    }
  }

  /**
   * Update file metadata (for virus scan results, etc.)
   */
  async updateFileMetadata(
    key: string,
    clinicId: string,
    metadata: Record<string, string>
  ): Promise<void> {
    try {
      // Security: Ensure key belongs to the clinic
      if (!key.startsWith(`${clinicId}/`)) {
        throw new AppError('Access denied to file', 403, 'ACCESS_DENIED');
      }

      // Get current metadata
      const currentMetadata = await this.getFileMetadata(key, clinicId);
      if (!currentMetadata) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      // Copy object with updated metadata
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        CopySource: `${this.bucketName}/${key}`,
        Metadata: {
          ...currentMetadata,
          ...metadata
        },
        MetadataDirective: 'REPLACE'
      });

      await this.client.send(command);
      
      logger.info('File metadata updated', { key, clinicId, metadata });

    } catch (error) {
      logger.error('Failed to update file metadata', error);
      throw new AppError('Failed to update file metadata');
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string, clinicId: string): Promise<boolean> {
    try {
      const metadata = await this.getFileMetadata(key, clinicId);
      return metadata !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get file stream for processing
   */
  async getFileStream(key: string, clinicId: string): Promise<NodeJS.ReadableStream> {
    try {
      // Security: Ensure key belongs to the clinic
      if (!key.startsWith(`${clinicId}/`)) {
        throw new AppError('Access denied to file', 403, 'ACCESS_DENIED');
      }

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const result = await this.client.send(command);
      
      if (!result.Body) {
        throw new AppError('File body not found', 404, 'FILE_NOT_FOUND');
      }

      return result.Body as NodeJS.ReadableStream;

    } catch (error) {
      logger.error('Failed to get file stream', error);
      throw new AppError('Failed to get file stream');
    }
  }
}

// Singleton instance
export const s3Service = new S3Service();