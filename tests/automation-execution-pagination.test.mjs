import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-automation-pagination-"));

function execution(index, updatedAt = "2026-09-02T12:34:56.123456+00:00") {
  const numericId = String(999_999 - index).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${numericId}`,
    updated_at: updatedAt,
    version: 1,
  };
}

function createClient(responses) {
  const calls = [];
  let responseIndex = 0;

  return {
    calls,
    client: {
      from(table) {
        const call = { table, operations: [] };
        calls.push(call);
        const builder = {
          select(...args) {
            call.operations.push(["select", ...args]);
            return builder;
          },
          in(...args) {
            call.operations.push(["in", ...args]);
            return builder;
          },
          eq(...args) {
            call.operations.push(["eq", ...args]);
            return builder;
          },
          lt(...args) {
            call.operations.push(["lt", ...args]);
            return builder;
          },
          order(...args) {
            call.operations.push(["order", ...args]);
            return builder;
          },
          or(...args) {
            call.operations.push(["or", ...args]);
            return builder;
          },
          limit(...args) {
            call.operations.push(["limit", ...args]);
            return builder;
          },
          then(resolve, reject) {
            const response = responses[responseIndex++];
            return Promise.resolve(
              typeof response === "function" ? response(call) : response,
            ).then(resolve, reject);
          },
        };
        return builder;
      },
    },
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
      "lib/crm/automationExecutionPagination.ts",
    ],
    { cwd, encoding: "utf8" },
  );
  assert.equal(
    compile.status,
    0,
    `Automation pagination helper did not compile: ${compile.stdout}${compile.stderr}`,
  );

  const helpers = await import(
    `${pathToFileURL(join(outDir, "automationExecutionPagination.js")).href}?v=${Date.now()}`
  );
  assert.equal(
    helpers.AUTOMATION_CONTROL_CENTER_EXECUTION_PAGE_SIZE,
    helpers.AUTOMATION_GENERAL_EXECUTION_CANDIDATE_LIMIT,
    "The first Control Center cursor must start after the general snapshot bound",
  );

  const generalLedger = Array.from({ length: 1_500 }, (_, index) => execution(index));
  const general = createClient([
    (call) => {
      const limit = call.operations.find(([operation]) => operation === "limit")?.[1];
      return { data: generalLedger.slice(0, limit), error: null };
    },
  ]);
  const generalResult = await helpers.fetchBoundedAutomationExecutionCandidates(
    general.client,
    "retryable_failed",
  );
  assert.equal(general.calls.length, 1, "A general snapshot uses exactly one bounded query");
  assert.equal(generalResult.data.length, 200, "The bounded result contains at most 200 rows");
  assert.deepEqual(
    general.calls[0].operations.at(-1),
    ["limit", helpers.AUTOMATION_GENERAL_EXECUTION_CANDIDATE_LIMIT],
    "The database query itself enforces the fixed general-snapshot bound",
  );

  const allRows = Array.from({ length: 230 }, (_, index) => execution(index));
  const paged = createClient([
    { data: allRows.slice(0, 201), error: null },
    { data: allRows.slice(200), error: null },
  ]);
  const firstPage = await helpers.fetchAutomationExecutionCandidatePage(
    paged.client,
    "retryable_failed",
  );
  assert.equal(firstPage.data.length, 200, "The first Control Center page is bounded");
  assert.equal(firstPage.hasMore, true, "The lookahead row truthfully reports more history");
  assert.deepEqual(
    firstPage.nextCursor,
    {
      updatedAt: allRows[199].updated_at,
      id: allRows[199].id,
    },
    "The next cursor uses the last visible row",
  );

  const secondPage = await helpers.fetchAutomationExecutionCandidatePage(
    paged.client,
    "retryable_failed",
    firstPage.nextCursor,
  );
  assert.equal(secondPage.data.length, 30, "An older actionable candidate remains reachable");
  assert.equal(
    secondPage.data[0].id,
    allRows[200].id,
    "The first Load Older page exposes row 201 instead of replaying the general snapshot bound",
  );
  assert.equal(secondPage.hasMore, false, "The final page reports completion");
  const cursorFilter = paged.calls[1].operations.find(([operation]) => operation === "or");
  assert.ok(
    cursorFilter?.[1].includes("2026-09-02T12:34:56.123456+00:00"),
    "The keyset cursor preserves exact PostgreSQL microseconds",
  );
  assert.ok(
    cursorFilter?.[1].includes(`id.lt.${allRows[199].id}`),
    "Equal-timestamp rows continue by the deterministic ID tiebreaker",
  );

  const merged = helpers.mergeAutomationExecutionRows(
    firstPage.data,
    secondPage.data,
    [
      {
        ...allRows[110],
        version: 2,
        updated_at: "2026-09-02T12:35:00.000000+00:00",
      },
    ],
  );
  assert.equal(merged.length, 230, "Paged candidate rows are de-duplicated without skips");
  assert.equal(
    merged.find((row) => row.id === allRows[110].id)?.version,
    2,
    "De-duplication keeps the newest execution version",
  );

  await assert.rejects(
    () =>
      helpers.fetchAutomationExecutionCandidatePage(
        createClient([]).client,
        "active",
        {
          updatedAt: "2026-09-02T12:34:56Z,or(status.eq.failed)",
          id: allRows[0].id,
        },
      ),
    /cursor is invalid/i,
    "Untrusted cursor syntax must fail closed before it reaches PostgREST",
  );

  let generation = 1;
  let staleSuccessApplied = false;
  let resolveStaleSuccess;
  const staleSuccess = new Promise((resolve) => {
    resolveStaleSuccess = resolve;
  }).then(() => {
    if (helpers.isAutomationExecutionPagingGenerationCurrent(generation, 1)) {
      staleSuccessApplied = true;
    }
  });
  generation = 2;
  resolveStaleSuccess();
  await staleSuccess;
  assert.equal(
    staleSuccessApplied,
    false,
    "A prior-generation Load More success is ignored after snapshot refresh",
  );

  let staleFailureApplied = false;
  let rejectStaleFailure;
  const staleFailure = new Promise((resolve, reject) => {
    rejectStaleFailure = reject;
  }).catch(() => {
    if (helpers.isAutomationExecutionPagingGenerationCurrent(generation, 2)) {
      staleFailureApplied = true;
    }
  });
  generation = 3;
  rejectStaleFailure(new Error("stale request"));
  await staleFailure;
  assert.equal(
    staleFailureApplied,
    false,
    "A prior-generation Load More failure cannot overwrite refreshed state",
  );

  console.log(
    "Verified bounded general automation loading and exact keyset Control Center pagination.",
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
