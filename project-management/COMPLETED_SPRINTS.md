# Completed Sprints

This file records completed WeatherTech OS sprints after validation, commit, push, and remote synchronization.

## Recent Verified Sprints

### Production Connections Phase 1: Twilio/SMS — Owner-Accepted Closeout

- Implementation commit: `e7a5a57f42f3d9dfc482d6b412af9768cf31af94`
- Inventory-blocker checkpoint: `5c1bb7538a023b11606532a1b555b91905b6df42`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed by explicit owner acceptance with known external follow-up; implementation is pushed and deployed, while provider activation remains partial.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `26/26 pass`
  - Twilio security/foundation suite: `114/114 assertions pass`
  - Twilio isolated runner contract: `35/35 assertions pass`; the previously executed hosted route regression passed `54 assertions` with zero provider requests and zero residue
  - Complete non-production Codex Browser suite: `24/24 groups`, `28/28 assertions`, zero console errors, zero console warnings, and zero residue
  - Type-check, lint, production build, dependency audit, `git diff --check`, credential scan, and protected CI lifecycle: `pass`
- Notes:
  - WeatherTech Tucson ending `3145` is the only live-validated route, with exactly one received SMS record and one completed provider event.
  - IHC ending `6930` is exactly mapped and active at `ready_for_live_test` with zero messages and zero validation events; no IHC live-ingress claim is made.
  - WeatherTech Phoenix remains unconfigured because no owner-approved eligible number is available. Signed simulations do not prove carrier ingress for an unowned route.
  - Outbound SMS remains hard-locked and disabled with zero outbound messages. Voice, MMS, campaigns, reminders, auto-replies, and broader provider activation remain outside this closeout.
  - No scheduled Twilio inventory automation remains. `.env.local` and both owner-designated Property Intelligence changes remained byte-for-byte unchanged, unstaged, and uncommitted.

### Non-Production Regression Environment & CI Test-Data Lifecycle

- Implementation commit: `6354429976fb7a549bbc738fc0b76b3c5ea2022b`
- Message: `test: add isolated regression environment lifecycle`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, pushed, deployed, and production-verified.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `25/25 pass`
  - Complete non-production Codex Browser suite: `24/24 groups`, `28/28 assertions`, zero console errors, zero console warnings
  - Test-data cleanup and independent residue verification: `pass`, zero current-run residue
  - Type-check, lint, production build, dependency audit, `git diff --check`, workflow checks, and credential scan: `pass`
  - GitHub Actions run `31570826433`: repository validation and isolated Supabase lifecycle jobs both `success`
- Notes:
  - Provisioned the dedicated free hosted Supabase project `WeatherTech OS Regression` (`hygtnhmmaoboduqghhwg`) without copying production data or provider credentials.
  - Reproduced all 38 committed migrations and verified parity with production across 70 RLS-enabled public tables, 185 policies, and 915 Data API grants.
  - Added permanent production-target rejection, positive browser/server/service-role target agreement, aggregate provider-side-effect markers, exact synthetic-owner authentication, unique run ownership, collision refusal, captured-ID cleanup, Stripe-linked cleanup refusal, and zero-residue proof.
  - Added protected CI lifecycle verification without falsely representing GitHub-hosted CI as capable of running the proprietary Codex Browser suite.
  - Kept production data unchanged, all Stripe write gates false, and IHC at zero Stripe connections, accounts, mappings, events, and payments.
  - Preserved `.env.local` and the two owner-designated Property Intelligence working changes byte-for-byte and excluded them from both sprint commits.

### Production Data Isolation & Clean Baseline

- Implementation commit: `c57698786e83732e49b8cb4ace83e3128539b28f`
- Message: `fix: isolate regression data from production`
- Closeout: documentation-only commit containing this record; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, pushed, deployed, and production-verified.
- Validation:
  - Every `tests/*.test.mjs` file: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - Production build: `pass`
  - `git diff --check` and secret scan: `pass`
  - Signed-in read-only production smoke: `pass`, zero warning/error entries
- Notes:
  - Added a permanent fail-closed Production Supabase guard, exact hosted-nonproduction authorization, local-app and public-resource-origin verification, exact-run cleanup, collision/residue detection, and Stripe-linked cleanup refusal to the write-capable browser regression harness.
  - Removed only evidence-proven regression and sample records in two guarded production transactions; uncertain mixed-origin records remained untouched.
  - Restored the production financial baseline to zero invoices, zero outstanding balance, and zero overdue invoices while preserving two refunded Stripe payments, four mappings, eight processed webhook events, and two payment-intent sync logs.
  - Kept all Stripe write gates false and IHC at zero Stripe connections, mappings, events, and payments.
  - Preserved the owner-designated Property Intelligence working changes byte-for-byte and excluded them from both sprint commits.
  - Full write-capable browser regression was not run because no safe non-production Supabase project, branch, or local container runtime was available; direct fail-closed production targeting and all safe repository tests passed.

### Production Connections Phase 1 - Verified Production Foundation

- Release checkpoint: `68943206451322de3ae6bdbcbe497f8117290e19`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed through the verified production checkpoint preceding the Production Data Isolation & Clean Baseline sprint.
- Notable focused commits:
  - `9dc94ba6ae044deab42d406dd92f87e8f94b3a0f` — Next.js 16.3.0 security upgrade.
  - `bc23ce7c12c30e6bf4fafaafa2b93203f73547a3` — company-isolated Stripe payment foundation.
  - `95903d2c05b8ea63e0c55914490fdd788e292d7e` — Stripe Payment Element workflow.
  - `86c447b3e8d912ce28b8dbcfcdfaf7f5c932c419` — atomic Stripe refund reconciliation.
  - `0dc98f9` through `6894320` — owner refund surface, active-PaymentIntent recovery, and payment-confirmation hardening.
- Notes:
  - Production Supabase, document storage, Gmail, Google Calendar, both GoHighLevel company connections, Vercel deployment, and WeatherTech-only Stripe passed their approved connection checkpoints.
  - WeatherTech Stripe payment, authenticated webhook, database reconciliation, and full-refund behavior were validated under narrow owner authorization.
  - IHC remained unmapped from the WeatherTech Stripe account. Twilio/SMS, QuickBooks, IHC Stripe, and unrelated providers were not activated.
  - Production health and provider activation readiness remain separate controls; ordinary live-write gates must stay fail-closed except during exact owner-approved operations.

### AI Command Center 3.0 - Operating Brain

- Commit: `8f6fda8f12ce7808bb9b3c4669cc8f0d120656b6`
- Message: `feat: add ai command center operating brain`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Added AI Command Center 3.0 to the existing AI Tools workspace with executive recommendations, advisor modes, company-scoped operating context, grounded responses, and approval-gated behavior.
  - Preserved the AI Tools 2.1 provider safety and non-executing action boundary.
  - This is an established capability and must not be scheduled as a rebuild without an owner-approved rework sprint.

> Older entries containing `<this sprint commit>` predate the immutable-hash closeout rule and are retained as historical records, not current release provenance. New sprint records must use observed commit hashes.

### AI Tools 2.1 - Live Provider Connection, Command Execution, and Controlled AI Pilot

- Commit: `<this sprint commit>`
- Message: `feat: add ai tools live provider pilot`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Extended the existing AI Tools workspace into a controlled live-provider pilot without creating a second AI page or navigation item.
  - Added authenticated server-side AI command handling, provider-neutral OpenAI/Anthropic readiness, structured-output parsing, authorized context retrieval, prompt-safety blocking, usage/cost controls, safe cancellation, provider health, and follow-up command state.
  - Added approval-gated action previews that can be reviewed in the UI but cannot execute customer communications, schedules, invoices, payments, migrations, deployments, or provider writes.
  - Added Production Readiness Center AI activation guidance, `.env.example` placeholders, permanent provider-pilot documentation, and mocked-provider automated regression coverage.
  - Did not enter credentials, activate live AI providers, apply migration `0033_ai_tools_operating_brain.sql` remotely, modify `.env.local`, send communications, change schedules, create financial records, weaken RLS, or fake connected provider state.

### AI Tools 2.0 - WeatherTech OS Operating System Brain

- Commit: `<this sprint commit>`
- Message: `feat: add ai tools operating brain`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Extended the existing AI Tools workspace into a provider-disabled operating brain with a read-only command bar, daily intelligence summary, priority recommendations, assistant panels, approval gates, saved-analysis readiness, and generated drafts awaiting review.
  - Added company-aware, role-aware rule-based intelligence that cites internal records and clearly labels missing information, completeness, approval requirements, provider-disabled behavior, and production-disabled state.
  - Preserved and hardened the AI Scope Writer and AI Estimate Assistant so they use approved templates and existing estimate line items only.
  - Added additive migration `0033_ai_tools_operating_brain.sql` for company-owned saved analyses, AI audit events, and AI usage limits, but did not apply it remotely from Codex.
  - Did not activate paid AI providers, send communications, expose secrets, enable production automation, weaken RLS, or fake AI/provider output.

### Estimate & Proposal Builder 2.0 - World-Class Multi-Brand Sales, Acceptance, Invoice, and Payment System

- Commit: `<this sprint commit>`
- Message: `feat: add estimate proposal builder v2`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added company-aware proposal templates, proposal revisions, customer-facing sections, proposal options, acceptance records, payment schedules, and audit events.
  - Preserved strict internal/customer-facing separation so internal costs, margin, markup, commissions, and private notes stay out of proposal packets.
  - Added base-total, optional-upgrade, replacement-alternative, deposit invoice draft, Customer Portal proposal summary, signature readiness, payment readiness, and QuickBooks readiness behavior.
  - Added additive migration `0032_estimate_proposal_builder_v2.sql` but did not apply it remotely from Codex.
  - Did not activate live DocuSign, Dropbox Sign, payments, QuickBooks Online, outbound proposal delivery, provider webhooks, or customer messaging.

### Production Deployment Phase 1 - Private Staging Deployment

- Commit: `<this sprint commit>`
- Message: `feat: prepare private staging deployment`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added private staging health and readiness endpoints with safe deployment metadata, dependency readiness, Supabase reachability classification, and disabled-provider safety gates.
  - Added private staging environment inventory, Supabase Auth redirect guidance, monitoring and rollback documentation, controlled staging validation steps, and Production Readiness Center metadata.
  - Did not deploy, apply remote migrations, activate providers, change `.env.local`, alter DNS, commit credentials, weaken authentication/RLS, or fake staging readiness.

### Production Activation Phase 1 - Guided Owner Setup and Launch Control

- Commit: `<this sprint commit>`
- Message: `feat: add guided production launch control`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Extended the existing Production Readiness Center with guided launch-control sequencing, launch gates, provider activation cards, pending migration inventory, redacted environment readiness, three-company mapping guidance, controlled-test plans, and production evidence fields.
  - Kept all provider states conservative until owner setup, OAuth/provider approval, migration verification, controlled tests, and final launch approval are complete.
  - Did not deploy, run remote Supabase migration commands, activate live integrations, enable credentials, inspect `.env.local`, weaken authentication/RLS, or fake production readiness.

### Production Activation & Deployment Readiness

- Commit: `<this sprint commit>`
- Message: `feat: add production readiness center`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a read-only Production Readiness Center for environment status, required migrations, provider blockers, pending owner setup, last validation/regression/migration evidence, and a unified deployment checklist.
  - Added production activation guides for Twilio, Gmail, Google Calendar, Google Business Profile, Yelp, Website, QuickBooks Online, and Electronic Signatures.
  - Did not deploy, activate live integrations, enable credentials, inspect secrets in browser code, modify `.env.local`, weaken authentication/RLS, or fake readiness.

### Electronic Signatures Phase 1 - DocuSign / Dropbox Sign Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add electronic signatures provider foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the disabled-by-default DocuSign and Dropbox Sign electronic signature provider foundation.
  - Added provider abstraction helpers, OAuth/account readiness, signature request draft mapping, status event labels, retry planning, Integration Center readiness, Communications visibility, and audit-log provider support.
  - Added additive provider constraint migration `0031_electronic_signatures_foundation.sql`.
  - Kept live signature requests, document uploads, provider writes, OAuth token exchange, webhook ingestion, fake connection status, and credentials out of this sprint.

### Core Office Operations Hardening

- Commit: `077b050088c150b80d89d244a7980613c65c1b61`
- Message: `fix: harden core office CRM workflows`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Hardened core office CRM workflows.
  - Preserved existing CRM, Supabase, and production workflows.

### Website & Marketing Integration Foundation

- Commit: `1785b73d67a129e8fd4a0e4991e7d31331411d04`
- Message: `feat: add website marketing integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Added the read-only Website & Marketing integration foundation.
  - Added navigation and browser regression coverage.
  - Did not modify CRM persistence, Supabase schema, APIs, packages, migrations, RLS, or provider credentials.

### Lead Intake Foundation

- Commit: `3f03c7e82c6dcb3395851fabc03d28027f68310a`
- Message: `feat: add lead intake foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a CRM Lead Intake workspace using the existing lead model and persistence path.
  - Captured customer, property, source, company assignment, priority, and lead status/stage.
  - Added browser regression coverage for company-scoped lead intake creation.
  - Did not modify Supabase schema, RLS, auth, packages, migrations, provider integrations, or environment files.

### Sales Pipeline & Opportunity Management

- Commit: `4c8b2935f06e30dd6dba45619f777b84e4baa9f4`
- Message: `feat: add sales pipeline opportunity management`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the Sales Pipeline workspace and opportunity management workflow.
  - Reused existing WeatherTech OS CRM records, company scoping, estimates, jobs, and browser regression coverage.
  - Did not modify authentication, RLS, provider integrations, packages, or environment files.

### Twilio Phase 1 - Production Communications Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Twilio communications foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Twilio configuration readiness, signed inbound webhook handling, business-number routing, CRM matching, lead-intake fallback, and safe outbound-send gating.
  - Added setup documentation for WeatherTech Phoenix, WeatherTech Tucson, and IHC business-number mapping.
  - Did not add migrations, modify `.env.local`, expose secrets, or send real SMS/call traffic.

### Gmail / Google Workspace Phase 1 - Production Email Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Gmail workspace email foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Google OAuth readiness, company-aware Gmail mailbox records, encrypted token storage, manual sync/import, CRM matching, attachment metadata, and integration log coverage.
  - Added safe outbound send boundaries that require explicit server-side enablement before Gmail sends any customer email.
  - Added Google Workspace setup documentation and safe environment placeholders.
  - Did not modify `.env.local`, expose credentials, send real email, or activate live Google Workspace connectivity.

### Google Calendar Phase 1 - Production Scheduling Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Calendar scheduling foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Google Calendar configuration, OAuth scope-upgrade, calendar discovery, sync planning, inbound webhook intake, unmatched-event review, and conflict-detection foundations.
  - Added additive migration `0028_google_calendar_scheduling_foundation.sql` for company-aware connected calendars, Calendar credentials, event sync metadata, and unmatched provider events.
  - Added safe write gating through `GOOGLE_CALENDAR_WRITE_ENABLED=false`, sanitized Calendar payloads, and setup documentation.
  - Did not modify `.env.local`, expose credentials, create live Calendar events, or apply the migration remotely.

### Unified Lead Intake Hub - Production Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add unified lead intake hub`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a canonical lead intake service for Website, Twilio, Gmail, manual CRM entry, and future provider adapters.
  - Added duplicate prevention through phone/email normalization, existing customer matching, existing lead matching, provider event IDs, and request fingerprints.
  - Existing customer matches now attach intake activity to Customer 360 without creating duplicate leads.
  - New unmatched accepted intake creates exactly one CRM lead and an actionable follow-up notification.
  - Gmail sync now routes unmatched inbound email into the same lead intake pipeline.
  - Preserved source attribution and sanitized integration sync logging.
  - Added service-level and browser regression coverage for duplicate detection, provider routing, lead creation, customer matching, malformed payloads, provider failures, logging, and UI surfacing.
  - Did not add migrations, modify `.env.local`, activate live Yelp/Google Business Profile/Facebook connectivity, send real customer communications, or weaken authentication/RLS.

### Website Integration Phase 1 - Multi-Brand Live Lead Capture Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add website integration lead capture foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Hardened the signed website lead endpoint for WeatherTech Roofing LLC, WeatherTech Phoenix/Tucson attribution, IHC Painting, and future approved landing pages.
  - Added form-type routing, origin allow-list support, production-disabled gating, attribution and consent preservation, rate-limit/spam controls, and safe integration logging.
  - Added safe environment placeholders and owner setup documentation for server-side HMAC configuration and production activation.
  - Did not modify `.env.local`, activate live public website forms, send customer communications, weaken authentication/RLS, or add destructive migrations.

### Yelp Integration Phase 1 - Multi-Account Lead Intake Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Yelp integration lead intake foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the three-account Yelp foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
  - Preserved the Unified Lead Intake Hub as the canonical pipeline for controlled Yelp intake payloads.
  - Documented official Yelp capability boundaries, including partner-required Leads API, OAuth, and webhook activation.
  - Kept live Yelp sync and outbound replies disabled by default and did not scrape Yelp, store Yelp passwords, send real Yelp messages, modify `.env.local`, or add migrations.

### Google Business Profile Phase 1 - Multi-Location Integration Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Business Profile integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the three-location Google Business Profile foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
  - Preserved the Unified Lead Intake Hub as the canonical pipeline for controlled Google Business Profile dry-run payloads.
  - Documented official Google Business Profile capability boundaries, including account/location APIs, reviews, performance, OAuth, Pub/Sub notifications, discontinued Q&A, and unsupported chat/request-a-quote behavior.
  - Added additive provider constraint migration `0029_google_business_profile_foundation.sql`.
  - Kept live Google Business Profile sync, review replies, and customer messaging disabled by default and did not scrape Google, automate browser login, store Google passwords, send real review replies, modify `.env.local`, weaken authentication/RLS, or perform destructive migrations.

### QuickBooks Online Phase 1 - Accounting Integration Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add QuickBooks Online integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the QuickBooks Online accounting integration foundation for WeatherTech Roofing LLC and IHC.
  - Added official capability documentation, server-only environment placeholders, Integration Center readiness, communications activity language, and duplicate-safe customer, estimate, invoice, and payment export-draft helpers.
  - Added additive provider constraint migration `0030_quickbooks_online_foundation.sql` so integration connections and sync logs can reference `quickbooks_online`.
  - Kept live QuickBooks sync, accounting writes, invoice creation, customer creation, payment processing, and webhook ingestion disabled by default and did not modify `.env.local`, expose credentials, weaken authentication/RLS, or perform destructive migrations.

## Recording Template

### Sprint Name

- Commit: `<full commit hash>`
- Message: `<commit message>`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `<pass/fail>`
  - Type-check: `<pass/fail>`
  - Lint: `<pass/fail>`
  - `git diff --check`: `<pass/fail>`
  - Automated tests: `<pass/fail/not applicable>`
  - Browser validation: `<pass/fail/not applicable>`
- Notes:
  - `<summary>`
