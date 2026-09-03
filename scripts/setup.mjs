#!/usr/bin/env node
/**
 * Interactive setup for a fresh StatusFlare deployment.
 *
 * What it does:
 *   1. Detects the current placeholder domain (example.com after cleaning).
 *   2. Prompts for your status page host, notification email, and secrets.
 *   3. Rewrites wrangler.jsonc (route pattern, vars, ADMIN_PASSWORD_HASH) and
 *      the badge host in src/components/Layout.tsx.
 *   4. Generates or updates .dev.vars with every value filled in (admin
 *      password is hashed with SHA-256, SESSION_SECRET is random, MONGODB_URI/DB_NAME).
 *   5. Optionally prompts for MongoDB Atlas URI or reminds about D1 transitional binding.
 *   6. Optionally installs dependencies, regenerates worker types, builds CSS.
 *
 * Usage: node scripts/setup.mjs [--yes]
 *   --yes  accept all defaults (skips prompts, runs nothing)
 *
 * Scripted usage (piped input, one answer per line):
 *   statusHost, email, adminPassword, adminPasswordConfirm, autheliaClientId,
 *   autheliaClientSecret, mailgunApiKey, discordWebhook, mongodbUri, runSetup(Y/n)
 */
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';

const WRANGLER = 'wrangler.jsonc';
const LAYOUT = 'src/components/Layout.tsx';
const DEV_VARS_EXAMPLE = '.dev.vars.example';
const DEV_VARS = '.dev.vars';
const HOST_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
// Direct mongodb:// URI is required on Workers (workerd lacks dns.resolveSrv for SRV). SRV fails with EBADQUERY.
// Placeholder — replace with your Atlas direct URI (see atlas-credentials.env MONGODB_URI_DIRECT).
const MONGODB_DEFAULT_URI =
	'mongodb://user:pass@ac-6rizoan-shard-00-00.k4c1r06.mongodb.net:27017,ac-6rizoan-shard-00-01.k4c1r06.mongodb.net:27017,ac-6rizoan-shard-00-02.k4c1r06.mongodb.net:27017/statusflare?tls=true&replicaSet=atlas-d54jsd-shard-0&authSource=admin&retryWrites=true&w=majority&appName=statusflare';

const STATIC_VARS = [
	'ADMIN_PASSWORD_HASH',
	'AUTHELIA_ISSUER',
	'AUTHELIA_CLIENT_ID',
	'OIDC_REDIRECT_URI',
	'MAILGUN_DOMAIN',
	'MAILGUN_FROM',
	'NOTIFICATION_EMAIL',
];
const SECRET_VARS = [
	'AUTHELIA_CLIENT_SECRET',
	'DISCORD_WEBHOOK_URL',
	'MAILGUN_API_KEY',
	'SESSION_SECRET',
	'MONGODB_URI',
	'MONGODB_DB_NAME',
];

const read = (path) => readFileSync(path, 'utf-8');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Extract the bare (non-status-prefixed) domain currently used in config.
function detectDomain(wrangler) {
	const match =
		wrangler.match(/"MAILGUN_DOMAIN":\s*"mail\.([^"]+)"/) ??
		wrangler.match(/"AUTHELIA_ISSUER":\s*"https:\/\/auth\.([^"]+)"/) ??
		wrangler.match(/"pattern":\s*"status\.([^"]+)"/);
	return match ? match[1] : 'example.com';
}

function detectStatusHost(wrangler) {
	return wrangler.match(/"pattern":\s*"([^"]+)"/)?.[1] ?? `status.${detectDomain(wrangler)}`;
}

function detectEmail(wrangler) {
	return wrangler.match(/"NOTIFICATION_EMAIL":\s*"([^"]*)"/)?.[1] ?? '';
}

function detectPackageManager() {
	if (existsSync('pnpm-lock.yaml')) return 'pnpm';
	if (existsSync('bun.lock')) return 'bun';
	if (existsSync('yarn.lock')) return 'yarn';
	return 'npm';
}

function wranglerCmd(pm) {
	try {
		execSync('wrangler --version', { stdio: 'ignore' });
		return 'wrangler';
	} catch {
		return pm === 'bun' ? 'bunx wrangler' : 'npx wrangler';
	}
}

const yesMode = process.argv.includes('--yes');
const wrangler = read(WRANGLER);
const currentDomain = detectDomain(wrangler);
const currentStatusHost = detectStatusHost(wrangler);
const currentEmail = detectEmail(wrangler);
const pm = detectPackageManager();

let statusHost = currentStatusHost;
let email = currentEmail;
let newPasswordHash = '';
let autheliaSecret = '';
let autheliaClientId = '';
let mailgunKey = '';
let discordWebhook = '';
let mongodbUri = '';
let mongodbDbName = 'statusflare';
let runSetup = false;

if (!yesMode) {
	// Node's readline/promises question() hangs on non-TTY stdin, so piped
	// input (echo ... | setup.mjs) is read eagerly and served from a queue.
	const tty = input.isTTY === true;
	let answerIndex = 0;
	let answers = [];
	let rl = null;
	if (tty) {
		rl = createInterface({ input, output });
	} else {
		const pipe = createInterface({ input });
		for await (const line of pipe) answers.push(line);
		pipe.close();
	}
	const askLive = async (question, defaultValue, validate) => {
		for (;;) {
			let answer;
			if (tty) {
				answer = (await rl.question(`${question} [${defaultValue}] `)).trim();
			} else {
				process.stdout.write(`${question} [${defaultValue}] `);
				answer = (answers[answerIndex++] ?? '').trim();
			}
			answer = answer || defaultValue;
			if (!validate || validate(answer)) return answer;
			console.log('  invalid input, try again');
		}
	};
	const askSecretLive = async (label, current) => {
		if (tty) return (await rl.question(`${label} [${current || 'empty to keep'}] `)).trim();
		process.stdout.write(`${label} [${current || 'empty to keep'}] `);
		return (answers[answerIndex++] ?? '').trim();
	};
	const askYesNo = async (question, defaultYes) => {
		let answer;
		if (tty) {
			answer = (await rl.question(question)).trim();
		} else {
			process.stdout.write(question);
			answer = (answers[answerIndex++] ?? '').trim();
		}
		if (answer === '') return defaultYes;
		return answer.toLowerCase() === 'y';
	};
	let password = '';
	autheliaClientId = wrangler.match(/"AUTHELIA_CLIENT_ID":\s*"([^"]*)"/)?.[1] ?? 'statusflare';
	try {
		statusHost = await askLive('Status page host (e.g. status.myapp.dev)', currentStatusHost, (v) => HOST_RE.test(v));
		email = await askLive('Notification email', `alerts@${statusHost.replace(/^status\./, '')}`, (v) => v.includes('@'));
		// At least one admin authentication method is required: either the
		// admin password or the Authelia client ID + secret pair.
		for (;;) {
			password = await askLive('Admin password (blank to skip)', '');
			if (password) {
				const confirm = await askLive('Confirm admin password', '');
				if (password === confirm) {
					newPasswordHash = sha256(password);
					console.log('  password hashed with SHA-256 (plain text is not stored)');
				} else {
					console.log('  passwords do not match, leaving existing value');
					password = '';
				}
			} else if (!tty) {
				answerIndex++; // scripted input always provides the confirm line
			}
			autheliaClientId = await askLive('Authelia client ID (blank to skip)', autheliaClientId);
			autheliaSecret = await askSecretLive('Authelia client secret');
			if (newPasswordHash || (autheliaClientId && autheliaSecret)) break;
			console.log('  error: provide an admin password OR the Authelia client ID and secret');
			if (!tty) {
				process.exitCode = 1;
				break;
			}
		}
		mailgunKey = await askSecretLive('Mailgun API key');
		discordWebhook = await askSecretLive('Discord webhook URL');
		mongodbUri = await askSecretLive('MongoDB Atlas URI (blank to keep default)');
		if (!mongodbUri) mongodbUri = MONGODB_DEFAULT_URI;
		mongodbDbName = await askLive('MongoDB DB name', 'statusflare');
		runSetup = await askYesNo('Install deps, regenerate types, build CSS? [Y/n] ', true);
	} finally {
		rl?.close();
	}
	if (process.exitCode === 1) process.exit(1);
}

// Bare domain the auth/mail services live on (status.<bare> by default).
const bareDomain = statusHost.startsWith('status.') ? statusHost.slice('status.'.length) : statusHost;

let changed = 0;
let notes = [];

// Rewrite hostname tokens in wrangler.jsonc and the badge host in Layout.tsx.
const tokenMap = new Map();
if (currentStatusHost !== statusHost) tokenMap.set(currentStatusHost, statusHost);
const currentAuthHost = `auth.${currentDomain}`;
const newAuthHost = `auth.${bareDomain}`;
if (currentAuthHost !== newAuthHost) tokenMap.set(currentAuthHost, newAuthHost);
const currentMailHost = `mail.${currentDomain}`;
const newMailHost = `mail.${bareDomain}`;
if (currentMailHost !== newMailHost) tokenMap.set(currentMailHost, newMailHost);

for (const path of [WRANGLER, LAYOUT]) {
	const content = read(path);
	let cleaned = content;
	for (const [token, replacement] of tokenMap) cleaned = cleaned.split(token).join(replacement);
	if (cleaned !== content) {
		writeFileSync(path, cleaned);
		console.log(`updated ${path} (${[...tokenMap.entries()].map(([t, r]) => `${t} -> ${r}`).join(', ')})`);
		changed++;
	}
}

if (email && email !== currentEmail) {
	const content = read(WRANGLER);
	const cleaned = content.replace(/"NOTIFICATION_EMAIL":\s*"[^"]*"/, `"NOTIFICATION_EMAIL": "${email}"`);
	if (cleaned !== content) {
		writeFileSync(WRANGLER, cleaned);
		console.log(`updated ${WRANGLER} (NOTIFICATION_EMAIL -> ${email})`);
		changed++;
	}
}

if (newPasswordHash) {
	const content = read(WRANGLER);
	const cleaned = content.replace(/("ADMIN_PASSWORD_HASH":\s*")[^"]*(")/, `$1${newPasswordHash}$2`);
	if (cleaned !== content) {
		writeFileSync(WRANGLER, cleaned);
		console.log(`updated ${WRANGLER} (ADMIN_PASSWORD_HASH)`);
		changed++;
	}
}

// Read existing .dev.vars values (or start from the example template).
let devVars = existsSync(DEV_VARS) ? read(DEV_VARS) : existsSync(DEV_VARS_EXAMPLE) ? read(DEV_VARS_EXAMPLE) : '';
const getVar = (name) => devVars.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '';
const setVar = (name, value) => {
	if (devVars.includes(`${name}=`)) {
		devVars = devVars.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`);
	} else {
		devVars += `${name}=${value}\n`;
	}
};

setVar('ADMIN_PASSWORD_HASH', newPasswordHash || getVar('ADMIN_PASSWORD_HASH') || 'REPLACE_ME');
setVar('AUTHELIA_ISSUER', `https://auth.${bareDomain}`);
setVar('AUTHELIA_CLIENT_ID', autheliaClientId || 'statusflare');
setVar('OIDC_REDIRECT_URI', `https://${statusHost}/admin/callback`);
setVar('MAILGUN_DOMAIN', `mail.${bareDomain}`);
setVar('MAILGUN_FROM', `StatusFlare <alerts@mail.${bareDomain}>`);
setVar('NOTIFICATION_EMAIL', email || getVar('NOTIFICATION_EMAIL') || `alerts@${bareDomain}`);
setVar('AUTHELIA_CLIENT_SECRET', autheliaSecret || getVar('AUTHELIA_CLIENT_SECRET') || '');
setVar('DISCORD_WEBHOOK_URL', discordWebhook || getVar('DISCORD_WEBHOOK_URL') || '');
setVar('MAILGUN_API_KEY', mailgunKey || getVar('MAILGUN_API_KEY') || '');
setVar('SESSION_SECRET', getVar('SESSION_SECRET') || randomBytes(32).toString('hex'));
setVar('MONGODB_URI', mongodbUri || getVar('MONGODB_URI') || MONGODB_DEFAULT_URI);
setVar('MONGODB_DB_NAME', mongodbDbName || getVar('MONGODB_DB_NAME') || 'statusflare');

const wasNew = !existsSync(DEV_VARS);
writeFileSync(DEV_VARS, devVars);
console.log(`${wasNew ? 'created' : 'updated'} ${DEV_VARS} (secrets filled in)`);
changed++;

// Ensure .dev.vars.example exists (cleanup.mjs creates it; setup.mjs regenerates if deleted)
if (!existsSync(DEV_VARS_EXAMPLE)) {
	const exampleContent = `# Copy to .dev.vars and fill in your own values.
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
MONGODB_URI=mongodb://user:pass@ac-6rizoan-shard-00-00.k4c1r06.mongodb.net:27017,ac-6rizoan-shard-00-01.k4c1r06.mongodb.net:27017,ac-6rizoan-shard-00-02.k4c1r06.mongodb.net:27017/statusflare?tls=true&replicaSet=atlas-d54jsd-shard-0&authSource=admin&retryWrites=true&w=majority&appName=statusflare
MONGODB_DB_NAME=statusflare
`;
	writeFileSync(DEV_VARS_EXAMPLE, exampleContent);
	console.log(`created ${DEV_VARS_EXAMPLE}`);
}

const missing = STATIC_VARS.concat(SECRET_VARS).filter((name) => !getVar(name));
if (missing.length > 0) notes.push(`still empty in ${DEV_VARS}: ${missing.join(', ')}`);

// Validate MONGODB_URI is direct (Workers lacks dns.resolveSrv) and attempt seed/ping if possible
const finalUri = getVar('MONGODB_URI');
if (finalUri && finalUri.startsWith('mongodb+srv://')) {
	notes.push(
		'MONGODB_URI uses mongodb+srv:// — Workers will fail (EBADQUERY, no dns.resolveSrv). Use direct mongodb:// with replicaSet shards (see .dev.vars or atlas-credentials.env).',
	);
} else if (finalUri && finalUri.startsWith('mongodb://')) {
	notes.push('MONGODB_URI is direct mongodb:// — correct for Workers.');
}

async function seedIfNeeded() {
	const uriToUse = finalUri || mongodbUri || MONGODB_DEFAULT_URI;
	if (!uriToUse || uriToUse.includes('user:pass')) {
		notes.push('Skipping Atlas seed: MONGODB_URI is placeholder. Set real URI in .dev.vars then run: node scripts/seed.mongo.mjs');
		return;
	}
	try {
		const { seedMongoIfEmpty } = await import('./seed.mongo.mjs');
		const result = await seedMongoIfEmpty({ force: false });
		if (result.seeded) notes.push(`Seeded ${result.inserted} services into ${result.count} total.`);
		else if (result.reason === 'already-seeded') notes.push(`Atlas already seeded (${result.count} services) — no action.`);
		else if (result.reason) notes.push(`Seed skipped: ${result.reason}. Run node scripts/seed.mongo.mjs manually.`);
	} catch (e) {
		notes.push(`Atlas seed failed: ${e instanceof Error ? e.message : String(e)} — run node scripts/seed.mongo.mjs manually.`);
	}
}
// Always attempt seed when DB empty, even without --yes (fresh Atlas has 0 services => silent monitoring)
await seedIfNeeded();

if (runSetup) {
	const w = wranglerCmd(pm);
	for (const cmd of [`${pm} install`, `${pm} run cf-typegen`, `${pm} run build:css`]) {
		console.log(`\n$ ${cmd}`);
		try {
			execSync(cmd, { stdio: 'inherit' });
		} catch (e) {
			notes.push(`${cmd} failed: ${e.message.split('\n')[0]}`);
		}
	}
	notes.push(
		'MongoDB Atlas is primary — no D1 migrations needed. Indexes ensured via getDb() ensureIndexes on first request (includes kv_cache.key unique, rate_limits.key unique).',
	);
	notes.push('Atlas seeding: node scripts/seed.mongo.mjs (auto-runs when services empty; uses seed.sql 9 services).');
}

console.log(`\nDone. ${changed} file(s) changed.`);
for (const n of notes) console.log(`note: ${n}`);
console.log('\nFor production (secrets are never stored in wrangler.jsonc):\n');
for (const name of SECRET_VARS) console.log(`  ${wranglerCmd(pm)} secret put ${name}`);
console.log('  # MONGODB_URI must be the DIRECT Atlas URI (mongodb://, not srv — Workers lacks dns.resolveSrv):');
console.log(
	'  # pnpm wrangler secret put MONGODB_URI  # paste: mongodb://user:***@ac-6rizoan-shard-00-00.k4c1r06.mongodb.net:27017,ac-6rizoan-shard-00-01.k4c1r06.mongodb.net:27017,ac-6rizoan-shard-00-02.k4c1r06.mongodb.net:27017/statusflare?tls=true&replicaSet=atlas-d54jsd-shard-0&authSource=admin&retryWrites=true&w=majority&appName=statusflare',
);
console.log('  # Then seed Atlas if empty: node scripts/seed.mongo.mjs  (or mongosh / Compass with seed.sql)');
console.log('\nThen: pnpm deploy');
