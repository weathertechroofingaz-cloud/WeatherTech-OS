export const navItems = [
  { label: "Dashboard", key: "dashboard" },
  { label: "Leads", key: "leads" },
  { label: "New Lead", key: "newLead" },
  { label: "Customers", key: "customers" },
  { label: "Estimates", key: "estimates" },
  { label: "Scope of Work", key: "scope" },
  { label: "Jobs", key: "jobs" },
  { label: "Scheduling", key: "scheduling" },
  { label: "Material Orders", key: "materials" },
  { label: "Photos", key: "photos" },
  { label: "Invoices", key: "invoices" },
  { label: "Calendar", key: "calendar" },
  { label: "AI Assistant", key: "assistant" },
  { label: "Settings", key: "settings" },
] as const;

export type AppPage = (typeof navItems)[number]["key"];

type SidebarProps = {
  activePage: AppPage;
  setActivePage: (page: AppPage) => void;
};

export function Sidebar({ activePage, setActivePage }: SidebarProps) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-500 font-bold text-white">
          WT
        </div>
        <div>
          <p className="text-sm font-semibold uppercase text-sky-300">
            WeatherTech
          </p>
          <p className="mt-1 text-sm text-slate-300">Operations</p>
        </div>
      </div>

      <div className="mt-6 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActivePage(item.key)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition ${
              activePage === item.key
                ? "bg-sky-500 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span>{item.label}</span>
            {activePage === item.key ? (
              <span className="text-xs text-sky-100">Live</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-8 rounded-lg bg-slate-900 p-4 text-sm leading-6 text-slate-300">
        <p className="font-semibold text-slate-100">Team focus</p>
        <p className="mt-3 text-slate-400">
          One place for roofing and painting operations.
        </p>
      </div>
    </aside>
  );
}
