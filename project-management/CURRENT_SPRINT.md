# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Production Activation Phase 1 - Guided Owner Setup and Launch Control

## Objective

Extend the existing Production Readiness Center into a guided owner setup and launch-control workflow for safe staged activation of WeatherTech OS without deploying, enabling live integrations, committing credentials, weakening authentication, or changing existing production workflows.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Reuse the existing Production Readiness Center rather than creating a second dashboard.
- Add a guided production activation sequence that orders repository verification, Supabase migration validation, authentication, production deployment, production URL setup, monitoring, provider setup, controlled testing, internal pilot, and final owner approval.
- Add provider activation cards for Supabase, Vercel or approved deployment provider, Twilio, Gmail / Google Workspace, Google Calendar, Website lead capture, Yelp, Google Business Profile, QuickBooks Online, DocuSign, and Dropbox Sign.
- Show truthful states for not configured, owner action required, OAuth required, external approval required, production URL required, migration verification required, controlled testing required, blocked, active, and failed.
- Add a pending migration inventory that distinguishes repository presence from verified remote production application.
- Add a redacted environment readiness inventory that can be evaluated server-side without exposing secrets to browser code.
- Add three-company/branch mapping guidance for WeatherTech Roofing LLC Phoenix, WeatherTech Roofing LLC Tucson, and IHC Painting.
- Add controlled-test plans and launch gates with required evidence, stop conditions, rollback paths, and owner responsibilities.
- Update production activation documentation, module registry, testing standard, changelog, and sprint-management records.

## Explicit Exclusions

- Do not deploy.
- Do not enable production credentials.
- Do not activate live integrations.
- Do not run Supabase `db push`, migration repair, or remote migration commands.
- Do not add live provider writes, sends, sync, or customer automation.
- Do not commit secrets or inspect secrets in browser code.
- Do not create destructive migrations.
- Do not create new migrations.
- Do not weaken authentication or RLS.
- Do not fake readiness, connected states, validation, migration status, provider health, or green deployment status.
- Do not redesign the application.
- Do not remove or redesign existing UI.
- Do not begin another sprint after completion.

## Completion Criteria

- Production Readiness Center is accessible through existing administration navigation.
- The center includes a guided launch-control sequence with explicit owner action, Codex responsibility, evidence, dependency, next-action, and stop-condition language.
- Provider activation cards show setup guide paths, required credentials/mappings, controlled tests, rollback, disabled safety flags, and truthful non-active statuses unless real evidence exists.
- Pending migrations show Git presence and migration-integrity-test inclusion without claiming verified live production application.
- Environment variables are inventoried without exposing secret values to browser code.
- WeatherTech Phoenix, WeatherTech Tucson, and IHC mappings remain owner-action-required until real provider identifiers are supplied outside the repository.
- Controlled-test plans and launch gates block internal pilot and daily production use until evidence and owner approval exist.
- Production readiness logic is reusable and covered by targeted automated tests.
- Browser regression covers the Production Readiness Center and confirms it routes to existing Settings and Integration Center workflows.
- Production activation documentation identifies the exact activation order, deployment blockers, pending migration inventory, owner actions, controlled tests, rollback, internal-pilot criteria, daily-production criteria, and intentionally disabled capabilities.
- No live provider activation, deployment, production credential use, fake readiness, `.env.local` change, package change, schema/RLS change, remote migration command, or destructive migration is introduced.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Production readiness tests pass.
- Existing regression suites and signed-in browser regression pass where supported.
- Final scope audit confirms no unrelated files or behavior changed.
- One focused conventional commit is created and pushed.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm approval status is exactly `Approved`.
- Confirm the working tree is clean before product development begins.
- Confirm the current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before product development begins.
- Inspect existing CRM, Customer 360, Dashboard, Office Operations, Dispatch, Inspections, Jobs, Documents, Website, Yelp, Google Business Profile, Gmail / Google Workspace, Google Calendar, Twilio, QuickBooks Online, Electronic Signatures, Integration Center, Customer Portal, Financial workspace, provider readiness helpers, sprint workflow docs, production activation docs, and browser regression patterns before editing.
- Run the production readiness center test.
- Run security/company-access policy tests.
- Run migration-integrity tests.
- Run existing provider foundation tests that are touched by readiness coverage.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Production Readiness Center, Settings, Integration Center, Dashboard, and navigation.
- Run full signed-in browser regression where supported.
- Clean all disposable regression records.

## Planned Commit Message

`feat: add guided production launch control`

## Blockers

Actual production deployment, live provider activation, production credentials, OAuth app approval, provider webhook configuration, provider IDs, monitoring, backups, production Supabase migration application/verification, and final owner production-use approval remain owner-controlled rollout steps outside this sprint.

## Final Status

Completed after validation, commit, push, remote synchronization, and clean working tree verification. Do not begin or promote another sprint without explicit owner approval.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
