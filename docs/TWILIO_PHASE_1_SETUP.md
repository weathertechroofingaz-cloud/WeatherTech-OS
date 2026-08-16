# Twilio Phase 1: Inbound SMS

This runbook is the authoritative setup contract for the owner-approved inbound-only Twilio phase. WeatherTech OS may receive an SMS only after the Twilio account, Messaging Service, receiving number, active database route, and company connection all agree exactly. Outbound customer SMS, voice, recording, automatic replies, reminders, campaigns, and bulk messaging remain unavailable.

## Verified Product Boundary

- Active endpoint for this phase: `POST /api/integrations/twilio/webhook`.
- Authentication: the official Twilio SDK validates `X-Twilio-Signature` against the exact canonical URL derived from `TWILIO_PUBLIC_BASE_URL` and all form fields.
- Content type: `application/x-www-form-urlencoded` only.
- Media boundary: text-only SMS with `NumMedia=0`. MMS/media is unsupported in this phase and is rejected without acknowledging or dropping attachments.
- Routing: exact `AccountSid`, `MessagingServiceSid`, receiving E.164 number, active `business_phone_numbers` row, connected same-company `integration_connections` row, and configured company-number environment value.
- CRM association: an exact, unique phone match inside the routed company may link a customer or lead. Unknown or ambiguous senders remain visible and unlinked for owner review. Receiving an SMS never creates a customer or lead.
- Idempotency: Twilio's globally unique `MessageSid` produces a deterministic local message identity. An identical replay is acknowledged without creating another message; conflicting reuse is rejected.
- Audit: a completed inbound message is paired with one company-scoped `communication_provider_events` record.
- Unified Inbox: persisted `sms_messages` remain the source of truth; no parallel inbox is created.
- Outbound status: hard-locked in application code; the independent `TWILIO_OUTBOUND_SMS_ENABLED` production gate must also remain `false`.

The status, voice, and recording callback routes remain disabled in this sprint. Do not configure them in Twilio Console.

## Verified Production State

Production has three deliberately distinct route states:

- WeatherTech Tucson, identified only by masked ending `3145`, is exactly mapped and live-validated;
- the canonical webhook below receives text-only inbound SMS and authenticates the exact Twilio request before routing or persistence;
- owner-authorized Tucson validation has produced exactly two received messages and two completed provider events;
- the WeatherTech validation senders remained safely unlinked, and no customer, lead, or job was created or modified;
- IHC, identified only by masked ending `6930`, is exactly mapped and active at `ready_for_live_test`, with zero inbound messages and zero validation events;
- WeatherTech Phoenix, identified only by masked ending `1326`, is owner-controlled, assigned to the same directly inspected shared Messaging Service as Tucson and IHC, exactly mapped, active, and live-validated with one received message and one completed provider event;
- the Phoenix company-number environment value is deployed, the shared Messaging Service still invokes the canonical webhook, and voice/status/recording configuration remains unset;
- Twilio shows no A2P Brand or Campaign on the account. The three US long-code senders therefore remain unregistered for outbound A2P traffic; sender-pool membership is not A2P approval and does not authorize outbound messaging;
- no scheduled inventory automation remains;
- official signed simulations verify application behavior but cannot prove carrier ingress or public webhook delivery for a newly configured route;
- outbound SMS remains hard-locked in code and disabled in production, with zero outbound messages; and
- the server-only credential was securely rotated before the live SMS and was never committed or copied into `.env.local`.

Do not record the full phone number, Account SID, Messaging Service SID, Message SID, message body, or authentication credential in source control, screenshots, logs, or support messages.

## Server-Only Production Configuration

Store these values only in Vercel Production environment configuration. Never place them in Git, browser variables, logs, screenshots, support messages, or `.env.local`.

Required for every independently verified connected inbound number:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_PUBLIC_BASE_URL=https://weathertech-os.vercel.app`
- the exact company-number variable for each independently verified route, with no number reused across companies or branches:
  - `TWILIO_WEATHERTECH_PHOENIX_NUMBER`
  - `TWILIO_WEATHERTECH_TUCSON_NUMBER`
  - `TWILIO_IHC_NUMBER`
- `TWILIO_INBOUND_SMS_ENABLED=false` during configuration; after every enabled route is exact and healthy, it may be set `true` for controlled live validation. Readiness remains `ready_for_live_test` while any configured route lacks durable signed inbound evidence
- `TWILIO_OUTBOUND_SMS_ENABLED=false` at all times in this phase

`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and `TWILIO_FROM_NUMBER` are not required for inbound processing and must not be treated as permission to send. Configure only independently verified company-controlled numbers. The current IHC route is verified, mapped, and active but still needs its own controlled live inbound test; WeatherTech Phoenix has satisfied that boundary.

## Database Mapping Contract

Migrations `0008_twilio_sms_integration.sql`, `0021_twilio_live_integration_foundation.sql`, and `0024_security_company_access_hardening.sql` provide the existing company-scoped schema and RLS policies.

Create exactly one company-scoped `integration_connections` row for each connected company/account relationship, then one linked `business_phone_numbers` row for every enabled inbound number. Multiple numbers for the same company may reuse that company's verified connection. Never reuse a connection across companies. Verify all of the following before enabling the inbound gate:

- the connection belongs to the intended company, uses provider `twilio_sms`, has status `connected`, and identifies the exact Twilio Account SID;
- the number row belongs to the same company and connection;
- `provider_account_sid` matches `TWILIO_ACCOUNT_SID` exactly;
- `messaging_service_sid` matches `TWILIO_MESSAGING_SERVICE_SID` exactly;
- `phone_number_e164` matches the single configured company-number environment value exactly;
- `communication_channel` is `sms` or `sms_voice`;
- `routing_status` is `active`;
- no active unexpected number mapping exists;
- every company or branch without its own independently verified number remains unmapped.

Message text, sender identity, a global fallback connection, or the presence of only one database row can never choose a company.

## Twilio Console Configuration

For the independently verified receiving number or Messaging Service, configure the incoming-message callback exactly as:

```text
POST https://weathertech-os.vercel.app/api/integrations/twilio/webhook
```

Do not configure WeatherTech OS as the status, voice, or recording callback in this phase. Do not enable an auto-response, Studio flow, marketing campaign, appointment reminder, or other outbound behavior.

The account has no A2P Brand, and the current shared Messaging Service has no A2P Campaign association. A2P absence does not itself prevent inbound SMS; with the separately inspected SMS capability and current inbound routing, Twilio can invoke the canonical webhook. Twilio blocks SMS/MMS sent from these unregistered US long-code senders to US recipients. Because the service currently contains both WeatherTech and IHC senders, do not submit a single-business campaign against it without a separately approved company/service-separation design and truthful legal-use-case review. A2P registration is a separate compliance and outbound-activation decision; never treat sender-pool membership as registration.

## Readiness And Live Validation

The authenticated owner-only endpoint `GET /api/integrations/twilio/readiness` distinguishes:

- server configuration present;
- inbound gate state;
- exact active company-number mapping;
- unexpected active mappings;
- authenticated inbound validation evidence;
- application outbound lock and production outbound gate state.

Credentials alone are not a successful connection. A route becomes validated only after one signed inbound message has been durably recorded through that exact mapping; overall readiness remains `ready_for_live_test` while any configured route lacks that evidence. Simulated signed payloads cannot substitute for carrier-originated ingress evidence.

### Supported Non-Purchase Validation Boundary

- Twilio test credentials and magic numbers validate supported REST request shapes without charging the account or connecting to real phone numbers. They cannot exercise the production inbound webhook or establish carrier delivery.
- Twilio Virtual Phone can exercise inbound handling for an SMS-capable sender already in the Messaging Service sender pool, but Twilio documents that this path does not traverse a carrier network. Treat it as a pre-live webhook check, not production carrier validation.
- Locally generated requests signed with the official Twilio SDK validate signature handling, exact routing, idempotency, failure recovery, and cleanup in the isolated regression environment. They do not prove ownership, sender-pool attachment, public callback delivery, or carrier ingress.
- Final production validation for a route therefore requires an account-controlled SMS-capable number—provisioned, ported, or hosted—and one owner-authorized real inbound SMS to that exact number. WeatherTech Phoenix has satisfied this boundary; IHC remains `ready_for_live_test` until its own carrier-originated message is durably recorded.

Controlled live sequence:

1. Keep inbound and outbound gates false while entering secrets and creating the exact mapping.
2. Verify the owner-only readiness response reports configuration and mapping ready, with outbound disabled.
3. Configure the one incoming-message callback in Twilio Console.
4. Enable only `TWILIO_INBOUND_SMS_ENABLED` and redeploy the exact reviewed commit.
5. Send one owner-authorized SMS with the supplied unique validation text to the verified number.
6. Verify one received `sms_messages` row, one completed `sms_inbound` provider event, the exact company, safe contact association or unmatched state, and Unified Inbox visibility.
7. Replay the same signed provider delivery when available and verify it is an idempotent no-op; do not send a second SMS merely to test duplication.
8. Confirm no outbound request and no unrelated CRM mutation occurred.
9. Leave outbound false. The inbound gate may remain true only after the live evidence is complete and the exact mapping remains healthy; otherwise return it to false.

## Isolated Regression

Routine tests use only the approved non-production Supabase project. They use synthetic Twilio identifiers and locally generated valid signatures; they never call Twilio APIs or send an SMS. Every test fixture uses captured IDs, exact cleanup, and final zero-residue verification. Production is prohibited as a regression target.

The isolated suite must cover valid and invalid signatures, canonical-URL tampering, wrong account/number/service, disabled or missing mapping, known customer, known lead, unknown sender, ambiguous sender, cross-company data, identical replay, conflicting `MessageSid`, retryable persistence failure, secret sanitization, and proof that no outbound network call occurs.

## Troubleshooting

- `403`: missing or invalid Twilio signature. Verify the exact canonical HTTPS URL and Auth Token; do not trust forwarded host headers.
- `400` or `415`: malformed or unsupported request. Twilio must send a bounded form-encoded text-only SMS payload with valid SID and E.164 fields and `NumMedia=0`; MMS is not accepted in this phase.
- `403`: wrong account, receiving number, Messaging Service, or company route.
- `409`: conflicting reuse of an existing provider message identifier.
- `503`: inbound gate/configuration/mapping is disabled or durable persistence did not complete. Twilio may safely retry after the underlying issue is corrected.
- readiness `ready_for_live_test`: configuration and mapping are ready, but no completed signed inbound message has been observed.
- readiness `connected`: at least one exact mapped signed inbound message was durably validated; outbound remains disabled.

Never paste the Auth Token into chat or diagnostics. Readiness exposes only booleans, missing variable names, masked identifiers, and masked phone suffixes.

## Credential Rotation And Recovery

Rotate the server-only Auth Token immediately if it may have entered chat, terminal output, logs, screenshots, or another untrusted surface. Update only protected Vercel Production configuration, redeploy, and verify the owner-only readiness endpoint before accepting another inbound SMS. Never place the replacement token in `.env.local` or source control.

If inbound readiness or authentication fails, first remove or disable the Twilio incoming-message callback, set `TWILIO_INBOUND_SMS_ENABLED=false`, and redeploy. Keep outbound false. Repair only the affected exact account/service/number/company mapping and credential, then repeat isolated signed-request tests before any new owner-authorized live validation. Do not map WeatherTech Phoenix or any other route without its own independently verified company-controlled number.
