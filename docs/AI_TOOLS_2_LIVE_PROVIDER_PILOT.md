# AI Tools 2.1 - Live Provider Pilot

## Purpose

AI Tools 2.1 extends the existing AI Tools workspace into a controlled live-provider pilot for WeatherTech Roofing LLC and IHC Painting. It keeps the AI workspace, Scope Writer, Estimate Assistant, Proposal Review, Inspection, Sales, Operations, Financial, Communications, Weather, Marketing, and Document assistant surfaces in one place.

## Current-State Note

AI Command Center 3.0 is already implemented on top of this pilot foundation in commit `8f6fda8f12ce7808bb9b3c4669cc8f0d120656b6`. Future sessions must not propose rebuilding it as a new sprint. Live model-provider credentials, production activation, or executable actions remain separate owner-controlled decisions.

The pilot is designed for grounded internal assistance only. It prepares server-side OpenAI or Anthropic connectivity, structured answers, cost controls, context retrieval, prompt-safety checks, and approval-gated action previews without enabling production AI automation.

## Current Production State

- Live provider execution is disabled unless owner-controlled server environment variables are configured.
- External writes remain blocked.
- Action execution remains disabled in code and configuration.
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

The endpoint [route.ts](../app/api/ai-tools/command/route.ts) accepts authenticated AI command requests and returns the provider-neutral command result. It never returns secrets and does not execute action previews.

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
- `AI_TIMEOUT_MS`
- `AI_RETRY_LIMIT`
- `AI_STREAMING_ENABLED`
- `AI_STRUCTURED_OUTPUT_ENABLED`
- `AI_ACTION_EXECUTION_ENABLED`

`AI_ACTION_EXECUTION_ENABLED` must remain `false` until a future owner-approved automation sprint defines specific executable tools, permissions, audit rules, and rollback behavior.

## Context Retrieval

AI Tools 2.1 retrieves only authorized internal context from the existing CRM snapshot. Context is ranked and limited before provider prompts are built.

Supported context includes customers, leads, Customer 360 activity, inspections, estimates, proposals, jobs, schedules, communications, invoices, payments, documents, photo metadata, integration logs, and readiness blockers.

Retrieved content is treated as untrusted data. Emails, website submissions, Yelp messages, customer notes, documents, photo captions, and provider payloads cannot override system rules, permissions, company isolation, approval gates, or secret handling.

## Action Previews

AI Tools may propose action previews such as:

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

Every preview displays the action type, target record, company, reason, fields affected, before/after preview, required permission, confirmation requirement, provider dependency, audit reference, and preview-only status.

Approving a preview in AI Tools 2.1 marks the preview as reviewed only. It does not execute a workflow action.

## Saved Work And Audit Logging

Migration [0033_ai_tools_operating_brain.sql](../supabase/migrations/0033_ai_tools_operating_brain.sql) adds persistence for saved analyses, audit events, and usage limits. AI Tools 2.1 can write safe audit metadata only when the migration is available in the environment.

Codex did not apply migration 0033 remotely during this sprint.

Future migration verification steps:

```bash
npx supabase migration list --linked
npx supabase db push --linked
```

Only run the commands above after verifying the linked project, owner approval, migration history, and rollback plan.

## Controlled Pilot Procedure

1. Verify migration 0033 is applied to the intended Supabase project.
2. Configure server-only provider credentials in the approved hosting environment.
3. Set strict daily budget, request, per-user, per-company, token, timeout, and retry limits.
4. Keep `AI_ACTION_EXECUTION_ENABLED=false`.
5. Use test prompts from the AI Tools workspace.
6. Confirm source records, missing data, assumptions, provider health, usage, and action previews are visible.
7. Confirm no customer communication, financial action, schedule change, migration, deployment, or provider write occurs.
8. Review audit events and usage metadata.

## Rollback

To disable the pilot:

1. Set `AI_ENABLED=false`.
2. Remove server-side provider API keys from the runtime environment.
3. Keep `AI_ACTION_EXECUTION_ENABLED=false`.
4. Restart the application runtime.
5. Confirm AI Tools returns provider-disabled or provider-not-configured readiness.

No database rollback is required to disable live provider calls.

## Validation

AI Tools 2.1 is covered by:

- [ai-tools-live-provider.test.mjs](../tests/ai-tools-live-provider.test.mjs)
- [ai-tools-operating-brain.test.mjs](../tests/ai-tools-operating-brain.test.mjs)
- [supabase-migration-integrity.test.mjs](../tests/supabase-migration-integrity.test.mjs)
- The `ai-tools` group in [weathertech-os-regression.mjs](../tests/codex-browser/weathertech-os-regression.mjs)

Regression must continue to prove provider-disabled honesty, mocked OpenAI and Anthropic adapter behavior, company isolation, prompt-injection blocking, usage-limit blocking, action-preview approval gates, no fake AI output, and no live provider activation during normal validation.

## Known Limitations

- Real provider calls require owner-controlled credentials and explicit runtime configuration.
- Migration 0033 must be applied before durable saved work and audit logging are fully available.
- Streaming is represented in provider readiness and configuration, but the current UI consumes complete responses.
- Action previews are review-only. Executable AI tools require a future approved sprint.
- Image analysis is not active; photo-related statements must remain metadata-based unless a future approved vision provider is configured.
