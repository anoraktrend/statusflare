const themeScript = `
    const storageKey = 'statusflare-theme';
    const getTheme = () => {
        if (localStorage.getItem(storageKey)) return localStorage.getItem(storageKey);
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };
    const setTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(storageKey, theme);
    };
    setTheme(getTheme());
    window.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('theme-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme');
                setTheme(current === 'dark' ? 'light' : 'dark');
            });
        }
    });
`;

const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');

    *, *::before, *::after {
        box-sizing: border-box;
    }

    :root {
        --up-color: #007c00;
        --down-color: #f80008;
        --warn-color: #6c7485;
        --accent: #cba6f7;
    }

    /* Catppuccin Mocha (Dark) - Default */
    :root, [data-theme='dark'] {
        --bg-color: #1e1e2e;
        --card-bg: #181825;
        --text-main: #cdd6f4;
        --text-muted: #bac2de;
        --border-color: #313244;
        --code-bg: #11111b;
        --accent: #cba6f7; /* Mauve */
        --up-color: #a6e3a1; /* Green */
        --down-color: #f38ba8; /* Red */
        --warn-color: #f9e2af; /* Yellow */
    }

    /* Catppuccin Latte (Light) */
    [data-theme='light'] {
        --bg-color: #eff1f5;
        --card-bg: #e6e9ef;
        --text-main: #4c4f69;
        --text-muted: #6c6f85;
        --border-color: #ccd0da;
        --code-bg: #dce0e8;
        --accent: #8839ef; /* Mauve */
        --up-color: #40a02b; /* Green */
        --down-color: #d20f39; /* Red */
        --warn-color: #df8e1d; /* Yellow */
    }

    body {
        font-family: 'Space Mono', monospace;
        background-color: var(--bg-color);
        color: var(--text-main);
        margin: 0;
        display: block;
        min-height: 100vh;
        width: 100%;
        overflow-x: hidden;
        transition: background-color 0.3s ease, color 0.3s ease;
    }

    .theme-toggle {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        color: var(--text-main);
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        z-index: 100;
    }
`;

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m] || m));
}

function renderSvgDot(status: string, size: number = 16) {
    const colorVar = status === 'up' ? 'var(--up-color)' : (status === 'down' ? 'var(--down-color)' : 'var(--warn-color)');
    return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle; flex-shrink: 0;">
    <ellipse cx="256" cy="255.99998" rx="250.06845" ry="250.06844" fill="black" stroke="${colorVar}" stroke-width="11.8631" />
    <ellipse cx="256" cy="255.99998" rx="204.00301" ry="204.00299" fill="black" stroke="${colorVar}" stroke-width="41.994" />
    <ellipse cx="256" cy="256" rx="158.24641" ry="158.24643" fill="${colorVar}" stroke="${colorVar}" stroke-width="7.50716" />
  </svg>`;
}

function renderParsedData(snippet: string) {
    try {
        let data = JSON.parse(snippet);
        
        // Unwrap GraphQL "data" wrapper if it's the only top-level key
        if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1 && data.data) {
            data = data.data;
        }

        const renderValue = (val: any): string => {
            if (val === null) return '<span style="color: var(--text-muted)">null</span>';
            
            // Special handling for Arrays
            if (Array.isArray(val)) {
                if (val.length === 0) return '[]';
                
                // Uniform Array Detection (array of objects with exact same keys)
                const first = val[0];
                if (first && typeof first === 'object' && !Array.isArray(first)) {
                    const keys = Object.keys(first);
                    const isUniform = val.every(item => 
                        item && typeof item === 'object' && !Array.isArray(item) &&
                        Object.keys(item).length === keys.length &&
                        keys.every(k => k in item)
                    );
                    
                    if (isUniform) {
                        return `<div style="overflow-x: auto; margin-top: 8px; width: 100%;">
                            <table class="parsed-table">
                                <thead><tr>${keys.map(k => `<th>${escapeHtml(k)}</th>`).join('')}</tr></thead>
                                <tbody>
                                    ${val.map(item => `<tr>${keys.map(k => `<td>${renderValue(item[k])}</td>`).join('')}</tr>`).join('')}
                                </tbody>
                            </table>
                        </div>`;
                    }
                }

                return `<div class="parsed-list">
                    ${val.map(item => `<div class="parsed-list-item">${renderValue(item)}</div>`).join('')}
                </div>`;
            }

            // Special handling for Objects
            if (typeof val === 'object') {
                return `<div class="parsed-object">
                    ${Object.entries(val).map(([k, v]) => {
                        const isComplex = v !== null && typeof v === 'object';
                        const countSuffix = Array.isArray(v) ? ` <small style="color:var(--text-muted)">(${v.length})</small>` : '';
                        return `
                        <div class="parsed-item" style="${isComplex ? 'display: block;' : ''}">
                            <span class="parsed-key">${escapeHtml(k)}${countSuffix}:</span>
                            <span class="parsed-value">${renderValue(v)}</span>
                        </div>`;
                    }).join('')}
                </div>`;
            }
            
            // Leaf values
            const s = String(val);
            const lower = s.toLowerCase();
            const isHealthWord = ['pass', 'up', 'ok', 'healthy', 'fail', 'down', 'error'].includes(lower);
            const color = (lower === 'pass' || lower === 'up' || lower === 'ok' || lower === 'healthy') ? 'var(--up-color)' : 'var(--down-color)';
            
            if (isHealthWord) {
                return `<span style="color: ${color}; font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">${escapeHtml(s)}</span>`;
            }
            return escapeHtml(s);
        };

        return `<div class="parsed-content">${renderValue(data)}</div>`;
    } catch {
        return `<pre class="raw-snippet">${escapeHtml(snippet.slice(0, 1000))}</pre>`;
    }
}

export function renderAdminPage(services: any[], activeIncidents: any[], error?: string, isAuthenticated: boolean = false, oidcConfigured: boolean = true) {
    if (!isAuthenticated) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StatusFlare Admin - Login</title>
    <style>
        ${globalStyles}
        .login-card { background: var(--card-bg); padding: 40px; border-radius: 12px; width: 100%; max-width: 400px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin: auto; margin-top: 10vh; }
        h2 { margin-top: 0; text-align: center; margin-bottom: 24px; }
        input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); box-sizing: border-box; }
        button.login-btn { width: 100%; padding: 12px; border-radius: 6px; border: none; background: var(--accent); color: white; font-weight: 600; cursor: pointer; }
        .error { color: var(--down-color); font-size: 0.875rem; text-align: center; margin-bottom: 10px; }
        .oidc-btn { display: block; width: 100%; padding: 14px; border-radius: 6px; background: var(--accent); color: white; text-align: center; text-decoration: none; font-weight: 700; font-size: 1rem; border: none; transition: filter 0.2s; }
        .oidc-btn:hover { filter: brightness(1.1); }
        .legacy-toggle { display: block; text-align: center; margin-top: 20px; font-size: 0.75rem; color: var(--text-muted); text-decoration: none; }
    </style>
    <script>${themeScript}</script>
</head>
<body>
    <button id="theme-toggle" class="theme-toggle" title="Toggle Theme">🌓</button>
    <div class="login-card">
        <h2>Admin Login</h2>
        ${error ? `<div class="error">${error}</div>` : ''}
        
        <a href="/admin/login/oidc" class="oidc-btn">Login with Authelia</a>

        <details style="margin-top: 24px;">
            <summary class="legacy-toggle" style="cursor: pointer; list-style: none;">Legacy Password Login</summary>
            <form method="POST" action="/admin/login" style="margin-top: 10px;">
                <input type="password" name="password" placeholder="Admin Password" required>
                <button type="submit" class="login-btn">Login</button>
            </form>
        </details>
    </div>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StatusFlare Admin - Manage Services</title>
    <style>
        ${globalStyles}
        body { padding: 40px 20px; }
        .container { width: 100%; max-width: 1200px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        h1 { margin: 0; font-size: 1.5rem; color: var(--accent); }
        .logout { color: var(--text-muted); text-decoration: none; font-size: 0.875rem; border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 6px; }
        .card { background: var(--card-bg); padding: 24px; border-radius: 12px; margin-bottom: 24px; border: 1px solid var(--border-color); overflow: hidden; }
        h2 { margin-top: 0; font-size: 1rem; margin-bottom: 20px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }
        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 8px; font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
        input, textarea, select { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); box-sizing: border-box; font-family: inherit; font-size: 0.9rem; }
        
        .btn { padding: 12px 20px; border-radius: 6px; border: none; font-weight: 700; cursor: pointer; transition: opacity 0.2s; font-family: inherit; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-danger { background: color-mix(in srgb, var(--down-color) 15%, transparent); color: var(--down-color); border: 1px solid var(--down-color); padding: 6px 12px; font-size: 0.75rem; }
        .btn-success { background: color-mix(in srgb, var(--up-color) 15%, transparent); color: var(--up-color); border: 1px solid var(--up-color); padding: 6px 12px; font-size: 0.75rem; }
        
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); padding: 16px 12px; border-bottom: 2px solid var(--border-color); }
        td { padding: 16px 12px; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; }
        .actions { text-align: right; }
        code { background: var(--code-bg); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    </style>
    <script>${themeScript}</script>
</head>
<body>
    <button id="theme-toggle" class="theme-toggle" title="Toggle Theme">🌓</button>
    <div class="container">
        <header>
            <h1>StatusFlare Admin</h1>
            <a href="/admin/logout" class="logout">Logout</a>
        </header>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 24px; margin-bottom: 24px;">
            <!-- Service Management -->
            <div class="card">
                <h2>Add New Service</h2>
                <form method="POST" action="/admin/add">
                    <div class="form-group">
                        <label>Service Name</label>
                        <input type="text" name="name" placeholder="e.g. My API" required>
                    </div>
                    <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label>Base URL</label>
                            <input type="url" name="url" placeholder="https://api.example.com" required>
                        </div>
                        <div>
                            <label>Health Endpoint</label>
                            <input type="text" name="health_endpoint" placeholder="/api/health" required>
                        </div>
                    </div>
                    <div class="form-group" style="display: grid; grid-template-columns: 100px 1fr; gap: 12px;">
                        <div>
                            <label>Method</label>
                            <select name="method">
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="HEAD">HEAD</option>
                            </select>
                        </div>
                        <div>
                            <label>Headers (JSON)</label>
                            <input type="text" name="headers_json" placeholder='{"Authorization": "Bearer ..."}'>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Request Body</label>
                        <textarea name="body" rows="2" placeholder='{"query": "{__typename}"}'></textarea>
                    </div>
                    <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label>Token Provider URL</label>
                            <input type="url" name="token_url" placeholder="https://api.example.com/auth">
                        </div>
                        <div>
                            <label>Token Response Path</label>
                            <input type="text" name="token_response_path" placeholder="token">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Token Provider Body (JSON)</label>
                        <textarea name="token_body" rows="2" placeholder='{"username": "...", "password": "..."}'></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">Add Service</button>
                </form>
            </div>

            <!-- Incident Management -->
            <div class="card">
                <h2>Report Incident</h2>
                <form method="POST" action="/admin/incidents/create">
                    <div class="form-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label>Title</label>
                            <input type="text" name="title" placeholder="Database Issues" required>
                        </div>
                        <div>
                            <label>Affected Service</label>
                            <select name="service_id">
                                <option value="">System Wide</option>
                                ${services.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Message</label>
                        <textarea name="message" rows="2" placeholder="Describe the issue..." required></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="background: var(--down-color)">Post Incident</button>
                </form>
            </div>
        </div>

        <!-- Active Incidents -->
        <div class="card">
            <h2>Active Incidents</h2>
            <div style="overflow-x: auto;">
                <table>
                    <thead><tr><th>Title</th><th>Service</th><th>Started</th><th class="actions">Action</th></tr></thead>
                    <tbody>
                        ${activeIncidents.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-muted);">No active incidents.</td></tr>' : activeIncidents.map(i => `
                            <tr>
                                <td><strong>${escapeHtml(i.title)}</strong></td>
                                <td>${i.service_name || 'System Wide'}</td>
                                <td>${new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</td>
                                <td class="actions">
                                    <form method="POST" action="/admin/incidents/resolve" style="display:inline">
                                        <input type="hidden" name="id" value="${i.id}">
                                        <button type="submit" class="btn btn-success">Resolve</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Existing Services -->
        <div class="card">
            <h2>Existing Services</h2>
            <div style="overflow-x: auto;">
                <table>
                    <thead><tr><th>Name</th><th>URL</th><th>Endpoint</th><th class="actions">Action</th></tr></thead>
                    <tbody>
                        ${services.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-muted);">No services configured.</td></tr>' : services.map(s => `
                            <tr>
                                <td><strong>${escapeHtml(s.name)}</strong></td>
                                <td>${escapeHtml(s.url)}</td>
                                <td><code>${escapeHtml(s.health_endpoint)}</code></td>
                                <td class="actions">
                                    <form method="POST" action="/admin/remove" style="display:inline">
                                        <input type="hidden" name="id" value="${s.id}">
                                        <button type="submit" class="btn btn-danger" onclick="return confirm('Remove this service?')">Remove</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</body>
</html>`;
}

export function renderStatusPage(services: any[], historicalIncidents: any[], manualIncidents: any[]) {
    const overallStatusText = manualIncidents.length > 0 ? 'Active System Incident' : (services.every(s => s.latest.status === 'up') ? 'All Systems Operational' : 'Partial System Outage');
    const overallStatusColor = manualIncidents.length > 0 ? 'var(--down-color)' : (services.every(s => s.latest.status === 'up') ? 'var(--up-color)' : 'var(--warn-color)');
    const lastChecked = new Date().toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StatusFlare - System Health</title>
    <style>
        ${globalStyles}
        .container { width: 100%; padding: 40px 20px; margin: 0; max-width: 100%; }
        header { margin-bottom: 40px; text-align: center; }
        h1 { font-size: 2.5rem; margin-bottom: 10px; letter-spacing: -0.025em; color: var(--accent); }

        .overall-status {
            padding: 20px; border-radius: 12px; background: color-mix(in srgb, ${overallStatusColor} 15%, transparent); border: 1px solid ${overallStatusColor};
            color: ${overallStatusColor}; font-weight: 600; font-size: 1.25rem; display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 30px; animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 color-mix(in srgb, ${overallStatusColor} 40%, transparent); }
            70% { box-shadow: 0 0 0 10px transparent; }
            100% { box-shadow: 0 0 0 0 transparent; }
        }

        .section-title { font-size: 1.25rem; margin: 40px 0 20px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
        .services-grid { display: flex; flex-direction: column; gap: 16px; width: 100%; }

        .service-card {
            background: var(--card-bg); border-radius: 12px; transition: border-color 0.2s ease; border: 1px solid var(--border-color); overflow: hidden;
            display: block; width: 100%;
        }
        .service-card:hover { border-color: var(--accent); }
        .service-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
        .service-info { flex: 1; min-width: 200px; }
        .service-info h3 { margin: 0; font-size: 1.1rem; }
        .service-info p { margin: 4px 0 0; font-size: 0.875rem; color: var(--text-muted); }
        .latency { font-size: 0.75rem; color: var(--text-muted); margin-left: 8px; }

        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
        .status-up { background: color-mix(in srgb, var(--up-color) 20%, transparent); color: var(--up-color); }
        .status-down { background: color-mix(in srgb, var(--down-color) 20%, transparent); color: var(--down-color); }

        .history-timeline { display: flex; gap: 4px; padding: 0 20px 20px; overflow-x: auto; scrollbar-width: none; }
        .history-timeline::-webkit-scrollbar { display: none; }
        .history-item { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
        .history-item svg { width: 14px; height: 14px; opacity: 0.6; transition: transform 0.2s, opacity 0.2s; }
        .history-item:hover svg { transform: scale(1.3); opacity: 1; }

        footer { margin-top: 50px; text-align: center; color: var(--text-muted); font-size: 0.875rem; padding-bottom: 40px; }
    </style>
    <script>${themeScript}</script>
    <meta http-equiv="refresh" content="60">
</head>
<body>
    <button id="theme-toggle" class="theme-toggle" title="Toggle Theme">🌓</button>
    <div class="container">
        <header>
            <h1>StatusFlare</h1>
            <p style="color: var(--text-muted)">Real-time system health monitoring</p>
        </header>

        <div class="overall-status">
            ${renderSvgDot(services.every(s => s.latest.status === 'up') ? 'up' : 'down', 24)}
            ${overallStatusText}
        </div>

        ${manualIncidents.length > 0 ? `
            <div class="section-title" style="color: var(--down-color)">Active Incidents</div>
            <div class="incidents-list" style="border: 1px solid var(--down-color); border-radius: 12px; overflow: hidden; margin-bottom: 40px;">
                ${manualIncidents.map(i => `
                    <div class="incident-item" style="padding: 20px; border-bottom: 1px solid var(--border-color); background: color-mix(in srgb, var(--down-color) 5%, transparent)">
                        <h4 style="color: var(--down-color); margin: 0;">${escapeHtml(i.title)} ${i.service_name ? `(${escapeHtml(i.service_name)})` : ''}</h4>
                        <p style="color: var(--text-main); margin: 8px 0;">${escapeHtml(i.message)}</p>
                        <div style="font-size: 0.75rem; color: var(--text-muted)">Started: ${new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="section-title">Current Status</div>
        <div class="services-grid">
            ${services.map(s => {
                const latest = s.latest;
                const historyTimeline = [...s.history].reverse().map(h => 
                    `<div class="history-item" title="${new Date(h.timestamp + (h.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()} - ${h.latency_ms}ms">
                        ${renderSvgDot(h.status, 14)}
                    </div>`
                ).join('');

                return `
                <div class="service-card" onclick="window.location.href='/status/${encodeURIComponent(s.name)}'">
                    <div class="service-header">
                        <div class="service-info">
                            <h3>${escapeHtml(s.name)} <span class="latency">${latest.latency_ms ? latest.latency_ms + 'ms' : ''}</span></h3>
                            <p>${escapeHtml(s.url)}</p>
                        </div>
                        <div class="status-badge ${latest.status === 'up' ? 'status-up' : 'status-down'}">
                            ${renderSvgDot(latest.status, 12)}
                            ${latest.status?.toUpperCase()}
                        </div>
                    </div>
                    <div class="history-timeline">
                        ${historyTimeline}
                    </div>
                    <div style="padding: 0 20px 15px; text-align: right;">
                        <a href="/status/${encodeURIComponent(s.name)}" style="color: var(--accent); font-size: 0.75rem; text-decoration: none; font-weight: 700;">VIEW DETAILS →</a>
                    </div>
                </div>`;
            }).join('')}
        </div>

        <div class="section-title">Historical Outages</div>
        <div class="incidents-list" style="border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden;">
            ${historicalIncidents.length === 0 ? `
                <div class="incident-item" style="padding: 20px; color: var(--up-color); text-align: center;">No recent outages reported.</div>
            ` : historicalIncidents.map(incident => `
                <div class="incident-item" style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h4 style="margin: 0; color: var(--down-color)">Outage: ${escapeHtml(incident.name)}</h4>
                        <span style="font-size: 0.8rem; color: var(--text-muted)">HTTP ${incident.status_code || 'Error'}: ${escapeHtml(incident.response_snippet?.slice(0, 50))}...</span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-muted)">${new Date(incident.timestamp + (incident.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}</div>
                </div>
            `).join('')}
        </div>

        <footer>
            <div style="margin-top: 10px; font-style: italic;">Last checked: ${lastChecked}</div>
            <p>Powered by Cloudflare Workers & D1</p>
        </footer>
    </div>
</body>
</html>`;
}

export function renderServiceDetailPage(service: any, history: any[], incidents: any[]) {
    const uptime = history.length > 0 
        ? ((history.filter(h => h.status === 'up').length / history.length) * 100).toFixed(2)
        : '0.00';
    
    const latest = history[0] || { status: 'unknown', timestamp: new Date().toISOString() };
    const lastChecked = new Date(latest.timestamp + (latest.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(service.name)} - Detailed Status</title>
    <style>
        ${globalStyles}
        .container { width: 100%; padding: 40px 20px; max-width: 1200px; margin: auto; }
        .back-link { display: inline-block; margin-bottom: 24px; color: var(--text-muted); text-decoration: none; font-size: 0.875rem; }
        .back-link:hover { color: var(--accent); }
        
        .header-card { background: var(--card-bg); border-radius: 12px; padding: 32px; border: 1px solid var(--border-color); margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 24px; }
        .header-main h1 { margin: 0; font-size: 2rem; color: var(--text-main); }
        .header-main p { margin: 8px 0 0; color: var(--text-muted); }
        
        .status-badge { padding: 12px 24px; border-radius: 12px; font-size: 1rem; font-weight: 700; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
        .status-up { background: color-mix(in srgb, var(--up-color) 20%, transparent); color: var(--up-color); }
        .status-down { background: color-mix(in srgb, var(--down-color) 20%, transparent); color: var(--down-color); }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 40px; }
        .stat-card { background: var(--card-bg); padding: 24px; border-radius: 12px; border: 1px solid var(--border-color); }
        .stat-label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; }
        .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }

        .health-details-card { background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color); padding: 24px; margin-bottom: 40px; }
        .health-details-card h2 { margin: 0 0 20px; font-size: 1.25rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; }
        
        .parsed-content { font-size: 0.9rem; }
        .parsed-item { margin-bottom: 8px; display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid color-mix(in srgb, var(--border-color) 50%, transparent); padding-bottom: 8px; }
        .parsed-item:last-child { border-bottom: none; }
        .parsed-key { color: var(--text-muted); font-weight: 700; white-space: nowrap; min-width: 150px; }
        .parsed-value { color: var(--text-main); word-break: break-all; flex: 1; }
        
        .parsed-list { padding-left: 12px; border-left: 1px solid var(--border-color); margin-top: 4px; display: flex; flex-direction: column; gap: 8px; }
        .parsed-object { padding-left: 12px; border-left: 1px solid var(--border-color); margin-top: 4px; display: flex; flex-direction: column; gap: 4px; width: 100%; }

        .parsed-table { width: 100%; border-collapse: collapse; background: var(--code-bg); border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); font-size: 0.8rem; }
        .parsed-table th { text-align: left; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent); padding: 10px; border-bottom: 1px solid var(--border-color); text-transform: uppercase; font-size: 0.7rem; }
        .parsed-table td { padding: 10px; border-bottom: 1px solid var(--border-color); color: var(--text-main); }
        .parsed-table tr:last-child td { border-bottom: none; }

        .raw-snippet { background: var(--code-bg); padding: 16px; border-radius: 8px; font-size: 0.8rem; color: var(--text-muted); margin: 0; white-space: pre-wrap; border: 1px solid var(--border-color); }

        .log-table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); }
        .log-table th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); padding: 16px; border-bottom: 2px solid var(--border-color); }
        .log-table td { padding: 16px; border-bottom: 1px solid var(--border-color); font-size: 0.875rem; }
        
        pre { background: var(--code-bg); padding: 12px; border-radius: 6px; font-size: 0.75rem; border: 1px solid var(--border-color); margin: 0; white-space: pre-wrap; word-break: break-all; color: var(--text-muted); }
    </style>
    <script>${themeScript}</script>
</head>
<body>
    <button id="theme-toggle" class="theme-toggle" title="Toggle Theme">🌓</button>
    <div class="container">
        <a href="/" class="back-link">← BACK TO DASHBOARD</a>
        
        <div class="header-card">
            <div class="header-main">
                <h1>${escapeHtml(service.name)}</h1>
                <p>${escapeHtml(service.url)}${service.health_endpoint}</p>
            </div>
            <div class="status-badge ${latest.status === 'up' ? 'status-up' : 'status-down'}">
                ${renderSvgDot(latest.status, 20)}
                ${latest.status?.toUpperCase()}
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Uptime (Recent)</div>
                <div class="stat-value">${uptime}%</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg. Latency</div>
                <div class="stat-value">${history.length > 0 ? (history.reduce((a, b) => a + b.latency_ms, 0) / history.length).toFixed(0) : 0}ms</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Last Checked</div>
                <div class="stat-value" style="font-size: 1rem;">${lastChecked}</div>
            </div>
        </div>

        <div class="health-details-card">
            <h2>Latest Health Details</h2>
            <div style="margin-bottom: 12px; font-weight: 700; color: var(--accent);">HTTP ${latest.status_code || 'Error'}</div>
            ${renderParsedData(latest.response_snippet)}
        </div>

        ${incidents.length > 0 ? `
            <div class="section-title" style="color: var(--down-color); font-size: 1.25rem; margin-bottom: 20px; font-weight: 700; text-transform: uppercase;">Active Incidents</div>
            <div class="incidents-list" style="margin-bottom: 40px; border: 1px solid var(--down-color); border-radius: 12px; overflow: hidden;">
                ${incidents.map(i => `
                    <div class="incident-item" style="padding: 20px; background: color-mix(in srgb, var(--down-color) 5%, transparent);">
                        <h4 style="margin: 0; color: var(--down-color)">${escapeHtml(i.title)}</h4>
                        <p style="margin: 8px 0; color: var(--text-main)">${escapeHtml(i.message)}</p>
                        <div style="font-size: 0.75rem; color: var(--text-muted)">Started: ${new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="section-title" style="font-size: 1.25rem; margin-bottom: 20px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Recent Health Checks</div>
        <table class="log-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(h => `
                    <tr>
                        <td style="white-space: nowrap;">${new Date(h.timestamp + (h.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}</td>
                        <td><span style="font-weight: 700; color: ${h.status === 'up' ? 'var(--up-color)' : 'var(--down-color)'}">${h.status.toUpperCase()}</span></td>
                        <td>${h.latency_ms}ms</td>
                        <td>
                            <div style="margin-bottom: 4px; font-size: 0.75rem;"><strong>HTTP ${h.status_code || 'Error'}</strong></div>
                            <pre>${escapeHtml(h.response_snippet?.slice(0, 150))}</pre>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <footer style="margin-top: 60px; text-align: center; color: var(--text-muted); font-size: 0.875rem; padding-bottom: 40px;">
            <p>Powered by Cloudflare Workers & D1</p>
        </footer>
    </div>
</body>
</html>`;
}
