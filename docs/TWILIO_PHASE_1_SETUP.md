# Twilio Phase 1: Inbound SMS And Tucson Voice Forwarding

This runbook is the authoritative setup contract for the owner-approved inbound-only Twilio SMS foundation and the completed WeatherTech Tucson voice route. Tucson remains a direct customer-facing Twilio number and is the only number whose inbound voice enters WeatherTech OS. WeatherTech Phoenix remains a direct Verizon voice line and IHC remains a direct AT&T voice line. Their existing Twilio numbers are SMS-only ingresses with blank Voice handling; they do not require forwarding destinations, public-source variables, carrier forwarding, or voice gates. No number is ported, reassigned, released, purchased, or transferred by this design.

## Verified Product Boundary

- Active inbound-SMS endpoint: `POST /api/integrations/twilio/webhook`.
- Tucson-only voice endpoints: `POST /api/integrations/twilio/voice` for the initial call and `POST /api/integrations/twilio/voice/status` for the exact `<Dial>` outcome. The signed receiving `To` number must be the exact configured Tucson Twilio ingress; Phoenix, IHC, and unknown receiving numbers have no voice route.
- Authentication: the official Twilio SDK validates `X-Twilio-Signature` against the exact canonical URL derived from `TWILIO_PUBLIC_BASE_URL` and all form fields.
- Content type: `application/x-www-form-urlencoded` only.
- Media boundary: text-only SMS with `NumMedia=0`. MMS/media is unsupported in this phase and is rejected without acknowledging or dropping attachments.
- Routing: exact `AccountSid`, `MessagingServiceSid`, receiving E.164 number, active `business_phone_numbers` row, connected same-company `integration_connections` row, and configured company-number environment value.
- CRM association: an exact, unique phone match inside the routed company may link a customer or lead. Unknown or ambiguous senders remain visible and unlinked for owner review. Receiving an SMS never creates a customer or lead.
- Idempotency: Twilio's globally unique `MessageSid` produces a deterministic local message identity. An identical replay is acknowledged without creating another message; conflicting reuse is rejected.
- Audit: a completed inbound message is paired with one company-scoped `communication_provider_events` record.
- Unified Inbox: persisted communications remain the source of truth; conversation grouping includes company identity, so the same external caller cannot merge WeatherTech and IHC history.
- Voice routing: only the exact Tucson `sms_voice` route may return SDK-generated `<Dial>` TwiML, and only when its gate, protected destination, terminal attestation, exact database identity, and loop checks pass. The server-only destination is rejected when malformed, equal to any configured Tucson/Phoenix/IHC Twilio ingress, or used as the incoming caller in a recursive terminal-origin attempt.
- Voice evidence: an accepted initial call creates one exact company/branch-scoped `call_records` row plus a bounded `voice_inbound` provider event before TwiML is returned. The signed outcome callback may update only its already-claimed parent/child graph and adds one bounded `voice_status` event. Identical retries converge; conflicting provider-identifier reuse is rejected, including after a route rolls back from `sms_voice` to `sms`.
- Call privacy: recording and transcription remain `not_requested`. The TwiML does not enable recording, change caller ID, create a lead, send a message, or initiate an outbound call without an active inbound caller.
- Outbound status: hard-locked in application code; the independent `TWILIO_OUTBOUND_SMS_ENABLED` production gate must also remain `false`.

The generic SMS status and recording callback routes remain disabled. Do not configure them in Twilio Console. Tucson keeps its verified Voice URL. Phoenix ending `1326` and IHC ending `6930` must keep their Voice URL, backup URL, number-level status callback, and recording configuration blank.

## Verified Production State

The last read-only provider and Production inspection established this activation baseline:

- WeatherTech Tucson, identified only by masked ending `3145`, is exactly mapped and live-validated;
- the canonical webhook below receives text-only inbound SMS and authenticates the exact Twilio request before routing or persistence;
- owner-authorized Tucson validation has produced exactly two received messages and two completed provider events;
- the WeatherTech validation senders remained safely unlinked, and no customer, lead, or job was created or modified;
- IHC, identified only by masked ending `6930`, is exactly mapped and active at `ready_for_live_test`, with zero inbound messages and zero validation events;
- WeatherTech Phoenix, identified only by masked ending `1326`, is owner-controlled, assigned to the same directly inspected shared Messaging Service as Tucson and IHC, exactly mapped, active, and live-validated with one received message and one completed provider event;
- the Phoenix company-number environment value is deployed, the shared Messaging Service still invokes the canonical SMS webhook, and Phoenix voice/status/recording configuration remains unset;
- Twilio shows no A2P Brand or Campaign on the account. The three US long-code senders therefore remain unregistered for outbound A2P traffic; sender-pool membership is not A2P approval and does not authorize outbound messaging;
- no scheduled inventory automation remains;
- official signed simulations verify application behavior but cannot prove carrier ingress or public webhook delivery for a newly configured route;
- outbound SMS remains hard-locked in code and disabled in production, with zero outbound messages;
- the historical Tucson destination that targeted the Phoenix public carrier line has been replaced by the verified assistant line in protected Production configuration. The assistant is Tucson-only and has no forwarding or ring group;
- the Tucson destination, Tucson gate, and Tucson terminal attestation are the only application voice configuration. Obsolete Phoenix/IHC public-source, destination, gate, and terminal-attestation values are unnecessary and must be absent from the final Production inventory;
- only Tucson remains `sms_voice`; Phoenix and IHC remain exact `sms` routes with blank provider Voice handling;
- the Tucson number's **A call comes in** configuration is exactly `Webhook · POST https://weathertech-os.vercel.app/api/integrations/twilio/voice`; the signed `<Dial>` outcome callback remains SDK-generated at `/api/integrations/twilio/voice/status`, and no Phoenix or IHC voice webhook was configured;
- the already-owned Phoenix ending `1326` and IHC ending `6930` numbers remain necessary only for their established SMS identities. Their technical Voice capability does not authorize or require a WeatherTech OS voice route;
- WeatherTech OS does not modify Verizon or AT&T routing. Phoenix and IHC continue ringing normally through their existing carriers, without forwarding to Twilio;
- the controlled Production checkpoint produced two distinct, owner-confirmed intentional Tucson calls 67 seconds apart. Both completed with working two-way audio, bounded durations of 15 and 18 seconds, and exactly one `voice_inbound` plus one `voice_status` event per call;
- the original live-call approval covered one call. Monitoring stopped when a second distinct call appeared; the owner then confirmed that both calls were intentional and both had working two-way audio. That reconciliation is historical evidence, not standing authorization for another test call;
- final read-only evidence is exactly two terminal `call_records` rows, two `voice_inbound` events, and two `voice_status` events, with zero active calls, recordings, transcripts, outbound call records, outbound SMS, automatic replies, or automatically created or linked CRM records; and
- Tucson, Phoenix, and IHC SMS evidence remained unchanged at two messages/two events, one message/one event, and zero messages/zero events respectively; and
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

Required only for the protected Tucson voice route:

- `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO` contains the verified Tucson assistant destination in strict E.164 form.
- `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED` is the only route-specific voice gate.
- `TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED=false` until the owner has inspected the Tucson assistant and confirmed unconditional, busy, no-answer, simultaneous-ring, hunt-group, and every other forwarding path is disabled.

Enter the full Tucson destination directly into protected Vercel Production configuration. Never paste it into chat, Git, logs, screenshots, database rows, or a browser-visible variable. It must differ from all three configured Twilio ingress numbers, and an inbound call originating from that destination is rejected as a recursive terminal-origin attempt. A later Tucson terminal change updates only the protected destination and resets the Tucson terminal attestation until the owner reverifies it; then redeploy. It never requires code or number ownership changes.

Do not create or retain `TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER`, `TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO`, `TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED`, `TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED`, `TWILIO_IHC_PUBLIC_NUMBER`, `TWILIO_IHC_VOICE_FORWARD_TO`, `TWILIO_IHC_VOICE_FORWARDING_ENABLED`, or `TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED`. The final direct-carrier architecture does not consume them.

`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and `TWILIO_FROM_NUMBER` are not required for inbound processing and must not be treated as permission to send. Configure only independently verified company-controlled numbers. The current IHC route is verified, mapped, and active but still needs its own controlled live inbound test; WeatherTech Phoenix has satisfied that boundary.

## Database Mapping Contract

Migrations `0008_twilio_sms_integration.sql`, `0021_twilio_live_integration_foundation.sql`, and `0024_security_company_access_hardening.sql` provide the existing company-scoped schema and RLS policies.

Create exactly one company-scoped `integration_connections` row for each connected company/account relationship, then one linked `business_phone_numbers` row for every enabled inbound number. Multiple numbers for the same company may reuse that company's verified connection. Never reuse a connection across companies. Verify all of the following before enabling the inbound gate:

- the connection belongs to the intended company, uses provider `twilio_sms`, has status `connected`, and identifies the exact Twilio Account SID;
- the number row belongs to the same company and connection;
- `provider_account_sid` matches `TWILIO_ACCOUNT_SID` exactly;
- `messaging_service_sid` matches `TWILIO_MESSAGING_SERVICE_SID` exactly;
- `phone_number_e164` matches the single configured company-number environment value exactly;
- `communication_channel` is `sms` for Phoenix and IHC and `sms_voice` only for the exact Tucson voice route;
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

For the exact Tucson Twilio ingress only, configure **A call comes in** as:

```text
Webhook · POST https://weathertech-os.vercel.app/api/integrations/twilio/voice
```

The completed Tucson checkpoint already has this exact webhook with method `POST` and must remain unchanged. Phoenix ending `1326` and IHC ending `6930` have blank Voice URLs and must remain blank under the final owner routing decision.

Do not set a TwiML App, Studio Flow, SIP trunk, number-level status callback, backup URL, or recording callback on any route. The `<Dial>` action callback is generated by WeatherTech OS for Tucson and points to the exact signed status route; it is not entered separately in Twilio Console. Do not add the canonical Voice URL to the Phoenix or IHC Twilio number.

The account has no A2P Brand, and the current shared Messaging Service has no A2P Campaign association. A2P absence does not itself prevent inbound SMS; with the separately inspected SMS capability and current inbound routing, Twilio can invoke the canonical webhook. Twilio blocks SMS/MMS sent from these unregistered US long-code senders to US recipients. Because the service currently contains both WeatherTech and IHC senders, do not submit a single-business campaign against it without a separately approved company/service-separation design and truthful legal-use-case review. A2P registration is a separate compliance and outbound-activation decision; never treat sender-pool membership as registration.

## Readiness And Live Validation

The authenticated owner-only endpoint `GET /api/integrations/twilio/readiness` distinguishes:

- server configuration present;
- inbound gate state;
- exact active company-number mapping;
- unexpected active mappings;
- authenticated inbound validation evidence;
- application outbound lock and production outbound gate state;
- masked Tucson gate, ingress, destination, terminal attestation, loop, exact `sms_voice` capability, and next-action evidence without returning the full protected number; and
- explicit SMS-only state for Phoenix and IHC without requesting a voice destination or carrier-forwarding action.

Credentials alone are not a successful connection. A route becomes validated only after one signed inbound message has been durably recorded through that exact mapping; overall readiness remains `ready_for_live_test` while any configured route lacks that evidence. Simulated signed payloads cannot substitute for carrier-originated ingress evidence.

### Supported Non-Purchase Validation Boundary

- Twilio test credentials and magic numbers validate supported REST request shapes without charging the account or connecting to real phone numbers. They cannot exercise the production inbound webhook or establish carrier delivery.
- Twilio Virtual Phone can exercise inbound handling for an SMS-capable sender already in the Messaging Service sender pool, but Twilio documents that this path does not traverse a carrier network. Treat it as a pre-live webhook check, not production carrier validation.
- Locally generated requests signed with the official Twilio SDK validate signature handling, exact routing, idempotency, failure recovery, and cleanup in the isolated regression environment. They do not prove ownership, sender-pool attachment, public callback delivery, or carrier ingress.
- Any later Tucson destination replacement must be validated with one separately approved real call after protected configuration and deployment are verified. Synthetic validation cannot prove that the terminal received two-way audio.
- Final production validation for a route therefore requires an account-controlled SMS-capable number—provisioned, ported, or hosted—and one owner-authorized real inbound SMS to that exact number. WeatherTech Phoenix has satisfied this boundary; IHC remains `ready_for_live_test` until its own carrier-originated message is durably recorded.

Standard carrier call forwarding does not forward texts. SMS sent to the public Phoenix or IHC carrier number remains with that carrier and does not enter WeatherTech OS. Only SMS sent directly to a configured Twilio number continues through the existing signed OS webhook. Changing that requires a separate hosted-messaging, carrier-API, or porting decision; none is authorized here.

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

### Tucson Voice Activation Sequence — Completed Production Checkpoint And Preserved Runbook

This sequence was completed against merge/deployment SHA `2ace30ba04edfb0743b63ee050c7f3845540fe54`. Canonical `/api/health` returned HTTP 200 at that exact SHA, the Production migration ledger remained `51/51`, and the final read-only lifecycle audit passed. The ordered steps remain the mandatory runbook for any rollback, destination replacement, or later reactivation; the completed checkpoint does not authorize a new test call.

1. Deploy and verify the reviewed code while `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED=false`. Tucson SMS must remain healthy and the voice readiness result must remain disabled.
2. The owner enters `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO` directly in protected Vercel Production configuration. Do not send the value through chat or store it in Git.
3. Redeploy the exact reviewed commit while the Tucson voice enable gate remains `false`. A protected Vercel environment change does not alter an already-built deployment.
4. Verify the owner-only readiness response reports `enabled=false`, `ready=false`, a configured, valid, non-looping masked destination, and the exact Tucson branch identity. Phoenix and IHC voice must remain not configured.
5. Update only the exact `weathertech-tucson` `business_phone_numbers` row from `communication_channel='sms'` to `communication_channel='sms_voice'`. Re-read all three rows and prove Phoenix and IHC remain unchanged.
6. Set only `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED=true`, redeploy the exact reviewed commit a second time, and verify health plus Tucson voice readiness. Keep outbound SMS false.
7. The owner signs in to Twilio Console. Inspect the Tucson number first, then set only its **A call comes in** webhook to the exact POST URL above. Do not touch the phone number assignment, Messaging callback, Phoenix, IHC, Verizon, or AT&T configuration.
8. Stop. A real test call requires a separate explicit owner approval. Merely completing configuration does not authorize Codex to place the call.
9. The checkpoint's explicit approval covered one owner-controlled inbound call. During monitoring, two distinct calls appeared 67 seconds apart, so monitoring stopped at the unexpected difference. The owner then confirmed both calls were intentional and both had working two-way audio. Each converged to one exact initial call/event and one exact terminal outcome event; both were `completed` with bounded durations of 15 and 18 seconds. No second call was created merely to test retry behavior, and this owner reconciliation does not authorize a future call.
10. Final read-only verification proved exactly two terminal call rows, two inbound events, and two status events; zero active calls, recordings, transcripts, outbound calls independent of the active inbound caller, Twilio REST calls, outbound call records, outbound SMS, automatic replies, and automatic CRM creation; unchanged Tucson/Phoenix/IHC SMS evidence; exact route isolation; `51/51` migrations; and HTTP 200 health at the reviewed SHA.

### Phoenix And IHC Direct-Carrier Voice — Final Owner Decision

- WeatherTech Phoenix public voice remains on Verizon and continues ringing normally through Verizon.
- IHC public voice remains on AT&T and continues ringing normally through AT&T.
- Neither public carrier number forwards to Twilio, Tucson, the assistant, or another business line.
- Twilio numbers ending `1326` and `6930` remain distinct SMS-only ingresses with blank Voice handling.
- Their `business_phone_numbers` rows remain `communication_channel='sms'`; no public-source, voice destination, voice gate, or terminal-attestation variable is required.
- Standard carrier voice and SMS sent to the public carrier numbers bypass WeatherTech OS. Only SMS sent directly to the existing Twilio ingress numbers enters the signed WeatherTech OS SMS webhook. Bringing public-number SMS into WeatherTech OS would require a separate carrier API, hosted-messaging, or porting decision; none is authorized.

Tucson rollback remains route-specific: set its gate false and redeploy before repairing its protected destination. Keep its established number, SMS webhook, Voice URL, and historical evidence assigned. Phoenix and IHC require no voice rollback because WeatherTech OS does not own their voice path.

## Isolated Regression

Routine tests use only the approved non-production Supabase project. They use synthetic Twilio identifiers and locally generated valid signatures; they never call Twilio APIs or send an SMS. Every test fixture uses captured IDs, exact cleanup, and final zero-residue verification. Production is prohibited as a regression target.

The isolated SMS suite must cover valid and invalid signatures, canonical-URL tampering, wrong account/number/service, disabled or missing mapping, known customer, known lead, unknown sender, ambiguous sender, cross-company data, identical replay, conflicting `MessageSid`, retryable persistence failure, secret sanitization, and proof that no outbound network call occurs. The isolated voice suite must seed Tucson as the sole exact `sms_voice` route while Phoenix and IHC remain `sms`; cover gate-off, missing config, terminal confirmation, malformed and duplicate critical fields, account/route/company separation, every configured Twilio-ingress destination loop, terminal-origin recursion, exact Tucson ingress/status concurrency and replay, conflicting identifier reuse, parentless or forged status, rollback-safe status completion, duration bounds, SDK-generated no-recording TwiML, bounded privacy-safe evidence, explicit Phoenix/IHC voice rejection, captured-ID cleanup, and zero residue. It must never call Twilio, a carrier, or a real destination.

## Troubleshooting

- `403`: missing or invalid Twilio signature. Verify the exact canonical HTTPS URL and Auth Token; do not trust forwarded host headers.
- `400` or `415`: malformed or unsupported request. Twilio must send a bounded form-encoded text-only SMS payload with valid SID and E.164 fields and `NumMedia=0`; MMS is not accepted in this phase.
- `403`: wrong account, receiving number, Messaging Service, or company route.
- `409`: conflicting reuse of an existing provider message identifier.
- `503`: inbound gate/configuration/mapping is disabled or durable persistence did not complete. Twilio may safely retry after the underlying issue is corrected.
- voice `403`: the signed request targets a non-Tucson number, wrong account, wrong exact company/route metadata, terminal-origin loop, or an unclaimed/mismatched status callback.
- voice `409`: a receiving route is ambiguous or the provider call/status identifier conflicts with its already-claimed company/branch graph.
- voice `503`: the Tucson gate, protected destination, terminal confirmation, configured-ingress loop check, canonical public URL, exact `sms_voice` capability, or durable evidence write is not ready.
- readiness `ready_for_live_test`: configuration and mapping are ready, but no completed signed inbound message has been observed.
- readiness `connected`: at least one exact mapped signed inbound message was durably validated; outbound remains disabled.

Never paste the Auth Token into chat or diagnostics. Readiness exposes only booleans, missing variable names, masked identifiers, and masked phone suffixes.

## Credential Rotation And Recovery

Rotate the server-only Auth Token immediately if it may have entered chat, terminal output, logs, screenshots, or another untrusted surface. Update only protected Vercel Production configuration, redeploy, and verify the owner-only readiness endpoint before accepting another inbound SMS. Never place the replacement token in `.env.local` or source control.

If SMS readiness or authentication fails, first remove or disable the Twilio incoming-message callback, set `TWILIO_INBOUND_SMS_ENABLED=false`, and redeploy. Keep outbound false. Repair only the affected exact account/service/number/company mapping and credential, then repeat isolated signed-request tests before any new owner-authorized live validation. Do not map WeatherTech Phoenix or any other route without its own independently verified company-controlled number.

If Tucson voice readiness fails, keep its established number and SMS webhook, set its voice gate false, redeploy, and repair only its protected destination or exact route. Recheck loop protection against all three configured Twilio ingresses after every destination change. Never substitute another company's ingress, never leave the Tucson assistant forwarding onward, and never weaken the signed route or persistence checks. Phoenix and IHC remain unaffected direct-carrier voice lines with SMS-only Twilio configuration. None of these recovery steps requires a port, number release, purchase, ownership change, or carrier modification.
