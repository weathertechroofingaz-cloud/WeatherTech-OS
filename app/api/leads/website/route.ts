import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getLeadIntakeHttpStatus,
  normalizeWebsiteLeadBody,
  processLeadIntake,
  type LeadIntakeResponse,
  type WebsiteLeadRequestBody,
} from "../../../../lib/crm/leadIntake";
import { sanitizeIntegrationSyncLogText } from "../../../../lib/crm/integrations";
import type { Database } from "../../../../lib/crm/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;

type WebsiteLeadResponse = LeadIntakeResponse & {
  route?: "/api/leads/website";
  accepts?: "POST";
};

function getServiceSupabaseClient(): CrmClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function createJsonResponse(body: WebsiteLeadResponse, status = 200) {
  return NextResponse.json(body, { status });
}

function describeSafeError(error: unknown) {
  if (error instanceof Error) {
    return sanitizeIntegrationSyncLogText(error.message) ?? "Request failed.";
  }

  if (typeof error === "string") {
    return sanitizeIntegrationSyncLogText(error) ?? "Request failed.";
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return sanitizeIntegrationSyncLogText(message) ?? "Request failed.";
    }
  }

  return "Request failed.";
}

async function getJsonBody(
  request: NextRequest,
): Promise<{ body: WebsiteLeadRequestBody | null; error: string | null }> {
  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object" && !Array.isArray(body)) {
      return { body: body as WebsiteLeadRequestBody, error: null };
    }

    return { body: null, error: "Request body must be a JSON object." };
  } catch {
    return { body: null, error: "Request body must be valid JSON." };
  }
}

export async function GET() {
  return createJsonResponse({
    ok: true,
    route: "/api/leads/website",
    accepts: "POST",
    status: "healthy",
    warnings: [],
  });
}

export async function POST(request: NextRequest) {
  const { body, error: jsonError } = await getJsonBody(request);

  if (!body) {
    return createJsonResponse(
      {
        ok: false,
        route: "/api/leads/website",
        status: "invalid_json",
        warnings: [jsonError ?? "Request body must be valid JSON."],
      },
      400,
    );
  }

  const normalized = normalizeWebsiteLeadBody(body);

  if (!normalized.lead) {
    return createJsonResponse(
      {
        ok: false,
        route: "/api/leads/website",
        status: "validation_failed",
        warnings: [...normalized.warnings, ...normalized.errors],
      },
      400,
    );
  }

  const client = getServiceSupabaseClient();

  if (!client) {
    return createJsonResponse(
      {
        ok: false,
        route: "/api/leads/website",
        status: "crm_not_configured",
        warnings: [
          "Supabase service-role access is not configured, so website lead intake cannot create CRM leads yet.",
        ],
      },
      503,
    );
  }

  try {
    const result = await processLeadIntake(client, normalized.lead);

    return createJsonResponse(
      {
        route: "/api/leads/website",
        ...result,
      },
      getLeadIntakeHttpStatus(result),
    );
  } catch (error) {
    const message = describeSafeError(error);

    console.error("[CRM] Website lead intake failed", { message });

    return createJsonResponse(
      {
        ok: false,
        route: "/api/leads/website",
        provider: "website",
        status: "error",
        warnings: [message],
      },
      500,
    );
  }
}
