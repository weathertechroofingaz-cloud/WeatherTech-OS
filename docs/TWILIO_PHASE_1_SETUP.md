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

## Server-Only Production Configuration

Store these values only in Vercel Production environment configuration. Never place them in Git, browser variables, logs, screenshots, support messages, or `.env.local`.

Required for one connected inbound number:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_PUBLIC_BASE_URL=https://weathertech-os.vercel.app`
- exactly one verified company-number variable, initially one of:
  - `TWILIO_WEATHERTECH_PHOENIX_NUMBER`
  - `TWILIO_WEATHERTECH_TUCSON_NUMBER`
  - `TWILIO_IHC_NUMBER`
- `TWILIO_INBOUND_SMS_ENABLED=false` during configuration, then `true` only for the controlled inbound validation
- `TWILIO_OUTBOUND_SMS_ENABLED=false` at all times in this phase

`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and `TWILIO_FROM_NUMBER` are not required for inbound processing and must not be treated as permission to send. Configure only the company number that is independently verified. Leave IHC unconfigured unless IHC has its own verified company-controlled number.

## Database Mapping Contract

Migrations `0008_twilio_sms_integration.sql`, `0021_twilio_live_integration_foundation.sql`, and `0024_security_company_access_hardening.sql` provide the existing company-scoped schema and RLS policies.

For every enabled inbound number, create exactly one `integration_connections` row and one linked `business_phone_numbers` row. Verify all of the following before enabling the inbound gate:

- the connection belongs to the intended company, uses provider `twilio_sms`, has status `connected`, and identifies the exact Twilio Account SID;
- the number row belongs to the same company and connection;
- `provider_account_sid` matches `TWILIO_ACCOUNT_SID` exactly;
- `messaging_service_sid` matches `TWILIO_MESSAGING_SERVICE_SID` exactly;
- `phone_number_e164` matches the single configured company-number environment value exactly;
- `communication_channel` is `sms` or `sms_voice`;
- `routing_status` is `active`;
- no active unexpected number mapping exists;
- the other company remains unmapped unless its own number is independently verified.

Message text, sender identity, a global fallback connection, or the presence of only one database row can never choose a company.

## Twilio Console Configuration

For the independently verified receiving number or Messaging Service, configure the incoming-message callback exactly as:

```text
POST https://weathertech-os.vercel.app/api/integrations/twilio/webhook
```

Do not configure WeatherTech OS as the status, voice, or recording callback in this phase. Do not enable an auto-response, Studio flow, marketing campaign, appointment reminder, or other outbound behavior.

## Readiness And Live Validation

The authenticated owner-only endpoint `GET /api/integrations/twilio/readiness` distinguishes:

- server configuration present;
- inbound gate state;
- exact active company-number mapping;
- unexpected active mappings;
- authenticated inbound validation evidence;
- application outbound lock and production outbound gate state.

Credentials alone are not a successful connection. The status becomes connected only after one signed inbound message has been durably recorded through the exact mapped route.

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

## Owner Handoff When External Access Is Required

If Codex has no authenticated Twilio Console access or secure source for the credentials, the remaining owner action is to use the company-controlled Twilio account to select or verify one SMS-capable WeatherTech number and its Messaging Service, store the required server-only values in Vercel Production, and set the exact incoming-message callback above. Keep outbound disabled and leave IHC unmapped. Do not send credentials in chat.
