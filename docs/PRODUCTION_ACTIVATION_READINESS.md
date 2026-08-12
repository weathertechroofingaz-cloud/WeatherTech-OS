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
- Provider write flags are reported individually. The current readiness result is blocked because Gmail send and Google Calendar write are enabled pending owner review; listed public intake, portal, registration, automated-notification, accounting, signature, and unrelated provider gates remain disabled or unset.
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

Git presence is not production proof. At the Production Data Isolation sprint starting checkpoint, the linked production ledger had been verified through `20260810225320_stripe_refund_reconciliation.sql`. That observation must be rechecked before a later remote migration; it is not blanket authorization to apply pending files.

Remote verification must positively identify the WeatherTech OS production project, compare the authoritative ledger with the intended local migration set, and stop on any unexpected missing, duplicate, or additional migration.

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
- Yelp partner or approved business API access is confirmed before any live Yelp sync.
- QuickBooks Online accounting writes and payment behavior remain disabled until an accounting activation sprint.
- Electronic signature providers remain disabled until sandbox signature tests and callback validation are approved.
- Monitoring, alert ownership, backup expectations, and rollback ownership are documented.

## Provider Activation Guides

### Twilio

- Required credentials: Twilio account SID, auth token, messaging service or numbers, approved public callback base URL, and company/branch number mapping.
- OAuth: not used in the current foundation.
- External approvals: Twilio account ownership, phone-number ownership, messaging compliance, sender verification, webhook URL approval.
- Testing sequence: run readiness checks, validate signed webhook payloads, test inbound SMS/voice with approved contacts, then request explicit owner approval before outbound messaging.
- Rollback: remove webhook URLs in Twilio, disable outbound gates, and pause connection records if errors appear.

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

- Required credentials: Yelp approved API/partner access, OAuth/client credentials where available, business/account IDs, webhook secret, and shared intake secret.
- OAuth: depends on approved Yelp partner access path.
- External approvals: Yelp partner or approved business lead access is required for live lead conversations.
- Testing sequence: dry-run intake, validate routing and duplicate prevention, run signed endpoint tests, and keep live sync disabled until access and owner approval are complete.
- Rollback: disable live sync and outbound messaging gates, pause connection records, and remove webhook subscriptions if configured later.

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

WeatherTech OS is deployed, its production runtime is healthy, its evidence-proven regression contamination has been removed, and ordinary write-capable browser regression now fails closed against Production Supabase. It is not broadly production-activated merely because runtime and baseline checks pass. `/api/readiness` remains blocked by provider-write/owner-approval controls; truthful provider health, monitoring, backup evidence, and an explicit owner activation decision remain required.
