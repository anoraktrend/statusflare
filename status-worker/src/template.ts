export function renderAdminPage(services: any[], error?: string, isAuthenticated: boolean = false) {
    const lastChecked = new Date().toLocaleString();

    if (!isAuthenticated) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StatusFlare Admin - Login</title>
    <style>
        :root { --bg-color: #0f172a; --card-bg: #1e293b; --text-main: #f8fafc; --accent: #3b82f6; }
        body { font-family: 'Inter', sans-serif; background: var(--bg-color); color: var(--text-main); display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .login-card { background: var(--card-bg); padding: 40px; border-radius: 12px; width: 100%; max-width: 400px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        h2 { margin-top: 0; text-align: center; }
        input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; }
        button { width: 100%; padding: 12px; border-radius: 6px; border: none; background: var(--accent); color: white; font-weight: 600; cursor: pointer; }
        .error { color: #ef4444; font-size: 0.875rem; text-align: center; margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="login-card">
        <h2>Admin Login</h2>
        ${error ? `<div class="error">${error}</div>` : ''}
        <form method="POST" action="/admin/login">
            <input type="password" name="password" placeholder="Admin Password" required>
            <button type="submit">Login</button>
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
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #3b82f6;
            --danger: #ef4444;
        }

        body { font-family: 'Inter', sans-serif; background: var(--bg-color); color: var(--text-main); margin: 0; display: flex; justify-content: center; padding: 40px 20px; }
        .container { width: 100%; max-width: 800px; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        h1 { margin: 0; font-size: 1.5rem; }
        .logout { color: var(--text-muted); text-decoration: none; font-size: 0.875rem; }

        .card { background: var(--card-bg); padding: 24px; border-radius: 12px; margin-bottom: 24px; }
        h2 { margin-top: 0; font-size: 1.1rem; margin-bottom: 20px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 8px; font-size: 0.875rem; color: var(--text-muted); }
        input { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: white; box-sizing: border-box; }
        
        .btn { padding: 10px 20px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-danger { background: var(--danger)20; color: var(--danger); padding: 6px 12px; font-size: 0.75rem; }
        .btn:hover { opacity: 0.8; }

        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); padding: 12px 8px; border-bottom: 1px solid #334155; }
        td { padding: 12px 8px; border-bottom: 1px solid #ffffff0d; font-size: 0.875rem; }
        .actions { text-align: right; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>StatusFlare Admin</h1>
            <a href="/admin/logout" class="logout">Logout</a>
        </header>

        <div class="card">
            <h2>Add New Service</h2>
            <form method="POST" action="/admin/add">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="form-group">
                        <label>Service Name</label>
                        <input type="text" name="name" placeholder="e.g. My API" required>
                    </div>
                    <div class="form-group">
                        <label>Base URL</label>
                        <input type="url" name="url" placeholder="https://api.example.com" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>Health Endpoint</label>
                    <input type="text" name="health_endpoint" placeholder="/api/health" required>
                </div>
                <button type="submit" class="btn btn-primary">Add Service</button>
            </form>
        </div>

        <div class="card">
            <h2>Existing Services</h2>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>URL</th>
                        <th>Endpoint</th>
                        <th class="actions">Action</th>
                    </tr>
                </thead>
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

        <p style="text-align: center; color: var(--text-muted); font-size: 0.75rem;">
            Changes take effect immediately on the next health check cycle.
        </p>
    </div>
</body>
</html>`;
}

export function renderStatusPage(servicesStatus: any[], incidents: any[]) {
    const overallStatus = servicesStatus.every(s => s.status === 'up') ? 'All Systems Operational' : 'Partial Outage';
    const statusColor = servicesStatus.every(s => s.status === 'up') ? '#2ecc71' : '#f1c40f';
    const lastChecked = new Date().toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StatusFlare - System Health</title>
    <style>
        :root {
            --bg-color: #0f172a;
            --card-bg: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --up-color: #2ecc71;
            --down-color: #ef4444;
            --warn-color: #f1c40f;
            --accent: #3b82f6;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            margin: 0;
            display: flex;
            justify-content: center;
            min-height: 100vh;
        }

        .container {
            width: 100%;
            max-width: 800px;
            padding: 40px 20px;
        }

        header {
            margin-bottom: 40px;
            text-align: center;
        }

        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            letter-spacing: -0.025em;
        }

        .overall-status {
            padding: 20px;
            border-radius: 12px;
            background: ${statusColor}20;
            border: 1px solid ${statusColor};
            color: ${statusColor};
            font-weight: 600;
            font-size: 1.25rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 30px;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 ${statusColor}40; }
            70% { box-shadow: 0 0 0 10px ${statusColor}00; }
            100% { box-shadow: 0 0 0 0 ${statusColor}00; }
        }

        .section-title {
            font-size: 1.25rem;
            margin: 40px 0 20px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            font-weight: 700;
        }

        .services-grid {
            display: grid;
            gap: 16px;
        }

        .service-card {
            background: var(--card-bg);
            padding: 20px;
            border-radius: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: transform 0.2s ease;
            border: 1px solid transparent;
        }

        .service-card:hover {
            transform: translateY(-2px);
            border-color: var(--accent);
        }

        .service-info h3 {
            margin: 0;
            font-size: 1.1rem;
        }

        .service-info p {
            margin: 4px 0 0;
            font-size: 0.875rem;
            color: var(--text-muted);
        }

        .latency {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-left: 8px;
        }

        .status-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
        }

        .status-up { background: var(--up-color)20; color: var(--up-color); }
        .status-down { background: var(--down-color)20; color: var(--down-color); }

        .incidents-list {
            background: var(--card-bg);
            border-radius: 12px;
            overflow: hidden;
        }

        .incident-item {
            padding: 16px 20px;
            border-bottom: 1px solid #ffffff0d;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .incident-item:last-child {
            border-bottom: none;
        }

        .incident-details h4 {
            margin: 0;
            color: var(--down-color);
            font-size: 1rem;
        }

        .incident-details span {
            font-size: 0.875rem;
            color: var(--text-muted);
        }

        .incident-time {
            font-size: 0.875rem;
            color: var(--text-muted);
            white-space: nowrap;
        }

        footer {
            margin-top: 50px;
            text-align: center;
            color: var(--text-muted);
            font-size: 0.875rem;
        }

        .refresh-info {
            margin-top: 10px;
            font-style: italic;
        }
    </style>
    <meta http-equiv="refresh" content="60">
</head>
<body>
    <div class="container">
        <header>
            <h1>StatusFlare</h1>
            <p style="color: var(--text-muted)">Real-time system health monitoring</p>
        </header>

        <div class="overall-status">
            <span style="width: 12px; height: 12px; border-radius: 50%; background: ${statusColor}"></span>
            ${overallStatus}
        </div>

        <div class="section-title">Current Status</div>
        <div class="services-grid">
            ${servicesStatus.map(service => `
                <div class="service-card">
                    <div class="service-info">
                        <h3>${service.name} <span class="latency">${service.latency_ms ? service.latency_ms + 'ms' : ''}</span></h3>
                        <p>${service.url}</p>
                    </div>
                    <div class="status-badge ${service.status === 'up' ? 'status-up' : 'status-down'}">
                        ${service.status?.toUpperCase() || 'UNKNOWN'}
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="section-title">Incident History</div>
        <div class="incidents-list">
            ${incidents.length === 0 ? `
                <div class="incident-item">
                    <div class="incident-details">
                        <span style="color: var(--up-color)">No recent incidents reported.</span>
                    </div>
                </div>
            ` : incidents.map(incident => `
                <div class="incident-item">
                    <div class="incident-details">
                        <h4>Outage: ${incident.name}</h4>
                        <span>HTTP ${incident.status_code || 'Error'}: ${incident.response_snippet ? incident.response_snippet.slice(0, 50) + '...' : 'No response'}</span>
                    </div>
                    <div class="incident-time">
                        ${new Date(incident.timestamp + 'Z').toLocaleString()}
                    </div>
                </div>
            `).join('')}
        </div>

        <footer>
            <div class="refresh-info">Last checked: ${lastChecked} (Auto-refreshes every 60s)</div>
            <p>Powered by Cloudflare Workers & D1</p>
        </footer>
    </div>
</body>
</html>`;
}
