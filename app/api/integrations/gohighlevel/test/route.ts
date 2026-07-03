import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GOHIGHLEVEL_DEFAULT_BASE_URL = "https://services.leadconnectorhq.com";

function parseLocationIds() {
  const configuredIds = [
    process.env.GOHIGHLEVEL_LOCATION_ID,
    ...(process.env.GOHIGHLEVEL_LOCATION_IDS?.split(",") ?? []),
  ];

  return Array.from(
    new Set(
      configuredIds
        .map((locationId) => locationId?.trim())
        .filter((locationId): locationId is string => Boolean(locationId)),
    ),
  );
}

export async function GET() {
  const hasPrivateIntegrationToken = Boolean(
    process.env.GOHIGHLEVEL_PRIVATE_INTEGRATION_TOKEN,
  );
  const hasLegacyApiKey = Boolean(process.env.GOHIGHLEVEL_API_KEY);
  const configuredLocationIds = parseLocationIds();
  const apiBaseUrl =
    process.env.GOHIGHLEVEL_API_BASE_URL ?? GOHIGHLEVEL_DEFAULT_BASE_URL;
  const tokenConfigured = hasPrivateIntegrationToken || hasLegacyApiKey;
  const ready = tokenConfigured && configuredLocationIds.length > 0;

  return NextResponse.json(
    {
      ok: ready,
      dryRun: true,
      communicationsSent: false,
      status: ready
        ? "ready"
        : tokenConfigured
          ? "missing_location"
          : "missing_token",
      message: ready
        ? "Server-side GoHighLevel configuration is present. No customer communications were sent."
        : "GoHighLevel server configuration is incomplete. Add server-only env vars before enabling sync.",
      configuredLocationIds,
      tokenConfigured,
      tokenSource: hasPrivateIntegrationToken
        ? "GOHIGHLEVEL_PRIVATE_INTEGRATION_TOKEN"
        : hasLegacyApiKey
          ? "GOHIGHLEVEL_API_KEY"
          : null,
      apiBaseUrl,
      checkedAt: new Date().toISOString(),
      nextStep: "Wire a server-side GoHighLevel client after owner approval.",
    },
    { status: ready ? 200 : 503 },
  );
}
