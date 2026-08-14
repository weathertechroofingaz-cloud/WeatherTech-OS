# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

The owner explicitly approved this sprint in the Codex task and subsequently resolved the Property Intelligence prerequisite at commit `5718a7afb4a882c1e24861f7c494467630ea782f`.

## Sprint Name

CRM Identity Integrity Phase 1 — Customer & Property Reconciliation

## Objective

Give WeatherTech Roofing LLC and IHC Painting a safe, reviewed way to reconcile an existing lead/property operational graph to exactly one same-company customer. The workflow must be evidence-based, transactional, idempotent, auditable, and fail closed on ambiguity, stale data, or any cross-company relationship.

## Owner

Joe Harris

## Owner Approval Date

2026-08-13.

## Verified Starting State

- Repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`.
- Branch: `main`.
- Starting local `HEAD`, `origin/main`, and live GitHub `main`: `5718a7afb4a882c1e24861f7c494467630ea782f`.
- The working tree and index were clean at the approval gate.
- `supabase/migrations/0026_property_intelligence_foundation.sql` was committed by the owner-authorized standalone prerequisite and has SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e`.
- `tests/supabase-migration-integrity.test.mjs` started this sprint at SHA-256 `0b3e9801402ee7014556cfee750ee0d5f26a002922551ead602ddae4c3184ad4` and may receive only the strictly additive registry and contract assertions required for this sprint's legitimate migration chain.
- `.env.local` started at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0` and must remain unchanged.
- Production has zero customers while existing leads, properties, jobs, estimates, inspections, schedules, and office tasks contain operational graphs with missing customer links. Individual production-record provenance is not assumed.
- Existing direct lead conversion and opportunity flows can create/link records through multiple non-transactional writes and can silently alter lead status or stage.
- Existing property links are company scoped in application use, but the database does not comprehensively enforce same-company customer/property relationships across the approved operational graph.

## Owner-Approved Scope

- Add one logical, additive, non-destructive Supabase schema change through the normal migration directory and register its immutable five-migration validation/hardening chain additively in the existing migration-integrity system.
- Add an immutable, company-scoped reconciliation audit ledger and one tightly authorized transactional reconciliation function.
- Require explicit owner/admin review, a stable operation key, exact expected row versions, deterministic row locking, and exact same-company validation before any mutation.
- Reconcile exactly one reviewed lead graph by either linking one unique evidenced same-company customer or creating exactly one customer from the locked lead's identity fields.
- Propagate only explicitly selected customer/property links through the approved tables: leads, properties, estimates, inspections, jobs, schedule events, and office tasks.
- Preserve lead status and pipeline stage byte-for-byte during reconciliation.
- Add database enforcement that rejects cross-company customer/property/source links for the in-scope tables; abort on pre-existing mismatches rather than repairing or backfilling them.
- Add a company-partitioned Identity Reconciliation review queue within the existing Customers/Customer 360 workflow, with a compact Office Operations entry point only if needed. Do not add a new top-level module.
- Use conservative normalized exact evidence. Refuse shared, conflicting, ambiguous, insufficient, stale, or cross-company matches. Address alone is property evidence, not sufficient customer identity.
- Provide explicit preview, approve, and dismiss behavior. Do not automatically merge or delete customer records.
- Replace unsafe direct lead/opportunity conversion with the reviewed reconciliation path. Unlinked estimate/job workflows must wait for an approved customer link rather than silently creating one.
- Add targeted unit, migration, authorization, concurrency, rollback, retry, company-isolation, hosted regression, residue-cleanup, and browser coverage.
- Apply and validate the exact migration chain against the isolated regression project first. Production schema application is allowed only after every registered migration passes all checks and a read-only zero-mismatch preflight; production record reconciliation requires an individually owner-selected, evidence-proven graph.
- Commit, push, deploy the validated capability, verify exact Git/deployment identity and health, and close the sprint only after all approved non-destructive validation passes.

## Explicit Exclusions

- No destructive migration, bulk reconciliation, automatic backfill, automatic merge, customer deletion, or guessed production linkage.
- No cross-company matching or relationship propagation between WeatherTech Roofing LLC and IHC Painting.
- Do not mutate the preserved mixed-provenance IHC graph or any production record without exact owner-selected provenance.
- Do not modify `supabase/migrations/0026_property_intelligence_foundation.sql`.
- Do not weaken, bypass, delete, disable, or circumvent migration-integrity, RLS, authorization, regression-isolation, or security tests.
- Do not use direct SQL, runtime DDL, seeds, alternate migration directories, or out-of-ledger schema changes.
- Do not modify `.env.local` or add secrets.
- Do not activate or modify Twilio, Yelp, Gmail/Calendar writes, QuickBooks, AI, CompanyCam, portals, provider accounts, OAuth settings, Stripe gates, or broad production approval.
- Do not perform broad UI redesign, unrelated cleanup, or unrelated feature work.
- Do not begin Yelp Lead Intake or any next sprint.

## Completion Criteria

- The additive migration chain creates the immutable audit ledger, authorization boundary, idempotent transaction function, and same-company enforcement without destructive data changes or backfill.
- Exact retry of an operation returns the same durable result; conflicting reuse, concurrent submissions, stale versions, partial failures, ambiguity, and cross-company inputs fail safely without partial writes.
- Only explicitly reviewed graph rows receive customer/property links, and lead status/stage remain unchanged.
- Duplicate detection and reconciliation candidate selection are intrinsically company scoped.
- The existing Customers workflow shows evidence, proposed action, exact selected rows, and disables unsafe approval; reviewed dismissal is auditable.
- Unsafe direct conversion/implicit customer creation paths no longer bypass review.
- Migration-integrity, repository, type-check, lint, build, dependency/security, targeted reconciliation, company-isolation, and isolated hosted regression checks pass without weakened assertions.
- Targeted reconciliation browser validation and the complete isolated browser regression pass with zero unexplained console errors/warnings and zero residue.
- Production schema is applied only after a zero-mismatch preflight. No production business record is reconciled unless the owner identifies one exact graph with proven provenance; otherwise capability deployment is validated read-only and the data mutation is explicitly deferred.
- Production health remains HTTP 200 and readiness remains truthful; no provider or financial side effects occur.
- The Property Intelligence migration and `.env.local` retain their starting hashes.
- A focused implementation commit and, if required, one documentation closeout commit are pushed; local `HEAD`, `origin/main`, live GitHub main, and the deployment are verified.

## Validation Plan

- Verify branch/ref identity, clean tree, prerequisite hashes, linked migration ledger, and production/regression targets before implementation.
- Run migration-integrity and migration contract tests, including RLS/grants, immutable audit behavior, same-company guards, transaction/locking, no status mutation, and no provider/financial targets.
- Run pure matching tests for exact, no-match, shared, conflicting, ambiguous, and cross-company identities.
- Run isolated hosted database cases for existing-customer link, reviewed create, dismiss, retry, conflicting operation key, concurrency, stale versions, rollback, permission refusal, audit immutability, side-effect absence, and zero cleanup residue.
- Run every top-level repository test, `npm run type-check`, `npm run lint`, `npm run build`, `npm audit --audit-level=high`, `git diff --check`, and credential/secret scans.
- Run targeted `crm-reconciliation` browser validation and the complete isolated browser regression, including reload persistence, Customer 360/Office Operations context, ambiguity refusal, double-submit idempotency, company isolation, unchanged status/stage, zero console errors/warnings, and zero residue.
- Perform a final diff/scope audit, confirm the Property Intelligence migration and `.env.local` hashes, stage only approved files, commit, push, and verify Git/CI/deployment/production health.

## Verified Completion Evidence

- Implementation commit `8ab9f55af5e15ba1706ab71f06ade8312c0f6639` is pushed to `main`, passed GitHub Actions run `31779710356`, and was deployed to the canonical Vercel production application.
- The five-file additive reconciliation migration chain was applied through the normal linked Supabase migration path. The isolated regression and Production ledgers each matched all `43/43` committed migrations after application.
- The isolated hosted database lifecycle passed `80/80` assertions with zero residue. All `28/28` top-level repository test files, type-check, lint, production build, dependency audit, and `git diff --check` passed.
- Targeted reconciliation, Sales, and Estimates browser checks passed, followed by the complete `24/24`-group, `29/29`-assertion isolated browser regression with zero console errors, zero console warnings, and zero residue.
- Authenticated read-only production UI validation found the reconciliation surface schema-ready, kept the WeatherTech and IHC queues company isolated, and kept unsafe IHC approval disabled. No production mutation was clicked, and the browser console had zero errors or warnings.
- Production schema validation confirmed the exact audit table (`14` columns, `13` validated constraints, `7` indexes, RLS/ACL), `12/12` functions, and `39/39` triggers; all `41` company-link and reverse-property checks were zero.
- No production business graph was reconciled. Production still had zero customers at closeout, the reconciliation audit ledger had zero entries, and all `70/70` pre-existing public-table row counts and canonical full-row SHA-256 fingerprints were unchanged.
- `/api/health` remained HTTP 200. `/api/readiness` remained truthfully blocked with HTTP 503; Twilio outbound and broad production approval remained disabled.
- `supabase/migrations/0026_property_intelligence_foundation.sql` retained SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e`, and `.env.local` retained SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.

## Planned Commit Messages

- Implementation: `feat: add reviewed customer property reconciliation`
- Documentation closeout, if required: `docs: close CRM identity reconciliation sprint`

## Final Status

Completed.

## Notes

The owner stated that Yelp Lead Intake is intended to be the next owner-approved sprint after this sprint closes. The webhook specification is available, but no Yelp implementation, activation, or next-sprint promotion has been approved or started.
