declare module 'cloudflare:test' {
	import { ExecutionContext, Fetcher } from '@cloudflare/workers-types';
	
	export const env: Env;
	export const SELF: Fetcher;
	export function createExecutionContext(): ExecutionContext;
	export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;
}
