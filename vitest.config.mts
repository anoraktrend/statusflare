import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: './wrangler.test.jsonc',
				// MONGODB vars as secrets for tests — in-memory fallback when DB_NAME=statusflare_test
				vars: {
					MONGODB_URI: 'mongodb://localhost:27017/statusflare_test',
					MONGODB_DB_NAME: 'statusflare_test',
					SESSION_SECRET: 'test-secret-for-vitest-do-not-use-in-prod',
				},
			},
		}),
	],
});
