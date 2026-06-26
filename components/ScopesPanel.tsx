import type { Scope } from '../lib/mockData';

type ScopesPanelProps = {
  scopes: Scope[];
};

export function ScopesPanel({ scopes }: ScopesPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Scopes of Work</h2>
          <p className="mt-1 text-sm text-slate-500">Prepare and review scopes for roofing and painting projects.</p>
        </div>
        <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          New scope
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {scopes.map((scope) => (
          <div key={scope.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{scope.title}</p>
              <p className="mt-1 text-sm text-slate-500">{scope.projectType} scope · Assigned to {scope.assignedTo}</p>
            </div>
            <span className="mt-4 rounded-md bg-amber-100 px-3 py-1 text-xs font-semibold uppercase text-amber-700 sm:mt-0">
              {scope.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
