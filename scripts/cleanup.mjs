#!/usr/bin/env node
/**
 * Cleans StatusFlare of personal configuration so it can be redistributed.
 *
 * What it does:
 *   1. Replaces personal domains, emails, and org names with neutral
 *      placeholders across all tracked files.
 *   2. Replaces the admin password hash with a "REPLACE_ME" placeholder.
 *   3. Deletes personal-only files (e.g. _subdomains.json).
 *   4. Creates a `.dev.vars.example` with placeholder values for all
 *      environment variables the worker reads.
 *
 * The script only touches files that contain known personal tokens, so it is
 * safe to re-run (idempotent) and never rewrites unrelated files.
 *
 * Usage: node scripts/cleanup.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PLACEHOLDER_DOMAIN = 'example.com';
const PLACEHOLDER_EMAIL = 'alerts@example.com';
const PLACEHOLDER_ORG = 'your-org';

const TOKEN_REPLACEMENTS = [
	['helltop.net', PLACEHOLDER_DOMAIN],
	['lucybrown@vivaldi.net', PLACEHOLDER_EMAIL],
	['anoraktrend', PLACEHOLDER_ORG],
	['fb4e7d739966c50fbac8579e38cc42dc3d0b9b17c352fd5e87726e397022543f', 'REPLACE_ME'],
];

const DELETE_FILES = ['_subdomains.json'];
const SELF = 'scripts/cleanup.mjs';

// All environment variables the worker reads (see src/). Static vars are
// configured in wrangler.jsonc; secrets must be provided by the operator.
const DEV_VARS_EXAMPLE = `# Copy to .dev.vars and fill in your own values.
# Static vars (mirror wrangler.jsonc "vars"):
ADMIN_PASSWORD_HASH=REPLACE_ME
AUTHELIA_ISSUER=https://auth.example.com
AUTHELIA_CLIENT_ID=statusflare
OIDC_REDIRECT_URI=https://status.example.com/admin/callback
MAILGUN_DOMAIN=mail.example.com
MAILGUN_FROM=StatusFlare <alerts@mail.example.com>
NOTIFICATION_EMAIL=alerts@example.com

# Secrets (kept out of wrangler.jsonc; set with \`wrangler secret put\` too):
AUTHELIA_CLIENT_SECRET=
DISCORD_WEBHOOK_URL=
MAILGUN_API_KEY=
SESSION_SECRET=
`;

const ADMIN_PASSWORD_HASH_RE = /("ADMIN_PASSWORD_HASH"\s*:\s*")[^"]*(")/;

function trackedFiles() {
	return execSync('git ls-files', { encoding: 'utf-8' }).split('\n').filter(Boolean);
}

function cleanFile(path) {
	let content = readFileSync(path, 'utf-8');
	const before = content;
	for (const [token, replacement] of TOKEN_REPLACEMENTS) content = content.split(token).join(replacement);
	if (content !== before) {
		writeFileSync(path, content);
		console.log(`cleaned  ${path}`);
		return true;
	}
	return false;
}

let changed = 0;

// Remove personal-only files before cleaning so they are not rewritten first.
for (const path of DELETE_FILES) {
	if (existsSync(path)) {
		execSync(`git rm --quiet ${JSON.stringify(path)}`, { stdio: 'ignore' });
		console.log(`removed  ${path} (personal-only file)`);
		changed++;
	}
}

for (const path of trackedFiles()) {
	if (path.startsWith('.dev.vars') || path === SELF) continue;
	try {
		if (cleanFile(path)) changed++;
	} catch {
		// Skip non-text files (images, wasm, etc.)
	}
}

writeFileSync('.dev.vars.example', DEV_VARS_EXAMPLE);
console.log('created .dev.vars.example');

console.log(`\nDone. ${changed} file(s) changed. Commit the result before publishing:\n`);
console.log('  git add -A && git commit -m "chore: clean personal configuration"');
console.log('\nNext steps for the new operator:\n');
console.log('  1. cp .dev.vars.example .dev.vars   # fill in secrets');
console.log('  2. Edit wrangler.jsonc: route, d1 database_id, vars');
console.log('  3. pnpm install && pnpm cf-typegen');
console.log('  4. pnpm wrangler d1 migrations apply status_db --local');
console.log('  5. pnpm wrangler d1 execute status_db --local --file=./seed.sql');
console.log('  6. pnpm deploy');
