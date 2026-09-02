# Yelp Integration Phase 1 Setup

This document records both the earlier direct-Yelp application foundation and the deployed, inbound-only Mighty Apes Yelp lead receiver. The two paths have different contracts and activation boundaries and must not be represented as interchangeable.

## Status

- Completed sprint: Live Yelp Lead Intake via Mighty Apes.
- Status: IMPLEMENTATION/SCHEMA/DEPLOYMENT COMPLETE — OFFICIAL PROVIDER TEST AND REAL-LEAD EVIDENCE NOT YET RECORDED.
- Implementation commit: `103eddab7f464ca9472e8fb8c2b6cc652e7fc89c`; deployed READY at `https://weathertech-os.vercel.app`.
- Historical deployed receiver: `POST https://weathertech-os.vercel.app/api/integrations/mighty-apes/yelp/webhook`.
- Pending canonical receiver: after the current reviewed release is deployed, Mighty Apes should use `POST https://weathertech-os.vercel.app/api/integrations/mighty-apes/webhook`. The historical path remains a compatibility alias to the same handler so an existing provider configuration is not broken during the transition.
- Schema checkpoints: the original Yelp release was exact at `48/48`. Production is now exact at `51/51`; the reviewed AI/automation/Mighty release set is `65/65` in the repository and on the isolated regression target but has not been applied to Production.
- Production evidence: at the original release checkpoint, `GET` on the historical receiver safely returned HTTP 405 with `Allow: POST` and no-store caching. No Production `POST`, official provider test, real Yelp lead, or Mighty Apes/Yelp audit/intake/sync-log/lead row has since been recorded.
- Required secret: current server-side readiness redacts `MIGHTY_APES_YELP_WEBHOOK_SECRET` as present. Its value was not read; it must remain server-only and must be reverified with the exact deployed revision before an official provider test.
- Outbound Yelp messaging: not implemented and disabled.
- Separate legacy foundation: `/api/leads/yelp` and its direct Yelp API/OAuth gates remain disabled and are not activated by the Mighty Apes receiver.

## Verified Mighty Apes Contract

- Method and content type: `POST` with `Content-Type: application/json`.
- User agent: `MightyApes-Webhook/1`.
- Signature: `X-MightyApes-Signature: sha256=<HMAC-SHA256 of the raw body>`.
- Replay controls: `X-MightyApes-Timestamp` is a Unix timestamp within the accepted five-minute window; `X-MightyApes-Delivery` is tracked as immutable delivery evidence.
- Payload: version `1`, event `lead.test` or `lead.created`, exact approved campaign Yelp ID, campaign name, and a lead object containing stable `lead.id`, name, E.164 phone, ZIP, optional job category, multiline message, and provider `created_at`. Yelp supplies no email.
- Routing: the signed campaign identity is resolved through the server-owned company/location registry. Only the previously verified WeatherTech Phoenix campaign is seeded and enabled. Tucson and IHC have no inferred campaign identity and fail closed until authoritative IDs are supplied and separately enabled. Request fields cannot select a company or location.
- `lead.test`: authenticated tests record non-sensitive immutable audit evidence only. They create no CRM lead, salesperson task, customer, notification, communication, or sync-log row.
- `lead.created`: one transaction creates or replays exactly one WeatherTech CRM lead, unified intake record, integration sync log, in-app notification, and immutable delivery event. The centralized automation rule then creates the normal company/location-bound internal qualification task exactly once. Stable provider lead ID, delivery locks, and event idempotency prevent duplicate or concurrent creation.
- Audit boundary: raw bodies, HMAC signatures, secrets, customer name, phone, ZIP, and questionnaire text are not stored in the webhook audit ledger or request-summary logs.

## Separate Direct Yelp API Capability Boundary

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

For the Mighty Apes receiver, these display slots are not authorization. Migration `20260902024804_automation_engine_foundation.sql` creates the company/location-bound campaign registry and seeds only the already verified Phoenix route. Tucson and IHC remain absent and fail closed pending authoritative provider IDs and an explicit enablement decision.

## Server-Side Environment Placeholders

Placeholders are documented in `.env.example`. They must be configured only in server-side hosting settings or a secure secrets manager.

Mighty Apes receiver placeholder:

- `MIGHTY_APES_YELP_WEBHOOK_SECRET`

This value alone authenticates the approved inbound Mighty Apes path. It does not activate direct Yelp API/OAuth features or outbound messaging.

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

- Dedicated Mighty Apes raw-body HMAC receiver and strict version/event/payload validator.
- Company/location registry routing that seeds only the verified Phoenix campaign and refuses request-selected, unregistered, disabled, or cross-company assignment.
- Immutable, company-scoped, non-PII webhook delivery evidence.
- Atomic and concurrency-safe provider lead deduplication through the existing `lead_intake_records` provider identity.
- Audit-only authenticated `lead.test` behavior.
- Normal Leads and Unified Inbox visibility for a valid `lead.created`, with no fabricated email.
- Yelp account registry and account-to-company routing.
- Controlled payload normalization into the canonical lead intake format.
- Phone and email normalization through existing duplicate-detection logic.
- Existing customer matching without creating duplicate leads.
- Existing lead/provider ID duplicate detection.
- New unmatched intake path that creates one lead and one follow-up when production intake is enabled.
- Legacy-schema correction in `20260902043624_mighty_apes_legacy_service_routing_correction.sql`, which propagates the registry-owned location and requested service to the linked lead before deferred automation runs. It does not invent a Tucson/IHC campaign or broaden the Phoenix authorization.
- Safe route-level audit logging for rejected or skipped signed submissions.
- Sanitized integration log summaries that avoid raw credentials, raw tokens, and unnecessary full-message storage.
- Integration Center provider readiness copy that does not claim live connectivity.
- Website & Marketing/Lead Intake surfaces that describe Yelp as manual/dry-run or partner-required.

## Mighty Apes Production Receiver Boundary

The original receiver code, schema, and historical-path deployment are complete. The canonical endpoint, company/location registry, centralized exact-once task path, and legacy service correction are validated in the current local/regression release set but remain pending Production rollout. Production is not provider-validated because no official provider `lead.test` or real `lead.created` evidence has been recorded. Do not issue a synthetic Production `lead.created` to work around that evidence boundary.

Under a separately authorized provider-test operation, the exact sequence is:

1. Reverify that `MIGHTY_APES_YELP_WEBHOOK_SECRET` is a **Sensitive**, server-only Vercel Production variable without reading or exposing its value.
2. Verify that the exact reviewed migration set is present and the canonical receiver is on the intended Production deployment; redeploy only from the exact merge revision.
3. Use Mighty Apes' **Send Test Delivery** action.

The signed `lead.test` must return success and create exactly one immutable audit-only event with no lead, intake record, sync log, notification, office task, customer, or communication. After that external test succeeds, monitor the first real `lead.created` and prove that it persists exactly once before describing the integration as live or connected.

Rollback for inbound Mighty Apes processing is to remove or rotate the Production secret and redeploy. Do not alter the migration ledger or delete durable business evidence as a rollback shortcut.

## Separate Direct Yelp Live Boundary

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

## Production Evidence Checklist

For the approved Mighty Apes receiver:

- [x] Exact raw-body signing, timestamp, delivery, version, event, and payload contract implemented.
- [x] Atomic, idempotent, WeatherTech-only persistence and immutable non-PII audit schema deployed.
- [x] Isolated signed `lead.test`, `lead.created`, retry, duplicate, concurrency, ACL/RLS, CRM visibility, and zero-residue regression passed.
- [x] At the original Yelp release checkpoint, Production migrations matched `48/48`; the historical receiver implementation was deployed and health was HTTP 200. Production later advanced to `51/51` without recording an official Mighty Apes delivery.
- [x] Safe production `GET` proves the route is deployed without sending a webhook or creating CRM data.
- [ ] Under separate authorization, reverify the Sensitive Production credential and exact deployment, then run Mighty Apes' official Send Test Delivery.
- [ ] Verify that official `lead.test` remains audit-only.
- [ ] Observe the first real `lead.created` and prove exactly-once CRM persistence.

For the separate direct Yelp API/OAuth foundation, the earlier prerequisites remain separately deferred:

- Confirm Yelp partner approval and Leads API access.
- Confirm Request-a-Quote eligibility and business subscription state for all three accounts.
- Create or update the Yelp developer app.
- Confirm OAuth client ID, client secret, redirect URI, and approved scopes.
- Authorize each Yelp business account.
- Subscribe each approved business to lead webhooks.
- Configure its separate server-side environment variables in hosting.
- Run dry-run previews for Phoenix, Tucson, and IHC.
- Run one signed non-production endpoint test per account.
- Confirm dedupe, Customer 360 activity, follow-up creation, and integration logs.
- Enable direct Yelp live flags only after separate owner approval.
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
node tests/mighty-apes-yelp-webhook.test.mjs
node tests/mighty-apes-yelp-regression.test.mjs
node tests/supabase-migration-integrity.test.mjs
```

Browser validation should cover:

- Yelp Integration Center status.
- three-account display.
- approval-required and live-sync-disabled states.
- controlled Yelp intake/dry-run behavior.
- duplicate Yelp lead handling.
- Customer 360 intake visibility.
- existing Twilio, Gmail, Google Calendar, Website, CRM, and Lead Intake workflows.
- authenticated Mighty Apes `lead.test` audit isolation.
- authenticated `lead.created` persistence, exact retry, CRM visibility, and IHC exclusion on the isolated regression target.
- exact synthetic Mighty Apes evidence cleanup before linked intake/log/lead rows and final zero-residue proof.

## Externally Pending Or Intentionally Deferred

- Server-side credential and exact deployed-revision re-verification before the official provider test.
- Official Mighty Apes Send Test Delivery and its audit-only Production evidence.
- The first real production `lead.created` and exactly-once persistence evidence.
- Live Yelp OAuth flow.
- Live Yelp webhook subscription.
- Polling live Yelp lead/conversation endpoints.
- Outbound Yelp replies.
- Yelp Business Profile management.
- Yelp review-response automation.
- Direct Yelp API credential storage.
- Production activation of any separate direct Yelp account path.
