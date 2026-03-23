export function SvgDot({ status, size = 16 }: { status: string; size?: number }) {
  const colorClass = status === 'up' ? 'text-ctp-green' : (status === 'down' ? 'text-ctp-red' : 'text-ctp-yellow');
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${colorClass} inline-block align-middle shrink-0 transition-colors duration-300`}>
      <ellipse cx="256" cy="255.99998" rx="250.06845" ry="250.06844" fill="black" stroke="currentColor" stroke-width="11.8631" />
      <ellipse cx="256" cy="255.99998" rx="204.00301" ry="204.00299" fill="black" stroke="currentColor" stroke-width="41.994" />
      <ellipse cx="256" cy="256" rx="158.24641" ry="158.24643" fill="currentColor" stroke="currentColor" stroke-width="7.50716" />
    </svg>
  );
}
