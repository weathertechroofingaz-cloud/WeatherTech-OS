import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      retired: true,
      dryRun: false,
      communicationsSent: false,
      automationTriggered: false,
      message:
        "The legacy private-token HighLevel lead dry run is retired. Use the company-scoped Marketplace OAuth readiness and inbound sync controls.",
      replacement: "/api/integrations/gohighlevel/readiness",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
