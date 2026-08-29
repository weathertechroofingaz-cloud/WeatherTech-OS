# Twilio Phase 1: Inbound SMS And Company-Scoped Voice Forwarding

This runbook is the authoritative setup contract for the owner-approved inbound-only Twilio SMS foundation, the completed WeatherTech Tucson voice route, and the WeatherTech Phoenix + IHC carrier-forwarded voice extension. WeatherTech OS may accept a communication only after the Twilio account, exact receiving number, active database route, same-company connection, protected graph, and route-specific gate agree. Tucson remains a direct customer-facing Twilio number. Phoenix and IHC retain their existing carrier-owned public numbers and use already-owned Twilio numbers only as hidden voice ingresses. No number is ported, reassigned, released, purchased, or exposed by this design.

## Verified Product Boundary

- Active inbound-SMS endpoint: `POST /api/integrations/twilio/webhook`.
- Shared voice endpoints: `POST /api/integrations/twilio/voice` for the initial call and `POST /api/integrations/twilio/voice/status` for the exact `<Dial>` outcome. The signed receiving `To` number selects exactly one of Phoenix, Tucson, or IHC; there is no fallback route.
- Authentication: the official Twilio SDK validates `X-Twilio-Signature` against the exact canonical URL derived from `TWILIO_PUBLIC_BASE_URL` and all form fields.
- Content type: `application/x-www-form-urlencoded` only.
- Media boundary: text-only SMS with `NumMedia=0`. MMS/media is unsupported in this phase and is rejected without acknowledging or dropping attachments.
- Routing: exact `AccountSid`, `MessagingServiceSid`, receiving E.164 number, active `business_phone_numbers` row, connected same-company `integration_connections` row, and configured company-number environment value.
- CRM association: an exact, unique phone match inside the routed company may link a customer or lead. Unknown or ambiguous senders remain visible and unlinked for owner review. Receiving an SMS never creates a customer or lead.
- Idempotency: Twilio's globally unique `MessageSid` produces a deterministic local message identity. An identical replay is acknowledged without creating another message; conflicting reuse is rejected.
- Audit: a completed inbound message is paired with one company-scoped `communication_provider_events` record.
- Unified Inbox: persisted communications remain the source of truth; conversation grouping includes company identity, so the same external caller cannot merge WeatherTech and IHC history.
- Voice routing: each exact `sms_voice` route may return SDK-generated `<Dial>` TwiML only when its own gate, independently configured protected source/destination, database identity, and the complete three-route graph pass. Every destination is server-only and is rejected when malformed or equal to any configured public source or Twilio ingress. Destination equality between routes is informational, not a readiness prerequisite: a shared Phoenix/IHC sink is valid only when the owner explicitly selects and verifies it, never because WeatherTech OS inferred it.
- Voice evidence: an accepted initial call creates one exact company/branch-scoped `call_records` row plus a bounded `voice_inbound` provider event before TwiML is returned. The signed outcome callback may update only its already-claimed parent/child graph and adds one bounded `voice_status` event. Identical retries converge; conflicting provider-identifier reuse is rejected, including after a route rolls back from `sms_voice` to `sms`.
- Call privacy: recording and transcription remain `not_requested`. The TwiML does not enable recording, change caller ID, create a lead, send a message, or initiate an outbound call without an active inbound caller.
- Outbound status: hard-locked in application code; the independent `TWILIO_OUTBOUND_SMS_ENABLED` production gate must also remain `false`.

The generic SMS status and recording callback routes remain disabled. Do not configure them in Twilio Console. The canonical voice endpoint is shared in application code, but Twilio number changes remain route-by-route owner actions: Tucson keeps its verified Voice URL, while Phoenix and IHC remain blank until their respective application readiness is green.

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
- the historical protected Tucson forwarding destination was configured only in Vercel Production and targeted the Phoenix public carrier line. The owner has since corrected the topology: the verified assistant line is Tucson-only and must not receive Phoenix calls;
- the latest read-only Vercel inventory shows the Tucson destination present and its gate false; the Phoenix/IHC destinations remain absent, while their enable gates and all three terminal attestations are saved explicitly false. The exact Phoenix/Tucson ingress hashes still match their database identities. Those later environment saves are not active until an exact reviewed redeploy, and no corrected deployment has been promoted from them;
- only Tucson remains `sms_voice`; Phoenix/IHC remain `sms`, with their provider Voice URLs inactive;
- the Tucson number's **A call comes in** configuration is exactly `Webhook · POST https://weathertech-os.vercel.app/api/integrations/twilio/voice`; the signed `<Dial>` outcome callback remains SDK-generated at `/api/integrations/twilio/voice/status`, and no Phoenix or IHC voice webhook was configured;
- the already-owned Phoenix ending `1326` and IHC ending `6930` numbers are Voice-capable hidden-ingress candidates; no additional Twilio number is required for this architecture;
- no carrier forwarding change has been made by WeatherTech OS. The owner has verified the Tucson-only assistant line has no forwarding. Phoenix and IHC remain blocked until the owner independently selects their protected terminal destinations and verifies every forwarding/ring path on each configured terminal before application/provider readiness can become green;
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

Required for the protected three-route voice graph:

- `TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER` — existing Phoenix carrier-owned customer-facing source.
- `TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO` and `TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED`.
- `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO` and the existing `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED`.
- `TWILIO_IHC_PUBLIC_NUMBER` — existing IHC carrier-owned customer-facing source.
- `TWILIO_IHC_VOICE_FORWARD_TO` and `TWILIO_IHC_VOICE_FORWARDING_ENABLED`.
- `TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED=false` until the owner has inspected the Tucson-only assistant line and confirmed unconditional, busy, no-answer, simultaneous-ring, hunt-group, and every other forwarding path is disabled. This existing value remains the Tucson legacy attestation only.
- `TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED=false` until the owner performs the same verification on the exact independently chosen Phoenix terminal.
- `TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED=false` until the owner performs the same verification on the exact independently chosen IHC terminal.

Enter every full public source and destination directly into protected Vercel Production configuration. Never paste it into chat, Git, logs, screenshots, database rows, or a browser-visible variable. Each `*_VOICE_FORWARD_TO` value is independently owner-chosen and must differ from all three Twilio ingress numbers and both carrier public sources. The verified assistant line is Tucson-only and must not be entered for Phoenix or IHC. Phoenix and IHC may share a destination only if the owner explicitly selects that graph-safe sink and verifies it for both routes; equality is informational and must never be inferred as required. Any malformed value, duplicate source/ingress, protected-node destination, graph loop, or missing route-specific terminal confirmation blocks that route's readiness. A later terminal change updates only the affected protected destination and resets only that route's terminal attestation until the owner reverifies it; then redeploy. It never requires code or number ownership changes.

`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and `TWILIO_FROM_NUMBER` are not required for inbound processing and must not be treated as permission to send. Configure only independently verified company-controlled numbers. The current IHC route is verified, mapped, and active but still needs its own controlled live inbound test; WeatherTech Phoenix has satisfied that boundary.

## Database Mapping Contract

Migrations `0008_twilio_sms_integration.sql`, `0021_twilio_live_integration_foundation.sql`, and `0024_security_company_access_hardening.sql` provide the existing company-scoped schema and RLS policies.

Create exactly one company-scoped `integration_connections` row for each connected company/account relationship, then one linked `business_phone_numbers` row for every enabled inbound number. Multiple numbers for the same company may reuse that company's verified connection. Never reuse a connection across companies. Verify all of the following before enabling the inbound gate:

- the connection belongs to the intended company, uses provider `twilio_sms`, has status `connected`, and identifies the exact Twilio Account SID;
- the number row belongs to the same company and connection;
- `provider_account_sid` matches `TWILIO_ACCOUNT_SID` exactly;
- `messaging_service_sid` matches `TWILIO_MESSAGING_SERVICE_SID` exactly;
- `phone_number_e164` matches the single configured company-number environment value exactly;
- `communication_channel` is `sms` while a route is SMS-only or disabled for voice, and `sms_voice` only for an exact independently activated Phoenix, Tucson, or IHC voice route;
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

For an exact voice-ready Twilio ingress number, configure **A call comes in** as:

```text
Webhook · POST https://weathertech-os.vercel.app/api/integrations/twilio/voice
```

The completed Tucson checkpoint already has this exact webhook with method `POST` and must remain unchanged. Phoenix ending `1326` and IHC ending `6930` currently have blank Voice URLs. The owner may set only the exact number being activated, only after that route's protected configuration, `sms_voice` row, graph, deployment, and readiness all pass.

Do not set a TwiML App, Studio Flow, SIP trunk, number-level status callback, backup URL, or recording callback on any route. The `<Dial>` action callback is generated by WeatherTech OS and points to the exact signed shared status route; it is not entered separately in Twilio Console. Adding the same canonical Voice URL to a hidden ingress does not port, reassign, release, or change ownership of a carrier number.

The account has no A2P Brand, and the current shared Messaging Service has no A2P Campaign association. A2P absence does not itself prevent inbound SMS; with the separately inspected SMS capability and current inbound routing, Twilio can invoke the canonical webhook. Twilio blocks SMS/MMS sent from these unregistered US long-code senders to US recipients. Because the service currently contains both WeatherTech and IHC senders, do not submit a single-business campaign against it without a separately approved company/service-separation design and truthful legal-use-case review. A2P registration is a separate compliance and outbound-activation decision; never treat sender-pool membership as registration.

## Readiness And Live Validation

The authenticated owner-only endpoint `GET /api/integrations/twilio/readiness` distinguishes:

- server configuration present;
- inbound gate state;
- exact active company-number mapping;
- unexpected active mappings;
- authenticated inbound validation evidence;
- application outbound lock and production outbound gate state;
- graph-wide route-destination topology plus separate Tucson, Phoenix, and IHC terminal-confirmation state; and
- separate masked Phoenix, Tucson, and IHC gate, ingress, public-source, destination, loop, exact `sms_voice` capability, and next-action evidence without returning a full protected number.

Credentials alone are not a successful connection. A route becomes validated only after one signed inbound message has been durably recorded through that exact mapping; overall readiness remains `ready_for_live_test` while any configured route lacks that evidence. Simulated signed payloads cannot substitute for carrier-originated ingress evidence.

### Supported Non-Purchase Validation Boundary

- Twilio test credentials and magic numbers validate supported REST request shapes without charging the account or connecting to real phone numbers. They cannot exercise the production inbound webhook or establish carrier delivery.
- Twilio Virtual Phone can exercise inbound handling for an SMS-capable sender already in the Messaging Service sender pool, but Twilio documents that this path does not traverse a carrier network. Treat it as a pre-live webhook check, not production carrier validation.
- Locally generated requests signed with the official Twilio SDK validate signature handling, exact routing, idempotency, failure recovery, and cleanup in the isolated regression environment. They do not prove ownership, sender-pool attachment, public callback delivery, or carrier ingress.
- Carrier voice forwarding must be validated route by route with one separately approved real call after the owner finishes the exact provider steps. A synthetic call cannot prove the public carrier forwarded to the intended hidden ingress or that the route's protected terminal received two-way audio.
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

### Phoenix + IHC Carrier-Forwarded Voice Activation — Owner-Gated

Do not begin this sequence until the exact reviewed deployment is healthy, all isolated regression passes, the Production migration ledger remains `51/51`, and Phoenix/IHC voice gates are false. No step changes carrier ownership or ports a number.

1. Preserve the verified assistant terminal and existing legacy attestation for Tucson only. The assistant must never be entered as the Phoenix or IHC destination. The owner independently selects the protected Phoenix and IHC terminals and verifies every unconditional, busy, no-answer, simultaneous-ring, hunt-group, and other forwarding feature on each exact terminal. A Phoenix/IHC shared sink is allowed only when explicitly selected and independently attested for both routes.
2. Keep Tucson voice disabled, redeploy the corrected reviewed code, and verify its signed SMS path is unchanged. Phoenix and IHC gates must also remain false. This preserves the safe window before any provider or carrier activation.
3. In protected Vercel Production configuration, the owner verifies the Phoenix and IHC public sources and enters each route's independently chosen destination. Keep all three voice gates false. Set `TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED=true` only for the already verified Tucson assistant. Set the Phoenix and IHC route-specific attestation variables true only after step 1 is factually complete for that exact terminal.
4. Redeploy the exact reviewed SHA. Verify owner-only readiness shows one acyclic graph, three configured and valid masked route destinations, informational shared-versus-route-specific topology, distinct masked ingresses and public sources, separate terminal confirmation for each route, all three gates false, outbound SMS false, and no full number. Readiness must not require destination equality or borrow another route's attestation.
5. Re-read the three exact `business_phone_numbers` rows. Tucson must remain `sms_voice`; change only Phoenix and IHC from `sms` to `sms_voice`, then prove account, company, connection, route key, location, queue, lead source, and all three row identities remain exact. No migration is required.
6. Enable Tucson voice only against its verified Tucson-only assistant destination and redeploy. Verify health, exact Tucson readiness, unchanged Tucson SMS and historical call evidence, zero new calls, and no provider-side effect. Do not place a call.
7. Reverify the owner-chosen Phoenix terminal and `TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED`, then enable only Phoenix voice and redeploy. Verify exact Phoenix readiness before provider changes. The owner signs in to Twilio and sets only ending `1326` **A call comes in** to the canonical POST Voice URL; leave number ownership, Messaging Service, backup, status, and recording fields unchanged.
8. The owner configures the Phoenix public Verizon line to forward voice only to the hidden Phoenix Twilio ingress. Do not forward it to Tucson, IHC, the assistant directly, or another public source. SMS remains at Verizon.
9. Stop for separate approval of one Phoenix real inbound test call. After approval, verify two-way audio, exact Phoenix company/branch evidence, one parent call, one inbound event, one terminal status event, no recording/transcript/message/automatic CRM record, and no second call merely for replay validation.
10. Reverify the independently owner-chosen IHC terminal and `TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED`, then repeat steps 7–9 for IHC: enable only IHC, set ending `6930` to the canonical POST Voice URL, and have the owner forward voice from the IHC public AT&T line only to that hidden ingress. SMS remains at AT&T. A real IHC call requires its own separate approval.

Rollback one route at a time: first remove the carrier forward for Phoenix/IHC, then remove that hidden ingress Voice URL, set that route's gate false and redeploy, and finally return only that database row to `sms`. For Tucson, set its gate false and redeploy before any destination repair; its established Twilio number and SMS webhook stay assigned. Keep the other companies unchanged. Never use any protected terminal as a carrier-forwarding source, never use the Tucson-only assistant as the Phoenix or IHC destination, and never restore Tucson to the Phoenix public number while Phoenix forwarding is enabled.

## Isolated Regression

Routine tests use only the approved non-production Supabase project. They use synthetic Twilio identifiers and locally generated valid signatures; they never call Twilio APIs or send an SMS. Every test fixture uses captured IDs, exact cleanup, and final zero-residue verification. Production is prohibited as a regression target.

The isolated SMS suite must cover valid and invalid signatures, canonical-URL tampering, wrong account/number/service, disabled or missing mapping, known customer, known lead, unknown sender, ambiguous sender, cross-company data, identical replay, conflicting `MessageSid`, retryable persistence failure, secret sanitization, and proof that no outbound network call occurs. The isolated voice suite must additionally seed all three exact routes and both company connections; prove independently configured synthetic destinations, informational explicitly shared topology, and route-specific terminal attestations that cannot authorize another route; cover gate-off, missing config, terminal confirmation, malformed and duplicate critical fields, account/route/company separation, ingress/public-source/destination loops, exact `sms_voice` metadata, per-route ingress/status concurrency and replay, conflicting identifier reuse, parentless or forged status, rollback-safe status completion, duration bounds, SDK-generated no-recording TwiML, bounded privacy-safe evidence, captured-ID cleanup, and zero residue. It must never call Twilio, a carrier, or a real destination.

## Troubleshooting

- `403`: missing or invalid Twilio signature. Verify the exact canonical HTTPS URL and Auth Token; do not trust forwarded host headers.
- `400` or `415`: malformed or unsupported request. Twilio must send a bounded form-encoded text-only SMS payload with valid SID and E.164 fields and `NumMedia=0`; MMS is not accepted in this phase.
- `403`: wrong account, receiving number, Messaging Service, or company route.
- `409`: conflicting reuse of an existing provider message identifier.
- `503`: inbound gate/configuration/mapping is disabled or durable persistence did not complete. Twilio may safely retry after the underlying issue is corrected.
- voice `403`: the signed request targets an unconfigured number, wrong account, wrong exact company/route metadata, terminal-origin loop, or an unclaimed/mismatched status callback.
- voice `409`: a receiving route is ambiguous or the provider call/status identifier conflicts with its already-claimed company/branch graph.
- voice `503`: the selected route gate, protected source/destination, terminal confirmation, complete graph, canonical public URL, `sms_voice` capability, or durable evidence write is not ready. Do not point that ingress at the endpoint until its readiness is green.
- readiness `ready_for_live_test`: configuration and mapping are ready, but no completed signed inbound message has been observed.
- readiness `connected`: at least one exact mapped signed inbound message was durably validated; outbound remains disabled.

Never paste the Auth Token into chat or diagnostics. Readiness exposes only booleans, missing variable names, masked identifiers, and masked phone suffixes.

## Credential Rotation And Recovery

Rotate the server-only Auth Token immediately if it may have entered chat, terminal output, logs, screenshots, or another untrusted surface. Update only protected Vercel Production configuration, redeploy, and verify the owner-only readiness endpoint before accepting another inbound SMS. Never place the replacement token in `.env.local` or source control.

If SMS readiness or authentication fails, first remove or disable the Twilio incoming-message callback, set `TWILIO_INBOUND_SMS_ENABLED=false`, and redeploy. Keep outbound false. Repair only the affected exact account/service/number/company mapping and credential, then repeat isolated signed-request tests before any new owner-authorized live validation. Do not map WeatherTech Phoenix or any other route without its own independently verified company-controlled number.

If voice readiness fails, disable only the affected route and redeploy. For Phoenix or IHC, the owner must remove that public carrier forward before changing the hidden ingress; then remove its Twilio Voice URL and return only its database row to `sms` if rollback is required. For Tucson, keep its established number and SMS webhook, set its voice gate false, and repair only its protected destination or exact route. Recheck the complete graph after every destination change. Never substitute another company's ingress or public source, never reuse the Tucson-only assistant outside Tucson, never leave any configured terminal forwarding onward, and never weaken the graph check. None of these recovery steps requires a port, number release, purchase, or ownership change.
