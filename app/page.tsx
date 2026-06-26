"use client";

import { useState } from "react";
import { Sidebar } from "../components/Sidebar";
import NewLeadPanel from "../components/NewLeadPanel";

export default function Home() {
  const [activePage, setActivePage] = useState("dashboard");

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar activePage={activePage} setActivePage={setActivePage} />

        <main className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {activePage === "newLead" ? (
            <NewLeadPanel />
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-slate-950">
                WeatherTech OS Dashboard
              </h1>
              <p className="mt-4 text-slate-600">
                Click New Lead in the sidebar to open the lead form.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
