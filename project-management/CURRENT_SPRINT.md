# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Electronic Signatures Phase 1 - DocuSign / Dropbox Sign Foundation

## Objective

Build a provider-agnostic electronic signature foundation for DocuSign and Dropbox Sign so WeatherTech OS can safely prepare future signature requests, status tracking, Customer 360 activity, audit logging, retries, and Integration Center readiness without activating live providers.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Inspect current official DocuSign and Dropbox Sign API documentation before implementation.
- Accurately document officially supported provider capabilities, OAuth requirements, envelope/signature request surfaces, signed-document download, webhook/callback support, test-mode behavior, and unsupported/live-send boundaries.
- Reuse Customer 360, Estimates, Jobs, Documents, Unified Lead Intake, Integration Center, `integration_sync_logs`, and existing provider architecture.
- Support WeatherTech Roofing LLC and IHC company mapping for future DocuSign and Dropbox Sign account connections.
- Add provider abstraction, OAuth readiness, envelope/document readiness, signature request mapping, signed-document status tracking language, Customer 360 event labels, audit logging support, and retry architecture.
- Add truthful Integration Center readiness states: Not configured, OAuth required, Ready, Production disabled, Connected, and Sync failed.
- Add focused electronic signature foundation tests and update migration-integrity and browser regression coverage.
- Update setup documentation, module registry, changelog, sprint records, and safe server-only environment placeholders.

## Explicit Exclusions

- Do not redesign the UI.
- Do not activate live DocuSign or Dropbox Sign providers.
- Do not send live signature requests.
- Do not upload documents to providers.
- Do not perform provider writes.
- Do not add OAuth token exchange routes or webhook ingestion routes in this foundation sprint.
- Do not fake connected provider status.
- Do not weaken authentication or RLS.
- Do not commit secrets.
- Do not modify `.env.local`.
- Do not perform destructive migrations.
- Do not begin another sprint after completion.

## Completion Criteria

- Official DocuSign and Dropbox Sign capability findings are documented in repository docs with links to official documentation.
- DocuSign and Dropbox Sign environment placeholders are documented in `.env.example` without secrets.
- DocuSign and Dropbox Sign provider metadata is registered with honest Integration Center readiness and live signature requests disabled by default.
- Provider-agnostic helpers support duplicate-safe signature request draft payload readiness without making provider writes.
- Signature status/event labels can represent requested, viewed, completed, declined, expired, sync failed, and configuration required activity.
- Integration audit logs can represent DocuSign and Dropbox Sign activity after the additive provider migration is applied.
- Customer 360 and communications surfaces understand electronic signature provider activity when records/logs exist.
- No provider requests, document uploads, provider writes, live sync, fake connection states, credentials, or provider activation are introduced.
- If a migration is required, it is additive, transactionally wrapped, and non-destructive.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Electronic signature foundation tests pass.
- Existing Unified Lead Intake, Website, Yelp, Twilio, Gmail, Google Calendar, Google Business Profile, QuickBooks Online, security/company-access, and migration-integrity tests pass.
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
- Inspect existing Customer 360, Estimates, Jobs, Documents, Unified Lead Intake, Communications, Integration Center, Supabase repository, integration logging, environment conventions, setup docs, and browser regression patterns before editing.
- Inspect current official DocuSign and Dropbox Sign documentation and document supported, OAuth-required, envelope/request, status, signed-file, webhook/callback, test-mode, and unsupported capability boundaries.
- Run electronic signature foundation tests.
- Run lead-intake routing tests.
- Run unified lead-intake service tests.
- Run Website integration foundation tests.
- Run Yelp integration foundation tests.
- Run existing Twilio communications tests.
- Run existing Google Workspace/Gmail tests.
- Run existing Google Calendar scheduling tests.
- Run Google Business Profile tests.
- Run QuickBooks Online tests.
- Run security and company-access tests.
- Run migration-integrity tests.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for electronic signature readiness, Integration Center, Customer 360, Documents, CRM, and existing provider foundations.
- Run full signed-in browser regression where supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add electronic signatures provider foundation`

## Blockers

Live DocuSign/Dropbox Sign API access, OAuth app credentials, account mapping, token storage, webhook/callback configuration, document upload, signed-file download, and production signature requests require owner-controlled provider setup and are outside this repository-only foundation sprint.

## Final Status

Completed after validation, commit, push, and remote synchronization.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
