const iconCache = new Map<string, { url: string; expires: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2000;

export function slugify(name: string): string {
	let slug = name.startsWith('si') && name.length > 2 ? name.substring(2) : name;
	return slug
		.toLowerCase()
		.replace(/[ _]/g, '-')
		.replace(/[^a-z0-9-+.]/g, '');
}

export const selfhstLightIconUrl = (slug: string) => `https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/${slug}-light.svg`;
export const simpleIconUrl = (slug: string) => `https://cdn.simpleicons.org/${slug}`;
// simple-icons serves icons in black by default; the rendered pages use the
// light theme design, so the fallback must be white to match -light variants.
export const simpleWhiteIconUrl = (slug: string) => `https://cdn.simpleicons.org/${slug}/ffffff`;

/**
 * Resolves the best icon URL for a slug at render time.
 * Prefers the brand-colored selfhst/icons -light variant, falling back to
 * simple-icons when the icon does not exist in the selfhst set.
 * Results are cached in-memory; the pages are fully server-rendered with no
 * client-side JS, so fallbacks must be resolved here rather than via onerror.
 */
export async function resolveIconUrl(slug: string): Promise<string> {
	const now = Date.now();
	const cached = iconCache.get(slug);
	if (cached && cached.expires > now) return cached.url;

	const lightUrl = selfhstLightIconUrl(slug);
	let url = lightUrl;
	try {
		const res = await fetch(lightUrl, { method: 'HEAD', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		if (!res.ok) url = simpleWhiteIconUrl(slug);
	} catch {
		url = simpleWhiteIconUrl(slug);
	}

	iconCache.set(slug, { url, expires: now + CACHE_TTL_MS });
	return url;
}

export async function resolveServiceIconUrls(services: { icon?: string | null }[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const entries = await Promise.all(
		services.map(async (s) => {
			const slug = slugify(s.icon || 'cloudflare');
			return [slug, await resolveIconUrl(slug)] as const;
		}),
	);
	for (const [slug, url] of entries) map.set(slug, url);
	return map;
}
