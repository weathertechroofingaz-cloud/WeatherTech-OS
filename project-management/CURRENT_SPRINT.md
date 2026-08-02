# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

This sprint was explicitly owner-approved in the Codex task request and completed using the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Twilio Phase 1 - Production Communications Foundation

## Objective

Build the production-ready server-side foundation for Twilio SMS and call activity inside the existing WeatherTech OS CRM without enabling real outbound customer messaging by default.

## Owner

Joe Harris

## Owner Approval Date

2026-08-02.

## Owner-Approved Scope

- Add typed server-side Twilio configuration support.
- Support WeatherTech Roofing LLC Phoenix, WeatherTech Roofing LLC Tucson, and IHC business-number routing.
- Validate signed Twilio inbound SMS, voice, status, and recording webhooks.
- Normalize phone numbers and match existing customers or leads before creating new lead-intake records.
- Use existing CRM communications, Customer 360, lead-intake, and integration logging architecture.
- Keep outbound SMS disabled unless explicitly enabled by server configuration and owner approval.
- Add focused Twilio foundation regression coverage and setup documentation.

## Explicit Exclusions

- Do not redesign the application.
- Do not create a placeholder Twilio dashboard.
- Do not create fake customer communications.
- Do not send messages to real customers during development or validation.
- Do not purchase or port phone numbers.
- Do not create destructive migrations.
- Do not weaken authentication, RLS, or company access controls.
- Do not begin Gmail, Google Calendar, Yelp, QuickBooks, website-form, e-signature, or AI call-summary work.
- Do not modify `.env.local`.

## Completion Criteria

- Twilio configuration values are server-side only and documented with safe placeholders.
- Inbound webhook handlers validate Twilio signatures and reject invalid requests.
- Twilio SMS and call activity routes by receiving business number where configured.
- Existing customers and leads are matched by normalized phone before lead creation.
- Unmatched senders flow through the existing lead-intake workflow.
- Webhook retries are idempotent by Twilio Message SID or Call SID.
- Integration summaries remain masked or sanitized.
- Existing Customer 360, Communications, Lead Intake, CRM, Dashboard, and navigation workflows remain intact.
- Browser regression coverage is retained for affected CRM and communications workflows.
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
- Inspect the existing CRM, Customer 360, Lead Intake, Communications, Integration Center, Twilio routes, provider setup, and integration logging implementation before editing.
- Run `node tests/twilio-communications-foundation.test.mjs`.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Communications, Customer 360, Lead Intake, Integration Center, Dashboard, and navigation.
- Run full signed-in browser regression if supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add Twilio communications foundation`

## Blockers

- Live Twilio account configuration, business-number purchase or porting, production webhook configuration, and controlled live tests still require owner access.

## Final Status

Completed pending the sprint commit and push recorded in Git history.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
