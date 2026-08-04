# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

AI Tools 2.0 - WeatherTech OS Operating System Brain

## Objective

Transform the existing AI Tools workspace into the central intelligence layer of WeatherTech OS for WeatherTech Roofing LLC and IHC Painting. The workspace must use authorized WeatherTech OS data, clearly distinguish verified facts from calculated insight and recommendations, keep live AI providers disabled until owner setup, and never fabricate records, prices, schedules, customer facts, provider status, payment status, or production readiness.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Reuse and extend the existing AI Tools workspace.
- Preserve and extend the AI Scope Writer and AI Estimate Assistant.
- Add an AI command bar for read-only, grounded operating-system questions.
- Add daily intelligence, urgent alerts, recommended actions, revenue opportunities, sales follow-ups, estimate/proposal opportunities, production risks, financial risks, communication gaps, weather/material/readiness signals, saved analyses, and drafts awaiting review.
- Support company-aware, role-aware, permission-aware intelligence for WeatherTech Roofing LLC and IHC Painting.
- Cite supporting internal records and show missing information, data completeness, approval requirements, provider requirements, and production-disabled state.
- Add provider readiness architecture, saved-analysis persistence, audit-event persistence, usage-limit persistence, prompt-safety checks, approval gates, and regression coverage.
- Reuse existing CRM, Customer 360, Leads, Customers, Estimates, Proposal Builder 2.0, Inspections, Jobs, Calendar, Dispatch, Photos, Materials, Routes, Invoices, Change Orders, Analytics, Customer Portal, Employee Portal, Documents, Website & Marketing, Notifications, Integration Center, Production Readiness, activity timelines, audit logs, company access controls, Supabase data access, authentication, provider foundations, and browser regression framework.

## Explicit Exclusions

- Do not create a second AI Command Center.
- Do not create a duplicate AI navigation item.
- Do not activate paid AI providers.
- Do not send real customer communications.
- Do not enable production automation.
- Do not apply remote Supabase migrations from Codex during this sprint.
- Do not modify the live Supabase database.
- Do not weaken authentication, RLS, company isolation, or approval gates.
- Do not expose secrets, credentials, API keys, provider tokens, prompts containing private keys, or `.env.local` values.
- Do not fabricate records, prices, schedules, customer facts, job status, provider status, payment status, or production readiness.
- Do not create destructive migrations.
- Do not redesign unrelated modules.
- Do not begin another sprint after completion.

## Completion Criteria

- AI Tools page becomes the AI Tools 2.0 operating-brain workspace.
- AI command bar returns grounded read-only responses from authorized snapshot data.
- Responses show answer, supporting records, missing information, completeness, recommended next action, approval state, provider requirement, read-only state, and production-disabled state.
- AI Scope Writer and AI Estimate Assistant remain present and safer than before.
- Scope drafts are generated from approved templates and selected CRM context only.
- Estimate drafts use existing estimate line items only and do not invent prices, quantities, margins, warranties, deposits, signatures, payments, or QuickBooks state.
- Prompt injection, secret-exposure, live-send, payment, deployment, and migration requests are blocked.
- Generated drafts and recommended actions require human approval and never execute irreversible writes automatically.
- Additive migration `0033_ai_tools_operating_brain.sql` is transactionally wrapped, non-destructive, company-owned, RLS-protected, and not remotely applied by Codex.
- Automated AI Tools regression tests pass.
- Migration integrity tests pass.
- Browser regression includes AI Tools 2.0 coverage.
- Documentation records the AI Tools architecture and disabled-provider boundaries.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Final scope audit confirms no unrelated files or behavior changed.
- One focused conventional commit is created and pushed.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm explicit owner approval from the task request.
- Confirm the current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before development begins.
- Run AI Tools automated tests.
- Run migration integrity tests.
- Run security/company-access policy tests.
- Run provider-foundation tests where applicable.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for AI Tools, Dashboard, CRM, Estimates, Documents, Customer 360, navigation, and related workflows.
- Run full signed-in browser regression where supported.
- Confirm no disposable AI Tools regression records remain.

## Planned Commit Message

`feat: add ai tools operating brain`

## Blockers

Live AI provider activation remains blocked until owner-controlled provider selection, server-side credentials, model limits, token/cost budgets, safety settings, controlled testing, migration deployment, and explicit production activation approval are complete.

## Final Status

Completed and validated through the final repository workflow. The sprint commit and push are recorded in Git history and in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
