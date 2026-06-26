import type { FollowUp } from '../lib/mockData';

type FollowUpsPanelProps = {
  followUps: FollowUp[];
};

export function FollowUpsPanel({ followUps }: FollowUpsPanelProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
      <div className="flex items-center justify-between gap-4 sm:flex-row">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Follow Ups</h2>
          <p className="mt-1 text-sm text-slate-500">Stay on top of every follow-up task across both businesses.</p>
        </div>
        <button className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          Add follow up
        </button>
      </div>
      <div className="mt-6 space-y-3">
        {followUps.map((item) => (
          <div key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.customer}</p>
              <p className="mt-1 text-sm text-slate-500">{item.type} due {item.dueDate}</p>
            </div>
            <span className={`mt-4 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${item.status === 'Pending' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'} sm:mt-0`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
