# Changelog

This changelog records verified WeatherTech OS repository milestones. Future entries should be concise and reference the commit that shipped the change.

## Latest Verified Release

### WeatherTech Tucson Inbound Voice Forwarding Phase 1

- Implementation commit: `0ed7b07c3ee45d77508890dfda8d5f45b1cc1ef0`
- PR and merge commit: PR #14, `2ace30ba04edfb0743b63ee050c7f3845540fe54`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Status: COMPLETED — MERGED, EXACT-SHA CI-VALIDATED, TUCSON-ONLY PRODUCTION DEPLOYED, AND OWNER LIVE-CALL VALIDATED.
- Capability: added signed WeatherTech Tucson inbound voice forwarding to an owner-configurable protected destination. Only the exact active Tucson route can return SDK-generated `<Dial>` TwiML; malformed destinations, configured-number/self loops, wrong accounts, wrong receiving numbers, Phoenix/IHC routes, ambiguous mappings, and cross-company connections fail closed. Changing the destination requires protected environment configuration and a redeploy, not an application-code change or number reassignment.
- Database: no migration was required. The existing `call_records` and `communication_provider_events` schema stores bounded, idempotent, company- and route-scoped evidence. Local and Production migration ledgers remain exact at `51/51`, with no local-only or Production-only migration.
- CI and deployment: exact implementation-SHA PR run `32802756048` completed successfully with repository job `97666732131`. Exact merge-SHA main run `32802962484` completed successfully with repository job `97667369745` and protected isolated-Supabase lifecycle job `97667830543`. Gate-on Vercel Production deployment `dpl_BzukHpKwCH1HTWqNMHyxJsNLrAx6` is healthy at merge SHA `2ace30ba04edfb0743b63ee050c7f3845540fe54`; canonical `/api/health` returned HTTP 200 with that SHA.
- Live Production evidence: the owner intentionally completed two Tucson inbound calls of 15 and 18 seconds and confirmed two-way audio. Production contains the two exact completed inbound call records plus two `voice_inbound` and two `voice_status` events. Both calls have complete signed ingress/status evidence, bounded durations, no customer, lead, job, recording, or transcript link, and no raw forwarding destination in stored metadata summaries.
- SMS and isolation regression: Tucson inbound SMS remains at two messages/two events, Phoenix remains at one/one, and IHC remains at zero/zero. Tucson alone is `sms_voice`; Phoenix and IHC remain exact, active, distinct SMS-only routes. No outbound SMS, no outbound call independent of the active inbound caller, no Twilio REST call, no outbound call record, no automatic reply, no automatic lead/customer/job creation, no recording, no transcription, and no recording-status event occurred.
- Safety and external boundary: the Tucson customer-facing Twilio number was preserved; no Verizon, AT&T, Twilio, or destination number was purchased, ported, reassigned, released, or replaced. Broad `/api/readiness` remains truthfully HTTP 503 while `WTOS_PRODUCTION_APPROVED=false`; IHC live inbound validation, A2P registration, outbound messaging, Phoenix/IHC or broader voice routing, MMS, automation, and unrelated providers remain separately gated. The proposal electronic-record/customer disclosure still requires legal review before the first real customer electronic-signature delivery.

## Recent Verified Milestones

### Proposal-to-Sold Job Operational Completion Phase 1

- Implementation commit: `b694ad844af48fb23d1849f3180382a016056441`
- Merge and Production implementation deployment commit: `7186001eec28177a32b454168e5fd05b43af9937`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Status: COMPLETED — MERGED, EXACT-SHA DEPLOYED, ADDITIVE PRODUCTION MIGRATION APPLIED, AND PRODUCTION-SAFE VALIDATED.
- Capability: completed the owner-controlled path from an approved estimate through immutable customer-safe proposal finalization, native one-time-link electronic signing, signed-document and receipt recovery, deposit-invoice gating, recorded-deposit verification, and company-scoped sold-job conversion. Finalized and signed evidence is immutable, idempotent, and bound to the exact customer, property, estimate, revision, selections, total, terms, document, and company.
- Database: applied only `20260824044610_native_proposal_esign_sold_job_gate.sql`, SHA-256 `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`. Local, regression, and Production migration ledgers match at `51/51`; the additive migration did not backfill or mutate an existing proposal, document, payment, signature, invoice, job, or Storage object.
- Validation: all `42/42` top-level tests, type-check, lint, Production build, dependency audit with zero vulnerabilities, migration-integrity and protected-file checks passed. Targeted native-signing Browser run `20260824223608414` passed both deposit and no-deposit paths, including signed-session renewal and exact receipt recovery. Complete isolated Browser run `20260824231426642` passed `24/24` groups and `31/31` assertions with zero console errors, zero console warnings, bounded cleanup, and independently verified zero residue. GitHub Actions run `32790490435` passed repository-only job `97630910053` and protected isolated-Supabase lifecycle job `97631410575` at the exact merge SHA.
- Production evidence: GitHub/Vercel Production deployment `6073515066`, status `17277113969`, completed successfully for exact SHA `7186001eec28177a32b454168e5fd05b43af9937`, and canonical `/api/health` returned HTTP 200 with that SHA. `/api/readiness` remained truthfully HTTP 503 solely under the unchanged owner/provider safety flags, with no readiness warnings. Production-safe post-deployment validation was read-only.
- Safety and activation boundary: no proposal or signature request was sent to a real customer; no real acceptance, deposit, payment, invoice, or sold job was created for validation. DocuSign, Dropbox Sign, payment processors, QuickBooks Online writes, automatic customer communications, and customer-facing portal authentication remain disabled or separately gated; this release does not activate a customer portal.
- Legal gate: Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This is an operational go-live gate; it does not authorize Codex to invent, rewrite, approve, or represent the legal sufficiency of that language.

### Lead Attribution & Marketing Accountability Phase 1

- Implementation commit: `ba816c2bad315f7ef85051bb3e247f2f965f50b6`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Status: COMPLETED — IMPLEMENTED, PUSHED, DEPLOYED, PRODUCTION MIGRATIONS APPLIED, AND READ-ONLY PRODUCTION VALIDATED.
- Capability: added locked first-touch acquisition attribution with source/provider separation, explicit lead ownership, transactional funnel events, structured won/lost outcomes, same-company repeat opportunities, owner/admin monthly spend entry, and a Phoenix-month Marketing Accountability dashboard with truthful unavailable denominators and visible data-quality gaps.
- Database: the exact owner-approved three-migration additive chain is applied in Production, bringing local, regression, and Production ledgers to `48/48`. The four business tables plus internal non-PII operation-receipt table contain zero Production rows; the ten owner-identified test leads and ten intake rows remain unchanged and unbackfilled.
- Validation: all `33/33` top-level tests, `307/307` Phase 1 foundation assertions, `183/183` hosted lifecycle assertions, type-check, lint, build, dependency audit, migration integrity, secret and scope checks passed. Browser runs `20260816165039517`, `20260816171149423`, and `20260816171236859` passed; the complete run covered `24/24` groups and `30/30` assertions with zero console errors, zero warnings, and zero residue. GitHub Actions run `32073345029` passed both jobs.
- Production evidence: Vercel deployed the exact implementation SHA and canonical `/api/health` returned HTTP 200 with it. The original 72-table, 277-row fingerprint remains `9750d6d890554fb766f3e5379d6ca49f`; all new tables are empty and existing provider mappings, events, fingerprints, and gates are unchanged.
- Safety: `/api/readiness` remains truthfully HTTP 503 under existing broad owner/provider approval controls. No synthetic Production data, attribution backfill, fake spend, provider activation, outbound message, environment change, protected migration change, or `.env.local` change occurred.
- Operational boundary: Production has no real Phase 1 accountability or spend evidence yet. The dashboard must not be used as historical marketing truth until real intake and owner-entered spend generate defensible data.

### Live Yelp Lead Intake via Mighty Apes

- Implementation commit: `103eddab7f464ca9472e8fb8c2b6cc652e7fc89c`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Status: IMPLEMENTATION/SCHEMA/DEPLOYMENT COMPLETE — OFFICIAL PROVIDER TEST EXTERNALLY BLOCKED BY SIGNING-SECRET CONFIGURATION.
- Capability: added the public server-side Mighty Apes endpoint at `/api/integrations/mighty-apes/yelp/webhook`, exact raw-body HMAC and replay validation, audit-only `lead.test`, and atomic WeatherTech-only `lead.created` intake with stable provider-ID idempotency, immutable non-PII delivery evidence, normal CRM visibility, and no fabricated email.
- Database: the two additive migrations are applied in Production, bringing local and Production migration ledgers to `45/45`. Exact inspection found the 18-column audit table, 17 constraints, 8 indexes, company-scoped RLS, immutable trigger, and service-role-only `SECURITY INVOKER` RPC. Production contains zero Mighty Apes/Yelp audit, intake, sync-log, CRM lead, or connection rows; captured business/provider fingerprints were unchanged.
- Validation: GitHub Actions run `31865652902` passed both jobs; hosted isolated and complete browser regression gates passed with zero residue; the exact implementation commit is deployed READY; `/api/health` is HTTP 200 with the exact SHA; and the production endpoint safely returns HTTP 405 to `GET` with `Allow: POST` and no-store caching.
- External boundary: `MIGHTY_APES_YELP_WEBHOOK_SECRET` is absent from Vercel Production, so no production `POST`, official provider `lead.test`, or real `lead.created` was attempted. The integration must not be called connected, live, or fully production-validated.
- Owner action: add `MIGHTY_APES_YELP_WEBHOOK_SECRET` as a Sensitive Vercel Production variable, redeploy, then run Mighty Apes' Send Test Delivery. The first real `lead.created` remains a future evidence step.
- Safety: `/api/readiness` remains truthfully blocked with HTTP 503; no outbound Yelp communication, unrelated provider activation, broad production approval, synthetic production CRM data, protected migration change, or `.env.local` change occurred.

### WeatherTech Phoenix Twilio Inbound Activation And Live Validation Follow-Up

- Status: configuration and carrier-ingress validation complete for the Phoenix inbound-only route.
- WeatherTech Phoenix, documented only by masked ending `1326`, was assigned to the same directly inspected shared Messaging Service as the existing Tucson and IHC senders, added to the exact WeatherTech Production environment mapping, activated as a company-scoped inbound-only route, and validated through the signature-authenticated canonical production webhook.
- Existing Tucson and IHC sender-pool membership, exact company routes, and the canonical production webhook were preserved. The unused second Messaging Service remains empty.
- Tucson retains two received inbound messages and two completed provider events. Phoenix has exactly one received inbound message and one completed provider event, with exact-once persistence and no customer, lead, or job mutation. IHC remains at zero messages/events; all routes have zero outbound SMS and zero voice/call activity.
- Twilio shows no A2P Brand or Campaign. The senders are therefore not registered for outbound US A2P traffic; no compliance approval or outbound capability is claimed.
- No application code, schema migration, environment, or provider configuration change was required for the live verification. `/api/health` remained HTTP 200, aggregate Twilio readiness remained `ready_for_live_test` solely because IHC lacks evidence, `/api/readiness` remained truthfully HTTP 503, `.env.local` was untouched, and no scheduled inventory search was created.

### CRM Identity Integrity Phase 1 — Customer & Property Reconciliation

- Implementation commit: `8ab9f55af5e15ba1706ab71f06ade8312c0f6639`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Status: completed after isolated and production-schema validation, with no production business-record reconciliation.
- Capability: the Customers/Customer 360 workflow now provides company-partitioned exact-evidence review, explicit graph selection, owner/admin approval, transactional and idempotent reconciliation, immutable audit history, and fail-closed handling for stale, ambiguous, insufficient, or cross-company input.
- Database: the exact five-migration chain is applied through the normal linked Supabase path, with isolated regression and Production ledgers at `43/43` committed migrations. All `41` company-link/reverse-property checks were zero, Production remained at zero customers and zero reconciliation audit entries, and all `70/70` pre-existing public-table row counts and canonical full-row SHA-256 fingerprints were unchanged.
- Validation: `28/28` top-level test files, `80/80` isolated hosted assertions, targeted browser checks, the complete `24/24`-group and `29/29`-assertion isolated browser suite, type-check, lint, production build, dependency audit, migration integrity, GitHub Actions run `31779710356`, and deployment/health checks passed. An authenticated read-only production UI check found the reconciliation surface schema-ready and company-isolated with unsafe IHC approval disabled, no mutations, and zero console errors or warnings.
- Safety: no automatic backfill, bulk merge, destructive migration, provider write, or production graph mutation occurred. A future production reconciliation requires one exact owner-selected company-scoped graph.

### Production Connections Phase 1: Twilio/SMS — Owner-Accepted Closeout

- Implementation commit: `e7a5a57f42f3d9dfc482d6b412af9768cf31af94`
- Production checkpoint before this documentation update: `ecaf3f77337160ba165bb1e330271c0fa145110f`
- Inventory-blocker checkpoint: `5c1bb7538a023b11606532a1b555b91905b6df42`
- Status: completed by explicit owner acceptance with documented external follow-up; provider activation remains partial.
- Verified state: WeatherTech Tucson, documented only by masked ending `3145`, is mapped and live-validated with exactly one received SMS record and one completed provider event. IHC, documented only by masked ending `6930`, is mapped and active with readiness `ready_for_live_test`, but has zero received messages and zero validation events.
- Historical closeout boundary: at this checkpoint WeatherTech Phoenix was unconfigured because no owner-approved eligible number was available. No number purchase, number assignment, or provider/database configuration changed during that inventory check, and no scheduled inventory automation remained. The later owner-authorized activation follow-up above supersedes this operational state without changing the historical closeout evidence.
- Validation boundary: official signed simulations verify application behavior but cannot prove carrier ingress, Twilio number ownership, sender-pool attachment, or public webhook delivery for an unowned number. Governance closeout does not constitute WeatherTech Phoenix or IHC live validation or broad provider activation.
- Safety: outbound remains hard-locked and disabled with zero outbound SMS, and global readiness truthfully remains HTTP 503 because Gmail send, Google Calendar write, and Twilio inbound are enabled while broad production-write approval remains false.
- Runbook: [Twilio Phase 1 Setup](./docs/TWILIO_PHASE_1_SETUP.md).

### Non-Production Regression Environment & CI Test-Data Lifecycle

- Implementation commit: `6354429976fb7a549bbc738fc0b76b3c5ea2022b`
- Closeout: documentation-only commit containing this entry; use Git history as its immutable hash because a commit cannot contain its own hash.
- Status: Completed after isolated schema provisioning, a complete 24-group/28-assertion browser pass, zero console errors or warnings, deterministic cleanup with zero residue, successful repository and protected CI validation, push, exact-commit deployment, and read-only production verification.
- Approved scope: dedicated non-production Supabase regression architecture, fail-closed target identity, synthetic test-data ownership and cleanup, safe CI lifecycle checks, and reproducible operating documentation.
- Runbook: [Non-Production Regression Environment](./docs/NON_PRODUCTION_REGRESSION_ENVIRONMENT.md).

### Production Data Isolation & Clean Baseline

- Implementation commit: `c57698786e83732e49b8cb4ace83e3128539b28f`
- Closeout: documentation-only commit containing this entry; use Git history as the immutable hash because a commit cannot contain its own hash.
- Status: Completed after guarded production cleanup, full safe repository validation, push, exact-commit deployment, signed-in read-only production smoke, final database counts, and protected-file hash verification.
- Approved scope: fail-closed automated-test target isolation, evidence-backed removal of proven synthetic production records, trustworthy operational aggregates, regression coverage, and narrowly reconciled governance/documentation.
- Evidence record: [Production Data Isolation And Clean Baseline](./docs/PRODUCTION_DATA_ISOLATION_AND_BASELINE.md).

### Production Connections Phase 1 - Verified Production Foundation

- Release checkpoint: `68943206451322de3ae6bdbcbe497f8117290e19`
- Summary:
  - Verified the production Supabase, document storage, Gmail, Google Calendar, GoHighLevel, Vercel, and WeatherTech-only Stripe checkpoints completed under owner-controlled gates.
  - Completed the company-isolated Stripe Payment Element, webhook accounting, atomic refund reconciliation, and owner refund surface for WeatherTech Roofing.
  - Kept IHC Stripe, Twilio/SMS, QuickBooks, and unrelated providers unactivated.

### AI Command Center 3.0 - Operating Brain

- Commit: `8f6fda8f12ce7808bb9b3c4669cc8f0d120656b6`
- Message: `feat: add ai command center operating brain`
- Summary:
  - Added executive recommendations, advisor modes, company-scoped operating context, grounded responses, and approval-gated behavior to the existing AI workspace.
  - AI Command Center 3.0 is implemented and is not a future rebuild item.

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
