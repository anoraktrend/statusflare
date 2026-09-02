-- Table for service definitions
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  health_endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  headers_json TEXT,
  body TEXT,
  token_url TEXT,
  token_body TEXT,
  token_response_path TEXT,
  icon TEXT
);
CREATE INDEX IF NOT EXISTS idx_services_name ON services(name);

-- Table for caching tokens (JWTs, etc)
CREATE TABLE IF NOT EXISTS kv_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at DATETIME NOT NULL
);

-- Table for health check results
CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'up', 'down'
  status_code INTEGER,
  response_snippet TEXT,
  latency_ms INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES services(id)
);
CREATE INDEX IF NOT EXISTS idx_health_checks_service_id ON health_checks(service_id);
-- Performance indexes for bounded time-window queries (mirrors migrations/0006_add_performance_indexes.sql)
CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp);
CREATE INDEX IF NOT EXISTS idx_health_checks_service_timestamp ON health_checks(service_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_health_checks_status_timestamp ON health_checks(status, timestamp);

-- Table for manual incident management
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER, -- Optional: link to a specific service
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open', -- 'open', 'resolved'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

-- Table for users who can receive alerts
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  notifications_enabled INTEGER DEFAULT 1,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table for D1-backed fixed-window rate limiting (mirrors migrations/0007_add_rate_limits.sql)
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);
