# AI Command Center 3.0 - Live Provider and Reviewed Actions

## Purpose

AI Command Center 3.0 extends the existing AI Tools workspace with a controlled live-provider adapter and reviewed-action boundary for WeatherTech Roofing LLC and IHC Painting. It keeps the AI workspace, Scope Writer, Estimate Assistant, Proposal Review, Inspection, Sales, Operations, Financial, Communications, Weather, Marketing, and Document assistant surfaces in one place.

## Current-State Note

AI Command Center 3.0 was implemented on top of this provider foundation in commit `8f6fda8f12ce7808bb9b3c4669cc8f0d120656b6`. Future sessions must not propose rebuilding it as a new sprint. The centralized automation foundation adds a narrow reviewed path for safe internal follow-up tasks; it does not authorize customer-facing or arbitrary CRM/provider actions.

The command center is designed for grounded internal assistance. It uses server-side OpenAI or Anthropic connectivity, structured answers, cost controls, context retrieval, prompt-safety checks, durable per-preview audit references, and approval-gated actions without authorizing customer-facing or arbitrary provider automation.

## Current Production State

- Production remains at the historical `51/51` migration ledger. The AI/automation release set is `63/63` locally and on the isolated regression target and is pending Production rollout.
- Provider/model credentials and bounded global controls are present server-side, but Production contains zero `ai_usage_limits` rows. The new runtime therefore cannot authorize an exact-company provider call until one policy row exists for that company.
- The two conservative provider price-ceiling variables are not yet configured in Production. Their values must come from the authoritative price for the exact selected model; they must not be guessed.
- No paid Production provider smoke test has been run or authorized by this release.
- External writes and customer-facing sends remain blocked.
- `AI_ACTION_EXECUTION_ENABLED` remains false; it is not the authorization mechanism for the safe internal path.
- Every returned action preview must have its own durable audit reference before it reaches the browser.
- Only an exact-company, authorized review of `create_follow_up_draft` may create one internal office task through the centralized automation engine.
- `draft_email` remains preview/reject-only until exact recipient, subject, and body are included in a server-side fingerprinted action contract; it never creates or sends a message through AI review.
- Customer communications are not sent.
- Estimates, proposal changes, invoices, schedules, payments, migrations, provider settings, and deployments are not changed automatically.
- AI output is labeled as verified facts, calculated findings, recommendations, assumptions, missing data, proposed actions, and required approval.

## Provider Architecture

Core server-side logic lives in [aiProvider.ts](../lib/crm/aiProvider.ts).

The provider layer supports:

- Provider-neutral configuration for OpenAI, Anthropic, or disabled mode.
- Readiness states for migration, provider, API key, cost, usage, disabled, connected, failed, and production-disabled states.
- Server-side authorized context retrieval from the existing `CrmSnapshot`.
- Company scoping before context ranking.
- Role-aware safety posture.
- Prompt-injection and secret-exposure blocking.
- Structured output parsing.
- Action-preview generation with confirmation requirements.
- Provider health, timeout, retry, usage, and cost metadata.

The command endpoint [route.ts](../app/api/ai-tools/command/route.ts) accepts authenticated AI command requests, verifies exact-company membership before a provider call, durably records the request and each returned action preview, and returns the provider-neutral command result without secrets.

Before any provider request, the route requires exactly one enabled `ai_usage_limits` row for the selected company, with an allowed provider/model and complete positive request, token, timeout, retry, and monthly-budget controls. Missing, duplicate, disabled, or incomplete policy state fails closed before a paid call.

The service-role-only quota RPC reserves the request atomically before provider access. It counts global, company, and user requests; reserves a conservative retry-inclusive cost using the configured input/output ceilings and maximum response allowance; enforces both the global daily and company monthly budgets; and replays the same request ID idempotently.

The review endpoint [route.ts](../app/api/ai-tools/actions/review/route.ts) reloads the stored proposal, rechecks company authorization and target identity, verifies the stored payload fingerprint and contract version, and submits a bounded approve or reject decision. It does not trust action data supplied again by the browser.

The UI remains in the existing AI Tools view in [CrmApp.tsx](../components/CrmApp.tsx). No second AI command center or duplicate AI navigation item exists.

## Official Provider Basis

OpenAI readiness follows the current OpenAI Responses API, Structured Outputs, function/tool calling, and streaming guidance:

- [OpenAI text generation guide](https://developers.openai.com/api/docs/guides/text)
- [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling)
- [OpenAI streaming guide](https://developers.openai.com/api/docs/guides/streaming-responses)

Anthropic readiness follows the current Anthropic Messages API, streaming, and tool-use guidance:

- [Anthropic Messages API guide](https://platform.claude.com/docs/en/build-with-claude/working-with-messages)
- [Anthropic getting started guide](https://platform.claude.com/docs/en/get-started)
- [Anthropic streaming guide](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Anthropic tool use guide](https://platform.claude.com/docs/en/build-with-claude/tool-use)

## Environment Variables

Safe placeholders are documented in [.env.example](../.env.example). Real values must be configured only in the approved server runtime environment and never committed.

Required controls:

- `AI_ENABLED`
- `AI_PROVIDER`
- `AI_MODEL`
- `AI_OPENAI_API_KEY`
- `AI_ANTHROPIC_API_KEY`
- `AI_DAILY_BUDGET_USD`
- `AI_DAILY_REQUEST_LIMIT`
- `AI_PER_USER_DAILY_REQUEST_LIMIT`
- `AI_PER_COMPANY_DAILY_REQUEST_LIMIT`
- `AI_MAX_REQUEST_TOKENS`
- `AI_MAX_RESPONSE_TOKENS`
- `AI_MAX_INPUT_COST_USD_PER_1K_TOKENS`
- `AI_MAX_OUTPUT_COST_USD_PER_1K_TOKENS`
- `AI_TIMEOUT_MS`
- `AI_RETRY_LIMIT`
- `AI_STREAMING_ENABLED`
- `AI_STRUCTURED_OUTPUT_ENABLED`
- `AI_ACTION_EXECUTION_ENABLED`

`AI_ACTION_EXECUTION_ENABLED` remains `false`. Customer communications, arbitrary CRM mutation, provider writes, financial actions, and scheduling changes are not part of the internal action registry. Safe internal follow-up-task approval is authorized through the stored audit contract and the centralized automation engine instead of this global flag.

Production rollout also requires exactly one `ai_usage_limits` row for each company. Rows may be seeded disabled without a billing decision. Enabling WeatherTech or IHC and assigning its positive monthly budget are separate owner decisions; one company must not inherit the other's approval or limit.

## Context Retrieval

AI Command Center 3.0 retrieves only authorized internal context from the existing CRM snapshot. Context is ranked and limited before provider prompts are built.

Supported context includes customers, leads, Customer 360 activity, inspections, estimates, proposals, jobs, schedules, communications, invoices, payments, documents, photo metadata, integration logs, and readiness blockers.

Retrieved content is treated as untrusted data. Emails, website submissions, Yelp messages, customer notes, documents, photo captions, and provider payloads cannot override system rules, permissions, company isolation, approval gates, or secret handling.

## Reviewed Actions

AI Command Center 3.0 may propose action previews such as:

- Save scope draft.
- Save estimate draft.
- Create follow-up draft.
- Prepare email draft.
- Prepare SMS draft.
- Prepare schedule recommendation.
- Prepare proposal revision.
- Prepare invoice draft.
- Prepare change order.
- Prepare inspection report.
- Prepare customer summary.
- Prepare job summary.

Every preview displays the action type, target record, company, reason, fields affected, before/after preview, required permission, confirmation requirement, provider dependency, and its own durable audit reference.

- Rejecting any stored preview records a durable rejection and creates no action.
- Approving `create_follow_up_draft` creates or replays exactly one company-bound internal office task through the automation engine.
- `draft_email` can be prepared and rejected, but cannot be approved or persisted through AI review until the exact draft is fingerprinted and created server-side.
- Other preview types cannot be approved for execution. They remain recommendations or drafts until a separately owner-approved action contract exists.
- Repeated review requests are idempotent and return the existing decision/execution receipt; conflicting decisions fail closed.

## Saved Work And Audit Logging

Migration [0033_ai_tools_operating_brain.sql](../supabase/migrations/0033_ai_tools_operating_brain.sql) adds persistence for saved analyses, audit events, and usage limits. Migration [20260902024804_automation_engine_foundation.sql](../supabase/migrations/20260902024804_automation_engine_foundation.sql) adds the fingerprint/review contract and the safe internal execution path.

Migration verification steps:

```bash
npx supabase migration list --linked
npx supabase db push --linked
```

Only run the commands above after verifying the linked project, migration history, and rollback plan. Never use a Production project as the ordinary write-capable regression target.

## Controlled Pilot Procedure

1. Verify migration 0033 and the exact current release migration set are applied to the intended Supabase project; Production currently has 0033 but not `20260902024804`.
2. Configure server-only provider credentials in the approved hosting environment.
3. Configure authoritative input/output price ceilings and exactly one explicit policy row per company. Keep unapproved company rows disabled and require an owner-approved positive monthly budget before enabling either company.
4. Keep `AI_ACTION_EXECUTION_ENABLED=false`.
5. Use grounded commands for one selected, authorized company in the AI workspace.
6. Confirm source records, missing data, assumptions, provider health, usage, and per-preview audit references are visible.
7. Approve one synthetic internal follow-up in the isolated regression environment and prove exactly one office task plus an idempotent review receipt.
8. Reject a separate preview and prove it creates no execution.
9. Confirm no customer communication, financial action, schedule change, deployment, or provider write occurs.
10. Review AI audit, automation execution, attempt, and approval history.

Steps 5-10 describe isolated regression and a separately authorized controlled pilot. They do not authorize a paid Production smoke test.

## Rollback

To disable the pilot:

1. Set `AI_ENABLED=false`.
2. Remove server-side provider API keys from the runtime environment.
3. Keep `AI_ACTION_EXECUTION_ENABLED=false`.
4. Restart the application runtime.
5. Disable the reviewed internal follow-up rule in the Automation Control Center if internal AI task execution must also pause.
6. Confirm the command center returns provider-disabled or provider-not-configured readiness and that queued safe work follows the rule's disabled/cancellation policy.

No database rollback is required to disable live provider calls.

## Validation

AI Command Center 3.0 is covered by:

- [ai-tools-live-provider.test.mjs](../tests/ai-tools-live-provider.test.mjs)
- [ai-action-review-boundary.test.mjs](../tests/ai-action-review-boundary.test.mjs)
- [ai-tools-operating-brain.test.mjs](../tests/ai-tools-operating-brain.test.mjs)
- [supabase-migration-integrity.test.mjs](../tests/supabase-migration-integrity.test.mjs)
- The `ai-tools` group in [weathertech-os-regression.mjs](../tests/codex-browser/weathertech-os-regression.mjs)

Regression must continue to prove provider-disabled honesty, mocked OpenAI and Anthropic adapter behavior, company isolation before provider access, prompt-injection blocking, usage-limit blocking, durable per-preview audit references, exact target/fingerprint review, idempotent safe internal action receipts, no fake AI output, and no customer/provider activation during normal validation.

## Known Limitations

- Real provider calls require owner-controlled credentials, authoritative price ceilings, and explicit per-company policy/budget approval.
- Production already contains migration 0033. The reviewed-action and automation additions in `20260902024804` remain pending Production rollout; do not describe them as deployed until the linked ledger and exact deployment prove it.
- Streaming is represented in provider readiness and configuration, but the current UI consumes complete responses.
- Only the reviewed internal follow-up task is executable. Draft email remains internal-draft-only, and every customer/provider action requires a future explicit owner-approved contract.
- Image analysis is not active; photo-related statements must remain metadata-based unless a future approved vision provider is configured.
