# Automation Engine

## Purpose

The Automation Engine connects existing WeatherTech OS CRM events, office tasks, AI action reviews, and provider evidence through one company-scoped execution history. WeatherTech OS remains the system of record. The engine does not replace the CRM or turn GoHighLevel, Twilio, Stripe, Mighty Apes/Yelp, Gmail, Calendar, or an AI provider into a second operating system.

The only executable actions registered in this phase are internal `office_tasks` actions:

- `create_office_task`
- `complete_office_task`

There is no registered action for sending email or SMS, placing a call, changing a provider, charging/refunding a payment, changing a schedule, or mutating an arbitrary CRM record.

## Current Rollout State

Production, the repository, and the isolated regression target are exact at `66/66` through `20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql`. The fifteen-migration automation/Mighty suffix beginning with `20260902024803_scope_deferred_invariant_triggers_for_location_backfill.sql` was applied to Production once by the normal ordered migration push after the deferred-trigger compatibility fix; the repeat dry-run reported zero pending migrations and database lint reported zero errors. The canonical Mighty Apes endpoint/registry behavior, Production-only AI environment variables, price ceilings, and server-only scheduler secret are deployed. Deployment `dpl_CKoXgxtMpDcRC1ekTZ3YSAxaKC5t` is `READY` at exact main merge `76eba068d1c08a87f09899f84f4931cd1fc07d35`, and canonical health returned HTTP 200. No paid Production AI smoke test or real provider/customer action was run, and this document does not authorize one.

## Data Model

Migration [20260902024803_scope_deferred_invariant_triggers_for_location_backfill.sql](../supabase/migrations/20260902024803_scope_deferred_invariant_triggers_for_location_backfill.sql) preserves the three existing deferred constraint triggers and their exact functions, enabled state, `INSERT`, and `DEFERRABLE INITIALLY DEFERRED` semantics while limiting `UPDATE` events to each function's actual invariant dependencies. This prevents unrelated location-only backfills in the following foundation migration from leaving queued trigger events that block same-transaction `ALTER TABLE` statements.

Migration [20260902024804_automation_engine_foundation.sql](../supabase/migrations/20260902024804_automation_engine_foundation.sql) adds:

- `company_locations` for explicit WeatherTech Phoenix/Scottsdale, WeatherTech Tucson, and IHC location identity.
- `automation_rules` for trigger, conditions, action snapshot, delay, company/location, enabled state, approval policy, retry policy, and optimistic version.
- `automation_events` for immutable normalized source evidence and idempotency.
- `automation_executions` for the exact rule version, action input, approval, schedule, status, retry, cancellation, result, and version.
- `automation_attempts` for immutable bounded worker-attempt evidence.
- `automation_audit_events` for immutable rule, event, review, execution, retry, cancellation, and AI-review history.
- Optional `company_location_id` links on leads, intake rows, and office tasks, plus the execution link on an engine-created office task.

Migration [20260902043624_mighty_apes_legacy_service_routing_correction.sql](../supabase/migrations/20260902043624_mighty_apes_legacy_service_routing_correction.sql) preserves the validated foundation while ensuring a legacy-schema Mighty Apes lead receives the registry-owned company location and requested service before deferred automation runs.

Migration [20260902102714_lead_automation_event_legacy_schema_compatibility.sql](../supabase/migrations/20260902102714_lead_automation_event_legacy_schema_compatibility.sql) keeps deferred lead-event emission compatible with both canonical and supported legacy lead schemas while preserving exact persisted company/location identity and source normalization.

Migration [20260902134526_gohighlevel_reconciliation_automation_transition_fix.sql](../supabase/migrations/20260902134526_gohighlevel_reconciliation_automation_transition_fix.sql) makes the existing inbound SMS and missed-call triggers observe match-reconciliation updates. An unmatched source emits nothing; the same row emits exactly once when it becomes matched under an exact connected same-company provider binding; later eligible replays remain idempotent.

Migration [20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql](../supabase/migrations/20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql) is the forward-only compatibility correction after the prior migration was applied to regression. A GHL row that was already marked matched under an invalid paused or cross-company binding can emit exactly once after its source binding becomes valid; replay suppression is backed by the company-scoped stable event key instead of the old row shape. Provider-specific triggers preserve the predecessor Twilio contract: SMS remains insert-only, and call updates emit only when call status transitions into missed. The final guarded hosted regression passed 81 assertions with zero provider-network requests and zero cleanup residue.

Authenticated users receive company-scoped read access through RLS. Direct browser writes to engine tables are revoked. Owner/admin controls call `SECURITY DEFINER` RPCs that recheck database authorization, company scope, current version, status, and bounded reason. The service role can run only the bounded worker entry point.

## Event Contract

The engine normalizes supported CRM and inbound evidence into these semantic event families:

- Leads: `lead.created`, `lead.updated`, `website.lead.created`, `yelp.lead.created`.
- Customers: `customer.created`, `customer.updated`.
- Inspections: created, updated, scheduled, and completed.
- Estimates: created, updated, sent, and approved.
- Jobs: created, updated, scheduled, and completed.
- Invoices: created, updated, and paid.
- Internal work: `task.due`.
- Legitimately available inbound communication: `communication.received` and `missed_call.received`.
- Reviewed AI decisions: `ai.action.approved` and `ai.action.rejected`.

Payloads are bounded to operational fields and internal identifiers. Message bodies, email addresses, phone numbers, provider authentication material, and raw provider message/call identifiers are not copied into the automation ledger. Provider identifiers used for source versioning are hashed.

The worker records each eligible non-engine office task becoming due exactly once per task/due-time version. The due-task starter rule is disabled, so this supplies history and future rule capability without creating recursive tasks.

## Starter Rules

Enabled rules are exact centralized replacements for the previously approved internal office-task behaviors: new-lead qualification, inspection confirmation/closeout, sent and unsigned estimate follow-up, approved-estimate scheduling handoff, scheduled-job readiness, completed-job closeout, and the reviewed AI follow-up task. Disabling one of these rules cancels its queued, approval-pending, or retry-scheduled executions; the executor rechecks the rule and exact rule version immediately before action.

Disabled manual-approval templates are included for website lead review, Yelp lead review, missed-call review, completed-job review-request preparation, and due-task review. Every template creates only an internal review task. Enabling a template does not add a provider-send action.

## AI Review Boundary

AI Command Center 3.0 persists a request audit before any configured provider call and persists each returned action preview separately. The browser receives the database audit UUID rather than a client-generated execution token.

Provider access also requires exactly one enabled `ai_usage_limits` row for the selected company. Before a paid call, the trusted quota RPC atomically reserves global/company/user request capacity and a conservative retry-inclusive cost against both global daily and company monthly budgets. Missing policy rows, incomplete limits, disallowed provider/model values, or exhausted budgets fail closed.

`POST /api/ai-tools/actions/review` reloads the stored proposal, rechecks exact-company authorization and the target record, calculates the stored JSON fingerprint through the database helper, and sends only the audit UUID, decision, expected action type, fingerprint, contract version, and bounded reason to the review RPC.

- Rejecting any preview records a durable rejection and creates no action.
- Approving `create_follow_up_draft` creates or replays exactly one internal office task.
- `draft_email` remains a prepared preview that may be rejected but cannot be approved or persisted through this action contract; exact recipient, subject, and body are not yet part of its fingerprint.
- Every other proposed action also remains preview/reject-only.
- Replays are idempotent. A conflicting decision, changed fingerprint, unsupported target, or cross-company target fails closed.

## Scheduler And Retries

Vercel calls `GET /api/automations/process` once per minute. The route requires an exact constant-time `Authorization: Bearer` match against a server-only `CRON_SECRET` of at least 32 characters and uses the server-only Supabase service-role key. It calls `wtos_run_automation_worker_v1` with a maximum batch of 25.

The database worker uses one transaction advisory lock plus `FOR UPDATE SKIP LOCKED`. It scans a bounded due-task batch, claims only due queued/retry executions, rechecks rule state/version, writes a sanitized attempt, and returns counts only. Automatic retry uses bounded exponential backoff and the rule attempt limit. Manual retry is allowed only for a terminal failed execution, fewer than ten total attempts, and an unchanged enabled rule.

Required server-only environment variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Neither value may use a `NEXT_PUBLIC_` name, appear in browser output, or be committed.

Production has a generated server-only `CRON_SECRET`, the two conservative AI provider price-ceiling variables, and the approved Production-only AI environment variables. The existing OpenAI key was preserved without reading or exposing it, and `AI_ACTION_EXECUTION_ENABLED=false`. Exactly two company policy rows exist: WeatherTech and IHC are independently disabled with `openai` / `gpt-5.6-terra`, request bounds of `500`, `32000` maximum request tokens, `15000` ms timeout, retry limit `1`, and a `$0` monthly budget. Neither company can make a paid provider call until the owner separately approves its enablement and positive monthly budget.

The first natural Production scheduler tick recorded exactly `14` `task.due` events and `14` matching audit entries (`10` WeatherTech and `4` IHC). The second and later ticks created no duplicate events, executions, attempts, or new tasks. Provider requests, AI usage, cost, business rows, and provider rows remained unchanged.

## Owner Control Center

The existing Settings workspace contains the Automation Control Center. Authorized owner/admin company memberships can:

- enable or disable a rule with a reason;
- approve or reject an approval-pending internal execution;
- cancel queued, approval-pending, or retry-scheduled work;
- retry an eligible failed execution;
- inspect company/location, trigger, action, approval, status, last run, attempts, failures, and audit history.

The UI has no manual run-all button and no workflow builder. Non-owner/admin users can read only the history already allowed by company RLS; the database remains the final authorization boundary.

## Provider Boundaries

- GoHighLevel remains an optional inbound/read-only communications and marketing adapter. WeatherTech OS is the CRM and automation ledger; the approved OAuth scopes and transport perform no provider writes. Each verified webhook is bound to the SHA-256 of its exact raw body and claimed transactionally with a short processing lease. Concurrent delivery is refused, an expired lease can be reclaimed after a crash, and only the exact claim token can commit a processed, ignored, failed, or uninstall terminal state. The thirteen-claim ceiling matches HighLevel's documented original delivery plus twelve automatic retries. A company-level uninstall revokes every mapped HighLevel location for exactly one WeatherTech OS company in the same database transaction. After a failure is reviewed, a signed-in company owner/admin can use `POST /api/integrations/gohighlevel/webhook/requeue` to reset the internal claim budget; processing still waits for HighLevel to resend the exact signed payload, so this control cannot forge or send a provider event.
- Twilio contributes only signed inbound evidence already available to WeatherTech OS. Tucson remains the sole Twilio Voice route; Phoenix and IHC remain SMS-only Twilio ingresses with direct-carrier voice.
- Mighty Apes/Yelp campaign routing is authorized through the company/location-bound campaign registry. The canonical endpoint is `/api/integrations/mighty-apes/webhook`; the historical `/api/integrations/mighty-apes/yelp/webhook` path remains a compatibility alias to the same handler. Only the previously verified Phoenix campaign is seeded and enabled. `lead.test` remains immutable audit-only evidence, while `lead.created` persists the CRM/intake evidence and emits the centralized qualification path exactly once. Tucson and IHC stay fail-closed until their authoritative campaign IDs are supplied and individually enabled, and no unverified identity is invented. The legacy-schema correction propagates the registry-owned service and location without widening that authorization.
- Stripe remains the existing WeatherTech-only payment/provider foundation. The automation engine cannot charge, refund, or modify payment state.
- Gmail/Calendar and all other customer/provider writes retain their existing approval and environment gates.

## Validation And Rollout

The Production activation completed on 2026-09-02 using this gate sequence. Steps 1-8 and the configuration/seeding portion of step 9 are complete for this release; per-company enablement and positive monthly budgets remain owner decisions:

1. Freeze the exact fifteen-migration release set and register every SHA-256 in migration integrity tests.
2. Apply the migration set to the pinned non-Production regression project.
3. Prove company/location RLS, stale-version rejection, rule disablement, approval, idempotency, retries, cancellation, due-task exact-once behavior, AI review, inbound-event privacy, and zero provider calls.
4. Run independent zero-residue verification and Supabase security/performance advisors.
5. Run all repository tests, type-check, lint, Production build, dependency audit, Browser regression, and security diff review.
6. Deploy the reviewed code with the worker fail-closed until all required migrations and the server-only scheduler secret are present.
7. Apply the exact reviewed migration set to the explicitly verified Production project.
8. Add a generated Production-only `CRON_SECRET`, redeploy the exact merge SHA, and verify canonical health, applicable readiness, logs, database state, and the signed-in Control Center.
9. Add authoritative input/output price ceilings, seed exactly one disabled AI policy per company, and enable a company only after its monthly budget is owner-approved.
10. Do not run a paid Production AI smoke test unless it receives separate authorization; ordinary validation remains mocked or provider-disabled.

Ordinary validation must never use Production as a write-capable regression target.

## Rollback

To pause one workflow, disable that rule in the Control Center and confirm queued work is cancelled. To pause all scheduled processing, remove or rotate `CRON_SECRET` and redeploy. Preserve all CRM rows, internal tasks, events, executions, attempts, and audit history. Do not delete ledger evidence or customer records as a rollback shortcut.
