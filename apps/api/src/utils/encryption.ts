import { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';
import * as crypto from 'crypto';
import { EncryptedField, AppError } from '@/types';
import { logger } from './logger';

export class EncryptionService {
  private kmsClient: KMSClient;
  private kmsKeyId: string;

  constructor() {
    this.kmsClient = new KMSClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.kmsKeyId = process.env.KMS_KEY_ID || '';
    
    if (!this.kmsKeyId) {
      throw new Error('KMS_KEY_ID environment variable is required');
    }
  }

  /**
   * Encrypt PHI data using KMS envelope encryption pattern
   * This provides field-level encryption with cost optimization
   */
  async encryptPHI(
    plaintext: string,
    encryptionContext: Record<string, string> = {}
  ): Promise<EncryptedField> {
    if (!plaintext || plaintext.trim() === '') {
      throw new AppError('Cannot encrypt empty or null values', 400, 'INVALID_INPUT');
    }

    try {
      // Generate a data key for envelope encryption
      const generateKeyCommand = new GenerateDataKeyCommand({
        KeyId: this.kmsKeyId,
        KeySpec: 'AES_256',
        EncryptionContext: {
          purpose: 'PHI_ENCRYPTION',
          ...encryptionContext
        }
      });

      const { Plaintext: dataKey, CiphertextBlob: encryptedDataKey } = 
        await this.kmsClient.send(generateKeyCommand);

      if (!dataKey || !encryptedDataKey) {
        throw new Error('Failed to generate data key');
      }

      // Encrypt the data with the plaintext data key
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(algorithm, Buffer.from(dataKey));
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Get the authentication tag for GCM mode
      const authTag = (cipher as any).getAuthTag?.() || Buffer.alloc(0);

      // Combine encrypted data key, IV, auth tag, and encrypted data
      const encryptedData = {
        encryptedDataKey: Buffer.from(encryptedDataKey).toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted
      };

      return {
        encrypted: Buffer.from(JSON.stringify(encryptedData)).toString('base64'),
        keyId: this.kmsKeyId,
        context: JSON.stringify(encryptionContext)
      };

    } catch (error) {
      logger.error('Encryption failed', { error, encryptionContext });
      throw new AppError('Failed to encrypt data', 500, 'ENCRYPTION_FAILED');
    }
  }

  /**
   * Decrypt PHI data using KMS envelope decryption
   */
  async decryptPHI(encryptedField: EncryptedField): Promise<string> {
    if (!encryptedField.encrypted) {
      throw new AppError('Invalid encrypted field', 400, 'INVALID_ENCRYPTED_FIELD');
    }

    try {
      // Parse the encrypted data structure
      const encryptedData = JSON.parse(
        Buffer.from(encryptedField.encrypted, 'base64').toString()
      );

      const encryptionContext = encryptedField.context ? 
        JSON.parse(encryptedField.context) : {};

      // Decrypt the data key with KMS
      const decryptKeyCommand = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedData.encryptedDataKey, 'base64'),
        EncryptionContext: {
          purpose: 'PHI_ENCRYPTION',
          ...encryptionContext
        }
      });

      const { Plaintext: dataKey } = await this.kmsClient.send(decryptKeyCommand);

      if (!dataKey) {
        throw new Error('Failed to decrypt data key');
      }

      // Decrypt the data with the plaintext data key
      const algorithm = 'aes-256-gcm';
      const decipher = crypto.createDecipher(algorithm, Buffer.from(dataKey));
      
      // Set auth tag if available
      if (encryptedData.authTag) {
        (decipher as any).setAuthTag?.(Buffer.from(encryptedData.authTag, 'base64'));
      }

      let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      logger.error('Decryption failed', { error, keyId: encryptedField.keyId });
      throw new AppError('Failed to decrypt data', 500, 'DECRYPTION_FAILED');
    }
  }

  /**
   * Encrypt multiple PHI fields in batch for efficiency
   */
  async encryptBatch(
    fields: Array<{ key: string; value: string; context?: Record<string, string> }>
  ): Promise<Record<string, EncryptedField>> {
    const results: Record<string, EncryptedField> = {};

    // Process in parallel for better performance
    const encryptionPromises = fields.map(async (field) => {
      if (field.value && field.value.trim()) {
        results[field.key] = await this.encryptPHI(field.value, {
          field: field.key,
          ...field.context
        });
      }
    });

    await Promise.all(encryptionPromises);
    return results;
  }

  /**
   * Decrypt multiple PHI fields in batch
   */
  async decryptBatch(
    encryptedFields: Record<string, EncryptedField>
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    const decryptionPromises = Object.entries(encryptedFields).map(
      async ([key, encryptedField]) => {
        try {
          results[key] = await this.decryptPHI(encryptedField);
        } catch (error) {
          logger.warn(`Failed to decrypt field: ${key}`, error);
          results[key] = '[DECRYPTION_FAILED]';
        }
      }
    );

    await Promise.all(decryptionPromises);
    return results;
  }

  /**
   * Generate encrypted search tokens for PHI data
   * Allows searching without exposing PHI
   */
  async generateSearchTokens(
    plaintext: string,
    salt: string = ''
  ): Promise<EncryptedField> {
    // Create searchable tokens from the plaintext
    const tokens = this.createSearchTokens(plaintext);
    const searchData = tokens.join(' ').toLowerCase();
    
    // Add salt to prevent rainbow table attacks
    const saltedData = `${searchData}:${salt}`;
    
    return this.encryptPHI(saltedData, {
      purpose: 'SEARCH_TOKENS',
      type: 'PHI_SEARCH'
    });
  }

  /**
   * Create search tokens from plaintext
   */
  private createSearchTokens(text: string): string[] {
    const cleanText = text.toLowerCase().replace(/[^\w\s]/g, '');
    const words = cleanText.split(/\s+/).filter(word => word.length > 0);
    
    const tokens = new Set<string>();
    
    // Add whole words
    words.forEach(word => tokens.add(word));
    
    // Add partial matches for names (first 3+ characters)
    words.forEach(word => {
      if (word.length >= 3) {
        for (let i = 3; i <= Math.min(word.length, 8); i++) {
          tokens.add(word.substring(0, i));
        }
      }
    });
    
    // Add phone number digits (if numeric)
    const digitsOnly = text.replace(/\D/g, '');
    if (digitsOnly.length >= 7) {
      tokens.add(digitsOnly);
      // Add formatted versions
      if (digitsOnly.length === 10) {
        tokens.add(digitsOnly.substring(0, 3)); // Area code
        tokens.add(digitsOnly.substring(3, 6)); // Exchange
      }
    }
    
    return Array.from(tokens);
  }

  /**
   * Hash sensitive data for indexing (one-way, not reversible)
   * Used for creating deterministic keys for duplicate detection
   */
  hashForIndex(data: string, salt: string = ''): string {
    const hash = crypto.createHash('sha256');
    hash.update(`${data}:${salt}`);
    return hash.digest('hex');
  }

  /**
   * Generate a secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Create HIPAA audit hash for data integrity verification
   */
  createAuditHash(data: any): string {
    const serialized = JSON.stringify(data, Object.keys(data).sort());
    const hash = crypto.createHash('sha256');
    hash.update(serialized);
    return hash.digest('hex');
  }

  /**
   * Verify data integrity using audit hash
   */
  verifyAuditHash(data: any, expectedHash: string): boolean {
    const currentHash = this.createAuditHash(data);
    return crypto.timingSafeEqual(
      Buffer.from(currentHash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();

// Helper functions for common PHI encryption patterns
export async function encryptPatientPHI(patient: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssn?: string;
  phone: string;
  email?: string;
  address: any;
}) {
  const clinicId = 'context_clinic_id'; // Should be passed from request context
  
  return await encryptionService.encryptBatch([
    { key: 'firstName', value: patient.firstName, context: { clinicId, type: 'patient_name' } },
    { key: 'lastName', value: patient.lastName, context: { clinicId, type: 'patient_name' } },
    { key: 'dateOfBirth', value: patient.dateOfBirth, context: { clinicId, type: 'patient_dob' } },
    ...(patient.ssn ? [{ key: 'ssn', value: patient.ssn, context: { clinicId, type: 'patient_ssn' } }] : []),
    { key: 'phone', value: patient.phone, context: { clinicId, type: 'patient_contact' } },
    ...(patient.email ? [{ key: 'email', value: patient.email, context: { clinicId, type: 'patient_contact' } }] : []),
    { key: 'address', value: JSON.stringify(patient.address), context: { clinicId, type: 'patient_address' } }
  ]);
}

export async function decryptPatientPHI(encryptedFields: Record<string, EncryptedField>) {
  return await encryptionService.decryptBatch(encryptedFields);
}

export { };