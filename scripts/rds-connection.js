#!/usr/bin/env node
/**
 * RDS PostgreSQL Connection and Management for Medeez v2
 * Handles secure connections to RDS instance for audit logging and system data
 */

const { Pool, Client } = require('pg');
const { SecretsManager } = require('@aws-sdk/client-secrets-manager');
const fs = require('fs');
const path = require('path');

class RDSConnection {
    constructor(environment = 'dev', region = 'us-east-1') {
        this.environment = environment;
        this.region = region;
        this.secretsManager = new SecretsManager({ region });
        this.pool = null;
        this.connectionConfig = null;
    }

    /**
     * Get database connection configuration from AWS Secrets Manager
     */
    async getConnectionConfig() {
        if (this.connectionConfig) {
            return this.connectionConfig;
        }

        try {
            const secretName = `medeez-${this.environment}-database-credentials`;
            
            if (this.environment === 'dev') {
                // For local development, use hardcoded values or environment variables
                this.connectionConfig = {
                    host: process.env.RDS_HOST || 'localhost',
                    port: parseInt(process.env.RDS_PORT) || 5432,
                    database: process.env.RDS_DATABASE || 'medeez_dev',
                    user: process.env.RDS_USER || 'postgres',
                    password: process.env.RDS_PASSWORD || 'password',
                    ssl: false,
                    max: 10, // Maximum number of connections in pool
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 5000,
                };
            } else {
                // Get credentials from AWS Secrets Manager
                const response = await this.secretsManager.getSecretValue({
                    SecretId: secretName
                });

                const secret = JSON.parse(response.SecretString);
                
                this.connectionConfig = {
                    host: secret.host,
                    port: secret.port || 5432,
                    database: secret.database || `medeez_${this.environment}`,
                    user: secret.username,
                    password: secret.password,
                    ssl: {
                        rejectUnauthorized: true,
                        ca: fs.readFileSync(path.join(__dirname, '..', 'certs', 'rds-ca-2019-root.pem'))
                    },
                    max: 20, // Maximum number of connections in pool
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 10000,
                    statement_timeout: 30000,
                    query_timeout: 30000,
                };
            }

            console.log(`Database configuration loaded for environment: ${this.environment}`);
            return this.connectionConfig;

        } catch (error) {
            console.error('Error loading database configuration:', error);
            throw error;
        }
    }

    /**
     * Initialize connection pool
     */
    async connect() {
        if (this.pool) {
            return this.pool;
        }

        try {
            const config = await this.getConnectionConfig();
            this.pool = new Pool(config);

            // Handle pool errors
            this.pool.on('error', (err) => {
                console.error('Database pool error:', err);
            });

            // Test the connection
            const testClient = await this.pool.connect();
            const result = await testClient.query('SELECT NOW() as current_time, version() as postgres_version');
            testClient.release();

            console.log('Database connection established:', {
                host: config.host,
                database: config.database,
                time: result.rows[0].current_time,
                version: result.rows[0].postgres_version.split(' ')[0]
            });

            return this.pool;

        } catch (error) {
            console.error('Failed to connect to database:', error);
            throw error;
        }
    }

    /**
     * Execute a query
     */
    async query(text, params = []) {
        const pool = await this.connect();
        const start = Date.now();
        
        try {
            const result = await pool.query(text, params);
            const duration = Date.now() - start;
            
            if (duration > 1000) {
                console.warn(`Slow query detected (${duration}ms):`, text.substring(0, 100) + '...');
            }
            
            return result;
        } catch (error) {
            console.error('Database query error:', {
                query: text.substring(0, 200),
                params: params.length > 0 ? 'present' : 'none',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Execute a transaction
     */
    async transaction(callback) {
        const pool = await this.connect();
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Initialize the database schema
     */
    async initializeSchema() {
        console.log('Initializing database schema...');
        
        try {
            const schemaPath = path.join(__dirname, 'rds-audit-schema.sql');
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            
            await this.query(schemaSql);
            console.log('Database schema initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize database schema:', error);
            throw error;
        }
    }

    /**
     * Log audit event
     */
    async logAuditEvent({
        clinicId,
        userId,
        sessionId,
        action,
        resourceType,
        resourceId,
        phiAccessed = false,
        phiFields = [],
        accessReason = null,
        ipAddress,
        userAgent,
        requestPath = null,
        requestMethod = null,
        responseStatus = null,
        durationMs = null,
        metadata = {}
    }) {
        const query = `
            INSERT INTO audit.access_log (
                clinic_id, user_id, session_id, action, resource_type, resource_id,
                phi_accessed, phi_fields, access_reason, ip_address, user_agent,
                request_path, request_method, response_status, duration_ms, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING log_id, timestamp
        `;
        
        const params = [
            clinicId, userId, sessionId, action, resourceType, resourceId,
            phiAccessed, JSON.stringify(phiFields), accessReason, ipAddress, userAgent,
            requestPath, requestMethod, responseStatus, durationMs, JSON.stringify(metadata)
        ];
        
        const result = await this.query(query, params);
        return result.rows[0];
    }

    /**
     * Log login attempt
     */
    async logLoginAttempt({ email, ipAddress, userAgent, success, failureReason = null }) {
        const query = `
            INSERT INTO audit.login_attempts (email, ip_address, user_agent, success, failure_reason)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING attempt_id, timestamp
        `;
        
        const params = [email, ipAddress, userAgent, success, failureReason];
        const result = await this.query(query, params);
        return result.rows[0];
    }

    /**
     * Log system error
     */
    async logError({
        clinicId = null,
        userId = null,
        errorLevel,
        errorCode = null,
        errorMessage,
        stackTrace = null,
        requestId = null,
        functionName = null,
        filePath = null,
        lineNumber = null,
        ipAddress = null,
        userAgent = null,
        requestPath = null,
        requestBody = null
    }) {
        const query = `
            INSERT INTO audit.error_log (
                clinic_id, user_id, error_level, error_code, error_message, stack_trace,
                request_id, function_name, file_path, line_number,
                ip_address, user_agent, request_path, request_body
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING error_id, timestamp
        `;
        
        const params = [
            clinicId, userId, errorLevel, errorCode, errorMessage, stackTrace,
            requestId, functionName, filePath, lineNumber,
            ipAddress, userAgent, requestPath, requestBody
        ];
        
        const result = await this.query(query, params);
        return result.rows[0];
    }

    /**
     * Create or update user session
     */
    async createSession({ sessionId, userId, clinicId, ipAddress, userAgent, expiresAt, sessionData = {} }) {
        const query = `
            INSERT INTO system_data.user_sessions (
                session_id, user_id, clinic_id, ip_address, user_agent, expires_at, session_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (session_id) 
            DO UPDATE SET 
                last_accessed = NOW(),
                session_data = $7
            RETURNING created_at, last_accessed
        `;
        
        const params = [sessionId, userId, clinicId, ipAddress, userAgent, expiresAt, JSON.stringify(sessionData)];
        const result = await this.query(query, params);
        return result.rows[0];
    }

    /**
     * Get active session
     */
    async getSession(sessionId) {
        const query = `
            SELECT session_id, user_id, clinic_id, session_data, 
                   created_at, last_accessed, expires_at, is_active
            FROM system_data.user_sessions 
            WHERE session_id = $1 AND is_active = true AND expires_at > NOW()
        `;
        
        const result = await this.query(query, [sessionId]);
        return result.rows[0];
    }

    /**
     * Invalidate session
     */
    async invalidateSession(sessionId) {
        const query = `
            UPDATE system_data.user_sessions 
            SET is_active = false 
            WHERE session_id = $1
            RETURNING session_id
        `;
        
        const result = await this.query(query, [sessionId]);
        return result.rows[0];
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions() {
        const result = await this.query('SELECT cleanup_expired_sessions() as deleted_count');
        return result.rows[0].deleted_count;
    }

    /**
     * Track cost metrics
     */
    async trackCostMetrics({ clinicId, service, requestCount = 0, dataSizeBytes = 0, estimatedCostCents = 0, metadata = {} }) {
        const dateHour = new Date();
        dateHour.setMinutes(0, 0, 0); // Round to hour

        const query = `
            INSERT INTO system_data.cost_tracking (
                clinic_id, service, request_count, data_size_bytes, 
                estimated_cost_cents, date_hour, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (clinic_id, service, date_hour) 
            DO UPDATE SET 
                request_count = cost_tracking.request_count + $3,
                data_size_bytes = cost_tracking.data_size_bytes + $4,
                estimated_cost_cents = cost_tracking.estimated_cost_cents + $5,
                metadata = $7
            RETURNING tracking_id
        `;
        
        const params = [
            clinicId, service, requestCount, dataSizeBytes, 
            estimatedCostCents, dateHour, JSON.stringify(metadata)
        ];
        
        const result = await this.query(query, params);
        return result.rows[0];
    }

    /**
     * Get system configuration
     */
    async getSystemConfig(configKey = null) {
        let query, params;
        
        if (configKey) {
            query = 'SELECT config_key, config_value, config_type FROM system_data.system_config WHERE config_key = $1';
            params = [configKey];
        } else {
            query = 'SELECT config_key, config_value, config_type FROM system_data.system_config ORDER BY config_key';
            params = [];
        }
        
        const result = await this.query(query, params);
        
        if (configKey) {
            const row = result.rows[0];
            if (!row) return null;
            
            // Convert value based on type
            switch (row.config_type) {
                case 'integer':
                    return parseInt(row.config_value);
                case 'boolean':
                    return row.config_value.toLowerCase() === 'true';
                case 'json':
                    return JSON.parse(row.config_value);
                default:
                    return row.config_value;
            }
        }
        
        // Return all configs as object
        const configs = {};
        result.rows.forEach(row => {
            switch (row.config_type) {
                case 'integer':
                    configs[row.config_key] = parseInt(row.config_value);
                    break;
                case 'boolean':
                    configs[row.config_key] = row.config_value.toLowerCase() === 'true';
                    break;
                case 'json':
                    configs[row.config_key] = JSON.parse(row.config_value);
                    break;
                default:
                    configs[row.config_key] = row.config_value;
            }
        });
        
        return configs;
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const result = await this.query('SELECT NOW() as timestamp, version() as version');
            return {
                status: 'healthy',
                timestamp: result.rows[0].timestamp,
                version: result.rows[0].version,
                pool: {
                    totalCount: this.pool?.totalCount || 0,
                    idleCount: this.pool?.idleCount || 0,
                    waitingCount: this.pool?.waitingCount || 0
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Close connection pool
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            console.log('Database connection pool closed');
        }
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const environment = args[1] || process.env.NODE_ENV || 'dev';
    
    const rds = new RDSConnection(environment);
    
    try {
        switch (command) {
            case 'init':
                console.log('Initializing database schema...');
                await rds.connect();
                await rds.initializeSchema();
                console.log('Database initialization completed successfully');
                break;
                
            case 'test':
                console.log('Testing database connection...');
                const health = await rds.healthCheck();
                console.log('Health check result:', health);
                break;
                
            case 'config':
                console.log('Loading system configuration...');
                await rds.connect();
                const configs = await rds.getSystemConfig();
                console.log('System configurations:');
                console.table(configs);
                break;
                
            case 'cleanup':
                console.log('Cleaning up expired sessions...');
                await rds.connect();
                const deletedCount = await rds.cleanupExpiredSessions();
                console.log(`Cleaned up ${deletedCount} expired sessions`);
                break;
                
            default:
                console.log('Usage: node rds-connection.js [command] [environment]');
                console.log('');
                console.log('Commands:');
                console.log('  init     - Initialize database schema');
                console.log('  test     - Test database connection');
                console.log('  config   - Show system configuration');
                console.log('  cleanup  - Clean up expired sessions');
                console.log('');
                console.log('Environments: dev, staging, prod');
                process.exit(1);
        }
        
    } catch (error) {
        console.error('Command failed:', error);
        process.exit(1);
    } finally {
        await rds.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RDSConnection;