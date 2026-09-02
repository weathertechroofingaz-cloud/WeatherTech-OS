import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-mighty-apes-yelp-"));
const routePath = join(
  cwd,
  "app/api/integrations/mighty-apes/yelp/webhook/route.ts",
);
const aliasRoutePath = join(
  cwd,
  "app/api/integrations/mighty-apes/webhook/route.ts",
);
const typesPath = join(cwd, "lib/crm/types.ts");
let assertionCount = 0;

function assert(condition, message) {
  assertionCount += 1;

  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  assertionCount += 1;

  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertFailure(result, expectedCode, expectedStatus, message) {
  assertEqual(result.ok, false, `${message}: request must fail`);
  assertEqual(result.code, expectedCode, `${message}: failure code`);
  assertEqual(result.status, expectedStatus, `${message}: HTTP status`);
}

try {
  const compile = spawnSync(
    join(cwd, "node_modules/.bin/tsc"),
    [
      "lib/crm/mightyApesYelp.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outDir,
    ],
    { cwd, encoding: "utf8" },
  );

  assert(
    compile.status === 0,
    `Mighty Apes Yelp helpers did not compile: ${compile.stdout}${compile.stderr}`,
  );

  const helpers = await import(
    `${pathToFileURL(join(outDir, "mightyApesYelp.js")).href}?v=${Date.now()}`
  );
  const now = new Date("2026-08-14T20:00:00.000Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const secret = "mighty-apes-test-secret";
  const multilineMessage =
    "What kind of project is this?\nFull roof replacement\nWhen do you need it?\nWithin two weeks";
  const fixture = {
    version: 1,
    event: "lead.created",
    campaign: {
      yelp_id: "00LZA1SuPKX0yUnsdthgLg",
      name: "Weather Tech Roofing - Scottsdale, AZ 85255",
    },
    lead: {
      id: "Bn4aXqTz9-KpLmWvR2sYcA",
      name: "King K.",
      phone: "+13235550147",
      zip_code: "91307",
      job_category: "Roof Replacement",
      message: multilineMessage,
      created_at: "2026-08-12T17:04:22+00:00",
    },
  };
  const rawBody = JSON.stringify(fixture);

  function headersFor(body = rawBody, overrides = {}) {
    return {
      "content-type": "application/json",
      "user-agent": "MightyApes-Webhook/1",
      "x-mightyapes-signature": helpers.createMightyApesYelpSignature(
        body,
        secret,
      ),
      "x-mightyapes-timestamp": String(nowSeconds),
      "x-mightyapes-delivery": "delivery-20260814-0001",
      ...overrides,
    };
  }

  assertEqual(
    helpers.mightyApesYelpWebhookEndpointPath,
    "/api/integrations/mighty-apes/webhook",
    "The public endpoint path is stable",
  );
  const aliasRouteSource = readFileSync(aliasRoutePath, "utf8");
  assert(
    aliasRouteSource.includes('export const dynamic = "force-dynamic"') &&
      aliasRouteSource.includes('export const runtime = "nodejs"') &&
      aliasRouteSource.includes('export { GET, POST } from "../yelp/webhook/route"'),
    "The owner-approved Mighty Apes endpoint must use statically analyzable route config and reuse the exact verified handlers",
  );
  assertEqual(
    helpers.mightyApesYelpWebhookSecretEnvVar,
    "MIGHTY_APES_YELP_WEBHOOK_SECRET",
    "The server-only signing-secret environment variable is stable",
  );
  assertEqual(
    helpers.mightyApesYelpReplayWindowSeconds,
    300,
    "The anti-replay window is exactly five minutes",
  );
  assertEqual(
    helpers.mightyApesYelpMaxMessageBytes,
    28_000,
    "The parser and atomic RPC share the same message byte limit",
  );

  const independentlySigned = `sha256=${createHmac("sha256", secret)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("hex")}`;
  assertEqual(
    helpers.createMightyApesYelpSignature(rawBody, secret),
    independentlySigned,
    "The HMAC signs the raw body bytes only",
  );
  assert(
    helpers.createMightyApesYelpSignature(rawBody, secret) !==
      `sha256=${createHmac("sha256", secret)
        .update(`${nowSeconds}.${rawBody}`)
        .digest("hex")}`,
    "The provider timestamp is not prepended to the signed raw body",
  );

  const verified = helpers.verifyMightyApesYelpRequest({
    rawBody,
    headers: headersFor(),
    secret,
    now,
  });
  assertEqual(verified.ok, true, "A valid signed delivery verifies");
  assertEqual(
    verified.verification.deliveryId,
    "delivery-20260814-0001",
    "The delivery identifier is preserved",
  );
  assertEqual(
    verified.verification.headerTimestamp,
    nowSeconds,
    "The verified Unix timestamp is preserved",
  );
  assertEqual(
    verified.verification.receivedAt,
    now.toISOString(),
    "The deterministic receive time is preserved",
  );
  assertEqual(
    verified.verification.payloadFingerprint,
    createHash("sha256").update(rawBody).digest("hex"),
    "The raw-body fingerprint is deterministic",
  );

  const whitespaceSecret = "  exact-secret-bytes  ";
  const whitespaceVerified = helpers.verifyMightyApesYelpRequest({
    rawBody,
    headers: {
      ...headersFor(),
      "x-mightyapes-signature": helpers.createMightyApesYelpSignature(
        rawBody,
        whitespaceSecret,
      ),
    },
    secret: whitespaceSecret,
    now,
  });
  assertEqual(
    whitespaceVerified.ok,
    true,
    "Signing secret bytes are never trimmed",
  );
  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody,
      headers: headersFor(),
      secret: "",
      now,
    }),
    "configuration_required",
    503,
    "An empty signing secret fails closed",
  );

  for (const timestampDelta of [-300, 300]) {
    const boundary = helpers.verifyMightyApesYelpRequest({
      rawBody,
      headers: headersFor(rawBody, {
        "x-mightyapes-timestamp": String(nowSeconds + timestampDelta),
      }),
      secret,
      now,
    });
    assertEqual(
      boundary.ok,
      true,
      `Replay-window boundary ${timestampDelta} seconds is accepted`,
    );
  }

  for (const timestampDelta of [-301, 301]) {
    assertFailure(
      helpers.verifyMightyApesYelpRequest({
        rawBody,
        headers: headersFor(rawBody, {
          "x-mightyapes-timestamp": String(nowSeconds + timestampDelta),
        }),
        secret,
        now,
      }),
      "stale_timestamp",
      401,
      `Timestamp ${timestampDelta} seconds outside the replay window`,
    );
  }

  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody: `${rawBody} `,
      headers: headersFor(),
      secret,
      now,
    }),
    "invalid_signature",
    401,
    "Any raw-body byte change invalidates the signature",
  );
  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody,
      headers: headersFor(rawBody, { "x-mightyapes-signature": undefined }),
      secret,
      now,
    }),
    "missing_signature",
    401,
    "Missing HMAC",
  );
  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody,
      headers: headersFor(rawBody, {
        "x-mightyapes-signature": `sha256=${"0".repeat(64)}`,
      }),
      secret,
      now,
    }),
    "invalid_signature",
    401,
    "Invalid HMAC",
  );
  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody,
      headers: headersFor(rawBody, { "x-mightyapes-timestamp": "not-unix" }),
      secret,
      now,
    }),
    "invalid_timestamp",
    401,
    "Malformed timestamp",
  );
  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody,
      headers: headersFor(rawBody, { "x-mightyapes-delivery": undefined }),
      secret,
      now,
    }),
    "missing_delivery",
    400,
    "Missing delivery identifier",
  );
  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody,
      headers: headersFor(rawBody, { "user-agent": "Unexpected-Webhook/1" }),
      secret,
      now,
    }),
    "invalid_user_agent",
    400,
    "Unexpected user agent",
  );
  assertFailure(
    helpers.verifyMightyApesYelpRequest({
      rawBody: "x".repeat(helpers.mightyApesYelpMaxPayloadBytes + 1),
      headers: headersFor(),
      secret,
      now,
    }),
    "payload_too_large",
    413,
    "Oversized body",
  );

  const parsed = helpers.parseMightyApesYelpPayload(rawBody);
  assertEqual(parsed.ok, true, "The verified contract payload parses");
  assertEqual(
    parsed.payload.lead.phone,
    fixture.lead.phone,
    "The E.164 phone is preserved exactly",
  );
  assertEqual(
    parsed.payload.lead.message,
    multilineMessage,
    "The complete multiline questionnaire is preserved",
  );
  assertEqual(
    parsed.payload.lead.created_at,
    fixture.lead.created_at,
    "The provider ISO timestamp is preserved exactly",
  );

  const intake = helpers.buildMightyApesYelpIntakeRequest(
    parsed.payload,
    verified.verification,
  );
  assertEqual(intake.version, 1, "The RPC intake keeps payload version 1");
  assertEqual(intake.event, "lead.created", "The RPC intake keeps the event");
  assertEqual(
    intake.campaign.yelp_id,
    fixture.campaign.yelp_id,
    "The RPC intake keeps the authorized campaign ID",
  );
  assertEqual(
    intake.campaign.name,
    fixture.campaign.name,
    "The RPC intake keeps the supplied campaign name",
  );
  assertEqual(intake.lead.id, fixture.lead.id, "The stable Yelp lead ID is kept");
  assertEqual(intake.lead.name, fixture.lead.name, "The provider name is kept");
  assertEqual(intake.lead.phone, fixture.lead.phone, "The RPC phone is exact");
  assertEqual(intake.lead.zip_code, fixture.lead.zip_code, "The ZIP is kept");
  assertEqual(
    intake.lead.job_category,
    fixture.lead.job_category,
    "The optional job category is kept",
  );
  assertEqual(intake.lead.message, multilineMessage, "The RPC message is multiline");
  assertEqual(
    intake.lead.created_at,
    fixture.lead.created_at,
    "The RPC provider timestamp is exact",
  );
  assertEqual(
    Object.hasOwn(intake.lead, "email"),
    false,
    "The RPC intake never fabricates an email",
  );
  assertEqual(
    Object.hasOwn(intake, "company") || Object.hasOwn(intake, "company_id"),
    false,
    "The public payload cannot select a company",
  );

  const withoutJobCategory = structuredClone(fixture);
  delete withoutJobCategory.lead.job_category;
  const parsedWithoutJobCategory = helpers.parseMightyApesYelpPayload(
    JSON.stringify(withoutJobCategory),
  );
  assertEqual(
    parsedWithoutJobCategory.ok,
    true,
    "The optional job category may be absent",
  );
  const intakeWithoutJobCategory = helpers.buildMightyApesYelpIntakeRequest(
    parsedWithoutJobCategory.payload,
    verified.verification,
  );
  assertEqual(
    Object.hasOwn(intakeWithoutJobCategory.lead, "job_category"),
    false,
    "An absent job category remains absent",
  );

  const renamedCampaign = structuredClone(fixture);
  renamedCampaign.campaign.name = "Weather Tech Roofing - Phoenix Metro";
  const parsedRenamedCampaign = helpers.parseMightyApesYelpPayload(
    JSON.stringify(renamedCampaign),
  );
  assertEqual(
    parsedRenamedCampaign.ok,
    true,
    "Authorization depends on the stable campaign ID, not its display name",
  );
  assertEqual(
    parsedRenamedCampaign.payload.campaign.name,
    renamedCampaign.campaign.name,
    "A legitimate renamed campaign remains preserved",
  );

  const testDelivery = structuredClone(fixture);
  testDelivery.event = "lead.test";
  const parsedTest = helpers.parseMightyApesYelpPayload(
    JSON.stringify(testDelivery),
  );
  assertEqual(parsedTest.ok, true, "An authenticated lead.test shape is accepted");
  assertEqual(
    helpers.buildMightyApesYelpIntakeRequest(
      parsedTest.payload,
      verified.verification,
    ).event,
    "lead.test",
    "lead.test stays distinct for the transaction-safe diagnostic path",
  );

  const unsupportedVersion = structuredClone(fixture);
  unsupportedVersion.version = 2;
  assertFailure(
    helpers.parseMightyApesYelpPayload(JSON.stringify(unsupportedVersion)),
    "unsupported_version",
    422,
    "Unsupported payload version",
  );

  const unsupportedEvent = structuredClone(fixture);
  unsupportedEvent.event = "lead.updated";
  assertFailure(
    helpers.parseMightyApesYelpPayload(JSON.stringify(unsupportedEvent)),
    "unsupported_event",
    422,
    "Unsupported event",
  );

  const unsupportedCampaign = structuredClone(fixture);
  unsupportedCampaign.campaign.yelp_id = "another-campaign";
  const parsedUnknownCampaign = helpers.parseMightyApesYelpPayload(
    JSON.stringify(unsupportedCampaign),
  );
  assertEqual(
    parsedUnknownCampaign.ok,
    true,
    "Syntactically valid campaign IDs reach the database authorization registry",
  );
  assertEqual(
    parsedUnknownCampaign.payload.campaign.yelp_id,
    unsupportedCampaign.campaign.yelp_id,
    "The parser preserves an unknown campaign ID for fail-closed registry authorization",
  );

  const payloadWithEmail = structuredClone(fixture);
  payloadWithEmail.lead.email = "not-provided-by-yelp@example.test";
  assertFailure(
    helpers.parseMightyApesYelpPayload(JSON.stringify(payloadWithEmail)),
    "invalid_payload",
    400,
    "A fabricated email field is refused",
  );

  const crossCompanyPayload = {
    ...fixture,
    company: "IHC Painting",
  };
  assertFailure(
    helpers.parseMightyApesYelpPayload(JSON.stringify(crossCompanyPayload)),
    "invalid_payload",
    400,
    "Cross-company routing input is outside the signed contract",
  );

  assertFailure(
    helpers.parseMightyApesYelpPayload("{not-json"),
    "malformed_json",
    400,
    "Malformed JSON",
  );

  const invalidPhone = structuredClone(fixture);
  invalidPhone.lead.phone = "(323) 555-0147";
  assertFailure(
    helpers.parseMightyApesYelpPayload(JSON.stringify(invalidPhone)),
    "invalid_payload",
    400,
    "A non-E.164 phone is refused",
  );

  const paddedLeadId = structuredClone(fixture);
  paddedLeadId.lead.id = ` ${fixture.lead.id}`;
  assertFailure(
    helpers.parseMightyApesYelpPayload(JSON.stringify(paddedLeadId)),
    "invalid_payload",
    400,
    "A padded provider lead ID is refused rather than normalized",
  );

  const impossibleProviderDate = structuredClone(fixture);
  impossibleProviderDate.lead.created_at = "2026-02-30T17:04:22+00:00";
  assertFailure(
    helpers.parseMightyApesYelpPayload(
      JSON.stringify(impossibleProviderDate),
    ),
    "invalid_payload",
    400,
    "An impossible provider calendar date is refused",
  );

  const oversizedMultibyteMessage = structuredClone(fixture);
  oversizedMultibyteMessage.lead.message = "é".repeat(14_001);
  assertFailure(
    helpers.parseMightyApesYelpPayload(
      JSON.stringify(oversizedMultibyteMessage),
    ),
    "invalid_payload",
    400,
    "The message limit is enforced in UTF-8 bytes",
  );

  const safeAudit = helpers.buildMightyApesYelpSafeAuditSummary(
    parsed.payload,
    verified.verification,
  );
  const safeAuditJson = JSON.stringify(safeAudit);
  assertEqual(safeAudit.provider, "mighty_apes", "Audit identifies the provider");
  assertEqual(safeAudit.source, "Yelp", "Audit identifies the lead source");
  for (const sensitiveValue of [
    fixture.lead.name,
    fixture.lead.phone,
    fixture.lead.zip_code,
    fixture.lead.job_category,
    fixture.lead.message,
    secret,
    independentlySigned,
  ]) {
    assert(
      !safeAuditJson.includes(sensitiveValue),
      `Safe audit summary excludes sensitive value ${sensitiveValue.slice(0, 16)}`,
    );
  }

  const routeSource = readFileSync(routePath, "utf8");
  const typesSource = readFileSync(typesPath, "utf8");
  assert(
    routeSource.includes('export const runtime = "nodejs"'),
    "The webhook uses the Node runtime required for raw-body crypto",
  );
  assert(
    routeSource.includes('export const dynamic = "force-dynamic"'),
    "The webhook cannot be statically cached",
  );
  assert(
    routeSource.indexOf("hasJsonContentType(request)") <
    routeSource.indexOf("readBoundedTextBody("),
    "Content-Type is validated before the body is read",
  );
  assert(
    routeSource.indexOf("readBoundedTextBody(") <
      routeSource.indexOf("parseMightyApesYelpPayload(rawBody)"),
    "The raw body is read and authenticated before JSON parsing",
  );
  assert(
    !routeSource.includes("request.json("),
    "The route never parses JSON through request.json",
  );
  assert(
    routeSource.includes('"Cache-Control": "no-store"'),
    "Every explicit webhook response is non-cacheable",
  );
  assert(
    routeSource.includes("export async function GET()") &&
      routeSource.includes("status: 405") &&
      routeSource.includes('Allow: "POST"'),
    "GET deterministically returns 405 with Allow: POST",
  );
  assert(
    routeSource.includes('"wtos_ingest_mighty_apes_yelp"'),
    "The route uses the transaction-safe service-role RPC",
  );
  assert(
    routeSource.includes('error.code === "42501"') &&
      routeSource.includes('code: "campaign_not_authorized"') &&
      routeSource.includes("403"),
    "Unknown or disabled campaigns fail closed at the authoritative database registry",
  );
  assert(
    routeSource.includes("SUPABASE_SERVICE_ROLE_KEY") &&
      routeSource.includes("persistSession: false") &&
      routeSource.includes("autoRefreshToken: false"),
    "The route creates only a non-persistent server service client",
  );
  assert(
    !routeSource.includes("processLeadIntake") && !routeSource.includes(".from("),
    "The public route cannot bypass the atomic RPC through direct writes",
  );
  assert(
    routeSource.includes("MIGHTY_APES_YELP_DELIVERY_CONFLICT") &&
      routeSource.includes('code: "delivery_conflict"') &&
      routeSource.includes("409"),
    "A delivery ID reused with different bytes receives a stable 409",
  );
  assert(
    routeSource.includes("MIGHTY_APES_YELP_LEAD_PAYLOAD_CONFLICT") &&
      routeSource.includes('code: "lead_payload_conflict"'),
    "A provider lead ID reused with changed bytes receives a stable 409",
  );
  assert(
    routeSource.includes("hasNoPipelineIds(result)") &&
      routeSource.includes("hasAllPipelineIds(result)"),
    "The route refuses test/created RPC results with unsafe pipeline IDs",
  );
  assert(
    routeSource.includes("result.status === \"created\" ? 201 : 200"),
    "Created deliveries return 201 and retries return 200",
  );
  assert(
    !routeSource.includes("console.error(error") &&
      !routeSource.includes("console.log(") &&
      !routeSource.includes("JSON.stringify(intakeRequest)"),
    "The route never logs raw errors or provider PII payloads",
  );
  assert(
    typesSource.includes("wtos_ingest_mighty_apes_yelp") &&
      typesSource.includes("intake_request: MightyApesYelpIntakeRequest") &&
      typesSource.includes("Returns: MightyApesYelpIngestResult"),
    "Database types register the exact RPC argument and result contract",
  );
  assert(
    typesSource.includes("mighty_apes_yelp_webhook_events:") &&
      typesSource.includes("Row: MightyApesYelpWebhookEventRecord") &&
      typesSource.includes("Insert: never") &&
      typesSource.includes("Update: never"),
    "Database types expose the immutable webhook audit ledger as read-only",
  );

  console.log(
    `Mighty Apes Yelp webhook contract tests passed (${assertionCount} assertions).`,
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
