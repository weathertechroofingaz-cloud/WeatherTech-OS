# Non-Production Regression Environment

This runbook defines the only approved hosted target and operating contract for routine write-capable WeatherTech OS regression testing. Production is never an acceptable fallback.

## Approved Architecture

| Item | Approved value |
| --- | --- |
| Supabase target type | Dedicated hosted project on the existing WeatherTech OS organization |
| Project name | `WeatherTech OS Regression` |
| Project reference | `hygtnhmmaoboduqghhwg` |
| Region | `us-west-1` |
| Purpose | Synthetic browser/regression fixtures only |
| Production project reference | `gahfcgyjtfwwmsterhzu` — permanently prohibited |

A dedicated project was selected because it provides an isolated database, Auth tenant, API endpoint, migration ledger, and credentials without sharing production data. The available Supabase branch option would incur hourly cost, while the verified dedicated project was available at `$0/month`. Local Supabase remains a valid developer option when a supported container runtime is available, but it is not the shared hosted regression target.

The project reference and URL hostname are identifiers, not credentials. API keys, service-role credentials, and test-user credentials remain secret and must never appear in this document, source control, logs, screenshots, command output, or test reports.

## Non-Negotiable Isolation Contract

Before the harness performs its first database read, seed, write, cleanup, or delete, it must prove all of the following:

1. The application URL is locally served.
2. The configured Supabase URL is valid and is not the immutable production reference.
3. Hosted writes are explicitly authorized with `WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED=true`.
4. `WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF` exactly equals `hygtnhmmaoboduqghhwg`.
5. The service credential belongs to the same project as the URL.
6. The browser-rendered public Supabase-origin marker exactly matches the expected target origin.
7. The server and browser-rendered CRM demo-fallback markers prove fallback is disabled.
8. The server and browser-rendered aggregate provider-side-effect markers prove every write gate is disabled.
9. The target's remote identity is positively verified as the approved regression project.
10. The current run marker is new and has no collision.

Missing, malformed, unknown, mismatched, or production configuration must terminate the run before database access. Do not add a general production override.

## Schema Provisioning

Apply the committed WeatherTech OS migration history to the isolated target in repository order. Never clone production rows, auth users, Vault values, connection records, provider mappings, or provider secrets.

The two owner-preserved Property Intelligence working-tree files are not an approved schema source for this sprint. Any schema application while they remain modified must use a clean `HEAD` archive or another clean checkout so their unstaged content cannot reach the regression project.

Supabase projects created under the current Data API default may require explicit table privileges for `anon`, `authenticated`, or `service_role` in addition to RLS policies. Provision only the privileges required by the established application model, retain RLS on exposed tables, and verify access rather than assuming migration success implies Data API access.

Schema readiness must prove:

- the remote ledger contains exactly the intended committed migrations;
- required companies, memberships, and one synthetic test identity exist without production data;
- browser-authenticated and service-role requests resolve to the same project;
- RLS preserves WeatherTech Roofing versus IHC company isolation; and
- provider connections, Stripe mappings, webhook events, and payment rows begin empty.

## Secure Configuration

Do not modify or reuse `.env.local` for regression. Use a permission-restricted environment file outside the repository or protected CI secrets. The local harness configuration contains these names:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK
SUPABASE_SERVICE_ROLE_KEY
MIGHTY_APES_YELP_WEBHOOK_SECRET
WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED
WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF
```

`NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK` must equal `true` for a hosted regression run. This prevents a successful database mutation from being masked by an in-memory demo fallback.

The lifecycle bootstrap uses `WTOS_REGRESSION_OWNER_EMAIL` and `WTOS_REGRESSION_OWNER_PASSWORD`. The in-app Browser uses the same synthetic identity through `WTOS_BROWSER_REGRESSION_TEST_USER_EMAIL` and `WTOS_BROWSER_REGRESSION_TEST_USER_PASSWORD`. Never use an owner account or production user. The verified workstation file is `/Users/spotty/.config/weathertech-os/regression.env`, has mode `0600`, and lives outside the checkout. For the browser harness, do not source the target credentials into the parent process. Select the file and independently export only the explicit hosted-write authorization:

```text
WTOS_BROWSER_REGRESSION_ENV_FILE=/Users/spotty/.config/weathertech-os/regression.env
WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED=true
WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF=hygtnhmmaoboduqghhwg
```

The harness rejects simultaneous process-environment target credentials and `WTOS_BROWSER_REGRESSION_ENV_FILE`. The lifecycle script has the opposite interface: it never reads `.env.local` or the selected external file, so load the file's required values into that command's process without printing them, run the lifecycle commands, and clear them afterward.

All provider/live-write gates must be false or unset in the regression application process, including:

```text
STRIPE_LIVE_PAYMENTS_ENABLED
STRIPE_REFUNDS_ENABLED
STRIPE_WEBHOOK_PROCESSING_ENABLED
GOOGLE_GMAIL_SEND_ENABLED
GOOGLE_CALENDAR_WRITE_ENABLED
TWILIO_OUTBOUND_SMS_ENABLED
QUICKBOOKS_SYNC_ENABLED
QUICKBOOKS_ACCOUNTING_WRITES_ENABLED
QUICKBOOKS_PAYMENT_PROCESSING_ENABLED
YELP_LIVE_SYNC_ENABLED
YELP_OUTBOUND_MESSAGING_ENABLED
AI_ENABLED
AI_ACTION_EXECUTION_ENABLED
GHL_SYNC_ENABLED
```

The harness fetches the local server's raw HTML before opening the application and then checks the same non-secret markers in the rendered page. A target mismatch, enabled demo fallback, or enabled aggregate side-effect state fails before authentication or browser/database/API work.

Source-specific provider flags are also false. Ordinary regression must not contain live provider credentials merely because a corresponding gate is false.

The Mighty Apes coverage has one narrow exception: `MIGHTY_APES_YELP_WEBHOOK_SECRET` must be a synthetic server-only value of at least 32 characters in the permission-restricted external regression environment. It is used only to sign requests to the locally served WeatherTech OS receiver while all live-provider flags remain false. It must not equal the Production provider secret, appear in source control, or authorize a request to any external provider. The dedicated Mighty Apes hosted runner additionally blocks every network origin except the approved regression Supabase project.

## Local Browser Workflow

1. Confirm the repository, branch, commit, and protected-file hashes.
2. Load the approved external environment values into only the lifecycle command process; do not source `.env.local` and do not print the values.
3. Prove the project, schema, synthetic identity, provider isolation, and clean starting state:

   ```bash
   node scripts/regression-environment.mjs bootstrap
   node scripts/regression-environment.mjs verify
   node scripts/regression-environment.mjs lifecycle-probe
   node scripts/regression-environment.mjs verify-residue
   ```

4. Clear the lifecycle command variables. Start the local WeatherTech OS server with the public URL and anon/publishable key for the approved regression project, `NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true`, and all live-write gates false.
5. Select the permission-restricted file with `WTOS_BROWSER_REGRESSION_ENV_FILE`, export the two explicit hosted-write authorization values shown above, open the locally served app in the Codex in-app Browser, and authenticate only as the synthetic test user.
6. Run the complete default group set. A subset is a diagnostic shard, not a full pass.
7. Require the final report to include the complete expected group list, a nonzero assertion count, console error/warning counts, before/after cleanup evidence, and `residueVerified: true`.
8. Run `node scripts/regression-environment.mjs verify-residue` again and confirm production counts are unchanged with read-only checks.

The executable entrypoint and group-selection examples live in [Codex Browser Regression Suite](./codex-browser-regression.md).

## Test-Data Ownership And Cleanup

Each run owns exactly one millisecond-resolution run ID and marker. The harness must capture every created row ID as soon as it is returned. Related/generated rows may be discovered only through current-run foreign keys or fields containing the exact current-run marker; unrelated historical pattern matches are not owned by the run.

Cleanup runs in dependency-safe order and remains bounded to the captured run graph. It covers every synthetic object the enabled groups create, including leads, lead accountability and immutable events, campaign/spend operation receipts, monthly spend, campaigns, customers, jobs, estimates and lines, inspections, documents/signatures, schedules, job child records, invoices and lines, offline payments, change orders, intake/provider logs, messages, notifications, and generated office tasks. Mighty Apes evidence uses the distinct exact prefix `TEST WTOS MIGHTY APES REGRESSION:` in both delivery and provider-lead identifiers. Cleanup discovers rows only through exact captured IDs, current-run foreign keys, or exact current-run markers; it deletes immutable accountability/provider audit evidence before linked parent rows and then proves generic, Mighty Apes, and marketing-accountability residue counts are zero.

Before deleting financial records, cleanup must inspect payment methods, provider references, and Stripe mappings. Any Stripe-linked record aborts cleanup. Missing fixture ownership, a marker collision, a changed target, or nonzero final residue is a failed run and requires diagnostics; it is never repaired with a broad prefix sweep.

Cleanup runs after success and in `finally` after ordinary assertion failure once preflight has authorized that exact marker and target. If preflight fails, cleanup must not run.

Native proposal-signing fixtures use the distinct exact marker `TEST WTOS PROPOSAL SIGNING <17-digit-run-id>`. Raw invitation tokens and the 256-bit exchange keys used to prove lost-response recovery remain only in harness/browser memory, are checked against the complete persisted graph, and are overwritten before cleanup. The exact same invitation token and exchange key must recover only the already committed private session; a different exchange key must be refused. Because finalized revisions, acceptances, signatures, receipts, and audit rows are intentionally immutable or append-only in normal operation, the harness must not delete them with ordinary service-role table calls. It must first remove and prove absence of every captured private `customer-documents` object, then call `wtos_cleanup_synthetic_proposal_fixture` with the complete exact graph. That RPC is callable only by `service_role`, re-verifies the fixed regression project owner marker, synthetic `example.test` identity, company ownership, proposal marker, every supplied ID array, and zero Storage residue, and permits its private transaction-local cleanup guard only for that verified graph. Any omitted or extra row, unmarked email/signature, remaining Storage object, target mismatch, or nonzero final residue aborts the cleanup transaction. Production and ordinary business records cannot satisfy this contract.

## CI Contract

[Repository Validation](../.github/workflows/repository-validation.yml) runs repository-only checks on pull requests, pushes to `main`, and manual dispatch. That job installs the committed lockfile, discovers and executes every top-level `tests/*.test.mjs` file, type-checks, lints, builds, audits all installed dependencies, and checks patch whitespace. It receives no database or provider credentials.

On pushes to `main` and manual dispatches of `main`, a second serialized job uses the protected GitHub environment named `regression` and maps these environment-scoped secrets into the fail-closed lifecycle script. A manual dispatch of another ref fails before secret-bearing work:

```text
WTOS_REGRESSION_SUPABASE_URL
WTOS_REGRESSION_SUPABASE_ANON_KEY
WTOS_REGRESSION_SUPABASE_SERVICE_ROLE_KEY
WTOS_REGRESSION_PROJECT_REF
WTOS_REGRESSION_OWNER_EMAIL
WTOS_REGRESSION_OWNER_PASSWORD
```

That job runs `bootstrap`, `verify`, `lifecycle-probe`, and `verify-residue`. The probe creates exactly one in-app-only WeatherTech notification using a pre-generated UUID, reads the exact ID/company/marker, deletes only that ID in `finally`, and proves zero marker and ID residue. All provider gates are explicitly false. It never runs for a pull request, creates no Stripe/provider object, and is serialized without cancellation so a newer workflow cannot interrupt cleanup.

The current browser suite depends on the signed-in Codex in-app Browser API. GitHub-hosted runners do not provide that surface, so neither CI job claims a browser pass. This is a genuine CI capability gap, not a silent skip. Until a reviewed headless adapter or dedicated compatible runner exists, release evidence must include the separately executed complete Codex Browser report.

A future CI browser runner is acceptable only when it:

- obtains regression URL/key/test-user values from a protected GitHub environment;
- verifies the exact approved project reference before starting the server or touching data;
- executes every required group and rejects unknown, duplicate, empty, or partial group sets for a full-run job;
- fails if zero assertions ran, any group failed, console errors/warnings violate policy, cleanup failed, or residue remains;
- uploads a redacted report containing no credential or customer data; and
- runs cleanup reliably after ordinary failures without ever targeting production.

Do not add a conditional job that reports success when secrets or browser capability are absent.

## Verified Sprint Result

- Implementation commit: `6354429976fb7a549bbc738fc0b76b3c5ea2022b`.
- Isolated browser run ID: `20260812062716532` against `hygtnhmmaoboduqghhwg`.
- Complete suite: 24 of 24 expected groups and 28 of 28 recorded assertions passed.
- Browser diagnostics: zero console errors and zero console warnings.
- Lifecycle: bounded cleanup completed and both the harness and independent `verify-residue` command proved zero current-run residue.
- Provider isolation: all 22 checked provider, connection, credential, synchronization, Stripe, and payment tables remained empty in regression.
- Repository validation: all 25 top-level tests, type-check, lint, production build, full dependency audit, workflow checks, patch checks, and credential scan passed.
- CI: GitHub Actions run `31570826433` completed successfully; both the repository-only validation job and protected isolated-Supabase lifecycle job succeeded.
- Initial deployment: Vercel production deployment `dpl_9JKf41MdzW1uHV7s2MVs5nJtPDgo` was READY and `/api/health` reported the exact implementation commit. Production remained read-only and retained its clean baseline; `/api/readiness` truthfully remained blocked by the existing provider-approval policy.

### Mighty Apes Yelp Extension

- Implementation commit `103eddab7f464ca9472e8fb8c2b6cc652e7fc89c` extended the approved target to all `45/45` migrations and added the empty immutable Mighty Apes audit table to provider-isolation checks.
- The dedicated hosted Mighty Apes lifecycle passed authentication/ACL, audit-only test delivery, atomic lead creation, exact retry, conflicting delivery/payload refusal, concurrency convergence, WeatherTech/IHC isolation, normal office-task creation, provider/financial side-effect absence, and exact cleanup with zero residue.
- The complete isolated browser suite signed the raw request body with only the synthetic external-file secret, verified CRM/Inbox visibility and IHC exclusion, removed exact synthetic evidence in dependency-safe order, and finished with zero residue.
- GitHub Actions run `31865652902` completed successfully; both the repository-validation and protected isolated-Supabase lifecycle jobs passed. CI did not claim to execute the proprietary in-app Browser suite.

### Lead Attribution And Marketing Accountability Extension

- Implementation commit `ba816c2bad315f7ef85051bb3e247f2f965f50b6` extended the approved regression target to the exact `48/48` migration ledger.
- The hosted Phase 1 lifecycle passed `183/183` assertions covering deterministic and unknown attribution, first-touch locking, creator/owner separation, linked funnel order, won/lost requirements, stale writes, retry/concurrency convergence, rollback, RLS/ACL/company isolation, same-name cross-company campaigns/vendors, spend validation, Phoenix month boundaries, dashboard formulas, and exact cleanup.
- Targeted Browser run `20260816165039517` passed `3/3` accountability assertions; post-hardening Sales run `20260816171149423` passed `1/1`; complete run `20260816171236859` passed `24/24` expected groups and `30/30` assertions. Each finished with zero console errors, zero console warnings, bounded cleanup, and independently verified zero residue.
- The lifecycle and Browser harness clean only exact run-owned accountability, event, receipt, spend, campaign, lead, and linked CRM IDs. Immutable evidence is removed in dependency-safe order only on the positively verified regression project.
- GitHub Actions run `32073345029` completed successfully; repository-only job `95521143325` and protected isolated-Supabase lifecycle job `95521700791` passed. CI still does not claim to execute the proprietary in-app Browser suite.
- Read-only Production verification after applying the same exact migrations found all five new tables empty, all ten existing test leads/intake records unchanged and unbackfilled, the original 72-table/277-row fingerprint unchanged, and no provider/gate change. No synthetic Production data was created.

### Secure Company-Scoped Job Photos Extension

- Implementation commit `b4f5519afc1dd3d5d688f90167a994a8de447c0d` and narrow CI lifecycle correction `34b9c6b12c17fafea97eda0d5fd9680fb2d7e450` extended the approved target to the exact `50/50` migration ledger.
- The hosted lifecycle proved private company-scoped upload/read isolation, URL-free metadata, deterministic reservation/idempotency, delayed and concurrent cancellation races, lease recovery, exact rollback deletion, prompt semantic errors without retry amplification, preserved genuine serialization handling, and zero residue.
- Definitive Browser run `20260822093206385` passed all `24/24` groups and `31/31` assertions with zero console errors, zero console warnings, bounded cleanup, and independent zero-residue verification. It covered Photos, Inspection, Field Operations, Customer 360, signed preview/copy/open/reload, company switching, and recovery across navigation/reload.
- GitHub Actions run `32566363585` passed both jobs at the exact correction SHA. CI uses protected regression credentials and provider gates false; it does not claim to execute the proprietary in-app Browser suite.
- Production read-only verification after applying the same two migrations found the bucket private and constrained, zero photo metadata/upload-operation rows, the original orphan unchanged and inaccessible to ordinary clients, `customer-documents` unchanged, and no provider/test-data/gate mutation.

## Emergency Troubleshooting

- **Target rejected:** compare the URL hostname, expected project reference, credential identity, linked production reference, rendered public-origin marker, and rendered demo-fallback marker. Never weaken the check.
- **Origin marker missing or mismatched:** verify the local app was started with the approved public URL/key and that its rendered marker exactly matches the expected Supabase origin.
- **Demo fallback enabled:** restart the local app with `NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true`; never accept a hosted write-capable run while fallback is available.
- **Schema cache or relation error:** compare the remote migration ledger and Data API grants; do not make the harness silently downgrade required coverage.
- **Marker collision:** stop. Generate a new run ID only after proving the older marker's ownership; never delete the collision automatically.
- **Cleanup residue:** retain the redacted run report and exact captured IDs, inspect dependencies, and perform only evidence-bounded cleanup on the verified regression target.
- **External provider activity:** stop the suite, disable the affected gate, record what occurred, and verify production/IHC isolation. Do not retry until the cause is proven.
- **Authentication failure:** repair only the synthetic regression identity. Do not substitute an owner or production user.

## Production Boundary

Production receives only read-only smoke and baseline checks after a successful non-production run. Never seed production, run write-capable regression against it, or change the expected HTTP 503 readiness state by weakening provider-approval controls. A separately owner-authorized live provider validation remains outside this harness and requires its own narrow limits.
