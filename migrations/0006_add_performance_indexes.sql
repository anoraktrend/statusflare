-- Indexes for bounded time-window queries and per-service history scans
CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp);
CREATE INDEX IF NOT EXISTS idx_health_checks_service_timestamp ON health_checks(service_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_health_checks_status_timestamp ON health_checks(status, timestamp);
