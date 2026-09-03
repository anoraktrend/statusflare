import { Env } from '../types';
import { getDb } from '../lib/mongo';

const SVG_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="{{WIDTH}}" height="{{HEIGHT}}" viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <g>
    <ellipse style="fill:#000000;stroke:{{COLOR}};stroke-width:11.8631;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="255.99998" rx="250.06845" ry="250.06844" />
    <ellipse style="fill:#000000;stroke:{{COLOR}};stroke-width:41.994;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="255.99998" rx="204.00301" ry="204.00299" />
    <ellipse style="fill:{{COLOR}};fill-opacity:1;stroke:{{COLOR}};stroke-width:7.50716;stroke-dasharray:none;stroke-opacity:1;paint-order:normal" cx="256" cy="256" rx="158.24641" ry="158.24643" />
  </g>
</svg>`;

const STATUS_COLORS: Record<string, string> = {
	up: '#007c00',
	down: '#f80008',
	degraded: '#f9e2af',
};
const DEFAULT_COLOR = '#6c7485';

export function generateBadgeSvg(status: string, width: string, height: string): string {
	const color = STATUS_COLORS[status] || DEFAULT_COLOR;
	return SVG_TEMPLATE.replace(/{{COLOR}}/g, color)
		.replace(/{{WIDTH}}/g, width)
		.replace(/{{HEIGHT}}/g, height);
}

export async function getBadgeStatus(env: Env, serviceName: string): Promise<string> {
	const db = await getDb(env);

	if (serviceName === 'all' || serviceName.toLowerCase() === 'global') {
		const checks = await db.collection('health_checks').find({}).toArray();
		// Need to dedupe per service latest — reuse logic: group by service_id max timestamp
		const latestBySid = new Map<string, { ts: number; status: string }>();
		for (const raw of checks as Record<string, unknown>[]) {
			const sid = raw.service_id as { toHexString?: () => string } | string;
			const hex =
				sid && typeof sid === 'object' && 'toHexString' in (sid as Record<string, unknown>)
					? (sid as { toHexString: () => string }).toHexString()
					: String(sid);
			const ts = raw.timestamp instanceof Date ? (raw.timestamp as Date).getTime() : new Date(String(raw.timestamp)).getTime();
			const existing = latestBySid.get(hex);
			if (!existing || ts > existing.ts) latestBySid.set(hex, { ts, status: String(raw.status ?? 'unknown') });
		}
		const statuses = [...latestBySid.values()].map((v) => v.status);
		if (statuses.length === 0) return 'unknown';
		return statuses.every((s) => s === 'up') ? 'up' : 'down';
	}

	const svc = await db.collection('services').findOne({ name: serviceName } as Record<string, unknown>);
	if (!svc) return 'unknown';
	const sid = (svc as Record<string, unknown>)._id as { toHexString?: () => string } | string;
	// health_checks uses ObjectId for service_id
	const filter: Record<string, unknown> =
		typeof sid === 'object' && sid !== null && 'toHexString' in (sid as Record<string, unknown>)
			? { service_id: sid }
			: { service_id: sid };
	const latest = await db
		.collection('health_checks')
		.find(filter as Record<string, unknown>)
		.sort({ timestamp: -1 } as Record<string, number>)
		.limit(1)
		.toArray();
	if (latest.length === 0) return 'unknown';
	return String((latest[0] as Record<string, unknown>).status ?? 'unknown');
}
