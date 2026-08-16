# Production Activation Readiness

This document records the WeatherTech OS production deployment and activation controls. It is operational guidance, not authorization to deploy, enable a provider, send a customer communication, process a payment, or change Supabase state.

## Scope

- Current clean baseline: Production Data Isolation & Clean Baseline, completed 2026-08-11
- Owner approval: Completed for that exact isolation/cleanup scope; no broad production activation approval is implied
- Companies: WeatherTech Roofing LLC and IHC Painting
- Production deployment: Vercel at `https://weathertech-os.vercel.app`
- Production database: verified WeatherTech OS Supabase project; migration state must be rechecked before every remote schema action
- Live integrations: individually gated; connection and health status must be reported truthfully
- Stripe: WeatherTech-only payment/webhook/refund foundation exists; IHC remains unmapped and disabled
- Mighty Apes Yelp: implementation, schema, and deployment are complete; official provider testing is blocked by absent Production signing-secret configuration
- Credentials: owner-controlled and never committed

## Production Readiness Center

The application includes a Production Readiness Center under the existing administration navigation. It reviews:

- CRM
- Customer 360
- Dashboard
- Office Operations
- Dispatch
- Inspections
- Jobs
- Documents
- Website and lead intake
- Yelp
- Google Business Profile
- Gmail / Google Workspace
- Google Calendar
- Stripe payments and refunds for WeatherTech Roofing
- Twilio
- QuickBooks Online
- Electronic Signatures
- Integration Center
- Customer Portal
- Financial workspace

The center reports readiness conservatively. Missing credentials, OAuth setup, pending migration verification, missing webhook configuration, disabled production gates, absent monitoring, or missing regression evidence must not display as green.

## Deployment History And Current Production

Production Deployment Phase 1 originally added repository-side preparation for private staging. WeatherTech OS has since been deployed to Vercel at the canonical production URL. Deployment health and activation readiness remain separate: `/api/health` can pass while `/api/readiness` remains blocked by provider-write or owner-approval controls.

The [Private Staging Deployment](./PRIVATE_STAGING_DEPLOYMENT.md) document remains a runbook for a future isolated non-production environment; it is not evidence that such an environment currently exists.

Prepared staging readiness artifacts:

- `GET /api/health` reports only process health and safe deployment metadata.
- `GET /api/readiness` reports dependency readiness and returns a blocked status while activation prerequisites are incomplete.
- Readiness checks distinguish runtime health, dependency readiness, and final production approval.
- Readiness checks never return customer records, database credentials, provider tokens, stack traces, or secret values.
- Provider write flags are reported individually. The current readiness result is blocked because Gmail send, Google Calendar write, and the Twilio inbound gate are enabled while broad `WTOS_PRODUCTION_APPROVED` remains false; the exact WeatherTech Tucson and Phoenix routes have live inbound evidence, while IHC remains unvalidated. Listed public intake, portal, registration, automated-notification, accounting, signature, Twilio outbound, and unrelated provider gates remain disabled or unset.
- The Mighty Apes signing secret is absent. Its receiver is deployed but has not accepted a Production `POST`; this missing secret is an external provider-test blocker, not a reason to weaken readiness or simulate a production lead.
- Staging deployment status is not marked successful unless a real HTTPS staging URL, deployed commit, health check, readiness check, auth configuration, and browser regression evidence exist.

Vercel project credentials and production environment values remain outside the repository. Repository documentation must record only non-secret deployment identity and observed health/readiness results.

## Guided Launch Control

Production Activation Phase 1 adds a launch-control layer to the existing Production Readiness Center. It is a guided owner setup and controlled-test workflow, not a deployment mechanism.

The launch-control model records:

- Ordered activation steps.
- Owner actions.
- Codex responsibilities.
- Required evidence fields.
- Provider prerequisites.
- Three-company and branch mapping guidance.
- Pending migration inventory.
- Environment readiness inventory.
- Controlled-test plans.
- Launch gates.
- Rollback expectations.

### Exact Activation Order

1. Repository and release checkpoint.
2. Supabase production migration validation.
3. Authentication and redirect configuration.
4. Vercel or approved production deployment.
5. Custom production URL.
6. Monitoring, backups, and rollback.
7. Twilio.
8. Gmail / Google Workspace.
9. Google Calendar.
10. Website lead capture.
11. Yelp.
12. Google Business Profile.
13. QuickBooks Online.
14. Electronic signatures.
15. Customer portal, if owner-approved.
16. Controlled internal pilot.
17. Final production-use approval.

The order is intentional: migration and security evidence comes before deployment, production URL setup comes before OAuth redirects and webhooks, provider setup comes before controlled testing, and owner approval comes before daily production use.

### Launch Gates

The launch gates remain blocked until evidence exists.

- Deployment-ready: requires clean repository validation, verified migration inventory, environment readiness, rollback plan, monitoring, and owner approval.
- Ready for provider setup: requires production URL, OAuth redirect URIs, provider credentials, business account IDs, disabled write gates, and rollback ownership.
- Ready for internal pilot: requires signed-in regression, controlled provider tests, company-routing verification, disposable test-data cleanup, monitoring, and owner acceptance.
- Daily production use: requires pilot completion, customer-facing automation approval, support ownership, backup/restore evidence, and final owner approval.

### Production Migration Inventory

Git presence is not production proof. CRM Identity Integrity Phase 1 positively reverified the WeatherTech OS Production project and applied its exact five-file reconciliation chain through `20260814063407_crm_identity_reconciliation_release_hardening.sql`. Live Yelp Lead Intake via Mighty Apes then applied its two additive migrations through `20260815040010_mighty_apes_yelp_audit_lock_privilege.sql` using the same normal linked Supabase path after zero-mismatch preflight. The local and Production ledgers now match all `45/45` committed migrations. This is release evidence, not blanket authorization for a later remote migration; target identity and ledger parity must be rechecked before every future schema action.

Remote verification must positively identify the WeatherTech OS production project, compare the authoritative ledger with the intended local migration set, and stop on any unexpected missing, duplicate, or additional migration.

### CRM Identity Reconciliation Release

- Implementation commit `8ab9f55af5e15ba1706ab71f06ade8312c0f6639` is pushed, deployed, and covered by successful GitHub Actions run `31779710356`.
- The company-partitioned Customer 360 review queue, immutable reconciliation audit ledger, owner/admin-only transactional function, idempotency and stale-version controls, and same-company relationship guards are deployed.
- Isolated hosted lifecycle validation passed `80/80` assertions with zero residue, and the complete isolated browser regression passed `24/24` groups and `29/29` assertions with zero console errors or warnings.
- Production validation was non-destructive: the exact audit table, `12/12` functions, and `39/39` triggers were present; all `41` company-link/reverse-property checks were zero; zero customer rows and zero reconciliation audit entries remained; and all `70/70` pre-existing public-table row counts and canonical full-row SHA-256 fingerprints were unchanged.
- Authenticated read-only production UI validation found the reconciliation surface schema-ready and the WeatherTech/IHC queues company-isolated, with unsafe IHC approval disabled. No production mutation was clicked, and the browser console had zero errors or warnings.
- A real production reconciliation remains an individually reviewed operational action. The owner must identify one exact company-scoped graph; no automatic reconciliation, bulk backfill, or inferred linkage is authorized.

### Mighty Apes Yelp Intake Release

- Implementation commit `103eddab7f464ca9472e8fb8c2b6cc652e7fc89c` is pushed, deployed READY, and covered by successful GitHub Actions run `31865652902`; both jobs passed.
- Production has the exact Mighty Apes schema: one 18-column webhook audit table with 17 constraints, 8 indexes, RLS, one company-scoped read policy, and the immutable-event trigger.
- The transaction RPC remains `SECURITY INVOKER` with an empty fixed search path and service-role-only execution. `anon` and `authenticated` cannot execute it. Authenticated users receive only company-scoped audit reads; service role has only the required select/insert/delete plus column-level `UPDATE(id)` used for row locking, while the immutable trigger rejects actual updates.
- Production contains zero Mighty Apes audit rows, Yelp intake records, Yelp sync logs, Yelp leads, and Yelp integration connections. Captured business/provider fingerprints were unchanged after schema application and read-only verification.
- Production `GET /api/integrations/mighty-apes/yelp/webhook` returns HTTP 405 with `Allow: POST` and no-store caching. No production `POST` was attempted because `MIGHTY_APES_YELP_WEBHOOK_SECRET` is absent.
- Supabase advisors reported only expected unused-index notices on the empty new audit table and no new Yelp security finding.
- This release is not provider-validated. The exact status is: IMPLEMENTATION/SCHEMA/DEPLOYMENT COMPLETE — OFFICIAL PROVIDER TEST EXTERNALLY BLOCKED BY SIGNING-SECRET CONFIGURATION.

### Environment Readiness

Environment readiness must be validated server-side. Browser code must never inspect or display secret values.

Readiness checks classify values as:

- Present.
- Missing.
- Unknown.
- Invalid.
- Disabled safely.
- Enabled, requires approval.

Provider write or send flags should remain disabled until an owner-approved activation step explicitly enables them.

### Company And Branch Mapping

Every live provider must map to the correct business context before activation:

- WeatherTech Roofing LLC - Phoenix.
- WeatherTech Roofing LLC - Tucson.
- IHC Painting.

Unknown mappings are blockers. The system must not infer a provider account, phone number, location ID, realm ID, or website source ID from partial evidence.

### Controlled-Test Rule

Every provider test must use an approved test contact, test account, sandbox mode, or dry-run path where available. Stop immediately if a test routes to the wrong WeatherTech/IHC company, creates duplicate records, sends a real unapproved customer communication, exposes a secret, fails signature/webhook validation, or creates disposable data that cannot be cleaned up.

Ordinary browser/regression tooling must additionally verify an explicitly authorized non-production database identity before seed or cleanup and fail closed on Production Supabase. A synthetic name, localhost, or production credential does not authorize test writes. Purpose-built owner-approved production validations must remain separate and narrowly bounded.

### Owner Responsibilities

The owner controls:

- Production hosting account and deployment approval.
- Supabase project verification and migration deployment approval.
- Provider account ownership.
- OAuth app approval.
- Webhook URL registration.
- Business account IDs and branch/location mappings.
- Production credentials and secret rotation.
- Go-live timing.
- Customer-facing automation approval.

### Codex Responsibilities

Codex may:

- Validate repository state.
- Run local validation and browser regression.
- Inspect non-secret configuration metadata.
- Maintain setup documentation.
- Implement disabled-by-default readiness architecture.
- Report exact blockers and owner actions.

Codex must not:

- Deploy production without explicit owner authorization for that deployment.
- Apply remote migrations unless separately approved with a positively verified project and path.
- Activate providers.
- Send customer communications.
- Commit secrets.
- Guess provider IDs, OAuth configuration, DNS, or credentials.

### Evidence Fields

Every launch step should record:

- Status.
- Date checked.
- Checked by.
- Test record ID.
- Provider account or location label.
- Result.
- Failure reason.
- Required next action.

## Owner Setup Checklist

Before production activation, the owner must verify:

- Production hosting environment variables are populated in the hosting provider, not committed to the repository.
- No provider secret uses a `NEXT_PUBLIC_` prefix.
- Supabase project reference, migration history, RLS behavior, backups, and rollback expectations are verified.
- OAuth redirect URIs match the production domain for Google Workspace, Google Business Profile, QuickBooks Online, DocuSign, Dropbox Sign, and any future OAuth providers.
- Twilio numbers, webhook URLs, messaging compliance, and outbound send gates are explicitly approved.
- Website forms use signed server-to-server delivery from approved domains.
- The Mighty Apes Production signing secret is configured server-side and its official audit-only test succeeds before any claim of provider validation; direct Yelp API/OAuth access remains a separate approval path.
- QuickBooks Online accounting writes and payment behavior remain disabled until an accounting activation sprint.
- Electronic signature providers remain disabled until sandbox signature tests and callback validation are approved.
- Monitoring, alert ownership, backup expectations, and rollback ownership are documented.

## Provider Activation Guides

### Twilio

- Required credentials: Twilio account SID, auth token, messaging service or numbers, approved public callback base URL, and company/branch number mapping.
- OAuth: not used in the current foundation.
- Verified inbound state: the WeatherTech Tucson route, documented only by masked ending `3145`, is exact, active, and live-validated through the signature-authenticated canonical callback with two durable inbound messages and two completed provider events. The WeatherTech Phoenix route, documented only by masked ending `1326`, is also exact, active, and live-validated through that callback with one durable inbound message and one completed provider event.
- Partial inbound state: the IHC route, documented only by masked ending `6930`, remains exact and active at `ready_for_live_test`, with zero inbound messages and zero validation events. Aggregate Twilio readiness therefore remains `ready_for_live_test` even though both WeatherTech routes are individually validated.
- CRM behavior: the WeatherTech live validation messages remained safely unlinked and did not create or modify a customer, lead, or job. No IHC live-message claim has been made.
- Credential handling: the server-only token was securely rotated before live validation and is not stored in Git or `.env.local`.
- Validation boundary: official signed simulations prove application behavior but do not prove carrier ingress or public webhook delivery for an unvalidated route. No scheduled inventory automation remains.
- Compliance and outbound boundary: Twilio shows no A2P Brand or Campaign. All US long-code senders remain unregistered for outbound A2P traffic, and the shared service currently contains WeatherTech and IHC senders, so a single-business campaign must not be submitted without a separately approved company/service-separation design. Outbound SMS is hard-locked in the application and disabled in production with zero sends; voice callbacks, MMS processing, automatic replies, reminders, campaigns, and A2P outbound activation require separate approval.
- Rollback: remove or disable the incoming-message callback, set the inbound gate false, redeploy, and pause the exact connection/number route if errors appear. Keep the outbound gate false.

### Gmail / Google Workspace

- Required credentials: Google OAuth client ID, client secret, redirect URI, token encryption key, public base URL, and approved Workspace domain.
- OAuth: required for mailbox access.
- External approvals: Google Cloud OAuth consent and verification may be required before production use.
- Testing sequence: run readiness endpoint, complete OAuth with a test mailbox, import a small sample, and confirm no send behavior is enabled without approval.
- Rollback: revoke OAuth tokens, pause Gmail connection records, disable send gates, and remove webhook channels.

### Google Calendar

- Required credentials: Google OAuth configuration and approved calendar mapping.
- OAuth: required for calendar access.
- External approvals: Google OAuth verification may be required before production calendar writes.
- Testing sequence: discover calendars, confirm company mapping, validate write-disabled sync, and enable writes only after a separate activation approval.
- Rollback: disable calendar write gate, pause connection records, and remove webhook channels if configured.

### Stripe - WeatherTech Roofing Only

- Current capability: the company-isolated Payment Element, PaymentIntent route, authenticated webhook accounting, and atomic full-refund reconciliation are implemented and production-validated for WeatherTech Roofing.
- Safety boundary: ordinary payment, refund, and webhook-processing gates remain disabled unless an exact owner-approved operation requires temporary activation.
- Company boundary: IHC must remain unmapped and cannot reuse the WeatherTech Stripe account or credentials.
- Future work: do not rebuild the Stripe foundation. Any IHC capability requires its own separately authorized account/configuration and sprint.

### Google Business Profile

- Required credentials: Google Business Profile OAuth app values, Pub/Sub topic, account IDs, and location IDs for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
- OAuth: required.
- External approvals: Business Profile API access and Pub/Sub setup are required.
- Testing sequence: dry-run intake, validate account/location routing, verify duplicate handling, and keep live sync disabled until owner acceptance.
- Rollback: disable sync/review-reply gates, pause connection records, and remove Pub/Sub subscriptions if created.

### Yelp

- Mighty Apes inbound credential: `MIGHTY_APES_YELP_WEBHOOK_SECRET`, configured only as a Sensitive Vercel Production environment variable. It is currently absent.
- Production receiver: `POST https://weathertech-os.vercel.app/api/integrations/mighty-apes/yelp/webhook`.
- OAuth: not used by the approved Mighty Apes inbound receiver. Direct Yelp API/OAuth remains a separate disabled foundation.
- Current boundary: implementation/schema/deployment are complete, but no official provider `lead.test` or real `lead.created` has reached Production. Do not describe the integration as connected, live, or fully production-validated.
- Testing sequence: add the secret, redeploy, run Mighty Apes' Send Test Delivery, prove `lead.test` created audit evidence only, then monitor the first real `lead.created` for exactly-once WeatherTech CRM persistence.
- Rollback: remove or rotate the Mighty Apes Production secret and redeploy. Keep all outbound Yelp messaging disabled; do not delete durable CRM/audit evidence or alter the migration ledger as rollback.

### Website

- Required credentials: website intake enablement, signing secret, allowed origins, and source IDs for each WeatherTech/IHC website path.
- OAuth: not required.
- External approvals: website administrator access and domain ownership are required.
- Testing sequence: run dry-run payload tests, validate HMAC and origin checks, confirm one accepted lead path, and enable production source IDs only after acceptance.
- Rollback: disable website intake gates, remove endpoint wiring from websites, and rotate signing secrets if needed.

### QuickBooks Online

- Required credentials: Intuit OAuth app values, webhook verifier token, and WeatherTech/IHC realm IDs.
- OAuth: required.
- External approvals: Intuit app setup and QuickBooks company admin consent are required.
- Testing sequence: run foundation tests, validate customer/estimate/invoice/payment draft mappings in sandbox, confirm duplicate prevention, and defer accounting writes to a later activation sprint.
- Rollback: disable sync, accounting write, and payment-processing gates; pause connection records; revoke Intuit OAuth tokens.

### Electronic Signatures

- Required credentials: DocuSign and Dropbox Sign OAuth/app values, webhook secrets, redirect URIs, and WeatherTech/IHC account IDs.
- OAuth: required.
- External approvals: provider account/API access, sender identity, and webhook validation setup.
- Testing sequence: validate local signature request draft mapping, run sandbox/test-mode flows, validate callbacks, and enable live requests only after owner approval.
- Rollback: disable provider request/write gates, pause connection records, and keep native signature records intact.

## Deployment Checklist

- Database: verify linked Supabase project, migration history, RLS runtime behavior, backups, and rollback procedure.
- Supabase: confirm production reference, auth settings, storage behavior, and service-role handling.
- Authentication: validate owner/admin, staff, portal, and anonymous access boundaries.
- Integrations: configure credentials outside the repository, validate OAuth, confirm webhooks, and keep live sends/writes disabled until approved.
- Security: verify company isolation, anonymous CRM denial, no committed secrets, and no exposed server credentials.
- Test isolation: verify ordinary regression seed and cleanup fail closed on Production Supabase and use only an explicitly authorized non-production target.
- Documents: confirm document visibility rules, required-document workflows, and signature provider gates.
- Customer Portal: verify customer-only visibility before public rollout.
- Financial: confirm QuickBooks remains disabled until accounting activation and sandbox approval.
- Communications: confirm no SMS/email/customer messages are sent without owner approval.
- Website: validate HMAC, allowed origins, source IDs, abuse controls, and dry-run intake.
- Monitoring: configure uptime, error, webhook, and provider failure alert destinations.
- Backups: confirm database backup, restore, migration rollback, and launch rollback owners.

## Staging Deployment Checklist

- Hosting: owner-approved provider project selected, repository root confirmed, `main` branch selected, and Next.js build command set to `npm run build`.
- Environment: staging variables configured in hosting provider settings, not committed to Git.
- URL: provider-generated HTTPS staging URL recorded in `WTOS_STAGING_URL` and `NEXT_PUBLIC_APP_URL`.
- Supabase: project reference, migration history, RLS behavior, and auth redirect URLs verified.
- Health: `/api/health` returns `200` and reports process health only.
- Readiness: `/api/readiness` returns truthful `ready`, `warning`, or `blocked` state without exposing secrets or records.
- Browser: signed-in staging regression covers Dashboard, Customer 360, Leads, Estimates, Jobs, Inspections, Dispatch, Documents, Communications, Integration Center, Production Readiness Center, Website & Marketing, Financial workspace, provider-disabled states, and mobile smoke coverage.
- Safety: live provider writes, public intake, public registration, customer portal, accounting writes, calendar writes, signature requests, and customer notifications remain disabled.
- Rollback: previous deployment, disabled-provider flags, Supabase backup expectations, test-record cleanup, and rollback owner are documented.

## Readiness Verdict

WeatherTech OS is deployed, its production runtime is healthy, its evidence-proven regression contamination has been removed, and ordinary write-capable browser regression fails closed against Production Supabase. Production matches all `45/45` committed migrations. CRM Identity Integrity Phase 1 remains complete without a production business-graph change. Live Yelp Lead Intake via Mighty Apes is implementation/schema/deployment complete, but official provider testing is externally blocked by absent signing-secret configuration; Production has zero related audit, intake, sync-log, lead, and connection rows. The inbound-only Twilio implementation remains deployed: WeatherTech Tucson and WeatherTech Phoenix ending `1326` are individually live-validated, while IHC is exact and active at `ready_for_live_test` without live-message evidence. Phoenix carrier-ingress validation is complete; aggregate Twilio readiness remains `ready_for_live_test` solely because IHC is unvalidated. Provider activation remains partial. `/api/health` returns HTTP 200 at the exact deployed SHA, while `/api/readiness` truthfully returns HTTP 503 because Gmail send, Google Calendar write, and Twilio inbound are enabled while broad production-write approval remains false. Twilio and Yelp outbound messaging remain disabled; truthful provider health, monitoring, backup evidence, and explicit owner activation decisions remain required.
