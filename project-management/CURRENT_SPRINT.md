# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Production Data Isolation & Clean Baseline

## Objective

Make WeatherTech OS safe to begin operating with trustworthy real business data by preventing ordinary automated regression tests from writing to Production Supabase and by removing only production records whose synthetic origin is proven.

## Owner

Joe Harris

## Owner Approval Date

2026-08-11.

## Owner-Approved Scope

- Prove the starting repository, production deployment, Supabase target, regression architecture, and affected production-data state without guessing.
- Implement a fail-closed target-verification mechanism for automated browser/regression seed and cleanup operations.
- Require an explicit, narrow authorization path for purpose-built production validation; ordinary regression credentials or synthetic names are never sufficient authorization.
- Identify synthetic records using database evidence, including markers, known test IDs, relationships, timestamps, sources, and records created by the regression harness.
- Delete or correct only records whose synthetic origin and dependent relationships are proven.
- Leave uncertain records unchanged and report them for owner review.
- Verify dashboard, invoice, payment, overdue, AI-summary, analytics, and other operational aggregates after safe cleanup.
- Add regression coverage for production-target rejection, cleanup rejection, allowed non-production operation, and preservation of narrowly authorized production-validation paths.
- Update only governance and documentation required to record the implemented isolation contract, cleanup evidence, verified current product state, and sprint completion.
- Run all safe applicable validation, commit the focused implementation, push it, close the sprint with a documentation-only commit, and verify the deployed result.

## Explicitly Preserved Working-Tree Changes

The owner explicitly designated these two pre-existing unstaged files as preserved exceptions to the normal clean-tree gate:

| File | Starting SHA-256 |
| --- | --- |
| `supabase/migrations/0026_property_intelligence_foundation.sql` | `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` |
| `tests/supabase-migration-integrity.test.mjs` | `0b3e9801402ee7014556cfee750ee0d5f26a002922551ead602ddae4c3184ad4` |

They must remain byte-for-byte unchanged, unstaged, and uncommitted throughout this sprint. Any additional pre-existing or unexplained working-tree change is a blocker.

## Explicit Exclusions

- Do not redesign the UI or add unrelated product functionality.
- Do not rebuild AI Command Center 3.0 or the completed WeatherTech Roofing Stripe foundation.
- Do not remove or remap the verified WeatherTech Stripe production account/connection configuration as synthetic cleanup.
- Do not work on Yelp; live Yelp remains an external dependency awaiting the Mighty Apes/Yelp webhook handoff.
- Do not activate Twilio, QuickBooks, AI providers, IHC Stripe, CompanyCam, or another unrelated provider.
- Do not delete, change, or manufacture any record whose origin is uncertain.
- Do not run an ordinary write-capable browser regression against Production Supabase.
- Do not perform destructive schema work or an irreversible migration.
- Do not expose or commit secrets, modify `.env.local`, or weaken authentication, RLS, approval gates, or company isolation.
- Do not modify, stage, commit, stash, discard, reset, or reconstruct the two preserved Property Intelligence files.
- Do not select, approve, promote, or begin a next sprint.

## Mandatory Stop Conditions

Stop only when:

- a destructive production-data action cannot be proven safe;
- a production record cannot be confidently classified as legitimate or synthetic;
- owner credentials or external account interaction are required;
- an irreversible migration or destructive schema operation is required; or
- another owner decision cannot be resolved from verified evidence.

## Completion Criteria

- Starting state and protected-file hashes are recorded.
- Ordinary regression seed and cleanup operations fail closed before any production write or delete.
- Approved non-production test targets continue to work.
- Any narrow production-validation override requires explicit purpose-built authorization and does not weaken ordinary regression protections.
- Every cleaned record has evidence-backed synthetic classification and safe dependency handling.
- All uncertain records remain untouched and are reported.
- Production aggregates no longer include records proven to be regression contamination.
- Relevant isolation, cleanup, migration-integrity, security, company-isolation, and repository tests pass without creating production test data. A full write-capable browser regression may be omitted only when no verified safe non-production target exists, with direct fail-closed guard proof and the residual coverage gap recorded.
- Type-check, lint, production build, `git diff --check`, and secret/diff scans pass.
- `.env.local` is unchanged and no credentials or secret fragments are present in the diff.
- The two preserved Property Intelligence files retain their recorded hashes and remain unstaged and uncommitted.
- One focused implementation commit and, where needed to record its immutable hash, one documentation-only closeout commit are pushed.
- Local `HEAD` equals `origin/main`, the intended Vercel deployment reaches the pushed code commit, production health is verified, and readiness is reported truthfully.
- [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md), [NEXT_SPRINT.md](./NEXT_SPRINT.md), and current-state documentation are accurate without selecting another sprint.

## Validation Plan

- Verify repository path, branch, local/remote commit equality, production deployment commit, Git operation state, and protected-file hashes.
- Verify the linked Supabase project before every production read or approved cleanup action.
- Capture pre-cleanup row counts and relationships without exposing customer data or secrets.
- Exercise isolation guards with mocked or non-production target identities; prove production detection and cleanup rejection without mutating production.
- Run repository tests, targeted isolation tests, migration-integrity tests, relevant security/company-isolation tests, type-check, lint, build, and `git diff --check`.
- Run browser regression only against a verified safe non-production target. If none exists, validate fail-closed behavior and document the unrun browser coverage and residual risk.
- Inspect the signed-in production application read-only after deployment, including console output and major operational aggregates.
- Recheck protected-file hashes before staging, after commit, and at final completion.

## Planned Commit Messages

- Implementation: `fix: isolate regression data from production`
- Documentation-only closeout, if required: `docs: close production data isolation sprint`

## Final Status

Completed. The focused implementation shipped in `c57698786e83732e49b8cb4ace83e3128539b28f`; exact cleanup, validation, deployment, production baseline, and preservation evidence is recorded in [Production Data Isolation And Clean Baseline](../docs/PRODUCTION_DATA_ISOLATION_AND_BASELINE.md). The documentation-only closeout commit is identified by Git history because it cannot contain its own immutable hash.

## Notes

Yelp remains unapproved external work awaiting the Mighty Apes/Yelp webhook handoff. AI Command Center 3.0 and the WeatherTech Roofing Stripe foundation already exist and are not backlog items for this sprint.
