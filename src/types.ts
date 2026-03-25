export interface Env {
  status_db: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD_HASH?: string;
  AUTHELIA_ISSUER: string;
  AUTHELIA_CLIENT_ID: string;
  AUTHELIA_CLIENT_SECRET: string;
  OIDC_REDIRECT_URI: string;
  SESSION_SECRET: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAILGUN_FROM?: string;
  NOTIFICATION_EMAIL?: string;
  DISCORD_WEBHOOK_URL?: string;
}

export interface Service {
  id: number;
  name: string;
  url: string;
  health_endpoint: string;
  method?: string;
  headers_json?: string;
  body?: string;
  token_url?: string;
  token_body?: string;
  token_response_path?: string;
  icon?: string;
}

export interface HealthCheck {
  id: number;
  service_id: number;
  status: 'up' | 'down' | 'unknown';
  status_code: number | null;
  response_snippet: string;
  latency_ms: number;
  timestamp: string;
}

export interface Incident {
  id: number;
  service_id: number | null;
  service_name?: string;
  title: string;
  message: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

export interface StatusChange {
  serviceName: string;
  status: 'up' | 'down';
  previousStatus: string;
  statusCode: number | null;
  responseSnippet: string | null;
  time: string;
}

export interface User {
  email: string;
  notifications_enabled: number;
  last_login: string;
}
