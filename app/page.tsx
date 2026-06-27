import dynamic from "next/dynamic";

const CrmApp = dynamic(
  () => import("../components/CrmApp").then((module) => module.CrmApp),
  {
    loading: () => (
      <main className="min-h-screen bg-slate-50 px-6 py-8">
        <section className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="h-10 w-56 rounded-lg wt-skeleton" />
          <div className="grid gap-4 md:grid-cols-4">
            {["pipeline", "revenue", "production", "profit"].map((item) => (
              <div
                key={item}
                className="h-32 rounded-lg border border-slate-200 bg-white wt-skeleton"
              />
            ))}
          </div>
          <div className="h-[520px] rounded-lg border border-slate-200 bg-white wt-skeleton" />
        </section>
      </main>
    ),
  },
);

export default function Home() {
  return <CrmApp />;
}
