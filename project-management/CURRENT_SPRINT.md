# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

This sprint was explicitly owner-approved in the Codex task request and completed using the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Gmail / Google Workspace Phase 1 - Production Email Foundation

## Objective

Build the production-ready server-side Gmail / Google Workspace email foundation that connects company mailbox communication to the existing WeatherTech OS CRM, Customer 360, communications timeline, and integration logging workflow.

## Owner

Joe Harris

## Owner Approval Date

2026-08-02.

## Owner-Approved Scope

- Add secure server-side Google OAuth and Gmail API configuration support.
- Support multiple company-aware connected mailboxes for WeatherTech Roofing LLC and IHC Painting.
- Implement OAuth authorization, callback, reconnect, and disconnect foundation with state protection.
- Add additive mailbox, email thread/message, draft, attachment metadata, and sync-state persistence only where required.
- Import Gmail messages and threads server-side using mockable Gmail API boundaries.
- Match synchronized email to existing customers, leads, and supported CRM relationships by normalized email address.
- Preserve unmatched inbound email safely as unassigned communication requiring review.
- Surface Gmail activity through the existing Customer 360 and communications timeline architecture.
- Add safe outbound email and draft service boundaries without sending real customer email during tests.
- Log OAuth, sync, matching, duplicate, send, draft, and error events through existing integration logging patterns.
- Add focused automated tests and browser regression coverage for affected CRM/email workflows.
- Add concise Google Workspace setup documentation.

## Explicit Exclusions

- Do not redesign the application.
- Do not create a standalone email dashboard.
- Do not create fake emails or fake successful sync states.
- Do not send email to real customers during development or validation.
- Do not hard-code real mailbox addresses.
- Do not commit credentials, OAuth tokens, access tokens, refresh tokens, or private mailbox data.
- Do not delete or destructively modify existing data.
- Do not replace the current CRM workflow.
- Do not weaken authentication, RLS, or company access controls.
- Do not begin Google Calendar, website-form, Yelp, QuickBooks, e-signature, Google Business Profile, or AI email functionality.
- Do not modify `.env.local`.

## Completion Criteria

- Gmail / Google Workspace configuration values remain server-side only and are documented with safe placeholders.
- OAuth state generation and validation are tested.
- Missing Google configuration fails safely.
- Company-aware mailbox mapping is supported without hard-coded production email addresses.
- Gmail message import, thread association, deduplication, attachment metadata, and sync failure handling are covered by focused tests.
- Existing customer and lead email matching works by normalized email.
- Unmatched inbound email is preserved for review without creating duplicate customers.
- Drafting and outbound send boundaries are implemented safely with no real email sent in automated tests.
- Integration logs remain sanitized and do not store tokens or full sensitive message bodies.
- Existing Customer 360, Communications, CRM, Dashboard, and navigation workflows remain intact.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Relevant automated and browser regression passes.
- Final scope audit confirms no excluded work or unrelated files were changed.
- One focused conventional commit is created and pushed.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm approval status is exactly `Approved`.
- Confirm the working tree is clean before development begins.
- Confirm the current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before development begins.
- Inspect existing CRM, Customer 360, Communications, Integration Center, Twilio, GoHighLevel, Supabase repository, API route, and integration logging patterns before editing.
- Run focused Google Workspace integration tests using mocks.
- Run relevant existing integration and migration integrity tests.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Communications, Customer 360, Integration Center, Dashboard, and navigation.
- Run full signed-in browser regression if supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add Gmail workspace email foundation`

## Blockers

- Live Google Cloud project configuration, Gmail API activation, OAuth consent approval, production redirect URI setup, mailbox owner authorization, and controlled live mailbox testing still require owner access.

## Final Status

Completed pending the sprint commit and push recorded in Git history.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
