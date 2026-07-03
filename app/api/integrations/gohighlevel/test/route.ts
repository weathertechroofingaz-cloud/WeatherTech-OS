import { NextRequest, NextResponse } from "next/server";
import { testGoHighLevelConnection } from "../../../../../lib/gohighlevel/serverClient";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const includeReadProbe = request.nextUrl.searchParams.get("probe") === "1";
  const result = await testGoHighLevelConnection({ includeReadProbe });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
  });
}
