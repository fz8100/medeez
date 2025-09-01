-- RDS PostgreSQL Audit Schema for Medeez v2
-- HIPAA Compliance Audit Logging and System Data Storage
-- 
-- This schema stores non-PHI audit data and system configurations
-- All PHI data remains in DynamoDB with field-level encryption

-- Create schemas
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS system_data;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =====================================================
-- AUDIT SCHEMA - HIPAA Compliance Logging
-- =====================================================

-- Audit log table for all system actions
CREATE TABLE audit.access_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    session_id VARCHAR(100),
    
    -- Action details
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'VIEW')),
    resource_type VARCHAR(30) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,
    
    -- PHI access tracking
    phi_accessed BOOLEAN DEFAULT FALSE,
    phi_fields JSONB, -- List of PHI fields accessed (encrypted field names only)
    access_reason VARCHAR(200), -- Treatment, Payment, Operations, etc.
    
    -- Technical details
    ip_address INET NOT NULL,
    user_agent TEXT,
    request_path VARCHAR(500),
    request_method VARCHAR(10),
    response_status INTEGER,
    
    -- Timing
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    
    -- Additional context
    metadata JSONB,
    
    -- Indexes for performance
    INDEX idx_audit_clinic_timestamp (clinic_id, timestamp),
    INDEX idx_audit_user_timestamp (user_id, timestamp),
    INDEX idx_audit_action_timestamp (action, timestamp),
    INDEX idx_audit_phi_accessed (phi_accessed, timestamp) WHERE phi_accessed = TRUE,
    INDEX idx_audit_resource (resource_type, resource_id)
);

-- Partition the audit log by month for performance
CREATE TABLE audit.access_log_y2024m01 PARTITION OF audit.access_log
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE audit.access_log_y2024m02 PARTITION OF audit.access_log
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Add partitions for the next 24 months
DO $$
BEGIN
    FOR i IN 3..24 LOOP
        EXECUTE format('CREATE TABLE audit.access_log_y2024m%s PARTITION OF audit.access_log FOR VALUES FROM (%L) TO (%L)',
            lpad(i::text, 2, '0'),
            format('2024-%s-01', lpad(i::text, 2, '0')),
            format('2024-%s-01', lpad((i+1)::text, 2, '0'))
        );
    END LOOP;
END $$;

-- Login attempts table for security monitoring
CREATE TABLE audit.login_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_login_email_timestamp (email, timestamp),
    INDEX idx_login_ip_timestamp (ip_address, timestamp),
    INDEX idx_login_failed (success, timestamp) WHERE success = FALSE
);

-- Data export tracking for HIPAA compliance
CREATE TABLE audit.data_exports (
    export_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    
    -- Export details
    export_type VARCHAR(30) NOT NULL, -- 'PATIENT_RECORDS', 'BILLING_DATA', 'REPORTS', etc.
    format VARCHAR(20) NOT NULL, -- 'PDF', 'CSV', 'JSON', etc.
    patient_ids TEXT[], -- List of patient IDs if applicable
    date_range DATERANGE,
    
    -- File details
    file_size_bytes BIGINT,
    file_hash VARCHAR(64), -- SHA-256 hash for integrity verification
    s3_key VARCHAR(500), -- S3 location if stored
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- Auto-cleanup date
    
    -- Additional metadata
    metadata JSONB,
    
    INDEX idx_exports_clinic_timestamp (clinic_id, started_at),
    INDEX idx_exports_user_timestamp (user_id, started_at),
    INDEX idx_exports_status (status, started_at),
    INDEX idx_exports_expires (expires_at) WHERE expires_at IS NOT NULL
);

-- System errors and exceptions log
CREATE TABLE audit.error_log (
    error_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id VARCHAR(50),
    user_id VARCHAR(50),
    
    -- Error details
    error_level VARCHAR(10) NOT NULL CHECK (error_level IN ('ERROR', 'WARN', 'FATAL')),
    error_code VARCHAR(50),
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    
    -- Context
    request_id VARCHAR(100),
    function_name VARCHAR(100),
    file_path VARCHAR(200),
    line_number INTEGER,
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_path VARCHAR(500),
    request_body TEXT,
    
    -- Timing
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_error_level_timestamp (error_level, timestamp),
    INDEX idx_error_clinic_timestamp (clinic_id, timestamp),
    INDEX idx_error_code_timestamp (error_code, timestamp)
);

-- =====================================================
-- SYSTEM DATA SCHEMA - Non-PHI Configuration Data
-- =====================================================

-- Database schema version tracking
CREATE TABLE system_data.schema_migrations (
    version VARCHAR(20) PRIMARY KEY,
    description TEXT NOT NULL,
    migration_file VARCHAR(100) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by VARCHAR(100) NOT NULL DEFAULT current_user
);

-- System configuration parameters
CREATE TABLE system_data.system_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) NOT NULL DEFAULT 'string',
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(100) DEFAULT current_user
);

-- Background job tracking
CREATE TABLE system_data.background_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(50) NOT NULL,
    job_name VARCHAR(100) NOT NULL,
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    
    -- Results
    result JSONB,
    error_message TEXT,
    
    -- Configuration
    job_config JSONB,
    
    INDEX idx_jobs_type_status (job_type, status),
    INDEX idx_jobs_scheduled (scheduled_at) WHERE scheduled_at IS NOT NULL,
    INDEX idx_jobs_next_run (next_run_at) WHERE next_run_at IS NOT NULL
);

-- API rate limiting tracking
CREATE TABLE system_data.rate_limits (
    limit_key VARCHAR(200) PRIMARY KEY,
    request_count INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL,
    window_size_seconds INTEGER NOT NULL DEFAULT 3600,
    last_request TIMESTAMPTZ DEFAULT NOW()
);

-- Session management
CREATE TABLE system_data.user_sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    clinic_id VARCHAR(50) NOT NULL,
    
    -- Session data
    session_data JSONB,
    ip_address INET NOT NULL,
    user_agent TEXT,
    
    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    INDEX idx_sessions_user_active (user_id, is_active) WHERE is_active = TRUE,
    INDEX idx_sessions_expires (expires_at),
    INDEX idx_sessions_clinic (clinic_id, is_active)
);

-- Cost monitoring and usage tracking
CREATE TABLE system_data.cost_tracking (
    tracking_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id VARCHAR(50) NOT NULL,
    service VARCHAR(30) NOT NULL, -- 'DYNAMODB', 'S3', 'LAMBDA', etc.
    
    -- Metrics
    request_count BIGINT DEFAULT 0,
    data_size_bytes BIGINT DEFAULT 0,
    estimated_cost_cents BIGINT DEFAULT 0, -- Cost in cents for precision
    
    -- Time period
    date_hour TIMESTAMPTZ NOT NULL, -- Hourly granularity
    
    -- Additional metadata
    metadata JSONB,
    
    UNIQUE(clinic_id, service, date_hour),
    INDEX idx_cost_clinic_date (clinic_id, date_hour),
    INDEX idx_cost_service_date (service, date_hour)
);

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update the last_accessed timestamp for sessions
CREATE OR REPLACE FUNCTION update_session_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session last_accessed
CREATE TRIGGER trigger_update_session_access
    BEFORE UPDATE ON system_data.user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_last_accessed();

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM system_data.user_sessions 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to partition audit logs automatically
CREATE OR REPLACE FUNCTION create_audit_partition(target_date DATE)
RETURNS TEXT AS $$
DECLARE
    table_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    -- Calculate partition bounds
    start_date := date_trunc('month', target_date)::DATE;
    end_date := (start_date + INTERVAL '1 month')::DATE;
    table_name := 'access_log_y' || to_char(start_date, 'YYYY') || 'm' || to_char(start_date, 'MM');
    
    -- Create partition if it doesn't exist
    EXECUTE format('CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.access_log FOR VALUES FROM (%L) TO (%L)',
        table_name, start_date, end_date);
    
    RETURN 'audit.' || table_name;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SECURITY SETTINGS
-- =====================================================

-- Create roles for different access levels
DO $$
BEGIN
    -- Read-only access for analytics
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medeez_analytics') THEN
        CREATE ROLE medeez_analytics;
        GRANT CONNECT ON DATABASE postgres TO medeez_analytics;
        GRANT USAGE ON SCHEMA audit, system_data TO medeez_analytics;
        GRANT SELECT ON ALL TABLES IN SCHEMA audit, system_data TO medeez_analytics;
    END IF;
    
    -- Application access role
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medeez_app') THEN
        CREATE ROLE medeez_app;
        GRANT CONNECT ON DATABASE postgres TO medeez_app;
        GRANT USAGE ON SCHEMA audit, system_data TO medeez_app;
        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA audit, system_data TO medeez_app;
        GRANT DELETE ON system_data.user_sessions, system_data.rate_limits TO medeez_app;
    END IF;
    
    -- Admin role
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'medeez_admin') THEN
        CREATE ROLE medeez_admin;
        GRANT CONNECT ON DATABASE postgres TO medeez_admin;
        GRANT ALL PRIVILEGES ON SCHEMA audit, system_data TO medeez_admin;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA audit, system_data TO medeez_admin;
    END IF;
END $$;

-- Enable row level security where appropriate
ALTER TABLE audit.access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_data.user_sessions ENABLE ROW LEVEL SECURITY;

-- Row level security policies (example - would need to be customized)
-- CREATE POLICY clinic_isolation ON audit.access_log
--     FOR ALL TO medeez_app
--     USING (clinic_id = current_setting('app.clinic_id', true));

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert initial schema version
INSERT INTO system_data.schema_migrations (version, description, migration_file, checksum, applied_by)
VALUES ('1.0.0', 'Initial audit schema creation', 'rds-audit-schema.sql', 
        encode(digest('rds-audit-schema.sql', 'sha256'), 'hex'), 'system')
ON CONFLICT (version) DO NOTHING;

-- Insert default system configuration
INSERT INTO system_data.system_config (config_key, config_value, config_type, description) VALUES
    ('audit_retention_days', '2555', 'integer', 'Number of days to retain audit logs (7 years for HIPAA)'),
    ('session_timeout_minutes', '30', 'integer', 'Session timeout in minutes'),
    ('max_login_attempts', '5', 'integer', 'Maximum failed login attempts before lockout'),
    ('lockout_duration_minutes', '15', 'integer', 'Account lockout duration in minutes'),
    ('export_retention_days', '30', 'integer', 'How long to keep data export files'),
    ('backup_retention_days', '90', 'integer', 'How long to keep database backups'),
    ('cost_alert_threshold_cents', '5000', 'integer', 'Alert when monthly costs exceed this amount (in cents)')
ON CONFLICT (config_key) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_timestamp_desc ON audit.access_log (timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_error_timestamp_desc ON audit.error_log (timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_created_desc ON system_data.background_jobs (started_at DESC NULLS LAST);

-- Comments for documentation
COMMENT ON SCHEMA audit IS 'HIPAA compliance audit logging and security tracking';
COMMENT ON SCHEMA system_data IS 'Non-PHI system configuration and operational data';

COMMENT ON TABLE audit.access_log IS 'Comprehensive audit log for all system access and PHI interactions';
COMMENT ON TABLE audit.login_attempts IS 'Security monitoring for authentication attempts';
COMMENT ON TABLE audit.data_exports IS 'Tracking of all data exports for compliance';
COMMENT ON TABLE audit.error_log IS 'System error logging for debugging and monitoring';

COMMENT ON TABLE system_data.schema_migrations IS 'Database schema version control';
COMMENT ON TABLE system_data.system_config IS 'Application configuration parameters';
COMMENT ON TABLE system_data.background_jobs IS 'Async job processing and scheduling';
COMMENT ON TABLE system_data.rate_limits IS 'API rate limiting counters';
COMMENT ON TABLE system_data.user_sessions IS 'Active user session management';
COMMENT ON TABLE system_data.cost_tracking IS 'AWS cost monitoring and optimization';

-- Grant permissions
GRANT USAGE ON SCHEMA audit TO medeez_app;
GRANT USAGE ON SCHEMA system_data TO medeez_app;
GRANT ALL ON ALL TABLES IN SCHEMA audit TO medeez_app;
GRANT ALL ON ALL TABLES IN SCHEMA system_data TO medeez_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA audit TO medeez_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA system_data TO medeez_app;

-- Success message
SELECT 'RDS PostgreSQL audit schema created successfully!' as result;