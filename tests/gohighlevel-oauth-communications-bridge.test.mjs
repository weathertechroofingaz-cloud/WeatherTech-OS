import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-ghl-oauth-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");
const envKeys = [
  "GHL_CLIENT_ID",
  "GHL_CLIENT_SECRET",
  "GHL_REDIRECT_URI",
  "GHL_MARKETPLACE_INSTALL_URL",
  "GHL_TOKEN_ENCRYPTION_KEY",
  "GHL_SYNC_ENABLED",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

async function assertRejects(operation, pattern, message) {
  try {
    await operation();
  } catch (error) {
    assert(
      pattern.test(error instanceof Error ? error.message : String(error)),
      `${message}: unexpected error ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  throw new Error(`${message}: expected rejection.`);
}

function createScriptedServiceClient(steps) {
  const remaining = [...steps];
  const calls = [];
  const consume = (actual) => {
    const expected = remaining.shift();
    assert(expected, `Unexpected ${actual.operation} on ${actual.table}`);
    assertEqual(actual.table, expected.table, "Scripted Supabase table must match");
    assertEqual(
      actual.operation,
      expected.operation,
      "Scripted Supabase operation must match",
    );
    calls.push(actual);
    return Promise.resolve(expected.result);
  };

  return {
    calls,
    assertComplete(message) {
      assertEqual(remaining.length, 0, message);
    },
    client: {
      from(table) {
        let operation = null;
        let payload = null;
        let columns = null;
        const filters = [];
        const builder = {
          select(value) {
            columns = value;
            operation ??= "select";
            return builder;
          },
          update(value) {
            operation = "update";
            payload = value;
            return builder;
          },
          insert(value) {
            return consume({ table, operation: "insert", payload: value, filters: [] });
          },
          eq(column, value) {
            filters.push([column, value]);
            return builder;
          },
          maybeSingle() {
            return consume({ table, operation, payload, columns, filters });
          },
        };
        return builder;
      },
    },
  };
}

function configureEnv() {
  process.env.GHL_CLIENT_ID = "0123456789abcdef01234567-testclient";
  process.env.GHL_CLIENT_SECRET = "test-marketplace-secret";
  process.env.GHL_REDIRECT_URI =
    "https://weathertech.test/api/oauth/marketplace/callback";
  process.env.GHL_MARKETPLACE_INSTALL_URL =
    "https://marketplace.gohighlevel.com/v2/oauth/chooselocation?version_id=0123456789abcdef01234567";
  process.env.GHL_TOKEN_ENCRYPTION_KEY =
    "weathertech-test-encryption-material-32-characters";
  process.env.GHL_SYNC_ENABLED = "false";
}

function clearEnv() {
  for (const key of envKeys) delete process.env[key];
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/gohighlevel/oauth.ts",
      "lib/gohighlevel/sync.ts",
      "lib/gohighlevel/foundation.ts",
      "lib/crm/types.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--strict",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outDir,
    ],
    { cwd, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    throw new Error(
      `Could not compile GoHighLevel OAuth modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const oauth = await import(pathToFileURL(join(outDir, "gohighlevel", "oauth.js")));
  const sync = await import(pathToFileURL(join(outDir, "gohighlevel", "sync.js")));
  const foundation = await import(
    pathToFileURL(join(outDir, "gohighlevel", "foundation.js"))
  );
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  clearEnv();
  const missing = oauth.getGoHighLevelOAuthConfig();
  assertEqual(missing.ok, false, "Missing server configuration fails closed");
  assertEqual(missing.missing.length, 5, "Every required OAuth variable is reported");
  assert(
    !JSON.stringify(missing).includes("client_secret"),
    "Configuration readiness never invents or returns a credential value",
  );

  configureEnv();
  const ready = oauth.getGoHighLevelOAuthConfig();
  assertEqual(ready.ok, true, "Complete Marketplace configuration is accepted");
  assertEqual(ready.syncEnabled, false, "Inbound sync remains explicitly gated");

  const state = oauth.createGoHighLevelOAuthState({
    randomBytes: (size) => Buffer.alloc(size, 9),
  });
  assertEqual(
    state.stateHash,
    oauth.hashGoHighLevelOAuthState(state.rawState),
    "OAuth state is persisted only through its hash",
  );
  const authorization = oauth.buildGoHighLevelAuthorizationRequest({
    rawState: state.rawState,
  });
  const authorizationUrl = new URL(authorization.authorizationUrl);
  assertEqual(
    authorizationUrl.searchParams.get("scope"),
    foundation.goHighLevelOAuthScopes.join(" "),
    "Authorization requests the exact least-privilege scope set",
  );
  assertEqual(
    authorizationUrl.searchParams.get("state"),
    state.rawState,
    "Authorization carries the CSRF state",
  );
  assertEqual(
    authorizationUrl.searchParams.get("redirect_uri"),
    "https://weathertech.test/api/oauth/marketplace/callback",
    "Authorization uses the provider-neutral callback route",
  );
  assert(
    !/highlevel/i.test(authorizationUrl.searchParams.get("redirect_uri") ?? ""),
    "Authorization callback contains no HighLevel provider reference",
  );
  assert(
    !foundation.goHighLevelOAuthScopes.some((scope) => scope.endsWith(".write")),
    "Marketplace scope set includes no provider write permission",
  );

  let exchangeRequest;
  const tokenPayload = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_type: "Bearer",
    expires_in: 86400,
    scope: foundation.goHighLevelOAuthScopes.join(" "),
    userType: "Location",
    locationId: "location-weathertech",
    companyId: "agency-1",
    userId: "provider-user-1",
  };
  const exchange = await oauth.exchangeGoHighLevelOAuthCode({
    code: "one-time-code",
    fetchImpl: async (url, init) => {
      exchangeRequest = { url: String(url), init };
      return jsonResponse(200, tokenPayload);
    },
  });
  assertEqual(exchange.ok, true, "Authorization code exchange succeeds");
  assertEqual(
    exchangeRequest.init.headers["Content-Type"],
    "application/x-www-form-urlencoded",
    "Authorization code exchange uses the provider-supported form encoding",
  );
  const exchangeBody = new URLSearchParams(exchangeRequest.init.body);
  assertEqual(
    exchangeBody.get("grant_type"),
    "authorization_code",
    "Authorization exchange uses official snake_case fields",
  );
  assertEqual(
    exchangeBody.get("user_type"),
    "Company",
    "Agency-only installation requests the provider-documented company token",
  );
  assertEqual(exchangeBody.get("clientId"), null, "Camel-case token fields are not sent");

  const companyExchange = await oauth.exchangeGoHighLevelOAuthCode({
    code: "agency-install-code",
    fetchImpl: async () =>
      jsonResponse(200, {
        ...tokenPayload,
        userType: "Company",
        locationId: undefined,
        approvedLocations: ["location-weathertech"],
      }),
  });
  assertEqual(companyExchange.ok, true, "Agency-owner installation token is parsed");
  assertEqual(
    companyExchange.payload.approvedLocations[0],
    "location-weathertech",
    "Agency-owner installation retains the single approved sub-account",
  );

  let installedLocationsRequest;
  const installedLocations = await oauth.getGoHighLevelInstalledLocations({
    accessToken: "agency-access-token",
    companyId: "agency-1",
    fetchImpl: async (url, init) => {
      installedLocationsRequest = { url: String(url), init };
      return jsonResponse(200, {
        items: [
          {
            _id: "location-weathertech",
            name: "WeatherTech roofing",
            isInstalled: true,
          },
          {
            _id: "location-not-installed",
            name: "Another sub-account",
            isInstalled: false,
          },
          {
            _id: "location-weathertech",
            name: "WeatherTech roofing",
            isInstalled: true,
          },
        ],
      });
    },
  });
  assertEqual(
    installedLocations.ok,
    true,
    "Bulk agency installation discovers installed sub-accounts",
  );
  assertEqual(
    installedLocations.locations.length,
    1,
    "Installed-location discovery excludes uninstalled rows and deduplicates IDs",
  );
  const installedLocationsUrl = new URL(installedLocationsRequest.url);
  assertEqual(
    installedLocationsUrl.pathname,
    "/oauth/installed-locations",
    "Installed-location discovery uses the current provider-neutral v3 endpoint",
  );
  assertEqual(
    installedLocationsUrl.searchParams.get("companyId"),
    "agency-1",
    "Installed-location discovery is bound to the installing agency",
  );
  assertEqual(
    installedLocationsUrl.searchParams.get("appId"),
    "0123456789abcdef01234567",
    "Installed-location discovery is bound to the Marketplace app",
  );
  assertEqual(
    installedLocationsUrl.searchParams.get("versionId"),
    "0123456789abcdef01234567",
    "Installed-location discovery is bound to the installed app version",
  );
  assertEqual(
    installedLocationsRequest.init.headers.Version,
    "v3",
    "Installed-location discovery uses the current HighLevel API version",
  );

  const bulkCompanyResolution = await oauth.resolveGoHighLevelCompanyLocation({
    accessToken: "agency-access-token",
    companyId: "agency-1",
    approvedLocationIds: [],
    fetchImpl: async () =>
      jsonResponse(200, {
        items: [
          {
            _id: "location-weathertech",
            name: "WeatherTech roofing",
            isInstalled: true,
          },
        ],
      }),
  });
  assertEqual(
    bulkCompanyResolution.ok,
    true,
    "Bulk company tokens without approvedLocations resolve through installed locations",
  );
  assertEqual(
    bulkCompanyResolution.locationId,
    "location-weathertech",
    "Bulk company resolution returns the one installed sub-account",
  );
  assertEqual(
    bulkCompanyResolution.source,
    "installed_locations",
    "Bulk company resolution records its sanitized resolution source",
  );

  const ambiguousCompanyResolution = await oauth.resolveGoHighLevelCompanyLocation({
    accessToken: "agency-access-token",
    companyId: "agency-1",
    approvedLocationIds: [],
    fetchImpl: async () =>
      jsonResponse(200, {
        items: [
          { _id: "location-weathertech", isInstalled: true },
          { _id: "location-ihc", isInstalled: true },
        ],
      }),
  });
  assertEqual(
    ambiguousCompanyResolution.ok,
    false,
    "Bulk company resolution rejects multiple installed sub-accounts",
  );

  const isolatedSecondCompanyResolution =
    await oauth.resolveGoHighLevelCompanyLocation({
      accessToken: "agency-access-token",
      companyId: "agency-1",
      approvedLocationIds: [],
      excludedLocationIds: ["location-weathertech"],
      fetchImpl: async () =>
        jsonResponse(200, {
          items: [
            { _id: "location-weathertech", isInstalled: true },
            { _id: "location-ihc", isInstalled: true },
          ],
        }),
    });
  assertEqual(
    isolatedSecondCompanyResolution.ok,
    true,
    "A second company resolves only the remaining unmapped installed sub-account",
  );
  assertEqual(
    isolatedSecondCompanyResolution.locationId,
    "location-ihc",
    "Existing company mappings cannot be reassigned during location resolution",
  );

  const excludedApprovedLocation =
    await oauth.resolveGoHighLevelCompanyLocation({
      accessToken: "agency-access-token",
      companyId: "agency-1",
      approvedLocationIds: ["location-weathertech"],
      excludedLocationIds: ["location-weathertech"],
      fetchImpl: async () => jsonResponse(200, { items: [] }),
    });
  assertEqual(
    excludedApprovedLocation.ok,
    false,
    "An approved location already owned by another company remains rejected",
  );

  const missingCompanyResolution = await oauth.resolveGoHighLevelCompanyLocation({
    accessToken: "agency-access-token",
    companyId: "agency-1",
    approvedLocationIds: [],
    fetchImpl: async () => jsonResponse(200, { items: [] }),
  });
  assertEqual(
    missingCompanyResolution.ok,
    false,
    "Bulk company resolution rejects a missing installed sub-account",
  );

  let locationTokenRequest;
  const locationTokenExchange = await oauth.exchangeGoHighLevelLocationToken({
    accessToken: "agency-access-token",
    companyId: "agency-1",
    locationId: "location-weathertech",
    fetchImpl: async (url, init) => {
      locationTokenRequest = { url: String(url), init };
      return jsonResponse(200, tokenPayload);
    },
  });
  assertEqual(
    locationTokenExchange.ok,
    true,
    "Agency token converts to the approved location token",
  );
  assertEqual(
    locationTokenRequest.init.headers.Version,
    "v3",
    "Location-token exchange uses the current HighLevel API version",
  );
  assertEqual(
    locationTokenRequest.init.headers["Content-Type"],
    "application/x-www-form-urlencoded",
    "Location-token exchange uses provider-supported form encoding",
  );
  const locationTokenBody = new URLSearchParams(locationTokenRequest.init.body);
  assertEqual(
    locationTokenBody.get("companyId"),
    "agency-1",
    "Location-token exchange is bound to the installing agency",
  );
  assertEqual(
    locationTokenBody.get("locationId"),
    "location-weathertech",
    "Location-token exchange is bound to the single approved sub-account",
  );

  const mismatchedLocationToken = await oauth.exchangeGoHighLevelLocationToken({
    accessToken: "agency-access-token",
    companyId: "agency-1",
    locationId: "location-weathertech",
    fetchImpl: async () =>
      jsonResponse(200, { ...tokenPayload, locationId: "another-location" }),
  });
  assertEqual(
    mismatchedLocationToken.ok,
    false,
    "A location-token response cannot escape the approved sub-account",
  );

  let refreshRequest;
  const refreshed = await oauth.refreshGoHighLevelOAuthToken({
    refreshToken: "rotating-refresh-token",
    fetchImpl: async (url, init) => {
      refreshRequest = { url: String(url), init };
      return jsonResponse(200, {
        ...tokenPayload,
        access_token: "rotated-access-token",
        refresh_token: "rotated-refresh-token",
      });
    },
  });
  assertEqual(refreshed.ok, true, "Refresh token exchange succeeds");
  assertEqual(
    refreshRequest.init.headers["Content-Type"],
    "application/x-www-form-urlencoded",
    "Token refresh uses the official form encoding",
  );
  const refreshBody = new URLSearchParams(refreshRequest.init.body);
  assertEqual(refreshBody.get("grant_type"), "refresh_token", "Refresh grant is exact");
  assertEqual(
    refreshBody.get("refresh_token"),
    "rotating-refresh-token",
    "Refresh uses the currently stored rotating token",
  );
  assertEqual(
    refreshed.payload.refreshToken,
    "rotated-refresh-token",
    "Rotated refresh token is returned for encrypted persistence",
  );

  const encrypted = oauth.encryptGoHighLevelToken("sensitive-provider-token");
  assert(
    encrypted.startsWith("v1:") && !encrypted.includes("sensitive-provider-token"),
    "Provider token is authenticated-encrypted at rest",
  );
  assertEqual(
    oauth.decryptGoHighLevelToken(encrypted),
    "sensitive-provider-token",
    "Encrypted provider token can be restored server-side",
  );

  assertEqual(
    oauth.validateGoHighLevelGrantedScopes([...foundation.goHighLevelOAuthScopes]).ok,
    true,
    "Exact approved scopes pass",
  );
  const providerManagedScopeValidation = oauth.validateGoHighLevelGrantedScopes([
    ...foundation.goHighLevelOAuthScopes,
    "oauth.write",
    "oauth.readonly",
  ]);
  assertEqual(
    providerManagedScopeValidation.ok,
    true,
    "HighLevel-managed OAuth control-plane scopes pass",
  );
  assertEqual(
    providerManagedScopeValidation.providerManaged.sort().join(" "),
    "oauth.readonly oauth.write",
    "Provider-managed OAuth scopes remain visible for auditing",
  );
  assertEqual(
    oauth.validateGoHighLevelGrantedScopes(
      foundation.goHighLevelOAuthScopes.slice(0, -1),
    ).ok,
    false,
    "Missing scope fails closed",
  );
  assertEqual(
    oauth.validateGoHighLevelGrantedScopes([
      ...foundation.goHighLevelOAuthScopes,
      "contacts.write",
    ]).ok,
    false,
    "Unexpected write scope fails closed",
  );
  assertEqual(
    oauth.describeGoHighLevelScopeMismatch({
      ok: false,
      missing: ["products.readonly"],
      unexpected: ["contacts.write"],
    }),
    "HighLevel granted scopes do not match the approved least-privilege set. Missing: products.readonly. Unexpected: contacts.write.",
    "Scope mismatch diagnostics identify only non-secret scope names",
  );

  const rawBody = JSON.stringify({
    type: "InboundMessage",
    webhookId: "webhook-1",
    locationId: "location-weathertech",
    messageId: "message-1",
  });
  const ed25519 = crypto.generateKeyPairSync("ed25519");
  const edSignature = crypto.sign(null, Buffer.from(rawBody), ed25519.privateKey);
  const edVerification = oauth.verifyGoHighLevelWebhookSignature({
    rawBody,
    ghlSignature: edSignature.toString("base64"),
    ed25519PublicKey: ed25519.publicKey.export({ type: "spki", format: "pem" }),
  });
  assertEqual(edVerification.ok, true, "Current Ed25519 webhook signature verifies");
  assertEqual(
    edVerification.signatureVersion,
    "ed25519",
    "Current signature path is recorded",
  );

  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rsaSignature = crypto.sign("RSA-SHA256", Buffer.from(rawBody), rsa.privateKey);
  const rsaVerification = oauth.verifyGoHighLevelWebhookSignature({
    rawBody,
    legacySignature: rsaSignature.toString("base64"),
    legacyPublicKey: rsa.publicKey.export({ type: "spki", format: "pem" }),
  });
  assertEqual(rsaVerification.ok, true, "Legacy RSA webhook signature verifies");
  assertEqual(
    oauth.verifyGoHighLevelWebhookSignature({
      rawBody: `${rawBody} `,
      ghlSignature: edSignature.toString("base64"),
      ed25519PublicKey: ed25519.publicKey.export({ type: "spki", format: "pem" }),
    }).ok,
    false,
    "Signature verification is bound to the exact raw body",
  );

  const safeSummary = oauth.buildGoHighLevelWebhookSummary({
    type: "InboundMessage",
    body: "Customer asked for an estimate.",
    access_token: "must-not-persist",
    client_secret: "must-not-persist",
  });
  assert(
    !JSON.stringify(safeSummary).includes("must-not-persist"),
    "Webhook storage excludes unknown credential fields",
  );

  let retryAttempts = 0;
  const retriedRequest = await sync.requestGoHighLevelApi({
    accessToken: "test-token",
    path: "/contacts/",
    query: { locationId: "location-weathertech" },
    fetchImpl: async () => {
      retryAttempts += 1;
      return retryAttempts === 1
        ? jsonResponse(503, { message: "temporary" })
        : jsonResponse(200, { contacts: [] });
    },
  });
  assertEqual(retriedRequest.ok, true, "Transient provider failure is retried safely");
  assertEqual(retryAttempts, 2, "Transient provider failure retries exactly once");

  let badRequestAttempts = 0;
  const badRequest = await sync.requestGoHighLevelApi({
    accessToken: "test-token",
    path: "/contacts/",
    fetchImpl: async () => {
      badRequestAttempts += 1;
      return jsonResponse(400, { message: "invalid" });
    },
  });
  assertEqual(badRequest.ok, false, "Non-retryable provider failure is returned");
  assertEqual(badRequestAttempts, 1, "Non-retryable request is not repeated");

  const calendarEventQuery = sync.buildGoHighLevelCalendarEventQuery({
    locationId: "location-weathertech",
    calendarId: "calendar-primary",
    now: 1_800_000_000_000,
  });
  assertEqual(
    calendarEventQuery.calendarId,
    "calendar-primary",
    "Calendar event reads include the provider-required calendar binding",
  );
  assertEqual(
    calendarEventQuery.locationId,
    "location-weathertech",
    "Calendar event reads remain location-scoped",
  );
  assert(
    calendarEventQuery.startTime < calendarEventQuery.endTime,
    "Calendar event reads use a bounded time window",
  );

  const reviewQuery = sync.buildGoHighLevelReviewQuery(
    "location-weathertech",
    "approved",
  );
  assertEqual(
    reviewQuery.altId,
    "location-weathertech",
    "Product review reads use HighLevel's required alternate identifier",
  );
  assertEqual(
    reviewQuery.altType,
    "location",
    "Product review reads declare the alternate identifier type",
  );
  assertEqual(
    reviewQuery.status,
    "approved",
    "Product review reads include HighLevel's required status filter",
  );
  assertEqual(
    sync.GOHIGHLEVEL_REVIEW_STATUSES.join(" "),
    "approved pending",
    "Review synchronization covers every accepted provider state",
  );
  assertEqual(
    "locationId" in reviewQuery,
    false,
    "Product review reads do not send the rejected locationId parameter",
  );

  const connection = {
    id: "connection-weathertech",
    company_id: "company-weathertech",
    external_account_id: "location-weathertech",
  };
  let failClosedDatabaseCalls = 0;
  const failClosedClient = {
    from() {
      failClosedDatabaseCalls += 1;
      throw new Error("Direction rejection must happen before database access.");
    },
  };
  for (const [label, record] of [
    ["missing", { id: "message-missing-direction", messageType: "SMS" }],
    [
      "unrecognized",
      { id: "message-unrecognized-direction", messageType: "SMS", direction: "sideways" },
    ],
  ]) {
    const ignored = await sync.persistGoHighLevelCommunication({
      serviceClient: failClosedClient,
      connection,
      record,
    });
    assertEqual(ignored.saved, false, `${label} GHL direction must not persist`);
    assertEqual(ignored.ignored, true, `${label} GHL direction must fail closed`);
  }
  assertEqual(
    failClosedDatabaseCalls,
    0,
    "Missing or unrecognized GHL direction must create zero source rows and automation events",
  );

  const outboundStore = createScriptedServiceClient([
    {
      table: "communication_provider_events",
      operation: "select",
      result: { data: null, error: null },
    },
    {
      table: "communication_provider_events",
      operation: "insert",
      result: { data: null, error: null },
    },
  ]);
  const outbound = await sync.persistGoHighLevelCommunication({
    serviceClient: outboundStore.client,
    connection,
    record: {
      id: "message-explicit-outbound",
      messageType: "SMS",
      direction: "outbound",
      status: "delivered",
    },
    match: { customerId: null, leadId: "lead-weathertech" },
  });
  assertEqual(outbound.saved, true, "Explicit outbound GHL SMS remains persisted");
  const outboundInsert = outboundStore.calls.find((call) => call.operation === "insert");
  assertEqual(
    outboundInsert.payload.direction,
    "outbound",
    "Explicit outbound GHL direction remains authoritative",
  );
  assertEqual(
    outboundInsert.payload.event_type,
    "sms_status",
    "Explicit outbound GHL SMS cannot masquerade as inbound",
  );
  outboundStore.assertComplete("Explicit outbound persistence must consume its exact DB script");

  const communicationCollision = createScriptedServiceClient([
    {
      table: "communication_provider_events",
      operation: "select",
      result: { data: null, error: null },
    },
    {
      table: "communication_provider_events",
      operation: "insert",
      result: { data: null, error: { code: "23505" } },
    },
    {
      table: "communication_provider_events",
      operation: "select",
      result: {
        data: {
          id: "existing-message",
          company_id: "company-other",
          integration_connection_id: "connection-other",
        },
        error: null,
      },
    },
  ]);
  await assertRejects(
    () => sync.persistGoHighLevelCommunication({
      serviceClient: communicationCollision.client,
      connection,
      record: {
        id: "message-provider-id-collision",
        messageType: "SMS",
        direction: "inbound",
      },
      match: { customerId: null, leadId: "lead-weathertech" },
    }),
    /another company or connection/i,
    "Cross-company GHL message provider-ID collision must fail safely",
  );
  communicationCollision.assertComplete(
    "Cross-company GHL message collision must stop before any update",
  );
  assert(
    !communicationCollision.calls.some((call) => call.operation === "update"),
    "Cross-company GHL message collision must never update the existing row",
  );

  const callCollision = createScriptedServiceClient([
    {
      table: "communication_provider_events",
      operation: "select",
      result: { data: null, error: null },
    },
    {
      table: "communication_provider_events",
      operation: "insert",
      result: { data: null, error: null },
    },
    {
      table: "call_records",
      operation: "select",
      result: { data: null, error: null },
    },
    {
      table: "call_records",
      operation: "insert",
      result: { data: null, error: { code: "23505" } },
    },
    {
      table: "call_records",
      operation: "select",
      result: {
        data: {
          id: "existing-call",
          company_id: "company-other",
          integration_connection_id: "connection-other",
        },
        error: null,
      },
    },
  ]);
  await assertRejects(
    () => sync.persistGoHighLevelCommunication({
      serviceClient: callCollision.client,
      connection,
      record: {
        id: "call-provider-id-collision",
        messageType: "CALL",
        direction: "inbound",
        callStatus: "missed",
      },
      match: { customerId: null, leadId: "lead-weathertech" },
    }),
    /another company or connection/i,
    "Cross-company GHL call provider-ID collision must fail safely",
  );
  callCollision.assertComplete(
    "Cross-company GHL call collision must stop before any call update",
  );
  assert(
    !callCollision.calls.some(
      (call) => call.table === "call_records" && call.operation === "update",
    ),
    "Cross-company GHL call collision must never update the existing call row",
  );

  const startRoute = readFileSync(
    join(cwd, "app/api/integrations/gohighlevel/oauth/start/route.ts"),
    "utf8",
  );
  const callbackRoute = readFileSync(
    join(cwd, "app/api/oauth/marketplace/callback/route.ts"),
    "utf8",
  );
  const webhookRoute = readFileSync(
    join(cwd, "app/api/integrations/gohighlevel/webhook/route.ts"),
    "utf8",
  );
  const syncRoute = readFileSync(
    join(cwd, "app/api/integrations/gohighlevel/sync/route.ts"),
    "utf8",
  );
  const readinessRoute = readFileSync(
    join(cwd, "app/api/integrations/gohighlevel/readiness/route.ts"),
    "utf8",
  );
  const syncSource = readFileSync(join(cwd, "lib/gohighlevel/sync.ts"), "utf8");
  const migration = readFileSync(
    join(cwd, "supabase/migrations/0036_gohighlevel_oauth_communications_bridge.sql"),
    "utf8",
  );
  const webhookStateMachineMigration = readFileSync(
    join(
      cwd,
      "supabase/migrations/20260902042428_gohighlevel_webhook_durable_state_machine.sql",
    ),
    "utf8",
  );
  const crmApp = readFileSync(join(cwd, "components/CrmApp.tsx"), "utf8");

  assert(
    startRoute.includes('.eq("role", "owner")') &&
      startRoute.includes("state_hash: state.stateHash") &&
      startRoute.includes("httpOnly: true") &&
      startRoute.includes("path: goHighLevelOAuthEndpoints.callback"),
    "OAuth start requires an owner and stores a hashed state in an HttpOnly flow",
  );
  assert(
    callbackRoute.includes("validateGoHighLevelGrantedScopes") &&
      callbackRoute.includes("exchangeGoHighLevelLocationToken") &&
      callbackRoute.includes("resolveGoHighLevelCompanyLocation") &&
      callbackRoute.includes('.neq("company_id", stateRecord.company_id)') &&
      callbackRoute.includes("excludedLocationIds") &&
      callbackRoute.includes("locationResolutionSource") &&
      callbackRoute.includes("encryptGoHighLevelToken") &&
      callbackRoute.includes("location_company_conflict") &&
      callbackRoute.includes("webhooksVerified: false") &&
      callbackRoute.includes("path: goHighLevelOAuthEndpoints.callback"),
    "OAuth callback validates scopes, encrypts tokens, and enforces company isolation",
  );
  assert(
    webhookRoute.indexOf("readBoundedTextBody(") >= 0 &&
      webhookRoute.indexOf("readBoundedTextBody(") <
        webhookRoute.indexOf("JSON.parse(rawBody)") &&
      webhookRoute.includes("verifyGoHighLevelWebhookSignature") &&
      webhookRoute.includes('createHash("sha256").update(rawBody, "utf8")') &&
      webhookRoute.includes("wtos_claim_gohighlevel_webhook_v1") &&
      webhookRoute.includes("wtos_transition_gohighlevel_webhook_v1") &&
      webhookRoute.includes("wtos_finalize_gohighlevel_uninstall_v1") &&
      webhookRoute.includes("parseClaimReceipt") &&
      webhookRoute.includes("parseTransitionReceipt") &&
      webhookRoute.includes("MAX_GHL_WEBHOOK_ATTEMPTS") &&
      webhookRoute.includes('status: 503') &&
      webhookRoute.includes('"Retry-After": "30"') &&
      webhookRoute.includes('includes("uninstall")') &&
      webhookStateMachineMigration.includes("pg_advisory_xact_lock") &&
      webhookStateMachineMigration.includes("lease_expires_at") &&
      webhookStateMachineMigration.includes("provider_max_attempts constant integer := 13"),
    "Webhook route bounds, verifies, raw-hash binds, and atomically transitions durable deliveries with lease-safe bounded provider retry",
  );
  assert(
    !webhookRoute.includes('ok: true, processed: false, message: "Webhook was recorded for retry."'),
    "Failed webhook processing must return a retryable non-2xx response rather than falsely acknowledging delivery",
  );
  assert(
    syncRoute.includes("config.syncEnabled") &&
      syncRoute.includes('.eq("role", "owner")') &&
      syncRoute.includes("synchronizeGoHighLevelConnection"),
    "Manual synchronization is feature-gated and owner-authorized",
  );
  assert(
    readinessRoute.includes('table === "gohighlevel_oauth_credentials"') &&
      readinessRoute.includes('"id, bridge_version"') &&
      readinessRoute.includes(".limit(1)") &&
      !readinessRoute.includes("head: true"),
    "Readiness performs a real schema probe and detects an unapplied bridge migration",
  );
  assert(
    !syncSource.includes('method: "POST"') &&
      !syncSource.includes('method: "PUT"') &&
      !syncSource.includes('method: "DELETE"') &&
      !syncSource.includes('.from("customers").insert') &&
      !syncSource.includes('.from("leads").insert'),
    "Synchronization performs no provider writes and creates no duplicate CRM people",
  );
  assert(
    !syncSource.includes('getDirection(record) ?? "inbound"') &&
      syncSource.includes("if (!direction)") &&
      syncSource.includes('.select("id, company_id, integration_connection_id")') &&
      syncSource.includes('.eq("company_id", connection.company_id)') &&
      syncSource.includes('.eq("integration_connection_id", connection.id)'),
    "GHL communication persistence fails closed on direction and scopes provider identity updates",
  );
  assert(
    migration.includes("revoke all on table public.gohighlevel_oauth_credentials from anon, public, authenticated") &&
      migration.includes("unique (external_location_id)") &&
      migration.includes("bridge_version text not null default '0036'") &&
      migration.includes("unique (integration_connection_id, resource_type, external_id)") &&
      migration.includes("company_id,\n  integration_connection_id,\n  provider,\n  external_object_type") &&
      migration.includes("WTOS users read GoHighLevel resource snapshots"),
    "OAuth schema keeps credentials service-only and provider records company-scoped and idempotent",
  );
  assert(
    crmApp.includes("Connect HighLevel") &&
      crmApp.includes("Sync inbound data") &&
      crmApp.includes("goHighLevelOAuthScopes.map"),
    "Integration Center exposes company OAuth mapping and controlled inbound sync",
  );

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  console.log("GoHighLevel OAuth communications bridge regression tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
