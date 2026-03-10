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

export function renderAdminPage(services: any[], activeIncidents: any[], error?: string, isAuthenticated: boolean = false) {
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
        h2 { margin-top: 0; text-align: center; }
        input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); box-sizing: border-box; }
        button.login-btn { width: 100%; padding: 12px; border-radius: 6px; border: none; background: var(--accent); color: white; font-weight: 600; cursor: pointer; }
        .error { color: var(--down-color); font-size: 0.875rem; text-align: center; margin-bottom: 10px; }
    </style>
    <script>${themeScript}</script>
</head>
<body>
    <button id="theme-toggle" class="theme-toggle" title="Toggle Theme">🌓</button>
    <div class="login-card">
        <h2>Admin Login</h2>
        ${error ? `<div class="error">${error}</div>` : ''}
        <form method="POST" action="/admin/login">
            <input type="password" name="password" placeholder="Admin Password" required>
            <button type="submit" class="login-btn">Login</button>
        </form>
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
        body { padding: 40px 20px; display: flex; justify-content: center; }
        .container { width: 100%; max-width: 100%; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        h1 { margin: 0; font-size: 1.5rem; }
        .logout { color: var(--text-muted); text-decoration: none; font-size: 0.875rem; }
        .card { background: var(--card-bg); padding: 24px; border-radius: 12px; margin-bottom: 24px; border: 1px solid var(--border-color); width: 100%; overflow-x: auto; }
        h2 { margin-top: 0; font-size: 1.1rem; margin-bottom: 20px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 8px; font-size: 0.875rem; color: var(--text-muted); }
        input, textarea, select { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-main); box-sizing: border-box; font-family: inherit; }
        
        .btn { padding: 10px 20px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-danger { background: var(--down-color)20; color: var(--down-color); padding: 6px 12px; font-size: 0.75rem; }
        .btn-success { background: var(--up-color)20; color: var(--up-color); padding: 6px 12px; font-size: 0.75rem; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); padding: 12px 8px; border-bottom: 1px solid var(--border-color); }
        td { padding: 12px 8px; border-bottom: 1px solid var(--border-color); font-size: 0.875rem; }
        .actions { text-align: right; }
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

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
            <!-- Service Management -->
            <div class="card">
                <h2>Add New Service</h2>
                <form method="POST" action="/admin/add">
                    <div class="form-group">
                        <label>Service Name</label>
                        <input type="text" name="name" placeholder="e.g. My API" required>
                    </div>
                    <div class="form-group">
                        <label>Base URL</label>
                        <input type="url" name="url" placeholder="https://api.example.com" required>
                    </div>
                    <div class="form-group">
                        <label>Health Endpoint</label>
                        <input type="text" name="health_endpoint" placeholder="/api/health" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Add Service</button>
                </form>
            </div>

            <!-- Incident Management -->
            <div class="card">
                <h2>Report Incident</h2>
                <form method="POST" action="/admin/incidents/create">
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" name="title" placeholder="e.g. Database Connectivity Issues" required>
                    </div>
                    <div class="form-group">
                        <label>Affected Service (Optional)</label>
                        <select name="service_id">
                            <option value="">System Wide</option>
                            ${services.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Message</label>
                        <textarea name="message" rows="3" placeholder="Describe the issue..." required></textarea>
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
                        ${activeIncidents.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 20px;">No active incidents.</td></tr>' : activeIncidents.map(i => `
                            <tr>
                                <td><strong>${i.title}</strong></td>
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
                        ${services.map(s => `
                            <tr>
                                <td><strong>${s.name}</strong></td>
                                <td>${s.url}</td>
                                <td><code>${s.health_endpoint}</code></td>
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
    const overallStatus = manualIncidents.length > 0 ? 'outage' : (services.every(s => s.latest.status === 'up') ? 'operational' : 'outage');
    const overallStatusText = manualIncidents.length > 0 ? 'Active System Incident' : (services.every(s => s.latest.status === 'up') ? 'All Systems Operational' : 'Partial System Outage');
    const overallStatusColor = overallStatus === 'operational' ? 'var(--up-color)' : (manualIncidents.length > 0 ? 'var(--down-color)' : 'var(--warn-color)');
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
        
        [data-theme='dark'] .overall-status {
             background: color-mix(in srgb, ${overallStatusColor} 10%, transparent);
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 color-mix(in srgb, ${overallStatusColor} 40%, transparent); }
            70% { box-shadow: 0 0 0 10px transparent; }
            100% { box-shadow: 0 0 0 0 transparent; }
        }

        .section-title { font-size: 1.25rem; margin: 40px 0 20px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
        .services-grid { display: flex; flex-direction: column; gap: 16px; width: 100%; }

        .service-card {
            background: var(--card-bg); border-radius: 12px; transition: transform 0.2s ease, border-color 0.2s ease; border: 1px solid var(--border-color); cursor: pointer; overflow: hidden;
            display: block; width: 100%; max-width: 100%;
        }
        .service-card:hover { border-color: var(--accent); }
        .service-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
        .service-info { flex: 1; min-width: 200px; }
        .service-info h3 { margin: 0; font-size: 1.1rem; }
        .service-info p { margin: 4px 0 0; font-size: 0.875rem; color: var(--text-muted); word-break: break-all; }
        .latency { font-size: 0.75rem; color: var(--text-muted); margin-left: 8px; }

        .status-badge { padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
        .status-up { background: color-mix(in srgb, var(--up-color) 20%, transparent); color: var(--up-color); }
        .status-down { background: color-mix(in srgb, var(--down-color) 20%, transparent); color: var(--down-color); }

        .history-timeline { display: flex; gap: 4px; padding: 0 20px 20px; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
        .history-timeline::-webkit-scrollbar { display: none; }
        .history-item { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; }
        .history-item svg { width: 14px; height: 14px; opacity: 0.6; transition: transform 0.2s, opacity 0.2s; }
        .history-item:hover svg { transform: scale(1.3); opacity: 1; }

        .details-panel { 
            display: none; padding: 20px; background: rgba(0,0,0,0.05); border-top: 1px solid var(--border-color); font-size: 0.875rem; width: 100%; overflow-x: auto;
        }
        [data-theme='dark'] .details-panel { background: rgba(0,0,0,0.2); }
        .service-card.expanded .details-panel { display: block; }
        .details-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 10px; }
        .detail-item { color: var(--text-muted); }
        .detail-item strong { color: var(--text-main); display: block; }

        .incidents-list { background: var(--card-bg); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color); width: 100%; }
        .incident-item { padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; }
        .incident-item:last-child { border-bottom: none; }
        .incident-details { flex: 1; min-width: 200px; }
        .incident-details h4 { margin: 0; color: var(--down-color); font-size: 1rem; }
        .incident-details span { font-size: 0.875rem; color: var(--text-muted); word-break: break-all; }
        .incident-time { font-size: 0.875rem; color: var(--text-muted); white-space: nowrap; }

        footer { margin-top: 50px; text-align: center; color: var(--text-muted); font-size: 0.875rem; padding-bottom: 40px; }
        .refresh-info { margin-top: 10px; font-style: italic; }
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
            ${renderSvgDot(overallStatus === 'operational' ? 'up' : 'down', 24)}
            ${overallStatusText}
        </div>

        ${manualIncidents.length > 0 ? `
            <div class="section-title" style="color: var(--down-color)">Active Incidents</div>
            <div class="incidents-list" style="border-color: var(--down-color); margin-bottom: 40px;">
                ${manualIncidents.map(i => `
                    <div class="incident-item" style="background: color-mix(in srgb, var(--down-color) 5%, transparent)">
                        <div class="incident-details">
                            <h4 style="color: var(--down-color)">${escapeHtml(i.title)} ${i.service_name ? `(${escapeHtml(i.service_name)})` : ''}</h4>
                            <p style="color: var(--text-main); margin: 8px 0;">${escapeHtml(i.message)}</p>
                        </div>
                        <div class="incident-time">Started: ${new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</div>
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
                <div class="service-card" onclick="this.classList.toggle('expanded')">
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
                    <div class="details-panel">
                        <div class="details-grid">
                            <div class="detail-item"><strong>Last Status Code</strong> ${latest.status_code || 'N/A'}</div>
                            <div class="detail-item"><strong>Last Checked</strong> ${new Date(latest.timestamp + (latest.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleTimeString()}</div>
                        </div>
                        <div class="detail-item" style="margin-top: 12px;">
                            <strong>Last Response Snippet</strong>
                            <code style="display:block; background: var(--code-bg); color: var(--text-muted); padding:8px; border-radius:4px; margin-top:4px; font-size:0.75rem; word-break:break-all; border: 1px solid var(--border-color);">
                                ${latest.response_snippet ? escapeHtml(latest.response_snippet.slice(0, 150)) : 'No response content'}
                            </code>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>

        <div class="section-title">Historical Outages</div>
        <div class="incidents-list">
            ${historicalIncidents.length === 0 ? `
                <div class="incident-item"><div class="incident-details"><span style="color: var(--up-color)">No recent outages reported.</span></div></div>
            ` : historicalIncidents.map(incident => `
                <div class="incident-item">
                    <div class="incident-details">
                        <h4>Outage: ${escapeHtml(incident.name)}</h4>
                        <span>HTTP ${incident.status_code || 'Error'}: ${incident.response_snippet ? escapeHtml(incident.response_snippet.slice(0, 50)) + '...' : 'No response'}</span>
                    </div>
                    <div class="incident-time">
                        ${new Date(incident.timestamp + (incident.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}
                    </div>
                </div>
            `).join('')}
        </div>

        <footer>
            <div class="refresh-info">Last checked: ${lastChecked} (Auto-refreshes every 60s)</div>
            <p>Total Services Monitored: ${services.length}</p>
            <p>Powered by Cloudflare Workers & D1</p>
        </footer>
    </div>
</body>
</html>`;
}
