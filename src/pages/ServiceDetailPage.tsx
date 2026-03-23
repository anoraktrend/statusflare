import { render } from 'preact-render-to-string';
import { 
  Activity, 
  ShieldCheck, 
  TriangleAlert, 
  ExternalLink, 
  Clock, 
  CircleCheck, 
  History
} from 'lucide-preact';
import { Layout } from '../components/Layout';
import { SimpleIcon } from '../components/SimpleIcon';
import { SvgDot } from '../components/SvgDot';
import { ParsedData } from '../components/ParsedData';
import { Service, Incident, HealthCheck } from '../types';

export function renderServiceDetailPage(service: Service, history: HealthCheck[], incidents: Incident[]) {
  const uptime = history.length > 0
    ? ((history.filter(h => h.status === 'up').length / history.length) * 100).toFixed(2)
    : '0.00';

  const latest = history[0] || { status: 'unknown', timestamp: new Date().toISOString(), status_code: null, response_snippet: '' };
  const lastChecked = new Date(latest.timestamp + (latest.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString();

  let serviceColorHex = '#a6e3a1'; // Mocha Green
  if (latest.status === 'down') serviceColorHex = '#f38ba8'; // Mocha Red
  else if (latest.status === 'unknown') serviceColorHex = '#6c7485'; // Gray

  const description = `Current status: ${latest.status.toUpperCase()} | Uptime: ${uptime}%`;

  return '<!DOCTYPE html>' + render(
    <Layout title={`${service.name} - Detailed Status`} description={description} color={serviceColorHex} badgeService={service.name}>
      <div className="max-w-6xl mx-auto p-5 sm:p-10">
        <a href="/" className="inline-flex items-center gap-2 mb-8 text-ctp-overlay0 no-underline text-sm font-bold uppercase tracking-widest hover:text-ctp-mauve transition-all group">
          <Activity size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
        </a>
        
        <div className="bg-ctp-mantle rounded-2xl p-10 border border-ctp-surface0 mb-8 flex justify-between items-center flex-wrap gap-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-5 -mr-5 -mt-5">
            <SimpleIcon name={service.icon || "siCloudflare"} className="w-48 h-48" useBrandColor />
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
            <CircleCheck size={18} className="text-ctp-green" /> Latest Health Details
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
              <TriangleAlert size={16} /> Active Incidents
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

        <footer className="mt-16 text-center border-t border-ctp-surface0 pt-10 pb-20 space-y-4">
          <div className="flex justify-center gap-6 text-ctp-subtext0">
            <SimpleIcon name="siCloudflare" className="w-6 h-6 hover:text-ctp-mauve transition-colors" />
            <SimpleIcon name="siGithub" className="w-6 h-6 hover:text-ctp-mauve transition-colors" />
            <SimpleIcon name="siDiscord" className="w-6 h-6 hover:text-ctp-mauve transition-colors" />
            <SimpleIcon name="siTailwindcss" className="w-6 h-6 hover:text-ctp-mauve transition-colors" />
          </div>
          <div className="text-ctp-subtext0 text-xs font-bold tracking-[0.3em] uppercase">
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
