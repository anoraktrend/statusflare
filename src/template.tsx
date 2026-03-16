import { render } from 'preact-render-to-string';

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

function SvgDot({ status, size = 16 }: { status: string; size?: number }) {
  const colorClass = status === 'up' ? 'text-ctp-green' : (status === 'down' ? 'text-ctp-red' : 'text-ctp-yellow');
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${colorClass} inline-block align-middle shrink-0`}>
      <ellipse cx="256" cy="255.99998" rx="250.06845" ry="250.06844" fill="black" stroke="currentColor" stroke-width="11.8631" />
      <ellipse cx="256" cy="255.99998" rx="204.00301" ry="204.00299" fill="black" stroke="currentColor" stroke-width="41.994" />
      <ellipse cx="256" cy="256" rx="158.24641" ry="158.24643" fill="currentColor" stroke="currentColor" stroke-width="7.50716" />
    </svg>
  );
}

function ParsedData({ snippet }: { snippet: string }) {
  try {
    let data = JSON.parse(snippet);
    if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1 && data.data) {
      data = data.data;
    }

    const renderValue = (val: any): any => {
      if (val === null) return <span className="text-ctp-overlay0">null</span>;

      if (Array.isArray(val)) {
        if (val.length === 0) return '[]';

        const first = val[0];
        if (first && typeof first === 'object' && !Array.isArray(first)) {
          const keys = Object.keys(first);
          const isUniform = val.every(item =>
            item && typeof item === 'object' && !Array.isArray(item) &&
            Object.keys(item).length === keys.length &&
            keys.every(k => k in item)
          );

          if (isUniform) {
            return (
              <div className="overflow-x-auto mt-2 w-full">
                <table className="w-full border-collapse bg-ctp-crust rounded-lg overflow-hidden border border-ctp-surface0 text-xs">
                  <thead>
                    <tr className="bg-ctp-mauve/10 text-ctp-mauve">
                      {keys.map(k => (
                        <th className="text-left p-2.5 border-b border-ctp-surface0 uppercase text-[0.7rem]">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {val.map(item => (
                      <tr>
                        {keys.map(k => (
                          <td className="p-2.5 border-b border-ctp-surface0 text-ctp-text last:border-b-0">{renderValue(item[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }

        return (
          <div className="pl-3 border-l border-ctp-surface0 mt-1 flex flex-col gap-2">
            {val.map(item => (
              <div className="parsed-list-item">{renderValue(item)}</div>
            ))}
          </div>
        );
      }

      if (typeof val === 'object') {
        return (
          <div className="pl-3 border-l border-ctp-surface0 mt-1 flex flex-col gap-1 w-full">
            {Object.entries(val).map(([k, v]) => {
              const isComplex = v !== null && typeof v === 'object';
              const countSuffix = Array.isArray(v) ? ` (${v.length})` : '';
              return (
                <div className={`mb-2 flex gap-3 items-start border-b border-ctp-surface0/50 pb-2 last:border-b-0 ${isComplex ? 'block' : ''}`}>
                  <span className="text-ctp-overlay0 font-bold whitespace-nowrap min-w-[150px]">{k}{countSuffix && <small className="text-ctp-overlay0">{countSuffix}</small>}:</span>
                  <span className="text-ctp-text break-all flex-1">{renderValue(v)}</span>
                </div>
              );
            })}
          </div>
        );
      }

      const s = String(val);
      const lower = s.toLowerCase();
      const isHealthWord = ['pass', 'up', 'ok', 'healthy', 'fail', 'down', 'error'].includes(lower);
      const colorClass = (lower === 'pass' || lower === 'up' || lower === 'ok' || lower === 'healthy') ? 'text-ctp-green' : 'text-ctp-red';

      if (isHealthWord) {
        return <span className={`${colorClass} font-bold uppercase text-[0.75rem]`}>{s}</span>;
      }
      return s;
    };

    return <div className="text-[0.9rem]">{renderValue(data)}</div>;
  } catch {
    return <pre className="bg-ctp-crust p-4 rounded-lg text-xs text-ctp-overlay0 m-0 whitespace-pre-wrap border border-ctp-surface0">{snippet.slice(0, 1000)}</pre>;
  }
}

function Layout({ title, children }: { title: string; children: any }) {
  return (
    <html lang="en" className="mocha">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="stylesheet" href="/tailwind.css" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-ctp-base text-ctp-text font-mono min-h-screen w-full">
        <button id="theme-toggle" className="fixed top-5 right-5 bg-ctp-mantle border border-ctp-surface0 text-ctp-text w-10 h-10 rounded-full cursor-pointer flex items-center justify-center shadow-lg z-50 hover:bg-ctp-surface0 transition-colors" title="Toggle Theme">🌓</button>
        {children}
      </body>
    </html>
  );
}

export function renderAdminPage(services: any[], activeIncidents: any[], error?: string, isAuthenticated: boolean = false, oidcConfigured: boolean = true) {
  if (!isAuthenticated) {
    return '<!DOCTYPE html>' + render(
      <Layout title="StatusFlare Admin - Login">
        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="bg-ctp-mantle p-10 rounded-xl w-full max-w-md shadow-xl border border-ctp-surface0">
            <h2 className="mt-0 text-center mb-6 text-2xl font-bold">Admin Login</h2>
            {error && <div className="text-ctp-red text-sm text-center mb-4">{error}</div>}
            
            <a href="/admin/login/oidc" className="block w-full py-3.5 px-4 rounded-lg bg-ctp-mauve text-ctp-crust text-center no-underline font-bold text-lg border-none transition-transform hover:scale-[1.02] active:scale-[0.98]">Login with Authelia</a>

            <details className="mt-6">
              <summary className="block text-center mt-5 text-[0.75rem] text-ctp-overlay0 cursor-pointer list-none hover:text-ctp-subtext0 transition-colors">Legacy Password Login</summary>
              <form method="POST" action="/admin/login" className="mt-4">
                <input type="password" name="password" placeholder="Admin Password" className="w-full p-3 my-2.5 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text box-border focus:ring-2 focus:ring-ctp-mauve focus:outline-none" required />
                <button type="submit" className="w-full p-3 rounded-lg border-none bg-ctp-mauve text-ctp-crust font-bold cursor-pointer hover:opacity-90 transition-opacity">Login</button>
              </form>
            </details>
          </div>
        </div>
      </Layout>
    );
  }

  return '<!DOCTYPE html>' + render(
    <Layout title="StatusFlare Admin - Manage Services">
      <div className="p-5 sm:p-10 max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <h1 className="m-0 text-2xl font-bold text-ctp-mauve">StatusFlare Admin</h1>
          <a href="/admin/logout" className="text-ctp-overlay0 no-underline text-sm border border-ctp-surface0 px-3 py-1.5 rounded-lg hover:bg-ctp-surface0 transition-colors">Logout</a>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg">
            <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold">Add New Service</h2>
            <form method="POST" action="/admin/add" className="space-y-4">
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Service Name</label>
                <input type="text" name="name" placeholder="e.g. My API" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Base URL</label>
                  <input type="url" name="url" placeholder="https://api.example.com" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" required />
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Health Endpoint</label>
                  <input type="text" name="health_endpoint" placeholder="/api/health" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" required />
                </div>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Method</label>
                  <select name="method" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Headers (JSON)</label>
                  <input type="text" name="headers_json" placeholder='{"Authorization": "Bearer ..."}' className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Request Body</label>
                <textarea name="body" rows={2} placeholder='{"query": "{__typename}"}' className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none"></textarea>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Token Provider URL</label>
                  <input type="url" name="token_url" placeholder="https://api.example.com/auth" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" />
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Token Response Path</label>
                  <input type="text" name="token_response_path" placeholder="token" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Token Provider Body (JSON)</label>
                <textarea name="token_body" rows={2} placeholder='{"username": "...", "password": "..."}' className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none"></textarea>
              </div>
              <button type="submit" className="w-full py-3 px-5 rounded-lg border-none bg-ctp-mauve text-ctp-crust font-bold cursor-pointer hover:opacity-90 transition-opacity">Add Service</button>
            </form>
          </div>

          <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg">
            <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold">Report Incident</h2>
            <form method="POST" action="/admin/incidents/create" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Title</label>
                  <input type="text" name="title" placeholder="Database Issues" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" required />
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Affected Service</label>
                  <select name="service_id" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none">
                    <option value="">System Wide</option>
                    {services.map(s => <option value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold">Message</label>
                <textarea name="message" rows={2} placeholder="Describe the issue..." className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none" required></textarea>
              </div>
              <button type="submit" className="w-full py-3 px-5 rounded-lg border-none bg-ctp-red text-ctp-crust font-bold cursor-pointer hover:opacity-90 transition-opacity">Post Incident</button>
            </form>
          </div>
        </div>

        <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg mb-6 overflow-hidden">
          <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold">Active Incidents</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ctp-surface0">
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Title</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Service</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Started</th>
                  <th className="text-right p-4 text-[0.7rem] uppercase text-ctp-overlay0">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeIncidents.length === 0 ? (
                  <tr><td colspan={4} className="text-center p-10 text-ctp-overlay0">No active incidents.</td></tr>
                ) : activeIncidents.map(i => (
                  <tr className="border-b border-ctp-surface0 last:border-b-0">
                    <td className="p-4 text-sm font-bold">{i.title}</td>
                    <td className="p-4 text-sm">{i.service_name || 'System Wide'}</td>
                    <td className="p-4 text-sm">{new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <form method="POST" action="/admin/incidents/resolve" className="inline">
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-ctp-green/20 text-ctp-green border border-ctp-green text-xs font-bold hover:bg-ctp-green/30 transition-colors">Resolve</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg overflow-hidden">
          <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold">Existing Services</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ctp-surface0">
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Name</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">URL</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Endpoint</th>
                  <th className="text-right p-4 text-[0.7rem] uppercase text-ctp-overlay0">Action</th>
                </tr>
              </thead>
              <tbody>
                {services.length === 0 ? (
                  <tr><td colspan={4} className="text-center p-10 text-ctp-overlay0">No services configured.</td></tr>
                ) : services.map(s => (
                  <tr className="border-b border-ctp-surface0 last:border-b-0">
                    <td className="p-4 text-sm font-bold">{s.name}</td>
                    <td className="p-4 text-sm">{s.url}</td>
                    <td className="p-4 text-sm"><code className="bg-ctp-crust px-1.5 py-0.5 rounded text-xs text-ctp-mauve">{s.health_endpoint}</code></td>
                    <td className="p-4 text-right">
                      <form method="POST" action="/admin/remove" className="inline">
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-ctp-red/20 text-ctp-red border border-ctp-red text-xs font-bold hover:bg-ctp-red/30 transition-colors" {...({ onclick: "return confirm('Remove this service?')" } as any)}>Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function renderStatusPage(services: any[], historicalIncidents: any[], manualIncidents: any[]) {
  const isAllUp = services.every(s => s.latest.status === 'up') && manualIncidents.length === 0;
  const overallStatusText = manualIncidents.length > 0 ? 'Active System Incident' : (isAllUp ? 'All Systems Operational' : 'Partial System Outage');
  const overallStatusColor = manualIncidents.length > 0 ? 'ctp-red' : (isAllUp ? 'ctp-green' : 'ctp-yellow');
  const lastChecked = new Date().toLocaleString();

  return '<!DOCTYPE html>' + render(
    <Layout title="StatusFlare - System Health">
      <meta http-equiv="refresh" content="60" />
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 var(--pulse-color); }
            70% { box-shadow: 0 0 0 10px transparent; }
            100% { box-shadow: 0 0 0 0 transparent; }
        }
        .animate-pulse-custom {
            animation: pulse 2s infinite;
        }
      `}} />
      
      <div className="max-w-4xl mx-auto px-5 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold mb-2 tracking-tight text-ctp-mauve">StatusFlare</h1>
          <p className="text-ctp-overlay0 text-lg">Real-time system health monitoring</p>
        </header>

        <div className={`p-5 rounded-xl bg-ctp-${overallStatusColor}/15 border border-ctp-${overallStatusColor} text-ctp-${overallStatusColor} font-bold text-xl flex items-center justify-center gap-3 mb-8 animate-pulse-custom`} style={{ '--pulse-color': `color-mix(in srgb, var(--color-${overallStatusColor}) 40%, transparent)` }}>
          <SvgDot status={isAllUp ? 'up' : 'down'} size={24} />
          {overallStatusText}
        </div>

        {manualIncidents.length > 0 && (
          <>
            <div className="text-lg mb-5 mt-10 text-ctp-red uppercase tracking-widest font-bold">Active Incidents</div>
            <div className="border border-ctp-red rounded-xl overflow-hidden mb-10">
              {manualIncidents.map(i => (
                <div className="p-5 border-b border-ctp-surface0 last:border-b-0 bg-ctp-red/5">
                  <h4 className="text-ctp-red m-0 font-bold">{i.title} {i.service_name ? `(${i.service_name})` : ''}</h4>
                  <p className="text-ctp-text my-2 text-sm">{i.message}</p>
                  <div className="text-xs text-ctp-overlay0">Started: {new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="text-lg mb-5 mt-10 text-ctp-overlay0 uppercase tracking-widest font-bold">Current Status</div>
        <div className="flex flex-col gap-4">
          {services.map(s => {
            const latest = s.latest;
            return (
              <div className="bg-ctp-mantle rounded-xl border border-ctp-surface0 overflow-hidden hover:border-ctp-mauve transition-colors cursor-pointer group" {...({ onclick: `window.location.href='/status/${encodeURIComponent(s.name)}'` } as any)}>
                <div className="p-5 flex justify-between items-center flex-wrap gap-2.5">
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="m-0 text-lg font-bold">{s.name} <span className="text-xs text-ctp-overlay0 font-normal ml-2">{latest.latency_ms ? latest.latency_ms + 'ms' : ''}</span></h3>
                    <p className="m-0 mt-1 text-sm text-ctp-overlay0">{s.url}</p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase flex items-center gap-1.5 ${latest.status === 'up' ? 'bg-ctp-green/20 text-ctp-green' : 'bg-ctp-red/20 text-ctp-red'}`}>
                    <SvgDot status={latest.status} size={12} />
                    {latest.status?.toUpperCase()}
                  </div>
                </div>
                <div className="flex gap-1 px-5 pb-5 overflow-x-auto no-scrollbar">
                  {[...s.history].reverse().map(h => (
                    <div className="flex-none flex items-center justify-center" title={`${new Date(h.timestamp + (h.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()} - ${h.latency_ms}ms`}>
                      <SvgDot status={h.status} size={14} />
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-4 text-right">
                  <a href={`/status/${encodeURIComponent(s.name)}`} className="text-ctp-mauve text-xs no-underline font-bold group-hover:underline">VIEW DETAILS →</a>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-lg mb-5 mt-10 text-ctp-overlay0 uppercase tracking-widest font-bold">Historical Outages</div>
        <div className="border border-ctp-surface0 rounded-xl overflow-hidden bg-ctp-mantle shadow-lg">
          {historicalIncidents.length === 0 ? (
            <div className="p-10 text-ctp-green text-center font-bold">No recent outages reported.</div>
          ) : historicalIncidents.map(incident => (
            <div className="p-4 px-5 border-b border-ctp-surface0 last:border-b-0 flex justify-between items-center gap-4">
              <div>
                <h4 className="m-0 text-ctp-red font-bold">Outage: {incident.name}</h4>
                <span className="text-xs text-ctp-overlay0">HTTP {incident.status_code || 'Error'}: {incident.response_snippet?.slice(0, 50)}...</span>
              </div>
              <div className="text-xs text-ctp-overlay0 whitespace-nowrap">{new Date(incident.timestamp + (incident.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}</div>
            </div>
          ))}
        </div>

        <footer className="mt-20 text-center text-ctp-overlay0 text-sm pb-10">
          <div className="mt-2.5 italic">Last checked: {lastChecked}</div>
          <p className="mt-4">Powered by Cloudflare Workers & D1</p>
        </footer>
      </div>
    </Layout>
  );
}

export function renderServiceDetailPage(service: any, history: any[], incidents: any[]) {
  const uptime = history.length > 0 
    ? ((history.filter(h => h.status === 'up').length / history.length) * 100).toFixed(2)
    : '0.00';
  
  const latest = history[0] || { status: 'unknown', timestamp: new Date().toISOString() };
  const lastChecked = new Date(latest.timestamp + (latest.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString();

  return '<!DOCTYPE html>' + render(
    <Layout title={`${service.name} - Detailed Status`}>
      <div className="max-w-6xl mx-auto p-5 sm:p-10">
        <a href="/" className="inline-block mb-6 text-ctp-overlay0 no-underline text-sm hover:text-ctp-mauve transition-colors">← BACK TO DASHBOARD</a>
        
        <div className="bg-ctp-mantle rounded-xl p-8 border border-ctp-surface0 mb-6 flex justify-between items-start flex-wrap gap-6 shadow-xl">
          <div className="flex-1 min-w-[200px]">
            <h1 className="m-0 text-3xl font-bold">{service.name}</h1>
            <p className="m-0 mt-2 text-ctp-overlay0">{service.url}{service.health_endpoint}</p>
          </div>
          <div className={`px-6 py-3 rounded-xl text-lg font-bold uppercase flex items-center gap-2 ${latest.status === 'up' ? 'bg-ctp-green/20 text-ctp-green' : 'bg-ctp-red/20 text-ctp-red'}`}>
            <SvgDot status={latest.status} size={20} />
            {latest.status?.toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-md">
            <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold mb-2">Uptime (Recent)</div>
            <div className="text-2xl font-bold text-ctp-mauve">{uptime}%</div>
          </div>
          <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-md">
            <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold mb-2">Avg. Latency</div>
            <div className="text-2xl font-bold text-ctp-mauve">{history.length > 0 ? (history.reduce((a, b) => a + b.latency_ms, 0) / history.length).toFixed(0) : 0}ms</div>
          </div>
          <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-md">
            <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold mb-2">Last Checked</div>
            <div className="text-lg font-bold text-ctp-mauve">{lastChecked}</div>
          </div>
        </div>

        <div className="bg-ctp-mantle rounded-xl border border-ctp-surface0 p-6 mb-10 shadow-lg">
          <h2 className="m-0 mb-5 text-lg text-ctp-overlay0 uppercase tracking-widest font-bold">Latest Health Details</h2>
          <div className="mb-3 font-bold text-ctp-mauve">HTTP {latest.status_code || 'Error'}</div>
          <ParsedData snippet={latest.response_snippet} />
        </div>

        {incidents.length > 0 && (
          <>
            <div className="text-lg mb-5 mt-10 text-ctp-red uppercase tracking-widest font-bold">Active Incidents</div>
            <div className="mb-10 border border-ctp-red rounded-xl overflow-hidden bg-ctp-red/5">
              {incidents.map(i => (
                <div className="p-5 border-b border-ctp-surface0 last:border-b-0">
                  <h4 className="m-0 text-ctp-red font-bold">{i.title}</h4>
                  <p className="my-2 text-ctp-text text-sm">{i.message}</p>
                  <div className="text-xs text-ctp-overlay0">Started: {new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="text-lg mb-5 mt-10 text-ctp-overlay0 uppercase tracking-widest font-bold">Recent Health Checks</div>
        <div className="bg-ctp-mantle rounded-xl border border-ctp-surface0 overflow-hidden shadow-lg mb-10">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ctp-surface0">
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Time</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Status</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Latency</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0">Details</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr className="border-b border-ctp-surface0 last:border-b-0">
                    <td className="p-4 text-sm whitespace-nowrap">{new Date(h.timestamp + (h.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}</td>
                    <td className={`p-4 text-sm font-bold ${h.status === 'up' ? 'text-ctp-green' : 'text-ctp-red'}`}>{h.status.toUpperCase()}</td>
                    <td className="p-4 text-sm">{h.latency_ms}ms</td>
                    <td className="p-4">
                      <div className="mb-1 text-[0.7rem] font-bold text-ctp-mauve">HTTP {h.status_code || 'Error'}</div>
                      <pre className="bg-ctp-crust p-3 rounded-lg text-xs border border-ctp-surface0 m-0 whitespace-pre-wrap break-all text-ctp-overlay0">{h.response_snippet?.slice(0, 150)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="mt-20 text-center text-ctp-overlay0 text-sm pb-10">
          <p>Powered by Cloudflare Workers & D1</p>
        </footer>
      </div>
    </Layout>
  );
}
