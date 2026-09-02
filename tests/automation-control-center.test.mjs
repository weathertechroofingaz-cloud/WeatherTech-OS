import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-automation-control-"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function includes(source, value, message) {
  assert(source.includes(value), message);
}

const now = "2026-09-01T18:00:00.000Z";

function execution(overrides = {}) {
  return {
    id: "execution-1",
    company_id: "company-weathertech",
    company_location_id: "location-phoenix",
    rule_id: "rule-weathertech",
    event_id: "event-weathertech",
    rule_version: 1,
    action_type: "create_office_task",
    action_config_snapshot: {},
    action_input: {},
    status: "failed",
    approval_status: "not_required",
    approved_by: null,
    approved_at: null,
    rejected_by: null,
    rejected_at: null,
    approval_reason: null,
    scheduled_for: now,
    attempt_count: 1,
    max_attempts: 3,
    next_retry_at: null,
    lease_token: null,
    lease_expires_at: null,
    worker_id: null,
    idempotency_key: "execution:1",
    version: 2,
    last_error_code: "retryable_failure",
    last_error_message: "Temporary internal task failure",
    result: {},
    cancelled_by: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: now,
    started_at: now,
    completed_at: now,
    updated_at: now,
    ...overrides,
  };
}

try {
  const compile = spawnSync(
    join(cwd, "node_modules/.bin/tsc"),
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--skipLibCheck",
      "--outDir",
      outDir,
      "lib/crm/automationControlCenter.ts",
    ],
    { cwd, encoding: "utf8" },
  );

  assert(
    compile.status === 0,
    `Automation Control Center model did not compile: ${compile.stdout}${compile.stderr}`,
  );

  const helpers = await import(
    `${pathToFileURL(join(outDir, "automationControlCenter.js")).href}?v=${Date.now()}`
  );

  const failedExecution = execution();
  const pendingExecution = execution({
    id: "execution-2",
    status: "awaiting_approval",
    approval_status: "pending",
    attempt_count: 0,
    last_error_code: null,
    last_error_message: null,
    completed_at: null,
    updated_at: "2026-09-01T19:00:00.000Z",
  });
  const snapshot = {
    companies: [
      { id: "company-weathertech", name: "WeatherTech Roofing" },
      { id: "company-ihc", name: "IHC Painting" },
    ],
    companyLocations: [
      {
        id: "location-phoenix",
        company_id: "company-weathertech",
        location_key: "weathertech_phoenix",
        display_name: "Phoenix / Scottsdale",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ],
    automationRules: [
      {
        id: "rule-weathertech",
        company_id: "company-weathertech",
        company_location_id: "location-phoenix",
        rule_key: "new-lead-follow-up",
        name: "New lead follow-up",
        description: null,
        trigger_type: "lead.created",
        conditions: { all: [] },
        condition_contract_version: 1,
        action_type: "create_office_task",
        action_config: {},
        action_contract_version: 1,
        delay_seconds: 0,
        enabled: true,
        approval_policy: "manual",
        max_attempts: 3,
        retry_backoff_seconds: 60,
        version: 1,
        enabled_by: "owner-user",
        enabled_at: now,
        disabled_by: null,
        disabled_at: null,
        disable_reason: null,
        created_by: "owner-user",
        updated_by: "owner-user",
        created_at: now,
        updated_at: now,
      },
    ],
    automationEvents: [
      {
        id: "event-weathertech",
        company_id: "company-weathertech",
        company_location_id: "location-phoenix",
        event_type: "lead.created",
        source_table: "leads",
        source_id: "lead-1",
        source_version: "1",
        actor_user_id: null,
        correlation_id: "correlation-1",
        causation_event_id: null,
        idempotency_key: "event:1",
        payload: {},
        occurred_at: now,
        recorded_at: now,
      },
    ],
    automationExecutions: [failedExecution, pendingExecution],
    automationAttempts: [
      {
        id: "attempt-1",
        company_id: "company-weathertech",
        company_location_id: "location-phoenix",
        execution_id: "execution-1",
        attempt_number: 1,
        status: "failed",
        worker_id: "worker-1",
        started_at: now,
        completed_at: now,
        retryable: true,
        next_retry_at: null,
        error_code: "retryable_failure",
        error_message: "Temporary internal task failure",
        result: {},
        created_at: now,
      },
      {
        id: "attempt-2",
        company_id: "company-weathertech",
        company_location_id: "location-phoenix",
        execution_id: "execution-1",
        attempt_number: 2,
        status: "failed",
        worker_id: "worker-1",
        started_at: now,
        completed_at: now,
        retryable: true,
        next_retry_at: null,
        error_code: "retryable_failure",
        error_message: "Temporary internal task failure",
        result: {},
        created_at: now,
      },
    ],
    automationAuditEvents: [
      {
        id: "audit-old",
        company_id: "company-weathertech",
        company_location_id: "location-phoenix",
        rule_id: "rule-weathertech",
        event_id: "event-weathertech",
        execution_id: "execution-1",
        actor_user_id: null,
        audit_type: "execution.failed",
        reason: null,
        metadata: {},
        created_at: "2026-09-01T18:00:00.000Z",
      },
      {
        id: "audit-new",
        company_id: "company-weathertech",
        company_location_id: "location-phoenix",
        rule_id: "rule-weathertech",
        event_id: "event-weathertech",
        execution_id: "execution-1",
        actor_user_id: "owner-user",
        audit_type: "execution.retry_requested",
        reason: "Reviewed failure",
        metadata: {},
        created_at: "2026-09-01T20:00:00.000Z",
      },
    ],
    companyMemberships: [
      {
        user_id: "owner-user",
        company_id: "company-weathertech",
        role: "owner",
      },
      {
        user_id: "viewer-user",
        company_id: "company-weathertech",
        role: "viewer",
      },
      {
        user_id: "admin-user",
        company_id: "company-ihc",
        role: "admin",
      },
      {
        user_id: "settings-user",
        company_id: "company-weathertech",
        role: "office",
        can_manage_settings: true,
      },
    ],
  };

  const model = helpers.buildAutomationControlCenterModel(snapshot, "owner-user");
  assertEqual(model.counts.rules, 1, "The model should expose every visible rule");
  assertEqual(model.counts.enabled, 1, "The model should count enabled rules");
  assertEqual(
    model.counts.awaitingApproval,
    1,
    "The model should count pending approvals",
  );
  assertEqual(
    model.counts.needsAttention,
    1,
    "The model should count failed and retry-scheduled work",
  );
  assertEqual(
    model.rules[0]?.location?.display_name,
    "Phoenix / Scottsdale",
    "Rules should retain their location identity",
  );
  assertEqual(
    model.rules[0]?.lastExecution?.id,
    "execution-2",
    "Rules should link to their latest execution",
  );
  assert(model.rules[0]?.canManage, "An owner should receive visible controls");
  assertEqual(
    model.executions[0]?.execution.id,
    "execution-2",
    "Execution history should sort newest first",
  );
  const failedModel = model.executions.find(
    ({ execution: candidate }) => candidate.id === "execution-1",
  );
  assertEqual(
    failedModel?.attempts[0]?.attempt_number,
    2,
    "Attempt history should sort newest attempt first",
  );
  assertEqual(
    failedModel?.auditEvents[0]?.id,
    "audit-new",
    "Audit history should sort newest event first",
  );
  assertEqual(
    model.actionableExecutions.length,
    2,
    "Pending approvals and retryable failures should be modeled as actionable",
  );

  const newerSuccesses = Array.from({ length: 30 }, (_, index) =>
    execution({
      id: `newer-success-${index + 1}`,
      status: "succeeded",
      attempt_count: 1,
      last_error_code: null,
      last_error_message: null,
      created_at: new Date(
        Date.parse("2026-09-02T00:00:00.000Z") + index * 1_000,
      ).toISOString(),
      completed_at: new Date(
        Date.parse("2026-09-02T00:00:00.000Z") + index * 1_000,
      ).toISOString(),
      updated_at: new Date(
        Date.parse("2026-09-02T00:00:00.000Z") + index * 1_000,
      ).toISOString(),
    }),
  );
  const crowdedModel = helpers.buildAutomationControlCenterModel(
    {
      ...snapshot,
      automationExecutions: [
        ...newerSuccesses,
        pendingExecution,
        failedExecution,
      ],
    },
    "owner-user",
  );
  const crowdedActionableIds = crowdedModel.actionableExecutions.map(
    ({ execution: candidate }) => candidate.id,
  );

  assert(
    crowdedActionableIds.includes(pendingExecution.id),
    "Thirty newer successes must not hide a pending approval",
  );
  assert(
    crowdedActionableIds.includes(failedExecution.id),
    "Thirty newer successes must not hide a retryable failure",
  );
  assertEqual(
    crowdedModel.recentTerminalExecutions.length,
    helpers.AUTOMATION_RECENT_TERMINAL_LIMIT,
    "Only recent terminal history should receive the display cap",
  );
  assert(
    crowdedModel.recentTerminalExecutions.every(
      ({ execution: candidate }) => candidate.status === "succeeded",
    ),
    "Actionable failures must not be duplicated inside bounded terminal history",
  );

  assert(
    !helpers.canManageAutomationForCompany(
      snapshot.companyMemberships,
      "viewer-user",
      "company-weathertech",
    ),
    "A viewer must remain read-only",
  );
  assert(
    !helpers.canManageAutomationForCompany(
      snapshot.companyMemberships,
      "owner-user",
      "company-ihc",
    ),
    "Owner membership must never cross company boundaries",
  );
  assert(
    helpers.canManageAutomationForCompany(
      snapshot.companyMemberships,
      "admin-user",
      "company-ihc",
    ),
    "An admin should receive controls only for the admin membership company",
  );
  assert(
    helpers.canManageAutomationForCompany(
      snapshot.companyMemberships,
      "settings-user",
      "company-weathertech",
    ),
    "A company-scoped settings delegate should receive the same controls the database authorizes",
  );
  assert(
    helpers.canReviewAutomationExecution(pendingExecution),
    "Pending approval work should be reviewable",
  );
  assert(
    helpers.canCancelAutomationExecution(pendingExecution),
    "Awaiting approval work should be cancellable",
  );
  assert(
    helpers.canRetryAutomationExecution(failedExecution, snapshot.automationRules[0]),
    "A failed execution with attempts remaining should be retryable",
  );
  assert(
    !helpers.canRetryAutomationExecution(
      execution({ attempt_count: 10, max_attempts: 10 }),
      snapshot.automationRules[0],
    ),
    "An execution at the bounded manual retry limit must not expose retry",
  );
  assert(
    helpers.canRetryAutomationExecution(
      execution({ attempt_count: 3, max_attempts: 3 }),
      snapshot.automationRules[0],
    ),
    "Manual retry should remain available after the automatic attempt budget is exhausted",
  );
  assert(
    !helpers.canRetryAutomationExecution(failedExecution, {
      ...snapshot.automationRules[0],
      enabled: false,
    }),
    "A failed execution for a disabled rule must not expose retry",
  );
  assert(
    !helpers.canRetryAutomationExecution(failedExecution, {
      ...snapshot.automationRules[0],
      version: failedExecution.rule_version + 1,
    }),
    "A failed execution for a newer rule version must not expose retry",
  );

  const legacyModel = helpers.buildAutomationControlCenterModel(
    { companies: [], companyMemberships: [] },
    null,
  );
  assertEqual(legacyModel.counts.rules, 0, "Older snapshots should default rules safely");
  assertEqual(
    legacyModel.executions.length,
    0,
    "Older snapshots should default execution history safely",
  );

  const repository = readFileSync(join(cwd, "lib/crm/repository.ts"), "utf8");
  const pagination = readFileSync(
    join(cwd, "lib/crm/automationExecutionPagination.ts"),
    "utf8",
  );
  const types = readFileSync(join(cwd, "lib/crm/types.ts"), "utf8");
  const component = readFileSync(
    join(cwd, "components/AutomationControlCenter.tsx"),
    "utf8",
  );
  const app = readFileSync(join(cwd, "components/CrmApp.tsx"), "utf8");
  const companyScope = readFileSync(join(cwd, "lib/crm/companyScope.ts"), "utf8");

  for (const table of [
    "company_locations",
    "automation_rules",
    "automation_events",
    "automation_executions",
    "automation_attempts",
    "automation_audit_events",
  ]) {
    includes(repository, `.from("${table}")`, `Snapshot reads should include ${table}`);
  }
  includes(
    repository,
    'fetchBoundedAutomationExecutionCandidates(client, "active")',
    "General snapshot reads should bound active execution candidates independently of recent history",
  );
  includes(
    repository,
    'fetchBoundedAutomationExecutionCandidates(client, "retryable_failed")',
    "General snapshot reads should bound potential manual retries independently of recent history",
  );
  assert(
    !repository.includes("fetchAllAutomationExecutionCandidates"),
    "A general CRM snapshot must not page automation execution candidates to ledger exhaustion",
  );
  includes(
    pagination,
    ".limit(AUTOMATION_GENERAL_EXECUTION_CANDIDATE_LIMIT)",
    "General snapshot candidate queries should have one fixed row bound",
  );
  includes(
    pagination,
    "AUTOMATION_CONTROL_CENTER_EXECUTION_PAGE_SIZE + 1",
    "Control Center history should fetch one bounded lookahead row for truthful pagination",
  );
  includes(
    pagination,
    "updated_at.lt.${normalizedCursor.updatedAt},and(updated_at.eq.${normalizedCursor.updatedAt},id.lt.${normalizedCursor.id})",
    "Control Center pages should use a deterministic updated-at and ID keyset cursor",
  );
  includes(
    component,
    "automation-load-older-candidates",
    "Control Center should expose explicit access to older execution candidates",
  );
  includes(
    component,
    "loaded in bounded newest-first pages",
    "Control Center copy should disclose bounded paging instead of claiming an uncapped snapshot",
  );
  includes(
    component,
    "Awaiting approval loaded",
    "Control Center metrics should identify counts as loaded rather than globally exhaustive",
  );
  includes(
    component,
    "Count for execution pages loaded so far",
    "Partial execution metrics should explain their plus suffix",
  );
  includes(
    component,
    "No loaded automation execution currently needs owner action",
    "The actionable empty state should remain conditional while older pages exist",
  );
  includes(
    component,
    "No loaded automation execution is currently running",
    "The in-progress empty state should remain conditional while older active pages exist",
  );
  includes(
    component,
    "candidateLoadMorePendingRef.current",
    "Control Center should reject concurrent Load Older requests",
  );

  for (const rpc of [
    "wtos_set_automation_rule_enabled_v1",
    "wtos_review_automation_execution_v1",
    "wtos_cancel_automation_execution_v1",
    "wtos_retry_automation_execution_v1",
  ]) {
    includes(repository, `.rpc("${rpc}"`, `Repository should call only ${rpc}`);
    includes(types, `${rpc}:`, `Database types should expose ${rpc}`);
  }
  includes(
    repository,
    "p_expected_version: request.expectedVersion",
    "Every control should bind the displayed optimistic-lock version",
  );
  assert(
    !/\.from\("automation_(?:rules|events|executions|attempts|audit_events)"\)[\s\S]{0,100}\.(?:insert|update|delete)\(/.test(
      repository,
    ),
    "Automation ledger and rule changes must never use direct browser writes",
  );

  for (const label of [
    "Automation Control Center",
    "Trigger",
    "Action",
    "Approval",
    "Last run",
    "Execution history",
    "Needs action",
    "In progress",
    "Recent terminal history",
    "Attempts",
    "Audit history",
  ]) {
    includes(component, label, `Control Center should show ${label}`);
  }
  includes(
    component,
    "customer communications.",
    "The no-send boundary should be visible to the owner",
  );
  includes(
    component,
    "not subject to this display cap",
    "The terminal-history cap should be disclosed without applying it to actionable work",
  );
  assert(
    !component.includes("model.executions.slice(0, 25)"),
    "The combined execution stream must never be sliced before actionability is classified",
  );
  includes(
    repository,
    'if (execution.status !== "queued")',
    "Retry RPC receipts should reject malformed retry-scheduled state tuples",
  );
  includes(
    repository,
    'throw new Error("Automation execution review returned an impossible status tuple.")',
    "Review RPC receipts should reject malformed decision and status tuples",
  );
  assert(
    !component.includes("wtos_run_due_automations_v1") &&
      !component.includes("Run due") &&
      !component.includes("Run all"),
    "The UI must not expose a second manual run-all execution trigger",
  );
  includes(
    app,
    "<AutomationControlCenter",
    "Settings should reuse the Automation Control Center",
  );
  for (const collection of [
    "companyLocations",
    "automationRules",
    "automationEvents",
    "automationExecutions",
    "automationAttempts",
    "automationAuditEvents",
  ]) {
    includes(
      companyScope,
      `snapshot.${collection} ?? []`,
      `Company scoping should preserve backward compatibility for ${collection}`,
    );
  }

  includes(
    app,
    'fetch("/api/ai-tools/actions/review"',
    "AI review must be durable before the UI marks it reviewed",
  );
  includes(
    app,
    'action.type !== "create_follow_up_draft"',
    "AI approval should remain limited to the exact internal follow-up path",
  );
  assert(
    !app.includes("ensureAiApprovedEmailDraft") &&
      !app.includes("Approve & create draft"),
    "Email previews must remain preview-only until their exact content can be fingerprinted and created server-side",
  );

  console.log("Automation Control Center regression passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
