import { CircleCheck, CircleX } from 'lucide-preact';

export function ParsedData({ snippet }: { snippet: string }) {
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
            {lower === 'pass' || lower === 'up' || lower === 'ok' || lower === 'healthy' ? <CircleCheck size={12} /> : <CircleX size={12} />}
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
