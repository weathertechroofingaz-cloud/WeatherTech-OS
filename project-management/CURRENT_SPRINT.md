# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

AI Tools 2.1 - Live Provider Connection, Command Execution, and Controlled AI Pilot

## Objective

Turn the existing AI Tools 2.0 Operating System Brain into a controlled internal AI pilot for WeatherTech Roofing LLC and IHC Painting. The sprint must prepare server-side live AI provider connectivity, answer grounded natural-language questions using authorized WeatherTech OS data, generate useful drafts, and prepare actions behind explicit approval gates without activating production AI automation.

## Owner

Joe Harris

## Owner Approval Date

2026-08-05.

## Owner-Approved Scope

- Reuse and extend the existing AI Tools workspace only.
- Preserve the AI Scope Writer and AI Estimate Assistant.
- Add provider-neutral server-side AI provider abstraction for OpenAI, Anthropic, or disabled mode.
- Support model selection, structured output, tool/action proposals, provider health, safe provider-disabled behavior, timeout handling, retry limits, token limits, usage metadata, and cost controls.
- Add live AI readiness states for migration, provider configuration, API keys, usage limits, controlled testing, provider connectivity, provider failures, and production-disabled state.
- Retrieve authorized internal context from existing CRM, Customer 360, Leads, Customers, Inspections, Estimates, Proposal Builder 2.0, Jobs, Calendar, Dispatch, Photos, Materials, Invoices, Change Orders, Documents, Communications, Analytics, Weather, Integration Center, and Production Readiness data.
- Enforce company access and role access server-side before AI context is prepared.
- Treat retrieved records as untrusted content and block prompt-injection, secret-exposure, live-send, payment, deployment, migration, schedule, and provider-write requests.
- Add a useful AI command experience with follow-up state, safe cancellation, source records, missing-data warnings, proposed next actions, and approval requirements.
- Add action previews for drafts and recommendations while keeping execution disabled.
- Add usage, cost, provider, audit, and saved-work readiness to the AI Tools and Production Readiness surfaces.
- Add safe `.env.example` placeholders and permanent documentation for AI provider setup, controlled testing, migration status, rollback, and production activation requirements.
- Add mocked-provider automated regression coverage and targeted AI Tools browser regression coverage.

## Explicit Exclusions

- Do not create another AI page.
- Do not create another AI Command Center.
- Do not create a duplicate AI navigation item.
- Do not remove the existing Scope Writer.
- Do not remove the existing Estimate Assistant.
- Do not broadly redesign the application.
- Do not deploy.
- Do not enter real AI credentials into source files.
- Do not commit API keys.
- Do not modify `.env.local`.
- Do not apply remote Supabase migrations from Codex during this sprint.
- Do not send real email or SMS.
- Do not send proposals or signature requests.
- Do not process payments or create QuickBooks records.
- Do not change schedules or assign crews automatically.
- Do not execute external-provider actions.
- Do not fabricate prices, measurements, quantities, warranties, dates, payment states, provider states, customer facts, or hidden reasoning.
- Do not weaken authentication, RLS, company isolation, or approval gates.
- Do not begin another sprint after completion.

## Completion Criteria

- Existing AI Tools workspace is labeled and validated as AI Tools 2.1.
- Provider-neutral server-side AI pilot service exists.
- `/api/ai-tools/command` accepts authenticated commands and returns grounded, approval-gated results.
- OpenAI and Anthropic provider adapters are covered by mocked tests.
- Provider-disabled behavior remains truthful when no owner-controlled credentials are configured.
- Context retrieval enforces company scope and avoids secrets.
- Prompt-injection and unsafe-command blocking are tested.
- Action previews require explicit human review and do not execute workflows.
- Usage and cost controls block unrestricted AI usage.
- Production Readiness reports AI provider setup requirements honestly.
- Migration `0033_ai_tools_operating_brain.sql` remains not remotely applied by Codex.
- Documentation records provider setup, safe test mode, migration status, supported commands, action previews, approval gates, audit logging, cost controls, prompt-injection defense, limitations, rollback, and production activation requirements.
- Browser regression includes AI Tools 2.1 coverage.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Relevant local Node regression tests pass.
- Final scope audit confirms no unrelated files or behavior changed.
- One focused conventional commit is created and pushed.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm explicit owner approval from the task request.
- Confirm current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before development begins.
- Run AI Tools operating-brain tests.
- Run AI Tools live-provider pilot tests.
- Run migration integrity tests.
- Run security/company-access policy tests.
- Run provider-foundation tests where applicable.
- Run Proposal Builder 2.0 tests.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for AI Tools and related workspaces.
- Run full signed-in browser regression where supported.
- Confirm no disposable AI Tools regression records remain.

## Planned Commit Message

`feat: add ai tools live provider pilot`

## Blockers

Live AI provider activation remains blocked until owner-controlled provider selection, server-side credentials, model limits, token/cost budgets, safety settings, controlled testing, migration deployment, and explicit production activation approval are complete.

## Final Status

Completed and validated through the final repository workflow. The sprint commit and push are recorded in Git history and in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
