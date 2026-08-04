import { NextResponse } from "next/server";
import { buildPrivateStagingReadinessReport } from "../../../lib/deployment/stagingReadiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const report = await buildPrivateStagingReadinessReport({
    env: process.env,
    fetchImpl: fetch,
  });

  return NextResponse.json(report, {
    status: report.status === "blocked" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
