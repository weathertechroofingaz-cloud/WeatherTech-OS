# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved, including the exact three-migration immutable release chain.

The owner explicitly approved this exact sprint in the Codex task on 2026-08-16. On 2026-08-17, the owner explicitly replaced the originally singular migration constraint only as needed to retain and release the already-created, already-validated migrations `20260816122114`, `20260816143152`, and `20260816164202`. The supplied attribution model, formulas, security boundaries, test-data correction, validation gates, migration authority, and provider exclusions are authoritative; no additional schema, provider, environment, integration, or unrelated application change is authorized.

## Sprint Name

Lead Attribution & Marketing Accountability Phase 1 — Verified Origin, Funnel & Manual Spend

## Objective

Make WeatherTech OS ready to measure real lead acquisition before production lead intake begins: preserve defensible first-touch source evidence, separate acquisition source from transport provider, track assigned ownership and auditable funnel milestones, accept owner-entered monthly spend, and calculate company-isolated accountability metrics without converting missing evidence into false certainty.

## Owner

Joe Harris

## Owner Approval Date

2026-08-16.

## Verified Starting State

- Canonical repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`.
- Branch: `main`.
- Starting local `HEAD`, `origin/main`, live remote `main`, and canonical deployment: `f5f0826041bd7e6b8cb7358a9e85f5a7cfbfea69`.
- Working tree and index: clean.
- Production Supabase project: `gahfcgyjtfwwmsterhzu` / WeatherTech OS / `ACTIVE_HEALTHY`; local and Production ledgers match all `45/45` committed migrations.
- Existing Production counts include ten owner-identified test leads. They are not historical business truth, must not be attributed or backfilled automatically, and must not be reported as real marketing KPIs.
- No `marketing_campaigns`, `lead_accountability`, `lead_accountability_events`, or `marketing_spend_months` table exists at the starting checkpoint.
- The preceding inbound-only Twilio sprint is closed. Phoenix is live-validated `1/1`, Tucson `2/2`, IHC remains `ready_for_live_test` at `0/0`, and outbound SMS and voice remain disabled.
- `supabase/migrations/0026_property_intelligence_foundation.sql` starts at SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` and must remain unchanged.
- `tests/supabase-migration-integrity.test.mjs` starts at SHA-256 `2d209622bf3afeeb69ea342beb4d6ef731a5ff2f6214bbec7295273bab85308e`; it may receive only the strictly additive registration and contract assertions required for the new legitimate migration.
- `.env.local` starts at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0` and must remain unchanged.

## Canonical Attribution Contract

- Use first-touch acquisition attribution and lock it against later communication-channel overwrite.
- Keep acquisition source separate from intake/transport provider.
- Canonical source keys: `website`, `google`, `yelp`, `phone`, `email`, `referral`, `repeat_customer`, `manual`, `other`, and `unknown`.
- Deterministic evidence may set source detail, provider, campaign, and vendor. Ambiguous or insufficient evidence must remain explicit `unknown` and `needs_review`/`unattributed`; never default it to Website.
- Supported deterministic mappings include Google Ads and organic Google through website evidence, Google Business Profile, Mighty Apes Yelp, Gmail/email, exact phone intake, explicit referral, repeat-customer opportunity, manual source, and explicit unknown.
- Existing unsupported Production test records receive no automatic accountability row or attribution backfill.

## Owner-Approved Scope

- Add the smallest additive, non-destructive migration required for company-scoped campaigns, one accountability record per lead, immutable non-PII accountability events, monthly manual marketing spend, and transactional/idempotent mutation functions.
- Add strict RLS, least-privilege grants, cross-company reference checks, stale-version rejection, immutable-event enforcement, deterministic operation keys, and atomic current-state/event writes consistent with existing owner/admin roles.
- Preserve `leads.created_by` as creator audit data and add explicit assigned lead ownership.
- Integrate supported new lead-creation and provider-intake paths so each new lead gets defensible first-touch attribution or explicit unknown/review state without breaking existing intake.
- Add reviewed attribution correction, owner assignment, successful-human-contact, appointment, inspection, estimate-sent, won, and lost workflow actions tied to authoritative linked records where available.
- Require explicit valid won value and approved basis; require a structured lost reason, with notes required for `other`.
- Add explicit same-company `Create repeat opportunity` from Customer 360.
- Add owner/admin manual monthly spend entry by company, month, source/detail, vendor, optional campaign, amount, and notes. Do not create Production spend data.
- Add a focused company/month/source-filtered Marketing Accountability dashboard using the existing design system.
- Calculate lead count, spend, cost per lead, booking rate, inspection completion rate, closing rate, cost per sold job, attributable contract revenue, marketing revenue/spend, new leads awaiting contact, unsold estimates needing follow-up, attribution coverage, unattributed count, missing won-value count, and workflow/data-quality gaps using the owner-approved formulas.
- Use `America/Phoenix` whole-calendar-month boundaries unless a more authoritative existing company timezone is proven.
- Add deterministic repository, migration, hosted isolated lifecycle, security, concurrency, rollback, targeted Browser, and full isolated Browser regression coverage with zero residue.
- If every gate passes, commit, push, deploy through the established pipeline, apply the exact additive migration through the normal linked Supabase workflow after preflight, perform read-only Production verification, and close governance.

## Explicit Exclusions

- No destructive migration, automatic or bulk backfill, inferred historical attribution, production test-lead deletion, fake Production spend, or uncontrolled synthetic Production lead.
- No cross-company campaign, owner, lead, customer, spend, attribution, or reporting relationship.
- No use of `leads.created_by` as assigned owner and no silent rewrite of historical creator data.
- No default of unknown/manual evidence to Website; no later email, SMS, call, or other communication may overwrite locked first touch.
- No broad UI redesign or unrelated application cleanup/refactor.
- No Twilio outbound, voice, A2P, Gmail/Calendar provider configuration, Yelp/Mighty Apes configuration or signing-secret change, Google Ads/Meta API activation, QuickBooks, Stripe, OAuth, AI, CompanyCam, portal, or broad production-approval change.
- No modification of `.env.local`, migration `0026`, historical migrations, or unrelated completed sprint work.
- No weakening, bypass, deletion, disabling, or circumvention of migration-integrity, RLS, company-isolation, regression-target, provider-write, cleanup, or security tests.
- No next-sprint selection or implementation.

## Completion Criteria

- Every supported new lead path creates one company-scoped accountability record with defensible first-touch evidence or explicit unknown/review state; retries and concurrent requests converge.
- Existing ten Production test leads remain unchanged and excluded from truthful marketing KPI claims unless deliberately reviewed in a separately authorized future operation.
- Creator and assigned owner are distinct, company-safe concepts.
- Funnel milestones are auditable and validated against authoritative linked workflow evidence; automated acknowledgement and draft job creation do not count as human response or sale.
- Won and lost transitions enforce the approved value/basis and reason requirements.
- Repeat opportunity creation is explicit, same-company, idempotent, and produces a new independently attributable lead.
- Manual spend is owner/admin-only, nonnegative, USD, company/month/source/vendor/campaign scoped, idempotent, and never fabricated.
- Dashboard calculations match every approved formula, show unavailable for zero denominators, use Phoenix month boundaries, and expose attribution/value/linkage gaps.
- RLS, grants, immutable events, cross-company refusal, stale writes, concurrent retries, rollback, and company isolation pass on the isolated hosted target.
- Targeted signed-in Browser regression and the complete established isolated Browser suite pass with zero unexplained console errors/warnings and zero residue.
- All repository tests, migration integrity, type-check, lint, production build, dependency audit, whitespace, secret scan, and scope/protected-file audits pass.
- The exact owner-authorized migration release is applied only through the normal safe linked workflow after exact target/ledger/data preflight; it performs no business-row inserts, updates, deletes, or backfill.
- Production remains healthy, all five Phase 1 tables contain zero rows until real/reviewed operations occur, existing business/provider fingerprints remain unchanged, and all provider gates stay unchanged.

## Validation Plan

- Verify Git/ref/deployment identity, clean tree, governance, protected hashes, Production/regression target identity, migration parity, current schema, and baseline fingerprints.
- Test canonical source classification, provider/source separation, ambiguity refusal, first-touch lock, correction audit, ownership, lifecycle ordering, idempotency/concurrency, won/lost requirements, spend uniqueness/validation, formulas, zero denominators, Phoenix month boundaries, and data-quality reporting.
- Exercise Website, Google Ads, Google Business Profile, Google organic, Yelp/Mighty Apes, Gmail/email, deterministic phone, referral, repeat-customer, manual, and unknown flows without external provider activation.
- Run a hosted isolated lifecycle covering role/ACL/RLS boundaries, cross-company names and references, stale/retried/concurrent operations, immutable events, rollback, ordinary workflow linkage, and exact cleanup/zero residue.
- Run targeted signed-in Browser coverage for attribution review, owner assignment, repeat opportunity, won/lost workflow, spend entry, dashboard formulas, and company switching/isolation; then run the complete established isolated Browser suite.
- Run every top-level test, type-check, lint, build, dependency audit, `git diff --check`, link/credential/PII scans, and migration advisors as applicable.
- Audit and stage only approved sprint paths; verify protected hashes before staging and at completion.
- Push the implementation commit; verify exact CI/deployment identity; apply the exact owner-authorized migration release after safe preflight; then verify Production schema, zero new-table rows, unchanged business/provider fingerprints, health/readiness, and provider gates.
- Record the immutable implementation commit in completed governance with at most one documentation-only closeout commit.

## Planned Commit Messages

- Implementation: `feat: add lead attribution accountability`
- Documentation closeout, if required: `docs: close lead attribution accountability sprint`

## Final Status

Implementation and isolated validation are complete. The exact owner-approved three-migration release is proceeding through final scope audit, commit, push, CI/deployment verification, Production application, read-only verification, and governance closeout.

## Notes

This approval resolves routine product and architecture decisions within the stated contract. Codex must stop only for a genuine credential, external-account, destructive-operation, or unresolved business-decision blocker. No next sprint may begin after closeout.

### Migration-authority checkpoint

Isolated validation exposed release-blocking defects only after the base migration had been applied to the approved non-Production regression project. Preserving immutable migration history required two additive, non-destructive hardening migrations rather than rewriting the applied base:

- `20260816122114_lead_attribution_marketing_accountability_phase_1.sql` — SHA-256 `1cd4051f320fdb82253a92d3b440dbc307a72b8dba78d170f6592ca4545b8622`.
- `20260816143152_lead_accountability_nonretryable_stale_errors.sql` — SHA-256 `618cf2b2d7976758edd24a07f531221ea56686fb3d53dbd6c2598851ed02af6a`.
- `20260816164202_lead_accountability_idempotency_integrity_hardening.sql` — SHA-256 `8c976c8cd21f123e5abca4e5987e4a67301091a108044698ed610e99faea2250`.

Together they create the four approved business tables plus the internal, non-PII `marketing_accountability_operation_receipts` table required for durable campaign/spend retry convergence. The regression ledger is `48/48`; the Production ledger remains `45/45`, and none of these migrations has been applied to Production at this checkpoint. The owner granted the required three-migration release approval on 2026-08-17; the exact validated chain may now proceed through the established release workflow, but no fourth or replacement migration is authorized.
