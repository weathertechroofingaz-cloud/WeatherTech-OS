import type { FollowUp } from '../lib/mockData';

type FollowUpsPanelProps = {
  followUps: FollowUp[];
};

export function FollowUpsPanel({ followUps }: FollowUpsPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Follow Ups</h2>
          <p className="mt-1 text-sm text-slate-500">Stay on top of every follow-up task across both businesses.</p>
        </div>
        <button className="whitespace-nowrap rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          Add follow up
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {followUps.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.customer}</p>
              <p className="mt-1 text-sm text-slate-500">{item.type} due {item.dueDate}</p>
            </div>
            <span className={`mt-4 rounded-md px-3 py-1 text-xs font-semibold uppercase ${item.status === 'Pending' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'} sm:mt-0`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
