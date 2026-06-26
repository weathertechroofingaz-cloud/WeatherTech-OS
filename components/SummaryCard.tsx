type SummaryCardProps = {
  title: string;
  value: number;
  accent: 'sky' | 'emerald' | 'amber' | 'violet';
};

const accentMap = {
  sky: 'bg-sky-500/10 text-sky-700',
  emerald: 'bg-emerald-500/10 text-emerald-700',
  amber: 'bg-amber-500/10 text-amber-700',
  violet: 'bg-violet-500/10 text-violet-700',
};

export function SummaryCard({ title, value, accent }: SummaryCardProps) {
  return (
    <div className={`rounded-3xl border border-slate-200 p-5 ${accentMap[accent]}`}>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}
