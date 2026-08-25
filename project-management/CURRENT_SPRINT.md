# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md), [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md), and this file before changing product files.

## Approval Status

Approved

The owner explicitly approved WeatherTech Tucson Inbound Voice Forwarding Phase 1 in the Codex task on 2026-08-24. This approval authorizes only the narrow implementation, isolated validation, release, protected Tucson-only voice configuration, read-only Production verification, and governance closeout described below. It does not authorize a real test call, number purchase, port, release, reassignment, unrelated provider activation, outbound SMS, recording, transcription, automatic reply, automatic lead creation, or later sprint.

## Sprint Name

WeatherTech Tucson Inbound Voice Forwarding Phase 1

## Objective

Make the existing WeatherTech Roofing LLC Tucson Twilio number function as a customer-facing Tucson voice number by forwarding authenticated inbound calls to an owner-configured protected destination while preserving the already-live Tucson inbound SMS path and keeping WeatherTech Tucson, WeatherTech Phoenix, and IHC Painting routing identities exact and distinct.

## Owner

Joe Harris

## Owner Approval Date

2026-08-24.

## Verified Starting State

- Canonical repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`; branch `main`.
- Starting local `HEAD`, cached `origin/main`, live GitHub `main`, and canonical Production deployment: `8691a1e0952a42159ad533c9a98c044f36f87103`.
- Starting working tree and index: clean; no merge, rebase, cherry-pick, or bisect is in progress.
- Canonical `/api/health`: HTTP 200 and reports the exact starting SHA. `/api/readiness`: truthfully HTTP 503 solely under the existing live-provider/owner-approval safety gate.
- Production Supabase project: `gahfcgyjtfwwmsterhzu` / WeatherTech OS / `ACTIVE_HEALTHY` / Postgres 17; local and Production ledgers match all `51/51` committed migrations.
- Production contains three exact active Twilio number mappings: `weathertech-tucson` and `weathertech-phoenix` inside WeatherTech Roofing LLC, plus tenant-separated `ihc-primary` inside IHC Painting.
- WeatherTech Tucson, documented only by masked ending `3145`, has two authenticated completed inbound SMS records and two matched provider events. WeatherTech Phoenix, ending `1326`, has one; IHC, ending `6930`, remains mapped but lacks carrier-ingress validation.
- Outbound SMS remains application-locked and disabled. Tucson and Phoenix reuse the verified WeatherTech Twilio connection; IHC uses its own separate connection.
- The Tucson route begins with `communication_channel='sms'`, zero `call_records`, zero voice provider events, no forwarding destination, and no voice settings.
- `POST /api/integrations/twilio/voice` exists but deliberately returns HTTP 503 for voice events and produces no `<Dial>` TwiML.
- Vercel Production has the existing Twilio account, Auth Token, Messaging Service, canonical public base URL, inbound/outbound SMS gates, and separate Tucson/Phoenix/IHC number variables. It has no voice-forwarding enable flag or destination variable.
- Latest direct Twilio provider inspection on 2026-08-15 found voice, status, recording, TwiML App, Studio Flow, trunk, and call-forwarding configuration unset. A fresh number-resource inspection requires the owner to sign in to Twilio Console.
- Existing `business_phone_numbers`, `call_records`, and `communication_provider_events` schema is sufficient; no migration is expected.
- Protected starting hashes:
  - `.env.local`: `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.
  - `supabase/migrations/0026_property_intelligence_foundation.sql`: `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e`.
  - `supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql`: `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`.
- Proposal-to-Sold Job Operational Completion Phase 1 is released, closed, and must not be changed or reopened.

## Owner-Approved Scope

- Add protected, server-only Tucson voice configuration with a default-disabled route-specific enable gate and an owner-configured forwarding destination. The destination must never be hard-coded, exposed through `NEXT_PUBLIC_`, logged, returned unmasked, or committed.
- Accept only bounded `application/x-www-form-urlencoded` Twilio voice requests whose official signature validates against the exact canonical HTTPS URL and configured Auth Token.
- Resolve the request through the exact configured Twilio Account SID, Tucson receiving E.164 number, active `weathertech-tucson` business-number row, connected same-company integration, and exact Tucson route metadata.
- Return SDK-generated `<Dial>` TwiML only for the verified WeatherTech Tucson route and only while the Tucson voice gate and valid destination are present.
- Validate the destination as E.164 and reject self-forwarding, the configured Tucson number, configured Phoenix/IHC Twilio-number loops, malformed values, duplicate critical fields, wrong account, wrong receiving number, cross-company routes, missing configuration, or ambiguous mappings.
- Preserve the caller-facing Tucson number and the original inbound caller context; do not purchase, port, release, reassign, or replace any number.
- Persist bounded, idempotent, company- and route-scoped inbound call and dial-outcome evidence using the existing `call_records` and `communication_provider_events` schema. Do not persist credentials, raw signed requests, or unnecessary destination data.
- Add a bounded signed voice status/dial-outcome callback that can update only the exact previously claimed Tucson call and cannot create an unrelated call or cross-route record.
- Keep call recording and transcription explicitly disabled in TwiML and data state.
- Bind Phoenix, Tucson, and IHC configuration to their exact `routing_key`, `business_location`, `team_queue`, and `lead_source` metadata in webhook and readiness checks.
- Surface the receiving business-number route label, such as `WeatherTech Tucson`, on inbound SMS items in the Unified Inbox without changing message content or contact-matching behavior.
- Extend owner-only readiness with masked Tucson voice configuration, exact route status, and provider-configuration next action without revealing the destination.
- Preserve the existing signed, idempotent Tucson/Phoenix/IHC inbound SMS implementation and keep outbound SMS hard-locked and disabled.
- Add focused route, signature, TwiML, persistence, replay, status, privacy, company/branch isolation, configuration, UI mapping, and regression tests.
- If every non-Production gate passes, create and push one focused implementation commit, verify exact-SHA CI and deployment, perform the normal safe disabled-by-default Production rollout and read-only verification, then create at most one documentation-only closeout commit after owner-only activation/testing is complete.

## Explicit Exclusions

- No real test call without a separate explicit owner approval after the exact Production configuration is verified.
- No phone-number purchase, port, release, reassignment, transfer, carrier change, caller-ID ownership change, or modification of an existing Verizon, AT&T, or unrelated Twilio number.
- No hard-coded forwarding destination and no forwarding destination in chat, source control, logs, screenshots, browser-visible variables, database rows readable by ordinary users, or support output.
- No Phoenix or IHC voice activation, fallback routing, shared default destination, or implicit enablement.
- No outbound SMS, MMS, SMS status activation, auto-response, reminders, campaigns, bulk messaging, or A2P registration.
- No call recording, recording callback activation, voicemail recording, transcription, speech recognition, IVR, queue, conference, simultaneous ring, or automated customer messaging.
- No automatic lead, customer, job, estimate, follow-up, or task creation from a call or SMS.
- No GoHighLevel, Gmail, Google Calendar, Yelp, Stripe, QuickBooks, proposal/e-signature, Customer Portal, or unrelated provider/application change.
- No schema migration, RLS change, new table, destructive database mutation, or historical migration modification unless a newly proven invariant cannot be enforced with the existing schema and the owner separately approves that expansion.
- No `.env.local`, secret, package/lockfile, protected migration, unrelated Production data, or readiness-gate change outside the exact Tucson voice configuration.
- No Production synthetic call/event rows. Provider activation may update only the protected Tucson environment variables, only Tucson's Twilio voice webhook, and the exact Tucson `business_phone_numbers.communication_channel` value from `sms` to `sms_voice` (or back to `sms` for rollback) after all code gates pass. Phoenix, IHC, and every other Tucson field remain unchanged.
- No later sprint selection or implementation.

## Completion Criteria

- A valid signed inbound call to the exact configured Tucson Twilio number returns safe SDK-generated `<Dial>` TwiML for the protected configured destination only.
- Wrong-account, wrong-number, Phoenix, IHC, malformed, duplicate-field, disabled, missing-config, cross-company, replay-conflict, and loop attempts fail closed without dialing or persisting false evidence.
- The destination can be changed through protected server configuration and deployment without changing application code.
- Initial call claims and dial outcomes are idempotent, exact-route/company bound, bounded, and truthful in existing call/provider-event records.
- Recording and transcription remain unrequested; no automatic CRM record is created from an unknown caller.
- Tucson inbound SMS retains its exact existing behavior and durable evidence. Phoenix and IHC remain distinct and unchanged.
- The Unified Inbox visibly distinguishes the Tucson receiving route for inbound SMS without exposing unnecessary full numbers.
- Owner-only readiness exposes only masked/boolean voice configuration evidence and reports provider setup truthfully.
- Focused security, branch-isolation, SMS regression, runtime, type-check, lint, build, dependency, secret, whitespace, protected-file, and scope gates pass.
- Targeted Integration/Inbox Browser validation and the complete established isolated Browser regression pass with zero unexpected console errors or warnings and zero residue. No provider call or real SMS is sent by automated validation.
- Exact implementation SHA CI and Vercel deployment pass; canonical `/api/health` returns HTTP 200 at that SHA. Production database/migration ledger remains `51/51` because no migration is expected.
- Before the first call, the owner signs in to Twilio, securely enters the destination in protected Vercel configuration, verifies the exact Tucson-only `sms_voice` route transition, approves the Tucson-only Twilio Voice callback update, and separately approves one controlled real test call.
- No existing Verizon, AT&T, or Twilio number is ported, released, reassigned, or otherwise modified beyond Tucson's approved voice webhook setting.
- Implementation and final documentation closeout commits are pushed; repository refs are synchronized and the tree is clean.

## Validation Plan

- Reverify Git/ref/deployment identity, clean tree, governance, protected hashes, Production/regression target identity, `51/51` migration parity, exact Twilio route/message/call baselines, environment-variable names, and provider state before implementation and release.
- Unit-test canonical URL signature validation, bounded form parsing, duplicate critical fields, exact Tucson routing, branch metadata, E.164 destination normalization, self/cross-route loops, disabled/missing configuration, SDK TwiML structure, recording disabled, and privacy-safe errors.
- Runtime-test exact initial-call idempotency, conflicting CallSid reuse, same-company contact matching, unknown/ambiguous callers, one bounded provider event, dial status convergence, and rejection of forged/cross-company status callbacks without an external provider call.
- Regression-test Tucson/Phoenix/IHC inbound SMS, exact company and number identity, message/event counts, no lead/customer auto-creation, outbound lock, and Unified Inbox route labeling.
- Run focused tests, complete repository tests, type-check, lint, Production build, dependency audit, secret scan, `git diff --check`, protected-file verification, migration integrity, and final independent diff/security audit.
- Use the isolated regression project only for write-capable hosted tests; require exact cleanup and zero residue. Production validation remains read-only until the owner separately approves the one real inbound call.
- Run targeted signed-in Browser validation for owner readiness/route labels, then the complete established 24-group isolated Browser suite without any Twilio provider call or real SMS.
- Push one implementation commit on a focused branch, require exact-SHA CI and Vercel success, and deploy disabled-by-default code before any protected destination or Twilio voice webhook is configured.
- Stop for the owner to sign in to Twilio and securely set the protected destination. After read-only verification, request separate approval for the first real test call.
- After a successful owner-approved live call and exact evidence verification, record the immutable implementation/release evidence in completed governance with at most one documentation-only closeout commit. Do not begin another sprint.

## Release Commits

- Approval record: this approval documentation commit; Git history is authoritative for its immutable hash.
- Implementation: pending.
- Merge: pending.
- Documentation closeout: pending until owner-only configuration and controlled live-call validation are complete.

## Final Status

Approved and active. Implementation, isolated validation, safe disabled-by-default deployment, and owner-assisted Tucson-only configuration are authorized within the exact scope above. A real test call remains separately gated on explicit owner approval.

## Notes

The owner must provide the forwarding destination only through protected environment configuration, never through Codex chat. Configuring a Twilio number to request WeatherTech OS TwiML and using `<Dial>` forwards the inbound call through a Twilio call leg; it does not port, reassign, or modify the destination carrier number.
