import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getLeadIntakeHttpStatus,
  retryLeadIntake,
  type LeadIntakeResponse,
} from "../../../../../lib/crm/leadIntake";
import { sanitizeIntegrationSyncLogText } from "../../../../../lib/crm/integrations";
import type { Database } from "../../../../../lib/crm/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;

type LeadIntakeRetryBody = {
  syncLogId?: unknown;
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

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
): Promise<{ body: LeadIntakeRetryBody | null; error: string | null }> {
  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object" && !Array.isArray(body)) {
      return { body: body as LeadIntakeRetryBody, error: null };
    }

    return { body: null, error: "Request body must be a JSON object." };
  } catch {
    return { body: null, error: "Request body must be valid JSON." };
  }
}

function createJsonResponse(body: LeadIntakeResponse, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const { body, error: jsonError } = await getJsonBody(request);
  const syncLogId = body ? getString(body.syncLogId) : null;

  if (!body || !syncLogId) {
    return createJsonResponse(
      {
        ok: false,
        status: "validation_failed",
        warnings: [jsonError ?? "A retry syncLogId is required."],
      },
      400,
    );
  }

  const client = getServiceSupabaseClient();

  if (!client) {
    return createJsonResponse(
      {
        ok: false,
        status: "crm_not_configured",
        warnings: [
          "Supabase service-role access is not configured, so lead intake retry cannot run yet.",
        ],
      },
      503,
    );
  }

  try {
    const result = await retryLeadIntake(client, syncLogId);

    return createJsonResponse(result, getLeadIntakeHttpStatus(result));
  } catch (error) {
    const message = describeSafeError(error);

    console.error("[CRM] Lead intake retry failed", { message });

    return createJsonResponse(
      {
        ok: false,
        status: "error",
        warnings: [message],
      },
      500,
    );
  }
}
