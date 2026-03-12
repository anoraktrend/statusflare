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
  token_response_path TEXT
);

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
