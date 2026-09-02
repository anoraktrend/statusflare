export function statementsFromSchema(sql: string): string[] {
	const cleaned = sql
		.split('\n')
		.filter((line) => !line.trim().startsWith('--'))
		.join('\n');
	return cleaned
		.split(';')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

// Mongo test helpers — clears all collections via getDb (in-memory fallback when MONGODB_DB_NAME=statusflare_test)
export async function clearMongoCollections(env: Record<string, unknown>) {
	const { getDb } = await import('../src/lib/mongo');
	const db = await getDb(env as unknown as import('../src/types').Env);
	const cols = ['services', 'health_checks', 'incidents', 'users', 'rate_limits', 'kv_cache'];
	for (const name of cols) {
		try {
			await db.collection(name).deleteMany({});
		} catch {
			// ignore if collection missing
		}
	}
}

export async function seedMongoService(
	env: Record<string, unknown>,
	data: { name: string; url: string; health_endpoint: string },
): Promise<string> {
	const { getDb } = await import('../src/lib/mongo');
	const db = await getDb(env as unknown as import('../src/types').Env);
	const res = await db.collection('services').insertOne(data as unknown as Record<string, unknown>);
	const id = (res as unknown as { insertedId: { toHexString: () => string } }).insertedId;
	return typeof id === 'string' ? id : id.toHexString();
}

export async function seedHealthCheck(
	env: Record<string, unknown>,
	serviceId: string,
	fields: { status: string; status_code?: number; latency_ms?: number; timestamp?: Date } = { status: 'up' },
) {
	const { getDb } = await import('../src/lib/mongo');
	const { SimpleObjectId } = await import('../src/lib/objectId');
	const db = await getDb(env as unknown as import('../src/types').Env);
	const oid = SimpleObjectId.isValid(serviceId) ? new SimpleObjectId(serviceId) : serviceId;
	await db.collection('health_checks').insertOne({
		service_id: oid,
		status: fields.status,
		status_code: fields.status_code ?? 200,
		response_snippet: '',
		latency_ms: fields.latency_ms ?? 45,
		timestamp: fields.timestamp ?? new Date(),
	} as unknown as Record<string, unknown>);
}
