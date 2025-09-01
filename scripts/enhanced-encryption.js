#!/usr/bin/env node
/**
 * Enhanced PHI Encryption Service for Medeez v2
 * HIPAA-compliant field-level encryption with KMS integration
 * Supports batch operations and search token generation
 */

const { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand, CreateKeyCommand, DescribeKeyCommand } = require('@aws-sdk/client-kms');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class EnhancedEncryptionService {
    constructor(environment = 'dev', region = 'us-east-1') {
        this.environment = environment;
        this.region = region;
        
        // Initialize AWS clients
        this.kmsClient = new KMSClient({ region });
        this.dynamoClient = new DynamoDBClient({ region });
        this.docClient = DynamoDBDocumentClient.from(this.dynamoClient);
        
        // Encryption configuration
        this.algorithm = 'aes-256-gcm';
        this.keySpec = 'AES_256';
        this.tableName = `medeez-${environment}-app`;
        
        // KMS key configuration
        this.clinicKeys = new Map(); // Cache clinic-specific keys
        this.masterKeyId = null;
    }

    /**
     * Initialize or get the master KMS key for the environment
     */
    async getMasterKey() {
        if (this.masterKeyId) {
            return this.masterKeyId;
        }

        const keyAlias = `alias/medeez-${this.environment}-master`;
        
        try {
            // Try to get existing key
            const describeResponse = await this.kmsClient.send(new DescribeKeyCommand({
                KeyId: keyAlias
            }));
            
            this.masterKeyId = describeResponse.KeyMetadata.KeyId;
            console.log(`Using existing master key: ${keyAlias}`);
            
        } catch (error) {
            if (error.name === 'NotFoundException') {
                // Create new master key
                const createResponse = await this.kmsClient.send(new CreateKeyCommand({
                    Description: `Medeez ${this.environment} master encryption key for PHI data`,
                    Usage: 'ENCRYPT_DECRYPT',
                    KeySpec: 'SYMMETRIC_DEFAULT',
                    Tags: [
                        { TagKey: 'Environment', TagValue: this.environment },
                        { TagKey: 'Project', TagValue: 'Medeez' },
                        { TagKey: 'Purpose', TagValue: 'PHI-Encryption' }
                    ]
                }));
                
                this.masterKeyId = createResponse.KeyMetadata.KeyId;
                console.log(`Created new master key: ${this.masterKeyId}`);
                
                // Create alias
                await this.kmsClient.send(new CreateAliasCommand({
                    AliasName: keyAlias,
                    TargetKeyId: this.masterKeyId
                }));
                
            } else {
                throw error;
            }
        }
        
        return this.masterKeyId;
    }

    /**
     * Get or create clinic-specific encryption context
     */
    getEncryptionContext(clinicId, fieldType, additionalContext = {}) {
        return {
            clinicId,
            fieldType,
            environment: this.environment,
            version: '2.0',
            ...additionalContext
        };
    }

    /**
     * Encrypt PHI data with enhanced security
     */
    async encryptPHI(plaintext, clinicId, fieldType, additionalContext = {}) {
        if (!plaintext || typeof plaintext !== 'string' || plaintext.trim() === '') {
            throw new Error('Cannot encrypt empty or invalid plaintext');
        }

        try {
            const masterKey = await this.getMasterKey();
            const encryptionContext = this.getEncryptionContext(clinicId, fieldType, additionalContext);
            
            // Generate data key using envelope encryption
            const dataKeyResponse = await this.kmsClient.send(new GenerateDataKeyCommand({
                KeyId: masterKey,
                KeySpec: this.keySpec,
                EncryptionContext: encryptionContext
            }));

            const { Plaintext: dataKey, CiphertextBlob: encryptedDataKey } = dataKeyResponse;

            // Compress data if it's large (>1KB)
            let dataToEncrypt = plaintext;
            let compressed = false;
            
            if (plaintext.length > 1024) {
                const compressedBuffer = await gzip(Buffer.from(plaintext, 'utf8'));
                dataToEncrypt = compressedBuffer.toString('base64');
                compressed = true;
            }

            // Encrypt the data using AES-GCM
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipherGCM(this.algorithm, dataKey);
            cipher.setAAD(Buffer.from(JSON.stringify(encryptionContext)));
            
            let encrypted = cipher.update(dataToEncrypt, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();

            // Create encrypted field structure
            const encryptedField = {
                encrypted: Buffer.from(JSON.stringify({
                    encryptedDataKey: Buffer.from(encryptedDataKey).toString('base64'),
                    iv: iv.toString('base64'),
                    authTag: authTag.toString('base64'),
                    data: encrypted,
                    compressed
                })).toString('base64'),
                keyId: masterKey,
                context: JSON.stringify(encryptionContext),
                version: '2.0',
                timestamp: new Date().toISOString()
            };

            return encryptedField;

        } catch (error) {
            console.error('PHI encryption failed:', { 
                error: error.message, 
                clinicId, 
                fieldType 
            });
            throw new Error('Failed to encrypt PHI data');
        }
    }

    /**
     * Decrypt PHI data
     */
    async decryptPHI(encryptedField) {
        if (!encryptedField || !encryptedField.encrypted) {
            throw new Error('Invalid encrypted field structure');
        }

        try {
            // Parse encrypted data structure
            const encryptedData = JSON.parse(
                Buffer.from(encryptedField.encrypted, 'base64').toString()
            );

            const encryptionContext = JSON.parse(encryptedField.context || '{}');

            // Decrypt the data key
            const decryptKeyResponse = await this.kmsClient.send(new DecryptCommand({
                CiphertextBlob: Buffer.from(encryptedData.encryptedDataKey, 'base64'),
                EncryptionContext: encryptionContext
            }));

            const dataKey = decryptKeyResponse.Plaintext;

            // Decrypt the data using AES-GCM
            const decipher = crypto.createDecipherGCM(this.algorithm, dataKey);
            decipher.setAAD(Buffer.from(JSON.stringify(encryptionContext)));
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));

            let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            // Decompress if necessary
            if (encryptedData.compressed) {
                const decompressedBuffer = await gunzip(Buffer.from(decrypted, 'base64'));
                decrypted = decompressedBuffer.toString('utf8');
            }

            return decrypted;

        } catch (error) {
            console.error('PHI decryption failed:', error.message);
            throw new Error('Failed to decrypt PHI data');
        }
    }

    /**
     * Batch encrypt multiple PHI fields
     */
    async encryptBatch(fields, clinicId) {
        const results = {};
        const promises = [];

        for (const [fieldName, fieldData] of Object.entries(fields)) {
            if (fieldData && fieldData.value) {
                promises.push(
                    this.encryptPHI(
                        fieldData.value, 
                        clinicId, 
                        fieldData.type || fieldName,
                        fieldData.context || {}
                    ).then(encrypted => {
                        results[fieldName] = encrypted;
                    }).catch(error => {
                        console.error(`Failed to encrypt field ${fieldName}:`, error.message);
                        results[fieldName] = null;
                    })
                );
            }
        }

        await Promise.all(promises);
        return results;
    }

    /**
     * Batch decrypt multiple PHI fields
     */
    async decryptBatch(encryptedFields) {
        const results = {};
        const promises = [];

        for (const [fieldName, encryptedField] of Object.entries(encryptedFields)) {
            if (encryptedField && encryptedField.encrypted) {
                promises.push(
                    this.decryptPHI(encryptedField).then(decrypted => {
                        results[fieldName] = decrypted;
                    }).catch(error => {
                        console.error(`Failed to decrypt field ${fieldName}:`, error.message);
                        results[fieldName] = '[DECRYPTION_FAILED]';
                    })
                );
            }
        }

        await Promise.all(promises);
        return results;
    }

    /**
     * Generate searchable tokens for PHI data
     */
    async generateSearchTokens(plaintext, clinicId) {
        if (!plaintext) return null;

        // Create search tokens
        const tokens = this.createSearchTokens(plaintext);
        const searchData = tokens.join(' ').toLowerCase();
        
        // Add clinic-specific salt
        const salt = crypto.createHash('sha256')
            .update(`${clinicId}:search_salt:${this.environment}`)
            .digest('hex').substring(0, 16);
        
        const saltedData = `${searchData}:${salt}`;
        
        // Encrypt the search tokens
        return await this.encryptPHI(
            saltedData, 
            clinicId, 
            'search_tokens',
            { purpose: 'search', tokenCount: tokens.length }
        );
    }

    /**
     * Create search tokens from plaintext
     */
    createSearchTokens(text) {
        const cleanText = text.toLowerCase()
            .replace(/[^\w\s@.-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        const tokens = new Set();
        const words = cleanText.split(' ').filter(word => word.length > 0);
        
        // Add complete words
        words.forEach(word => {
            tokens.add(word);
            
            // Add partial matches for names (3+ characters)
            if (word.length >= 3 && word.match(/^[a-z]+$/)) {
                for (let i = 3; i <= Math.min(word.length, 8); i++) {
                    tokens.add(word.substring(0, i));
                }
            }
        });
        
        // Extract phone numbers
        const phoneDigits = text.replace(/\D/g, '');
        if (phoneDigits.length >= 10) {
            tokens.add(phoneDigits);
            if (phoneDigits.length === 10) {
                tokens.add(phoneDigits.substring(0, 3)); // Area code
                tokens.add(phoneDigits.substring(3, 6)); // Exchange
                tokens.add(phoneDigits.substring(6));    // Number
            }
        }
        
        // Extract email parts
        const emailMatch = text.match(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)/);
        if (emailMatch) {
            tokens.add(emailMatch[1]); // Username part
            tokens.add(emailMatch[2]); // Domain part
        }
        
        return Array.from(tokens);
    }

    /**
     * Create deterministic hash for duplicate detection (one-way)
     */
    createDeterministicHash(data, clinicId, fieldType) {
        const salt = crypto.createHash('sha256')
            .update(`${clinicId}:${fieldType}:${this.environment}`)
            .digest('hex');
        
        return crypto.createHash('sha256')
            .update(`${data}:${salt}`)
            .digest('hex');
    }

    /**
     * Encrypt patient demographics
     */
    async encryptPatientData(patient, clinicId) {
        const fields = {
            firstName: { value: patient.firstName, type: 'patient_name' },
            lastName: { value: patient.lastName, type: 'patient_name' },
            dateOfBirth: { value: patient.dateOfBirth, type: 'patient_dob' },
            phone: { value: patient.phone, type: 'patient_contact' },
            email: { value: patient.email, type: 'patient_contact' },
            ssn: { value: patient.ssn, type: 'patient_ssn' },
        };

        // Add address fields
        if (patient.address) {
            fields.address_street = { value: patient.address.street, type: 'patient_address' };
            fields.address_city = { value: patient.address.city, type: 'patient_address' };
            fields.address_zipCode = { value: patient.address.zipCode, type: 'patient_address' };
        }

        // Add emergency contact
        if (patient.emergencyContact) {
            fields.emergency_name = { value: patient.emergencyContact.name, type: 'emergency_contact' };
            fields.emergency_phone = { value: patient.emergencyContact.phone, type: 'emergency_contact' };
            fields.emergency_relationship = { value: patient.emergencyContact.relationship, type: 'emergency_contact' };
        }

        // Add insurance information
        if (patient.insurance?.primary) {
            fields.insurance_company = { value: patient.insurance.primary.company, type: 'insurance' };
            fields.insurance_memberId = { value: patient.insurance.primary.memberId, type: 'insurance' };
            fields.insurance_groupNumber = { value: patient.insurance.primary.groupNumber, type: 'insurance' };
        }

        // Generate search tokens
        const searchText = `${patient.firstName} ${patient.lastName} ${patient.phone} ${patient.email || ''}`.trim();
        const searchTokens = await this.generateSearchTokens(searchText, clinicId);

        // Encrypt all fields
        const encryptedFields = await this.encryptBatch(fields, clinicId);
        
        return {
            ...encryptedFields,
            searchTokens,
            fullNameHash: this.createDeterministicHash(`${patient.firstName} ${patient.lastName}`, clinicId, 'full_name'),
            phoneHash: this.createDeterministicHash(patient.phone, clinicId, 'phone'),
            emailHash: patient.email ? this.createDeterministicHash(patient.email, clinicId, 'email') : null
        };
    }

    /**
     * Encrypt SOAP note content
     */
    async encryptSOAPNote(noteContent, clinicId) {
        const fields = {};
        
        if (noteContent.subjective) {
            fields.subjective = { value: noteContent.subjective, type: 'soap_subjective' };
        }
        if (noteContent.objective) {
            fields.objective = { value: noteContent.objective, type: 'soap_objective' };
        }
        if (noteContent.assessment) {
            fields.assessment = { value: noteContent.assessment, type: 'soap_assessment' };
        }
        if (noteContent.plan) {
            fields.plan = { value: noteContent.plan, type: 'soap_plan' };
        }

        // Generate search tokens from all SOAP content
        const searchText = Object.values(noteContent).join(' ');
        const searchTokens = await this.generateSearchTokens(searchText, clinicId);

        const encryptedFields = await this.encryptBatch(fields, clinicId);
        
        return {
            content: encryptedFields,
            searchTokens,
            contentHash: this.createDeterministicHash(searchText, clinicId, 'soap_content')
        };
    }

    /**
     * Validate encryption key integrity
     */
    async validateKeyIntegrity(clinicId) {
        try {
            const testData = `Test encryption for clinic ${clinicId} at ${Date.now()}`;
            const encrypted = await this.encryptPHI(testData, clinicId, 'test');
            const decrypted = await this.decryptPHI(encrypted);
            
            return {
                valid: decrypted === testData,
                clinicId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                valid: false,
                clinicId,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Rotate encryption keys for a clinic (advanced feature)
     */
    async rotateClinicKey(clinicId) {
        // This would involve re-encrypting all PHI data with a new key
        // Implementation would require careful planning and could be run as a background job
        console.log(`Key rotation for clinic ${clinicId} would be implemented here`);
        return { status: 'not_implemented' };
    }

    /**
     * Generate encryption statistics
     */
    async getEncryptionStats(clinicId = null) {
        try {
            // Query encrypted fields from DynamoDB
            let query = {
                TableName: this.tableName,
                IndexName: 'GSI1',
                ProjectionExpression: 'PK, SK, entityType, createdAt'
            };

            if (clinicId) {
                query.KeyConditionExpression = 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)';
                query.ExpressionAttributeValues = {
                    ':pk': 'ENTITY#PATIENT',
                    ':sk': `${clinicId}#`
                };
            } else {
                query.KeyConditionExpression = 'GSI1PK = :pk';
                query.ExpressionAttributeValues = {
                    ':pk': 'ENTITY#PATIENT'
                };
            }

            const response = await this.docClient.send(new QueryCommand(query));
            
            return {
                totalRecords: response.Items.length,
                clinicId,
                queriedAt: new Date().toISOString(),
                estimatedEncryptedFields: response.Items.length * 8 // Rough estimate
            };

        } catch (error) {
            console.error('Error getting encryption stats:', error);
            throw error;
        }
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = args[1] || process.env.NODE_ENV || 'dev';
    
    const encryptionService = new EnhancedEncryptionService(environment);
    
    try {
        switch (command) {
            case 'test':
                const clinicId = args[2] || 'clinic_test_001';
                console.log(`Testing encryption for clinic: ${clinicId}`);
                
                const testData = 'John Doe, DOB: 1980-01-01, Phone: (555) 123-4567';
                console.log('Original data:', testData);
                
                const encrypted = await encryptionService.encryptPHI(testData, clinicId, 'test_data');
                console.log('Encrypted successfully');
                
                const decrypted = await encryptionService.decryptPHI(encrypted);
                console.log('Decrypted data:', decrypted);
                console.log('Test passed:', decrypted === testData);
                break;
                
            case 'validate':
                const validateClinicId = args[2] || 'clinic_test_001';
                console.log(`Validating encryption integrity for clinic: ${validateClinicId}`);
                const validation = await encryptionService.validateKeyIntegrity(validateClinicId);
                console.log('Validation result:', validation);
                break;
                
            case 'stats':
                const statsClinicId = args[2] || null;
                console.log('Getting encryption statistics...');
                const stats = await encryptionService.getEncryptionStats(statsClinicId);
                console.log('Encryption statistics:', stats);
                break;
                
            case 'demo':
                const demoClinicId = args[2] || 'clinic_demo_001';
                console.log(`Running encryption demo for clinic: ${demoClinicId}`);
                
                // Demo patient data
                const patientData = {
                    firstName: 'Jane',
                    lastName: 'Smith',
                    dateOfBirth: '1985-06-15',
                    phone: '(555) 987-6543',
                    email: 'jane.smith@email.com',
                    ssn: '123-45-6789',
                    address: {
                        street: '123 Main St',
                        city: 'Anytown',
                        zipCode: '12345'
                    },
                    emergencyContact: {
                        name: 'John Smith',
                        phone: '(555) 987-6544',
                        relationship: 'Spouse'
                    }
                };
                
                console.log('Encrypting patient data...');
                const encryptedPatient = await encryptionService.encryptPatientData(patientData, demoClinicId);
                console.log('Patient data encrypted successfully');
                console.log('Search tokens generated:', !!encryptedPatient.searchTokens);
                console.log('Full name hash:', encryptedPatient.fullNameHash);
                
                // Decrypt first name to verify
                const decryptedFirstName = await encryptionService.decryptPHI(encryptedPatient.firstName);
                console.log('Decrypted first name:', decryptedFirstName);
                break;
                
            default:
                console.log('Usage: node enhanced-encryption.js [command] [environment] [options]');
                console.log('');
                console.log('Commands:');
                console.log('  test [clinicId]     - Test encryption/decryption');
                console.log('  validate [clinicId] - Validate encryption integrity');
                console.log('  stats [clinicId]    - Show encryption statistics');
                console.log('  demo [clinicId]     - Run encryption demo');
                console.log('');
                console.log('Environments: dev, staging, prod');
                process.exit(1);
        }
        
    } catch (error) {
        console.error('Command failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = EnhancedEncryptionService;