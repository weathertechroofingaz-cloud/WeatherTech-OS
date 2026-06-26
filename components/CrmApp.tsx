"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Home,
  LogOut,
  Mail,
  Paintbrush,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  convertLeadToCustomer,
  createCustomer,
  createLead,
  fetchCrmSnapshot,
  updateCustomer,
  updateLead,
} from "../lib/crm/repository";
import { calculateDashboardMetrics } from "../lib/crm/metrics";
import type {
  CompanyRecord,
  CrmSnapshot,
  CustomerRecord,
  CustomerStatus,
  CustomerType,
  Database,
  LeadPriority,
  LeadRecord,
  LeadStatus,
  ServiceType,
} from "../lib/crm/types";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type CrmClient = SupabaseClient<Database> | null;
type WorkspaceView = "dashboard" | "leads" | "customers" | "settings";

const leadStatuses: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "estimate_sent", label: "Estimate sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const leadPriorities: { value: LeadPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const serviceTypes: { value: ServiceType; label: string }[] = [
  { value: "roofing", label: "Roofing" },
  { value: "painting", label: "Painting" },
  { value: "both", label: "Both" },
];

const customerTypes: { value: CustomerType; label: string }[] = [
  { value: "homeowner", label: "Homeowner" },
  { value: "commercial", label: "Commercial" },
  { value: "hoa", label: "HOA" },
  { value: "property_manager", label: "Property manager" },
];

const customerStatuses: { value: CustomerStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "prospect", label: "Prospect" },
];

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function getFormString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = getFormString(formData, key);
  return value || null;
}

function getFormNumber(formData: FormData, key: string) {
  const value = getFormString(formData, key).replace(/[^0-9.]/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(status: LeadStatus) {
  return leadStatuses.find((item) => item.value === status)?.label ?? status;
}

function customerStatusLabel(status: CustomerStatus) {
  return customerStatuses.find((item) => item.value === status)?.label ?? status;
}

function serviceLabel(service: ServiceType) {
  return serviceTypes.find((item) => item.value === service)?.label ?? service;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function CrmApp() {
  const [client] = useState(() => getSupabaseBrowserClient());
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(client === null);
  const [snapshot, setSnapshot] = useState<CrmSnapshot | null>(null);
  const [view, setView] = useState<WorkspaceView>("dashboard");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const isDemoMode = client === null;

  const loadSnapshot = useCallback(async (crmClient: CrmClient = client) => {
    setIsLoading(true);
    setError("");

    try {
      const nextSnapshot = await fetchCrmSnapshot(crmClient);
      setSnapshot(nextSnapshot);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to load CRM records.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!client) {
      queueMicrotask(() => {
        void loadSnapshot(null);
      });
      return;
    }

    let isMounted = true;

    client.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      const activeUser = data.session?.user ?? null;
      setUser(activeUser);
      setAuthReady(true);

      if (activeUser) {
        void loadSnapshot(client);
      } else {
        setIsLoading(false);
      }
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      const activeUser = session?.user ?? null;
      setUser(activeUser);

      if (activeUser) {
        void loadSnapshot(client);
      } else {
        setSnapshot(null);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [client, loadSnapshot]);

  const handleAuthNotice = (message: string) => {
    setNotice(message);
    setError("");
  };

  const handleSignOut = async () => {
    if (!client) {
      return;
    }

    await client.auth.signOut();
    setNotice("Signed out.");
    setView("dashboard");
  };

  if (!authReady) {
    return <LoadingScreen label="Preparing WeatherTech OS" />;
  }

  if (client && !user) {
    return (
      <AuthScreen client={client} notice={notice} onNotice={handleAuthNotice} />
    );
  }

  if (!snapshot || isLoading) {
    return <LoadingScreen label="Loading CRM workspace" />;
  }

  return (
    <CrmWorkspace
      client={client}
      isDemoMode={isDemoMode}
      notice={notice}
      error={error}
      snapshot={snapshot}
      user={user}
      view={view}
      onViewChange={setView}
      onReload={() => loadSnapshot(client)}
      onSignOut={handleSignOut}
      onNotice={setNotice}
      onError={setError}
    />
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700 shadow-sm">
        {label}
      </div>
    </main>
  );
}

type AuthScreenProps = {
  client: SupabaseClient<Database>;
  notice: string;
  onNotice: (message: string) => void;
};

function AuthScreen({ client, notice, onNotice }: AuthScreenProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = getFormString(formData, "email");
    const password = getFormString(formData, "password");

    const result =
      mode === "sign-in"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === "sign-up" && !result.data.session) {
      onNotice("Check your email to confirm your account.");
    } else {
      onNotice("Signed in.");
    }

    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-48px)] max-w-5xl place-items-center">
        <section className="grid w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_420px]">
          <div className="bg-slate-950 p-8 text-white sm:p-10">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-500 font-bold">
                WT
              </div>
              <div>
                <p className="text-sm font-semibold uppercase text-sky-300">
                  WeatherTech OS
                </p>
                <p className="text-sm text-slate-300">Roofing and painting CRM</p>
              </div>
            </div>
            <h1 className="mt-12 max-w-xl text-4xl font-bold">
              Sign in to manage leads, customers, and pipeline activity.
            </h1>
            <div className="mt-8 grid gap-3 text-sm text-slate-300">
              <AuthPoint label="Supabase authentication" />
              <AuthPoint label="Protected CRM records" />
              <AuthPoint label="Dashboard metrics and follow-ups" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">
                {mode === "sign-in" ? "Welcome back" : "Create account"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {mode === "sign-in"
                  ? "Use your WeatherTech OS account."
                  : "Create a Supabase Auth user for this workspace."}
              </p>
            </div>

            {notice ? <Message tone="success" message={notice} /> : null}
            {error ? <Message tone="error" message={error} /> : null}

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Email
                <input
                  required
                  name="email"
                  type="email"
                  className="rounded-md border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="you@weathertech.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Password
                <input
                  required
                  minLength={6}
                  name="password"
                  type="password"
                  className="rounded-md border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="At least 6 characters"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSubmitting
                ? "Working"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError("");
              }}
              className="mt-4 text-sm font-semibold text-sky-700 hover:text-sky-800"
            >
              {mode === "sign-in"
                ? "Create a new account"
                : "Sign in with an existing account"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function AuthPoint({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
      <span>{label}</span>
    </div>
  );
}

type CrmWorkspaceProps = {
  client: CrmClient;
  isDemoMode: boolean;
  notice: string;
  error: string;
  snapshot: CrmSnapshot;
  user: User | null;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  onReload: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function CrmWorkspace({
  client,
  isDemoMode,
  notice,
  error,
  snapshot,
  user,
  view,
  onViewChange,
  onReload,
  onSignOut,
  onNotice,
  onError,
}: CrmWorkspaceProps) {
  const metrics = useMemo(() => calculateDashboardMetrics(snapshot), [snapshot]);
  const companyMap = useMemo(
    () => new Map(snapshot.companies.map((company) => [company.id, company])),
    [snapshot.companies],
  );

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-6">
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm xl:min-h-[calc(100vh-48px)]">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-500 font-bold">
              WT
            </div>
            <div>
              <p className="text-sm font-semibold uppercase text-sky-300">
                WeatherTech
              </p>
              <p className="text-sm text-slate-300">Operations CRM</p>
            </div>
          </div>

          <nav className="mt-5 grid gap-1">
            <NavButton
              icon={Home}
              label="Dashboard"
              isActive={view === "dashboard"}
              onClick={() => onViewChange("dashboard")}
            />
            <NavButton
              icon={ClipboardList}
              label="Leads"
              isActive={view === "leads"}
              onClick={() => onViewChange("leads")}
            />
            <NavButton
              icon={Users}
              label="Customers"
              isActive={view === "customers"}
              onClick={() => onViewChange("customers")}
            />
            <NavButton
              icon={Building2}
              label="Settings"
              isActive={view === "settings"}
              onClick={() => onViewChange("settings")}
            />
          </nav>

          <div className="mt-6 rounded-lg bg-slate-900 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">
              {isDemoMode ? "Demo mode" : "Supabase connected"}
            </p>
            <p className="mt-2">
              {isDemoMode
                ? "Add Supabase env vars to enable auth and persistent CRM data."
                : user?.email}
            </p>
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-sky-700">
                WeatherTech OS
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                Roofing and painting CRM
              </h1>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <button
                type="button"
                onClick={() => void onReload()}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
              {!isDemoMode ? (
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              ) : null}
            </div>
          </header>

          {notice ? <Message tone="success" message={notice} /> : null}
          {error ? <Message tone="error" message={error} /> : null}

          {view === "dashboard" ? (
            <DashboardView
              metrics={metrics}
              snapshot={snapshot}
              companyMap={companyMap}
              onCreateLead={() => onViewChange("leads")}
            />
          ) : null}

          {view === "leads" ? (
            <LeadsView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "customers" ? (
            <CustomersView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "settings" ? (
            <SettingsView snapshot={snapshot} isDemoMode={isDemoMode} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

type NavButtonProps = {
  icon: typeof Home;
  label: string;
  isActive: boolean;
  onClick: () => void;
};

function NavButton({ icon: Icon, label, isActive, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition ${
        isActive
          ? "bg-sky-500 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {isActive ? <ChevronRight className="h-4 w-4" /> : null}
    </button>
  );
}

type DashboardViewProps = {
  metrics: ReturnType<typeof calculateDashboardMetrics>;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onCreateLead: () => void;
};

function DashboardView({
  metrics,
  snapshot,
  companyMap,
  onCreateLead,
}: DashboardViewProps) {
  const urgentLeads = snapshot.leads.filter(
    (lead) => lead.priority === "urgent" || lead.next_follow_up === todayIsoDate(),
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open leads" value={metrics.openLeads} icon={ClipboardList} />
        <MetricCard
          label="Pipeline value"
          value={formatMoney(metrics.pipelineValue)}
          icon={DollarSign}
        />
        <MetricCard label="Customers" value={metrics.customers} icon={Users} />
        <MetricCard
          label="Urgent follow-ups"
          value={metrics.urgentFollowUps}
          icon={CalendarClock}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Lead pipeline</h2>
              <p className="mt-1 text-sm text-slate-500">
                Active opportunities by status.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateLead}
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              New lead
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {leadStatuses.slice(0, 4).map((status) => {
              const leads = snapshot.leads.filter((lead) => lead.status === status.value);
              const value = leads.reduce((total, lead) => total + lead.estimated_value, 0);

              return (
                <div
                  key={status.value}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-600">{status.label}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="text-3xl font-bold text-slate-950">{leads.length}</p>
                    <p className="text-sm font-semibold text-slate-700">
                      {formatMoney(value)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Priority queue</h2>
          <div className="mt-4 space-y-3">
            {urgentLeads.length ? (
              urgentLeads.map((lead) => (
                <LeadMiniCard
                  key={lead.id}
                  lead={lead}
                  company={companyMap.get(lead.company_id)}
                />
              ))
            ) : (
              <EmptyState label="No urgent follow-ups." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string | number;
  icon: typeof Home;
};

function MetricCard({ label, value, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <Icon className="h-5 w-5 text-sky-600" />
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

type LeadsViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function LeadsView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: LeadsViewProps) {
  const [selectedLeadId, setSelectedLeadId] = useState(snapshot.leads[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [isCreating, setIsCreating] = useState(false);

  const selectedLead =
    snapshot.leads.find((lead) => lead.id === selectedLeadId) ?? snapshot.leads[0];

  const filteredLeads = snapshot.leads.filter((lead) => {
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      lead.contact_name.toLowerCase().includes(query) ||
      lead.property_address.toLowerCase().includes(query) ||
      lead.source.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setIsCreating(true);
    onError("");

    try {
      const formData = new FormData(form);
      await createLead(client, {
        company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
        contact_name: getFormString(formData, "contact_name"),
        phone: getOptionalFormString(formData, "phone"),
        email: getOptionalFormString(formData, "email"),
        property_address: getFormString(formData, "property_address"),
        city: getOptionalFormString(formData, "city"),
        state: getFormString(formData, "state", "AZ"),
        postal_code: getOptionalFormString(formData, "postal_code"),
        service_type: getFormString(formData, "service_type", "roofing") as ServiceType,
        source: getFormString(formData, "source", "Website"),
        priority: getFormString(formData, "priority", "normal") as LeadPriority,
        estimated_value: getFormNumber(formData, "estimated_value"),
        next_follow_up: getOptionalFormString(formData, "next_follow_up"),
        notes: getOptionalFormString(formData, "notes"),
      });
      form.reset();
      await onReload();
      onNotice("Lead created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to create lead.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedLead) {
      return;
    }

    try {
      const formData = new FormData(event.currentTarget);
      await updateLead(client, selectedLead.id, {
        status: getFormString(formData, "status", selectedLead.status) as LeadStatus,
        priority: getFormString(
          formData,
          "priority",
          selectedLead.priority,
        ) as LeadPriority,
        estimated_value: getFormNumber(formData, "estimated_value"),
        next_follow_up: getOptionalFormString(formData, "next_follow_up"),
        notes: getOptionalFormString(formData, "notes"),
      });
      await onReload();
      onNotice("Lead updated.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to update lead.",
      );
    }
  };

  const handleConvertLead = async () => {
    if (!selectedLead) {
      return;
    }

    try {
      await convertLeadToCustomer(client, selectedLead);
      await onReload();
      onNotice("Lead converted to customer.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to convert lead.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Leads CRM</h2>
              <p className="mt-1 text-sm text-slate-500">
                Intake, qualify, follow up, and convert opportunities.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72"
                  placeholder="Search leads"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as LeadStatus | "all")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="all">All statuses</option>
                {leadStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredLeads.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => setSelectedLeadId(lead.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[1fr_120px_130px_120px] lg:items-center ${
                selectedLead?.id === lead.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">{lead.contact_name}</p>
                <p className="mt-1 text-sm text-slate-500">{lead.property_address}</p>
              </div>
              <Badge label={statusLabel(lead.status)} tone="blue" />
              <span className="text-sm text-slate-600">
                {companyMap.get(lead.company_id)?.name ?? "Company"}
              </span>
              <span className="text-sm font-semibold text-slate-950">
                {formatMoney(lead.estimated_value)}
              </span>
            </button>
          ))}

          {!filteredLeads.length ? <EmptyState label="No leads match this view." /> : null}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">New lead</h3>
          <LeadCreateForm
            companies={snapshot.companies}
            isSubmitting={isCreating}
            onSubmit={handleCreateLead}
          />
        </section>

        {selectedLead ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  {selectedLead.contact_name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {serviceLabel(selectedLead.service_type)} lead from {selectedLead.source}
                </p>
              </div>
              <Badge label={selectedLead.priority} tone="amber" />
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <ContactLine icon={Phone} value={selectedLead.phone} />
              <ContactLine icon={Mail} value={selectedLead.email} />
              <ContactLine icon={Building2} value={selectedLead.property_address} />
            </div>

            <form onSubmit={handleUpdateLead} className="mt-5 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Status
                  <select
                    name="status"
                    defaultValue={selectedLead.status}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {leadStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Priority
                  <select
                    name="priority"
                    defaultValue={selectedLead.priority}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {leadPriorities.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Value
                  <input
                    name="estimated_value"
                    defaultValue={selectedLead.estimated_value}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Follow-up
                  <input
                    name="next_follow_up"
                    type="date"
                    defaultValue={selectedLead.next_follow_up ?? ""}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Notes
                <textarea
                  name="notes"
                  defaultValue={selectedLead.notes ?? ""}
                  className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Save lead
                </button>
                <button
                  type="button"
                  onClick={() => void handleConvertLead()}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Convert
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

type LeadCreateFormProps = {
  companies: CompanyRecord[];
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function LeadCreateForm({ companies, isSubmitting, onSubmit }: LeadCreateFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Company
        <select
          name="company_id"
          required
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </label>
      <input
        required
        name="contact_name"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Lead or customer name"
      />
      <input
        required
        name="property_address"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Property address"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="phone"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Phone"
        />
        <input
          name="email"
          type="email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Email"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="city"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="City"
        />
        <input
          name="state"
          defaultValue="AZ"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="State"
        />
        <input
          name="postal_code"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="ZIP"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="service_type"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {serviceTypes.map((service) => (
            <option key={service.value} value={service.value}>
              {service.label}
            </option>
          ))}
        </select>
        <select
          name="priority"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {leadPriorities.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="source"
          defaultValue="Website"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Lead source"
        />
        <input
          name="estimated_value"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Estimated value"
        />
      </div>
      <input
        name="next_follow_up"
        type="date"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        name="notes"
        className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Notes"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Plus className="h-4 w-4" />
        {isSubmitting ? "Saving" : "Create lead"}
      </button>
    </form>
  );
}

type CustomersViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function CustomersView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: CustomersViewProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    snapshot.customers[0]?.id ?? "",
  );
  const [search, setSearch] = useState("");
  const selectedCustomer =
    snapshot.customers.find((customer) => customer.id === selectedCustomerId) ??
    snapshot.customers[0];

  const filteredCustomers = snapshot.customers.filter((customer) => {
    const query = search.toLowerCase();
    return (
      !query ||
      customer.display_name.toLowerCase().includes(query) ||
      customer.contact_name.toLowerCase().includes(query) ||
      customer.property_address.toLowerCase().includes(query)
    );
  });

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    onError("");

    try {
      const formData = new FormData(form);
      await createCustomer(client, {
        company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
        display_name: getFormString(formData, "display_name"),
        contact_name: getFormString(formData, "contact_name"),
        phone: getOptionalFormString(formData, "phone"),
        email: getOptionalFormString(formData, "email"),
        property_address: getFormString(formData, "property_address"),
        city: getOptionalFormString(formData, "city"),
        state: getFormString(formData, "state", "AZ"),
        postal_code: getOptionalFormString(formData, "postal_code"),
        customer_type: getFormString(
          formData,
          "customer_type",
          "homeowner",
        ) as CustomerType,
        status: getFormString(formData, "status", "active") as CustomerStatus,
        notes: getOptionalFormString(formData, "notes"),
      });
      form.reset();
      await onReload();
      onNotice("Customer created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to create customer.",
      );
    }
  };

  const handleUpdateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedCustomer) {
      return;
    }

    try {
      const formData = new FormData(event.currentTarget);
      await updateCustomer(client, selectedCustomer.id, {
        status: getFormString(
          formData,
          "status",
          selectedCustomer.status,
        ) as CustomerStatus,
        customer_type: getFormString(
          formData,
          "customer_type",
          selectedCustomer.customer_type,
        ) as CustomerType,
        notes: getOptionalFormString(formData, "notes"),
      });
      await onReload();
      onNotice("Customer updated.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to update customer.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Customer management
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Profiles, contacts, properties, and account status.
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-80"
                placeholder="Search customers"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => setSelectedCustomerId(customer.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[1fr_130px_140px] lg:items-center ${
                selectedCustomer?.id === customer.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">
                  {customer.display_name}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {customer.property_address}
                </p>
              </div>
              <Badge label={customerStatusLabel(customer.status)} tone="green" />
              <span className="text-sm text-slate-600">
                {companyMap.get(customer.company_id)?.name ?? "Company"}
              </span>
            </button>
          ))}

          {!filteredCustomers.length ? (
            <EmptyState label="No customers match this view." />
          ) : null}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">New customer</h3>
          <CustomerCreateForm companies={snapshot.companies} onSubmit={handleCreateCustomer} />
        </section>

        {selectedCustomer ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">
              {selectedCustomer.display_name}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {selectedCustomer.contact_name}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <ContactLine icon={Phone} value={selectedCustomer.phone} />
              <ContactLine icon={Mail} value={selectedCustomer.email} />
              <ContactLine icon={Building2} value={selectedCustomer.property_address} />
            </div>

            <form onSubmit={handleUpdateCustomer} className="mt-5 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Status
                  <select
                    name="status"
                    defaultValue={selectedCustomer.status}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {customerStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Type
                  <select
                    name="customer_type"
                    defaultValue={selectedCustomer.customer_type}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {customerTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Notes
                <textarea
                  name="notes"
                  defaultValue={selectedCustomer.notes ?? ""}
                  className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save customer
              </button>
            </form>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

type CustomerCreateFormProps = {
  companies: CompanyRecord[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function CustomerCreateForm({ companies, onSubmit }: CustomerCreateFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <select
        name="company_id"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      <input
        required
        name="display_name"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Customer display name"
      />
      <input
        required
        name="contact_name"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Primary contact"
      />
      <input
        required
        name="property_address"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Property address"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="phone"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Phone"
        />
        <input
          name="email"
          type="email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Email"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="city"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="City"
        />
        <input
          name="state"
          defaultValue="AZ"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="State"
        />
        <input
          name="postal_code"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="ZIP"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="customer_type"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {customerTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <select
          name="status"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {customerStatuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="notes"
        className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Notes"
      />
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        <Plus className="h-4 w-4" />
        Create customer
      </button>
    </form>
  );
}

function SettingsView({
  snapshot,
  isDemoMode,
}: {
  snapshot: CrmSnapshot;
  isDemoMode: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">Settings</h2>
      <p className="mt-1 text-sm text-slate-500">
        Company records and environment status.
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {snapshot.companies.map((company) => (
          <div key={company.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              {company.trade === "painting" ? (
                <Paintbrush className="h-5 w-5 text-sky-600" />
              ) : (
                <Home className="h-5 w-5 text-sky-600" />
              )}
              <div>
                <p className="font-semibold text-slate-950">{company.name}</p>
                <p className="text-sm capitalize text-slate-500">{company.trade}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        {isDemoMode
          ? "Supabase environment variables are not configured in this workspace."
          : "Supabase environment variables are configured."}
      </div>
    </section>
  );
}

function LeadMiniCard({
  lead,
  company,
}: {
  lead: LeadRecord;
  company?: CompanyRecord;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{lead.contact_name}</p>
          <p className="mt-1 text-sm text-slate-500">{company?.name}</p>
        </div>
        <Badge label={lead.priority} tone="amber" />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-500">{lead.next_follow_up ?? "No date"}</span>
        <span className="font-semibold text-slate-950">
          {formatMoney(lead.estimated_value)}
        </span>
      </div>
    </div>
  );
}

function ContactLine({
  icon: Icon,
  value,
}: {
  icon: typeof Phone;
  value: string | null;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <span>{value}</span>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "blue" | "green" | "amber" }) {
  const toneClass = {
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-sky-100 text-sky-800",
    green: "bg-emerald-100 text-emerald-800",
  }[tone];

  return (
    <span
      className={`inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${toneClass}`}
    >
      {label.replace("_", " ")}
    </span>
  );
}

function Message({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div
      className={`mt-4 rounded-md border px-4 py-3 text-sm font-medium ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {message}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="p-6 text-center text-sm font-medium text-slate-500">{label}</div>
  );
}
