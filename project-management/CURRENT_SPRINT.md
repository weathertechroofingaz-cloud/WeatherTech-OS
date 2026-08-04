# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

This sprint was explicitly owner-approved in the Codex task request and completed using the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Yelp Integration Phase 1 - Multi-Account Lead Intake Foundation

## Objective

Build the production-ready Yelp integration foundation for WeatherTech OS so three separate Yelp business accounts can route approved Yelp leads or conversations into the existing Unified Lead Intake Hub while preserving company, branch, source-account, Customer 360, follow-up, duplicate-protection, and integration-logging context.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Inspect and reuse the Unified Lead Intake Hub, provider adapter contracts, customer and lead matching, Customer 360 timeline, workflow follow-ups, integration logging, company access, Twilio, Gmail, Google Calendar, website intake, Supabase repository, environment conventions, setup docs, migration integrity tests, and browser regression framework.
- Document the verified official Yelp capability boundary, including public Yelp API capabilities, partner-only Leads API and webhooks, OAuth requirements, Request-a-Quote constraints, Zapier/email fallback limitations, and owner activation steps.
- Harden the Yelp account configuration model for WeatherTech Roofing LLC Phoenix, WeatherTech Roofing LLC Tucson, and IHC Painting without storing real usernames, passwords, business IDs, emails, or credentials.
- Add server-side environment placeholders only for justified Yelp credentials and feature gates, keeping live sync and outbound messaging disabled by default.
- Route controlled Yelp test/manual payloads through the canonical Unified Lead Intake Hub and never create a second lead pipeline.
- Preserve Yelp account, business ID, lead ID, conversation ID, company, branch, campaign, source, request timestamp, safe message preview, external reference, and provider status where supplied.
- Use the existing duplicate-detection, Customer 360 attachment, follow-up, retry, and integration logging paths.
- Ensure unmapped Yelp accounts fail safely or route to clearly marked review without being silently assigned to the wrong company.
- Keep live Yelp lead ingestion and outbound replies disabled unless official partner/OAuth/webhook access is configured and owner-approved.
- Extend Integration Center and Website & Marketing readiness surfaces to show honest three-account Yelp status.
- Add focused Yelp foundation tests and update browser regression coverage for three-account routing, disabled live connection boundaries, dry-run/manual intake, duplicate handling, Customer 360 visibility, and existing provider behavior.
- Update sprint-management records and changelog after validation.

## Explicit Exclusions

- Do not redesign the UI.
- Do not create a standalone Yelp dashboard.
- Do not create a second lead pipeline.
- Do not scrape Yelp.
- Do not automate Yelp browser login.
- Do not store Yelp usernames or passwords.
- Do not use unofficial private endpoints.
- Do not claim live Yelp lead or messaging support without verified authorization.
- Do not activate real Yelp accounts during tests.
- Do not send real Yelp messages.
- Do not create fake successful connections.
- Do not weaken authentication or RLS.
- Do not commit secrets.
- Do not modify `.env.local`.
- Do not perform destructive migrations.
- Do not begin Website, Google Business Profile, QuickBooks, e-signature, customer portal, or AI work.
- Do not begin the next sprint after completion.

## Completion Criteria

- Official Yelp capability findings are documented in repository docs with links to official Yelp developer documentation.
- Three Yelp accounts are represented in a safe account registry for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
- Yelp live lead sync and outbound messaging are disabled by default and clearly labeled as requiring Yelp partner/OAuth approval.
- Server-only Yelp environment placeholders are documented in `.env.example` and setup documentation without secrets.
- Controlled Yelp test/manual payloads normalize into canonical lead intake records with source-account and company context.
- Yelp provider duplicates are prevented by provider identifiers and request fingerprints.
- Existing-customer matches attach to Customer 360 without creating duplicate leads.
- New unmatched accepted Yelp payloads create exactly one lead and one actionable follow-up when production intake is enabled.
- Signed non-dry-run Yelp posts are rejected with `production_disabled` unless live sync is explicitly enabled.
- Integration Center and Website & Marketing surfaces show truthful three-account Yelp readiness and do not claim live connectivity.
- Unknown or unmapped Yelp accounts route to review or fail safely.
- No Yelp username/password storage, scraping, browser automation, real provider writes, or outbound messages are introduced.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Yelp foundation tests pass.
- Unified Lead Intake tests pass.
- Lead routing tests pass.
- Twilio foundation tests pass.
- Gmail foundation tests pass.
- Google Calendar foundation tests pass.
- Security/company-access tests pass.
- Migration-integrity tests pass if applicable.
- Targeted signed-in browser regression passes for Yelp, Lead Intake, Integration Center, Customer 360, CRM, and existing provider foundations.
- Full signed-in browser regression passes where supported.
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
- Inspect existing CRM, Customer 360, Communications, Integration Center, Lead Intake, Website intake, Yelp intake, Twilio webhooks, Gmail sync, Google Calendar foundation, Supabase repository, integration logging, environment conventions, setup docs, and browser regression patterns before editing.
- Inspect current official Yelp developer documentation and document public, partner-only, webhook, OAuth, and unsupported capability boundaries.
- Run Yelp integration foundation tests.
- Run lead-intake routing tests.
- Run unified lead-intake service tests.
- Run existing Twilio communications tests.
- Run existing Google Workspace/Gmail tests.
- Run existing Google Calendar scheduling tests.
- Run security and company-access tests.
- Run migration-integrity tests if applicable.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Yelp, Lead Intake, Integration Center, Customer 360, CRM, existing Website, Twilio, Gmail, and Google Calendar behavior.
- Run full signed-in browser regression if supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add Yelp integration lead intake foundation`

## Blockers

- Live Yelp Leads API, webhook subscription, OAuth credential issuance, Yelp business account authorization, Request-a-Quote eligibility, and outbound Yelp replies require Yelp partner approval or authorized Yelp business access and are outside this repository-only sprint.

## Final Status

Completed by the sprint commit that contains this record.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
