# Twilio Phase 1: Inbound SMS And Tucson Voice Forwarding

This runbook is the authoritative setup contract for the owner-approved inbound-only Twilio SMS phase and the separately approved WeatherTech Tucson Inbound Voice Forwarding Phase 1 extension. WeatherTech OS may receive an SMS only after the Twilio account, Messaging Service, receiving number, active database route, and company connection all agree exactly. The Tucson Twilio number may return forwarding TwiML only after its signed voice request, exact branch identity, protected destination, route-specific gate, and voice-capable database route all agree. Phoenix and IHC voice remain unavailable. Outbound customer SMS, recording, transcription, automatic replies, reminders, campaigns, and bulk messaging remain unavailable.

## Verified Product Boundary

- Active inbound-SMS endpoint: `POST /api/integrations/twilio/webhook`.
- Tucson-only voice endpoints: `POST /api/integrations/twilio/voice` for the initial call and `POST /api/integrations/twilio/voice/status` for the exact `<Dial>` outcome.
- Authentication: the official Twilio SDK validates `X-Twilio-Signature` against the exact canonical URL derived from `TWILIO_PUBLIC_BASE_URL` and all form fields.
- Content type: `application/x-www-form-urlencoded` only.
- Media boundary: text-only SMS with `NumMedia=0`. MMS/media is unsupported in this phase and is rejected without acknowledging or dropping attachments.
- Routing: exact `AccountSid`, `MessagingServiceSid`, receiving E.164 number, active `business_phone_numbers` row, connected same-company `integration_connections` row, and configured company-number environment value.
- CRM association: an exact, unique phone match inside the routed company may link a customer or lead. Unknown or ambiguous senders remain visible and unlinked for owner review. Receiving an SMS never creates a customer or lead.
- Idempotency: Twilio's globally unique `MessageSid` produces a deterministic local message identity. An identical replay is acknowledged without creating another message; conflicting reuse is rejected.
- Audit: a completed inbound message is paired with one company-scoped `communication_provider_events` record.
- Unified Inbox: persisted `sms_messages` remain the source of truth; no parallel inbox is created.
- Voice routing: only the exact WeatherTech Tucson route may return an SDK-generated `<Dial>`. The destination comes only from protected server configuration, is never written to the call record, and is rejected when malformed or equal to any configured Tucson, Phoenix, or IHC Twilio number.
- Voice evidence: an accepted initial call creates one exact Tucson `call_records` row plus a bounded `voice_inbound` provider event before TwiML is returned. The signed outcome callback may update only that claimed call and adds one bounded `voice_status` event. Identical retries converge; conflicting provider-identifier reuse is rejected.
- Call privacy: recording and transcription remain `not_requested`. The TwiML does not enable recording, change caller ID, create a lead, send a message, or initiate an outbound call without an active inbound caller.
- Outbound status: hard-locked in application code; the independent `TWILIO_OUTBOUND_SMS_ENABLED` production gate must also remain `false`.

The generic SMS status and recording callback routes remain disabled. Do not configure them in Twilio Console. The Tucson Voice URL is configured only during the controlled activation sequence below; do not assign it to Phoenix or IHC.

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
- before the Tucson voice extension is activated, all three number rows remain SMS-only, the protected voice variables are absent, the Tucson Voice URL is unset, and Production contains zero call records, voice events, recordings, or transcripts; and
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

Required only for the WeatherTech Tucson voice extension:

- `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO` contains the owner-selected destination in E.164 form. Enter it directly into protected Vercel environment configuration; never paste it into Codex chat, source control, logs, screenshots, or a browser-visible variable.
- `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED=false` while configuration is being prepared. Set it to `true` only after the destination is valid, the exact Tucson database route is voice-capable, the reviewed deployment is healthy, and the owner is ready for the Twilio Voice URL to become operational.

The destination must not equal any configured Tucson, Phoenix, or IHC Twilio business number. It may be changed later by replacing only the protected destination variable and redeploying; no application-code edit or phone-number reassignment is required.

`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and `TWILIO_FROM_NUMBER` are not required for inbound processing and must not be treated as permission to send. Configure only independently verified company-controlled numbers. The current IHC route is verified, mapped, and active but still needs its own controlled live inbound test; WeatherTech Phoenix has satisfied that boundary.

## Database Mapping Contract

Migrations `0008_twilio_sms_integration.sql`, `0021_twilio_live_integration_foundation.sql`, and `0024_security_company_access_hardening.sql` provide the existing company-scoped schema and RLS policies.

Create exactly one company-scoped `integration_connections` row for each connected company/account relationship, then one linked `business_phone_numbers` row for every enabled inbound number. Multiple numbers for the same company may reuse that company's verified connection. Never reuse a connection across companies. Verify all of the following before enabling the inbound gate:

- the connection belongs to the intended company, uses provider `twilio_sms`, has status `connected`, and identifies the exact Twilio Account SID;
- the number row belongs to the same company and connection;
- `provider_account_sid` matches `TWILIO_ACCOUNT_SID` exactly;
- `messaging_service_sid` matches `TWILIO_MESSAGING_SERVICE_SID` exactly;
- `phone_number_e164` matches the single configured company-number environment value exactly;
- `communication_channel` is `sms` for SMS-only routes or `sms_voice` for the exact Tucson route only after approved voice activation;
- `routing_key`, `business_location`, `team_queue`, `lead_source`, and `time_zone` match the canonical branch template exactly;
- `routing_status` is `active`;
- no active unexpected number mapping exists;
- every company or branch without its own independently verified number remains unmapped.

Message text, sender identity, a global fallback connection, or the presence of only one database row can never choose a company.

## Twilio Console Configuration

For the independently verified receiving number or Messaging Service, configure the incoming-message callback exactly as:

```text
POST https://weathertech-os.vercel.app/api/integrations/twilio/webhook
```

Do not configure WeatherTech OS as the SMS status or recording callback. Do not enable an auto-response, Studio flow, marketing campaign, appointment reminder, or other outbound behavior.

For the exact WeatherTech Tucson incoming phone number only, after every Tucson voice readiness condition is green, configure **A call comes in** as:

```text
Webhook · POST https://weathertech-os.vercel.app/api/integrations/twilio/voice
```

Do not set a Voice URL, TwiML App, Studio Flow, SIP trunk, status callback, or recording callback on the Phoenix or IHC numbers. The `<Dial>` action callback is generated by WeatherTech OS and points to the exact signed Tucson status route; it is not entered separately in Twilio Console. Changing this webhook does not port, reassign, release, or modify the owner-selected destination carrier number.

The account has no A2P Brand, and the current shared Messaging Service has no A2P Campaign association. A2P absence does not itself prevent inbound SMS; with the separately inspected SMS capability and current inbound routing, Twilio can invoke the canonical webhook. Twilio blocks SMS/MMS sent from these unregistered US long-code senders to US recipients. Because the service currently contains both WeatherTech and IHC senders, do not submit a single-business campaign against it without a separately approved company/service-separation design and truthful legal-use-case review. A2P registration is a separate compliance and outbound-activation decision; never treat sender-pool membership as registration.

## Readiness And Live Validation

The authenticated owner-only endpoint `GET /api/integrations/twilio/readiness` distinguishes:

- server configuration present;
- inbound gate state;
- exact active company-number mapping;
- unexpected active mappings;
- authenticated inbound validation evidence;
- application outbound lock and production outbound gate state.
- masked Tucson voice gate/destination validity, loop detection, exact route capability, and the canonical Voice webhook next action without returning the full destination.

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

### Tucson Voice Activation Sequence

1. Deploy and verify the reviewed code while `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED=false`. Tucson SMS must remain healthy and the voice readiness result must remain disabled.
2. The owner enters `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO` directly in protected Vercel Production configuration. Do not send the value through chat or store it in Git.
3. Redeploy the exact reviewed commit while the Tucson voice enable gate remains `false`. A protected Vercel environment change does not alter an already-built deployment.
4. Verify the owner-only readiness response reports `enabled=false`, `ready=false`, a configured, valid, non-looping masked destination, and the exact Tucson branch identity. Phoenix and IHC voice must remain not configured.
5. Update only the exact `weathertech-tucson` `business_phone_numbers` row from `communication_channel='sms'` to `communication_channel='sms_voice'`. Re-read all three rows and prove Phoenix and IHC remain unchanged.
6. Set only `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED=true`, redeploy the exact reviewed commit a second time, and verify health plus Tucson voice readiness. Keep outbound SMS false.
7. The owner signs in to Twilio Console. Inspect the Tucson number first, then set only its **A call comes in** webhook to the exact POST URL above. Do not touch the phone number assignment, Messaging callback, Phoenix, IHC, Verizon, or AT&T configuration.
8. Stop. A real test call requires a separate explicit owner approval. Merely completing configuration does not authorize Codex to place the call.
9. After approval, place one owner-controlled inbound call, verify one exact initial call/event and one exact outcome event, confirm the destination rang, and prove recording/transcription/outbound SMS/automatic lead creation remained zero. Do not create a second call merely to test retry behavior.

## Isolated Regression

Routine tests use only the approved non-production Supabase project. They use synthetic Twilio identifiers and locally generated valid signatures; they never call Twilio APIs or send an SMS. Every test fixture uses captured IDs, exact cleanup, and final zero-residue verification. Production is prohibited as a regression target.

The isolated SMS suite must cover valid and invalid signatures, canonical-URL tampering, wrong account/number/service, disabled or missing mapping, known customer, known lead, unknown sender, ambiguous sender, cross-company data, identical replay, conflicting `MessageSid`, retryable persistence failure, secret sanitization, and proof that no outbound network call occurs. The isolated voice suite must additionally cover gate-off and missing-destination states, malformed and duplicate critical fields, Tucson/Phoenix/IHC route separation, every configured-number loop, exact `sms_voice` metadata, initial/status idempotency, conflicting `CallSid` reuse, status-without-claim rejection, duration bounds, SDK-generated no-recording TwiML, bounded evidence, and zero-residue cleanup. It must never call Twilio or a real destination.

## Troubleshooting

- `403`: missing or invalid Twilio signature. Verify the exact canonical HTTPS URL and Auth Token; do not trust forwarded host headers.
- `400` or `415`: malformed or unsupported request. Twilio must send a bounded form-encoded text-only SMS payload with valid SID and E.164 fields and `NumMedia=0`; MMS is not accepted in this phase.
- `403`: wrong account, receiving number, Messaging Service, or company route.
- `409`: conflicting reuse of an existing provider message identifier.
- `503`: inbound gate/configuration/mapping is disabled or durable persistence did not complete. Twilio may safely retry after the underlying issue is corrected.
- voice `403`: the signed request targets a non-Tucson number, wrong account, wrong company/route metadata, or an unclaimed status callback.
- voice `409`: the call identifier or signed status evidence conflicts with the already-claimed Tucson call.
- voice `503`: the Tucson voice gate, protected destination, canonical public URL, `sms_voice` capability, or durable evidence write is not ready. Do not point Twilio at the endpoint until readiness is green.
- readiness `ready_for_live_test`: configuration and mapping are ready, but no completed signed inbound message has been observed.
- readiness `connected`: at least one exact mapped signed inbound message was durably validated; outbound remains disabled.

Never paste the Auth Token into chat or diagnostics. Readiness exposes only booleans, missing variable names, masked identifiers, and masked phone suffixes.

## Credential Rotation And Recovery

Rotate the server-only Auth Token immediately if it may have entered chat, terminal output, logs, screenshots, or another untrusted surface. Update only protected Vercel Production configuration, redeploy, and verify the owner-only readiness endpoint before accepting another inbound SMS. Never place the replacement token in `.env.local` or source control.

If SMS readiness or authentication fails, first remove or disable the Twilio incoming-message callback, set `TWILIO_INBOUND_SMS_ENABLED=false`, and redeploy. Keep outbound false. Repair only the affected exact account/service/number/company mapping and credential, then repeat isolated signed-request tests before any new owner-authorized live validation. Do not map WeatherTech Phoenix or any other route without its own independently verified company-controlled number.

If Tucson voice readiness fails, first remove the Tucson Voice URL or set `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED=false` and redeploy. Keep the SMS webhook and inbound SMS gate unchanged. Repair only the protected destination or exact Tucson route; never substitute Phoenix/IHC or an unverified fallback. Restoring `communication_channel='sms'` is the database rollback for Tucson voice capability and does not remove its SMS mapping. A destination change is only a protected-environment update plus redeploy; it never requires a code change, port, number release, or carrier modification.
