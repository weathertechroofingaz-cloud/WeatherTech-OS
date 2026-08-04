# Yelp Integration Phase 1 Setup

This document records the verified Yelp capability boundary and the WeatherTech OS application-side foundation for future Yelp lead intake.

## Status

- Sprint: Yelp Integration Phase 1 - Multi-Account Lead Intake Foundation
- Application functionality: implemented for provider registry routing, controlled dry-run/manual payloads, duplicate checks, Customer 360 intake activity, follow-up creation, and sanitized integration logging.
- Live Yelp lead sync: disabled by default.
- Outbound Yelp messaging: disabled by default.
- Production activation: requires owner-controlled Yelp approval, OAuth credentials, webhook setup, business account authorization, and signed end-to-end testing.

## Verified Official Yelp Capabilities

Official Yelp documentation separates public business/profile capabilities from restricted lead and conversation capabilities:

- Yelp Places/Fusion business APIs can support business search and profile lookup for approved API keys.
- Yelp review APIs provide limited review excerpts and may require Enhanced or Premium plan access.
- Yelp Leads API is designed for Request-a-Quote lead ingestion, lead event reading, and replies, but requires Yelp partner approval, OAuth, eligible advertising or business setup, and webhook subscriptions.
- Yelp webhooks for leads are available only through the official Leads API/partner setup path.
- Yelp OAuth Authorization Code flow is the documented authorization model for Leads API access.
- Yelp partner APIs are disabled by default and reserved for contracted partners.
- The Leads API documentation states that Message the Business profile messages are not eligible for this Leads API path.
- Masked email is a Yelp-supported communication path for eligible lead conversations, but it has limitations and should not be treated as equivalent to first-party API access.

Primary references:

- [Yelp Partner Integration Guide](https://docs.developer.yelp.com/docs/partner-integration-guide)
- [Yelp Leads API](https://docs.developer.yelp.com/docs/leads-api)
- [Yelp Webhooks](https://docs.developer.yelp.com/docs/webhooks)
- [Yelp Lead Webhooks](https://docs.developer.yelp.com/docs/leads-webhooks)
- [Yelp Reviews API](https://docs.developer.yelp.com/reference/v3_business_reviews)
- [Yelp Partner APIs](https://docs.developer.yelp.com/docs/yelp-partner-apis)
- [Yelp OAuth Authorization Code Workflow](https://docs.developer.yelp.com/docs/authorization-code-workflow)

## Account Mapping

WeatherTech OS supports three Yelp account slots through the provider registry:

| Registry key | Company | Branch | Purpose |
| --- | --- | --- | --- |
| `weathertech-phoenix` | WeatherTech Roofing LLC | Phoenix | Phoenix roofing lead intake and Request-a-Quote review |
| `weathertech-tucson` | WeatherTech Roofing LLC | Tucson | Tucson roofing lead intake and Request-a-Quote review |
| `ihc` | IHC Painting | IHC | Painting lead intake and Request-a-Quote review |

Routing must use trusted provider account or business identifiers. Customer-entered text alone must not silently assign a lead to a company.

## Server-Side Environment Placeholders

Placeholders are documented in `.env.example`. They must be configured only in server-side hosting settings or a secure secrets manager.

Global placeholders:

- `YELP_API_KEY`
- `YELP_CLIENT_ID`
- `YELP_CLIENT_SECRET`
- `YELP_REDIRECT_URI`
- `YELP_PARTNER_ID`
- `YELP_WEBHOOK_SECRET`
- `YELP_LIVE_SYNC_ENABLED=false`
- `YELP_OUTBOUND_MESSAGING_ENABLED=false`
- `YELP_PRODUCTION_ENABLED_ACCOUNT_IDS`
- `YELP_LEAD_CAPTURE_SECRET`

Per-account placeholders:

- `YELP_ACCOUNT_ID_WEATHERTECH_PHOENIX`
- `YELP_ACCOUNT_ID_WEATHERTECH_TUCSON`
- `YELP_ACCOUNT_ID_IHC`
- `YELP_BUSINESS_ID_WEATHERTECH_PHOENIX`
- `YELP_BUSINESS_ID_WEATHERTECH_TUCSON`
- `YELP_BUSINESS_ID_IHC`
- `YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX`
- `YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_TUCSON`
- `YELP_LEAD_CAPTURE_SECRET_IHC`
- `YELP_LIVE_SYNC_ENABLED_WEATHERTECH_PHOENIX=false`
- `YELP_LIVE_SYNC_ENABLED_WEATHERTECH_TUCSON=false`
- `YELP_LIVE_SYNC_ENABLED_IHC=false`
- `YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_PHOENIX=false`
- `YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_TUCSON=false`
- `YELP_OUTBOUND_MESSAGING_ENABLED_IHC=false`

Do not add Yelp usernames or passwords. Do not expose these values with `NEXT_PUBLIC_`.

## Implemented Application Foundation

The foundation intentionally uses the existing Unified Lead Intake Hub:

- Yelp account registry and account-to-company routing.
- Controlled payload normalization into the canonical lead intake format.
- Phone and email normalization through existing duplicate-detection logic.
- Existing customer matching without creating duplicate leads.
- Existing lead/provider ID duplicate detection.
- New unmatched intake path that creates one lead and one follow-up when production intake is enabled.
- Safe route-level audit logging for rejected or skipped signed submissions.
- Sanitized integration log summaries that avoid raw credentials, raw tokens, and unnecessary full-message storage.
- Integration Center provider readiness copy that does not claim live connectivity.
- Website & Marketing/Lead Intake surfaces that describe Yelp as manual/dry-run or partner-required.

## Disabled Live Boundary

The `/api/leads/yelp` route supports dry-run previews and signed test payloads, but non-dry-run production posts are rejected with `production_disabled` unless all live gates are enabled:

- global `YELP_LIVE_SYNC_ENABLED=true`
- matching per-account `YELP_LIVE_SYNC_ENABLED_* = true`
- account included in `YELP_PRODUCTION_ENABLED_ACCOUNT_IDS` when an allow-list is supplied
- valid request signature
- Yelp partner/OAuth/business setup verified by the owner

This keeps the app-side architecture testable without pretending that live Yelp access exists.

## Manual Fallback

Until Yelp partner access is approved, authorized office users may use existing manual lead intake paths and select Yelp/source-account context where supported. Manual intake must still route through the canonical Lead Intake service so duplicate detection, Customer 360 activity, follow-up creation, and integration logging remain consistent.

Manual fallback is not live API access and must not be represented as a connected Yelp account.

## Gmail Notification Fallback

Yelp-related emails may be received in an authorized company Gmail mailbox, but email intake must remain conservative:

- Require trusted mailbox rules and sender verification.
- Preserve Gmail as the provider source when the message arrived through Gmail.
- Treat uncertain messages as review-required.
- Avoid brittle full-email scraping.
- Preserve any reliable Yelp account or business identifier when present.
- Prevent duplicate intake through provider identifiers and request fingerprints.

Email forwarding is not a substitute for official Yelp Leads API access.

## Outbound Messaging Boundary

WeatherTech OS does not send Yelp replies in this phase.

Outbound replies require official Leads API write access, OAuth business authorization, account routing, idempotency, logging, and explicit owner activation. Until then:

- `YELP_OUTBOUND_MESSAGING_ENABLED=false`
- no functional Yelp Send action is exposed
- follow-up actions should direct staff to review or respond in Yelp Business when required

## Production Activation Checklist

Before live Yelp lead ingestion can be enabled:

- Confirm Yelp partner approval and Leads API access.
- Confirm Request-a-Quote eligibility and business subscription state for all three accounts.
- Create or update the Yelp developer app.
- Confirm OAuth client ID, client secret, redirect URI, and approved scopes.
- Authorize each Yelp business account.
- Subscribe each approved business to lead webhooks.
- Configure server-side environment variables in hosting.
- Run dry-run previews for Phoenix, Tucson, and IHC.
- Run one signed non-production endpoint test per account.
- Confirm dedupe, Customer 360 activity, follow-up creation, and integration logs.
- Enable live flags only after owner approval.
- Monitor integration logs after activation.

## Security Rules

- Do not scrape Yelp.
- Do not automate Yelp browser login.
- Do not use private Yelp endpoints.
- Do not store Yelp usernames or passwords.
- Do not commit Yelp secrets.
- Keep provider credentials server-side.
- Do not weaken Supabase RLS or authentication.
- Do not log raw tokens, passwords, or unnecessary full payloads.
- Do not send real Yelp messages from tests.

## Validation

Run the standard project validation plus Yelp-specific tests:

```bash
npm run type-check
npm run lint
npm run build
git diff --check
node tests/yelp-integration-foundation.test.mjs
node tests/lead-intake-routing.test.mjs
node tests/unified-lead-intake-service.test.mjs
```

Browser validation should cover:

- Yelp Integration Center status.
- three-account display.
- approval-required and live-sync-disabled states.
- controlled Yelp intake/dry-run behavior.
- duplicate Yelp lead handling.
- Customer 360 intake visibility.
- existing Twilio, Gmail, Google Calendar, Website, CRM, and Lead Intake workflows.

## Intentionally Deferred

- Live Yelp OAuth flow.
- Live Yelp webhook subscription.
- Polling live Yelp lead/conversation endpoints.
- Outbound Yelp replies.
- Yelp Business Profile management.
- Yelp review-response automation.
- Live Yelp credential storage.
- Production activation of any Yelp account.
