# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Production Connections Phase 1

## Objective

Begin connecting WeatherTech OS to real production services safely while preserving existing Customer Portal, Estimates, AI Command Center, CRM, company isolation, and approval-only AI behavior.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Connect and validate one provider at a time.
- Start with Production Supabase verification before any other provider work.
- Proceed in this priority order only after the previous provider is verified:
  - Production Supabase verification
  - Document storage
  - Stripe payments
  - Business email
  - SMS
  - Google Calendar
  - QuickBooks
- Verify required production configuration without printing or committing secrets.
- Preserve existing Customer Portal workflows.
- Preserve existing Estimate and Proposal workflows.
- Preserve the existing AI Command Center.
- Keep all AI actions approval-only.
- Keep `AI_ACTION_EXECUTION_ENABLED=false`.
- Validate each provider before moving to the next provider.
- Run full regression after each integration.
- Commit only after validation passes.
- Report screenshots, validation results, commit hash, and remaining blockers.

## Explicit Exclusions

- Do not begin a later provider before the current provider is verified.
- Do not deploy.
- Do not apply migrations unless the provider step explicitly requires it and the target project, deployment path, and rollback/safety conditions are verified.
- Do not modify production data manually.
- Do not print, log, or commit secrets.
- Do not modify `.env.local`.
- Do not enable automatic AI execution.
- Do not send live communications without explicit approval.
- Do not activate live payments without explicit approval.
- Do not weaken authentication, RLS, company isolation, or approval gates.
- Do not redesign the UI.
- Do not add unrelated CRM features or new modules.
- Do not break existing workflows.

## Completion Criteria

- Production Supabase verification is completed first.
- Every connected provider is validated before moving to the next provider.
- Customer Portal still works.
- Estimates and Proposal Builder still work.
- AI Command Center still works.
- Automatic AI execution remains disabled.
- No secrets are committed or exposed.
- No unapproved production data changes are made.
- Full regression passes after each integration.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Relevant provider-specific automated tests pass.
- Targeted browser validation passes for each connected provider.
- Final scope audit confirms no unrelated changes.
- One focused conventional commit is created only after validation passes.
- Local `main` equals `origin/main`.
- Working tree is clean except for any explicitly documented local-only files.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm explicit owner approval from the task request.
- Confirm current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before development begins.
- Confirm the working tree is clean or every local-only file is explicitly documented.
- Confirm there is no interrupted Git operation.
- For Production Supabase verification:
  - Verify the linked Supabase project is the intended WeatherTech OS project before any remote action.
  - Verify migration state without applying migrations unless separately safe and required.
  - Verify storage readiness before document-storage activation.
  - Verify anonymous and authenticated access behavior remains safe.
- For each later provider:
  - Verify official provider capability and production setup requirements.
  - Verify required configuration is present without printing values.
  - Verify provider stays disabled until safe activation gates pass.
  - Run targeted provider tests and direct browser validation.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run relevant automated tests.
- Run full signed-in browser regression after each integration where supported.
- Capture screenshots for owner review.

## Planned Commit Message

`feat: connect production services phase 1`

## Blockers

- Do not begin Production Connections until repository housekeeping confirms this sprint file is current and the Supabase CLI project files are either committed or explicitly documented as local-only.
- Any missing production credentials, owner-controlled OAuth setup, billing decision, destructive database change, live communication, live payment, or deployment approval must stop the sprint until owner action is provided.

## Final Status

Approved and awaiting implementation.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Connect one provider at a time and stop before the next provider if validation, safety, or owner-approval gates fail.
