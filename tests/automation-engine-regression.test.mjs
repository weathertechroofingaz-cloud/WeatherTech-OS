import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTOMATION_ENGINE_REGRESSION_RUN,
  loadAutomationRegressionEnvironment,
  runAutomationEngineRegression,
} from "../scripts/automation-engine-regression.mjs";

const cwd = process.cwd();
const source = readFileSync(join(cwd, "scripts/automation-engine-regression.mjs"), "utf8");

assert.throws(
  () => loadAutomationRegressionEnvironment({ cwd, runtimeEnv: {} }),
  /external|environment file|never reads \.env\.local/i,
);
assert.throws(
  () => loadAutomationRegressionEnvironment({
    cwd,
    runtimeEnv: {
      WTOS_BROWSER_REGRESSION_ENV_FILE: "/tmp/nonexistent-wtos-automation-env",
      NEXT_PUBLIC_SUPABASE_URL: "https://gahfcgyjtfwwmsterhzu.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
    },
  }),
  /only from WTOS_BROWSER_REGRESSION_ENV_FILE/i,
);

for (const contract of [
  "hygtnhmmaoboduqghhwg",
  "gahfcgyjtfwwmsterhzu",
  "This runner never reads .env.local",
  'command: "verify"',
  "createNetworkGuard",
  "url.origin !== allowedOrigin",
  "wtos_set_automation_rule_enabled_v1",
  "wtos_run_automation_worker_v1",
  "wtos_reserve_ai_request_v1",
  "wtos_review_ai_action_v1",
  "Future snooze must not emit task.due early",
  "Disabling rule must cancel queued execution",
  "Authenticated forged AI audit row",
  "Direct immutable ledger delete",
  "Explicit outbound GHL SMS must emit no inbound automation event",
  "GHL inbound SMS needs_review-to-matched reconciliation must emit exactly once",
  "Repeated eligible GHL SMS reconciliation must remain exactly once",
  "GHL SMS RECONCILIATION PAUSED",
  "GHL SMS RECONCILIATION CROSS COMPANY",
  "GHL SMS RECONCILIATION OUTBOUND",
  "GHL SMS RECONCILIATION WRONG TYPE",
  "GHL SMS needs_review-to-matched update must emit zero automation events",
  "matched GHL SMS must emit exactly once after binding correction",
  "corrected GHL SMS replay must remain exactly once",
  "GHL missed + needs_review-to-matched reconciliation must emit exactly once",
  "Repeated eligible GHL missed-call reconciliation must remain exactly once",
  "GHL MISSED CALL RECONCILIATION PAUSED",
  "GHL MISSED CALL RECONCILIATION CROSS COMPANY",
  "GHL MISSED CALL RECONCILIATION OUTBOUND",
  "GHL COMPLETED CALL RECONCILIATION",
  "GHL call needs_review-to-matched update must emit zero automation events",
  "matched GHL missed call must emit exactly once after binding correction",
  "corrected GHL missed-call replay must remain exactly once",
  "TWILIO SMS ROUTING RECONCILIATION",
  "Twilio SMS needs_review-to-matched update must preserve insert-only behavior",
  "TWILIO MISSED CALL ROUTING RECONCILIATION",
  "Twilio missed plus needs_review-to-matched routing update must emit zero events",
  "TWILIO CALL STATUS TRANSITION",
  "Twilio non-missed-to-missed status transition must emit exactly once",
  "Repeated Twilio missed status update must remain exactly once",
  "Missing GHL direction",
  "Unrecognized GHL direction",
  "Cross-company GHL provider identity collision",
  'command: "verify-residue"',
  "cleanupResidue",
  "providerNetworkRequests",
]) {
  assert.ok(source.includes(contract), `Regression runner must retain ${contract}`);
}
assert.doesNotMatch(source, /resolve\(cwd, ["']\.env\.local["']\)|dotenv|env-cmd/);
assert.doesNotMatch(source, /api\.twilio\.com|openai\.com|anthropic\.com|gmail\.com/i);
assert.match(source, /\.delete\(\)\.in\("id", \[companya, companyb\]\)/i);

if (process.env[AUTOMATION_ENGINE_REGRESSION_RUN] === "true") {
  const report = await runAutomationEngineRegression({ cwd });
  assert.equal(report.result, "PASS");
  assert.equal(report.target, "hygtnhmmaoboduqghhwg");
  assert.ok(report.assertions >= 25);
  assert.equal(report.providerNetworkRequests, 0);
  assert.equal(report.cleanupResidue, 0);
  assert.equal(report.parentCompanyCascadeVerified, true);
  console.log("Automation engine hosted regression execution: PASS");
} else {
  console.log(
    `Automation engine hosted regression execution: NOT RUN (set ${AUTOMATION_ENGINE_REGRESSION_RUN}=true with the secure external regression environment)`,
  );
}

console.log("Automation engine regression runner contract: PASS");
