# Current Sprint

This file records the active owner-approved WeatherTech OS sprint and its lifecycle status. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md), [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md), and this file before development.

## Approval Status

Approved

The owner explicitly approved end-to-end execution on 2026-09-01. The approval authorizes the focused repository, additive Supabase schema/RLS, server execution, owner UI, validation, commit, pull-request, merge, Production migration/deployment, and verification work required to connect the existing AI Command Center 3.0, CRM, office-task automations, provider adapters, and approval architecture into one production operating system. It does not authorize a real customer message, outbound call, number change, carrier change, destructive database operation, invented provider identity, or weakening of any company/security boundary.

## Sprint Name

WeatherTech OS — AI 3.0 Production Automation & OS Launch

## Objective

Complete only the missing execution layer between the already-built AI Command Center 3.0, WeatherTech OS CRM, existing office-task workflows, integration events, approvals, and provider adapters. WeatherTech OS remains the company-scoped system of record. The result must provide a durable, auditable, idempotent, retry-safe automation engine and a simple owner-facing control center while keeping customer-facing actions approval-gated unless a specific rule is separately and explicitly authorized.

## Owner

Joe Harris

## Owner Approval Date

2026-09-01.

## Verified Starting State

- Canonical repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`; starting `main` SHA `bd22060d073f731f813b8e6e7bba5f2b37df693c`.
- Working branch: `codex/weathertech-ai-3-production-automation-os-launch`; it was created from exact local/remote/live `main` with a clean tree and index and no interrupted Git operation.
- Canonical Production `/api/health` returns HTTP `200` at the exact starting SHA. `/api/readiness` truthfully remains HTTP `503` under the existing broad provider-safety policy while runtime, environment, auth, and Supabase checks pass.
- Production Supabase project `gahfcgyjtfwwmsterhzu` is `ACTIVE_HEALTHY` on PostgreSQL 17 with exact local/Production migration parity at `51/51`; latest migration is `20260824044610_native_proposal_esign_sold_job_gate`.
- AI Command Center 3.0, the OpenAI/Anthropic adapter, grounded company-scoped context, saved work/audit tables, rule-based daily priorities, action previews, and provider usage limits already exist. Executable actions are intentionally hard-disabled in the starting code.
- The office operations queue already provides company-scoped, RLS-protected, idempotent internal task generation for new leads, inspection events, sent estimates, and job lifecycle events. This sprint must reuse it.
- GoHighLevel, Twilio, Mighty Apes/Yelp, Stripe, Gmail, Calendar, website intake, and other integrations already have provider/readiness/audit surfaces. They remain adapters behind WeatherTech OS and must not become a second CRM.
- Final phone architecture is immutable in this sprint: Tucson alone uses signed Twilio Voice; WeatherTech Phoenix and IHC remain direct-carrier voice with their Twilio numbers SMS-only.
- Protected starting hashes:
  - `.env.local`: `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.
  - `package.json`: `d7a15f1db3be9dc7b813439c37c749e049ad4d3282dccb9c7aeb711a28333f12`.
  - `package-lock.json`: `ddfc2149c4ef7ceae7c277a2e7b74ba027eb5fdca5cf193a1c36575a40ba6d22`.
  - `supabase/migrations/0026_property_intelligence_foundation.sql`: `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e`.
  - `supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql`: `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`.

## Owner-Approved Scope

- Perform a delta-only audit of the existing AI, CRM, office-task workflow, approval, integration, notification, company/location, provider, and audit infrastructure; reuse completed architecture rather than rebuilding it.
- Add one centralized company-scoped automation model for rules, trigger events, conditions, action definitions, delay/due timing, enabled state, approval requirements, execution history, attempts, retry/failure state, cancellation, and deterministic idempotency.
- Extend existing AI action previews and approval boundaries so safe authorized internal actions can execute through the centralized engine; keep all customer-facing communications blocked or approval-required unless a specific rule is explicitly owner-approved.
- Reuse the existing `office_tasks` queue for internal follow-up/reminder actions and connect existing CRM/provider events to the centralized automation history without duplicating core CRM records.
- Provide sensible disabled or internal-only starter rules for new leads, Yelp/website intake, estimate follow-up, approved-estimate operations handoff, completed-job follow-up, stale leads, and other supported existing data events.
- Provide a simple owner-facing Automation Control Center showing rule, trigger, action, company/location, enabled state, approval requirement, last run, result, retry/failure state, and history; the owner must be able to disable an automation without developer intervention.
- Make Daily Operations and AI recommendations use the same authorized WeatherTech OS data and surface actionable internal work, overdue/stale records, unscheduled approved jobs, unpaid invoices, customer waits, recent activity, and highest priorities without fake Production data.
- Preserve and validate existing GoHighLevel source-of-truth, external-ID, company-routing, deduplication, logging, retry, and loop-prevention behavior; add only a narrow adapter connection if the delta audit proves it missing.
- Preserve and validate Mighty Apes/Yelp authoritative campaign routing, immutable webhook evidence, exact-once lead creation, `lead.test` isolation, and follow-up-task automation; never invent a campaign ID.
- Preserve existing Twilio, Stripe, Gmail, Calendar, website-intake, and provider behavior. Connect only legitimately available inbound/provider data to automation events and never claim unavailable carrier SMS.
- Add only additive, non-destructive Supabase migration/RLS/grants required for the centralized engine, generated through the repository Supabase workflow. Preserve existing rows and historical migrations.
- Run focused, repository-wide, hosted isolated, Browser, security, CI, migration, deployment, and exact-SHA Production workflow verification; fix in-scope defects autonomously.
- Create one focused implementation commit, push one branch, obtain exact-head CI/review/Preview evidence, merge through the established procedure, apply the exact reviewed migration to Production, deploy exact merge SHA, verify Production, and perform one documentation-only closeout commit if required by the sprint workflow.

## Explicit Exclusions

- No rebuild of AI Command Center 3.0, CRM, office-task queue, completed provider integrations, or final phone routing.
- No GoHighLevel-as-system-of-record redesign and no second independent CRM.
- No destructive schema/data change, historical migration edit, `.env.local` change, package-manifest change, unrelated lockfile churn, or secret exposure. The single transitive Browserslist lockfile update is allowed only to clear the newly published high-severity audit findings, with no added/removed package and with the complete validation suite rerun.
- No real SMS, email, call, customer reply, signature request, review request, campaign, charge, refund, payout, provider contact write, or other customer/financial side effect without a separately verified explicit approval path.
- No global AI permission to message customers or mutate arbitrary CRM records. AI output remains grounded, company-scoped, permission-aware, and action-schema constrained.
- No port, purchase, release, transfer, reassignment, forwarding, webhook, recording, transcription, or ownership change for any phone number. Tucson-only Twilio Voice and Phoenix/IHC carrier-direct voice remain unchanged.
- No invented Mighty Apes/Yelp campaign IDs, no conversion of `lead.test` into a real lead workflow, and no provider-side authorization claim without direct evidence.
- No weakening of authentication, RLS, company/location isolation, webhook verification, duplicate protection, idempotency, audit logging, approval requirements, provider safety flags, or server-only secret boundaries to obtain a green result.
- No unrelated feature, UI redesign, provider purchase, billing-plan decision, legal-language invention, or later sprint selection.

## Completion Criteria

- One central automation engine durably represents rules, company/location ownership, triggers, conditions, actions, delays, enabled state, approval requirements, executions, attempts, retry/failure state, cancellation, and immutable audit history.
- Event ingestion and action dispatch are idempotent and retry-safe; duplicate trigger delivery cannot produce duplicate customer communication or duplicate internal tasks.
- Existing CRM/provider events generate only authorized company-bound automation activity. Cross-company records, actors, events, rules, actions, and history fail closed.
- Safe internal starter automations create or surface work through existing WeatherTech OS task/history models. Customer-facing starter rules remain disabled or approval-gated.
- AI Command Center 3.0 remains grounded in authorized CRM data and can recommend/prepare actions; authorized internal action execution uses the central engine, while risky/provider actions remain blocked pending approval and provider readiness.
- Daily Operations truthfully answers the owner’s priority questions from live scoped WeatherTech OS data and exposes no fake Production records.
- The Automation Control Center lets an authorized owner view, enable/disable, inspect, retry/cancel where allowed, and audit rules/executions without developer intervention; unauthorized and cross-company mutations fail closed.
- Existing GoHighLevel, Yelp/Mighty Apes, website, Twilio, Stripe, Gmail, Calendar, CRM, office-task, phone-routing, and company-separation behavior remains intact.
- New schema is additive with explicit grants and RLS; Supabase security/performance advisors show no new blocker; local/regression/Production migration ledgers match exactly after rollout.
- All focused automation/AI/company-isolation/RLS/webhook/lead-intake/provider tests, every top-level repository test, type-check, lint, Production build, dependency audit, migration integrity, protected-file/scope/secret/diff checks, hosted isolated lifecycles, targeted Browser checks, and the complete established Browser suite pass with zero residue.
- Exact-head pull-request CI/review/Preview, merge/main CI, exact-SHA Production deployment, canonical health, applicable readiness, signed-in Production workflow, exact database state, and clean refs/worktree all pass.
- Governance completion records contain the exact immutable implementation and deployment evidence; no subsequent sprint is started.

## Validation Plan

- Freeze and compare repository refs, protected hashes, Production deployment/health/readiness, Vercel variable names and safe non-secret state, Production Supabase health/migrations, provider readiness, and existing CRM/integration evidence.
- Unit-test rule validation, event normalization, condition evaluation, permission checks, approval classification, deterministic idempotency, delay scheduling, retries/backoff, cancellation, action dispatch, immutable history, and company/location isolation.
- Test additive migration structure, explicit grants, RLS policies, trigger/function privileges, cross-company negatives, duplicate/replay races, and bounded service-role access; run Supabase advisors after application.
- Test AI preview-to-execution authorization, safe internal actions, customer-facing approval gates, provider readiness, audit linkage, Daily Operations grounding, and malicious/cross-company inputs.
- Test existing Yelp `lead.test`/`lead.created`, website intake, office tasks, GoHighLevel sync, Twilio inbound SMS/voice locks, Stripe/payment state, and provider regressions without real customer/provider side effects.
- Run guarded hosted automation and existing provider lifecycles only against the pinned non-Production regression project, each followed by independent exact cleanup/residue verification.
- Run every repository test, type-check, lint, Production build, dependency audit, migration integrity, protected-file, secret, scope, and whitespace checks.
- Run targeted signed-in Automation Control Center, AI Command Center, Daily Operations, Integrations, and Production Readiness Browser validation plus the complete established Browser suite with exact cleanup and zero residue.
- Perform independent security, schema, scope, and release audits before commit and again against the exact reviewed commit.
- Push one focused implementation commit, require exact-head CI/review/Preview, merge, require main-push repository and isolated-Supabase jobs, apply/reverify the exact migration, deploy exact merge SHA, verify canonical health/readiness/logs/data, and then create at most one documentation-only closeout commit.

## Release Commits

- Implementation: pending.
- Pull request: pending.
- Merge: pending.
- Documentation closeout: pending.

## Final Status

Approved and active. The delta-only audit is complete; implementation and bounded validation of the centralized automation, reviewed internal AI action, and owner control surfaces are in progress. No Production migration, scheduler activation, provider write, or customer-facing action has occurred.

## Notes

This sprint connects existing systems; it does not replace them. WeatherTech OS owns the records and automation state, providers remain adapters, AI remains constrained by company/permission/approval policy, and customer-facing effects require explicit authorization.
