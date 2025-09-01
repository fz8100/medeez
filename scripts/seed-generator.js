#!/usr/bin/env node
/**
 * Comprehensive Development Seed Data Generator for Medeez v2
 * Generates HIPAA-compliant synthetic data for testing and development
 * Uses realistic but completely fake data
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { faker } = require('@faker-js/faker');
const crypto = require('crypto');
const EnhancedEncryptionService = require('./enhanced-encryption');
const RDSConnection = require('./rds-connection');

// Set faker to use consistent seed for reproducible data
faker.seed(12345);

class SeedDataGenerator {
    constructor(environment = 'dev', region = 'us-east-1') {
        this.environment = environment;
        this.region = region;
        this.tableName = `medeez-${environment}-app`;
        
        // Initialize services
        this.dynamoClient = new DynamoDBClient({ region });
        this.docClient = DynamoDBDocumentClient.from(this.dynamoClient);
        this.encryptionService = new EnhancedEncryptionService(environment, region);
        this.rdsConnection = new RDSConnection(environment, region);
        
        // Seed configuration
        this.config = {
            clinics: 3,
            usersPerClinic: {
                ADMIN: 1,
                DOCTOR: 2,
                STAFF: 3
            },
            patientsPerClinic: 50,
            appointmentsPerPatient: { min: 1, max: 5 },
            notesPerAppointment: 0.8, // 80% of appointments have notes
            invoicesPerAppointment: 0.9, // 90% of appointments have invoices
            timeRange: {
                pastDays: 90,
                futureDays: 30
            }
        };

        // Medical data references
        this.medicalData = {
            appointmentTypes: [
                'Annual Physical', 'Follow-up', 'Consultation', 'Urgent Care',
                'Routine Check-up', 'Lab Review', 'Specialist Referral',
                'Preventive Care', 'Chronic Disease Management', 'Mental Health'
            ],
            specialties: [
                'Family Medicine', 'Internal Medicine', 'Pediatrics', 'Psychiatry',
                'Cardiology', 'Dermatology', 'Orthopedics', 'OB/GYN'
            ],
            allergies: [
                'Penicillin', 'Shellfish', 'Peanuts', 'Tree nuts', 'Latex', 
                'Sulfa drugs', 'Aspirin', 'Iodine', 'Eggs', 'Milk'
            ],
            conditions: [
                'Hypertension', 'Diabetes Type 2', 'Hyperlipidemia', 'Asthma',
                'Depression', 'Anxiety', 'Arthritis', 'GERD', 'Migraine', 'Insomnia'
            ],
            medications: [
                'Lisinopril 10mg', 'Metformin 500mg', 'Atorvastatin 20mg', 
                'Albuterol inhaler', 'Sertraline 50mg', 'Omeprazole 20mg',
                'Ibuprofen 400mg', 'Levothyroxine 75mcg', 'Amlodipine 5mg'
            ],
            cptCodes: [
                { code: '99213', description: 'Office visit, established patient, level 3', price: 150 },
                { code: '99214', description: 'Office visit, established patient, level 4', price: 200 },
                { code: '99203', description: 'Office visit, new patient, level 3', price: 180 },
                { code: '99204', description: 'Office visit, new patient, level 4', price: 250 },
                { code: '90791', description: 'Psychiatric diagnostic evaluation', price: 300 },
                { code: '90834', description: 'Psychotherapy, 45 minutes', price: 120 },
                { code: '90837', description: 'Psychotherapy, 60 minutes', price: 160 },
                { code: '80053', description: 'Comprehensive metabolic panel', price: 25 },
                { code: '85025', description: 'Complete blood count', price: 15 },
                { code: '80061', description: 'Lipid panel', price: 35 }
            ],
            icdCodes: [
                { code: 'Z00.00', description: 'Encounter for general adult medical examination without abnormal findings' },
                { code: 'I10', description: 'Essential hypertension' },
                { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
                { code: 'E78.5', description: 'Hyperlipidemia, unspecified' },
                { code: 'J45.9', description: 'Asthma, unspecified' },
                { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified' },
                { code: 'F41.9', description: 'Anxiety disorder, unspecified' },
                { code: 'M79.3', description: 'Panniculitis, unspecified' },
                { code: 'K21.9', description: 'Gastro-esophageal reflux disease without esophagitis' },
                { code: 'G43.909', description: 'Migraine, unspecified, not intractable, without status migrainosus' }
            ]
        };
    }

    /**
     * Generate unique ID with prefix
     */
    generateId(prefix = 'id') {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(6).toString('hex');
        return `${prefix}_${timestamp}_${random}`;
    }

    /**
     * Generate clinic data
     */
    generateClinic(index) {
        const clinicId = this.generateId('clinic');
        const clinicNames = [
            'Family Health Center', 'Community Medical Group', 'Wellness Clinic',
            'Primary Care Associates', 'Comprehensive Health', 'MediCare Plus'
        ];
        
        const name = `${faker.helpers.arrayElement(clinicNames)} ${faker.location.city()}`;
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').trim('-');
        
        return {
            PK: `TENANT#${clinicId}`,
            SK: 'CLINIC',
            GSI1PK: 'ENTITY#CLINIC',
            GSI1SK: clinicId,
            GSI5PK: `SLUG#${slug}`,
            GSI5SK: 'CLINIC',
            
            entityType: 'CLINIC',
            clinicId,
            name,
            slug,
            description: faker.company.catchPhrase(),
            
            address: {
                street: faker.location.streetAddress(),
                city: faker.location.city(),
                state: faker.location.state({ abbreviated: true }),
                zipCode: faker.location.zipCode('#####'),
                country: 'US'
            },
            
            phone: faker.phone.number('(###) ###-####'),
            email: `admin@${slug}.com`,
            website: `https://${slug}.com`,
            
            // These would be encrypted in real implementation
            npi: faker.string.numeric(10),
            taxId: faker.string.numeric(2) + '-' + faker.string.numeric(7),
            
            settings: {
                timezone: faker.helpers.arrayElement([
                    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'
                ]),
                workingHours: {
                    monday: { start: '09:00', end: '17:00', enabled: true },
                    tuesday: { start: '09:00', end: '17:00', enabled: true },
                    wednesday: { start: '09:00', end: '17:00', enabled: true },
                    thursday: { start: '09:00', end: '17:00', enabled: true },
                    friday: { start: '09:00', end: '16:00', enabled: true },
                    saturday: { start: '09:00', end: '13:00', enabled: false },
                    sunday: { start: '09:00', end: '13:00', enabled: false }
                },
                appointmentDuration: faker.helpers.arrayElement([15, 20, 30, 45]),
                bookingAdvance: faker.number.int({ min: 14, max: 90 }),
                autoConfirmBookings: faker.datatype.boolean(),
                requirePatientPhone: true,
                requirePatientEmail: faker.datatype.boolean()
            },
            
            subscriptionStatus: 'ACTIVE',
            trialEndsAt: null,
            subscriptionEndsAt: faker.date.future().toISOString(),
            
            features: {
                telehealth: faker.datatype.boolean(),
                ePrescribing: faker.datatype.boolean(),
                claimsProcessing: true,
                patientPortal: true,
                googleCalendar: faker.datatype.boolean(),
                smsReminders: true,
                emailReminders: true
            },
            
            usage: {
                patients: 0,
                appointments: 0,
                notes: 0,
                invoices: 0,
                storage: 0
            },
            
            hipaaSignedAt: faker.date.past().toISOString(),
            baaSigned: true,
            isActive: true,
            verifiedAt: faker.date.past().toISOString(),
            
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    /**
     * Generate user data
     */
    generateUser(clinicId, role, index) {
        const userId = this.generateId('user');
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@clinic-${clinicId.split('_')[1]}.com`;
        
        const user = {
            PK: `TENANT#${clinicId}`,
            SK: `USER#${userId}`,
            GSI1PK: 'ENTITY#USER',
            GSI1SK: `${clinicId}#${userId}`,
            GSI5PK: `EMAIL#${email.toLowerCase()}`,
            GSI5SK: 'USER',
            GSI4PK: `ROLE#${role}`,
            GSI4SK: `${clinicId}#USER`,
            
            entityType: 'USER',
            userId,
            cognitoUserId: `cognito_${userId}`,
            clinicId,
            
            email,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
            phone: faker.phone.number('(###) ###-####'),
            role,
            
            title: this.getUserTitle(role),
            
            preferences: {
                timezone: 'America/New_York',
                dateFormat: 'MM/dd/yyyy',
                timeFormat: '12h',
                language: 'en',
                notifications: {
                    email: true,
                    sms: faker.datatype.boolean(),
                    push: true,
                    appointmentReminders: true,
                    taskReminders: true,
                    invoiceUpdates: role === 'ADMIN'
                }
            },
            
            permissions: this.getRolePermissions(role),
            isActive: true,
            isTwoFactorEnabled: role === 'ADMIN',
            
            lastLoginAt: faker.date.recent().toISOString(),
            lastLoginIp: faker.internet.ip(),
            loginAttempts: 0,
            
            onboardingCompleted: true,
            onboardingSteps: {
                profileSetup: true,
                clinicSetup: role === 'ADMIN',
                integrationSetup: role === 'ADMIN',
                firstPatient: true,
                firstAppointment: true
            },
            
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Add medical credentials for doctors
        if (role === 'DOCTOR') {
            user.license = faker.string.alphanumeric(10).toUpperCase();
            user.deaNumber = 'A' + faker.string.alphanumeric(8).toUpperCase();
            user.npi = faker.string.numeric(10);
        }
        
        return user;
    }

    /**
     * Generate patient data
     */
    async generatePatient(clinicId, index) {
        const patientId = this.generateId('patient');
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const dateOfBirth = faker.date.birthdate({ min: 1, max: 100, mode: 'age' }).toISOString().split('T')[0];
        const phone = faker.phone.number('(###) ###-####');
        const email = faker.datatype.boolean(0.7) ? faker.internet.email({ firstName, lastName }) : undefined;
        const state = faker.location.state({ abbreviated: true });
        
        // Generate synthetic PHI data
        const phiData = {
            firstName,
            lastName,
            dateOfBirth,
            phone,
            email,
            ssn: faker.string.numeric(3) + '-' + faker.string.numeric(2) + '-' + faker.string.numeric(4),
            address: {
                street: faker.location.streetAddress(),
                city: faker.location.city(),
                state,
                zipCode: faker.location.zipCode('#####'),
                country: 'US'
            },
            emergencyContact: faker.datatype.boolean(0.8) ? {
                name: faker.person.fullName(),
                relationship: faker.helpers.arrayElement(['Spouse', 'Parent', 'Child', 'Sibling', 'Friend']),
                phone: faker.phone.number('(###) ###-####')
            } : undefined,
            insurance: faker.datatype.boolean(0.9) ? {
                primary: {
                    company: faker.company.name() + ' Insurance',
                    memberId: faker.string.alphanumeric(12).toUpperCase(),
                    groupNumber: faker.string.alphanumeric(8).toUpperCase(),
                    planName: faker.helpers.arrayElement(['PPO', 'HMO', 'EPO', 'POS']) + ' Plan',
                    copay: faker.number.int({ min: 10, max: 50 }),
                    deductible: faker.number.int({ min: 500, max: 5000 })
                }
            } : undefined
        };

        // Encrypt PHI data
        const encryptedPHI = await this.encryptionService.encryptPatientData(phiData, clinicId);

        const patient = {
            PK: `TENANT#${clinicId}`,
            SK: `PATIENT#${patientId}`,
            GSI1PK: 'ENTITY#PATIENT',
            GSI1SK: `${clinicId}#${patientId}`,
            GSI2PK: `PATIENT#${patientId}`,
            GSI2SK: 'PROFILE',
            GSI4PK: `STATE#${state}`,
            GSI4SK: `${clinicId}#PATIENT`,
            
            entityType: 'PATIENT',
            patientId,
            clinicId,
            
            // Encrypted PHI fields
            ...encryptedPHI,
            
            // Non-encrypted demographic info
            gender: faker.person.sex().charAt(0).toUpperCase(),
            
            // Medical history (non-PHI)
            allergies: faker.helpers.arrayElements(this.medicalData.allergies, { min: 0, max: 3 }).map(allergen => ({
                allergyId: this.generateId('allergy'),
                allergen,
                reaction: faker.helpers.arrayElement(['Rash', 'Swelling', 'Difficulty breathing', 'Nausea']),
                severity: faker.helpers.arrayElement(['mild', 'moderate', 'severe']),
                notes: faker.datatype.boolean(0.3) ? faker.lorem.sentence() : undefined,
                onsetDate: faker.date.past({ years: 10 }).toISOString().split('T')[0]
            })),
            
            medications: faker.helpers.arrayElements(this.medicalData.medications, { min: 0, max: 4 }).map(medication => ({
                medicationId: this.generateId('medication'),
                name: medication,
                dosage: medication.split(' ').slice(-1)[0] || '1 tablet',
                frequency: faker.helpers.arrayElement(['Once daily', 'Twice daily', 'Three times daily', 'As needed']),
                prescribedBy: 'Dr. ' + faker.person.lastName(),
                startDate: faker.date.past({ years: 2 }).toISOString().split('T')[0],
                endDate: faker.datatype.boolean(0.2) ? faker.date.future().toISOString().split('T')[0] : undefined,
                notes: faker.datatype.boolean(0.3) ? faker.lorem.sentence() : undefined
            })),
            
            conditions: faker.helpers.arrayElements(this.medicalData.conditions, { min: 0, max: 2 }).map(condition => ({
                conditionId: this.generateId('condition'),
                name: condition,
                icd10Code: faker.helpers.arrayElement(this.medicalData.icdCodes).code,
                diagnosedDate: faker.date.past({ years: 5 }).toISOString().split('T')[0],
                status: faker.helpers.arrayElement(['active', 'resolved', 'chronic']),
                notes: faker.datatype.boolean(0.4) ? faker.lorem.sentence() : undefined
            })),
            
            preferredLanguage: 'en',
            communicationPreferences: {
                sms: faker.datatype.boolean(0.8),
                email: faker.datatype.boolean(0.6),
                phone: faker.datatype.boolean(0.3),
                reminderTime: faker.helpers.arrayElement([24, 48, 72])
            },
            
            portalAccess: {
                enabled: faker.datatype.boolean(0.7),
                lastLoginAt: faker.datatype.boolean(0.3) ? faker.date.recent().toISOString() : undefined
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
            notes: faker.datatype.boolean(0.2) ? faker.lorem.sentence() : undefined,
            tags: faker.helpers.arrayElements(['new-patient', 'routine-care', 'chronic-care', 'high-priority'], { min: 0, max: 2 }),
            referredBy: faker.datatype.boolean(0.3) ? faker.person.fullName() : undefined,
            
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        // Add email GSI if email exists
        if (email) {
            patient.GSI5PK = `EMAIL#${email.toLowerCase()}`;
            patient.GSI5SK = 'PATIENT';
        }
        
        return patient;
    }

    /**
     * Generate appointment data
     */
    generateAppointment(clinicId, patientId, providerId, baseDate) {
        const appointmentId = this.generateId('appt');
        const startTime = new Date(baseDate);
        startTime.setHours(
            faker.number.int({ min: 8, max: 17 }),
            faker.helpers.arrayElement([0, 15, 30, 45]),
            0, 0
        );
        
        const duration = faker.helpers.arrayElement([15, 30, 45, 60]);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + duration);
        
        const status = faker.helpers.weightedArrayElement([
            { weight: 0.6, value: 'COMPLETED' },
            { weight: 0.2, value: 'SCHEDULED' },
            { weight: 0.1, value: 'CANCELLED' },
            { weight: 0.1, value: 'NO_SHOW' }
        ]);

        const appointmentType = faker.helpers.arrayElement(this.medicalData.appointmentTypes);
        const dateSlot = startTime.toISOString().split('T')[0];
        const timeSlot = startTime.toTimeString().slice(0, 5);
        
        return {
            PK: `TENANT#${clinicId}`,
            SK: `APPOINTMENT#${appointmentId}`,
            GSI1PK: 'ENTITY#APPOINTMENT',
            GSI1SK: `${clinicId}#${appointmentId}`,
            GSI2PK: `PATIENT#${patientId}`,
            GSI2SK: `APPOINTMENT#${startTime.toISOString()}`,
            GSI3PK: `PROVIDER#${providerId}`,
            GSI3SK: `${startTime.toISOString()}#${appointmentId}`,
            GSI4PK: `STATUS#${status}`,
            GSI4SK: `${clinicId}#${startTime.toISOString()}`,
            GSI5PK: `DATE#${dateSlot}`,
            GSI5SK: `${clinicId}#APPOINTMENT`,
            
            entityType: 'APPOINTMENT',
            appointmentId,
            patientId,
            providerId,
            clinicId,
            
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration,
            
            appointmentType,
            reason: `Encrypted reason for ${appointmentType}`, // Would be encrypted
            status,
            
            providerName: `Dr. ${faker.person.lastName()}`,
            location: {
                type: faker.helpers.arrayElement(['in-person', 'telehealth']),
                room: faker.datatype.boolean(0.8) ? `Room ${faker.number.int({ min: 1, max: 20 })}` : undefined,
                teleheathLink: undefined // Would be set for telehealth appointments
            },
            
            patientName: `Encrypted patient name`, // Would be encrypted
            patientPhone: `Encrypted phone`, // Would be encrypted
            
            isUrgent: faker.datatype.boolean(0.1),
            isRecurring: faker.datatype.boolean(0.2),
            
            reminders: {
                enabled: faker.datatype.boolean(0.9),
                smsEnabled: faker.datatype.boolean(0.7),
                emailEnabled: faker.datatype.boolean(0.5),
                reminderTimes: [24, 2] // hours before
            },
            
            estimatedCost: faker.number.int({ min: 100, max: 300 }),
            insuranceCovered: faker.datatype.boolean(0.8),
            copay: faker.number.int({ min: 10, max: 50 }),
            
            statusHistory: [{
                status: 'SCHEDULED',
                changedAt: faker.date.past().toISOString(),
                changedBy: providerId,
                reason: 'Initial scheduling'
            }],
            
            dateSlot,
            timeSlot,
            weekSlot: `${startTime.getFullYear()}-W${String(Math.ceil(startTime.getDate() / 7)).padStart(2, '0')}`,
            monthSlot: dateSlot.slice(0, 7),
            
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    /**
     * Generate SOAP note data
     */
    async generateSOAPNote(clinicId, patientId, providerId, appointmentId) {
        const noteId = this.generateId('note');
        const createdAt = new Date().toISOString();
        
        // Generate realistic SOAP content
        const soapContent = {
            subjective: `Patient presents with ${faker.lorem.sentence()}. ${faker.lorem.sentences(2)}`,
            objective: `Vital signs: BP ${faker.number.int({ min: 90, max: 180 })}/${faker.number.int({ min: 60, max: 120 })}, HR ${faker.number.int({ min: 60, max: 100 })}, Temp ${faker.number.float({ min: 97.0, max: 101.0, precision: 0.1 })}°F. ${faker.lorem.sentences(2)}`,
            assessment: `${faker.helpers.arrayElement(this.medicalData.conditions)}. ${faker.lorem.sentence()}`,
            plan: `Continue current treatment plan. ${faker.lorem.sentences(2)} Follow-up in ${faker.number.int({ min: 1, max: 12 })} weeks.`
        };

        // Encrypt SOAP content
        const encryptedSOAP = await this.encryptionService.encryptSOAPNote(soapContent, clinicId);

        return {
            PK: `TENANT#${clinicId}`,
            SK: `NOTE#${noteId}`,
            GSI1PK: 'ENTITY#NOTE',
            GSI1SK: `${clinicId}#${noteId}`,
            GSI2PK: `PATIENT#${patientId}`,
            GSI2SK: `NOTE#${createdAt}`,
            GSI3PK: `PROVIDER#${providerId}`,
            GSI3SK: `${createdAt}#${noteId}`,
            GSI4PK: 'NOTE_STATUS#SIGNED',
            GSI4SK: `${clinicId}#${createdAt}`,
            GSI5PK: 'NOTE_TYPE#SOAP',
            GSI5SK: `${clinicId}#${createdAt}`,
            
            entityType: 'NOTE',
            noteId,
            patientId,
            appointmentId,
            providerId,
            clinicId,
            
            type: 'SOAP',
            title: 'SOAP Note - ' + faker.helpers.arrayElement(this.medicalData.appointmentTypes),
            status: 'SIGNED',
            
            // Encrypted content
            content: encryptedSOAP.content,
            searchTokens: encryptedSOAP.searchTokens,
            
            diagnosis: faker.helpers.arrayElements(this.medicalData.icdCodes, { min: 1, max: 2 }).map(icd => ({
                code: icd.code,
                description: icd.description,
                isPrimary: true
            })),
            
            procedures: faker.helpers.arrayElements(this.medicalData.cptCodes, { min: 1, max: 2 }).map(cpt => ({
                code: cpt.code,
                description: cpt.description,
                quantity: 1,
                modifier: undefined
            })),
            
            vitals: {
                height: { value: `Encrypted height`, unit: 'in' },
                weight: { value: `Encrypted weight`, unit: 'lbs' },
                bmi: `Encrypted BMI`,
                bloodPressure: { 
                    systolic: `Encrypted systolic`, 
                    diastolic: `Encrypted diastolic`
                },
                heartRate: `Encrypted HR`,
                temperature: { value: `Encrypted temp`, unit: 'F' },
                takenAt: createdAt,
                takenBy: providerId
            },
            
            patientName: `Encrypted patient name`,
            patientDOB: `Encrypted DOB`,
            
            signature: {
                providerId,
                providerName: `Dr. ${faker.person.lastName()}`,
                signedAt: createdAt,
                digitalSignature: `Encrypted signature`,
                ipAddress: faker.internet.ip()
            },
            
            version: 1,
            isLatestVersion: true,
            isLocked: false,
            
            keywords: faker.helpers.arrayElements(['follow-up', 'stable', 'improved', 'medication', 'referral'], { min: 1, max: 3 }),
            
            createdAt,
            updatedAt: createdAt
        };
    }

    /**
     * Generate invoice data
     */
    generateInvoice(clinicId, patientId, appointmentId, cptCodes) {
        const invoiceId = this.generateId('invoice');
        const invoiceNumber = `INV-2024-${faker.string.numeric(6)}`;
        const invoiceDate = faker.date.recent().toISOString().split('T')[0];
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateStr = dueDate.toISOString().split('T')[0];
        
        const lineItems = cptCodes.map((cpt, index) => ({
            lineItemId: this.generateId('line'),
            description: cpt.description,
            quantity: 1,
            unitPrice: cpt.price,
            totalPrice: cpt.price,
            cptCode: cpt.code,
            modifiers: [],
            discount: 0,
            taxable: true
        }));
        
        const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
        const discountPercent = 0;
        const discountAmount = 0;
        const taxPercent = 0;
        const taxAmount = 0;
        const totalAmount = subtotal;
        
        const status = faker.helpers.weightedArrayElement([
            { weight: 0.7, value: 'PAID' },
            { weight: 0.2, value: 'SENT' },
            { weight: 0.1, value: 'OVERDUE' }
        ]);
        
        const paidAmount = status === 'PAID' ? totalAmount : 0;
        
        return {
            PK: `TENANT#${clinicId}`,
            SK: `INVOICE#${invoiceId}`,
            GSI1PK: 'ENTITY#INVOICE',
            GSI1SK: `${clinicId}#${invoiceId}`,
            GSI2PK: `PATIENT#${patientId}`,
            GSI2SK: `INVOICE#${invoiceDate}`,
            GSI4PK: `STATUS#${status}`,
            GSI4SK: `${clinicId}#${dueDateStr}`,
            
            entityType: 'INVOICE',
            invoiceId,
            invoiceNumber,
            patientId,
            appointmentId,
            clinicId,
            
            invoiceDate,
            dueDate: dueDateStr,
            status,
            
            patientName: `Encrypted patient name`,
            patientAddress: `Encrypted patient address`,
            patientPhone: `Encrypted patient phone`,
            
            lineItems,
            
            subtotal,
            discountPercent,
            discountAmount,
            taxPercent,
            taxAmount,
            totalAmount,
            
            paidAmount,
            remainingBalance: totalAmount - paidAmount,
            
            paymentRecords: status === 'PAID' ? [{
                paymentId: this.generateId('payment'),
                amount: paidAmount,
                method: faker.helpers.arrayElement(['CREDIT_CARD', 'CHECK', 'BANK_TRANSFER', 'INSURANCE']),
                reference: faker.string.alphanumeric(10),
                paidAt: faker.date.recent().toISOString(),
                recordedBy: 'system'
            }] : [],
            
            insurance: {
                primary: {
                    company: `Encrypted insurance`,
                    memberId: `Encrypted member ID`,
                    claimAmount: totalAmount * 0.8,
                    claimStatus: 'PAID',
                    claimDate: faker.date.recent().toISOString(),
                    paymentAmount: totalAmount * 0.8,
                    paymentDate: faker.date.recent().toISOString()
                }
            },
            
            paymentTerms: 'Net 30 days',
            
            pdfGenerated: true,
            pdfUrl: `s3://medeez-invoices/${invoiceId}.pdf`,
            pdfGeneratedAt: faker.date.recent().toISOString(),
            
            sentToPatient: true,
            sentAt: faker.date.recent().toISOString(),
            sentMethod: 'EMAIL',
            deliveryStatus: 'DELIVERED',
            
            isOverdue: status === 'OVERDUE',
            daysPastDue: status === 'OVERDUE' ? faker.number.int({ min: 1, max: 60 }) : 0,
            collectionAttempts: [],
            
            portalViewToken: faker.string.alphanumeric(32),
            portalPaymentEnabled: true,
            
            statusHistory: [{
                status: 'SENT',
                changedAt: faker.date.past().toISOString(),
                changedBy: 'system',
                reason: 'Invoice generated and sent'
            }],
            
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    /**
     * Helper methods
     */
    getUserTitle(role) {
        const titles = {
            'ADMIN': ['Practice Administrator', 'Office Manager', 'Clinical Director'],
            'DOCTOR': ['MD', 'DO', 'NP', 'PA'],
            'STAFF': ['Medical Assistant', 'Nurse', 'Receptionist', 'Medical Secretary']
        };
        return faker.helpers.arrayElement(titles[role]);
    }

    getRolePermissions(role) {
        const permissions = {
            'ADMIN': [
                'users:create', 'users:read', 'users:update', 'users:delete',
                'patients:create', 'patients:read', 'patients:update', 'patients:delete',
                'appointments:create', 'appointments:read', 'appointments:update', 'appointments:delete',
                'notes:create', 'notes:read', 'notes:update', 'notes:delete',
                'invoices:create', 'invoices:read', 'invoices:update', 'invoices:delete',
                'clinic:update', 'integrations:manage', 'reports:access', 'audit:read'
            ],
            'DOCTOR': [
                'patients:create', 'patients:read', 'patients:update',
                'appointments:create', 'appointments:read', 'appointments:update',
                'notes:create', 'notes:read', 'notes:update',
                'invoices:create', 'invoices:read', 'invoices:update',
                'reports:access'
            ],
            'STAFF': [
                'patients:create', 'patients:read', 'patients:update',
                'appointments:create', 'appointments:read', 'appointments:update',
                'invoices:create', 'invoices:read', 'invoices:update'
            ]
        };
        return permissions[role];
    }

    /**
     * Batch write items to DynamoDB
     */
    async batchWriteItems(items, tableName = this.tableName) {
        const batchSize = 25; // DynamoDB limit
        let totalWritten = 0;

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const requestItems = {
                [tableName]: batch.map(item => ({
                    PutRequest: { Item: item }
                }))
            };

            try {
                await this.docClient.send(new BatchWriteCommand({
                    RequestItems: requestItems
                }));
                totalWritten += batch.length;
                console.log(`Wrote batch of ${batch.length} items (${totalWritten}/${items.length} total)`);
            } catch (error) {
                console.error('Error writing batch:', error);
                throw error;
            }
        }

        return totalWritten;
    }

    /**
     * Generate all seed data
     */
    async generateAllData() {
        console.log('Starting comprehensive seed data generation...');
        const startTime = Date.now();

        try {
            const allItems = [];
            const clinicData = [];

            // Generate clinics
            console.log('Generating clinics...');
            for (let i = 0; i < this.config.clinics; i++) {
                const clinic = this.generateClinic(i);
                allItems.push(clinic);
                clinicData.push(clinic);
            }

            // Generate users, patients, appointments, notes, and invoices for each clinic
            for (const clinic of clinicData) {
                const clinicId = clinic.clinicId;
                console.log(`Generating data for clinic: ${clinic.name} (${clinicId})`);

                // Generate users
                const users = [];
                for (const [role, count] of Object.entries(this.config.usersPerClinic)) {
                    for (let i = 0; i < count; i++) {
                        const user = this.generateUser(clinicId, role, i);
                        users.push(user);
                        allItems.push(user);
                    }
                }

                const doctors = users.filter(u => u.role === 'DOCTOR');

                // Generate patients
                console.log(`  Generating ${this.config.patientsPerClinic} patients...`);
                const patients = [];
                for (let i = 0; i < this.config.patientsPerClinic; i++) {
                    const patient = await this.generatePatient(clinicId, i);
                    patients.push(patient);
                    allItems.push(patient);
                }

                // Generate appointments and related data
                console.log('  Generating appointments, notes, and invoices...');
                let appointmentCount = 0;
                let noteCount = 0;
                let invoiceCount = 0;

                for (const patient of patients) {
                    const numAppointments = faker.number.int(this.config.appointmentsPerPatient);
                    
                    for (let i = 0; i < numAppointments; i++) {
                        // Generate appointment date within the time range
                        const appointmentDate = faker.date.between({
                            from: new Date(Date.now() - this.config.timeRange.pastDays * 24 * 60 * 60 * 1000),
                            to: new Date(Date.now() + this.config.timeRange.futureDays * 24 * 60 * 60 * 1000)
                        });

                        const provider = faker.helpers.arrayElement(doctors);
                        const appointment = this.generateAppointment(
                            clinicId,
                            patient.patientId,
                            provider.userId,
                            appointmentDate
                        );
                        
                        allItems.push(appointment);
                        appointmentCount++;

                        // Generate SOAP note (80% chance for completed appointments)
                        if (appointment.status === 'COMPLETED' && Math.random() < this.config.notesPerAppointment) {
                            const note = await this.generateSOAPNote(
                                clinicId,
                                patient.patientId,
                                provider.userId,
                                appointment.appointmentId
                            );
                            allItems.push(note);
                            noteCount++;
                        }

                        // Generate invoice (90% chance)
                        if (Math.random() < this.config.invoicesPerAppointment) {
                            const cptCodes = faker.helpers.arrayElements(this.medicalData.cptCodes, { min: 1, max: 2 });
                            const invoice = this.generateInvoice(
                                clinicId,
                                patient.patientId,
                                appointment.appointmentId,
                                cptCodes
                            );
                            allItems.push(invoice);
                            invoiceCount++;
                        }
                    }
                }

                console.log(`  Generated: ${appointmentCount} appointments, ${noteCount} notes, ${invoiceCount} invoices`);
            }

            console.log(`\nTotal items to write: ${allItems.length}`);
            console.log('Writing data to DynamoDB...');

            // Write all items to DynamoDB
            await this.batchWriteItems(allItems);

            const duration = (Date.now() - startTime) / 1000;
            console.log(`\nSeed data generation completed successfully in ${duration.toFixed(2)} seconds!`);
            
            return {
                totalItems: allItems.length,
                clinics: this.config.clinics,
                patientsPerClinic: this.config.patientsPerClinic,
                duration: duration,
                breakdown: {
                    clinics: clinicData.length,
                    users: allItems.filter(item => item.entityType === 'USER').length,
                    patients: allItems.filter(item => item.entityType === 'PATIENT').length,
                    appointments: allItems.filter(item => item.entityType === 'APPOINTMENT').length,
                    notes: allItems.filter(item => item.entityType === 'NOTE').length,
                    invoices: allItems.filter(item => item.entityType === 'INVOICE').length
                }
            };

        } catch (error) {
            console.error('Seed data generation failed:', error);
            throw error;
        }
    }

    /**
     * Audit the generated data
     */
    async auditGeneratedData() {
        console.log('Auditing generated seed data...');

        try {
            // Log audit event
            await this.rdsConnection.connect();
            await this.rdsConnection.logAuditEvent({
                clinicId: 'system',
                userId: 'seed-generator',
                sessionId: 'seed-session',
                action: 'CREATE',
                resourceType: 'SEED_DATA',
                resourceId: 'bulk_generation',
                phiAccessed: true,
                phiFields: ['patient_demographics', 'medical_records', 'soap_notes'],
                accessReason: 'Development seed data generation',
                ipAddress: '127.0.0.1',
                userAgent: 'Seed Data Generator v2.0',
                metadata: {
                    environment: this.environment,
                    generatedAt: new Date().toISOString(),
                    dataTypes: ['clinics', 'users', 'patients', 'appointments', 'notes', 'invoices']
                }
            });

            console.log('Seed data generation audited successfully');

        } catch (error) {
            console.warn('Failed to audit seed data generation:', error.message);
        }
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = args[1] || process.env.NODE_ENV || 'dev';
    
    const generator = new SeedDataGenerator(environment);
    
    try {
        switch (command) {
            case 'generate':
                console.log(`Generating seed data for environment: ${environment}`);
                const result = await generator.generateAllData();
                await generator.auditGeneratedData();
                console.log('\nSeed data summary:', result.breakdown);
                break;
                
            case 'test':
                console.log('Testing seed data generation (single items)...');
                const clinic = generator.generateClinic(0);
                const user = generator.generateUser(clinic.clinicId, 'DOCTOR', 0);
                const patient = await generator.generatePatient(clinic.clinicId, 0);
                console.log('Test items generated successfully');
                console.log(`- Clinic: ${clinic.name}`);
                console.log(`- User: ${user.fullName} (${user.role})`);
                console.log(`- Patient: [Encrypted PHI data]`);
                break;
                
            default:
                console.log('Usage: node seed-generator.js [command] [environment]');
                console.log('');
                console.log('Commands:');
                console.log('  generate  - Generate complete seed dataset');
                console.log('  test      - Test generation of sample items');
                console.log('');
                console.log('Environments: dev, staging, prod');
                console.log('');
                console.log('Default configuration:');
                console.log('  - 3 clinics');
                console.log('  - 6 users per clinic (1 admin, 2 doctors, 3 staff)');
                console.log('  - 50 patients per clinic');
                console.log('  - 1-5 appointments per patient');
                console.log('  - SOAP notes and invoices generated realistically');
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

module.exports = SeedDataGenerator;