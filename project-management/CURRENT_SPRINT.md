# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Unified Lead Intake Hub - Production Foundation

## Objective

Build one production-ready lead intake pipeline that normalizes every supported lead source into the existing WeatherTech OS CRM, Customer 360, Communications Hub, and follow-up workflow without replacing completed CRM behavior.

## Owner

Joe Harris

## Owner Approval Date

2026-08-03.

## Owner-Approved Scope

- Inspect and reuse the existing CRM, Customer 360, Twilio, Gmail, Google Calendar, integration logging, and lead-routing architecture.
- Build one canonical lead intake service used by current production intake providers.
- Support Website forms, Website inspection requests, Website estimate requests, Twilio voice, Twilio SMS, Gmail, Manual CRM entry, Yelp foundation, Google Business Profile foundation, Facebook foundation, and future providers.
- Prevent duplicate CRM records through phone normalization, email normalization, existing customer matching, existing lead matching, provider event IDs, and request fingerprints.
- Preserve source attribution for provider, campaign, referral/source detail, landing page/source account, UTM metadata, company, business line, and received timestamp where current schema supports it.
- Ensure accepted intake either attaches to an existing customer or creates one new lead, but never both.
- Add provider adapters for Website, Twilio, and Gmail.
- Keep reusable adapter contracts for Yelp, Google Business Profile, Facebook, GoHighLevel, and future providers without activating live connectivity.
- Integrate intake outcomes with Customer 360 and the unified Communications Hub.
- Create actionable follow-up reminders using the existing notification workflow.
- Continue using sanitized `integration_sync_logs` infrastructure.
- Add automated and browser regression coverage for routing, duplicates, provider normalization, malformed payloads, missing fields, provider failures, logging, and UI surfacing.

## Explicit Exclusions

- Do not redesign the UI.
- Do not replace existing CRM workflows.
- Do not create placeholder dashboards.
- Do not build AI features.
- Do not activate live Yelp.
- Do not activate live Google Business Profile.
- Do not activate live Facebook.
- Do not connect production websites yet.
- Do not send real SMS, email, or customer messages.
- Do not commit secrets.
- Do not weaken authentication or RLS.
- Do not perform destructive migrations.
- Do not modify `.env.local`.

## Completion Criteria

- Website, Twilio, and Gmail intake providers use the canonical lead intake service where production routing exists.
- Manual lead entry remains in the existing CRM lead workflow and continues to use the shared normalization helpers available to the browser bundle.
- Existing customer matches attach intake to Customer 360 and skip duplicate lead creation.
- Existing lead/provider duplicates skip duplicate lead creation.
- New unmatched accepted intake creates exactly one lead.
- Intake records preserve provider/source attribution and link to customer or lead outcomes.
- Follow-up reminders are created for accepted new leads, existing customer matches, and reviewable company-scoped intake.
- Integration sync logs remain sanitized and record success, duplicate, customer attachment, and failure outcomes.
- Yelp, Google Business Profile, Facebook, and future provider contracts remain foundation-only and do not imply live connectivity.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Lead routing tests pass.
- Unified lead-intake service tests pass.
- Twilio foundation tests pass.
- Gmail foundation tests pass.
- Google Calendar foundation tests pass.
- Targeted browser regression passes for Lead Intake, Communications, Customer 360, Dashboard, Customers, Navigation, and Dark Mode where supported.
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
- Inspect existing CRM, Customer 360, Communications, Integration Center, Lead Intake, Website intake, Yelp intake, Twilio webhooks, Gmail sync, Google Calendar foundation, Supabase repository, integration logging, and browser regression patterns before editing.
- Run lead-intake routing tests.
- Run unified lead-intake service tests.
- Run existing Twilio communications tests.
- Run existing Google Workspace/Gmail tests.
- Run existing Google Calendar scheduling tests.
- Run security and company-access tests.
- Run migration-integrity tests.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Lead Intake, Communications, Customer 360, Dashboard, Customers, Navigation, and Dark Mode.
- Run full signed-in browser regression if supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add unified lead intake hub`

## Blockers

- Live website form connection, live Yelp/Google Business Profile/Facebook provider activation, production phone/email account authorization, and controlled provider traffic validation require owner-controlled external account access and are outside this sprint.

## Final Status

Completed and ready for commit/push verification.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.

The Unified Lead Intake Hub production foundation was implemented with canonical provider normalization, duplicate customer/lead prevention, existing-customer attachment, follow-up creation, sanitized integration logging, Gmail routing integration, provider adapter foundations, automated service coverage, targeted browser validation, and full signed-in browser validation.
