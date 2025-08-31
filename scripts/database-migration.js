#!/usr/bin/env node
/**
 * Database Migration and Seed Script for Medeez DynamoDB
 * Handles table creation, GSI setup, and data seeding
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

class DatabaseMigration {
    constructor(environment = 'dev', region = 'us-east-1') {
        this.environment = environment;
        this.region = region;
        this.tableName = `medeez-${environment}-app`;
        
        // Configure AWS SDK
        if (environment === 'dev') {
            // Use LocalStack for development
            this.dynamodb = new AWS.DynamoDB({
                endpoint: 'http://localhost:8000',
                region: 'us-east-1',
                accessKeyId: 'test',
                secretAccessKey: 'test'
            });
            this.docClient = new AWS.DynamoDB.DocumentClient({
                endpoint: 'http://localhost:8000',
                region: 'us-east-1',
                accessKeyId: 'test',
                secretAccessKey: 'test'
            });
        } else {
            // Use AWS for staging/prod
            AWS.config.update({ region: this.region });
            this.dynamodb = new AWS.DynamoDB();
            this.docClient = new AWS.DynamoDB.DocumentClient();
        }
    }

    async createTable() {
        console.log(`Creating table: ${this.tableName}`);

        const tableParams = {
            TableName: this.tableName,
            KeySchema: [
                {
                    AttributeName: 'PK',
                    KeyType: 'HASH'
                },
                {
                    AttributeName: 'SK',
                    KeyType: 'RANGE'
                }
            ],
            AttributeDefinitions: [
                {
                    AttributeName: 'PK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'SK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI1PK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI1SK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI2PK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI2SK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI3PK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI3SK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI4PK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI4SK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI5PK',
                    AttributeType: 'S'
                },
                {
                    AttributeName: 'GSI5SK',
                    AttributeType: 'S'
                }
            ],
            BillingMode: 'PAY_PER_REQUEST',
            GlobalSecondaryIndexes: [
                {
                    IndexName: 'GSI1',
                    KeySchema: [
                        {
                            AttributeName: 'GSI1PK',
                            KeyType: 'HASH'
                        },
                        {
                            AttributeName: 'GSI1SK',
                            KeyType: 'RANGE'
                        }
                    ],
                    Projection: {
                        ProjectionType: 'ALL'
                    }
                },
                {
                    IndexName: 'GSI2',
                    KeySchema: [
                        {
                            AttributeName: 'GSI2PK',
                            KeyType: 'HASH'
                        },
                        {
                            AttributeName: 'GSI2SK',
                            KeyType: 'RANGE'
                        }
                    ],
                    Projection: {
                        ProjectionType: 'ALL'
                    }
                },
                {
                    IndexName: 'GSI3',
                    KeySchema: [
                        {
                            AttributeName: 'GSI3PK',
                            KeyType: 'HASH'
                        },
                        {
                            AttributeName: 'GSI3SK',
                            KeyType: 'RANGE'
                        }
                    ],
                    Projection: {
                        ProjectionType: 'ALL'
                    }
                },
                {
                    IndexName: 'GSI4',
                    KeySchema: [
                        {
                            AttributeName: 'GSI4PK',
                            KeyType: 'HASH'
                        },
                        {
                            AttributeName: 'GSI4SK',
                            KeyType: 'RANGE'
                        }
                    ],
                    Projection: {
                        ProjectionType: 'ALL'
                    }
                },
                {
                    IndexName: 'GSI5',
                    KeySchema: [
                        {
                            AttributeName: 'GSI5PK',
                            KeyType: 'HASH'
                        },
                        {
                            AttributeName: 'GSI5SK',
                            KeyType: 'RANGE'
                        }
                    ],
                    Projection: {
                        ProjectionType: 'ALL'
                    }
                }
            ],
            StreamSpecification: {
                StreamEnabled: true,
                StreamViewType: 'NEW_AND_OLD_IMAGES'
            },
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: this.environment === 'prod'
            },
            Tags: [
                {
                    Key: 'Environment',
                    Value: this.environment
                },
                {
                    Key: 'Project',
                    Value: 'Medeez'
                },
                {
                    Key: 'ManagedBy',
                    Value: 'Migration Script'
                }
            ]
        };

        try {
            // Check if table exists
            try {
                await this.dynamodb.describeTable({ TableName: this.tableName }).promise();
                console.log(`Table ${this.tableName} already exists, skipping creation`);
                return;
            } catch (err) {
                if (err.code !== 'ResourceNotFoundException') {
                    throw err;
                }
            }

            // Create the table
            const result = await this.dynamodb.createTable(tableParams).promise();
            console.log('Table creation initiated:', result.TableDescription.TableName);

            // Wait for table to become active
            await this.dynamodb.waitFor('tableExists', { TableName: this.tableName }).promise();
            console.log('Table is now active');

            // Enable TTL
            await this.enableTTL();
            
        } catch (error) {
            console.error('Error creating table:', error);
            throw error;
        }
    }

    async enableTTL() {
        console.log('Enabling TTL for the table');
        
        try {
            await this.dynamodb.updateTimeToLive({
                TableName: this.tableName,
                TimeToLiveSpecification: {
                    AttributeName: 'ttl',
                    Enabled: true
                }
            }).promise();
            console.log('TTL enabled successfully');
        } catch (error) {
            console.error('Error enabling TTL:', error);
            throw error;
        }
    }

    async seedData() {
        console.log('Starting data seeding...');
        
        // Seed sample clinic
        await this.seedClinic();
        
        // Seed sample users
        await this.seedUsers();
        
        // Seed sample patients
        await this.seedPatients();
        
        // Seed sample appointments
        await this.seedAppointments();
        
        // Seed templates
        await this.seedTemplates();
        
        console.log('Data seeding completed');
    }

    async seedClinic() {
        const clinicId = 'clinic_demo_001';
        const clinic = {
            PK: `TENANT#${clinicId}`,
            SK: `TENANT#${clinicId}`,
            entityType: 'clinic',
            clinicId: clinicId,
            name: 'Demo Family Practice',
            address: {
                street: '123 Healthcare Drive',
                city: 'Medical City',
                state: 'CA',
                zipCode: '90210',
                country: 'USA'
            },
            phone: '+1-555-0123',
            email: 'admin@demofamilypractice.com',
            timezone: 'America/Los_Angeles',
            status: 'active',
            subscription: {
                plan: 'professional',
                status: 'active',
                trialEnd: null,
                nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await this.docClient.put({
            TableName: this.tableName,
            Item: clinic
        }).promise();

        console.log('Seeded demo clinic');
    }

    async seedUsers() {
        const clinicId = 'clinic_demo_001';
        const users = [
            {
                PK: `TENANT#${clinicId}`,
                SK: 'USER#user_demo_dr001',
                entityType: 'user',
                clinicId: clinicId,
                userId: 'user_demo_dr001',
                email: 'dr.smith@demofamilypractice.com',
                name: 'Dr. Sarah Smith',
                role: ['provider', 'admin'],
                npi: '1234567890',
                taxonomy: '207Q00000X', // Family Medicine
                title: 'MD',
                phone: '+1-555-0124',
                timezone: 'America/Los_Angeles',
                status: 'active',
                preferences: {
                    defaultAppointmentDuration: 30,
                    workingHours: {
                        monday: { start: '09:00', end: '17:00' },
                        tuesday: { start: '09:00', end: '17:00' },
                        wednesday: { start: '09:00', end: '17:00' },
                        thursday: { start: '09:00', end: '17:00' },
                        friday: { start: '09:00', end: '15:00' },
                        saturday: null,
                        sunday: null
                    }
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                PK: `TENANT#${clinicId}`,
                SK: 'USER#user_demo_staff001',
                entityType: 'user',
                clinicId: clinicId,
                userId: 'user_demo_staff001',
                email: 'jane.doe@demofamilypractice.com',
                name: 'Jane Doe',
                role: ['staff'],
                title: 'Medical Assistant',
                phone: '+1-555-0125',
                timezone: 'America/Los_Angeles',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];

        for (const user of users) {
            await this.docClient.put({
                TableName: this.tableName,
                Item: user
            }).promise();
        }

        console.log('Seeded demo users');
    }

    async seedPatients() {
        const clinicId = 'clinic_demo_001';
        const patients = [
            {
                PK: `TENANT#${clinicId}`,
                SK: 'PATIENT#patient_demo_001',
                GSI1PK: 'TYPE#patient',
                GSI1SK: `${clinicId}#${new Date().toISOString()}`,
                entityType: 'patient',
                clinicId: clinicId,
                patientId: 'patient_demo_001',
                name: {
                    first: 'John',
                    last: 'Johnson',
                    middle: 'A'
                },
                dateOfBirth: '1980-05-15',
                sex: 'Male',
                phone: '+1-555-1001',
                email: 'john.johnson@email.com',
                address: {
                    street: '456 Patient Street',
                    city: 'Patient City',
                    state: 'CA',
                    zipCode: '90211',
                    country: 'USA'
                },
                emergencyContact: {
                    name: 'Mary Johnson',
                    relationship: 'Spouse',
                    phone: '+1-555-1002'
                },
                insurance: {
                    primary: {
                        company: 'Demo Insurance Co',
                        policyNumber: 'DIC123456',
                        groupNumber: 'GRP001'
                    }
                },
                allergies: ['Penicillin', 'Shellfish'],
                medicalHistory: ['Hypertension'],
                tags: ['routine-care'],
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                PK: `TENANT#${clinicId}`,
                SK: 'PATIENT#patient_demo_002',
                GSI1PK: 'TYPE#patient',
                GSI1SK: `${clinicId}#${new Date().toISOString()}`,
                entityType: 'patient',
                clinicId: clinicId,
                patientId: 'patient_demo_002',
                name: {
                    first: 'Emily',
                    last: 'Davis',
                    middle: 'R'
                },
                dateOfBirth: '1992-12-08',
                sex: 'Female',
                phone: '+1-555-2001',
                email: 'emily.davis@email.com',
                address: {
                    street: '789 Demo Avenue',
                    city: 'Sample City',
                    state: 'CA',
                    zipCode: '90212',
                    country: 'USA'
                },
                emergencyContact: {
                    name: 'Robert Davis',
                    relationship: 'Father',
                    phone: '+1-555-2002'
                },
                allergies: [],
                medicalHistory: [],
                tags: ['new-patient'],
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];

        for (const patient of patients) {
            await this.docClient.put({
                TableName: this.tableName,
                Item: patient
            }).promise();
        }

        console.log('Seeded demo patients');
    }

    async seedAppointments() {
        const clinicId = 'clinic_demo_001';
        const providerId = 'user_demo_dr001';
        
        // Generate appointments for the next few days
        const appointments = [];
        const today = new Date();
        
        for (let i = 1; i <= 7; i++) {
            const appointmentDate = new Date(today);
            appointmentDate.setDate(today.getDate() + i);
            
            const dateStr = appointmentDate.toISOString().split('T')[0].replace(/-/g, '');
            const appointmentId = `appt_demo_${String(i).padStart(3, '0')}`;
            
            appointments.push({
                PK: `TENANT#${clinicId}`,
                SK: `APPT#${dateStr}#${appointmentId}`,
                GSI2PK: `PATIENT#patient_demo_${String((i % 2) + 1).padStart(3, '0')}`,
                GSI2SK: `APPT#${appointmentDate.toISOString()}`,
                GSI3PK: `PROVIDER#${providerId}`,
                GSI3SK: `APPT#${appointmentDate.toISOString()}`,
                entityType: 'appointment',
                clinicId: clinicId,
                appointmentId: appointmentId,
                patientId: `patient_demo_${String((i % 2) + 1).padStart(3, '0')}`,
                providerId: providerId,
                startTime: new Date(appointmentDate.setHours(9 + (i % 8), 0, 0, 0)).toISOString(),
                endTime: new Date(appointmentDate.setHours(9 + (i % 8), 30, 0, 0)).toISOString(),
                timezone: 'America/Los_Angeles',
                status: i <= 2 ? 'completed' : 'scheduled',
                type: 'routine-checkup',
                reason: 'Annual physical examination',
                notes: 'Patient doing well overall',
                source: 'internal',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }

        for (const appointment of appointments) {
            await this.docClient.put({
                TableName: this.tableName,
                Item: appointment
            }).promise();
        }

        console.log('Seeded demo appointments');
    }

    async seedTemplates() {
        const clinicId = 'clinic_demo_001';
        const templates = [
            {
                PK: `TENANT#${clinicId}`,
                SK: 'TEMPLATE#soap_annual_physical',
                GSI1PK: 'TYPE#template',
                GSI1SK: `${clinicId}#soap#annual_physical`,
                entityType: 'template',
                clinicId: clinicId,
                templateId: 'soap_annual_physical',
                name: 'Annual Physical Examination',
                category: 'soap',
                template: {
                    s: 'Patient presents for annual physical examination.\n\nChief Complaint: {{complaint}}\nHistory of Present Illness: {{hpi}}\nReview of Systems: {{ros}}',
                    o: 'Vital Signs:\n- BP: {{bp}}\n- HR: {{hr}}\n- Temp: {{temp}}\n- Weight: {{weight}}\n- Height: {{height}}\n\nPhysical Examination:\n{{physical_exam}}',
                    a: 'Assessment:\n1. {{assessment_1}}\n2. {{assessment_2}}',
                    p: 'Plan:\n1. {{plan_1}}\n2. {{plan_2}}\n\nFollow-up: {{followup}}'
                },
                variables: [
                    'complaint', 'hpi', 'ros', 'bp', 'hr', 'temp', 
                    'weight', 'height', 'physical_exam', 'assessment_1', 
                    'assessment_2', 'plan_1', 'plan_2', 'followup'
                ],
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                PK: `TENANT#${clinicId}`,
                SK: 'TEMPLATE#smart_phrase_normal_exam',
                GSI1PK: 'TYPE#smart_phrase',
                GSI1SK: `${clinicId}#normal_exam`,
                entityType: 'smart_phrase',
                clinicId: clinicId,
                phraseId: 'normal_exam',
                shortcut: '.normal',
                text: 'Physical examination reveals a well-appearing individual in no acute distress. Vital signs are within normal limits. HEENT: Normocephalic, atraumatic. PERRL. TMs clear. Neck: Supple, no lymphadenopathy. Heart: RRR, no murmurs. Lungs: CTA bilaterally. Abdomen: Soft, non-tender, non-distended. Extremities: No edema. Neurologic: Alert and oriented x3.',
                category: 'physical_exam',
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];

        for (const template of templates) {
            await this.docClient.put({
                TableName: this.tableName,
                Item: template
            }).promise();
        }

        console.log('Seeded demo templates');
    }

    async dropTable() {
        console.log(`Dropping table: ${this.tableName}`);
        
        try {
            await this.dynamodb.deleteTable({ TableName: this.tableName }).promise();
            console.log('Table deletion initiated');
            
            // Wait for table to be deleted
            await this.dynamodb.waitFor('tableNotExists', { TableName: this.tableName }).promise();
            console.log('Table deleted successfully');
        } catch (error) {
            if (error.code === 'ResourceNotFoundException') {
                console.log('Table does not exist, nothing to drop');
            } else {
                console.error('Error dropping table:', error);
                throw error;
            }
        }
    }

    async migrate() {
        console.log(`Starting migration for environment: ${this.environment}`);
        
        try {
            await this.createTable();
            await this.seedData();
            
            console.log('Migration completed successfully');
        } catch (error) {
            console.error('Migration failed:', error);
            process.exit(1);
        }
    }

    async rollback() {
        console.log(`Starting rollback for environment: ${this.environment}`);
        
        try {
            await this.dropTable();
            console.log('Rollback completed successfully');
        } catch (error) {
            console.error('Rollback failed:', error);
            process.exit(1);
        }
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = args[1] || 'dev';
    
    const migration = new DatabaseMigration(environment);
    
    switch (command) {
        case 'migrate':
            await migration.migrate();
            break;
        case 'rollback':
            await migration.rollback();
            break;
        case 'seed':
            await migration.seedData();
            break;
        case 'create':
            await migration.createTable();
            break;
        case 'drop':
            await migration.dropTable();
            break;
        default:
            console.log('Usage: node database-migration.js [migrate|rollback|seed|create|drop] [environment]');
            console.log('');
            console.log('Commands:');
            console.log('  migrate   - Create table and seed data');
            console.log('  rollback  - Drop table');
            console.log('  seed      - Seed data only');
            console.log('  create    - Create table only');
            console.log('  drop      - Drop table only');
            console.log('');
            console.log('Environments: dev, staging, prod');
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DatabaseMigration;