# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Production Activation & Deployment Readiness

## Objective

Prepare WeatherTech OS for safe production deployment and staged live activation without deploying, enabling live integrations, committing credentials, weakening authentication, or changing existing production workflows.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Review existing CRM, Customer 360, Dashboard, Office Operations, Dispatch, Inspections, Jobs, Documents, Website, Yelp, Google Business Profile, Gmail / Google Workspace, Google Calendar, Twilio, QuickBooks Online, Electronic Signatures, Integration Center, Customer Portal, and Financial workspace readiness.
- Build a Production Readiness Center that truthfully reports overall readiness, environment status, required migrations, pending owner setup, OAuth/credential requirements, production-disabled states, ready-for-activation states, connected states when records genuinely indicate them, health status, last validation, last regression, and last migration.
- Add Production Activation Guides for Twilio, Gmail, Google Calendar, Google Business Profile, Yelp, Website, QuickBooks Online, and Electronic Signatures.
- Add deployment readiness checks for missing environment variables, pending migrations, missing OAuth configuration, missing webhook secrets, missing provider IDs, database readiness, integration readiness, and browser regression status.
- Create a unified production checklist covering Database, Supabase, Authentication, Integrations, Security, Documents, Customer Portal, Financial, Communications, Website, Monitoring, and Backups.
- Reuse existing application architecture, navigation, design language, provider registry concepts, company scoping, and browser regression patterns.
- Update sprint-management documentation after completion.

## Explicit Exclusions

- Do not deploy.
- Do not enable production credentials.
- Do not activate live integrations.
- Do not add live provider writes, sends, sync, or customer automation.
- Do not commit secrets or inspect secrets in browser code.
- Do not create destructive migrations.
- Do not weaken authentication or RLS.
- Do not fake readiness, connected states, validation, migration status, provider health, or green deployment status.
- Do not redesign the application.
- Do not remove or redesign existing UI.
- Do not begin another sprint after completion.

## Completion Criteria

- Production Readiness Center is accessible through existing administration navigation.
- The center reviews the approved subsystems and truthfully reports production-disabled, owner-setup, credential, OAuth, migration, validation, regression, and readiness blockers.
- Each requested provider has an activation guide with required owner actions, credentials, OAuth setup, external approvals, testing sequence, and rollback procedure.
- The unified production checklist includes database/Supabase, authentication/security, integrations, documents, customer portal, financial, communications, website, monitoring, backups, and browser regression readiness.
- Production readiness logic is reusable and covered by targeted automated tests.
- Browser regression covers the Production Readiness Center and confirms it routes to existing Settings and Integration Center workflows.
- No live provider activation, deployment, production credential use, fake readiness, `.env.local` change, package change, schema/RLS change, or destructive migration is introduced.
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
- Inspect existing CRM, Customer 360, Dashboard, Office Operations, Dispatch, Inspections, Jobs, Documents, Website, Yelp, Google Business Profile, Gmail / Google Workspace, Google Calendar, Twilio, QuickBooks Online, Electronic Signatures, Integration Center, Customer Portal, Financial workspace, provider readiness helpers, sprint workflow docs, and browser regression patterns before editing.
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

`feat: add production readiness center`

## Blockers

Actual production deployment, live provider activation, production credentials, OAuth app approval, provider webhook configuration, provider IDs, monitoring, backups, and final production Supabase verification remain owner-controlled rollout steps outside this sprint.

## Final Status

In progress until validation, commit, push, remote synchronization, and clean working tree verification complete.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
