import type { Lead } from "../lib/mockData";

type LeadsPanelProps = {
  leads: Lead[];
  onCreateLead?: () => void;
};

export function LeadsPanel({ leads, onCreateLead }: LeadsPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Leads</h2>
          <p className="mt-1 text-sm text-slate-500">
            Active opportunities across roofing and painting.
          </p>
        </div>
        {onCreateLead ? (
          <button
            type="button"
            onClick={onCreateLead}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            New lead
          </button>
        ) : null}
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
        <div className="hidden grid-cols-[1fr_120px_130px_120px] gap-4 border-b border-slate-200 px-4 py-3 font-medium text-slate-500 sm:grid">
          <span>Lead</span>
          <span>Service</span>
          <span>Source</span>
          <span>Value</span>
        </div>
        <div className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_120px_130px_120px] sm:items-center"
            >
              <div>
                <p className="font-semibold text-slate-900">{lead.name}</p>
                <p className="mt-1 text-xs text-slate-500">{lead.status}</p>
              </div>
              <span className="text-slate-600">{lead.projectType}</span>
              <span className="text-slate-600">{lead.source}</span>
              <span className="font-semibold text-slate-900">{lead.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
