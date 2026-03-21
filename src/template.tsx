import { render } from 'preact-render-to-string';
import { 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  LogOut, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  History,
  Moon,
  Sun,
  LayoutDashboard,
  Server
} from 'lucide-preact';
import * as simpleIcons from 'simple-icons';

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

function SimpleIcon({ name, className = "" }: { name: keyof typeof simpleIcons; className?: string }) {
  const icon = (simpleIcons as any)[name];
  if (!icon) return null;
  return (
    <svg 
      role="img" 
      viewBox="0 0 24 24" 
      className={className} 
      fill="currentColor" 
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: icon.path }}
    />
  );
}

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
                        <th className="text-left p-2.5 border-b border-ctp-surface0 uppercase text-[0.7rem] font-bold">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {val.map(item => (
                      <tr className="hover:bg-ctp-surface0/30 transition-colors">
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
          <div className="pl-3 border-l-2 border-ctp-surface0 mt-1 flex flex-col gap-2">
            {val.map(item => (
              <div className="parsed-list-item">{renderValue(item)}</div>
            ))}
          </div>
        );
      }

      if (typeof val === 'object') {
        return (
          <div className="pl-3 border-l-2 border-ctp-surface0 mt-1 flex flex-col gap-1 w-full">
            {Object.entries(val).map(([k, v]) => {
              const isComplex = v !== null && typeof v === 'object';
              const countSuffix = Array.isArray(v) ? ` (${v.length})` : '';
              return (
                <div className={`mb-2 flex gap-3 items-start border-b border-ctp-surface0/30 pb-2 last:border-b-0 ${isComplex ? 'block' : ''}`}>
                  <span className="text-ctp-overlay0 font-bold whitespace-nowrap min-w-[150px] flex items-center gap-1.5">
                    {k}{countSuffix && <small className="text-ctp-overlay0">{countSuffix}</small>}:
                  </span>
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
        return (
          <span className={`${colorClass} font-bold uppercase text-[0.7rem] flex items-center gap-1`}>
            {lower === 'pass' || lower === 'up' || lower === 'ok' || lower === 'healthy' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {s}
          </span>
        );
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
      <body className="bg-ctp-base text-ctp-text font-mono min-h-screen w-full selection:bg-ctp-mauve/30">
        <button id="theme-toggle" className="fixed top-5 right-5 bg-ctp-mantle border border-ctp-surface0 text-ctp-text w-10 h-10 rounded-full cursor-pointer flex items-center justify-center shadow-lg z-50 hover:bg-ctp-surface0 transition-all hover:scale-110 active:scale-95" title="Toggle Theme">
          <Sun className="hidden latte:block" size={20} />
          <Moon className="hidden mocha:block" size={20} />
        </button>
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
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-ctp-mauve/10 text-ctp-mauve">
                <ShieldCheck size={48} />
              </div>
            </div>
            <h2 className="mt-0 text-center mb-6 text-2xl font-bold">Admin Login</h2>
            {error && <div className="text-ctp-red text-sm text-center mb-4 flex items-center justify-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>}
            
            <a href="/admin/login/oidc" className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-lg bg-ctp-mauve text-ctp-crust text-center no-underline font-bold text-lg border-none transition-transform hover:scale-[1.02] active:scale-[0.98]">
              <SimpleIcon name="siAuthelia" className="w-5 h-5" />
              Login with Authelia
            </a>

            <details className="mt-6">
              <summary className="block text-center mt-5 text-[0.75rem] text-ctp-overlay0 cursor-pointer list-none hover:text-ctp-subtext0 transition-colors uppercase tracking-widest">Legacy Password Login</summary>
              <form method="POST" action="/admin/login" className="mt-4 space-y-3">
                <input type="password" name="password" placeholder="Admin Password" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text box-border focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" required />
                <button type="submit" className="w-full p-3 rounded-lg border-none bg-ctp-surface1 text-ctp-text font-bold cursor-pointer hover:bg-ctp-surface2 transition-colors flex items-center justify-center gap-2">
                  <Clock size={18} />
                  Login
                </button>
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
          <div className="flex items-center gap-3">
            <LayoutDashboard className="text-ctp-mauve" size={28} />
            <h1 className="m-0 text-2xl font-bold text-ctp-mauve">StatusFlare Admin</h1>
          </div>
          <a href="/admin/logout" className="flex items-center gap-2 text-ctp-overlay0 no-underline text-sm border border-ctp-surface0 px-3 py-1.5 rounded-lg hover:bg-ctp-surface0 hover:text-ctp-red transition-all group">
            <LogOut size={16} className="group-hover:scale-110 transition-transform" />
            Logout
          </a>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg">
            <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold flex items-center gap-2">
              <Plus size={18} /> Add New Service
            </h2>
            <form method="POST" action="/admin/add" className="space-y-4">
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Service Name</label>
                <input type="text" name="name" placeholder="e.g. My API" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Base URL</label>
                  <input type="url" name="url" placeholder="https://api.example.com" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" required />
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Health Endpoint</label>
                  <input type="text" name="health_endpoint" placeholder="/api/health" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" required />
                </div>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Method</label>
                  <select name="method" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none cursor-pointer">
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="HEAD">HEAD</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Headers (JSON)</label>
                  <input type="text" name="headers_json" placeholder='{"Authorization": "Bearer ..."}' className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Request Body</label>
                <textarea name="body" rows={2} placeholder='{"query": "{__typename}"}' className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all resize-none"></textarea>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Token Provider URL</label>
                  <input type="url" name="token_url" placeholder="https://api.example.com/auth" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" />
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Token Path</label>
                  <input type="text" name="token_response_path" placeholder="token" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Token Body (JSON)</label>
                <textarea name="token_body" rows={2} placeholder='{"username": "...", "password": "..."}' className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all resize-none"></textarea>
              </div>
              <button type="submit" className="w-full py-3.5 px-5 rounded-lg border-none bg-ctp-mauve text-ctp-crust font-bold cursor-pointer hover:opacity-90 transition-all hover:shadow-lg active:scale-95 flex items-center justify-center gap-2">
                <Plus size={20} />
                Add Service
              </button>
            </form>
          </div>

          <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg">
            <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold flex items-center gap-2 text-ctp-red">
              <AlertTriangle size={18} /> Report Incident
            </h2>
            <form method="POST" action="/admin/incidents/create" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Title</label>
                  <input type="text" name="title" placeholder="Database Issues" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-red focus:outline-none transition-all" required />
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Affected Service</label>
                  <select name="service_id" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-red focus:outline-none cursor-pointer">
                    <option value="">System Wide</option>
                    {services.map(s => <option value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Message</label>
                <textarea name="message" rows={2} placeholder="Describe the issue..." className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-red focus:outline-none transition-all resize-none" required></textarea>
              </div>
              <button type="submit" className="w-full py-3.5 px-5 rounded-lg border-none bg-ctp-red text-ctp-crust font-bold cursor-pointer hover:opacity-90 transition-all hover:shadow-lg active:scale-95 flex items-center justify-center gap-2">
                <AlertTriangle size={20} />
                Post Incident
              </button>
            </form>
          </div>
        </div>

        <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg mb-6 overflow-hidden">
          <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold flex items-center gap-2">
            <Activity size={18} className="text-ctp-green" /> Active Incidents
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ctp-surface0">
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">Title</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">Service</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">Started</th>
                  <th className="text-right p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeIncidents.length === 0 ? (
                  <tr><td colspan={4} className="text-center p-10 text-ctp-overlay0 italic">No active incidents.</td></tr>
                ) : activeIncidents.map(i => (
                  <tr className="border-b border-ctp-surface0 last:border-b-0 hover:bg-ctp-base/50 transition-colors">
                    <td className="p-4 text-sm font-bold text-ctp-red">{i.title}</td>
                    <td className="p-4 text-sm flex items-center gap-2">
                      <Server size={14} className="text-ctp-overlay0" />
                      {i.service_name || 'System Wide'}
                    </td>
                    <td className="p-4 text-sm text-ctp-overlay0">
                      <div className="flex items-center gap-1.5">
                        <Clock size={14} />
                        {new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <form method="POST" action="/admin/incidents/resolve" className="inline">
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-ctp-green/20 text-ctp-green border border-ctp-green text-xs font-bold hover:bg-ctp-green/30 transition-all active:scale-95 flex items-center gap-1.5 ml-auto">
                          <CheckCircle2 size={14} /> Resolve
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-ctp-mantle p-6 rounded-xl border border-ctp-surface0 shadow-lg overflow-hidden">
          <h2 className="mt-0 text-base mb-5 text-ctp-overlay0 uppercase tracking-widest font-bold flex items-center gap-2">
            <Server size={18} className="text-ctp-mauve" /> Existing Services
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ctp-surface0">
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">Name</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">URL</th>
                  <th className="text-left p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">Endpoint</th>
                  <th className="text-right p-4 text-[0.7rem] uppercase text-ctp-overlay0 tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody>
                {services.length === 0 ? (
                  <tr><td colspan={4} className="text-center p-10 text-ctp-overlay0 italic">No services configured.</td></tr>
                ) : services.map(s => (
                  <tr className="border-b border-ctp-surface0 last:border-b-0 hover:bg-ctp-base/50 transition-colors group">
                    <td className="p-4 text-sm font-bold group-hover:text-ctp-mauve transition-colors">{s.name}</td>
                    <td className="p-4 text-sm text-ctp-overlay0">{s.url}</td>
                    <td className="p-4 text-sm">
                      <code className="bg-ctp-crust px-2 py-1 rounded text-xs text-ctp-mauve border border-ctp-surface0">
                        {s.health_endpoint}
                      </code>
                    </td>
                    <td className="p-4 text-right">
                      <form method="POST" action="/admin/remove" className="inline">
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="px-3 py-1.5 rounded-lg bg-ctp-red/10 text-ctp-red border border-ctp-red/20 text-xs font-bold hover:bg-ctp-red hover:text-ctp-crust transition-all active:scale-95 flex items-center gap-1.5 ml-auto" {...({ onclick: "return confirm('Remove this service?')" } as any)}>
                          <Trash2 size={14} /> Remove
                        </button>
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
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
      
      <div className="max-w-4xl mx-auto px-5 py-10">
        <header className="mb-10 text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-ctp-mauve/10 rounded-2xl mb-2">
            <Activity className="text-ctp-mauve" size={40} />
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-ctp-text">Status<span className="text-ctp-mauve">Flare</span></h1>
          <p className="text-ctp-overlay0 text-lg flex items-center justify-center gap-2">
            <ShieldCheck size={18} /> Real-time system health monitoring
          </p>
        </header>

        <div className={`p-6 rounded-2xl bg-ctp-${overallStatusColor}/15 border-2 border-ctp-${overallStatusColor} text-ctp-${overallStatusColor} font-bold text-2xl flex items-center justify-center gap-4 mb-12 animate-pulse-custom shadow-lg`} style={{ '--pulse-color': `color-mix(in srgb, var(--color-${overallStatusColor}) 40%, transparent)` }}>
          <SvgDot status={isAllUp ? 'up' : 'down'} size={28} />
          {overallStatusText}
        </div>

        {manualIncidents.length > 0 && (
          <div className="mb-12">
            <div className="text-sm mb-4 text-ctp-red uppercase tracking-[0.2em] font-bold flex items-center gap-2">
              <AlertTriangle size={16} /> Active Incidents
            </div>
            <div className="border border-ctp-red rounded-2xl overflow-hidden shadow-xl bg-ctp-mantle">
              {manualIncidents.map(i => (
                <div className="p-6 border-b border-ctp-surface0 last:border-b-0 bg-ctp-red/5">
                  <h4 className="text-ctp-red m-0 font-bold text-xl flex items-center gap-2">
                    <AlertTriangle size={20} />
                    {i.title} {i.service_name ? <span className="text-ctp-overlay0 text-base font-normal">({i.service_name})</span> : ''}
                  </h4>
                  <p className="text-ctp-text my-3 text-base leading-relaxed">{i.message}</p>
                  <div className="text-xs text-ctp-overlay0 flex items-center gap-1.5 uppercase font-bold tracking-wider">
                    <Clock size={12} /> Started: {new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm mb-4 text-ctp-overlay0 uppercase tracking-[0.2em] font-bold flex items-center gap-2">
          <Server size={16} /> Current Status
        </div>
        <div className="flex flex-col gap-5">
          {services.map(s => {
            const latest = s.latest;
            return (
              <div className="bg-ctp-mantle rounded-2xl border border-ctp-surface0 overflow-hidden hover:border-ctp-mauve hover:shadow-xl transition-all duration-300 cursor-pointer group" {...({ onclick: `window.location.href='/status/${encodeURIComponent(s.name)}'` } as any)}>
                <div className="p-6 flex justify-between items-center flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="m-0 text-xl font-bold flex items-center gap-2 group-hover:text-ctp-mauve transition-colors">
                      {s.name} 
                      {latest.latency_ms && <span className="text-xs px-2 py-0.5 bg-ctp-surface0 rounded-lg text-ctp-overlay0 font-mono tracking-tighter">{latest.latency_ms}ms</span>}
                    </h3>
                    <p className="m-0 mt-1.5 text-sm text-ctp-overlay0 flex items-center gap-1.5">
                      <SimpleIcon name="siCloudflare" className="w-3.5 h-3.5" />
                      {s.url}
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${latest.status === 'up' ? 'bg-ctp-green/10 text-ctp-green border border-ctp-green/20' : 'bg-ctp-red/10 text-ctp-red border border-ctp-red/20'}`}>
                    <SvgDot status={latest.status} size={12} />
                    {latest.status?.toUpperCase()}
                  </div>
                </div>
                <div className="flex gap-1 px-6 pb-6 overflow-x-auto no-scrollbar mask-fade">
                  {[...s.history].reverse().map(h => (
                    <div className="flex-none flex items-center justify-center transition-transform hover:scale-150 hover:z-10" title={`${new Date(h.timestamp + (h.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()} - ${h.latency_ms}ms`}>
                      <SvgDot status={h.status} size={14} />
                    </div>
                  ))}
                </div>
                <div className="px-6 py-3 bg-ctp-crust/50 border-t border-ctp-surface0/30 flex justify-end">
                  <span className="text-ctp-mauve text-[0.7rem] uppercase font-bold tracking-widest flex items-center gap-1 group-hover:gap-2 transition-all">
                    View Analytics <ExternalLink size={10} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-sm mb-4 mt-12 text-ctp-overlay0 uppercase tracking-[0.2em] font-bold flex items-center gap-2">
          <History size={16} /> Historical Outages
        </div>
        <div className="border border-ctp-surface0 rounded-2xl overflow-hidden bg-ctp-mantle shadow-lg">
          {historicalIncidents.length === 0 ? (
            <div className="p-12 text-ctp-green text-center flex flex-col items-center gap-3">
              <CheckCircle2 size={32} />
              <span className="font-bold tracking-wider uppercase text-sm">No recent outages reported.</span>
            </div>
          ) : historicalIncidents.map(incident => (
            <div className="p-5 px-6 border-b border-ctp-surface0 last:border-b-0 flex justify-between items-center gap-4 hover:bg-ctp-base/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-ctp-red/10 rounded-lg">
                  <XCircle className="text-ctp-red" size={20} />
                </div>
                <div>
                  <h4 className="m-0 text-ctp-red font-bold">{incident.name}</h4>
                  <span className="text-xs text-ctp-overlay0 font-mono tracking-tighter">HTTP {incident.status_code || 'Error'}: {incident.response_snippet?.slice(0, 40)}...</span>
                </div>
              </div>
              <div className="text-xs text-ctp-overlay0 whitespace-nowrap font-medium flex items-center gap-1.5">
                <Clock size={12} />
                {new Date(incident.timestamp + (incident.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-24 text-center border-t border-ctp-surface0 pt-10 pb-10 space-y-4">
          <div className="flex justify-center gap-6 text-ctp-overlay0">
            <SimpleIcon name="siCloudflare" className="w-6 h-6 hover:text-ctp-mauve transition-colors" />
            <SimpleIcon name="siGithub" className="w-6 h-6 hover:text-ctp-mauve transition-colors" />
            <SimpleIcon name="siTailwindcss" className="w-6 h-6 hover:text-ctp-mauve transition-colors" />
          </div>
          <div className="text-ctp-overlay0 text-xs font-bold tracking-[0.3em] uppercase">
            Powered by Workers & D1
          </div>
          <div className="text-ctp-overlay0 text-[0.7rem] italic">
            Last checked: {lastChecked}
          </div>
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
        <a href="/" className="inline-flex items-center gap-2 mb-8 text-ctp-overlay0 no-underline text-sm font-bold uppercase tracking-widest hover:text-ctp-mauve transition-all group">
          <Activity size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
        </a>
        
        <div className="bg-ctp-mantle rounded-2xl p-10 border border-ctp-surface0 mb-8 flex justify-between items-center flex-wrap gap-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-5 -mr-5 -mt-5">
            <SimpleIcon name="siCloudflare" className="w-48 h-48" />
          </div>
          <div className="flex-1 min-w-[300px] relative z-10">
            <h1 className="m-0 text-4xl font-bold tracking-tight">{service.name}</h1>
            <p className="m-0 mt-3 text-ctp-overlay0 flex items-center gap-2 text-lg">
              <ExternalLink size={18} /> {service.url}{service.health_endpoint}
            </p>
          </div>
          <div className={`px-8 py-4 rounded-2xl text-xl font-bold uppercase tracking-widest flex items-center gap-3 relative z-10 ${latest.status === 'up' ? 'bg-ctp-green/10 text-ctp-green border-2 border-ctp-green/20' : 'bg-ctp-red/10 text-ctp-red border-2 border-ctp-red/20'}`}>
            <SvgDot status={latest.status} size={24} />
            {latest.status?.toUpperCase()}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <div className="bg-ctp-mantle p-8 rounded-2xl border border-ctp-surface0 shadow-lg hover:border-ctp-mauve transition-colors">
            <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold tracking-[0.2em] mb-3 flex items-center gap-2">
              <ShieldCheck size={14} className="text-ctp-green" /> Uptime (Recent)
            </div>
            <div className="text-4xl font-bold text-ctp-mauve">{uptime}%</div>
          </div>
          <div className="bg-ctp-mantle p-8 rounded-2xl border border-ctp-surface0 shadow-lg hover:border-ctp-mauve transition-colors">
            <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold tracking-[0.2em] mb-3 flex items-center gap-2">
              <Activity size={14} className="text-ctp-mauve" /> Avg. Latency
            </div>
            <div className="text-4xl font-bold text-ctp-mauve">{history.length > 0 ? (history.reduce((a, b) => a + b.latency_ms, 0) / history.length).toFixed(0) : 0}ms</div>
          </div>
          <div className="bg-ctp-mantle p-8 rounded-2xl border border-ctp-surface0 shadow-lg hover:border-ctp-mauve transition-colors">
            <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold tracking-[0.2em] mb-3 flex items-center gap-2">
              <Clock size={14} /> Last Checked
            </div>
            <div className="text-lg font-bold text-ctp-mauve uppercase tracking-tight">{lastChecked}</div>
          </div>
        </div>

        <div className="bg-ctp-mantle rounded-2xl border border-ctp-surface0 p-8 mb-12 shadow-xl">
          <h2 className="m-0 mb-6 text-sm text-ctp-overlay0 uppercase tracking-[0.3em] font-bold flex items-center gap-2">
            <CheckCircle2 size={18} className="text-ctp-green" /> Latest Health Details
          </h2>
          <div className="mb-4 font-mono text-xl font-bold text-ctp-mauve bg-ctp-base/50 p-4 rounded-xl border border-ctp-surface0 w-fit">
            HTTP {latest.status_code || 'Error'}
          </div>
          <div className="bg-ctp-base/30 p-6 rounded-2xl border border-ctp-surface0/50">
            <ParsedData snippet={latest.response_snippet} />
          </div>
        </div>

        {incidents.length > 0 && (
          <div className="mb-12">
            <div className="text-sm mb-4 text-ctp-red uppercase tracking-[0.2em] font-bold flex items-center gap-2">
              <AlertTriangle size={16} /> Active Incidents
            </div>
            <div className="border-2 border-ctp-red rounded-2xl overflow-hidden bg-ctp-red/5 shadow-2xl">
              {incidents.map(i => (
                <div className="p-8 border-b border-ctp-red/20 last:border-b-0">
                  <h4 className="m-0 text-ctp-red font-bold text-2xl">{i.title}</h4>
                  <p className="my-4 text-ctp-text text-lg leading-relaxed">{i.message}</p>
                  <div className="text-xs text-ctp-overlay0 flex items-center gap-2 uppercase tracking-widest font-bold">
                    <Clock size={14} /> Started: {new Date(i.created_at + (i.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-sm mb-4 text-ctp-overlay0 uppercase tracking-[0.2em] font-bold flex items-center gap-2">
          <History size={16} /> Recent Health Checks
        </div>
        <div className="bg-ctp-mantle rounded-2xl border border-ctp-surface0 overflow-hidden shadow-2xl mb-12">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ctp-surface0 bg-ctp-crust/50">
                  <th className="text-left p-6 text-[0.7rem] uppercase text-ctp-overlay0 tracking-[0.2em]">Time</th>
                  <th className="text-left p-6 text-[0.7rem] uppercase text-ctp-overlay0 tracking-[0.2em]">Status</th>
                  <th className="text-left p-6 text-[0.7rem] uppercase text-ctp-overlay0 tracking-[0.2em]">Latency</th>
                  <th className="text-left p-6 text-[0.7rem] uppercase text-ctp-overlay0 tracking-[0.2em]">Details</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr className="border-b border-ctp-surface0 last:border-b-0 hover:bg-ctp-base/50 transition-colors">
                    <td className="p-6 text-sm whitespace-nowrap text-ctp-overlay0">
                      <div className="flex items-center gap-2">
                        <Clock size={14} /> {new Date(h.timestamp + (h.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-6">
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 w-fit ${h.status === 'up' ? 'bg-ctp-green/10 text-ctp-green border border-ctp-green/20' : 'bg-ctp-red/10 text-ctp-red border border-ctp-red/20'}`}>
                        <SvgDot status={h.status} size={10} />
                        {h.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-6 text-sm font-mono text-ctp-mauve font-bold">{h.latency_ms}ms</td>
                    <td className="p-6 max-w-md">
                      <div className="mb-2 text-[0.7rem] font-bold text-ctp-overlay0 uppercase tracking-widest">HTTP {h.status_code || 'Error'}</div>
                      <pre className="bg-ctp-crust p-4 rounded-xl text-[0.7rem] border border-ctp-surface0 m-0 whitespace-pre-wrap break-all text-ctp-overlay0 font-mono shadow-inner">{h.response_snippet?.slice(0, 150)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="mt-24 text-center border-t border-ctp-surface0 pt-10 pb-10">
          <p className="text-ctp-overlay0 text-xs font-bold tracking-[0.3em] uppercase">Powered by Cloudflare Workers & D1</p>
        </footer>
      </div>
    </Layout>
  );
}
