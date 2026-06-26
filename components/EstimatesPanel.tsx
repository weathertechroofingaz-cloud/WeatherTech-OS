import type { Estimate } from '../lib/mockData';

type EstimatesPanelProps = {
  estimates: Estimate[];
};

export function EstimatesPanel({ estimates }: EstimatesPanelProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
      <div className="flex items-center justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Estimates</h2>
          <p className="mt-1 text-sm text-slate-500">View your latest estimates for both companies.</p>
        </div>
        <button className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          New estimate
        </button>
      </div>
      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white text-sm shadow-sm">
        <div className="hidden grid-cols-[1fr_120px_120px_120px] gap-4 border-b border-slate-200 px-4 py-3 text-slate-400 sm:grid">
          <span>Customer</span>
          <span>Date</span>
          <span>Amount</span>
          <span>Status</span>
        </div>
        <div className="space-y-3 p-4">
          {estimates.map((estimate) => (
            <div key={estimate.id} className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_120px_120px_120px] sm:items-center">
              <div>
                <p className="font-semibold text-slate-900">{estimate.customer}</p>
                <p className="text-xs text-slate-500">{estimate.company}</p>
              </div>
              <span className="text-slate-600">{estimate.estimateDate}</span>
              <span className="font-semibold text-slate-900">{estimate.amount}</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                {estimate.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
