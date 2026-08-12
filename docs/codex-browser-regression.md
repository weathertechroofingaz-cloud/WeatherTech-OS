# Codex Browser Regression Suite

WeatherTech OS has a browser regression suite for workflows that require the signed-in Codex in-app Browser session.

## Entry Point

From the active WeatherTech OS checkout, print the runner command:

```bash
cd "/Users/spotty/Documents/GitHub/WeatherTech-OS"
npm run test:browser:codex
```

Run only the JavaScript printed by that command from a Codex session where the in-app Browser is open, signed in, and pointed at the intended application URL. Do not reuse a command printed from `/Users/spotty/Documents/New project` or another checkout.

## Mandatory Target Preflight

Before the suite creates or deletes a record, its implemented preflight must positively identify an explicitly authorized non-production Supabase target. The suite must fail closed when:

- the target identity is missing, ambiguous, or Production Supabase;
- production credentials are present without a separate purpose-built production-validation authorization;
- seed and cleanup resolve to different targets; or
- cleanup cannot be limited to IDs created by the current authorized run.

Localhost, a `TEST WTOS REGRESSION` prefix, synthetic content, or possession of a service-role credential does not authorize a database write. Never bypass the target preflight to make a browser shard run.

Local Supabase is allowed by its local hostname. A hosted non-production target additionally requires both runtime values below; never set them to the WeatherTech production project reference:

```text
WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED=true
WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF=<exact authorized non-production Supabase project ref>
```

The known WeatherTech production reference and the repository's currently linked Supabase reference remain permanently blocked from this ordinary harness even when those values are supplied.

If no safe non-production target is available, run non-writing browser smoke coverage and the automated fail-closed isolation tests. Report the write-capable browser groups as not run and state the residual coverage gap; do not point them at production.

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

## Production Validation Boundary

A narrowly authorized production validation, such as a single owner-approved Stripe transaction, is a separate workflow. It must name the exact purpose and allowed mutation, enforce its own approval and company-isolation controls, and must not enable the ordinary regression harness to seed or clean production data.
