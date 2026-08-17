# Codex Browser Regression Suite

WeatherTech OS has a browser regression suite for workflows that require the signed-in Codex in-app Browser session. Routine write-capable runs use the isolated target and lifecycle in [Non-Production Regression Environment](./NON_PRODUCTION_REGRESSION_ENVIRONMENT.md).

## Entry Point

From the active WeatherTech OS checkout, print the runner command:

```bash
cd "/Users/spotty/Documents/GitHub/WeatherTech-OS"
npm run test:browser:codex
```

Run only the JavaScript printed by that command from a Codex session where the in-app Browser is open, signed in to the synthetic regression identity, and pointed at the locally served application URL. Do not reuse a command printed from `/Users/spotty/Documents/New project` or another checkout.

The npm command prints the in-app Browser entrypoint; printing it is not a test pass. A complete pass requires actual execution of every default group, nonzero assertions, console results, bounded cleanup, and zero residue.

## Mandatory Target Preflight

Before the suite creates or deletes a record, its implemented preflight must positively identify an explicitly authorized non-production Supabase target. The suite must fail closed when:

- the target identity is missing, ambiguous, or Production Supabase;
- production credentials are present without a separate purpose-built production-validation authorization;
- seed and cleanup resolve to different targets; or
- cleanup cannot be limited to IDs created by the current authorized run.

Localhost, a `TEST WTOS REGRESSION` prefix, synthetic content, or possession of a service-role credential does not authorize a database write. Never bypass the target preflight to make a browser shard run.

Local Supabase is allowed by its local hostname. The approved shared hosted target is the dedicated `WeatherTech OS Regression` project (`hygtnhmmaoboduqghhwg`). It additionally requires both runtime values below; never set them to the WeatherTech production project reference:

```text
WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED=true
WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF=hygtnhmmaoboduqghhwg
```

The known WeatherTech production reference and the repository's currently linked Supabase reference remain permanently blocked from this ordinary harness even when those values are supplied.

Regression credentials must come from a permission-restricted file outside the checkout or protected secret storage. The harness selects the local file through the absolute-path `WTOS_BROWSER_REGRESSION_ENV_FILE` variable and rejects a group/other-readable file or one inside the repository. The verified workstation path is `/Users/spotty/.config/weathertech-os/regression.env` with mode `0600`. Export the two hosted authorization variables separately; do not also export target URL/key values or the harness will reject the ambiguous dual source. Do not modify or load production values from `.env.local` for a hosted regression run.

The local application process must also receive `NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true` and every provider/live-write gate must be false or unset. Mighty Apes endpoint coverage additionally requires a synthetic `MIGHTY_APES_YELP_WEBHOOK_SECRET` loaded only from the permission-restricted external regression environment. That value signs local requests; it is not a live-write gate, must not match the Production secret, and must never be committed or printed. Before opening the browser app, the harness verifies the raw server HTML reports the exact approved public Supabase origin, disabled demo fallback, and an aggregate disabled provider-side-effect state. It then requires the rendered page to match those same non-secret markers before authentication or database/API work.

If the approved target is unavailable, run non-writing browser smoke coverage and the automated fail-closed isolation tests. Report the write-capable browser groups as not run and state the residual coverage gap; do not point them at production.

## Sharded Runs

When browser automation is slow, use the module URL printed from the active checkout and select only the required groups. For example:

```js
var weatherTechRegression = await import("file:///Users/spotty/Documents/GitHub/WeatherTech-OS/tests/codex-browser/weathertech-os-regression.mjs?run=" + Date.now());

var smokeResult = await weatherTechRegression.runWeatherTechOsRegression({
  browser,
  nodeRepl,
  groups: ["dashboard", "themes", "layout"],
});
nodeRepl.write(weatherTechRegression.formatRegressionReport(smokeResult));
```

Write-capable CRM, job, dispatch, intake, financial, or cleanup shards remain subject to the same verified-target preflight. Run-specific disposable IDs must be retained for bounded cleanup on that same target.

Mighty Apes test deliveries use the distinct exact marker `TEST WTOS MIGHTY APES REGRESSION:`. The lead-intake group must verify audit-only `lead.test`, atomic `lead.created`, exact retry, normal Leads/Inbox visibility, and IHC exclusion. Cleanup must remove captured immutable audit IDs before their linked intake, sync-log, office-task, and lead IDs, then prove zero generic and Mighty Apes residue.

Lead Attribution & Marketing Accountability uses the targeted `crm-accountability` group for attribution review, explicit owner assignment, successful-human-contact evidence, linked appointment/inspection/estimate milestones, won/lost enforcement, repeat opportunity, spend entry, dashboard formulas, and company switching. The complete default run continues to use the 24-group set; its `sales-pipeline`, `lead-intake-workspace`, `lead-intake`, and `marketing` groups exercise the integrated accountability surfaces. Cleanup removes only captured/current-run accountability events, accountability rows, operation receipts, spend, campaigns, repeat opportunities, and their exact linked fixtures, then proves zero residue.

A shard is diagnostic evidence only. It must never be reported as a complete browser-regression pass. Full-run logic must reject an empty, unknown, duplicate, or incomplete group list and must report the expected group count and nonzero assertion count.

## CI Boundary

GitHub's repository-validation job runs repository tests, type-check, lint, build, dependency audit, and whitespace validation without any database credentials. Its push/manual-only lifecycle job uses protected secrets to verify the exact isolated target, bootstrap the marked synthetic identity, write/read/delete one exact-ID in-app notification, and prove zero residue with provider gates false. The Codex Browser harness uses in-app Browser capabilities that are not present on a GitHub-hosted runner; therefore neither job claims a browser pass.

Do not create a conditional browser job that turns green after skipping for missing credentials or browser capability. A future compatible runner must execute the full expected group set, fail on zero assertions or incomplete coverage, and prove cleanup plus zero residue.

## Production Validation Boundary

A narrowly authorized production validation, such as a single owner-approved Stripe transaction, is a separate workflow. It must name the exact purpose and allowed mutation, enforce its own approval and company-isolation controls, and must not enable the ordinary regression harness to seed or clean production data.

## Latest Verified Accountability Run

- Implementation commit: `ba816c2bad315f7ef85051bb3e247f2f965f50b6`.
- Targeted accountability run `20260816165039517`: `3/3` assertions passed.
- Post-hardening Sales run `20260816171149423`: `1/1` assertion passed.
- Complete run `20260816171236859`: `24/24` expected groups and `30/30` assertions passed.
- All three runs reported zero browser-console errors, zero warnings, bounded cleanup, and zero residue on the approved regression project.
- Production was limited to read-only release verification. The ordinary harness did not seed, mutate, or clean Production.
