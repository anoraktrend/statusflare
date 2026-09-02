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
