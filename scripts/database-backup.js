#!/usr/bin/env node
/**
 * Database Backup and Restore Script for Medeez DynamoDB
 * Handles manual backups, exports, and data validation
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { createGzip, createGunzip } = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

class DatabaseBackup {
    constructor(environment = 'dev', region = 'us-east-1') {
        this.environment = environment;
        this.region = region;
        this.tableName = `medeez-${environment}-app`;
        this.backupDir = path.join(__dirname, '..', 'backups');
        
        // Configure AWS SDK
        if (environment === 'dev') {
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
            AWS.config.update({ region: this.region });
            this.dynamodb = new AWS.DynamoDB();
            this.docClient = new AWS.DynamoDB.DocumentClient();
        }

        // Create backup directory if it doesn't exist
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    async createOnDemandBackup(backupName = null) {
        if (!backupName) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            backupName = `${this.tableName}-backup-${timestamp}`;
        }

        console.log(`Creating on-demand backup: ${backupName}`);

        try {
            const result = await this.dynamodb.createBackup({
                TableName: this.tableName,
                BackupName: backupName
            }).promise();

            console.log('Backup created successfully:', {
                backupArn: result.BackupDetails.BackupArn,
                backupName: result.BackupDetails.BackupName,
                backupStatus: result.BackupDetails.BackupStatus,
                backupCreationDateTime: result.BackupDetails.BackupCreationDateTime
            });

            return result.BackupDetails;
        } catch (error) {
            console.error('Error creating backup:', error);
            throw error;
        }
    }

    async listBackups() {
        console.log(`Listing backups for table: ${this.tableName}`);

        try {
            const result = await this.dynamodb.listBackups({
                TableName: this.tableName,
                MaxResults: 100
            }).promise();

            console.log('Available backups:');
            result.BackupSummaries.forEach(backup => {
                console.log(`- ${backup.BackupName} (${backup.BackupStatus}) - ${backup.BackupCreationDateTime}`);
            });

            return result.BackupSummaries;
        } catch (error) {
            console.error('Error listing backups:', error);
            throw error;
        }
    }

    async deleteBackup(backupArn) {
        console.log(`Deleting backup: ${backupArn}`);

        try {
            const result = await this.dynamodb.deleteBackup({
                BackupArn: backupArn
            }).promise();

            console.log('Backup deleted successfully:', {
                backupArn: result.BackupDescription.BackupArn,
                backupStatus: result.BackupDescription.BackupStatus
            });

            return result.BackupDescription;
        } catch (error) {
            console.error('Error deleting backup:', error);
            throw error;
        }
    }

    async exportToFile(filename = null, compress = true) {
        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            filename = `${this.tableName}-export-${timestamp}.json`;
            if (compress) {
                filename += '.gz';
            }
        }

        const filepath = path.join(this.backupDir, filename);
        console.log(`Exporting table data to: ${filepath}`);

        try {
            let items = [];
            let lastEvaluatedKey = null;

            // Scan the entire table
            do {
                const params = {
                    TableName: this.tableName,
                    Limit: 100
                };

                if (lastEvaluatedKey) {
                    params.ExclusiveStartKey = lastEvaluatedKey;
                }

                const result = await this.docClient.scan(params).promise();
                items = items.concat(result.Items);
                lastEvaluatedKey = result.LastEvaluatedKey;

                console.log(`Exported ${items.length} items so far...`);
            } while (lastEvaluatedKey);

            const exportData = {
                tableName: this.tableName,
                environment: this.environment,
                exportDate: new Date().toISOString(),
                itemCount: items.length,
                items: items
            };

            if (compress) {
                // Compress the data
                const readStream = require('stream').Readable.from([JSON.stringify(exportData, null, 2)]);
                const writeStream = fs.createWriteStream(filepath);
                const gzipStream = createGzip();

                await pipelineAsync(readStream, gzipStream, writeStream);
                console.log(`Export completed and compressed: ${filepath}`);
            } else {
                fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
                console.log(`Export completed: ${filepath}`);
            }

            return {
                filepath,
                itemCount: items.length,
                compressed: compress
            };
        } catch (error) {
            console.error('Error exporting table data:', error);
            throw error;
        }
    }

    async importFromFile(filepath, skipExisting = true) {
        console.log(`Importing table data from: ${filepath}`);

        try {
            let importData;

            if (filepath.endsWith('.gz')) {
                // Decompress the data
                const readStream = fs.createReadStream(filepath);
                const gunzipStream = createGunzip();
                const chunks = [];

                await pipelineAsync(
                    readStream,
                    gunzipStream,
                    new require('stream').Writable({
                        write(chunk, encoding, callback) {
                            chunks.push(chunk);
                            callback();
                        }
                    })
                );

                importData = JSON.parse(Buffer.concat(chunks).toString());
            } else {
                importData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            }

            console.log(`Import file contains ${importData.itemCount} items`);

            // Batch write items
            const batchSize = 25; // DynamoDB limit
            let imported = 0;
            let skipped = 0;

            for (let i = 0; i < importData.items.length; i += batchSize) {
                const batch = importData.items.slice(i, i + batchSize);
                const requestItems = {};

                // Check for existing items if skipExisting is true
                if (skipExisting) {
                    const filteredBatch = [];
                    for (const item of batch) {
                        const exists = await this.itemExists(item.PK, item.SK);
                        if (!exists) {
                            filteredBatch.push(item);
                        } else {
                            skipped++;
                        }
                    }
                    batch.splice(0, batch.length, ...filteredBatch);
                }

                if (batch.length === 0) {
                    continue;
                }

                requestItems[this.tableName] = batch.map(item => ({
                    PutRequest: {
                        Item: item
                    }
                }));

                const params = {
                    RequestItems: requestItems
                };

                await this.docClient.batchWrite(params).promise();
                imported += batch.length;

                console.log(`Imported ${imported}/${importData.itemCount} items (${skipped} skipped)`);
            }

            console.log(`Import completed. ${imported} items imported, ${skipped} items skipped`);

            return {
                imported,
                skipped,
                total: importData.itemCount
            };
        } catch (error) {
            console.error('Error importing table data:', error);
            throw error;
        }
    }

    async itemExists(pk, sk) {
        try {
            const result = await this.docClient.get({
                TableName: this.tableName,
                Key: { PK: pk, SK: sk }
            }).promise();

            return !!result.Item;
        } catch (error) {
            return false;
        }
    }

    async validateBackup(backupFilepath) {
        console.log(`Validating backup file: ${backupFilepath}`);

        try {
            let backupData;

            if (backupFilepath.endsWith('.gz')) {
                // Decompress the data
                const readStream = fs.createReadStream(backupFilepath);
                const gunzipStream = createGunzip();
                const chunks = [];

                await pipelineAsync(
                    readStream,
                    gunzipStream,
                    new require('stream').Writable({
                        write(chunk, encoding, callback) {
                            chunks.push(chunk);
                            callback();
                        }
                    })
                );

                backupData = JSON.parse(Buffer.concat(chunks).toString());
            } else {
                backupData = JSON.parse(fs.readFileSync(backupFilepath, 'utf8'));
            }

            // Validate structure
            const requiredFields = ['tableName', 'environment', 'exportDate', 'itemCount', 'items'];
            const missingFields = requiredFields.filter(field => !(field in backupData));

            if (missingFields.length > 0) {
                console.error('Invalid backup file structure. Missing fields:', missingFields);
                return false;
            }

            // Validate item count
            if (backupData.itemCount !== backupData.items.length) {
                console.error(`Item count mismatch: expected ${backupData.itemCount}, found ${backupData.items.length}`);
                return false;
            }

            // Validate items structure
            const invalidItems = [];
            backupData.items.forEach((item, index) => {
                if (!item.PK || !item.SK || !item.entityType) {
                    invalidItems.push(index);
                }
            });

            if (invalidItems.length > 0) {
                console.error(`Found ${invalidItems.length} invalid items at indices:`, invalidItems.slice(0, 10));
                return false;
            }

            console.log('Backup file validation passed');
            console.log(`- Table: ${backupData.tableName}`);
            console.log(`- Environment: ${backupData.environment}`);
            console.log(`- Export Date: ${backupData.exportDate}`);
            console.log(`- Item Count: ${backupData.itemCount}`);

            return true;
        } catch (error) {
            console.error('Error validating backup file:', error);
            return false;
        }
    }

    async scheduleBackup(scheduleExpression) {
        console.log(`Setting up scheduled backup with expression: ${scheduleExpression}`);

        try {
            const eventBridge = new AWS.Events();
            const ruleName = `${this.tableName}-backup-schedule`;

            // Create or update the rule
            await eventBridge.putRule({
                Name: ruleName,
                ScheduleExpression: scheduleExpression,
                Description: `Automated backup for ${this.tableName}`,
                State: 'ENABLED'
            }).promise();

            // Create a Lambda function for the backup (would need to be deployed separately)
            console.log(`Backup schedule created: ${ruleName}`);
            console.log('Note: You need to create a Lambda function to handle the backup execution');

            return { ruleName, scheduleExpression };
        } catch (error) {
            console.error('Error setting up backup schedule:', error);
            throw error;
        }
    }

    async cleanupOldBackups(retentionDays = 30) {
        console.log(`Cleaning up backups older than ${retentionDays} days`);

        try {
            const backups = await this.listBackups();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

            let deletedCount = 0;

            for (const backup of backups) {
                if (backup.BackupCreationDateTime < cutoffDate && backup.BackupStatus === 'AVAILABLE') {
                    console.log(`Deleting old backup: ${backup.BackupName}`);
                    await this.deleteBackup(backup.BackupArn);
                    deletedCount++;
                }
            }

            console.log(`Cleanup completed. Deleted ${deletedCount} old backups`);
            return deletedCount;
        } catch (error) {
            console.error('Error cleaning up old backups:', error);
            throw error;
        }
    }

    async getTableStats() {
        console.log(`Getting table statistics for: ${this.tableName}`);

        try {
            const tableDesc = await this.dynamodb.describeTable({
                TableName: this.tableName
            }).promise();

            const stats = {
                tableName: tableDesc.Table.TableName,
                tableStatus: tableDesc.Table.TableStatus,
                itemCount: tableDesc.Table.ItemCount,
                tableSizeBytes: tableDesc.Table.TableSizeBytes,
                creationDateTime: tableDesc.Table.CreationDateTime,
                billingMode: tableDesc.Table.BillingModeSummary?.BillingMode,
                gsiCount: tableDesc.Table.GlobalSecondaryIndexes?.length || 0,
                streamEnabled: tableDesc.Table.StreamSpecification?.StreamEnabled || false
            };

            console.log('Table Statistics:');
            Object.entries(stats).forEach(([key, value]) => {
                console.log(`  ${key}: ${value}`);
            });

            return stats;
        } catch (error) {
            console.error('Error getting table stats:', error);
            throw error;
        }
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = process.env.NODE_ENV || args[1] || 'dev';
    
    const backup = new DatabaseBackup(environment);
    
    switch (command) {
        case 'create':
            const backupName = args[2];
            await backup.createOnDemandBackup(backupName);
            break;
            
        case 'list':
            await backup.listBackups();
            break;
            
        case 'delete':
            const backupArn = args[2];
            if (!backupArn) {
                console.error('Backup ARN is required');
                process.exit(1);
            }
            await backup.deleteBackup(backupArn);
            break;
            
        case 'export':
            const filename = args[2];
            const compress = args[3] !== 'false';
            await backup.exportToFile(filename, compress);
            break;
            
        case 'import':
            const filepath = args[2];
            const skipExisting = args[3] !== 'false';
            if (!filepath) {
                console.error('File path is required');
                process.exit(1);
            }
            await backup.importFromFile(filepath, skipExisting);
            break;
            
        case 'validate':
            const validateFilepath = args[2];
            if (!validateFilepath) {
                console.error('File path is required');
                process.exit(1);
            }
            const isValid = await backup.validateBackup(validateFilepath);
            process.exit(isValid ? 0 : 1);
            break;
            
        case 'schedule':
            const scheduleExpression = args[2];
            if (!scheduleExpression) {
                console.error('Schedule expression is required (e.g., "rate(1 day)")');
                process.exit(1);
            }
            await backup.scheduleBackup(scheduleExpression);
            break;
            
        case 'cleanup':
            const retentionDays = parseInt(args[2]) || 30;
            await backup.cleanupOldBackups(retentionDays);
            break;
            
        case 'stats':
            await backup.getTableStats();
            break;
            
        default:
            console.log('Usage: node database-backup.js [command] [environment] [options]');
            console.log('');
            console.log('Commands:');
            console.log('  create [name]              - Create on-demand backup');
            console.log('  list                       - List all backups');
            console.log('  delete <arn>              - Delete backup by ARN');
            console.log('  export [filename] [compress] - Export table to file');
            console.log('  import <filepath> [skip]   - Import table from file');
            console.log('  validate <filepath>        - Validate backup file');
            console.log('  schedule <expression>      - Schedule automated backups');
            console.log('  cleanup [days]            - Clean up old backups (default: 30 days)');
            console.log('  stats                     - Show table statistics');
            console.log('');
            console.log('Examples:');
            console.log('  node database-backup.js create prod manual-backup-2024');
            console.log('  node database-backup.js export prod backup.json.gz');
            console.log('  node database-backup.js schedule prod "rate(1 day)"');
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DatabaseBackup;