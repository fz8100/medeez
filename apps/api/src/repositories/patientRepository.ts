import { BaseRepository, PaginatedResult } from './base';
import { Patient, PatientKeys, CreatePatientInput, UpdatePatientInput, generatePatientSearchTokens } from '@/models/patient';
import { QueryOptions, ValidationError, NotFoundError } from '@/types';
import { encryptionService } from '@/utils/encryption';
import { nanoid } from 'nanoid';
import { logger } from '@/utils/logger';

export class PatientRepository extends BaseRepository<Patient> {
  protected getEntityType(): string {
    return 'PATIENT';
  }

  protected validateEntity(entity: Partial<Patient>): void {
    // Basic validation - more comprehensive validation should use Zod schemas
    if (entity.firstName && typeof entity.firstName !== 'object') {
      throw new ValidationError('Patient data must be properly encrypted');
    }
  }

  protected transformForStorage(patient: Patient): Record<string, any> {
    // DynamoDB storage format with all GSI keys
    return {
      ...patient,
      // Ensure all GSI keys are present
      GSI1PK: patient.GSI1PK || `ENTITY#PATIENT`,
      GSI1SK: patient.GSI1SK || `${patient.clinicId}#${patient.patientId}`,
      GSI2PK: patient.GSI2PK || `PATIENT#${patient.patientId}`,
      GSI2SK: patient.GSI2SK || 'PROFILE',
      GSI4PK: patient.GSI4PK || `STATE#${patient.address.state}`,
      GSI4SK: patient.GSI4SK || `${patient.clinicId}#PATIENT`,
      // Include email in GSI5 only if email exists
      ...(patient.email ? {
        GSI5PK: `EMAIL#${JSON.stringify(patient.email).toLowerCase()}`,
        GSI5SK: 'PATIENT'
      } : {})
    };
  }

  protected transformFromStorage(item: Record<string, any>): Patient {
    return item as Patient;
  }

  /**
   * Create new patient with PHI encryption
   */
  async createPatient(clinicId: string, patientData: CreatePatientInput): Promise<Patient> {
    const patientId = nanoid();
    
    try {
      // Encrypt PHI fields
      const encryptedFields = await encryptionService.encryptBatch([
        { key: 'firstName', value: patientData.firstName, context: { clinicId, type: 'patient_name' } },
        { key: 'lastName', value: patientData.lastName, context: { clinicId, type: 'patient_name' } },
        { key: 'fullName', value: `${patientData.firstName} ${patientData.lastName}`, context: { clinicId, type: 'patient_name' } },
        { key: 'dateOfBirth', value: patientData.dateOfBirth, context: { clinicId, type: 'patient_dob' } },
        { key: 'phone', value: patientData.phone, context: { clinicId, type: 'patient_contact' } },
        ...(patientData.email ? [{ key: 'email', value: patientData.email, context: { clinicId, type: 'patient_contact' } }] : []),
        { key: 'address_street', value: patientData.address.street, context: { clinicId, type: 'patient_address' } },
        { key: 'address_city', value: patientData.address.city, context: { clinicId, type: 'patient_address' } },
        { key: 'address_zipCode', value: patientData.address.zipCode, context: { clinicId, type: 'patient_address' } },
        ...(patientData.ssn ? [{ key: 'ssn', value: patientData.ssn, context: { clinicId, type: 'patient_ssn' } }] : [])
      ]);

      // Encrypt emergency contact if provided
      let encryptedEmergencyContact;
      if (patientData.emergencyContact) {
        const emergencyFields = await encryptionService.encryptBatch([
          { key: 'name', value: patientData.emergencyContact.name, context: { clinicId, type: 'emergency_contact' } },
          { key: 'relationship', value: patientData.emergencyContact.relationship, context: { clinicId, type: 'emergency_contact' } },
          { key: 'phone', value: patientData.emergencyContact.phone, context: { clinicId, type: 'emergency_contact' } }
        ]);
        
        encryptedEmergencyContact = {
          name: emergencyFields.name,
          relationship: emergencyFields.relationship,
          phone: emergencyFields.phone
        };
      }

      // Encrypt insurance information if provided
      let encryptedInsurance;
      if (patientData.insurance) {
        const insuranceFields: any[] = [];
        
        if (patientData.insurance.primary) {
          insuranceFields.push(
            { key: 'primary_company', value: patientData.insurance.primary.company, context: { clinicId, type: 'insurance' } },
            { key: 'primary_memberId', value: patientData.insurance.primary.memberId, context: { clinicId, type: 'insurance' } }
          );
          
          if (patientData.insurance.primary.groupNumber) {
            insuranceFields.push({ key: 'primary_groupNumber', value: patientData.insurance.primary.groupNumber, context: { clinicId, type: 'insurance' } });
          }
          if (patientData.insurance.primary.planName) {
            insuranceFields.push({ key: 'primary_planName', value: patientData.insurance.primary.planName, context: { clinicId, type: 'insurance' } });
          }
        }

        if (patientData.insurance.secondary) {
          insuranceFields.push(
            { key: 'secondary_company', value: patientData.insurance.secondary.company, context: { clinicId, type: 'insurance' } },
            { key: 'secondary_memberId', value: patientData.insurance.secondary.memberId, context: { clinicId, type: 'insurance' } }
          );
          
          if (patientData.insurance.secondary.groupNumber) {
            insuranceFields.push({ key: 'secondary_groupNumber', value: patientData.insurance.secondary.groupNumber, context: { clinicId, type: 'insurance' } });
          }
          if (patientData.insurance.secondary.planName) {
            insuranceFields.push({ key: 'secondary_planName', value: patientData.insurance.secondary.planName, context: { clinicId, type: 'insurance' } });
          }
        }

        if (insuranceFields.length > 0) {
          const encryptedInsuranceFields = await encryptionService.encryptBatch(insuranceFields);
          
          encryptedInsurance = {
            ...(patientData.insurance.primary && {
              primary: {
                company: encryptedInsuranceFields.primary_company,
                memberId: encryptedInsuranceFields.primary_memberId,
                groupNumber: encryptedInsuranceFields.primary_groupNumber,
                planName: encryptedInsuranceFields.primary_planName,
                copay: patientData.insurance.primary.copay,
                deductible: patientData.insurance.primary.deductible
              }
            }),
            ...(patientData.insurance.secondary && {
              secondary: {
                company: encryptedInsuranceFields.secondary_company,
                memberId: encryptedInsuranceFields.secondary_memberId,
                groupNumber: encryptedInsuranceFields.secondary_groupNumber,
                planName: encryptedInsuranceFields.secondary_planName
              }
            })
          };
        }
      }

      // Generate encrypted search tokens
      const searchTokens = await encryptionService.generateSearchTokens(
        generatePatientSearchTokens({
          firstName: patientData.firstName,
          lastName: patientData.lastName,
          phone: patientData.phone,
          email: patientData.email
        }),
        clinicId
      );

      // Create patient entity
      const patient: Patient = {
        ...PatientKeys.forCreation(clinicId, patientId, patientData.address.state, patientData.email),
        entityType: 'PATIENT',
        clinicId,
        patientId,
        
        // Encrypted PHI fields
        firstName: encryptedFields.firstName,
        lastName: encryptedFields.lastName,
        fullName: encryptedFields.fullName,
        dateOfBirth: encryptedFields.dateOfBirth,
        phone: encryptedFields.phone,
        email: encryptedFields.email,
        ssn: encryptedFields.ssn,
        
        gender: patientData.gender,
        
        // Encrypted address
        address: {
          street: encryptedFields.address_street,
          city: encryptedFields.address_city,
          state: patientData.address.state, // Not encrypted for filtering
          zipCode: encryptedFields.address_zipCode,
          country: patientData.address.country
        },
        
        emergencyContact: encryptedEmergencyContact,
        insurance: encryptedInsurance,
        
        // Default values
        allergies: [],
        medications: [],
        conditions: [],
        preferredLanguage: patientData.preferredLanguage || 'en',
        communicationPreferences: {
          sms: true,
          email: !!patientData.email,
          phone: false,
          reminderTime: 24
        },
        portalAccess: {
          enabled: true
        },
        stats: {
          totalAppointments: 0,
          completedAppointments: 0,
          noShowCount: 0,
          cancelledCount: 0
        },
        financial: {
          outstandingBalance: 0,
          totalPaid: 0,
          totalBilled: 0
        },
        isActive: true,
        tags: [],
        notes: patientData.notes,
        searchTokens,
        
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      return await this.create(patient);
      
    } catch (error) {
      logger.error('Failed to create patient', { clinicId, error });
      throw error;
    }
  }

  /**
   * Get patient by ID with decrypted PHI
   */
  async getPatient(clinicId: string, patientId: string): Promise<Patient | null> {
    const keys = PatientKeys.primary(clinicId, patientId);
    
    const patient = await this.get(keys.PK, keys.SK);
    if (!patient) {
      return null;
    }

    // Decrypt PHI fields for authorized access
    return await this.decryptPatientPHI(patient);
  }

  /**
   * List patients for a clinic with search and pagination
   */
  async listPatients(
    clinicId: string,
    options: QueryOptions & {
      search?: string;
      state?: string;
      isActive?: boolean;
    } = {}
  ): Promise<PaginatedResult<Patient>> {
    try {
      let queryConfig: any = {
        pk: `TENANT#${clinicId}`,
        skCondition: 'begins_with(SK, :sk)',
        skValue: 'PATIENT#'
      };

      // Use GSI4 for state filtering
      if (options.state) {
        queryConfig = {
          pk: `STATE#${options.state}`,
          skCondition: 'begins_with(SK, :sk)',
          skValue: `${clinicId}#PATIENT`
        };
      }

      const result = await this.query(queryConfig, {
        ...options,
        indexName: options.state ? 'GSI4' : undefined,
        projectionExpression: 'PK, SK, patientId, firstName, lastName, phone, email, address, isActive, stats, createdAt, updatedAt'
      });

      // Filter by active status if specified
      let filteredItems = result.items;
      if (options.isActive !== undefined) {
        filteredItems = result.items.filter(patient => patient.isActive === options.isActive);
      }

      // Decrypt PHI for display
      const decryptedPatients = await Promise.all(
        filteredItems.map(patient => this.decryptPatientPHI(patient, ['firstName', 'lastName', 'phone', 'email']))
      );

      return {
        items: decryptedPatients,
        nextToken: result.nextToken,
        hasMore: result.hasMore,
        count: decryptedPatients.length
      };
      
    } catch (error) {
      logger.error('Failed to list patients', { clinicId, error });
      throw error;
    }
  }

  /**
   * Search patients by encrypted search tokens
   */
  async searchPatients(
    clinicId: string,
    searchTerm: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Patient>> {
    // For now, we'll use the list method with client-side filtering
    // In a production system, this would use encrypted search indexes
    const allPatients = await this.listPatients(clinicId, options);
    
    // Filter results based on decrypted fields
    const searchLower = searchTerm.toLowerCase();
    const matchedPatients = allPatients.items.filter((patient: any) => {
      return (
        patient.firstName?.toLowerCase().includes(searchLower) ||
        patient.lastName?.toLowerCase().includes(searchLower) ||
        patient.phone?.includes(searchTerm) ||
        patient.email?.toLowerCase().includes(searchLower)
      );
    });

    return {
      items: matchedPatients,
      nextToken: undefined,
      hasMore: false,
      count: matchedPatients.length
    };
  }

  /**
   * Update patient with PHI re-encryption
   */
  async updatePatient(
    clinicId: string,
    patientId: string,
    updates: UpdatePatientInput
  ): Promise<Patient> {
    const keys = PatientKeys.primary(clinicId, patientId);
    
    // Get current patient
    const currentPatient = await this.get(keys.PK, keys.SK);
    if (!currentPatient) {
      throw new NotFoundError('Patient');
    }

    try {
      // Encrypt updated PHI fields
      const fieldsToEncrypt: any[] = [];
      
      if (updates.firstName) {
        fieldsToEncrypt.push({ key: 'firstName', value: updates.firstName, context: { clinicId, type: 'patient_name' } });
      }
      if (updates.lastName) {
        fieldsToEncrypt.push({ key: 'lastName', value: updates.lastName, context: { clinicId, type: 'patient_name' } });
      }
      if (updates.firstName || updates.lastName) {
        const fullName = `${updates.firstName || ''} ${updates.lastName || ''}`.trim();
        fieldsToEncrypt.push({ key: 'fullName', value: fullName, context: { clinicId, type: 'patient_name' } });
      }
      if (updates.phone) {
        fieldsToEncrypt.push({ key: 'phone', value: updates.phone, context: { clinicId, type: 'patient_contact' } });
      }
      if (updates.email) {
        fieldsToEncrypt.push({ key: 'email', value: updates.email, context: { clinicId, type: 'patient_contact' } });
      }
      if (updates.dateOfBirth) {
        fieldsToEncrypt.push({ key: 'dateOfBirth', value: updates.dateOfBirth, context: { clinicId, type: 'patient_dob' } });
      }
      if (updates.ssn) {
        fieldsToEncrypt.push({ key: 'ssn', value: updates.ssn, context: { clinicId, type: 'patient_ssn' } });
      }

      let encryptedFields: any = {};
      if (fieldsToEncrypt.length > 0) {
        encryptedFields = await encryptionService.encryptBatch(fieldsToEncrypt);
      }

      // Build update object
      const updateData: any = {
        ...updates,
        ...encryptedFields
      };

      // Update search tokens if name/phone/email changed
      if (updates.firstName || updates.lastName || updates.phone || updates.email) {
        const searchTokens = await encryptionService.generateSearchTokens(
          generatePatientSearchTokens({
            firstName: updates.firstName || '',
            lastName: updates.lastName || '',
            phone: updates.phone || '',
            email: updates.email
          }),
          clinicId
        );
        updateData.searchTokens = searchTokens;
      }

      const updatedPatient = await this.update(keys.PK, keys.SK, updateData);
      return await this.decryptPatientPHI(updatedPatient);
      
    } catch (error) {
      logger.error('Failed to update patient', { clinicId, patientId, error });
      throw error;
    }
  }

  /**
   * Delete patient (soft delete)
   */
  async deletePatient(clinicId: string, patientId: string): Promise<void> {
    const keys = PatientKeys.primary(clinicId, patientId);
    
    // Soft delete by setting isActive to false
    await this.update(keys.PK, keys.SK, { isActive: false });
    
    logger.info('Patient soft deleted', { clinicId, patientId });
  }

  /**
   * Get patients by state (using GSI4)
   */
  async getPatientsByState(
    clinicId: string,
    state: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Patient>> {
    const result = await this.query({
      pk: `STATE#${state}`,
      skCondition: 'begins_with(SK, :sk)',
      skValue: `${clinicId}#PATIENT`
    }, {
      ...options,
      indexName: 'GSI4'
    });

    const decryptedPatients = await Promise.all(
      result.items.map(patient => this.decryptPatientPHI(patient))
    );

    return {
      items: decryptedPatients,
      nextToken: result.nextToken,
      hasMore: result.hasMore,
      count: decryptedPatients.length
    };
  }

  /**
   * Get patient by email (using GSI5)
   */
  async getPatientByEmail(email: string): Promise<Patient | null> {
    const result = await this.query({
      pk: `EMAIL#${email.toLowerCase()}`,
      skCondition: 'SK = :sk',
      skValue: 'PATIENT'
    }, {
      indexName: 'GSI5',
      limit: 1
    });

    if (result.items.length === 0) {
      return null;
    }

    return await this.decryptPatientPHI(result.items[0]);
  }

  /**
   * Decrypt patient PHI fields
   */
  private async decryptPatientPHI(
    patient: Patient, 
    fieldsToDecrypt?: string[]
  ): Promise<Patient> {
    const fieldsMap: Record<string, any> = {
      firstName: patient.firstName,
      lastName: patient.lastName,
      fullName: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
      phone: patient.phone,
      email: patient.email,
      ssn: patient.ssn
    };

    // Filter fields to decrypt if specified
    const targetFields = fieldsToDecrypt || Object.keys(fieldsMap);
    const encryptedFieldsToDecrypt: Record<string, any> = {};
    
    targetFields.forEach(field => {
      if (fieldsMap[field]) {
        encryptedFieldsToDecrypt[field] = fieldsMap[field];
      }
    });

    if (Object.keys(encryptedFieldsToDecrypt).length === 0) {
      return patient;
    }

    try {
      const decryptedFields = await encryptionService.decryptBatch(encryptedFieldsToDecrypt);
      
      return {
        ...patient,
        ...decryptedFields
      } as any;
      
    } catch (error) {
      logger.error('Failed to decrypt patient PHI', { patientId: patient.patientId, error });
      // Return patient with encrypted fields as-is rather than failing
      return patient;
    }
  }
}

export { };