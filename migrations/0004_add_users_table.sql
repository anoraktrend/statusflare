-- Table for users who can receive alerts
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  notifications_enabled INTEGER DEFAULT 1,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);
