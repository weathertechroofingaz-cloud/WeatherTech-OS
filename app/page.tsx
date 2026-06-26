"use client";

import { useState } from "react";
import { EstimatesPanel } from "../components/EstimatesPanel";
import { FollowUpsPanel } from "../components/FollowUpsPanel";
import { LeadsPanel } from "../components/LeadsPanel";
import NewLeadPanel from "../components/NewLeadPanel";
import { ScopesPanel } from "../components/ScopesPanel";
import { Sidebar, type AppPage } from "../components/Sidebar";
import { SummaryCard } from "../components/SummaryCard";
import { mockData } from "../lib/mockData";

const moduleDetails: Record<
  Exclude<
    AppPage,
    "dashboard" | "leads" | "newLead" | "estimates" | "scope"
  >,
  {
    title: string;
    metric: string;
    primary: string;
    secondary: string;
  }
> = {
  customers: {
    title: "Customers",
    metric: "0 records",
    primary: "No customer profiles yet.",
    secondary: "Qualified leads are ready to become customer records.",
  },
  jobs: {
    title: "Jobs",
    metric: "0 active",
    primary: "No active jobs yet.",
    secondary: "Approved estimates are ready to move into production.",
  },
  scheduling: {
    title: "Scheduling",
    metric: "0 scheduled",
    primary: "No appointments scheduled yet.",
    secondary: "Inspections, production work, and follow-ups will be grouped here.",
  },
  materials: {
    title: "Material Orders",
    metric: "0 open",
    primary: "No open material orders.",
    secondary: "Supplier requests will be tied to jobs and scopes.",
  },
  photos: {
    title: "Photos",
    metric: "0 albums",
    primary: "No job photo albums yet.",
    secondary: "Inspection, progress, and completion photos will be grouped by record.",
  },
  invoices: {
    title: "Invoices",
    metric: "0 outstanding",
    primary: "No outstanding invoices.",
    secondary: "Billing will follow approved estimates and completed jobs.",
  },
  calendar: {
    title: "Calendar",
    metric: "0 events",
    primary: "No calendar events yet.",
    secondary: "Daily and weekly schedules will collect appointments and follow-ups.",
  },
  assistant: {
    title: "AI Assistant",
    metric: "Planning",
    primary: "Assistant workspace is not connected yet.",
    secondary: "Drafts, summaries, and customer messages will stay reviewable before use.",
  },
  settings: {
    title: "Settings",
    metric: "Core setup",
    primary: "Company setup is ready for configuration.",
    secondary: "WeatherTech Roofing LLC and IHC Painting defaults will live here.",
  },
};

export default function Home() {
  const [activePage, setActivePage] = useState<AppPage>("dashboard");

  const renderContent = () => {
    if (activePage === "newLead") {
      return <NewLeadPanel />;
    }

    if (activePage === "leads") {
      return (
        <LeadsPanel
          leads={mockData.leads}
          onCreateLead={() => setActivePage("newLead")}
        />
      );
    }

    if (activePage === "estimates") {
      return <EstimatesPanel estimates={mockData.estimates} />;
    }

    if (activePage === "scope") {
      return <ScopesPanel scopes={mockData.scopes} />;
    }

    if (activePage === "dashboard") {
      return (
        <DashboardContent onCreateLead={() => setActivePage("newLead")} />
      );
    }

    return <ModulePanel {...moduleDetails[activePage]} />;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar activePage={activePage} setActivePage={setActivePage} />

        <main className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

type DashboardContentProps = {
  onCreateLead: () => void;
};

function DashboardContent({ onCreateLead }: DashboardContentProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">
            WeatherTech OS Dashboard
          </h1>
          <p className="mt-2 text-slate-600">
            Roofing and painting operations for WeatherTech Roofing LLC and IHC Painting.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateLead}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          New lead
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Open leads" value={mockData.leads.length} accent="sky" />
        <SummaryCard
          title="Estimates"
          value={mockData.estimates.length}
          accent="emerald"
        />
        <SummaryCard title="Scopes" value={mockData.scopes.length} accent="amber" />
        <SummaryCard
          title="Follow ups"
          value={mockData.followUps.length}
          accent="violet"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <LeadsPanel leads={mockData.leads} onCreateLead={onCreateLead} />
        <FollowUpsPanel followUps={mockData.followUps} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <EstimatesPanel estimates={mockData.estimates} />
        <ScopesPanel scopes={mockData.scopes} />
      </div>
    </div>
  );
}

type ModulePanelProps = {
  title: string;
  metric: string;
  primary: string;
  secondary: string;
};

function ModulePanel({ title, metric, primary, secondary }: ModulePanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
          <p className="mt-2 max-w-2xl text-slate-600">{primary}</p>
        </div>
        <span className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
          {metric}
        </span>
      </div>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
        {secondary}
      </div>
    </section>
  );
}
