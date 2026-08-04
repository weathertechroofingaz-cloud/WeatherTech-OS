# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

QuickBooks Online Phase 1 - Accounting Integration Foundation

## Objective

Build the production-ready QuickBooks Online accounting integration foundation for WeatherTech Roofing LLC and IHC so customer, estimate, invoice, payment, and sync-readiness activity can be mapped into the existing CRM, Customer 360, Financial workspace, Integration Center, and integration audit log without activating live accounting synchronization or creating accounting records in QuickBooks.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Inspect current official QuickBooks Online API documentation before implementation.
- Accurately document officially supported QuickBooks Online Accounting API capabilities, OAuth requirements, company `realmId` selection, customer, estimate, invoice, payment, query, batch, CDC, sandbox, webhook, rate-limit, and unsupported/payment-processing boundaries.
- Reuse Customer 360, Unified Lead Intake, Estimates, Jobs, Financial workspace, Integration Center, `integration_sync_logs`, provider architecture, and company routing.
- Support WeatherTech Roofing LLC and IHC company routing for future QuickBooks Online company connections.
- Add QuickBooks Online OAuth readiness, company selection readiness, mapping helpers, duplicate-prevention architecture, retry architecture, and audit logging foundation.
- Add truthful Integration Center readiness states: Not configured, OAuth required, Ready, Production disabled, Connected, and Sync failed.
- Surface Customer 360 activity language for estimate export, invoice export, payment received, sync completed, sync failed, and configuration required when integration logs exist.
- Add focused QuickBooks foundation tests and update migration-integrity and browser regression coverage.
- Update setup documentation, module registry, changelog, sprint records, and safe server-only environment placeholders.

## Explicit Exclusions

- Do not redesign the UI.
- Do not build a separate accounting system.
- Do not activate live QuickBooks Online synchronization.
- Do not create invoices, customers, estimates, payments, or any other accounting records in QuickBooks.
- Do not process payments.
- Do not implement QuickBooks Payments live flows.
- Do not fake connected provider status.
- Do not weaken authentication or RLS.
- Do not commit secrets.
- Do not modify `.env.local`.
- Do not perform destructive migrations.
- Do not begin another sprint after completion.

## Completion Criteria

- Official QuickBooks Online capability findings are documented in repository docs with links to official Intuit documentation.
- QuickBooks Online environment placeholders are documented in `.env.example` without secrets.
- QuickBooks Online provider metadata is registered with honest Integration Center readiness and live sync disabled by default.
- QuickBooks Online mapping helpers support customer, estimate, invoice, and payment export payload readiness without making provider writes.
- Duplicate keys and request fingerprints are deterministic for future retry-safe exports.
- Integration audit logs can represent QuickBooks Online activity after the additive provider migration is applied.
- Customer 360 and communications surfaces understand QuickBooks Online sync activity labels when logs exist.
- No accounting writes, live sync, payment processing, fake connection states, credentials, or provider activation are introduced.
- If a migration is required, it is additive, transactionally wrapped, and non-destructive.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- QuickBooks Online foundation tests pass.
- Existing Unified Lead Intake, Website, Yelp, Twilio, Gmail, Google Calendar, security/company-access, and migration-integrity tests pass.
- Relevant signed-in browser regression passes.
- Final scope audit confirms no excluded work or unrelated files were changed.
- One focused conventional commit is created and pushed.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm approval status is exactly `Approved`.
- Confirm the working tree is clean before product development begins.
- Confirm the current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before product development begins.
- Inspect existing Customer 360, Unified Lead Intake, Estimates, Jobs, Financial workspace, Communications, Integration Center, Supabase repository, integration logging, environment conventions, setup docs, and browser regression patterns before editing.
- Inspect current official QuickBooks Online documentation and document supported, OAuth-required, company-selection, webhook, sandbox, accounting-entity, and unsupported capability boundaries.
- Run QuickBooks Online integration foundation tests.
- Run lead-intake routing tests.
- Run unified lead-intake service tests.
- Run Website integration foundation tests.
- Run Yelp integration foundation tests.
- Run existing Twilio communications tests.
- Run existing Google Workspace/Gmail tests.
- Run existing Google Calendar scheduling tests.
- Run security and company-access tests.
- Run migration-integrity tests.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for QuickBooks readiness, Integration Center, Customer 360, Financial workspace, CRM, and existing provider foundations.
- Run full signed-in browser regression where supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add QuickBooks Online integration foundation`

## Blockers

- Live QuickBooks Online API access, OAuth app credentials, company `realmId` mapping, token storage, webhook configuration, accounting export activation, QuickBooks Payments, and production accounting writes require owner-controlled Intuit setup and are outside this repository-only foundation sprint.

## Final Status

Completed after validation, commit, push, and remote synchronization.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
