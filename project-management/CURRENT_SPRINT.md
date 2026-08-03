# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Website Integration Phase 1 - Multi-Brand Live Lead Capture Foundation

## Objective

Build the production-ready website integration foundation for WeatherTech Roofing LLC and IHC so approved websites, landing pages, and form backends can securely send leads into WeatherTech OS through the existing Unified Lead Intake Hub.

## Owner

Joe Harris

## Owner Approval Date

2026-08-03.

## Owner-Approved Scope

- Inspect and reuse the Unified Lead Intake Hub, provider adapter contracts, customer and lead matching, Customer 360 timeline, workflow follow-ups, integration logging, company access, Twilio, Gmail, Google Calendar, and existing website intake architecture.
- Build or harden a safe website-source configuration model for WeatherTech Roofing LLC, WeatherTech Phoenix/Tucson attribution, IHC, and future approved website sources.
- Support source identifiers, company/branch routing, domains, display labels, active status, form categories, authentication method, allowed origins, production-enabled status, last submission state, and default lead-source attribution where current schema supports it.
- Add server-side environment placeholders and setup documentation for website intake enablement, signing secrets, source IDs, allowed origins, rate limiting, spam checks, and production activation.
- Harden the secure public website lead endpoint to validate content type, payload size, source, form type, authentication, origin, required fields, field lengths, spam signals, idempotency, and safe error handling.
- Preserve marketing attribution including website, domain, landing page, referrer, UTM values, campaign identifiers, click IDs where lawfully supplied, and consent fields where submitted.
- Route all accepted submissions through the canonical Unified Lead Intake Hub and never create both a duplicate customer and duplicate lead.
- Create or update actionable follow-ups for accepted website submissions using the existing notification/workflow path.
- Surface website intake readiness and status truthfully in the existing Integration Center and Lead Intake workspace without claiming live production connectivity.
- Add safe test harness support for controlled website submission simulations without sending data to public websites.
- Add automated and browser regression coverage for source routing, request authentication, malformed payloads, duplicate suppression, idempotency, attribution preservation, customer/lead matching, follow-up creation, integration logging, and disabled-production behavior.
- Add concise setup documentation for WeatherTech Roofing LLC, IHC, Phoenix/Tucson routing, endpoint security, payload schema, attribution, consent fields, spam protection, test procedure, production activation, and owner-controlled website-side steps.
- Update sprint-management records and changelog where appropriate after validation.

## Explicit Exclusions

- Do not redesign the UI.
- Do not redesign public websites.
- Do not create a standalone website dashboard.
- Do not create a second lead pipeline.
- Do not activate production website forms during automated testing.
- Do not hard-code real domains, credentials, customer data, or secrets unless already present in trusted configuration and safe to reuse.
- Do not expose signing secrets in browser code.
- Do not claim a website is connected unless a real configured connection exists.
- Do not create fake successful production submissions.
- Do not send marketing emails or texts.
- Do not weaken authentication or RLS.
- Do not commit secrets.
- Do not perform destructive migrations.
- Do not begin Google Business Profile, QuickBooks, e-signature, customer portal, or AI lead scoring work.
- Do not rebuild the Unified Lead Intake Hub.
- Do not modify `.env.local`.
- Do not remotely apply migrations unless explicitly safe, supported by repository policy, and required by the approved sprint.

## Completion Criteria

- WeatherTech Roofing LLC and IHC website sources are represented in a safe configuration model.
- Website form categories map deterministically into existing company, branch, service, urgency, lead-source, and follow-up behavior.
- Unknown or unmapped sources fail safely or enter explicit review without silently assigning to the wrong company.
- Website submissions require server-side source authentication or dry-run test mode and never rely solely on browser Origin.
- Website endpoint validates content type, payload size, source, form type, required contact fields, field lengths, spam signals, idempotency, and safe errors.
- Accepted submissions route through the Unified Lead Intake Hub and preserve attribution.
- Existing customer matches attach to Customer 360 without duplicate lead creation.
- Existing lead/provider duplicates skip duplicate lead creation.
- New unmatched accepted submissions create exactly one lead and one actionable follow-up.
- Integration logs record success, duplicate, rejected, malformed, authentication failure, and provider failure outcomes without secrets or raw sensitive payloads.
- Integration Center and Lead Intake UI show truthful website readiness and production-disabled status.
- Setup documentation clearly separates completed app functionality, test-only functionality, production-disabled functionality, website-side owner actions, and future enhancements.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Website integration foundation tests pass.
- Unified Lead Intake tests pass.
- Lead routing tests pass.
- Twilio foundation tests pass.
- Gmail foundation tests pass.
- Google Calendar foundation tests pass.
- Security/company-access tests pass.
- Migration-integrity tests pass if applicable.
- Targeted signed-in browser regression passes for website intake, Lead Intake, Integration Center, Customer 360, CRM, and existing provider foundations.
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
- Run website integration foundation tests.
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
- Run targeted signed-in browser regression for Website Integration, Lead Intake, Integration Center, Customer 360, CRM, existing Yelp foundation, Twilio, Gmail, and Google Calendar behavior.
- Run full signed-in browser regression if supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add website integration lead capture foundation`

## Blockers

- Live public website form connection, DNS/hosting changes, production form backend deployment, production signing secret rollout, and controlled live website traffic validation require owner-controlled website or hosting access and are outside this repository-only sprint.

## Final Status

Completed, validated, committed, and pushed as part of this sprint workflow.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.

The Website Integration Phase 1 foundation was implemented with a disabled-by-default production gate, source and form-type registry, HMAC validation, allowed-origin checks, attribution and consent preservation, safe dry-run behavior, safe integration logging, setup documentation, automated regression coverage, and signed-in browser validation.
