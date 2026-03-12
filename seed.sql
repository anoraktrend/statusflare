INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('Seerr', 'https://seerr.helltop.net', '/api/v1/status', 'GET', NULL, NULL);
INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('LDAP (lldap)', 'https://ldap.helltop.net', '/', 'GET', NULL, NULL);
INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('Auth (Authelia)', 'https://auth.helltop.net', '/api/health', 'GET', NULL, NULL);
INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('Immich', 'https://immich.helltop.net', '/api/server/ping', 'GET', NULL, NULL);
INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('Jellyfin', 'https://jellyfin.helltop.net', '/System/Info/Public', 'GET', NULL, NULL);
INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('Git (Forgejo)', 'https://git.helltop.net', '/api/healthz', 'GET', NULL, NULL);
INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('Cloud (Nextcloud)', 'https://cloud.helltop.net', '/status.php', 'GET', NULL, NULL);
INSERT INTO services (name, url, health_endpoint, method, headers_json, body) VALUES ('Vaultwarden', 'https://vault.helltop.net', '/alive', 'GET', NULL, NULL);
