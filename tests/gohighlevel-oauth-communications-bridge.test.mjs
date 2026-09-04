import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
      rpc(functionName, payload) {
        return consume({
          table: functionName,
          operation: "rpc",
          payload,
          filters: [],
        });
      },
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

function jsonResponse(status, payload, headers = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) ?? null;
      },
    },
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

  // Expose the private orchestration seam only in this temporary compiled copy.
  appendFileSync(
    join(outDir, "gohighlevel", "sync.js"),
    "\nexports.__testSaveResource = saveResource;\n",
  );

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
  assertEqual(
    exchangeRequest.init.headers.Version,
    "v3",
    "Authorization code exchange uses HighLevel's current token API version",
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
        pagination: { hasNextPage: false },
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
    installedLocationsUrl.searchParams.get("pageSize"),
    "100",
    "Installed-location discovery requests no more than the provider's page maximum",
  );
  assertEqual(
    installedLocationsRequest.init.headers.Version,
    "v3",
    "Installed-location discovery uses the current HighLevel API version",
  );

  const paginatedLocationRequests = [];
  const paginatedInstalledLocations =
    await oauth.getGoHighLevelInstalledLocations({
      accessToken: "agency-pagination-access-token",
      companyId: "agency-1",
      fetchImpl: async (url) => {
        const requestUrl = new URL(String(url));
        paginatedLocationRequests.push(requestUrl);
        if (!requestUrl.searchParams.has("pageToken")) {
          return jsonResponse(200, {
            items: [
              {
                _id: "location-weathertech",
                name: "WeatherTech roofing",
                isInstalled: true,
              },
            ],
            pagination: { hasNextPage: true, nextPageToken: "page-2" },
          });
        }
        return jsonResponse(200, {
          items: [
            {
              _id: "location-weathertech",
              name: "WeatherTech roofing",
              isInstalled: true,
            },
            {
              _id: "location-ihc",
              name: "IHC Painting",
              isInstalled: true,
            },
          ],
          pagination: { hasNextPage: false },
        });
      },
    });
  assertEqual(
    paginatedInstalledLocations.ok,
    true,
    "Installed-location discovery follows a documented nextPageToken",
  );
  assertEqual(
    paginatedInstalledLocations.locations.length,
    2,
    "Installed-location discovery deduplicates locations across pages",
  );
  assertEqual(
    paginatedLocationRequests.length,
    2,
    "Installed-location discovery stops after the provider's final page",
  );
  assertEqual(
    paginatedLocationRequests[1].searchParams.get("pageToken"),
    "page-2",
    "Installed-location discovery sends the provider-issued nextPageToken",
  );

  const malformedCursorAccessToken = "must-not-leak-malformed-cursor-token";
  const malformedCursor = await oauth.getGoHighLevelInstalledLocations({
    accessToken: malformedCursorAccessToken,
    companyId: "agency-1",
    fetchImpl: async () =>
      jsonResponse(200, {
        items: [],
        pagination: { hasNextPage: true, nextPageToken: 7 },
      }),
  });
  assertEqual(
    malformedCursor.ok,
    false,
    "Installed-location discovery fails closed on a malformed nextPageToken",
  );
  assert(
    !malformedCursor.error.includes(malformedCursorAccessToken),
    "Installed-location pagination errors never expose the provider access token",
  );

  let repeatedCursorRequests = 0;
  const repeatedCursor = await oauth.getGoHighLevelInstalledLocations({
    accessToken: "agency-repeated-cursor-access-token",
    companyId: "agency-1",
    fetchImpl: async () => {
      repeatedCursorRequests += 1;
      return jsonResponse(200, {
        items: [],
        pagination: {
          hasNextPage: true,
          nextPageToken: "repeated-page-token",
        },
      });
    },
  });
  assertEqual(
    repeatedCursor.ok,
    false,
    "Installed-location discovery fails closed on a repeated nextPageToken",
  );
  assertEqual(
    repeatedCursorRequests,
    2,
    "Repeated cursors stop pagination without an unbounded provider loop",
  );

  let pageLimitRequests = 0;
  const pageLimit = await oauth.getGoHighLevelInstalledLocations({
    accessToken: "agency-page-limit-access-token",
    companyId: "agency-1",
    fetchImpl: async () => {
      pageLimitRequests += 1;
      return jsonResponse(200, {
        items: [{ _id: "location-weathertech", isInstalled: true }],
        pagination: {
          hasNextPage: true,
          nextPageToken: `page-${pageLimitRequests + 1}`,
        },
      });
    },
  });
  assertEqual(
    pageLimit.ok,
    false,
    "Installed-location discovery fails closed at its safe page limit",
  );
  assertEqual(
    pageLimitRequests,
    10,
    "Installed-location discovery performs at most ten provider page reads",
  );

  let locationLimitRequests = 0;
  const locationLimit = await oauth.getGoHighLevelInstalledLocations({
    accessToken: "agency-location-limit-access-token",
    companyId: "agency-1",
    fetchImpl: async () => {
      locationLimitRequests += 1;
      return jsonResponse(200, {
        items: Array.from({ length: 100 }, (_, index) => ({
          _id: `location-${locationLimitRequests}-${index}`,
          isInstalled: true,
        })),
        pagination: {
          hasNextPage: true,
          nextPageToken: `location-page-${locationLimitRequests + 1}`,
        },
      });
    },
  });
  assertEqual(
    locationLimit.ok,
    false,
    "Installed-location discovery fails closed at its safe location limit",
  );
  assertEqual(
    locationLimitRequests,
    6,
    "Installed-location discovery stops as soon as more than 500 locations arrive",
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
        pagination: { hasNextPage: false },
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
        pagination: { hasNextPage: false },
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
          pagination: { hasNextPage: false },
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
      fetchImpl: async () =>
        jsonResponse(200, {
          items: [],
          pagination: { hasNextPage: false },
        }),
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
    fetchImpl: async () =>
      jsonResponse(200, {
        items: [],
        pagination: { hasNextPage: false },
      }),
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
  assertEqual(
    refreshRequest.init.headers.Version,
    "v3",
    "Token refresh uses HighLevel's current token API version",
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
    sleepImpl: async () => {},
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

  let contactSearchRequest;
  const contactSearch = await sync.requestGoHighLevelApi({
    accessToken: "test-token",
    path: "/contacts/search",
    method: "POST",
    version: "v3",
    body: {
      locationId: "location-weathertech",
      page: 1,
      pageLimit: 100,
    },
    fetchImpl: async (url, init) => {
      contactSearchRequest = { url: String(url), init };
      return jsonResponse(200, { contacts: [] });
    },
  });
  assertEqual(contactSearch.ok, true, "Read-only contact search accepts JSON POST");
  assertEqual(
    new URL(contactSearchRequest.url).pathname,
    "/contacts/search",
    "Contact search uses the non-deprecated endpoint",
  );
  assertEqual(
    contactSearchRequest.init.method,
    "POST",
    "Contact search uses the provider-required POST method",
  );
  assertEqual(
    contactSearchRequest.init.headers.Version,
    "v3",
    "Contact search uses the endpoint-specific v3 header",
  );
  assertEqual(
    contactSearchRequest.init.headers["Content-Type"],
    "application/json",
    "Contact search sends a JSON body",
  );
  assertEqual(
    JSON.parse(contactSearchRequest.init.body).locationId,
    "location-weathertech",
    "Contact search body remains location-scoped",
  );

  const retryDelays = [];
  let rateLimitedAttempts = 0;
  const rateLimitedRequest = await sync.requestGoHighLevelApi({
    accessToken: "test-token",
    path: "/opportunities/search",
    fetchImpl: async () => {
      rateLimitedAttempts += 1;
      return rateLimitedAttempts === 1
        ? jsonResponse(429, { message: "slow down" }, { "Retry-After": "2" })
        : jsonResponse(200, { opportunities: [] });
    },
    sleepImpl: async (delayMs) => {
      retryDelays.push(delayMs);
    },
  });
  assertEqual(rateLimitedRequest.ok, true, "Rate-limited reads retry safely");
  assertEqual(rateLimitedAttempts, 2, "Rate-limited read is retried once after success");
  assertEqual(retryDelays[0], 2_000, "Retry-After controls the bounded retry delay");

  let cappedAttempts = 0;
  const cappedRetry = await sync.requestGoHighLevelApi({
    accessToken: "test-token",
    path: "/opportunities/search",
    maxAttempts: 99,
    fetchImpl: async () => {
      cappedAttempts += 1;
      return jsonResponse(503, { message: "still unavailable" });
    },
    sleepImpl: async () => {},
  });
  assertEqual(cappedRetry.ok, false, "Exhausted transient failures are returned safely");
  assertEqual(cappedAttempts, 3, "Provider reads never exceed three attempts");

  const contactPageRequests = [];
  const contactPages = await sync.fetchGoHighLevelContactPages({
    accessToken: "test-token",
    locationId: "location-weathertech",
    pageLimit: 2,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      contactPageRequests.push({ url: String(url), init, body });
      if (body.page === 1) {
        return jsonResponse(200, { contacts: [{ id: "contact-1" }, { id: "contact-2" }] });
      }
      if (body.page === 2) {
        return jsonResponse(200, { contacts: [{ id: "contact-2" }, { id: "contact-3" }] });
      }
      return jsonResponse(200, { contacts: [] });
    },
  });
  assertEqual(contactPages.ok, true, "Contact search pagination completes");
  assertEqual(contactPages.pages, 3, "Full contact pages advance until an empty page");
  assertEqual(contactPages.fetched, 4, "Contact pagination reports provider rows read");
  assertEqual(
    contactPages.records.length,
    3,
    "Contact pagination suppresses duplicate provider identities",
  );
  assertEqual(
    contactPages.duplicatesSuppressed,
    1,
    "Contact pagination reports duplicate suppression",
  );
  assert(
    contactPageRequests.every(
      (request) =>
        request.init.method === "POST" && request.init.headers.Version === "v3",
    ),
    "Every contact page uses v3 POST search",
  );

  const nearPageCeiling = {
    pagesUsed: 9,
    recordsRead: 0,
    ceilingReached: false,
  };
  const pageCeilingResult = await sync.fetchGoHighLevelContactPages({
    accessToken: "test-token",
    locationId: "location-weathertech",
    pageLimit: 1,
    budget: nearPageCeiling,
    fetchImpl: async () => jsonResponse(200, { contacts: [{ id: "contact-1" }] }),
  });
  assertEqual(pageCeilingResult.pages, 1, "Global page budget permits only its final page");
  assertEqual(
    pageCeilingResult.paginationTruncated,
    true,
    "Contact pagination reports a reached global page ceiling",
  );
  assertEqual(nearPageCeiling.pagesUsed, 10, "Resource page ceiling is strictly bounded");

  const nearRecordCeiling = {
    pagesUsed: 0,
    recordsRead: 499,
    ceilingReached: false,
  };
  const recordCeilingResult = await sync.fetchGoHighLevelContactPages({
    accessToken: "test-token",
    locationId: "location-weathertech",
    pageLimit: 2,
    budget: nearRecordCeiling,
    fetchImpl: async () =>
      jsonResponse(200, { contacts: [{ id: "contact-1" }, { id: "contact-2" }] }),
  });
  assertEqual(recordCeilingResult.fetched, 1, "Global record budget admits only remaining capacity");
  assertEqual(
    recordCeilingResult.paginationTruncated,
    true,
    "Contact pagination reports a reached global record ceiling",
  );
  assertEqual(
    nearRecordCeiling.recordsRead,
    500,
    "Resource record ceiling is strictly bounded",
  );

  const opportunityPageRequests = [];
  const opportunityPages = await sync.fetchGoHighLevelOpportunityPages({
    accessToken: "test-token",
    locationId: "location-weathertech",
    pageLimit: 2,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      opportunityPageRequests.push(requestUrl);
      if (requestUrl.searchParams.get("page") === "1") {
        return jsonResponse(200, {
          opportunities: [{ id: "opportunity-1" }, { id: "opportunity-2" }],
          meta: { total: 3, nextPage: 2 },
        });
      }
      return jsonResponse(200, {
        opportunities: [{ id: "opportunity-2" }, { id: "opportunity-3" }],
        meta: { total: 3, nextPage: null },
      });
    },
  });
  assertEqual(opportunityPages.ok, true, "Opportunity pagination follows provider metadata");
  assertEqual(opportunityPages.pages, 2, "Opportunity pagination follows the next page");
  assertEqual(
    opportunityPages.records.length,
    3,
    "Opportunity pagination deduplicates overlapping pages",
  );
  assertEqual(
    opportunityPages.duplicatesSuppressed,
    1,
    "Opportunity pagination reports duplicate suppression",
  );
  assert(
    opportunityPageRequests.every(
      (request) =>
        request.searchParams.get("locationId") === "location-weathertech" &&
        !request.searchParams.has("location_id"),
    ),
    "Opportunity search uses the provider-required locationId query",
  );

  const messagePageRequests = [];
  const messagePages = await sync.fetchGoHighLevelConversationMessagePages({
    accessToken: "test-token",
    locationId: "location-weathertech",
    channel: "SMS",
    pageLimit: 2,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      messagePageRequests.push(requestUrl);
      if (!requestUrl.searchParams.has("cursor")) {
        return jsonResponse(200, {
          messages: [
            { id: "message-1", conversationProviderId: "provider-message-1", locationId: "location-weathertech" },
            { id: "message-2", conversationProviderId: "provider-message-2", locationId: "location-weathertech" },
          ],
          nextCursor: "cursor-2",
          total: 3,
        });
      }
      return jsonResponse(200, {
        messages: [
          { id: "message-2-alias", conversationProviderId: "provider-message-2", locationId: "location-weathertech" },
          { id: "message-3", conversationProviderId: "provider-message-3", locationId: "location-weathertech" },
        ],
        nextCursor: null,
        total: 3,
      });
    },
  });
  assertEqual(messagePages.ok, true, "Location message export pagination completes");
  assertEqual(messagePages.pages, 2, "Location message export follows nextCursor state");
  assertEqual(
    messagePageRequests[1].searchParams.get("cursor"),
    "cursor-2",
    "Location message export sends the provider-issued cursor",
  );
  assertEqual(
    messagePages.records.length,
    4,
    "Message export never collapses distinct canonical message IDs that share provider configuration metadata",
  );
  assertEqual(
    messagePages.duplicatesSuppressed,
    0,
    "Conversation provider configuration IDs are not treated as per-message identities",
  );

  const ambiguousMatch = sync.matchGoHighLevelLocalContact(
    { email: "person@example.test" },
    {
      customers: [{ id: "customer-1", email: "person@example.test", phone: null }],
      leads: [{ id: "lead-1", email: "PERSON@example.test", phone: null }],
    },
  );
  assertEqual(ambiguousMatch.customerId, null, "Ambiguous matches never link a customer");
  assertEqual(ambiguousMatch.leadId, null, "Ambiguous matches never link a lead");
  assertEqual(ambiguousMatch.matchStatus, "ambiguous", "Ambiguous matches are explicit");
  assertEqual(
    ambiguousMatch.matchCandidateCount,
    2,
    "Customer-versus-lead ambiguity reports every candidate",
  );

  const deterministicMatch = sync.matchGoHighLevelLocalContact(
    { phone: "+1 (602) 555-0100" },
    {
      customers: [{ id: "customer-1", email: null, phone: "6025550100" }],
      leads: [],
    },
  );
  assertEqual(
    deterministicMatch.customerId,
    "customer-1",
    "Exactly one normalized local candidate links deterministically",
  );
  assertEqual(
    deterministicMatch.matchStatus,
    "matched_customer",
    "Deterministic customer match records its safe status",
  );

  const unmatchedMatch = sync.matchGoHighLevelLocalContact(
    { email: "new-contact@example.test" },
    { customers: [], leads: [] },
  );
  const contactMatchOutcomes = sync.summarizeGoHighLevelContactMatchOutcomes([
    deterministicMatch,
    { matchStatus: "matched_lead" },
    unmatchedMatch,
    ambiguousMatch,
  ]);
  assertEqual(
    contactMatchOutcomes.matchedCustomer,
    1,
    "Contact result accounting counts exact customer matches",
  );
  assertEqual(
    contactMatchOutcomes.matchedLead,
    1,
    "Contact result accounting counts exact lead matches",
  );
  assertEqual(
    contactMatchOutcomes.unmatched,
    1,
    "Contact result accounting exposes unmatched provider contacts",
  );
  assertEqual(
    contactMatchOutcomes.ambiguous,
    1,
    "Contact result accounting exposes ambiguous provider contacts",
  );

  const ambiguousSnapshot = sync.buildGoHighLevelResourceSnapshot({
    record: { id: "contact-ambiguous", email: "person@example.test" },
    resourceType: "contact",
    connection: {
      id: "connection-weathertech",
      company_id: "company-weathertech",
    },
    match: ambiguousMatch,
  });
  assertEqual(ambiguousSnapshot.customer_id, null, "Ambiguous snapshot has no customer link");
  assertEqual(ambiguousSnapshot.lead_id, null, "Ambiguous snapshot has no lead link");
  assertEqual(
    ambiguousSnapshot.payload_summary.matchStatus,
    "ambiguous",
    "Snapshot summary preserves ambiguity for safe review and AI grounding",
  );
  const unmatchedSnapshot = sync.buildGoHighLevelResourceSnapshot({
    record: { id: "contact-unmatched", email: "new-contact@example.test" },
    resourceType: "contact",
    connection: {
      id: "connection-weathertech",
      company_id: "company-weathertech",
    },
    match: unmatchedMatch,
  });
  assertEqual(
    unmatchedSnapshot.payload_summary.matchStatus,
    "unmatched",
    "Snapshot summary durably preserves a brand-new unmatched contact outcome",
  );
  const durableContactOutcomeStore = createScriptedServiceClient([
    {
      table: "wtos_upsert_gohighlevel_resource_snapshots_v1",
      operation: "rpc",
      result: {
        data: {
          contractVersion: 1,
          companyId: "company-weathertech",
          integrationConnectionId: "connection-weathertech",
          receivedCount: 2,
          savedCount: 2,
          skippedCount: 0,
        },
        error: null,
      },
    },
  ]);
  const contactOutcomePersistence =
    await sync.upsertGoHighLevelResourceSnapshots(
      durableContactOutcomeStore.client,
      {
        id: "connection-weathertech",
        company_id: "company-weathertech",
      },
      [ambiguousSnapshot, unmatchedSnapshot],
    );
  assertEqual(
    contactOutcomePersistence.saved,
    2,
    "Brand-new ambiguous and unmatched contact outcomes are durably stored",
  );
  assertEqual(
    durableContactOutcomeStore.calls[0].payload.p_batch.records[0].payloadSummary
      .matchStatus,
    "ambiguous",
    "Durable snapshot RPC receives the ambiguous outcome",
  );
  assertEqual(
    durableContactOutcomeStore.calls[0].payload.p_batch.records[1].payloadSummary
      .matchStatus,
    "unmatched",
    "Durable snapshot RPC receives the unmatched outcome",
  );
  durableContactOutcomeStore.assertComplete(
    "Contact outcome persistence must consume its exact atomic snapshot RPC",
  );

  const lookupFailureClient = {
    from(table) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        gt() {
          return builder;
        },
        limit() {
          return Promise.resolve({
            data: [],
            error:
              table === "customers"
                ? { message: "sensitive database detail" }
                : null,
          });
        },
      };
      return builder;
    },
  };
  await assertRejects(
    () =>
      sync.resolveGoHighLevelLocalContactMatch({
        serviceClient: lookupFailureClient,
        companyId: "company-weathertech",
        record: { email: "person@example.test" },
      }),
    /^HighLevel local contact lookup failed\.$/,
    "Local lookup errors fail safely without silently producing an unmatched contact",
  );

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
  assertEqual(
    sync.buildGoHighLevelResourceSnapshot({
      record: { title: "Provider row without a canonical identifier" },
      resourceType: "calendar_event",
      connection: {
        id: "connection-weathertech",
        company_id: "company-weathertech",
      },
    }),
    null,
    "Calendar events without canonical provider IDs cannot be persisted as valid snapshots",
  );

  const reviewQuery = sync.buildGoHighLevelReviewQuery({
    locationId: "location-weathertech",
    offset: 25,
    pageLimit: 50,
  });
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
    reviewQuery.offset,
    25,
    "Product review reads use provider offset pagination",
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
      table: "wtos_resolve_gohighlevel_communication_identity_v1",
      operation: "rpc",
      result: {
        data: {
          contractVersion: 1,
          disposition: "created",
          companyId: "company-weathertech",
          integrationConnectionId: "connection-weathertech",
          channel: "sms",
          canonicalExternalId: "message-explicit-outbound",
        },
        error: null,
      },
    },
    {
      table: "wtos_upsert_gohighlevel_communication_v1",
      operation: "rpc",
      result: {
        data: {
          contractVersion: 1,
          disposition: "saved",
          companyId: "company-weathertech",
          integrationConnectionId: "connection-weathertech",
          canonicalExternalId: "message-explicit-outbound",
          communicationEventId: "00000000-0000-4000-8000-000000000001",
          callRecordId: null,
          providerUpdatedAt: "2026-09-04T18:00:00.000Z",
        },
        error: null,
      },
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
      dateAdded: "2026-09-04T18:00:00.000Z",
    },
    match: { customerId: null, leadId: "lead-weathertech" },
  });
  assertEqual(outbound.saved, true, "Explicit outbound GHL SMS remains persisted");
  const outboundInsert = outboundStore.calls.find(
    (call) => call.table === "wtos_upsert_gohighlevel_communication_v1",
  );
  assertEqual(
    outboundInsert.payload.p_communication.direction,
    "outbound",
    "Explicit outbound GHL direction remains authoritative",
  );
  assertEqual(
    outboundInsert.payload.p_communication.status,
    "delivered",
    "Explicit outbound GHL SMS preserves its provider status",
  );
  outboundStore.assertComplete("Explicit outbound persistence must consume its exact DB script");

  const versionedMessageRecord = {
    id: "message-provider-version-guard",
    messageType: "SMS",
    direction: "inbound",
    status: "received",
    dateAdded: "2026-09-04T17:59:00.000Z",
    dateUpdated: "2026-09-04T18:00:00.000Z",
    locationId: "location-weathertech",
  };
  const versionedMessageIdentity = {
    disposition: "resolved",
    channel: "sms",
    canonicalExternalId: versionedMessageRecord.id,
  };
  const makeCommunicationReceipt = (disposition, providerUpdatedAt) => ({
    contractVersion: 1,
    disposition,
    companyId: "company-weathertech",
    integrationConnectionId: "connection-weathertech",
    canonicalExternalId: versionedMessageRecord.id,
    communicationEventId: "00000000-0000-4000-8000-000000000021",
    callRecordId: null,
    providerUpdatedAt,
  });
  const makeIdentityReceipt = () => ({
    contractVersion: 1,
    disposition: "resolved",
    companyId: "company-weathertech",
    integrationConnectionId: "connection-weathertech",
    channel: "sms",
    canonicalExternalId: versionedMessageRecord.id,
  });

  const newerProviderVersionStore = createScriptedServiceClient([
    {
      table: "wtos_upsert_gohighlevel_communication_v1",
      operation: "rpc",
      result: {
        data: makeCommunicationReceipt(
          "stale",
          "2026-09-04T18:05:00.000Z",
        ),
        error: null,
      },
    },
  ]);
  const newerProviderVersion = await sync.persistGoHighLevelCommunication({
    serviceClient: newerProviderVersionStore.client,
    connection,
    record: versionedMessageRecord,
    identity: versionedMessageIdentity,
  });
  assertEqual(
    newerProviderVersion.snapshotSafe,
    false,
    "A newer authoritative provider version makes the incoming snapshot unsafe",
  );
  newerProviderVersionStore.assertComplete(
    "Newer provider-version handling must consume only its communication RPC",
  );

  const staleSnapshotGuardStore = createScriptedServiceClient([
    {
      table: "wtos_resolve_gohighlevel_communication_identity_v1",
      operation: "rpc",
      result: { data: makeIdentityReceipt(), error: null },
    },
    {
      table: "wtos_upsert_gohighlevel_communication_v1",
      operation: "rpc",
      result: {
        data: makeCommunicationReceipt(
          "stale",
          "2026-09-04T18:05:00.000Z",
        ),
        error: null,
      },
    },
  ]);
  const staleSnapshotGuard = await sync.__testSaveResource({
    serviceClient: staleSnapshotGuardStore.client,
    connection,
    resourceType: "message",
    records: [versionedMessageRecord],
    contactMatches: new Map(),
  });
  assertEqual(
    staleSnapshotGuard.saved,
    0,
    "A stale incoming communication does not claim a snapshot save",
  );
  assert(
    !staleSnapshotGuardStore.calls.some(
      (call) => call.table === "wtos_upsert_gohighlevel_resource_snapshots_v1",
    ),
    "A newer authoritative provider version prevents every snapshot batch call",
  );
  staleSnapshotGuardStore.assertComplete(
    "Stale communication persistence must stop before snapshot batching",
  );

  const sameProviderVersionStore = createScriptedServiceClient([
    {
      table: "wtos_upsert_gohighlevel_communication_v1",
      operation: "rpc",
      result: {
        data: makeCommunicationReceipt(
          "same_version",
          versionedMessageRecord.dateUpdated,
        ),
        error: null,
      },
    },
  ]);
  const sameProviderVersion = await sync.persistGoHighLevelCommunication({
    serviceClient: sameProviderVersionStore.client,
    connection,
    record: versionedMessageRecord,
    identity: versionedMessageIdentity,
  });
  assertEqual(
    sameProviderVersion.snapshotSafe,
    true,
    "An exact same-version receipt remains snapshot-safe for crash repair",
  );
  sameProviderVersionStore.assertComplete(
    "Same-version handling must consume only its communication RPC",
  );

  const sameVersionCrashRepairStore = createScriptedServiceClient([
    {
      table: "wtos_resolve_gohighlevel_communication_identity_v1",
      operation: "rpc",
      result: { data: makeIdentityReceipt(), error: null },
    },
    {
      table: "wtos_upsert_gohighlevel_communication_v1",
      operation: "rpc",
      result: {
        data: makeCommunicationReceipt(
          "same_version",
          versionedMessageRecord.dateUpdated,
        ),
        error: null,
      },
    },
    {
      table: "wtos_upsert_gohighlevel_resource_snapshots_v1",
      operation: "rpc",
      result: {
        data: {
          contractVersion: 1,
          companyId: "company-weathertech",
          integrationConnectionId: "connection-weathertech",
          receivedCount: 1,
          savedCount: 1,
          skippedCount: 0,
        },
        error: null,
      },
    },
  ]);
  const sameVersionCrashRepair = await sync.__testSaveResource({
    serviceClient: sameVersionCrashRepairStore.client,
    connection,
    resourceType: "message",
    records: [versionedMessageRecord],
    contactMatches: new Map(),
  });
  assertEqual(
    sameVersionCrashRepair.saved,
    1,
    "An exact same-version receipt allows the missing snapshot to be repaired",
  );
  assert(
    sameVersionCrashRepairStore.calls.some(
      (call) => call.table === "wtos_upsert_gohighlevel_resource_snapshots_v1",
    ),
    "Crash repair sends the exact same provider version to the snapshot batch RPC",
  );
  sameVersionCrashRepairStore.assertComplete(
    "Same-version crash repair must complete its snapshot batch",
  );

  const voicemailStore = createScriptedServiceClient([
    {
      table: "wtos_resolve_gohighlevel_communication_identity_v1",
      operation: "rpc",
      result: {
        data: {
          contractVersion: 1,
          disposition: "created",
          companyId: "company-weathertech",
          integrationConnectionId: "connection-weathertech",
          channel: "voice",
          canonicalExternalId: "call-voicemail",
        },
        error: null,
      },
    },
    {
      table: "wtos_upsert_gohighlevel_communication_v1",
      operation: "rpc",
      result: {
        data: {
          contractVersion: 1,
          disposition: "saved",
          companyId: "company-weathertech",
          integrationConnectionId: "connection-weathertech",
          canonicalExternalId: "call-voicemail",
          communicationEventId: "00000000-0000-4000-8000-000000000002",
          callRecordId: "00000000-0000-4000-8000-000000000003",
          providerUpdatedAt: "2026-09-04T18:00:00.000Z",
        },
        error: null,
      },
    },
  ]);
  const voicemail = await sync.persistGoHighLevelCommunication({
    serviceClient: voicemailStore.client,
    connection,
    record: {
      id: "call-voicemail",
      messageType: "CALL",
      direction: "inbound",
      callStatus: "voicemail",
      dateAdded: "2026-09-04T18:00:00.000Z",
    },
  });
  assertEqual(voicemail.saved, true, "Inbound voicemail persists as a call event");
  const voicemailInsert = voicemailStore.calls.find(
    (call) => call.table === "wtos_upsert_gohighlevel_communication_v1",
  );
  assertEqual(
    voicemailInsert.payload.p_communication.status,
    "voicemail",
    "Voicemail keeps its distinct normalized call status",
  );
  assertEqual(
    voicemailInsert.payload.p_communication.channel,
    "voice",
    "Voicemail uses the atomic voice communication path",
  );
  voicemailStore.assertComplete("Voicemail persistence must consume its exact DB script");

  const communicationCollision = createScriptedServiceClient([
    {
      table: "wtos_resolve_gohighlevel_communication_identity_v1",
      operation: "rpc",
      result: {
        data: {
          contractVersion: 1,
          disposition: "conflict",
          companyId: "company-weathertech",
          integrationConnectionId: "connection-weathertech",
          channel: "sms",
          canonicalExternalId: null,
        },
        error: null,
      },
    },
  ]);
  const communicationConflict = await sync.persistGoHighLevelCommunication({
    serviceClient: communicationCollision.client,
    connection,
    record: {
      id: "message-provider-id-collision",
      messageType: "SMS",
      direction: "inbound",
      dateAdded: "2026-09-04T18:00:00.000Z",
    },
    match: { customerId: null, leadId: "lead-weathertech" },
  });
  assertEqual(
    communicationConflict.saved,
    false,
    "Identity conflicts must not persist a communication",
  );
  assertEqual(
    communicationConflict.ignored,
    false,
    "Identity conflicts remain actionable rather than silently ignored",
  );
  assertEqual(
    communicationConflict.error,
    "provider_identity_conflict",
    "Identity conflicts return their durable reconciliation state",
  );
  communicationCollision.assertComplete(
    "Cross-company GHL message collision must stop before any update",
  );
  assert(
    !communicationCollision.calls.some(
      (call) => call.table === "wtos_upsert_gohighlevel_communication_v1",
    ),
    "Identity conflicts must stop before the atomic communication write",
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
  const legacyTestRoute = readFileSync(
    join(cwd, "app/api/integrations/gohighlevel/test/route.ts"),
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
  const communicationsSource = readFileSync(
    join(cwd, "lib/crm/communications.ts"),
    "utf8",
  );

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
    webhookRoute.includes('communicationIdentity.disposition === "conflict"') &&
      webhookRoute.includes('communicationIdentity.disposition === "incomplete"') &&
      webhookRoute.includes('transitionWebhook("ignored")') &&
      webhookRoute.includes("reconciliationRequired: true"),
    "Deterministic communication identity quarantines must be acknowledged without exhausting provider retries",
  );
  assert(
    syncRoute.includes("config.syncEnabled") &&
      syncRoute.includes('.eq("role", "owner")') &&
      syncRoute.includes("synchronizeGoHighLevelConnection"),
    "Manual synchronization is feature-gated and owner-authorized",
  );
  assert(
    readinessRoute.includes('table === "gohighlevel_oauth_credentials"') &&
      readinessRoute.includes("refresh_lease_expires_at") &&
      readinessRoute.includes('table === "integration_sync_logs"') &&
      readinessRoute.includes("claim_token_sha256, lease_expires_at") &&
      readinessRoute.includes(".limit(1)") &&
      !readinessRoute.includes("head: true"),
    "Readiness performs a real schema probe and detects an unapplied bridge migration",
  );
  assert(
    legacyTestRoute.includes("goHighLevelReadinessEndpoint") &&
      legacyTestRoute.includes("status: 410") &&
      legacyTestRoute.includes('"Cache-Control": "no-store"') &&
      !legacyTestRoute.includes("testGoHighLevelConnection") &&
      !legacyTestRoute.includes("serverClient") &&
      !legacyTestRoute.includes("request.nextUrl") &&
      !legacyTestRoute.includes("GHL_PRIVATE_INTEGRATION_TOKEN") &&
      !legacyTestRoute.includes("configuredLocationIds") &&
      !legacyTestRoute.includes("tokenConfigured"),
    "Legacy private-token diagnostics are non-operational and disclose only the owner readiness route",
  );
  assert(
    (syncSource.match(/method: "POST"/g) ?? []).length === 1 &&
      syncSource.includes('path: "/contacts/search"') &&
      syncSource.includes('sort: [{ field: "dateUpdated", direction: "desc" }]') &&
      syncSource.includes('query: { locationId, limit, page, order: "added_desc" }') &&
      !syncSource.includes('path: "/contacts/"') &&
      !syncSource.includes('method: "PUT"') &&
      !syncSource.includes('method: "DELETE"') &&
      !syncSource.includes('.from("customers").insert') &&
      !syncSource.includes('.from("customers").update') &&
      !syncSource.includes('.from("customers").delete') &&
      !syncSource.includes('.from("leads").insert') &&
      !syncSource.includes('.from("leads").update') &&
      !syncSource.includes('.from("leads").delete'),
    "Synchronization uses only the required read-only contact-search POST and never mutates core CRM people",
  );
  assert(
    syncSource.includes("const unresolvedContactCount =") &&
      syncSource.includes("contactsSaved.failed +\n      unresolvedContactCount") &&
      syncSource.includes("contactMatchOutcomes,") &&
      readinessRoute.includes("getContactMatchStatus(snapshot.payload_summary)") &&
      readinessRoute.includes("conflictCount > 0") &&
      readinessRoute.includes("unresolvedContacts > 0") &&
      readinessRoute.includes("unmatchedContacts,") &&
      readinessRoute.includes("ambiguousContacts,"),
    "Brand-new unmatched and ambiguous contact outcomes remain durable, explicit, and readiness-blocking",
  );
  assert(
    syncSource.includes(
      "const communicationRequestBudgets: GoHighLevelRequestBudget[] = []",
    ) &&
      syncSource.includes("const smsRequestBudget = createCommunicationRequestBudget()") &&
      syncSource.includes("const emailRequestBudget = createCommunicationRequestBudget()") &&
      syncSource.includes("const callRequestBudget = createCommunicationRequestBudget()") &&
      syncSource.includes("paginationTruncated: messageRead.paginationTruncated") &&
      !syncSource.includes("Number(messageRead.paginationTruncated)") &&
      !syncSource.includes("Number(emailRead.paginationTruncated)") &&
      !syncSource.includes("Number(callRead.paginationTruncated)"),
    "Bounded recent history stays observable without falsely failing sync, and communications cannot be starved by earlier resources",
  );
  assert(
    syncSource.includes("calendarEventsWithoutCanonicalId.push(event)") &&
      syncSource.includes("records: calendarEvents,") &&
      syncSource.includes(
        "message: calendarEventFetchFailures || calendarEventsSaved.failed",
      ),
    "Calendar events without canonical IDs reach snapshot validation and count as visible failures",
  );
  assert(
    !syncSource.includes('getDirection(record) ?? "inbound"') &&
      syncSource.includes("if (!direction)") &&
      syncSource.includes('"wtos_resolve_gohighlevel_communication_identity_v1"') &&
      syncSource.includes('"wtos_upsert_gohighlevel_communication_v1"') &&
      syncSource.includes("companyId: connection.company_id") &&
      syncSource.includes("integrationConnectionId: connection.id"),
    "GHL communication persistence fails closed on direction and uses exact-company atomic RPCs",
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
  assert(
    /const primaryGoHighLevelConnection\s*=\s*goHighLevelConnections\.find\([\s\S]*?connection\.company_id === goHighLevelCompanyId,[\s\S]*?\) \?\? null;/.test(
      crmApp,
    ) &&
      /const goHighLevelSyncLogs = snapshot\.integrationSyncLogs\.filter\(\s*\(log\) =>\s*log\.provider === "gohighlevel" &&\s*log\.company_id === goHighLevelCompanyId,\s*\);/.test(
        crmApp,
      ),
    "GoHighLevel connection and sync-log status stay scoped to the selected company",
  );
  assert(
    !crmApp.includes("GoHighLevelLiveSyncFoundationPanel") &&
      !crmApp.includes("GoHighLevel Live Synchronization Foundation") &&
      crmApp.includes("Marketplace OAuth communications bridge"),
    "Settings exposes the Marketplace OAuth panel without the contradictory legacy foundation",
  );
  assert(
    crmApp.includes("new URLSearchParams({ companyId: requestedCompanyId })") &&
      crmApp.includes("result.selectedCompanyId !== requestedCompanyId") &&
      crmApp.includes(
        "result.companies.some((company) => company.companyId === requestedCompanyId)",
      ) &&
      crmApp.includes("setGoHighLevelReadinessResult(null)") &&
      crmApp.includes("goHighLevelReadinessRequestSequenceRef.current") &&
      crmApp.includes(
        "requestSequence !== goHighLevelReadinessRequestSequenceRef.current",
      ) &&
      crmApp.includes("goHighLevelCompanyIdRef.current !== requestedCompanyId") &&
      !crmApp.includes("?probe=1&pipelines=1"),
    "Readiness requests and responses remain bound to the exact selected company and reject stale state",
  );
  assert(
    crmApp.includes('data-testid="gohighlevel-company-operational-health"') &&
      crmApp.includes("goHighLevelCompanyReadiness.authenticated") &&
      crmApp.includes("goHighLevelCompanyReadiness.scopesValid") &&
      crmApp.includes("goHighLevelCompanyReadiness.tokenState") &&
      crmApp.includes("goHighLevelCompanyReadiness.resources.byType") &&
      crmApp.includes("goHighLevelCompanyReadiness.webhooks.duplicatesSuppressed") &&
      crmApp.includes("goHighLevelCompanyReadiness.automationEvents.communications") &&
      crmApp.includes(".customerFacingActionsEnabled") &&
      crmApp.includes("Customer-facing actions disabled") &&
      crmApp.includes("phoneCapabilities.twilioRoutingPreserved"),
    "Settings exposes exact-company OAuth, sync, resource, webhook, automation, and phone-boundary health",
  );
  assert(
    crmApp.includes('"content_and_metadata"') &&
      crmApp.includes("Content + metadata") &&
      !crmApp.includes('"dry_run_preview"') &&
      !crmApp.includes("Dry run lead sync") &&
      !crmApp.includes("handleRunGoHighLevelLeadDryRun") &&
      !crmApp.includes("goHighLevelEnvVars"),
    "Marketplace OAuth is the only GHL synchronization lane and uses the current resource modes",
  );
  assert(
    crmApp.includes('"/api/integrations/gohighlevel/webhook/requeue"') &&
      crmApp.includes("eventId: failure.eventId") &&
      crmApp.includes("expectedAttemptCount: failure.attemptCount") &&
      crmApp.includes("failure.attemptCount < 1") &&
      crmApp.includes("failure.awaitingSignedRedelivery") &&
      crmApp.includes("Requeue for signed redelivery") &&
      !crmApp.includes("handleQueueGoHighLevelRetry") &&
      !crmApp.includes("Queue retry dry run") &&
      !crmApp.includes("buildIntegrationSyncRetryableUpdate"),
    "Failed webhook controls use the durable signed-redelivery requeue API without a fake sync-log retry",
  );
  assert(
    communicationsSource.includes(
      "const provider = getIntegrationInboxProvider(record.provider);",
    ) &&
      communicationsSource.includes(
        "const provider = getIntegrationInboxProvider(event.provider);",
      ) &&
      (communicationsSource.match(/sourceLabel: inboxProviderLabels\[provider\]/g) ?? [])
        .length >= 2,
    "Call records and provider events preserve GoHighLevel labeling while normalizing Twilio providers",
  );

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  console.log("GoHighLevel OAuth communications bridge regression tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
