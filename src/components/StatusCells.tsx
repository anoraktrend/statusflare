import { fmtTime } from '../utils/helpers';

export function StatusCells({
	history,
	size = 12,
	className = '',
}: {
	history: { status: string; timestamp: string; latency_ms: number }[];
	size?: number;
	className?: string;
}) {
	const color = (status: string) =>
		status === 'up' ? 'bg-ctp-green' : status === 'down' ? 'bg-ctp-red' : 'bg-ctp-yellow';
	return (
		<div className={`flex gap-1 overflow-x-auto no-scrollbar mask-fade ${className}`}>
			{[...history].reverse().map((h) => (
				<div
					className={`flex-none rounded-[3px] transition-transform hover:scale-150 hover:z-10 ${color(h.status)}`}
					style={{ width: size, height: size * 1.25 }}
					key={h.timestamp}
					title={`${fmtTime(h.timestamp)} - ${h.latency_ms}ms`}
				/>
			))}
		</div>
	);
}