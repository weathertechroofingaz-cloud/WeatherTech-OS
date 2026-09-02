import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getSupabaseServiceRoleClient } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret || cronSecret.length < 32) {
    return Response.json(
      { ok: false, error: "Automation scheduler is not configured." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (!matchesBearerSecret(request.headers.get("authorization"), cronSecret)) {
    return Response.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const client = getSupabaseServiceRoleClient();
  if (!client) {
    return Response.json(
      { ok: false, error: "Automation database client is not configured." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  const { data, error } = await client.rpc("wtos_run_automation_worker_v1", {
    p_worker_now: new Date().toISOString(),
    p_batch_size: 25,
  });

  if (error) {
    console.error("Automation worker RPC failed", {
      code: error.code,
      message: error.message,
    });
    return Response.json(
      { ok: false, error: "Automation worker did not complete." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  return Response.json(
    { ok: true, result: data },
    { headers: noStoreHeaders },
  );
}

function matchesBearerSecret(header: string | null, expectedSecret: string) {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const providedSecret = header.slice("Bearer ".length);
  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(expectedSecret);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
