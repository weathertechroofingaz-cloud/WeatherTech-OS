import { getRegressionSideEffectSafety } from "../deployment/regressionSafety";

export const PROPOSAL_SIGNING_REGRESSION_PROJECT_REF = "hygtnhmmaoboduqghhwg";
export const PROPOSAL_SIGNING_REGRESSION_MARKER_PREFIX =
  "TEST WTOS PROPOSAL SIGNING";
export const PROPOSAL_SIGNING_REGRESSION_DEFAULT_REQUEST_EXPIRES_IN_MS =
  24 * 60 * 60 * 1000;
const PROPOSAL_SIGNING_REGRESSION_MIN_REQUEST_EXPIRES_IN_MS = 5_000;
const PROPOSAL_SIGNING_REGRESSION_MAX_REQUEST_EXPIRES_IN_MS = 15_000;

function isLoopbackHostname(value: string) {
  return value === "localhost" || value === "127.0.0.1" || value === "[::1]";
}

/**
 * This is deliberately stricter than the ordinary browser-regression guard.
 * The synthetic delivery boundary exists only on a locally served application
 * connected to the one fixed non-production project with every provider gate
 * disabled. It is unreachable on Vercel and fails closed on missing settings.
 */
export function proposalSigningRegressionBoundaryIsEnabled({
  requestOrigin,
  env = process.env,
}: {
  requestOrigin: string;
  env?: Record<string, string | undefined>;
}) {
  let requestUrl: URL;
  let supabaseUrl: URL;
  try {
    requestUrl = new URL(requestOrigin);
    supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  } catch {
    return false;
  }

  return (
    isLoopbackHostname(requestUrl.hostname.toLowerCase()) &&
    env.VERCEL !== "1" &&
    supabaseUrl.protocol === "https:" &&
    supabaseUrl.origin ===
      `https://${PROPOSAL_SIGNING_REGRESSION_PROJECT_REF}.supabase.co` &&
    supabaseUrl.pathname === "/" &&
    env.WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF?.trim().toLowerCase() ===
      PROPOSAL_SIGNING_REGRESSION_PROJECT_REF &&
    env.WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED === "true" &&
    env.NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK === "true" &&
    getRegressionSideEffectSafety(env) === "disabled"
  );
}

export function buildProposalSigningRegressionMarker(runId: string) {
  if (!/^\d{17}$/.test(runId)) {
    throw new Error("Proposal signing regression requires an exact 17-digit run ID.");
  }
  return `${PROPOSAL_SIGNING_REGRESSION_MARKER_PREFIX} ${runId}`;
}

export function resolveProposalSigningRegressionRequestExpiresInMs(
  value: unknown,
) {
  if (value === undefined) {
    return PROPOSAL_SIGNING_REGRESSION_DEFAULT_REQUEST_EXPIRES_IN_MS;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < PROPOSAL_SIGNING_REGRESSION_MIN_REQUEST_EXPIRES_IN_MS ||
    value > PROPOSAL_SIGNING_REGRESSION_MAX_REQUEST_EXPIRES_IN_MS
  ) {
    return null;
  }
  return value;
}
