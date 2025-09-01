#!/usr/bin/env node
/**
 * Simple Seed Data Test for Medeez v2
 * 
 * Tests seed data generation without external dependencies
 */

const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Set faker to use consistent seed for reproducible data
faker.seed(12345);

class SimpleSeedTest {
    constructor(environment = 'dev') {
        this.environment = environment;
        this.tableName = `medeez-${environment}-app`;
        
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
            conditions: [
                'Hypertension', 'Diabetes Type 2', 'Hyperlipidemia', 'Asthma',
                'Depression', 'Anxiety', 'Arthritis', 'GERD', 'Migraine', 'Insomnia'
            ],
            cptCodes: [
                { code: '99213', description: 'Office visit, established patient, level 3', price: 150 },
                { code: '99214', description: 'Office visit, established patient, level 4', price: 200 },
                { code: '99203', description: 'Office visit, new patient, level 3', price: 180 },
                { code: '99204', description: 'Office visit, new patient, level 4', price: 250 },
                { code: '90791', description: 'Psychiatric diagnostic evaluation', price: 300 },
                { code: '80053', description: 'Comprehensive metabolic panel', price: 25 }
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
     * Mock encrypt PHI data for development
     */
    mockEncryptPHI(plaintext) {
        if (!plaintext) return null;
        return {
            encrypted: Buffer.from(`MOCK_ENCRYPTED:${plaintext}`).toString('base64'),
            keyId: 'mock-kms-key-dev',
            context: Buffer.from(JSON.stringify({
                mock: true,
                environment: this.environment,
                timestamp: new Date().toISOString()
            })).toString('base64')
        };
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
                appointmentDuration: faker.helpers.arrayElement([15, 20, 30, 45])
            },
            
            subscriptionStatus: 'ACTIVE',
            isActive: true,
            
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
            isActive: true,
            
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
     * Generate patient data with mock encryption
     */
    generatePatient(clinicId, index) {
        const patientId = this.generateId('patient');
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const dateOfBirth = faker.date.birthdate({ min: 1, max: 100, mode: 'age' }).toISOString().split('T')[0];
        const phone = faker.phone.number('(###) ###-####');
        const email = faker.datatype.boolean(0.7) ? faker.internet.email({ firstName, lastName }) : undefined;
        const state = faker.location.state({ abbreviated: true });

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
            
            // Mock encrypted PHI fields
            firstName: this.mockEncryptPHI(firstName),
            lastName: this.mockEncryptPHI(lastName),
            dateOfBirth: this.mockEncryptPHI(dateOfBirth),
            phone: this.mockEncryptPHI(phone),
            email: email ? this.mockEncryptPHI(email) : undefined,
            
            // Non-encrypted demographic info
            gender: faker.person.sex().charAt(0).toUpperCase(),
            
            isActive: true,
            
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
            status,
            
            providerName: `Dr. ${faker.person.lastName()}`,
            
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

    /**
     * Generate test dataset
     */
    async generateTestData() {
        console.log('Generating test seed data...');
        
        const allItems = [];
        const clinics = 2;
        const usersPerClinic = { ADMIN: 1, DOCTOR: 1, STAFF: 1 };
        const patientsPerClinic = 10;

        // Generate clinics
        console.log('Generating clinics...');
        for (let i = 0; i < clinics; i++) {
            const clinic = this.generateClinic(i);
            allItems.push(clinic);
            
            const clinicId = clinic.clinicId;
            console.log(`Generating data for clinic: ${clinic.name}`);

            // Generate users
            const users = [];
            for (const [role, count] of Object.entries(usersPerClinic)) {
                for (let j = 0; j < count; j++) {
                    const user = this.generateUser(clinicId, role, j);
                    users.push(user);
                    allItems.push(user);
                }
            }

            const doctors = users.filter(u => u.role === 'DOCTOR');

            // Generate patients
            console.log(`  Generating ${patientsPerClinic} patients...`);
            const patients = [];
            for (let j = 0; j < patientsPerClinic; j++) {
                const patient = this.generatePatient(clinicId, j);
                patients.push(patient);
                allItems.push(patient);
            }

            // Generate appointments
            console.log('  Generating appointments...');
            let appointmentCount = 0;
            for (const patient of patients) {
                const numAppointments = faker.number.int({ min: 1, max: 3 });
                
                for (let k = 0; k < numAppointments; k++) {
                    const appointmentDate = faker.date.between({
                        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                        to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
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
                }
            }

            console.log(`  Generated: ${appointmentCount} appointments`);
        }

        console.log(`\nTotal items generated: ${allItems.length}`);
        
        // Save to file for inspection
        const outputFile = path.join(__dirname, '..', 'data', 'seed-test-data.json');
        fs.writeFileSync(outputFile, JSON.stringify(allItems, null, 2));
        console.log(`Test data saved to: ${outputFile}`);
        
        return {
            totalItems: allItems.length,
            clinics: clinics,
            breakdown: {
                clinics: allItems.filter(item => item.entityType === 'CLINIC').length,
                users: allItems.filter(item => item.entityType === 'USER').length,
                patients: allItems.filter(item => item.entityType === 'PATIENT').length,
                appointments: allItems.filter(item => item.entityType === 'APPOINTMENT').length
            }
        };
    }

    /**
     * Test individual item generation
     */
    async testItemGeneration() {
        console.log('Testing individual item generation...');
        
        // Test clinic
        const clinic = this.generateClinic(0);
        console.log('✓ Clinic generated:', clinic.name);
        
        // Test user
        const user = this.generateUser(clinic.clinicId, 'DOCTOR', 0);
        console.log('✓ User generated:', user.fullName, `(${user.role})`);
        
        // Test patient
        const patient = this.generatePatient(clinic.clinicId, 0);
        console.log('✓ Patient generated with encrypted PHI');
        
        // Test appointment
        const appointment = this.generateAppointment(
            clinic.clinicId,
            patient.patientId,
            user.userId,
            new Date()
        );
        console.log('✓ Appointment generated:', appointment.appointmentType);
        
        return {
            clinic,
            user,
            patient,
            appointment
        };
    }

    /**
     * Validate generated data structure
     */
    validateDataStructure(items) {
        console.log('\nValidating data structure...');
        
        const validationErrors = [];
        
        for (const item of items) {
            // Check required DynamoDB fields
            if (!item.PK || !item.SK) {
                validationErrors.push(`Item missing PK or SK: ${JSON.stringify(item).substring(0, 100)}...`);
            }
            
            // Check entity type
            if (!item.entityType) {
                validationErrors.push(`Item missing entityType: ${item.PK}#${item.SK}`);
            }
            
            // Check GSI1 for proper structure
            if (item.GSI1PK && !item.GSI1SK) {
                validationErrors.push(`Item has GSI1PK but no GSI1SK: ${item.PK}#${item.SK}`);
            }
        }
        
        if (validationErrors.length === 0) {
            console.log('✓ Data structure validation passed');
            return true;
        } else {
            console.log('✗ Data structure validation failed:');
            validationErrors.forEach(error => console.log(`  - ${error}`));
            return false;
        }
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = args[1] || 'dev';

    const seedTest = new SimpleSeedTest(environment);

    try {
        switch (command) {
            case 'test':
                console.log('Testing seed data generation...');
                const testItems = await seedTest.testItemGeneration();
                console.log('Individual item generation test completed successfully');
                break;

            case 'generate':
                console.log('Generating full test dataset...');
                const result = await seedTest.generateTestData();
                console.log('\nSeed data generation summary:', result.breakdown);
                console.log('Test completed successfully!');
                break;

            case 'validate':
                console.log('Validating existing test data...');
                try {
                    const testDataFile = path.join(__dirname, '..', 'data', 'seed-test-data.json');
                    const testData = JSON.parse(fs.readFileSync(testDataFile, 'utf8'));
                    const isValid = seedTest.validateDataStructure(testData);
                    if (!isValid) {
                        process.exit(1);
                    }
                } catch (error) {
                    console.error('Error reading test data:', error.message);
                    process.exit(1);
                }
                break;

            default:
                console.log('Usage: node simple-seed-test.js [command] [environment]');
                console.log('');
                console.log('Commands:');
                console.log('  test      - Test individual item generation');
                console.log('  generate  - Generate complete test dataset');
                console.log('  validate  - Validate existing test data structure');
                console.log('');
                console.log('Examples:');
                console.log('  node simple-seed-test.js test dev');
                console.log('  node simple-seed-test.js generate dev');
                console.log('  node simple-seed-test.js validate dev');
                break;
        }

    } catch (error) {
        console.error('Command failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleSeedTest;