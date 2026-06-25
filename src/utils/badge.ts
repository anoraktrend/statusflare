import { Env } from '../types';

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
	if (serviceName === 'all' || serviceName.toLowerCase() === 'global') {
		const { results } = await env.status_db
			.prepare('SELECT h.status FROM health_checks h JOIN (SELECT MAX(id) as id FROM health_checks GROUP BY service_id) latest ON h.id = latest.id')
			.all<{ status: string }>();
		return results.length > 0 && results.every((r) => r.status === 'up') ? 'up' : 'down';
	}

	const result = await env.status_db
		.prepare('SELECT h.status FROM services s JOIN health_checks h ON h.service_id = s.id WHERE s.name = ? ORDER BY h.id DESC LIMIT 1')
		.bind(serviceName)
		.first<{ status: string }>();
	return result?.status || 'unknown';
}
