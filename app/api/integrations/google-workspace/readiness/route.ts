import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  getGoogleWorkspaceReadinessSummary,
  summarizeGmailConnection,
} from "../../../../../lib/googleWorkspace/serverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkSchemaReadiness() {
  const client = await getSupabaseServerClient();

  if (!client) {
    return {
      schemaApplied: null,
      connectedMailboxCount: 0,
      mailboxes: [],
    };
  }

  const { data: userResult } = await client.auth.getUser();

  if (!userResult.user) {
    return {
      schemaApplied: null,
      connectedMailboxCount: 0,
      mailboxes: [],
    };
  }

  const [{ error: threadsError }, { data: connections }] = await Promise.all([
    client.from("gmail_email_threads").select("id", { count: "exact", head: true }),
    client
      .from("integration_connections")
      .select("*")
      .eq("provider", "gmail")
      .order("updated_at", { ascending: false }),
  ]);
  const mailboxes = (connections ?? []).map(summarizeGmailConnection);

  return {
    schemaApplied: !threadsError,
    connectedMailboxCount: mailboxes.length,
    mailboxes,
  };
}

export async function GET() {
  const schema = await checkSchemaReadiness();

  return NextResponse.json({
    ...getGoogleWorkspaceReadinessSummary(schema),
    mailboxes: schema.mailboxes,
  });
}
