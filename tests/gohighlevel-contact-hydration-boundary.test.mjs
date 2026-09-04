import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-ghl-contact-hydration-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");
const compile = spawnSync(
  tsc,
  [
    "lib/gohighlevel/oauth.ts",
    "lib/gohighlevel/sync.ts",
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
  rmSync(outDir, { recursive: true, force: true });
  throw new Error(
    `Could not compile GoHighLevel contact hydration modules.\n${compile.stdout}\n${compile.stderr}`,
  );
}

const sync = await import(
  pathToFileURL(join(outDir, "gohighlevel", "sync.js"))
);
const syncSource = readFileSync(join(cwd, "lib/gohighlevel/sync.ts"), "utf8");

test.after(() => {
  rmSync(outDir, { recursive: true, force: true });
});

const connection = {
  id: "connection-weathertech",
  company_id: "company-weathertech",
  provider: "gohighlevel",
  status: "connected",
  external_account_id: "location-weathertech",
};

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() {
      return payload;
    },
  };
}

function createServiceClient({ selects = [], inserts = [] } = {}) {
  const selectResults = [...selects];
  const insertResults = [...inserts];
  const calls = [];
  return {
    calls,
    assertComplete() {
      assert.equal(selectResults.length, 0, "every expected mapping lookup ran");
      assert.equal(insertResults.length, 0, "every expected mapping insert ran");
    },
    client: {
      from(table) {
        let operation = null;
        let payload = null;
        let columns = null;
        const filters = [];
        const builder = {
          select(value) {
            operation ??= "select";
            columns = value;
            return builder;
          },
          update(value) {
            operation = "update";
            payload = value;
            return builder;
          },
          insert(value) {
            calls.push({ table, operation: "insert", payload: value, filters: [] });
            const result = insertResults.shift();
            assert.ok(result, `unexpected insert on ${table}`);
            return Promise.resolve(result);
          },
          eq(column, value) {
            filters.push([column, value]);
            return builder;
          },
          maybeSingle() {
            calls.push({ table, operation, payload, columns, filters });
            const result = selectResults.shift();
            assert.ok(result, `unexpected ${operation} on ${table}`);
            return Promise.resolve(result);
          },
        };
        return builder;
      },
    },
  };
}

function requestBudget(maxAttempts = 40) {
  return sync.createGoHighLevelRequestBudget({
    deadlineMs: 30_000,
    maxAttempts,
  });
}

test("hydrates every communication channel before persistence with shared deduplication", () => {
  const sharedAttempts = syncSource.indexOf(
    "const attemptedCommunicationContactIds = new Set<string>()",
  );
  assert.ok(sharedAttempts >= 0, "one run-scoped contact-attempt set is present");

  for (const [resource, budget] of [
    ["message", "smsRequestBudget"],
    ["email", "emailRequestBudget"],
    ["call", "callRequestBudget"],
  ]) {
    const read = syncSource.indexOf(`const ${resource}Read =`);
    const hydration = syncSource.indexOf(`const ${resource}ContactHydration =`);
    const saved = syncSource.indexOf(`const ${resource}Saved =`);
    assert.ok(read >= 0 && read < hydration, `${resource} hydration follows its provider read`);
    assert.ok(
      hydration < saved,
      `${resource} hydration runs before snapshots or communication rows are saved`,
    );
    const hydrationBlock = syncSource.slice(hydration, saved);
    assert.ok(
      hydrationBlock.includes(
        "attemptedContactIds: attemptedCommunicationContactIds",
      ),
      `${resource} shares run-scoped distinct-ID deduplication`,
    );
    assert.ok(
      hydrationBlock.includes(`requestBudget: ${budget}`),
      `${resource} retains its independent provider budget`,
    );
  }
});

test("hydrates each distinct missing communication contact with one exact-scoped GET", async () => {
  const database = createServiceClient({
    selects: [
      { data: null, error: null },
      { data: null, error: null },
    ],
    inserts: [{ error: null }],
  });
  const contactMatches = new Map([
    [
      "known-contact",
      {
        customerId: "known-customer",
        leadId: null,
        matchStatus: "matched_customer",
        matchCandidateCount: 1,
      },
    ],
  ]);
  const requests = [];

  const result = await sync.hydrateGoHighLevelCommunicationContactMatches({
    serviceClient: database.client,
    connection,
    accessToken: "test-access-token",
    records: [
      { id: "message-1", contactId: "contact/older" },
      { id: "message-2", contactId: "contact/older" },
      { id: "message-3", contactId: "known-contact" },
    ],
    contactMatches,
    local: {
      customers: [
        {
          id: "customer-older",
          email: "older@example.test",
          phone: null,
        },
      ],
      leads: [],
    },
    attemptedContactIds: new Set(),
    requestBudget: requestBudget(),
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(200, {
        contact: {
          id: "contact/older",
          locationId: "location-weathertech",
          email: "OLDER@example.test",
          futureProviderField: true,
        },
      });
    },
  });

  assert.deepEqual(result, {
    attempted: 1,
    matched: 1,
    unresolved: 0,
    failed: 0,
    truncated: false,
  });
  assert.equal(requests.length, 1, "duplicate and already-known IDs make no extra GETs");
  assert.equal(
    new URL(requests[0].url).pathname,
    "/contacts/contact%2Folder",
    "contact ID is path encoded",
  );
  assert.equal(requests[0].init.method, "GET", "hydration is read-only");
  assert.equal(requests[0].init.headers.Version, "v3", "hydration uses v3");
  assert.equal(
    contactMatches.get("contact/older")?.customerId,
    "customer-older",
    "validated contact installs the exact same-company local match",
  );
  const insert = database.calls.find((call) => call.operation === "insert");
  assert.equal(insert?.table, "gohighlevel_sync_mappings");
  assert.equal(insert?.payload.company_id, "company-weathertech");
  assert.equal(insert?.payload.integration_connection_id, "connection-weathertech");
  assert.equal(insert?.payload.external_location_id, "location-weathertech");
  assert.equal(insert?.payload.external_id, "contact/older");
  assert.equal(insert?.payload.local_table, "customers");
  assert.equal(insert?.payload.local_record_id, "customer-older");
  database.assertComplete();
});

test("rejects malformed or cross-location responses without creating an authoritative match", async () => {
  const invalidPayloads = [
    {
      label: "bare contact",
      payload: {
        id: "contact-missing",
        locationId: "location-weathertech",
      },
    },
    {
      label: "wrong contact",
      payload: {
        contact: {
          id: "another-contact",
          locationId: "location-weathertech",
        },
      },
    },
    {
      label: "missing location",
      payload: { contact: { id: "contact-missing" } },
    },
    {
      label: "wrong location",
      payload: {
        contact: {
          id: "contact-missing",
          locationId: "location-ihc",
        },
      },
    },
  ];

  for (const scenario of invalidPayloads) {
    const contactMatches = new Map();
    const attemptedContactIds = new Set();
    let providerRequests = 0;
    const result = await sync.hydrateGoHighLevelCommunicationContactMatches({
      serviceClient: {
        from() {
          throw new Error(`${scenario.label} must not reach mapping persistence`);
        },
      },
      connection,
      accessToken: "test-access-token",
      records: [{ contactId: "contact-missing" }],
      contactMatches,
      local: { customers: [], leads: [] },
      attemptedContactIds,
      requestBudget: requestBudget(),
      fetchImpl: async () => {
        providerRequests += 1;
        return jsonResponse(200, scenario.payload);
      },
    });

    assert.equal(result.failed, 1, `${scenario.label} is observable as failed`);
    assert.equal(contactMatches.size, 0, `${scenario.label} never becomes authoritative`);
    assert.equal(providerRequests, 1);

    const repeated = await sync.hydrateGoHighLevelCommunicationContactMatches({
      serviceClient: {},
      connection,
      accessToken: "test-access-token",
      records: [{ contactId: "contact-missing" }],
      contactMatches,
      local: { customers: [], leads: [] },
      attemptedContactIds,
      requestBudget: requestBudget(),
      fetchImpl: async () => {
        throw new Error("failed hydration must not repeat in another channel");
      },
    });
    assert.equal(repeated.attempted, 0, `${scenario.label} remains deduplicated this run`);
  }
});

test("keeps a validated ambiguous contact non-authoritative and never chooses a local record", async () => {
  const database = createServiceClient({
    selects: [{ data: null, error: null }],
  });
  const contactMatches = new Map();
  const result = await sync.hydrateGoHighLevelCommunicationContactMatches({
    serviceClient: database.client,
    connection,
    accessToken: "test-access-token",
    records: [{ contactId: "contact-ambiguous" }],
    contactMatches,
    local: {
      customers: [
        { id: "customer-1", email: "shared@example.test", phone: null },
      ],
      leads: [{ id: "lead-1", email: "shared@example.test", phone: null }],
    },
    attemptedContactIds: new Set(),
    requestBudget: requestBudget(),
    fetchImpl: async () =>
      jsonResponse(200, {
        contact: {
          id: "contact-ambiguous",
          locationId: "location-weathertech",
          email: "shared@example.test",
        },
      }),
  });

  assert.equal(result.unresolved, 1);
  assert.equal(result.matched, 0);
  assert.equal(
    contactMatches.has("contact-ambiguous"),
    false,
    "ambiguous nulls cannot become authoritative communication associations",
  );
  assert.equal(
    database.calls.some((call) => call.operation === "insert"),
    false,
    "ambiguity never inserts a chosen mapping",
  );
  database.assertComplete();
});

test("enforces the per-channel distinct-contact cap and leaves the tail retryable", async () => {
  const database = createServiceClient({
    selects: [
      { data: null, error: null },
      { data: null, error: null },
    ],
  });
  const contactMatches = new Map();
  const attemptedContactIds = new Set();
  const requests = [];
  const result = await sync.hydrateGoHighLevelCommunicationContactMatches({
    serviceClient: database.client,
    connection,
    accessToken: "test-access-token",
    records: [
      { contactId: "contact-1" },
      { contactId: "contact-2" },
      { contactId: "contact-3" },
    ],
    contactMatches,
    local: { customers: [], leads: [] },
    attemptedContactIds,
    requestBudget: requestBudget(),
    maxLookups: 2,
    fetchImpl: async (url) => {
      const contactId = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
      requests.push(contactId);
      return jsonResponse(200, {
        contact: {
          id: contactId,
          locationId: "location-weathertech",
        },
      });
    },
  });

  assert.deepEqual(requests, ["contact-1", "contact-2"]);
  assert.deepEqual(result, {
    attempted: 2,
    matched: 0,
    unresolved: 2,
    failed: 0,
    truncated: true,
  });
  assert.equal(attemptedContactIds.has("contact-3"), false);
  assert.equal(contactMatches.has("contact-3"), false);
  database.assertComplete();
});

test("stops at the provider request budget without mapping failed lookups", async () => {
  const contactMatches = new Map();
  const attemptedContactIds = new Set();
  let providerRequests = 0;
  const result = await sync.hydrateGoHighLevelCommunicationContactMatches({
    serviceClient: {},
    connection,
    accessToken: "test-access-token",
    records: [
      { contactId: "contact-1" },
      { contactId: "contact-2" },
      { contactId: "contact-3" },
    ],
    contactMatches,
    local: { customers: [], leads: [] },
    attemptedContactIds,
    requestBudget: requestBudget(1),
    fetchImpl: async () => {
      providerRequests += 1;
      return jsonResponse(404, { statusCode: 404 });
    },
  });

  assert.equal(providerRequests, 1, "budget prevents additional provider calls");
  assert.equal(result.attempted, 1, "only an actual provider GET counts as attempted");
  assert.equal(result.failed, 2);
  assert.equal(result.truncated, true);
  assert.equal(contactMatches.size, 0);
  assert.equal(
    attemptedContactIds.has("contact-2"),
    false,
    "a budget-blocked ID remains available to a later channel's fresh budget",
  );
  assert.equal(attemptedContactIds.has("contact-3"), false);
});
