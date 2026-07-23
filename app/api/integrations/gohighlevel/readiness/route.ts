import { NextRequest, NextResponse } from "next/server";
import {
  goHighLevelSyncFoundationMigration,
  goHighLevelSyncResources,
} from "../../../../../lib/gohighlevel/foundation";
import { validateGoHighLevelAccountReadiness } from "../../../../../lib/gohighlevel/serverClient";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type SchemaTableCheck = {
  table: "gohighlevel_sync_mappings" | "gohighlevel_discovery_snapshots";
  available: boolean;
  message: string;
};

async function checkGoHighLevelSchemaReadiness() {
  const client = await getSupabaseServerClient();
  const checks: SchemaTableCheck[] = [];

  if (!client) {
    return {
      checked: false,
      applied: null as boolean | null,
      migration: goHighLevelSyncFoundationMigration,
      tables: checks,
      message:
        "Supabase server access is not configured, so schema readiness could not be checked.",
    };
  }

  for (const table of [
    "gohighlevel_sync_mappings",
    "gohighlevel_discovery_snapshots",
  ] as const) {
    const { error } = await client
      .from(table)
      .select("id", { count: "exact", head: true });

    checks.push({
      table,
      available: !error,
      message: error
        ? "Table is not available to this session yet."
        : "Table is available.",
    });
  }

  const applied = checks.every((check) => check.available);

  return {
    checked: true,
    applied,
    migration: goHighLevelSyncFoundationMigration,
    tables: checks,
    message: applied
      ? "GoHighLevel sync foundation tables are available."
      : "Apply the prepared GoHighLevel sync foundation migration before enabling live sync workers.",
  };
}

export async function GET(request: NextRequest) {
  const includeReadProbe = request.nextUrl.searchParams.get("probe") === "1";
  const includePipelineProbe = request.nextUrl.searchParams.get("pipelines") === "1";
  const schema = await checkGoHighLevelSchemaReadiness();
  const result = await validateGoHighLevelAccountReadiness({
    includeReadProbe,
    includePipelineProbe,
    schemaApplied: schema.applied,
  });

  return NextResponse.json({
    ...result,
    schema,
    syncResourceCount: goHighLevelSyncResources.length,
  });
}
