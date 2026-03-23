import { Sun, Moon } from 'lucide-preact';

const themeScript = `
    const storageKey = 'statusflare-theme';
    const getTheme = () => {
        if (localStorage.getItem(storageKey)) return localStorage.getItem(storageKey);
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'mocha' : 'latte';
    };
    const setTheme = (theme) => {
        document.documentElement.classList.remove('mocha', 'latte');
        document.documentElement.classList.add(theme);
        localStorage.setItem(storageKey, theme);
    };
    setTheme(getTheme());
    window.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const current = document.documentElement.classList.contains('mocha') ? 'mocha' : 'latte';
                setTheme(current === 'mocha' ? 'latte' : 'mocha');
            });
        }
    });
`;

export function Layout({ title, description = "Real-time system health monitoring", color = "#cba6f7", badgeService = "global", children }: { title: string; description?: string; color?: string; badgeService?: string; children: any }) {
  const badgeUrl = `https://status.helltop.net/badge/${encodeURIComponent(badgeService)}.svg?w=1200&h=630`;
  
  return (
    <html lang="en" className="mocha">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <meta name="description" content={description} />
        
        {/* Open Graph / Social Embeds */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:site_name" content="StatusFlare" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={badgeUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/svg+xml" />
        
        <meta name="theme-color" content={color} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={badgeUrl} />

        <link rel="stylesheet" href="/tailwind.css" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-ctp-base text-ctp-text font-mono min-h-screen w-full selection:bg-ctp-mauve/30 flex flex-col">
        <button id="theme-toggle" className="fixed top-5 right-5 bg-ctp-mantle border border-ctp-surface0 text-ctp-text w-10 h-10 rounded-full cursor-pointer flex items-center justify-center shadow-lg z-50 hover:bg-ctp-surface0 transition-all hover:scale-110 active:scale-95" title="Toggle Theme">
          <Sun className="hidden latte:block" size={20} />
          <Moon className="hidden mocha:block" size={20} />
        </button>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
