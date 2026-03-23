import { render } from 'preact-render-to-string';
import { 
  ShieldCheck, 
  TriangleAlert, 
  Trash2, 
  Plus, 
  LogOut, 
  Clock, 
  CircleCheck, 
  LayoutDashboard,
  Server,
  Activity
} from 'lucide-preact';
import { Layout } from '../components/Layout';
import { SimpleIcon } from '../components/SimpleIcon';
import { Service, Incident } from '../types';

export function renderAdminPage(services: Service[], activeIncidents: Incident[], error?: string, isAuthenticated: boolean = false, oidcConfigured: boolean = true) {
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
              <TriangleAlert size={16} /> {error}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Service Name</label>
                  <input type="text" name="name" placeholder="e.g. My API" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" required />
                </div>
                <div>
                  <label className="block mb-2 text-xs text-ctp-overlay0 font-semibold uppercase tracking-wider">Icon (Simple-Icons)</label>
                  <input type="text" name="icon" placeholder="e.g. siCloudflare" className="w-full p-3 rounded-lg border border-ctp-surface0 bg-ctp-base text-ctp-text text-sm focus:ring-2 focus:ring-ctp-mauve focus:outline-none transition-all" />
                </div>
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
              <TriangleAlert size={18} /> Report Incident
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
                <TriangleAlert size={20} />
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
                          <CircleCheck size={14} /> Resolve
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
