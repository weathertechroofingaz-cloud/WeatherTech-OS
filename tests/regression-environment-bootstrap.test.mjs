import assert from "node:assert/strict";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  REGRESSION_OWNER_MARKER,
  REGRESSION_SUPABASE_PROJECT_REF,
  REQUIRED_DISABLED_SIDE_EFFECT_FLAGS,
  assertOwnedRegressionUser,
  assertZeroCounts,
  validateRegressionEnvironment,
} from "../scripts/regression-environment.mjs";

function jwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
}

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: REGRESSION_SUPABASE_PROJECT_REF }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({
    role: "service_role",
    ref: REGRESSION_SUPABASE_PROJECT_REF,
  }),
  WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF: REGRESSION_SUPABASE_PROJECT_REF,
  WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED: "true",
  WTOS_REGRESSION_OWNER_EMAIL: "weathertech-os-regression@example.test",
  WTOS_REGRESSION_OWNER_PASSWORD: "synthetic-test-password-123",
};

const config = validateRegressionEnvironment(baseEnv);
assert.equal(config.projectRef, REGRESSION_SUPABASE_PROJECT_REF);
assert.equal(config.ownerEmail, "weathertech-os-regression@example.test");

assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` }),
  /approved project|Production Supabase/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF }),
  /Production Supabase/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED: "false" }),
  /must be exactly true/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_REGRESSION_OWNER_EMAIL: "owner@weathertech.example" }),
  /synthetic.*example\.test/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_REGRESSION_OWNER_PASSWORD: "too-short" }),
  /at least 16/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "anon" }) }),
  /service-role credential/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: "another-project" }) }),
  /different project/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: "another-project" }) }),
  /different project/,
);

for (const flag of REQUIRED_DISABLED_SIDE_EFFECT_FLAGS) {
  assert.throws(
    () => validateRegressionEnvironment({ ...baseEnv, [flag]: "true" }),
    new RegExp(flag),
  );
}

const markedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: config.ownerEmail,
  app_metadata: {
    wt_os_regression_marker: REGRESSION_OWNER_MARKER,
    wt_os_regression_project_ref: REGRESSION_SUPABASE_PROJECT_REF,
  },
};
assert.equal(assertOwnedRegressionUser(markedUser, config), markedUser);
assert.throws(
  () => assertOwnedRegressionUser({ ...markedUser, app_metadata: {} }, config),
  /refusing to adopt or delete/,
);
assert.doesNotThrow(() => assertZeroCounts({ one: 0, two: 0 }, "test counts"));
assert.throws(() => assertZeroCounts({ one: 1, two: 0 }, "test counts"), /one=1/);

const source = await import("node:fs").then(({ readFileSync }) =>
  readFileSync(new URL("../scripts/regression-environment.mjs", import.meta.url), "utf8"),
);
const regressionSafetySource = await import("node:fs").then(({ readFileSync }) =>
  readFileSync(
    new URL("../lib/deployment/regressionSafety.ts", import.meta.url),
    "utf8",
  ),
);
const regressionSafetyFlagBlock = regressionSafetySource.slice(
  regressionSafetySource.indexOf("REGRESSION_SIDE_EFFECT_FLAGS"),
  regressionSafetySource.indexOf("] as const"),
);
const browserServerSafetyFlags = [
  ...regressionSafetyFlagBlock.matchAll(/'([A-Z][A-Z0-9_]+)'/g),
].map((match) => match[1]);
assert.deepEqual(
  [...browserServerSafetyFlags].sort(),
  [...REQUIRED_DISABLED_SIDE_EFFECT_FLAGS].sort(),
  "Browser/server and lifecycle side-effect gate inventories stay identical",
);
assert.match(source, /command: "lifecycle-probe"/);
assert.match(source, /const id = randomUUID\(\)/);
assert.match(source, /restDeleteExactId\(config, fetchImpl, "notifications", id\)/);
assert.match(source, /exactIdCleanupVerified: true/);
assert.match(source, /auth\/v1\/logout\?scope=local/);
assert.match(
  source,
  /\["crm_identity_reconciliation_events", "operation_key"\]/,
  "Reconciliation operation markers participate in zero-residue verification",
);
assert.match(
  source,
  /\["crm_identity_reconciliation_events", "actor_user_id"\]/,
  "The synthetic owner cannot be removed while reconciliation audit events reference it",
);
assert.match(
  source,
  /\["lead_accountability_events", "operation_key"\]/,
  "Lead-accountability operation markers participate in zero-residue verification",
);
assert.match(
  source,
  /\["marketing_accountability_operation_receipts", "operation_kind", "\*"\]/,
  "The isolated regression project requires zero durable marketing operation receipts",
);
assert.match(
  source,
  /\["marketing_campaigns", "campaign_name"\]/,
  "Marketing campaign markers participate in zero-residue verification",
);
assert.match(
  source,
  /\["marketing_spend_months", "notes"\]/,
  "Marketing-spend markers participate in zero-residue verification",
);
for (const ownerReference of [
  ["lead_accountability", "owner_user_id"],
  ["lead_accountability", "reviewed_by"],
  ["lead_accountability_events", "actor_user_id"],
  ["marketing_campaigns", "created_by"],
  ["marketing_spend_months", "entered_by"],
]) {
  assert.match(
    source,
    new RegExp(`\\["${ownerReference[0]}", "${ownerReference[1]}"\\]`),
    `Synthetic owner cleanup retains the ${ownerReference.join(".")} reference guard`,
  );
}
assert.match(
  source,
  /"mighty_apes_yelp_webhook_events"/,
  "Mighty Apes delivery evidence must be empty before isolated provider regression",
);
assert.match(
  source,
  /"delivery_id",\s+"TEST WTOS MIGHTY APES REGRESSION:\*"/,
  "Mighty Apes delivery markers participate in zero-residue verification",
);
assert.match(
  source,
  /"provider_lead_id",\s+"TEST WTOS MIGHTY APES REGRESSION:\*"/,
  "Mighty Apes provider-lead markers participate in zero-residue verification",
);
assert.doesNotMatch(source, /readFile(?:Sync)?\s*\(/);
const cleanupSource = source.slice(source.indexOf("async function cleanupOwner"));
assert.ok(
  cleanupSource.indexOf("assertZeroCounts(referenceCounts") <
    cleanupSource.indexOf("/auth/v1/admin/users/${encodeURIComponent(user.id)}"),
  "Owner cleanup refuses non-bootstrap references before deleting the exact marked user",
);
const lifecycleSource = source.slice(source.indexOf("async function lifecycleProbe"));
assert.ok(
  lifecycleSource.indexOf("await verifyCredentialTarget(config, fetchImpl)") <
    lifecycleSource.indexOf("await restInsert(config, fetchImpl"),
  "Lifecycle probe verifies the target before its write",
);

console.log("Regression environment bootstrap safeguards: PASS");
