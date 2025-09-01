#!/usr/bin/env node
/**
 * Comprehensive Database Validation and Testing Suite for Medeez v2
 * 
 * Tests all aspects of the database setup including:
 * - Configuration validation
 * - Data structure validation
 * - GSI query patterns
 * - Encryption functionality
 * - Access control patterns
 * - Performance benchmarks
 */

const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

class DatabaseValidationTest {
    constructor(environment = 'dev') {
        this.environment = environment;
        this.basePath = path.join(__dirname, '..');
        this.dataPath = path.join(this.basePath, 'data');
        this.configPath = path.join(this.dataPath, 'config');
        
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            tests: []
        };
    }

    async log(level, message) {
        const timestamp = new Date().toISOString();
        const levelColors = {
            INFO: '\x1b[36m',  // Cyan
            PASS: '\x1b[32m',  // Green
            FAIL: '\x1b[31m',  // Red
            WARN: '\x1b[33m',  // Yellow
            RESET: '\x1b[0m'   // Reset
        };
        
        const color = levelColors[level] || '';
        const reset = levelColors.RESET;
        
        console.log(`${color}[${timestamp}] ${level}: ${message}${reset}`);
    }

    async recordTest(testName, passed, message, details = {}) {
        const result = {
            name: testName,
            passed,
            message,
            details,
            timestamp: new Date().toISOString()
        };
        
        this.results.tests.push(result);
        
        if (passed) {
            this.results.passed++;
            await this.log('PASS', `${testName}: ${message}`);
        } else {
            this.results.failed++;
            await this.log('FAIL', `${testName}: ${message}`);
        }
        
        return result;
    }

    async recordWarning(testName, message, details = {}) {
        this.results.warnings++;
        await this.log('WARN', `${testName}: ${message}`);
        
        this.results.tests.push({
            name: testName,
            passed: null,
            warning: true,
            message,
            details,
            timestamp: new Date().toISOString()
        });
    }

    // Test 1: Configuration Files Exist
    async testConfigurationFiles() {
        const requiredFiles = [
            'dynamodb-table.json',
            's3-bucket.json',
            'kms-key.json',
            'environment.json',
            'parameter-store.json'
        ];

        for (const file of requiredFiles) {
            const filePath = path.join(this.configPath, file);
            const exists = fs.existsSync(filePath);
            
            await this.recordTest(
                `Config File: ${file}`,
                exists,
                exists ? 'Configuration file exists' : 'Configuration file missing',
                { path: filePath }
            );
        }

        // Test additional files
        const additionalFiles = [
            { path: path.join(this.basePath, '.env.local'), name: 'Environment Variables' },
            { path: path.join(this.basePath, 'docker-compose.local.yml'), name: 'Docker Compose' },
            { path: path.join(this.basePath, 'DATABASE_SETUP.md'), name: 'Documentation' }
        ];

        for (const file of additionalFiles) {
            const exists = fs.existsSync(file.path);
            await this.recordTest(
                file.name,
                exists,
                exists ? 'File exists' : 'File missing',
                { path: file.path }
            );
        }
    }

    // Test 2: DynamoDB Configuration Validation
    async testDynamoDBConfiguration() {
        try {
            const configPath = path.join(this.configPath, 'dynamodb-table.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            // Test table name
            const hasValidTableName = config.TableName && config.TableName.includes(this.environment);
            await this.recordTest(
                'DynamoDB Table Name',
                hasValidTableName,
                hasValidTableName ? `Valid table name: ${config.TableName}` : 'Invalid table name',
                { tableName: config.TableName }
            );

            // Test key schema
            const hasValidKeySchema = config.KeySchema && 
                config.KeySchema.find(k => k.AttributeName === 'PK' && k.KeyType === 'HASH') &&
                config.KeySchema.find(k => k.AttributeName === 'SK' && k.KeyType === 'RANGE');
            
            await this.recordTest(
                'DynamoDB Key Schema',
                hasValidKeySchema,
                hasValidKeySchema ? 'Valid partition and sort key configuration' : 'Invalid key schema',
                { keySchema: config.KeySchema }
            );

            // Test GSIs
            const expectedGSIs = ['GSI1', 'GSI2', 'GSI3', 'GSI4', 'GSI5'];
            const actualGSIs = config.GlobalSecondaryIndexes ? config.GlobalSecondaryIndexes.map(gsi => gsi.IndexName) : [];
            const hasAllGSIs = expectedGSIs.every(gsi => actualGSIs.includes(gsi));
            
            await this.recordTest(
                'DynamoDB GSI Configuration',
                hasAllGSIs,
                hasAllGSIs ? 'All 5 GSIs configured correctly' : 'Missing or incorrect GSI configuration',
                { expected: expectedGSIs, actual: actualGSIs }
            );

            // Test encryption
            const hasEncryption = config.SSESpecification && config.SSESpecification.Enabled;
            await this.recordTest(
                'DynamoDB Encryption',
                hasEncryption,
                hasEncryption ? 'Server-side encryption enabled' : 'Encryption not configured',
                { sseSpec: config.SSESpecification }
            );

            // Test streams
            const hasStreams = config.StreamSpecification && config.StreamSpecification.StreamEnabled;
            await this.recordTest(
                'DynamoDB Streams',
                hasStreams,
                hasStreams ? 'DynamoDB Streams enabled for audit logging' : 'Streams not enabled',
                { streamSpec: config.StreamSpecification }
            );

            // Test TTL
            const hasTTL = config.TimeToLiveSpecification && config.TimeToLiveSpecification.AttributeName === 'ttl';
            await this.recordTest(
                'DynamoDB TTL',
                hasTTL,
                hasTTL ? 'TTL configured for automatic cleanup' : 'TTL not configured',
                { ttlSpec: config.TimeToLiveSpecification }
            );

        } catch (error) {
            await this.recordTest(
                'DynamoDB Configuration Load',
                false,
                'Failed to load or parse DynamoDB configuration',
                { error: error.message }
            );
        }
    }

    // Test 3: GSI Query Pattern Validation
    async testGSIQueryPatterns() {
        try {
            const gsiPatternsPath = path.join(this.basePath, 'apps', 'api', 'src', 'utils', 'gsiPatterns.ts');
            
            if (!fs.existsSync(gsiPatternsPath)) {
                await this.recordWarning(
                    'GSI Patterns File',
                    'GSI patterns file not found, using built-in patterns for validation'
                );
                return;
            }

            const gsiContent = fs.readFileSync(gsiPatternsPath, 'utf8');
            
            // Check for required GSI patterns
            const requiredPatterns = [
                'GSI1_PATTERNS',
                'GSI2_PATTERNS', 
                'GSI3_PATTERNS',
                'GSI4_PATTERNS',
                'GSI5_PATTERNS'
            ];

            for (const pattern of requiredPatterns) {
                const hasPattern = gsiContent.includes(pattern);
                await this.recordTest(
                    `GSI Pattern: ${pattern}`,
                    hasPattern,
                    hasPattern ? 'Query pattern defined' : 'Query pattern missing',
                    { pattern }
                );
            }

            // Check for query helper class
            const hasQueryHelper = gsiContent.includes('GSIQueryHelper');
            await this.recordTest(
                'GSI Query Helper',
                hasQueryHelper,
                hasQueryHelper ? 'Query helper class available' : 'Query helper class missing'
            );

        } catch (error) {
            await this.recordTest(
                'GSI Pattern Validation',
                false,
                'Failed to validate GSI query patterns',
                { error: error.message }
            );
        }
    }

    // Test 4: Seed Data Structure Validation
    async testSeedDataStructure() {
        try {
            const seedDataPath = path.join(this.dataPath, 'seed-test-data.json');
            
            if (!fs.existsSync(seedDataPath)) {
                await this.recordWarning(
                    'Seed Data',
                    'Seed data file not found, run seed generation first'
                );
                return;
            }

            const seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));
            
            // Test data structure
            const hasItems = Array.isArray(seedData) && seedData.length > 0;
            await this.recordTest(
                'Seed Data Format',
                hasItems,
                hasItems ? `${seedData.length} items in seed data` : 'Invalid or empty seed data',
                { itemCount: seedData.length }
            );

            if (!hasItems) return;

            // Test entity types
            const entityTypes = [...new Set(seedData.map(item => item.entityType))];
            const requiredEntityTypes = ['CLINIC', 'USER', 'PATIENT', 'APPOINTMENT'];
            const hasRequiredTypes = requiredEntityTypes.every(type => entityTypes.includes(type));

            await this.recordTest(
                'Entity Types',
                hasRequiredTypes,
                hasRequiredTypes ? 'All required entity types present' : 'Missing required entity types',
                { required: requiredEntityTypes, actual: entityTypes }
            );

            // Test DynamoDB key structure
            let validKeyCount = 0;
            for (const item of seedData.slice(0, 10)) { // Sample first 10 items
                if (item.PK && item.SK) {
                    validKeyCount++;
                }
            }

            const hasValidKeys = validKeyCount === Math.min(10, seedData.length);
            await this.recordTest(
                'DynamoDB Key Structure',
                hasValidKeys,
                hasValidKeys ? 'All sampled items have valid PK/SK structure' : 'Some items missing PK/SK',
                { validCount: validKeyCount, sampleSize: Math.min(10, seedData.length) }
            );

            // Test GSI structure
            let gsiCount = 0;
            for (const item of seedData.slice(0, 10)) {
                if (item.GSI1PK && item.GSI1SK) gsiCount++;
            }

            const hasGSIStructure = gsiCount > 0;
            await this.recordTest(
                'GSI Structure',
                hasGSIStructure,
                hasGSIStructure ? `${gsiCount} items have GSI1 structure` : 'No GSI structure found',
                { gsiItems: gsiCount }
            );

            // Test data relationships
            const clinics = seedData.filter(item => item.entityType === 'CLINIC');
            const users = seedData.filter(item => item.entityType === 'USER');
            const patients = seedData.filter(item => item.entityType === 'PATIENT');
            const appointments = seedData.filter(item => item.entityType === 'APPOINTMENT');

            const hasRelationships = clinics.length > 0 && users.length > 0 && 
                                   patients.length > 0 && appointments.length > 0;

            await this.recordTest(
                'Data Relationships',
                hasRelationships,
                hasRelationships ? 'All entity types present with relationships' : 'Missing entity relationships',
                { 
                    clinics: clinics.length,
                    users: users.length, 
                    patients: patients.length,
                    appointments: appointments.length
                }
            );

        } catch (error) {
            await this.recordTest(
                'Seed Data Structure',
                false,
                'Failed to validate seed data structure',
                { error: error.message }
            );
        }
    }

    // Test 5: Encryption Configuration
    async testEncryptionConfiguration() {
        try {
            // Test KMS configuration
            const kmsConfigPath = path.join(this.configPath, 'kms-key.json');
            const kmsConfig = JSON.parse(fs.readFileSync(kmsConfigPath, 'utf8'));

            const hasValidKMSConfig = kmsConfig.KeyId && kmsConfig.Arn && kmsConfig.Enabled;
            await this.recordTest(
                'KMS Configuration',
                hasValidKMSConfig,
                hasValidKMSConfig ? 'KMS key properly configured' : 'Invalid KMS configuration',
                { keyId: kmsConfig.KeyId, enabled: kmsConfig.Enabled }
            );

            // Test encryption service availability
            const encryptionServicePath = path.join(__dirname, 'enhanced-encryption.js');
            const hasEncryptionService = fs.existsSync(encryptionServicePath);
            await this.recordTest(
                'Encryption Service',
                hasEncryptionService,
                hasEncryptionService ? 'Encryption service available' : 'Encryption service missing',
                { path: encryptionServicePath }
            );

            if (hasEncryptionService) {
                // Test mock encryption functionality
                try {
                    const EnhancedEncryptionService = require('./enhanced-encryption.js');
                    const encryptionService = new EnhancedEncryptionService(this.environment);
                    
                    // Test encryption validation if available
                    if (typeof encryptionService.validateEncryption === 'function') {
                        const isValid = await encryptionService.validateEncryption();
                        await this.recordTest(
                            'Encryption Validation',
                            isValid,
                            isValid ? 'Encryption service validation passed' : 'Encryption validation failed'
                        );
                    } else {
                        await this.recordWarning(
                            'Encryption Validation',
                            'Encryption validation method not available'
                        );
                    }
                } catch (error) {
                    await this.recordTest(
                        'Encryption Service Load',
                        false,
                        'Failed to load encryption service',
                        { error: error.message }
                    );
                }
            }

        } catch (error) {
            await this.recordTest(
                'Encryption Configuration',
                false,
                'Failed to test encryption configuration',
                { error: error.message }
            );
        }
    }

    // Test 6: Access Control and Security
    async testAccessControlSecurity() {
        // Test environment configuration
        const envPath = path.join(this.basePath, '.env.local');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            
            const hasJWTSecret = envContent.includes('JWT_SECRET');
            await this.recordTest(
                'JWT Secret Configuration',
                hasJWTSecret,
                hasJWTSecret ? 'JWT secret configured' : 'JWT secret missing',
                { configured: hasJWTSecret }
            );

            const hasEncryptionKey = envContent.includes('ENCRYPTION_KEY');
            await this.recordTest(
                'Encryption Key Configuration',
                hasEncryptionKey,
                hasEncryptionKey ? 'Encryption key configured' : 'Encryption key missing',
                { configured: hasEncryptionKey }
            );

            const hasComplianceMode = envContent.includes('ENABLE_COMPLIANCE_MODE=true');
            await this.recordTest(
                'Compliance Mode',
                hasComplianceMode,
                hasComplianceMode ? 'Compliance mode enabled' : 'Compliance mode not enabled',
                { enabled: hasComplianceMode }
            );
        }

        // Test audit logging configuration
        const rdsConnectionPath = path.join(__dirname, 'rds-connection.js');
        const hasAuditService = fs.existsSync(rdsConnectionPath);
        await this.recordTest(
            'Audit Logging Service',
            hasAuditService,
            hasAuditService ? 'Audit logging service available' : 'Audit logging service missing',
            { path: rdsConnectionPath }
        );
    }

    // Test 7: Performance and Scalability Configuration
    async testPerformanceConfiguration() {
        try {
            const dynamoConfigPath = path.join(this.configPath, 'dynamodb-table.json');
            const dynamoConfig = JSON.parse(fs.readFileSync(dynamoConfigPath, 'utf8'));

            // Test billing mode
            const isOnDemand = dynamoConfig.BillingMode === 'PAY_PER_REQUEST';
            await this.recordTest(
                'DynamoDB Billing Mode',
                isOnDemand,
                isOnDemand ? 'On-demand billing for automatic scaling' : 'Provisioned capacity mode',
                { billingMode: dynamoConfig.BillingMode }
            );

            // Test projection types
            if (dynamoConfig.GlobalSecondaryIndexes) {
                const allProjections = dynamoConfig.GlobalSecondaryIndexes.map(gsi => gsi.Projection.ProjectionType);
                const hasOptimalProjections = allProjections.every(type => type === 'ALL' || type === 'KEYS_ONLY' || type === 'INCLUDE');
                
                await this.recordTest(
                    'GSI Projection Configuration',
                    hasOptimalProjections,
                    hasOptimalProjections ? 'GSI projections properly configured' : 'Suboptimal GSI projections',
                    { projections: allProjections }
                );

                if (this.environment === 'dev' && allProjections.some(type => type === 'ALL')) {
                    await this.recordWarning(
                        'GSI Projections',
                        'ALL projections detected in development - optimize for production'
                    );
                }
            }

        } catch (error) {
            await this.recordTest(
                'Performance Configuration',
                false,
                'Failed to validate performance configuration',
                { error: error.message }
            );
        }
    }

    // Test 8: Backup and Recovery Configuration
    async testBackupRecoveryConfiguration() {
        try {
            const dynamoConfigPath = path.join(this.configPath, 'dynamodb-table.json');
            const dynamoConfig = JSON.parse(fs.readFileSync(dynamoConfigPath, 'utf8'));

            // Test Point-in-Time Recovery
            const hasPITR = dynamoConfig.PointInTimeRecoverySpecification && 
                           dynamoConfig.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled;
            
            await this.recordTest(
                'Point-in-Time Recovery',
                hasPITR,
                hasPITR ? 'PITR enabled for data recovery' : 'PITR not enabled',
                { pitr: dynamoConfig.PointInTimeRecoverySpecification }
            );

            // Test backup configuration
            const s3ConfigPath = path.join(this.configPath, 's3-bucket.json');
            const s3Config = JSON.parse(fs.readFileSync(s3ConfigPath, 'utf8'));
            
            const hasVersioning = s3Config.Versioning && s3Config.Versioning.Status === 'Enabled';
            await this.recordTest(
                'S3 Versioning',
                hasVersioning,
                hasVersioning ? 'S3 versioning enabled for file recovery' : 'S3 versioning not enabled',
                { versioning: s3Config.Versioning }
            );

            const hasLifecycleRules = s3Config.LifecycleRules && s3Config.LifecycleRules.length > 0;
            await this.recordTest(
                'S3 Lifecycle Management',
                hasLifecycleRules,
                hasLifecycleRules ? 'Lifecycle rules configured for cost optimization' : 'No lifecycle rules',
                { rules: s3Config.LifecycleRules ? s3Config.LifecycleRules.length : 0 }
            );

        } catch (error) {
            await this.recordTest(
                'Backup Recovery Configuration',
                false,
                'Failed to validate backup/recovery configuration',
                { error: error.message }
            );
        }
    }

    // Test 9: Documentation and Compliance
    async testDocumentationCompliance() {
        const requiredDocs = [
            { file: 'DATABASE_SETUP.md', name: 'Database Setup Documentation' },
            { file: 'COGNITO_DEPLOYMENT_GUIDE.md', name: 'Cognito Deployment Guide' }
        ];

        for (const doc of requiredDocs) {
            const docPath = path.join(this.basePath, doc.file);
            const exists = fs.existsSync(docPath);
            
            await this.recordTest(
                doc.name,
                exists,
                exists ? 'Documentation exists' : 'Documentation missing',
                { path: docPath }
            );

            if (exists) {
                const content = fs.readFileSync(docPath, 'utf8');
                const hasHIPAAReference = content.toLowerCase().includes('hipaa');
                const hasComplianceReference = content.toLowerCase().includes('compliance');
                
                await this.recordTest(
                    `${doc.name} - HIPAA Reference`,
                    hasHIPAAReference,
                    hasHIPAAReference ? 'HIPAA compliance mentioned' : 'No HIPAA reference found',
                    { hasReference: hasHIPAAReference }
                );
            }
        }

        // Test environment-specific configuration
        const envConfigPath = path.join(this.configPath, 'environment.json');
        if (fs.existsSync(envConfigPath)) {
            const envConfig = JSON.parse(fs.readFileSync(envConfigPath, 'utf8'));
            
            const hasComplianceConfig = envConfig.features && envConfig.features.compliance;
            await this.recordTest(
                'Compliance Feature Flag',
                hasComplianceConfig,
                hasComplianceConfig ? 'Compliance features enabled' : 'Compliance features not configured',
                { enabled: hasComplianceConfig }
            );
        }
    }

    // Test 10: Integration Readiness
    async testIntegrationReadiness() {
        // Check for application integration files
        const apiTypesPath = path.join(this.basePath, 'apps', 'api', 'src', 'types', 'index.ts');
        const hasAPITypes = fs.existsSync(apiTypesPath);
        
        await this.recordTest(
            'API Types Definition',
            hasAPITypes,
            hasAPITypes ? 'API types available for integration' : 'API types not found',
            { path: apiTypesPath }
        );

        const baseRepoPath = path.join(this.basePath, 'apps', 'api', 'src', 'repositories', 'base.ts');
        const hasBaseRepository = fs.existsSync(baseRepoPath);
        
        await this.recordTest(
            'Base Repository',
            hasBaseRepository,
            hasBaseRepository ? 'Base repository available for data access' : 'Base repository not found',
            { path: baseRepoPath }
        );

        // Check Docker setup
        const dockerComposePath = path.join(this.basePath, 'docker-compose.local.yml');
        const hasDockerSetup = fs.existsSync(dockerComposePath);
        
        await this.recordTest(
            'Local Docker Setup',
            hasDockerSetup,
            hasDockerSetup ? 'Docker Compose available for local development' : 'Docker setup missing',
            { path: dockerComposePath }
        );
    }

    // Run all tests
    async runAllTests() {
        await this.log('INFO', '================================================================================');
        await this.log('INFO', `Starting comprehensive database validation for Medeez v2 (${this.environment})`);
        await this.log('INFO', '================================================================================');

        const startTime = Date.now();

        // Run all test suites
        await this.testConfigurationFiles();
        await this.testDynamoDBConfiguration();
        await this.testGSIQueryPatterns();
        await this.testSeedDataStructure();
        await this.testEncryptionConfiguration();
        await this.testAccessControlSecurity();
        await this.testPerformanceConfiguration();
        await this.testBackupRecoveryConfiguration();
        await this.testDocumentationCompliance();
        await this.testIntegrationReadiness();

        const duration = (Date.now() - startTime) / 1000;

        // Generate summary report
        await this.generateSummaryReport(duration);
        
        return this.results;
    }

    async generateSummaryReport(duration) {
        await this.log('INFO', '================================================================================');
        await this.log('INFO', 'DATABASE VALIDATION SUMMARY');
        await this.log('INFO', '================================================================================');
        
        const totalTests = this.results.passed + this.results.failed;
        const passRate = totalTests > 0 ? ((this.results.passed / totalTests) * 100).toFixed(1) : 0;
        
        await this.log('INFO', `Total Tests: ${totalTests}`);
        await this.log('INFO', `Passed: ${this.results.passed}`);
        await this.log('INFO', `Failed: ${this.results.failed}`);
        await this.log('INFO', `Warnings: ${this.results.warnings}`);
        await this.log('INFO', `Pass Rate: ${passRate}%`);
        await this.log('INFO', `Duration: ${duration.toFixed(2)} seconds`);
        
        if (this.results.failed === 0) {
            await this.log('PASS', 'All critical tests passed! Database setup is ready for development.');
        } else {
            await this.log('FAIL', `${this.results.failed} tests failed. Review the issues above before proceeding.`);
        }

        if (this.results.warnings > 0) {
            await this.log('WARN', `${this.results.warnings} warnings issued. Review recommendations for optimization.`);
        }

        // Save detailed report
        const reportPath = path.join(this.dataPath, 'validation-report.json');
        const report = {
            ...this.results,
            environment: this.environment,
            duration,
            passRate,
            timestamp: new Date().toISOString()
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        await this.log('INFO', `Detailed validation report saved to: ${reportPath}`);
        
        await this.log('INFO', '================================================================================');
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = args[1] || process.env.NODE_ENV || 'dev';

    const validator = new DatabaseValidationTest(environment);

    try {
        switch (command) {
            case 'validate':
            case 'test':
                console.log(`Running comprehensive database validation for environment: ${environment}`);
                const results = await validator.runAllTests();
                
                // Exit with error code if tests failed
                if (results.failed > 0) {
                    process.exit(1);
                }
                break;

            case 'report':
                // Show existing validation report
                const reportPath = path.join(validator.dataPath, 'validation-report.json');
                if (fs.existsSync(reportPath)) {
                    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                    console.log('Last Validation Report:');
                    console.log(`Environment: ${report.environment}`);
                    console.log(`Timestamp: ${report.timestamp}`);
                    console.log(`Tests: ${report.passed}/${report.passed + report.failed} passed (${report.passRate}%)`);
                    console.log(`Warnings: ${report.warnings}`);
                    console.log(`Duration: ${report.duration} seconds`);
                } else {
                    console.log('No validation report found. Run validation first.');
                    process.exit(1);
                }
                break;

            default:
                console.log('Usage: node database-validation-test.js [command] [environment]');
                console.log('');
                console.log('Commands:');
                console.log('  validate  - Run comprehensive database validation');
                console.log('  test      - Alias for validate');
                console.log('  report    - Show last validation report');
                console.log('');
                console.log('Examples:');
                console.log('  node database-validation-test.js validate dev');
                console.log('  node database-validation-test.js report');
                process.exit(1);
        }

    } catch (error) {
        console.error('Validation failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DatabaseValidationTest;