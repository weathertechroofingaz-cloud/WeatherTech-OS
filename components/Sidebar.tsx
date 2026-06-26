const navItems = [
  { label: "Dashboard", key: "dashboard" },
  { label: "New Lead", key: "newLead" },
  { label: "Customers", key: "customers" },
  { label: "Estimates", key: "estimates" },
  { label: "Scope of Work", key: "scope" },
  { label: "Jobs", key: "jobs" },
  { label: "Inspections", key: "inspections" },
  { label: "Material Orders", key: "materials" },
  { label: "Invoices", key: "invoices" },
  { label: "Photos", key: "photos" },
  { label: "Calendar", key: "calendar" },
  { label: "Settings", key: "settings" },
];

type SidebarProps = {
  activePage: string;
  setActivePage: (page: string) => void;
};

export function Sidebar({ activePage, setActivePage }: SidebarProps) {
  return (
    <aside className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-500 text-white font-bold">
          WT
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-sky-300">
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
  className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition ${
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

      <div className="mt-8 rounded-3xl bg-slate-900 p-5 text-sm leading-6 text-slate-300">
        <p className="font-semibold text-slate-100">Team focus</p>
        <p className="mt-3 text-slate-400">
          One place for roofing and painting operations.
        </p>
      </div>
    </aside>
  );
}