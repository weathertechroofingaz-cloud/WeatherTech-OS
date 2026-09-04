import { NextResponse } from "next/server";
import { goHighLevelReadinessEndpoint } from "../../../../../lib/gohighlevel/foundation";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      operational: false,
      readinessEndpoint: goHighLevelReadinessEndpoint,
      message:
        "Legacy GoHighLevel private-token diagnostics are retired. Signed-in company owners should use the Marketplace OAuth readiness endpoint.",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
