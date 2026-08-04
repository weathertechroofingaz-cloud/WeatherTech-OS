# Production Activation Readiness

This document records the WeatherTech OS production activation foundation. It is a deployment-readiness guide only: it does not deploy the application, enable production credentials, activate live providers, send customer communications, process payments, or change Supabase state.

## Scope

- Sprint: Production Activation & Deployment Readiness
- Owner approval: Approved
- Companies: WeatherTech Roofing LLC and IHC Painting
- Production deployment: not performed by this sprint
- Live integrations: disabled until explicit owner activation
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
- Twilio
- QuickBooks Online
- Electronic Signatures
- Integration Center
- Customer Portal
- Financial workspace

The center reports readiness conservatively. Missing credentials, OAuth setup, pending migration verification, missing webhook configuration, disabled production gates, absent monitoring, or missing regression evidence must not display as green.

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
- Documents: confirm document visibility rules, required-document workflows, and signature provider gates.
- Customer Portal: verify customer-only visibility before public rollout.
- Financial: confirm QuickBooks remains disabled until accounting activation and sandbox approval.
- Communications: confirm no SMS/email/customer messages are sent without owner approval.
- Website: validate HMAC, allowed origins, source IDs, abuse controls, and dry-run intake.
- Monitoring: configure uptime, error, webhook, and provider failure alert destinations.
- Backups: confirm database backup, restore, migration rollback, and launch rollback owners.

## Readiness Verdict

WeatherTech OS is ready for staged internal deployment planning, but it is not ready for broad production activation until owner-controlled credentials, OAuth approvals, provider webhooks, live migration verification, monitoring, backups, and final signed-in regression evidence are complete.
