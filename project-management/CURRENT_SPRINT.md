# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Production Deployment Phase 1 - Private Staging Deployment

## Objective

Prepare WeatherTech OS for a private staging deployment that can be hosted at a real HTTPS URL for controlled owner and employee testing while keeping live integrations, public intake, outbound communications, accounting writes, calendar writes, signature requests, customer portal access, and final production behavior disabled.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Inspect the current Next.js, Supabase, authentication, middleware, API route, environment, security-header, migration, and deployment configuration.
- Reuse the existing Production Readiness Center rather than creating another dashboard.
- Add server-side health and readiness endpoints for private staging.
- Add a non-secret staging deployment metadata model.
- Add a redacted staging environment inventory and disabled-provider safety checks.
- Document the private staging deployment path, Supabase auth redirect requirements, health/readiness checks, monitoring, rollback, and controlled staging validation.
- Update Production Readiness Center metadata, module documentation, testing documentation, changelog, and sprint records.
- Validate the repository locally and prepare it for owner-controlled hosting-provider setup.

## Explicit Exclusions

- Do not activate live provider integrations.
- Do not send real calls, SMS, email, calendar events, accounting writes, review replies, website leads, or signature requests.
- Do not activate the customer portal.
- Do not alter DNS or configure a custom domain.
- Do not apply remote migrations or run migration repair.
- Do not modify `.env.local`.
- Do not commit credentials or expose secrets.
- Do not weaken authentication or RLS.
- Do not create destructive migrations.
- Do not fake deployment, connected, readiness, or production-approved status.
- Do not redesign the UI.
- Do not build unrelated product features.
- Do not begin another sprint after completion.

## Completion Criteria

- Repository-side deployment audit is complete.
- `/api/health` reports application runtime health without exposing secrets.
- `/api/readiness` reports dependency readiness and blocks staging when required variables, auth evidence, migration evidence, regression evidence, Supabase reachability, or safety gates are not acceptable.
- Production Readiness Center exposes safe staging deployment metadata and endpoint paths without reading browser secrets.
- Staging environment variables and provider safety flags are documented in `.env.example` without real values.
- Private staging deployment runbook documents provider setup, Supabase Auth redirects, migration verification, health/readiness checks, monitoring, rollback, controlled validation, and resume instructions.
- No live deployment is claimed unless a supported authenticated deployment path exists.
- No live provider activation, `.env.local` change, package change, schema/RLS change, remote migration command, DNS change, or credential commit is introduced.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Local Node regression tests pass.
- Targeted and full signed-in browser regression pass where supported.
- Final scope audit confirms no unrelated files or behavior changed.
- One focused conventional commit is created and pushed.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm explicit owner approval from the task request.
- Confirm the working tree is clean before product development begins.
- Confirm the current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before product development begins.
- Run all local Node regression tests.
- Run production readiness tests.
- Run staging deployment readiness tests.
- Run migration-integrity tests.
- Run security/company-access policy tests.
- Run provider-foundation tests.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Production Readiness Center, health/readiness endpoints, Settings, Integration Center, Dashboard, and navigation.
- Run full signed-in browser regression where supported.
- Confirm no disposable staging or regression records remain.

## Planned Commit Message

`feat: prepare private staging deployment`

## Blockers

Actual private staging deployment remains blocked in this Codex environment unless the owner provides or authorizes deployment-provider authentication, billing/organization selection, provider-side environment-variable entry, and staging URL verification. Remote Supabase migration application and dashboard auth redirect changes remain owner-controlled external steps.

## Final Status

Repository preparation completed and validated. Commit, push, remote synchronization, and clean working tree verification are the remaining repository workflow steps.

Private staging deployment itself remains blocked on owner-controlled deployment-provider setup, environment-variable entry, Supabase Auth redirect configuration, migration-history verification, and real staging URL validation. Codex must not claim staging is deployed until those external steps are completed and verified.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
