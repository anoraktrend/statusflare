-- Add indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_health_checks_service_id ON health_checks(service_id);
CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);
