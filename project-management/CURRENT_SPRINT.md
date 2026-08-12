# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Non-Production Regression Environment & CI Test-Data Lifecycle

## Objective

Give WeatherTech OS a positively identified, isolated non-production Supabase environment where the complete write-capable browser regression suite can create synthetic fixtures, validate application behavior, clean up only the current run's records, and prove zero residue. Production must be technically rejected as an ordinary regression target, and the same fail-closed identity and lifecycle contract must govern local and CI execution.

## Owner

Joe Harris

## Owner Approval Date

2026-08-11.

## Verified Starting State

- Repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`.
- Branch: `main`.
- Starting local `HEAD` and `origin/main`: `d62ae07aedc22313d74cfd9d34d14f3d516dc369`.
- Canonical production URL: `https://weathertech-os.vercel.app`.
- Production Supabase reference: `gahfcgyjtfwwmsterhzu`.
- Production `/api/health`: HTTP 200 and healthy at starting commit.
- Production `/api/readiness`: HTTP 503 because provider writes remain enabled while broad production-provider approval remains false; this is the expected truthful safety state and is not a runtime-health failure.
- Production clean baseline: Customers 0, Employees 0, Leads 10, Properties 8, Jobs 6, Invoices 0, Invoice line items 0, Outstanding `$0`, Overdue 0, and only two preserved refunded Stripe payment audit rows.
- Stripe payment, refund, and webhook-processing gates are false. IHC Stripe connections, accounts, mappings, events, and payments are zero.

## Explicitly Preserved Working-Tree Changes

The owner explicitly designated these two pre-existing unstaged files as preserved exceptions to the normal clean-tree gate:

| File | Starting SHA-256 |
| --- | --- |
| `supabase/migrations/0026_property_intelligence_foundation.sql` | `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` |
| `tests/supabase-migration-integrity.test.mjs` | `0b3e9801402ee7014556cfee750ee0d5f26a002922551ead602ddae4c3184ad4` |

They must remain byte-for-byte unchanged, unstaged, and uncommitted throughout this sprint. `.env.local` must also remain unchanged. Any additional unexplained starting change is a blocker.

## Owner-Approved Scope

- Audit the actual repository, production deployment, Supabase capabilities, test harness, target guards, seed/cleanup lifecycle, CI configuration, environment assumptions, and fixture ownership before implementation.
- Select the safest maintainable isolated Supabase architecture actually available to this repository and account; provision/configure it when no paid-plan decision or owner-only credential action is required.
- Build the WeatherTech OS schema reproducibly in the isolated target without copying production business data or unnecessary production secrets.
- Keep all provider integrations and external side effects disabled or safely mocked, including Stripe, Gmail, Google Calendar, Twilio, QuickBooks, Yelp, AI providers, and webhooks.
- Strengthen fail-closed identity verification so write-capable regression proves the database is not production, belongs to the explicitly approved test environment, and matches the browser-observed, server, and service-role targets before any seed, read, write, cleanup, or delete.
- Require a unique current-run marker, collision refusal, explicit captured fixture IDs, bounded cleanup on success and ordinary failure, Stripe-linked cleanup refusal, diagnostics for residue, and a final exact zero-residue proof.
- Run every existing browser group against the verified non-production target without reducing coverage to obtain a green result; fix only sprint-related environment, lifecycle, or regression problems and add regression coverage where practical.
- Integrate the safe test-target and lifecycle contract into repository CI using protected secret storage, visible failures, non-zero exit status, and no silent skipping of critical browser groups.
- Document the approved target type, variable names, local and CI workflows, identity checks, synthetic seed/cleanup ownership, residue expectations, troubleshooting, and the prohibition against live financial/provider effects.
- After implementation, run all applicable repository, migration-integrity, security, company-isolation, target-guard, cleanup/residue, type-check, lint, build, dependency/security, full browser, console, and production read-only smoke checks.
- Commit, push, verify the exact production deployment, and close the sprint only after the approved implementation and validation are complete.

## Explicit Exclusions

- Do not run write-capable browser regression against production, reseed production, or use the production project as the normal test target.
- Do not weaken or remove the permanent production-project rejection, browser/server target agreement, credential identity check, unique-marker collision check, captured-ID cleanup, Stripe-linked cleanup refusal, or zero-residue verification.
- Do not copy production business data into the non-production environment.
- Do not trigger Stripe live payments, refunds, customers, webhooks, or any financial object.
- Do not send real email, SMS, calendar events, customer messages, QuickBooks writes, Yelp/provider calls, AI-provider writes, or other external side effects.
- Do not alter the provider-write approval model, turn the expected readiness HTTP 503 into a false green result, enable live Stripe gates, activate providers, or activate IHC Stripe.
- Do not rebuild AI Command Center 3.0, begin Yelp/Mighty Apes or CompanyCam work, activate Twilio or QuickBooks, or perform a broad UI redesign.
- Do not delete the deliberately preserved mixed-provenance IHC lead/property graph.
- Do not make destructive production changes, weaken RLS, expose secrets, commit credentials, modify `.env.local`, or touch the two preserved Property Intelligence files.
- Do not select, approve, promote, or begin another sprint.

## Mandatory Stop Conditions

Stop only when:

- an external login or authentication action must be completed by the owner;
- a paid resource, plan change, or billing decision is required;
- credentials cannot safely be provisioned with existing authorized tooling;
- a destructive or irreversible production operation would be required;
- a target cannot be positively identified as isolated non-production before mutation; or
- a genuine business or security decision cannot be resolved from the repository and verified architecture.

Routine non-production resource configuration, CI changes, test fixes, schema reproduction in the isolated test target, commits, pushes, and deployment verification are approved and are not stop conditions.

## Completion Criteria

- A real isolated non-production Supabase target exists, contains reproducible WeatherTech OS schema, contains no copied production business data, and is explicitly documented as the sole hosted regression target.
- Every write-capable run proves target identity and browser/server/service-role agreement before any database operation; production, missing, malformed, unknown, or mismatched targets fail closed before access.
- Each run owns a unique marker and exact fixture IDs, refuses collisions, cleans only its own records, refuses Stripe-linked records, cleans on success and ordinary failure where safe, and proves zero current-run residue.
- The complete intended browser suite passes against non-production with all expected groups and assertions reported; browser warnings/errors are zero or explicitly explained.
- Production remains unchanged by regression execution and retains the clean starting baseline; the mixed-provenance IHC graph remains untouched.
- CI obtains credentials only from protected secret storage, rejects production by default, exposes test results, returns non-zero on unsafe setup or test failure, executes cleanup/residue verification reliably, and cannot silently skip critical browser groups while reporting success.
- Documentation accurately explains local/CI setup, variable names only, target verification, schema provisioning, seed/cleanup lifecycle, residue handling, troubleshooting, and the prohibition against live provider side effects.
- Every applicable `tests/*.test.mjs` test, migration-integrity/security/company-isolation/target/lifecycle test, type-check, lint, production build, `git diff --check`, credential scan, and available dependency/security audit passes.
- Final production read-only smoke confirms the canonical deployment, `/api/health`, truthful `/api/readiness`, application shell and major workspaces, console state, clean baseline, disabled Stripe gates, and IHC isolation.
- `.env.local` and both protected Property Intelligence files retain their starting content and hashes and remain unstaged/uncommitted.
- The focused implementation and any required documentation-only closeout are committed and pushed; local `HEAD`, `origin/main`, live GitHub main, and the intended Vercel deployment are verified to match.

## Validation Plan

- Verify branch, local/remote/live commit identity, deployment, Git state, protected hashes, `.env.local`, Supabase organization/project identity, project capabilities, migration ledger, and CI/harness architecture.
- Exercise target guards for production, missing, malformed, unknown, browser/server mismatch, credential mismatch, allowed explicit non-production, marker collision, unrelated-record preservation, Stripe-linked refusal, bounded cleanup, ordinary-failure cleanup, and residue detection.
- Apply committed schema/migrations only to the verified isolated test target and verify migration order, RLS/security behavior, required Data API access, provider-disabled state, and synthetic-only seed prerequisites.
- Run every `tests/*.test.mjs` file plus type-check, lint, build, `git diff --check`, credential/secret scan, and available dependency/security checks.
- Run the complete browser regression against non-production; capture exact groups/assertions, console output, cleanup result, and zero-residue evidence.
- Perform read-only production smoke and baseline verification only; never seed or run write-capable regression against production.
- Recheck `.env.local` and protected-file hashes before staging, after commit, and at final completion.

## Planned Commit Messages

- Implementation: `test: add isolated regression environment lifecycle`
- Documentation-only closeout, if required: `docs: close non-production regression sprint`

## Final Status

Completed. The focused implementation shipped in `6354429976fb7a549bbc738fc0b76b3c5ea2022b`. WeatherTech OS now uses the dedicated isolated Supabase regression project `hygtnhmmaoboduqghhwg`; the complete browser suite passed all 24 groups and 28 assertions with zero console errors, zero console warnings, successful bounded cleanup, and zero run residue. Repository validation passed all 25 top-level tests, type-check, lint, production build, dependency audit, patch checks, workflow checks, and credential scanning. Production remained read-only and unchanged.

## Notes

The owner chooses the next sprint. Completion of this sprint does not authorize another provider, product, or activation sprint.
