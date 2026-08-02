import { slugify, simpleIconUrl } from '../utils/icon';

export function ServiceIcon({
	name,
	className = '',
	useBrandColor = false,
	src,
}: {
	name: string;
	className?: string;
	useBrandColor?: boolean;
	src?: string;
}) {
	if (!name) {
		return (
			<svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
				<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
			</svg>
		);
	}

	const slug = slugify(name);

	// Server-resolved URL (the pages are fully server-rendered, so fallbacks
	// are determined at render time rather than via client-side onerror).
	if (src) {
		if (useBrandColor) {
			return <img src={src} className={className} alt={name} width="24" height="24" />;
		}
		return (
			<span
				role="img"
				aria-label={name}
				className={`inline-block ${className}`}
				style={{
					width: '1em',
					height: '1em',
					backgroundColor: 'currentColor',
					maskImage: `url(${src})`,
					WebkitMaskImage: `url(${src})`,
					maskSize: 'contain',
					WebkitMaskSize: 'contain',
					maskRepeat: 'no-repeat',
					WebkitMaskRepeat: 'no-repeat',
					maskPosition: 'center',
					WebkitMaskPosition: 'center',
					verticalAlign: 'middle',
				}}
			/>
		);
	}

	// selfhst/icons CDN - SVG is preferred, using -light variant
	const lightIconUrl = `https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/${slug}-light.svg`;
	const fallbackIconUrl = `https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/${slug}.svg`;

	if (useBrandColor) {
		return (
			<img
				src={lightIconUrl}
				className={className}
				alt={name}
				width="24"
				height="24"
				onError={(e) => {
					const img = e.currentTarget;
					if (img.src.endsWith('-light.svg')) {
						img.src = `https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/${slug}-light.png`;
					} else if (img.src.endsWith('-light.png')) {
						img.src = fallbackIconUrl;
					} else if (img.src.endsWith(`${slug}.svg`)) {
						img.src = `https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/${slug}.png`;
					} else if (img.src.includes('selfhst/icons')) {
						img.src = simpleIconUrl(slug);
					}
				}}
			/>
		);
	}

	// Monochrome approach using mask-image to support currentColor
	return (
		<span
			role="img"
			aria-label={name}
			className={`inline-block ${className}`}
			style={{
				width: '1em',
				height: '1em',
				backgroundColor: 'currentColor',
				maskImage: `url(${lightIconUrl}), url(${fallbackIconUrl}), url(${simpleIconUrl(slug)})`,
				WebkitMaskImage: `url(${lightIconUrl}), url(${fallbackIconUrl}), url(${simpleIconUrl(slug)})`,
				maskSize: 'contain',
				WebkitMaskSize: 'contain',
				maskRepeat: 'no-repeat',
				WebkitMaskRepeat: 'no-repeat',
				maskPosition: 'center',
				WebkitMaskPosition: 'center',
				verticalAlign: 'middle',
			}}
		/>
	);
}
