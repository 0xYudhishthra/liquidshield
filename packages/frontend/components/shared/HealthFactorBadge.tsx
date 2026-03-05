export function HealthFactorBadge({ value }: { value: number }) {
  const color = value > 1.5 ? "text-green-400" : value > 1.3 ? "text-yellow-400" : "text-red-400";
  const bg = value > 1.5 ? "bg-green-400/10" : value > 1.3 ? "bg-yellow-400/10" : "bg-red-400/10";
  return <span className={`px-2 py-1 rounded text-sm font-mono ${color} ${bg}`}>{value.toFixed(2)}x</span>;
}
