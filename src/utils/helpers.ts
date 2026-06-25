export function err(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export function fmtTime(t: string): string {
	return new Date(t + (t.endsWith('Z') ? '' : 'Z')).toLocaleString();
}

export function cookies(header: string): Record<string, string> {
	return header.split(';').reduce(
		(acc, cookie) => {
			const [name, ...value] = cookie.trim().split('=');
			if (name) acc[name] = value.join('=');
			return acc;
		},
		{} as Record<string, string>,
	);
}

export type ServiceStatus = { latest: { status: string } };
export type ManualIncidents = unknown[];

export function overallStatus(
	services: { latest: { status: string } }[],
	manualIncidents: unknown[],
): { status: string; text: string; color: string; hex: string } {
	const checked = services.filter((s) => s.latest.status !== 'unknown');
	const allUp = checked.length > 0 && checked.every((s) => s.latest.status === 'up');
	const allDown = checked.length > 0 && checked.every((s) => s.latest.status === 'down');
	const hasIncident = manualIncidents.length > 0;

	if (hasIncident || allDown) {
		return { status: hasIncident ? 'down' : 'down', text: hasIncident ? 'Active System Incident' : 'Major System Outage', color: 'ctp-red', hex: '#f38ba8' };
	}
	if (!allUp && checked.length > 0) {
		return { status: 'degraded', text: 'Partial System Outage', color: 'ctp-yellow', hex: '#f9e2af' };
	}
	return { status: 'up', text: 'All Systems Operational', color: 'ctp-green', hex: '#a6e3a1' };
}
