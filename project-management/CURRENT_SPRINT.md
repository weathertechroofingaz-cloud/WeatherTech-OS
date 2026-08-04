# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

This sprint was explicitly owner-approved in the Codex task request and completed using the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Google Business Profile Phase 1 - Multi-Location Integration Foundation

## Objective

Build the Google Business Profile integration foundation for WeatherTech Roofing LLC and IHC so multiple Google Business Profile locations can route approved activity into the existing Unified Lead Intake Hub, Customer 360, follow-up workflow, and integration logging without creating a separate Google CRM or activating live Google connectivity.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Inspect current official Google Business Profile documentation before implementation.
- Accurately document Business Profile APIs, Reviews support, Performance APIs, Account/location APIs, Messaging availability, lead capabilities, OAuth requirements, webhook/event support, and official limitations.
- Reuse the Unified Lead Intake Hub, Customer 360, Website Integration, Yelp Integration, Gmail, Google Calendar, Integration Center, `integration_sync_logs`, provider adapter architecture, and company/branch routing.
- Support multiple Google Business Profile locations for WeatherTech Roofing LLC Phoenix, WeatherTech Roofing LLC Tucson, and IHC.
- Add a provider adapter and controlled payload normalization for Google Business Profile activity.
- Preserve source attribution, company routing, branch routing, customer matching, lead deduplication, follow-up creation, Customer 360 activity, and integration logging.
- Implement secure server-side OAuth readiness only where Google requires OAuth.
- Keep live synchronization, review replies, and customer messaging disabled.
- Show honest Integration Center and Website & Marketing statuses: Not configured, OAuth required, Ready for testing, Production disabled, Connected, and Sync failed.
- Add focused Google Business Profile foundation tests and update relevant existing lead intake, migration-integrity, and browser regression coverage.
- Update setup documentation, module registry, changelog, sprint records, and safe server-only environment placeholders.

## Explicit Exclusions

- Do not redesign the UI.
- Do not build a separate Google CRM.
- Do not scrape Google.
- Do not automate Google browser login.
- Do not store Google passwords.
- Do not activate live Google Business Profile synchronization.
- Do not send real review replies.
- Do not enable live customer messaging.
- Do not fake connected provider status.
- Do not weaken authentication or RLS.
- Do not commit secrets.
- Do not modify `.env.local`.
- Do not perform destructive migrations.
- Do not begin another sprint after completion.

## Completion Criteria

- Official Google Business Profile capability findings are documented in repository docs with links to official Google documentation.
- Three Google Business Profile locations are represented in a safe location registry for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
- Google Business Profile live sync, review replies, and customer messaging are disabled by default and clearly labeled as requiring Google API approval, server-side OAuth, Pub/Sub setup, and owner activation.
- Server-only Google Business Profile environment placeholders are documented in `.env.example` without secrets.
- Controlled Google Business Profile dry-run payloads normalize into canonical lead intake records with source-account and company context.
- Google Business Profile provider duplicates are prevented by provider identifiers and request fingerprints.
- Existing-customer matches attach to Customer 360 without creating duplicate leads.
- Unknown or unmapped Google Business Profile locations route to review or fail safely.
- Integration Center and Website & Marketing surfaces show truthful three-location Google Business Profile readiness and do not claim live connectivity.
- No Google passwords, scraping, browser automation, real provider writes, review replies, or outbound messages are introduced.
- If a migration is required, it is additive, transactionally wrapped, and non-destructive.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Google Business Profile foundation tests pass.
- Unified Lead Intake tests pass.
- Website tests pass.
- Yelp tests pass.
- Twilio tests pass.
- Gmail tests pass.
- Google Calendar tests pass.
- Security/company-access tests pass.
- Migration-integrity tests pass.
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
- Inspect existing CRM, Customer 360, Communications, Integration Center, Lead Intake, Website intake, Yelp intake, Twilio webhooks, Gmail sync, Google Calendar foundation, Supabase repository, integration logging, environment conventions, setup docs, and browser regression patterns before editing.
- Inspect current official Google Business Profile documentation and document supported, OAuth-required, Pub/Sub, unsupported, and discontinued capability boundaries.
- Run Google Business Profile integration foundation tests.
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
- Run targeted signed-in browser regression for Google Business Profile, Lead Intake, Integration Center, Customer 360, CRM, Website, Yelp, Twilio, Gmail, and Google Calendar behavior.
- Run full signed-in browser regression where supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add Google Business Profile integration foundation`

## Blockers

- Live Google Business Profile API access, OAuth consent, account/location IDs, Pub/Sub notification subscription, live review sync, review replies, and production activation require owner-controlled Google Cloud setup and are outside this repository-only foundation sprint.

## Final Status

Completed.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
