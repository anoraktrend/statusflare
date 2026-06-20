export function html(body: string, extra?: Record<string, string>): Response {
	return new Response(body, {
		headers: { 'Content-Type': 'text/html', ...extra },
	});
}

export function json(data: unknown): Response {
	return new Response(JSON.stringify(data, null, 2), {
		headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
	});
}

export function redirect(location: string): Response {
	return new Response(null, { status: 302, headers: { Location: location } });
}

export function notFound(msg = 'Not Found'): Response {
	return new Response(msg, { status: 404 });
}

export function corsHeaders(): Record<string, string> {
	return { 'Access-Control-Allow-Origin': '*' };
}
