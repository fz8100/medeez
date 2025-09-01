import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '@/utils/logger';
import { AppError } from '@/types';

export interface AuditLogEntry {
  id?: string;
  userId: string;
  clinicId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  phi_accessed?: boolean;
  compliance_tags?: string[];
}

export interface SystemConfig {
  key: string;
  value: any;
  clinicId?: string;
  description?: string;
  category: 'system' | 'clinic' | 'feature' | 'integration';
  is_encrypted?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface BackupMetadata {
  backup_id: string;
  backup_type: 'full' | 'incremental' | 'differential';
  source_table: string;
  s3_location: string;
  size_bytes: number;
  checksum: string;
  encryption_key_id: string;
  created_at: Date;
  status: 'in_progress' | 'completed' | 'failed';
  error_message?: string;
}

export class RDSService {
  private pool: Pool;
  private isInitialized = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL || process.env.RDS_CONNECTION_STRING;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL or RDS_CONNECTION_STRING environment variable is required');
    }

    logger.debug('Initializing RDS PostgreSQL connection pool', {
      environment: process.env.NODE_ENV,
      ssl: process.env.NODE_ENV === 'production'
    });

    // Connection pool configuration
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      // Pool settings optimized for Lambda
      min: 0, // Lambda doesn't need minimum connections
      max: process.env.NODE_ENV === 'production' ? 5 : 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      acquireTimeoutMillis: 2000,
      // Application name for monitoring
      application_name: `medeez-api-${process.env.NODE_ENV || 'development'}`
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error', err);
    });

    // Handle client connection errors
    this.pool.on('connect', (client) => {
      logger.debug('New PostgreSQL client connected');
    });

    logger.info('RDS service initialized');
  }

  /**
   * Initialize database schema if needed
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.createTablesIfNotExist();
      this.isInitialized = true;
      logger.info('RDS service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize RDS service', error);
      throw new AppError('Database initialization failed');
    }
  }

  /**
   * Create database tables if they don't exist
   */
  private async createTablesIfNotExist(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Audit logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          clinic_id VARCHAR(255) NOT NULL,
          action VARCHAR(100) NOT NULL,
          resource_type VARCHAR(100) NOT NULL,
          resource_id VARCHAR(255),
          old_values JSONB,
          new_values JSONB,
          metadata JSONB,
          ip_address INET,
          user_agent TEXT,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          phi_accessed BOOLEAN DEFAULT FALSE,
          compliance_tags TEXT[],
          
          -- Indexes for common queries
          INDEX idx_audit_user_clinic (user_id, clinic_id),
          INDEX idx_audit_timestamp (timestamp DESC),
          INDEX idx_audit_resource (resource_type, resource_id),
          INDEX idx_audit_phi (phi_accessed) WHERE phi_accessed = TRUE,
          INDEX idx_audit_clinic_timestamp (clinic_id, timestamp DESC)
        )
      `);

      // System configuration table
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_configs (
          key VARCHAR(255) PRIMARY KEY,
          value JSONB NOT NULL,
          clinic_id VARCHAR(255),
          description TEXT,
          category VARCHAR(50) DEFAULT 'system' CHECK (category IN ('system', 'clinic', 'feature', 'integration')),
          is_encrypted BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          
          -- Unique constraint for clinic-scoped configs
          UNIQUE (key, clinic_id)
        )
      `);

      // Backup metadata table
      await client.query(`
        CREATE TABLE IF NOT EXISTS backup_metadata (
          backup_id VARCHAR(255) PRIMARY KEY,
          backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('full', 'incremental', 'differential')),
          source_table VARCHAR(255) NOT NULL,
          s3_location TEXT NOT NULL,
          size_bytes BIGINT NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          encryption_key_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
          error_message TEXT,
          
          INDEX idx_backup_timestamp (created_at DESC),
          INDEX idx_backup_status (status),
          INDEX idx_backup_table (source_table)
        )
      `);

      // System metrics table for monitoring
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_metrics (
          id SERIAL PRIMARY KEY,
          metric_name VARCHAR(100) NOT NULL,
          metric_value NUMERIC NOT NULL,
          metric_unit VARCHAR(20),
          dimensions JSONB,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          
          INDEX idx_metrics_name_timestamp (metric_name, timestamp DESC),
          INDEX idx_metrics_timestamp (timestamp DESC)
        )
      `);

      // User sessions table for security tracking
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          session_id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          clinic_id VARCHAR(255) NOT NULL,
          ip_address INET,
          user_agent TEXT,
          login_time TIMESTAMPTZ DEFAULT NOW(),
          last_activity TIMESTAMPTZ DEFAULT NOW(),
          logout_time TIMESTAMPTZ,
          is_active BOOLEAN DEFAULT TRUE,
          
          INDEX idx_sessions_user (user_id),
          INDEX idx_sessions_clinic (clinic_id),
          INDEX idx_sessions_active (is_active) WHERE is_active = TRUE
        )
      `);

      // Data retention policy function
      await client.query(`
        CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
        RETURNS void AS $$
        BEGIN
          -- Delete audit logs older than 7 years (HIPAA retention)
          DELETE FROM audit_logs 
          WHERE timestamp < NOW() - INTERVAL '7 years';
          
          -- Delete inactive sessions older than 30 days
          DELETE FROM user_sessions 
          WHERE is_active = FALSE 
          AND (logout_time < NOW() - INTERVAL '30 days' OR last_activity < NOW() - INTERVAL '30 days');
          
          -- Delete system metrics older than 1 year
          DELETE FROM system_metrics 
          WHERE timestamp < NOW() - INTERVAL '1 year';
        END;
        $$ LANGUAGE plpgsql;
      `);

      await client.query('COMMIT');
      logger.info('Database tables created/verified successfully');

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create database tables', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute query with connection from pool
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      const start = Date.now();
      const result = await client.query<T>(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        rowCount: result.rowCount
      });
      
      return result;
    } catch (error) {
      logger.error('Query failed', { query: text, params, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log audit entry
   */
  async logAudit(entry: AuditLogEntry): Promise<void> {
    try {
      await this.initialize();
      
      const query = `
        INSERT INTO audit_logs (
          user_id, clinic_id, action, resource_type, resource_id,
          old_values, new_values, metadata, ip_address, user_agent,
          timestamp, phi_accessed, compliance_tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `;

      const params = [
        entry.userId,
        entry.clinicId,
        entry.action,
        entry.resourceType,
        entry.resourceId,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ipAddress,
        entry.userAgent,
        entry.timestamp,
        entry.phi_accessed || false,
        entry.compliance_tags || []
      ];

      await this.query(query, params);
      
      logger.debug('Audit log entry created', {
        userId: entry.userId,
        clinicId: entry.clinicId,
        action: entry.action,
        resourceType: entry.resourceType
      });

    } catch (error) {
      logger.error('Failed to log audit entry', error);
      // Don't throw - audit logging shouldn't break the main flow
    }
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filters: {
    clinicId?: string;
    userId?: string;
    resourceType?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    phiAccessed?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[], total: number }> {
    await this.initialize();

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (filters.clinicId) {
      whereClauses.push(`clinic_id = $${++paramCount}`);
      params.push(filters.clinicId);
    }

    if (filters.userId) {
      whereClauses.push(`user_id = $${++paramCount}`);
      params.push(filters.userId);
    }

    if (filters.resourceType) {
      whereClauses.push(`resource_type = $${++paramCount}`);
      params.push(filters.resourceType);
    }

    if (filters.action) {
      whereClauses.push(`action = $${++paramCount}`);
      params.push(filters.action);
    }

    if (filters.startDate) {
      whereClauses.push(`timestamp >= $${++paramCount}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClauses.push(`timestamp <= $${++paramCount}`);
      params.push(filters.endDate);
    }

    if (filters.phiAccessed !== undefined) {
      whereClauses.push(`phi_accessed = $${++paramCount}`);
      params.push(filters.phiAccessed);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
    const countResult = await this.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get logs with pagination
    const limit = Math.min(filters.limit || 100, 1000);
    const offset = filters.offset || 0;

    const logsQuery = `
      SELECT * FROM audit_logs 
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    params.push(limit, offset);

    const logsResult = await this.query(logsQuery, params);
    
    return {
      logs: logsResult.rows,
      total
    };
  }

  /**
   * Set system configuration
   */
  async setConfig(config: SystemConfig): Promise<void> {
    await this.initialize();

    const query = `
      INSERT INTO system_configs (key, value, clinic_id, description, category, is_encrypted, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (key, clinic_id) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        is_encrypted = EXCLUDED.is_encrypted,
        updated_at = NOW()
    `;

    await this.query(query, [
      config.key,
      JSON.stringify(config.value),
      config.clinicId || null,
      config.description,
      config.category,
      config.is_encrypted || false
    ]);

    logger.debug('System config updated', {
      key: config.key,
      clinicId: config.clinicId,
      category: config.category
    });
  }

  /**
   * Get system configuration
   */
  async getConfig(key: string, clinicId?: string): Promise<SystemConfig | null> {
    await this.initialize();

    const query = clinicId 
      ? 'SELECT * FROM system_configs WHERE key = $1 AND clinic_id = $2'
      : 'SELECT * FROM system_configs WHERE key = $1 AND clinic_id IS NULL';
    
    const params = clinicId ? [key, clinicId] : [key];
    const result = await this.query(query, params);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      key: row.key,
      value: JSON.parse(row.value),
      clinicId: row.clinic_id,
      description: row.description,
      category: row.category,
      is_encrypted: row.is_encrypted,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Delete configuration
   */
  async deleteConfig(key: string, clinicId?: string): Promise<boolean> {
    await this.initialize();

    const query = clinicId
      ? 'DELETE FROM system_configs WHERE key = $1 AND clinic_id = $2'
      : 'DELETE FROM system_configs WHERE key = $1 AND clinic_id IS NULL';
    
    const params = clinicId ? [key, clinicId] : [key];
    const result = await this.query(query, params);
    
    return (result.rowCount || 0) > 0;
  }

  /**
   * Record backup metadata
   */
  async recordBackup(backup: BackupMetadata): Promise<void> {
    await this.initialize();

    const query = `
      INSERT INTO backup_metadata (
        backup_id, backup_type, source_table, s3_location,
        size_bytes, checksum, encryption_key_id, status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (backup_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message
    `;

    await this.query(query, [
      backup.backup_id,
      backup.backup_type,
      backup.source_table,
      backup.s3_location,
      backup.size_bytes,
      backup.checksum,
      backup.encryption_key_id,
      backup.status,
      backup.error_message
    ]);

    logger.info('Backup metadata recorded', {
      backupId: backup.backup_id,
      sourceTable: backup.source_table,
      status: backup.status
    });
  }

  /**
   * Record system metric
   */
  async recordMetric(
    metricName: string,
    metricValue: number,
    metricUnit?: string,
    dimensions?: Record<string, any>
  ): Promise<void> {
    try {
      await this.initialize();

      const query = `
        INSERT INTO system_metrics (metric_name, metric_value, metric_unit, dimensions)
        VALUES ($1, $2, $3, $4)
      `;

      await this.query(query, [
        metricName,
        metricValue,
        metricUnit,
        dimensions ? JSON.stringify(dimensions) : null
      ]);

    } catch (error) {
      logger.error('Failed to record metric', error);
      // Don't throw - metrics shouldn't break the main flow
    }
  }

  /**
   * Create user session
   */
  async createSession(
    sessionId: string,
    userId: string,
    clinicId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.initialize();

    const query = `
      INSERT INTO user_sessions (session_id, user_id, clinic_id, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (session_id) 
      DO UPDATE SET
        last_activity = NOW(),
        is_active = TRUE
    `;

    await this.query(query, [sessionId, userId, clinicId, ipAddress, userAgent]);
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      await this.initialize();

      const query = `
        UPDATE user_sessions 
        SET last_activity = NOW() 
        WHERE session_id = $1 AND is_active = TRUE
      `;

      await this.query(query, [sessionId]);
    } catch (error) {
      // Ignore session update errors
      logger.debug('Failed to update session activity', error);
    }
  }

  /**
   * End user session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.initialize();

    const query = `
      UPDATE user_sessions 
      SET logout_time = NOW(), is_active = FALSE 
      WHERE session_id = $1
    `;

    await this.query(query, [sessionId]);
  }

  /**
   * Run cleanup of old data
   */
  async runCleanup(): Promise<void> {
    try {
      await this.initialize();
      await this.query('SELECT cleanup_old_audit_logs()');
      logger.info('Database cleanup completed');
    } catch (error) {
      logger.error('Database cleanup failed', error);
      throw new AppError('Database cleanup failed');
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const start = Date.now();
      const result = await this.query('SELECT NOW() as server_time, version() as version');
      const duration = Date.now() - start;

      return {
        healthy: true,
        details: {
          serverTime: result.rows[0].server_time,
          version: result.rows[0].version,
          responseTime: duration,
          poolSize: this.pool.totalCount,
          idleConnections: this.pool.idleCount
        }
      };
    } catch (error) {
      logger.error('RDS health check failed', error);
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('RDS connection pool closed');
    }
  }
}

// Singleton instance
export const rdsService = new RDSService();

// Cleanup on process exit
process.on('exit', () => {
  rdsService.cleanup().catch(console.error);
});

process.on('SIGINT', () => {
  rdsService.cleanup().then(() => process.exit(0)).catch(console.error);
});

process.on('SIGTERM', () => {
  rdsService.cleanup().then(() => process.exit(0)).catch(console.error);
});