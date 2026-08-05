# Changelog

This changelog records verified WeatherTech OS repository milestones. Future entries should be concise and reference the commit that shipped the change.

## Recent Verified Milestones

### AI Tools 2.1 - Live Provider Connection, Command Execution, and Controlled AI Pilot

- Commit: `<this sprint commit>`
- Message: `feat: add ai tools live provider pilot`
- Summary:
  - Extended the existing AI Tools workspace with server-side OpenAI/Anthropic provider readiness, structured-output parsing, authorized context retrieval, follow-up command state, safe cancellation, usage/cost controls, and provider health reporting.
  - Added `/api/ai-tools/command` and `lib/crm/aiProvider.ts` so controlled pilot requests run through authenticated server-side logic instead of browser-side provider calls.
  - Added approval-gated action previews that can be marked reviewed in the UI but never execute customer communications, schedules, invoices, payments, migrations, deployments, or provider writes.
  - Added safe AI environment placeholders, Production Readiness Center AI activation guidance, permanent live-provider pilot documentation, and mocked-provider regression coverage.
  - Did not enter credentials, activate live AI providers, apply migration `0033_ai_tools_operating_brain.sql` remotely, modify `.env.local`, send communications, change schedules, create financial records, weaken RLS, or fake connected provider state.

### AI Tools 2.0 - WeatherTech OS Operating System Brain

- Commit: `<this sprint commit>`
- Message: `feat: add ai tools operating brain`
- Summary:
  - Extended the existing AI Tools workspace into a company-aware, role-aware operating-brain foundation with a read-only command bar, grounded responses, daily intelligence, priority recommendations, assistant panels, approval gates, saved-analysis readiness, and generated drafts awaiting review.
  - Added additive AI persistence in migration `0033_ai_tools_operating_brain.sql` for saved analyses, audit events, and usage limits with RLS, company ownership, disabled provider defaults, zero usage limits, and no authenticated delete grants.
  - Preserved and hardened AI Scope Writer and AI Estimate Assistant so they only use approved templates, selected CRM context, and existing estimate line items.
  - Added automated and browser regression coverage for provider-disabled behavior, company scoping, prompt safety, approval gates, and no fake AI/provider output.
  - Did not activate paid AI providers, apply the remote migration from Codex, send communications, expose secrets, enable production automation, or weaken RLS.

### Estimate & Proposal Builder 2.0 - World-Class Multi-Brand Sales, Acceptance, Invoice, and Payment System

- Commit: `<this sprint commit>`
- Message: `feat: add estimate proposal builder v2`
- Summary:
  - Added the WeatherTech Roofing LLC and IHC Painting proposal-builder foundation on top of the existing estimate workflow.
  - Added additive proposal template, revision, section, option, acceptance, payment schedule, and audit-event schema in migration `0032_estimate_proposal_builder_v2.sql`.
  - Added customer-safe proposal packets, optional upgrades, replacement alternatives, deposit invoice drafts, Customer Portal proposal visibility, and honest signature/payment/QuickBooks readiness.
  - Preserved internal/customer-facing separation by removing internal cost, margin, markup, commission, and private note language from customer packets.
  - Did not activate DocuSign, Dropbox Sign, payment processors, QuickBooks Online writes, outbound proposal delivery, provider webhooks, or remote migration application.

### Production Deployment Phase 1 - Private Staging Deployment

- Commit: `<this sprint commit>`
- Message: `feat: prepare private staging deployment`
- Summary:
  - Added private staging health and readiness endpoints that report safe runtime/dependency status without exposing secrets or customer records.
  - Added staging deployment metadata, environment and safety-gate inventory, owner setup documentation, Supabase Auth redirect guidance, monitoring/rollback runbook, and browser/test coverage.
  - Did not deploy, run remote migrations, activate providers, change `.env.local`, alter DNS, commit credentials, weaken authentication/RLS, or fake deployment readiness.

### Production Activation Phase 1 - Guided Owner Setup and Launch Control

- Commit: `<this sprint commit>`
- Message: `feat: add guided production launch control`
- Summary:
  - Extended the Production Readiness Center into a guided launch-control workspace with ordered activation steps, launch gates, provider activation cards, pending migration inventory, redacted environment readiness, three-company mapping guidance, and controlled-test plans.
  - Added permanent production activation documentation for owner actions, Codex responsibilities, provider prerequisites, deployment blockers, controlled tests, rollback, internal pilot entry criteria, and final production-use approval.
  - Preserved all disabled-by-default provider boundaries without deploying, running remote migrations, committing credentials, activating live integrations, or faking connected/ready status.

### Production Activation & Deployment Readiness

- Commit: `<this sprint commit>`
- Message: `feat: add production readiness center`
- Summary:
  - Added the read-only Production Readiness Center for deployment planning, environment readiness, migration verification, provider activation blockers, owner setup, regression status, monitoring, backups, and staged launch control.
  - Added provider activation guides for Twilio, Gmail, Google Calendar, Google Business Profile, Yelp, Website, QuickBooks Online, and Electronic Signatures without deploying, enabling production credentials, activating providers, or faking connected status.
  - Added reusable production readiness logic, documentation, and regression coverage while preserving existing WeatherTech OS workflows.

### Electronic Signatures Phase 1 - DocuSign / Dropbox Sign Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add electronic signatures provider foundation`
- Summary:
  - Added the disabled-by-default electronic signature provider foundation for DocuSign and Dropbox Sign.
  - Documented official provider OAuth, envelope/signature request, status, signed-document download, webhook/callback, test-mode, and production-send boundaries.
  - Added provider abstraction helpers, deterministic signature request drafts, Customer 360 event labels, Communications readiness, Integration Center provider cards, and provider constraint support without sending live signature requests, uploading documents to providers, committing credentials, or activating provider writes.

### QuickBooks Online Phase 1 - Accounting Integration Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add QuickBooks Online integration foundation`
- Summary:
  - Added the disabled-by-default QuickBooks Online accounting integration foundation for WeatherTech Roofing LLC and IHC.
  - Documented official Intuit OAuth, Accounting API, scopes, webhooks, CDC retry, customer/estimate/invoice/payment mapping, and Payments API boundaries.
  - Added duplicate-safe export-draft helpers, Integration Center readiness, communications activity language, and provider constraint support without creating QuickBooks records, processing payments, activating sync, or committing credentials.

### Google Business Profile Phase 1 - Multi-Location Integration Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Business Profile integration foundation`
- Summary:
  - Added the disabled-by-default Google Business Profile multi-location foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC using the Unified Lead Intake Hub.
  - Documented official Google Business Profile account/location, reviews, performance, OAuth, Pub/Sub, unsupported messaging, and discontinued Q&A boundaries.
  - Preserved dry-run routing, dedupe, Customer 360 activity, follow-up, and sanitized integration logging without scraping Google, storing passwords, sending review replies, or activating live sync.

### Yelp Integration Phase 1 - Multi-Account Lead Intake Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Yelp integration lead intake foundation`
- Summary:
  - Added the Yelp multi-account integration foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC using the Unified Lead Intake Hub.
  - Documented official Yelp public, partner-only, OAuth, webhook, and unsupported capability boundaries.
  - Kept live Yelp sync and outbound replies disabled by default while preserving dry-run/manual routing, dedupe, Customer 360 activity, follow-up, and sanitized integration logging.

### Website Integration Phase 1 - Multi-Brand Live Lead Capture Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add website integration lead capture foundation`
- Summary:
  - Added the disabled-by-default multi-brand website lead capture foundation with source/form routing, HMAC validation, allowed-origin checks, production activation gates, attribution and consent preservation, safe failure logging, and setup documentation.
  - Preserved the Unified Lead Intake Hub as the canonical pipeline and did not activate live production website forms.

### Google Calendar Phase 1 - Production Scheduling Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Calendar scheduling foundation`
- Summary:
  - Added the server-side Google Calendar foundation with OAuth reuse, company-aware connected calendars, disabled-by-default live writes, event sync planning, conflict detection, webhook intake, unmatched-event review, and sanitized integration logs.
  - Added additive migration `0028_google_calendar_scheduling_foundation.sql`, safe setup documentation, and automated/browser regression coverage without applying the migration remotely.

### Gmail / Google Workspace Phase 1 - Production Email Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Gmail workspace email foundation`
- Summary:
  - Added the server-side Google OAuth and Gmail API foundation with company-aware mailbox records, encrypted token storage, safe sync/import boundaries, CRM email matching, attachment metadata, and outbound send gating.
  - Preserved existing CRM workflows and kept live Gmail sending disabled until owner-controlled Google Workspace configuration and approval.

### Twilio Phase 1 - Production Communications Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Twilio communications foundation`
- Summary:
  - Added the server-side Twilio SMS and voice foundation with signed webhook validation, business-number routing, CRM matching, lead-intake fallback, and safe outbound gating.
  - Preserved existing CRM workflows and kept live sending disabled until owner-controlled provider configuration.

### Owner Approval Workflow

- Commit: `a7569d6638ecc6849723ba3f760d658e4209a8e6`
- Message: `docs: add owner approval and definition of done`
- Summary:
  - Added the permanent owner approval contract.
  - Strengthened the sprint lifecycle and Definition of Done.
  - Kept the repository in an awaiting-owner-approval state.

### Sprint Management Workflow

- Commit: `03b20e2e8f7a87ff2dcba243af7cf71e319a25d1`
- Message: `docs: add repository sprint management workflow`
- Summary:
  - Added repository-managed current, next, completed, and workflow sprint documents.
  - Made the repository the source of truth for sprint state and validation workflow.

### Website & Marketing Integration Foundation

- Commit: `1785b73d67a129e8fd4a0e4991e7d31331411d04`
- Message: `feat: add website marketing integration foundation`
- Summary:
  - Added the Website & Marketing foundation.
  - Preserved existing CRM persistence, Supabase schema, APIs, packages, migrations, RLS, and provider credentials.

### CRM Hardening Sprint

- Commit: `077b050088c150b80d89d244a7980613c65c1b61`
- Message: `fix: harden core office CRM workflows`
- Summary:
  - Hardened core office CRM workflows.
  - Preserved existing CRM, Supabase, and production workflows.

## Entry Template

### Sprint Or Milestone Name

- Commit: `<full commit hash>`
- Message: `<commit message>`
- Summary:
  - `<concise result>`
