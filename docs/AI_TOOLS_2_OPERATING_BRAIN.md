# AI Tools 2.0 - WeatherTech OS Operating System Brain

## Purpose

AI Tools 2.0 extends the existing AI Tools workspace into a safe operating-brain foundation for WeatherTech Roofing LLC and IHC Painting. It is designed to help internal users understand priorities, risks, missing information, and next actions across the existing WeatherTech OS modules without activating a paid or live AI provider.

## Current Mode

Live AI is disabled.

Current behavior is intentionally limited to:

- Rule-based insight from the authorized in-memory CRM snapshot.
- Provider-disabled command responses.
- Draft-only recommendations.
- Human-review approval gates for every irreversible action.
- Clear missing-information and production-disabled labels.

AI Tools 2.0 does not:

- Call OpenAI, Anthropic, or another model provider.
- Send SMS, email, signature requests, proposal packets, invoices, or payment links.
- Change prices, warranties, job schedules, crew assignments, invoices, payments, migrations, provider settings, or deployment state.
- Claim a provider is connected or production-ready.
- Fabricate customer facts, records, prices, schedules, provider status, payment status, or production readiness.

## Architecture

Core logic lives in [aiTools.ts](../lib/crm/aiTools.ts).

The helper layer builds:

- Provider readiness.
- AI command responses.
- Executive brief metrics.
- Ranked priority items.
- Scope Writer drafts.
- Estimate Assistant drafts.
- Proposal, inspection, sales, operations, financial, communications, marketing, weather, and document assistant panels.
- Saved-analysis previews.
- Approval gates.

The UI remains in the existing AI Tools workspace inside [CrmApp.tsx](../components/CrmApp.tsx). No second AI Command Center or duplicate AI navigation item exists.

## Company And Role Scoping

AI Tools 2.0 uses the existing company-scope filtering from [companyScope.ts](../lib/crm/companyScope.ts). Selected-company intelligence is restricted before recommendations, command answers, drafts, and context counts are derived.

Role-aware behavior is conservative:

- Office users see collection and operational summaries.
- Owner/admin users may see broader financial summary language.
- Internal profitability remains restricted unless owner/admin context is explicit.

## Grounded Response Contract

Every command response includes:

- Answer.
- Supporting internal records.
- Data completeness.
- Missing information.
- Recommended next action.
- Approval requirement.
- Read-only state.
- Provider requirement.
- Production-disabled state.
- Safety flags when relevant.

Internal source references are safe record references intended for internal users. They should not be exposed in customer-facing portals.

## Prompt Safety

AI Tools blocks requests that attempt to:

- Ignore system/developer instructions.
- Reveal secrets, API keys, tokens, or service-role labels.
- Bypass RLS, security, approvals, or permissions.
- Send live customer communications.
- Charge customers or mark invoices paid.
- Apply migrations or deploy production.

Blocked responses remain read-only and explain that the request must be rephrased as a safe analysis or draft request.

## Persistence

Migration [0033_ai_tools_operating_brain.sql](../supabase/migrations/0033_ai_tools_operating_brain.sql) adds additive persistence for:

- `public.ai_saved_analyses`
- `public.ai_audit_events`
- `public.ai_usage_limits`

The migration is transactionally wrapped, company-owned, RLS-protected, and disabled by default. Authenticated users do not receive delete grants. Live provider limits default to zero until owner activation.

Codex did not apply this migration remotely during the sprint.

## Validation

AI Tools 2.0 is covered by:

- [ai-tools-operating-brain.test.mjs](../tests/ai-tools-operating-brain.test.mjs)
- [supabase-migration-integrity.test.mjs](../tests/supabase-migration-integrity.test.mjs)
- The `ai-tools` group in [weathertech-os-regression.mjs](../tests/codex-browser/weathertech-os-regression.mjs)

Validation must continue to confirm:

- Company isolation.
- Provider-disabled honesty.
- Read-only command behavior.
- Prompt-injection blocking.
- Human approval gates.
- No invented pricing, measurements, provider status, payments, or customer-facing actions.

## Future Activation Requirements

Future live AI activation requires a separate owner-approved sprint covering:

- Provider selection.
- Server-side API credentials.
- Model and token limits.
- Cost budgets.
- Request logging and retention rules.
- Prompt/context privacy review.
- Tool-call allowlist.
- Human approval policy.
- Controlled testing.
- Production migration deployment.
- Final owner activation approval.
