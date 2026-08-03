# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Google Calendar Phase 1 - Production Scheduling Foundation

## Objective

Build the production-grade Google Calendar foundation that connects WeatherTech OS inspections, appointments, job scheduling, dispatch, and production scheduling to authorized Google Workspace calendars while keeping WeatherTech OS as the operational source of truth.

## Owner

Joe Harris

## Owner Approval Date

2026-08-02.

## Owner-Approved Scope

- Reuse the existing Google Workspace OAuth foundation from the Gmail sprint.
- Add Google Calendar API server-side configuration, readiness checks, and safe setup documentation.
- Support multiple company-aware connected Google calendars for WeatherTech Roofing LLC and IHC Painting.
- Preserve calendar ownership, calendar purpose, read-only/read-write mode, sync status, sync token, and provider identifiers.
- Add additive data model changes only where required for calendar credentials, connected calendars, event mappings, push-notification metadata, and unmatched inbound event review.
- Keep WeatherTech OS as the source of truth for inspections, appointments, jobs, dispatch, production schedules, and crew assignments.
- Add server-side calendar discovery and manual sync foundations using mockable Calendar API boundaries.
- Add outbound event create/update/cancel planning with idempotent provider mapping and disabled-by-default live writes.
- Add inbound event synchronization and conflict-detection foundations without creating low-quality CRM records.
- Surface Google Calendar readiness and synchronization status in the existing Integration Center and affected scheduling workflows.
- Use existing integration sync logging with sanitized request and response summaries.
- Add focused automated tests and browser regression coverage for Google Calendar foundation behavior.
- Add concise Google Calendar setup documentation and safe environment placeholders.

## Explicit Exclusions

- Do not redesign the application.
- Do not create a standalone calendar dashboard.
- Do not replace the current scheduling, dispatch, inspection, or job-management systems.
- Do not create fake production synchronization or fake successful sync states.
- Do not connect to or modify a real Google Calendar during automated testing.
- Do not enable live Google Calendar writes by default.
- Do not hard-code real email addresses, calendar IDs, customer data, OAuth tokens, access tokens, refresh tokens, or credentials.
- Do not delete or destructively modify existing data.
- Do not weaken authentication, RLS, or company access controls.
- Do not begin website-form, Yelp, QuickBooks, e-signature, Google Business Profile, customer portal, or AI scheduling functionality.
- Do not rebuild Gmail Phase 1.
- Do not modify `.env.local`.
- Do not remotely apply migrations unless explicitly safe, supported by the current environment, and consistent with repository policy.

## Completion Criteria

- CURRENT_SPRINT.md reflects the approved Google Calendar sprint before implementation.
- Google Calendar configuration values remain server-side only and are documented with safe placeholders.
- Missing Google configuration and missing credentials fail safely.
- Existing Gmail OAuth/mailbox behavior remains intact.
- Scope-upgrade or reconnect requirements are surfaced without silently invalidating Gmail connections.
- Multiple company-aware connected calendars can be represented without hard-coded production calendars.
- Event payload generation avoids unnecessary private customer information and internal notes.
- Event mapping and sync planning prevent duplicate Google event creation.
- Calendar writes remain disabled unless `GOOGLE_CALENDAR_WRITE_ENABLED` is explicitly enabled server-side.
- Inbound unmatched provider events are preserved for review rather than converted into poor CRM records.
- Conflict detection covers employee, crew, schedule, and duplicate-provider mapping conflicts where current data supports it.
- Integration logs remain sanitized and do not store tokens or full sensitive provider payloads.
- Migrations, if any, are additive, transactional, non-destructive, and not remotely applied during this sprint.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Focused Google Calendar foundation tests pass.
- Existing Google Workspace/Gmail tests pass.
- Existing Twilio, lead-intake, security, and migration-integrity tests pass where applicable.
- Targeted and full signed-in browser regression pass where supported.
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
- Inspect existing CRM, Customer 360, Communications, Integration Center, Calendar, Dispatch, Jobs, Inspections, Supabase repository, API route, integration logging, and Google Workspace patterns before editing.
- Run focused Google Calendar foundation tests using mocks.
- Run existing Google Workspace/Gmail tests.
- Run existing Twilio communications tests.
- Run lead-intake routing tests.
- Run security and company-access tests.
- Run migration-integrity tests if a migration is added.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Integration Center, Calendar, Dispatch, Jobs, Inspections, CRM, Customer 360, Gmail, and Twilio behavior.
- Run full signed-in browser regression if supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add Google Calendar scheduling foundation`

## Blockers

- Live Google Cloud Calendar API activation, OAuth consent approval, production redirect URI setup, account authorization, calendar selection, push-notification channel verification, and controlled live calendar write validation still require owner access.

## Final Status

Completed and ready for commit/push verification.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.

The Google Calendar Phase 1 foundation was implemented with server-side OAuth reuse, disabled-by-default live writes, additive migration `0028_google_calendar_scheduling_foundation.sql`, safe setup documentation, automated regression coverage, targeted browser validation, and full signed-in browser validation.
