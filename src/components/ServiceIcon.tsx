export function ServiceIcon({ name, className = "", useBrandColor = false }: { name: string; className?: string; useBrandColor?: boolean }) {
  if (!name) {
    return (
      <svg role="img" viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
      </svg>
    );
  }

  // Convert name to slug format
  // 1. Remove 'si' prefix if it exists (legacy support)
  let slug = name.startsWith('si') && name.length > 2 ? name.substring(2) : name;
  
  // 2. Convert to lowercase and replace spaces/underscores with hyphens
  slug = slug
    .toLowerCase()
    .replace(/[ _]/g, '-')
    .replace(/[^a-z0-9-+.]/g, '');

  // selfhst/icons CDN - SVG is preferred, using -light variant
  const lightIconUrl = `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${slug}-light.svg`;
  const fallbackIconUrl = `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${slug}.svg`;

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
          // Fallback sequence: 
          // 1. svg-light (initial) -> png-light
          // 2. png-light -> svg-regular
          // 3. svg-regular -> png-regular
          // 4. png-regular -> simple-icons
          
          if (img.src.endsWith('-light.svg')) {
            img.src = `https://cdn.jsdelivr.net/gh/selfhst/icons/png/${slug}-light.png`;
          } else if (img.src.endsWith('-light.png')) {
            img.src = fallbackIconUrl;
          } else if (img.src.endsWith(`${slug}.svg`)) {
            img.src = `https://cdn.jsdelivr.net/gh/selfhst/icons/png/${slug}.png`;
          } else if (img.src.includes('selfhst/icons')) {
            img.src = `https://cdn.simpleicons.org/${slug}`;
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
        maskImage: `url(${lightIconUrl}), url(${fallbackIconUrl})`,
        WebkitMaskImage: `url(${lightIconUrl}), url(${fallbackIconUrl})`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        verticalAlign: 'middle'
      }}
    />
  );
}
