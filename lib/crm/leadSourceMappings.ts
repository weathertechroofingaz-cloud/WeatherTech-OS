import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeIntegrationSyncLogText } from "./integrations";
import type {
  Database,
  LeadSourceMappingProvider,
  LeadSourceMappingRecord,
} from "./types";

type CrmClient = SupabaseClient<Database>;

export type LeadSourceMappingMatchType =
  | "external_source_id"
  | "business_location"
  | "business"
  | "location"
  | "none";

export type ResolveLeadSourceMappingInput = {
  provider: LeadSourceMappingProvider;
  externalSourceId?: string | null;
  business?: string | null;
  location?: string | null;
};

export type LeadSourceMappingResolution = {
  mapping: LeadSourceMappingRecord | null;
  matchType: LeadSourceMappingMatchType;
  warnings: string[];
};

function normalizeToken(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function normalizeExternalSourceId(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function describeSafeError(error: unknown) {
  if (error instanceof Error) {
    return sanitizeIntegrationSyncLogText(error.message) ?? "Mapping lookup failed.";
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return sanitizeIntegrationSyncLogText(message) ?? "Mapping lookup failed.";
    }
  }

  return "Mapping lookup failed.";
}

function createEmptyResolution(
  warnings: string[] = [],
): LeadSourceMappingResolution {
  return {
    mapping: null,
    matchType: "none",
    warnings,
  };
}

function getSingleMapping(
  mappings: LeadSourceMappingRecord[],
  predicate: (mapping: LeadSourceMappingRecord) => boolean,
) {
  const matches = mappings.filter(predicate);

  return matches.length === 1 ? matches[0] : null;
}

export async function resolveLeadSourceMapping(
  client: CrmClient,
  input: ResolveLeadSourceMappingInput,
): Promise<LeadSourceMappingResolution> {
  const { data, error } = await client
    .from("lead_source_mappings")
    .select("*")
    .eq("provider", input.provider)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    return createEmptyResolution([
      `Lead source mapping lookup was skipped: ${describeSafeError(error)}`,
    ]);
  }

  const mappings = (data ?? []) as LeadSourceMappingRecord[];
  const externalSourceId = normalizeExternalSourceId(input.externalSourceId);
  const business = normalizeToken(input.business);
  const location = normalizeToken(input.location);

  if (externalSourceId) {
    const mapping = mappings.find(
      (candidate) =>
        normalizeExternalSourceId(candidate.external_source_id) === externalSourceId,
    );

    if (mapping) {
      return {
        mapping,
        matchType: "external_source_id",
        warnings: [],
      };
    }
  }

  if (business && location) {
    const mapping = mappings.find(
      (candidate) =>
        normalizeToken(candidate.business) === business &&
        normalizeToken(candidate.location) === location,
    );

    if (mapping) {
      return {
        mapping,
        matchType: "business_location",
        warnings: [],
      };
    }
  }

  if (business) {
    const matchingBusinessMappings = mappings.filter(
      (candidate) => normalizeToken(candidate.business) === business,
    );

    if (matchingBusinessMappings.length === 1) {
      return {
        mapping: matchingBusinessMappings[0],
        matchType: "business",
        warnings: [
          "Lead source mapping used business-only fallback because no exact external source or location match was found.",
        ],
      };
    }

    if (matchingBusinessMappings.length > 1) {
      return createEmptyResolution([
        "Lead source mapping was ambiguous for this business. Add an external_source_id or more specific location.",
      ]);
    }
  }

  if (location) {
    const mapping = getSingleMapping(
      mappings,
      (candidate) => normalizeToken(candidate.location) === location,
    );

    if (mapping) {
      return {
        mapping,
        matchType: "location",
        warnings: [
          "Lead source mapping used location-only fallback because no exact external source or business match was found.",
        ],
      };
    }
  }

  return createEmptyResolution();
}
