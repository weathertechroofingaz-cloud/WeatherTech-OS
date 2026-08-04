import { NextResponse } from "next/server";
import { buildPrivateStagingHealthReport } from "../../../lib/deployment/stagingReadiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(buildPrivateStagingHealthReport({ env: process.env }), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
