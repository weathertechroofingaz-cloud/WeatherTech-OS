import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-office-tasks-"));
const migrationPath = join(
  cwd,
  "supabase/migrations/0034_office_operations_daily_task_queue.sql",
);
const sourceCascadeMigrationPath = join(
  cwd,
  "supabase/migrations/0035_office_task_source_delete_cascade.sql",
);

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

function task(overrides = {}) {
  return {
    id: "task-1",
    company_id: "company-weathertech",
    customer_id: "customer-1",
    property_id: "property-1",
    assigned_employee_id: "employee-1",
    lead_id: "lead-1",
    inspection_id: null,
    estimate_id: null,
    job_id: null,
    source_type: "new_lead",
    automation_key: "new_lead:lead-1",
    title: "Qualify new lead",
    notes: "Call homeowner",
    priority: "high",
    due_at: "2026-08-06T16:00:00.000Z",
    status: "open",
    snoozed_until: null,
    completed_at: null,
    completed_by: null,
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
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
      "lib/crm/officeTasks.ts",
    ],
    { cwd, encoding: "utf8" },
  );

  assert(
    compile.status === 0,
    `Office task helpers did not compile: ${compile.stdout}${compile.stderr}`,
  );

  const helpers = await import(
    `${pathToFileURL(join(outDir, "officeTasks.js")).href}?v=${Date.now()}`
  );
  const now = new Date("2026-08-06T19:00:00.000Z");
  const grouped = helpers.groupOfficeTasks(
    [
      task({ id: "overdue", due_at: "2026-08-05T16:00:00.000Z" }),
      task({ id: "today", due_at: "2026-08-06T16:00:00.000Z", priority: "urgent" }),
      task({ id: "upcoming", due_at: "2026-08-07T16:00:00.000Z" }),
      task({
        id: "snoozed",
        status: "snoozed",
        snoozed_until: "2026-08-08T16:00:00.000Z",
        due_at: "2026-08-05T16:00:00.000Z",
      }),
      task({
        id: "completed",
        status: "completed",
        completed_at: "2026-08-06T18:00:00.000Z",
      }),
    ],
    { now, timeZone: "America/Phoenix" },
  );

  assertEqual(grouped.overdue.length, 1, "Overdue section should use Arizona dates");
  assertEqual(grouped.today[0]?.id, "today", "Today section should contain today's task");
  assertEqual(grouped.upcoming.length, 2, "Upcoming should include future and snoozed work");
  assertEqual(grouped.completed[0]?.id, "completed", "Completed section should be separate");

  const filtered = helpers.filterOfficeTasks(
    [
      task(),
      task({
        id: "task-2",
        assigned_employee_id: null,
        priority: "low",
        title: "Warranty closeout",
        notes: "IHC Painting",
      }),
    ],
    { assignedEmployeeId: "unassigned", priority: "low", search: "ihc painting" },
  );
  assertEqual(filtered.length, 1, "Combined task filters should remain deterministic");
  assertEqual(filtered[0]?.id, "task-2", "Filtering should return the matching task");

  const complete = helpers.buildOfficeTaskActionUpdate("complete", { now });
  assertEqual(complete.status, "completed", "Complete should change task status");
  assertEqual(complete.completed_at, now.toISOString(), "Complete should record its timestamp");
  assertEqual(complete.snoozed_until, null, "Complete should clear snooze state");

  const snooze = helpers.buildOfficeTaskActionUpdate("snooze", {
    now,
    snoozeDays: 3,
  });
  assertEqual(snooze.status, "snoozed", "Snooze should change task status");
  assertEqual(
    snooze.snoozed_until,
    "2026-08-09T19:00:00.000Z",
    "Snooze should use an exact future timestamp",
  );

  const reopen = helpers.buildOfficeTaskActionUpdate("reopen", { now });
  assertEqual(reopen.status, "open", "Reopen should restore open status");
  assertEqual(reopen.completed_at, null, "Reopen should clear completion timestamp");

  const memberships = [
    {
      user_id: "office-user",
      company_id: "company-weathertech",
      role: "office",
      can_manage_settings: false,
      can_manage_financials: false,
      can_manage_production: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      user_id: "viewer-user",
      company_id: "company-weathertech",
      role: "viewer",
      can_manage_settings: false,
      can_manage_financials: false,
      can_manage_production: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ];
  assert(
    helpers.canManageOfficeTask(
      memberships,
      "office-user",
      "company-weathertech",
    ),
    "Office membership should allow task updates",
  );
  assert(
    !helpers.canManageOfficeTask(
      memberships,
      "office-user",
      "company-ihc",
    ),
    "Membership must not cross company boundaries",
  );
  assert(
    !helpers.canManageOfficeTask(
      memberships,
      "viewer-user",
      "company-weathertech",
    ),
    "Viewer membership should remain read-only",
  );

  const migration = readFileSync(migrationPath, "utf8");
  const sourceCascadeMigration = readFileSync(sourceCascadeMigrationPath, "utf8");
  const sourceTypes = [
    "new_lead",
    "scheduled_inspection",
    "completed_inspection",
    "sent_estimate",
    "unsigned_estimate",
    "scheduled_job",
    "completed_job",
  ];

  sourceTypes.forEach((sourceType) => {
    assert(
      migration.includes(`'${sourceType}'`),
      `Migration should generate ${sourceType} tasks`,
    );
  });
  assert(
    migration.includes("unique (company_id, automation_key)") &&
      migration.includes("on conflict (company_id, automation_key) do nothing"),
    "Generated tasks need database-level duplicate prevention",
  );
  assert(
    migration.includes("wtos_validate_office_task_company_links") &&
      migration.includes("Office task employee must belong to the task company"),
    "Task links and reassignment must preserve company isolation",
  );
  assert(
    migration.includes("enable row level security") &&
      migration.includes("wtos_can_read_company(company_id)") &&
      migration.includes("WTOS office staff update office tasks"),
    "Office tasks need company-scoped RLS",
  );
  assert(
    !migration.includes("grant insert on table public.office_tasks to authenticated"),
    "Browser users must not bypass automated source creation",
  );
  assert(
    migration.includes("grant update (\n  assigned_employee_id") &&
      !migration.includes("grant update (\n  company_id"),
    "Authenticated updates should be limited to operational task fields",
  );
  assert(
    migration.includes("after insert or update of status, next_follow_up on public.leads") &&
      migration.includes("after insert or update of status, scheduled_start, completed_at, estimate_id on public.inspections") &&
      migration.includes("after insert or update of status, expiration_date on public.estimates") &&
      migration.includes("after insert or update of status, scheduled_start, scheduled_end on public.jobs"),
    "Every requested CRM source should have an automatic generation trigger",
  );
  assert(
    migration.includes("new.scheduled_start is not null or new.scheduled_end is not null"),
    "A saved job date should count as scheduled without changing job status",
  );
  for (const sourceTable of ["leads", "inspections", "estimates", "jobs"]) {
    assert(
      sourceCascadeMigration.includes(
        `references public.${sourceTable}(id) on delete cascade`,
      ),
      `Deleting ${sourceTable} should delete its generated tasks without orphaning records`,
    );
  }

  console.log("Office Operations daily task queue regression passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
