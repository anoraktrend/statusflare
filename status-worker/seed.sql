INSERT INTO services (name, url, health_endpoint) VALUES ('Seerr', 'https://seerr.helltop.net', '/api/v1/status');
INSERT INTO services (name, url, health_endpoint) VALUES ('LDAP (lldap)', 'https://ldap.helltop.net', '/');
INSERT INTO services (name, url, health_endpoint) VALUES ('Auth (Authelia)', 'https://auth.helltop.net', '/api/health');
INSERT INTO services (name, url, health_endpoint) VALUES ('Immich', 'https://immich.helltop.net', '/api/server/ping');
INSERT INTO services (name, url, health_endpoint) VALUES ('Jellyfin', 'https://jellyfin.helltop.net', '/System/Info/Public');
INSERT INTO services (name, url, health_endpoint) VALUES ('Git (Forgejo)', 'https://git.helltop.net', '/api/healthz');
INSERT INTO services (name, url, health_endpoint) VALUES ('Cloud (Nextcloud)', 'https://cloud.helltop.net', '/status.php');