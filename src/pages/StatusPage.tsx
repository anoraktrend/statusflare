import { render } from 'preact-render-to-string';
import { 
  Activity, 
  ShieldCheck, 
  TriangleAlert, 
  ExternalLink, 
  Clock, 
  CircleCheck, 
  CircleX, 
  History,
  Server
} from 'lucide-preact';
import { Layout } from '../components/Layout';
import { SimpleIcon } from '../components/SimpleIcon';
import { SvgDot } from '../components/SvgDot';
import { Service, Incident } from '../types';

export function renderStatusPage(services: any[], historicalIncidents: any[], manualIncidents: Incident[], system?: { history: any[], uptime: string }) {
  const allUp = services.every(s => s.latest.status === 'up');
  const allDown = services.length > 0 && services.every(s => s.latest.status === 'down');
  const hasManualIncident = manualIncidents.length > 0;

  let overallStatusText = 'All Systems Operational';
  let overallStatusColor = 'ctp-green';
  let overallStatusIcon = 'up';
  let overallStatusHex = '#a6e3a1'; // Mocha Green

  if (hasManualIncident || allDown) {
    overallStatusText = hasManualIncident ? 'Active System Incident' : 'Major System Outage';
    overallStatusColor = 'ctp-red';
    overallStatusIcon = 'down';
    overallStatusHex = '#f38ba8'; // Mocha Red
  } else if (!allUp) {
    overallStatusText = 'Partial System Outage';
    overallStatusColor = 'ctp-yellow';
    overallStatusIcon = 'degraded';
    overallStatusHex = '#f9e2af'; // Mocha Yellow
  }

  const lastChecked = new Date().toLocaleString();

  return '<!DOCTYPE html>' + render(
    <Layout title="StatusFlare - System Health" description={overallStatusText} color={overallStatusHex}>
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

        <div className={`p-6 rounded-2xl bg-ctp-${overallStatusColor}/15 border-2 border-ctp-${overallStatusColor} text-ctp-${overallStatusColor} font-bold text-2xl flex items-center justify-center gap-4 mb-8 animate-pulse-custom shadow-lg`} style={{ '--pulse-color': `color-mix(in srgb, var(--color-${overallStatusColor}) 40%, transparent)` }}>
          <SvgDot status={overallStatusIcon} size={28} />
          {overallStatusText}
        </div>

        {system && (
          <div className="mb-12 flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-ctp-mantle p-6 rounded-2xl border border-ctp-surface0 shadow-lg flex flex-col justify-center">
                <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold tracking-[0.2em] mb-2 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-ctp-green" /> Overall Uptime
                </div>
                <div className="text-3xl font-bold text-ctp-mauve">{system.uptime}%</div>
              </div>
              <div className="bg-ctp-mantle p-6 rounded-2xl border border-ctp-surface0 shadow-lg flex flex-col justify-center">
                <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold tracking-[0.2em] mb-2 flex items-center gap-2">
                  <Activity size={14} className="text-ctp-mauve" /> Avg. Latency
                </div>
                <div className="text-3xl font-bold text-ctp-mauve">{system.history.length > 0 ? (system.history.reduce((a, b) => a + b.latency_ms, 0) / system.history.length).toFixed(0) : 0}ms</div>
              </div>
            </div>
            {system.history.length > 0 && (
              <div className="bg-ctp-mantle p-6 rounded-2xl border border-ctp-surface0 shadow-lg">
                <div className="text-[0.7rem] uppercase text-ctp-overlay0 font-bold tracking-[0.2em] mb-4 flex items-center gap-2">
                  <History size={14} className="text-ctp-mauve" /> System History
                </div>
                <div className="flex gap-2 justify-between overflow-x-auto no-scrollbar mask-fade">
                  {[...system.history].reverse().map((h: any) => (
                    <div className="flex-none flex items-center justify-center transition-transform hover:scale-150 hover:z-10" title={`${new Date(h.timestamp + (h.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString()} - ${h.latency_ms}ms`}>
                      <SvgDot status={h.status} size={16} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {manualIncidents.length > 0 && (
          <div className="mb-12">
            <div className="text-sm mb-4 text-ctp-red uppercase tracking-[0.2em] font-bold flex items-center gap-2">
              <TriangleAlert size={16} /> Active Incidents
            </div>
            <div className="border border-ctp-red rounded-2xl overflow-hidden shadow-xl bg-ctp-mantle">
              {manualIncidents.map(i => (
                <div className="p-6 border-b border-ctp-surface0 last:border-b-0 bg-ctp-red/5">
                  <h4 className="text-ctp-red m-0 font-bold text-xl flex items-center gap-2">
                    <TriangleAlert size={20} />
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
                      <SimpleIcon name={s.icon || "siCloudflare"} className="w-3.5 h-3.5" useBrandColor />
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
              <CircleCheck size={32} />
              <span className="font-bold tracking-wider uppercase text-sm">No recent outages reported.</span>
            </div>
          ) : historicalIncidents.map(incident => (
            <div className="p-5 px-6 border-b border-ctp-surface0 last:border-b-0 flex justify-between items-center gap-4 hover:bg-ctp-base/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-ctp-red/10 rounded-lg">
                  <CircleX className="text-ctp-red" size={20} />
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
