# Current Sprint

This file records the currently owner-approved WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md), [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md), and this file before development.

## Approval Status

Approved

The owner explicitly approved this sprint in the Codex task on 2026-08-28. The approval authorizes the narrow implementation, isolated validation, commit, pull request, merge, disabled-first deployment, and protected configuration preparation described below. On 2026-08-29, before Phoenix/IHC activation, the owner corrected the terminal topology: the verified assistant line is Tucson-only, must not receive Phoenix calls, and Phoenix plus IHC require independently owner-chosen protected terminal destinations. This correction authorizes only the narrow topology/readiness/runbook rework needed to preserve the original sprint safety boundary. It does not establish whether Phoenix and IHC will use different terminal lines or an explicitly owner-approved shared sink. It does not authorize porting or changing ownership of any carrier number, changing carrier forwarding or Twilio number configuration without the owner at the provider boundary, sending SMS, enabling outbound messaging, or placing a real test call without separate explicit approval for that exact call.

## Sprint Name

WeatherTech Phoenix + IHC Carrier-Forwarded Voice Integration Phase 1

## Objective

Bring inbound calls placed to the existing WeatherTech Phoenix and IHC public carrier numbers through distinct hidden Twilio ingress numbers and into WeatherTech OS, then ring independently owner-chosen protected terminal destinations for Tucson, Phoenix, and IHC. The already verified assistant carrier line remains Tucson-only. Preserve the existing public carrier numbers, preserve the completed Tucson Twilio ingress and SMS behavior, prevent all forwarding loops, and keep Tucson, Phoenix, and IHC company/branch evidence exact and separate.

## Owner

Joe Harris

## Owner Approval Date

2026-08-28.

## Verified Starting State

- Canonical repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`; branch `main`.
- Starting local `HEAD`, local `origin/main`, live GitHub `main`, and canonical Production deployment: `da3dfc0096b60a7e2adc69aa87edfee949e76aba`.
- Starting working tree and index: clean; no merge, rebase, cherry-pick, or bisect is in progress.
- Canonical `/api/health`: HTTP 200 and reports the exact starting SHA. `/api/readiness`: truthfully HTTP 503 under the existing broad live-provider/owner-approval safety gate.
- Production Supabase project: `gahfcgyjtfwwmsterhzu` / WeatherTech OS / `ACTIVE_HEALTHY` / Postgres 17; local and Production ledgers match all `51/51` committed migrations.
- Three exact active Twilio routes exist with distinct receiving numbers and exact company/branch metadata: `weathertech-tucson` is `sms_voice`; `weathertech-phoenix` and `ihc-primary` are `sms`.
- The owner identifies the WeatherTech Phoenix public line as Verizon Wireless, the IHC public line as AT&T, and a separate assistant terminal line as Verizon Wireless. These carrier facts are owner-supplied; WeatherTech OS cannot inspect carrier forwarding state.
- The owner confirms the assistant terminal is Tucson-only, is distinct from both public carrier source numbers and all three Twilio ingress numbers, and has every unconditional, busy, no-answer, simultaneous-ring, hunt-group, and other forwarding path disabled. It must not be configured as the Phoenix destination.
- Phoenix and IHC each require an independently owner-chosen protected terminal. Those destinations have not been supplied or approved for activation, and each must remain distinct from every configured Twilio ingress and public carrier source. Phoenix and IHC may share a graph-safe sink only if the owner explicitly chooses and verifies that topology; WeatherTech OS must never infer it.
- The completed Tucson path currently uses the exact shared Production voice webhook and persists bounded call/status evidence. Its protected destination must move off the Phoenix public carrier line before Phoenix carrier forwarding can be enabled, or Tucson calls would re-enter through the Phoenix route.
- Twilio numbers documented only by masked endings `1326` and `6930` are already owned in the same Twilio account, Voice/SMS capable, and associated with the existing Messaging Service. Their incoming Voice URL, backup URL, and number-level status callback were blank at the latest provider inspection. Tucson ending `3145` retains the established signed Production Voice webhook.
- The post-deployment, pre-activation Vercel audit found Tucson safely disabled with its protected destination present; Phoenix/IHC route destinations remain absent, while the Phoenix/IHC enable gates and all three terminal attestations are saved explicitly `false`. The public-source preparation did not overwrite the exact Phoenix, Tucson, or IHC ingress identity. Those later environment saves are not active until an exact reviewed redeploy, and no corrected Production deployment, carrier forward, Twilio Voice URL save, or real call has occurred.
- Existing `business_phone_numbers`, `call_records`, and `communication_provider_events` schema is sufficient; no migration is expected.
- Baseline evidence: Phoenix has one authenticated inbound SMS record/event and no voice record; Tucson has two authenticated inbound SMS records/events plus two completed owner-confirmed call lifecycles; IHC has no SMS or voice evidence. Outbound SMS, standalone/application-initiated calls, recording, and transcription remain at zero.
- Protected starting hashes:
  - `.env.local`: `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.
  - `supabase/migrations/0026_property_intelligence_foundation.sql`: `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e`.
  - `supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql`: `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`.
- WeatherTech Tucson Inbound Voice Forwarding Phase 1 is released and closed. This sprint may generalize the shared voice implementation and later replace only Tucson's protected terminal destination, but it must not alter Tucson's customer-facing Twilio number, signed webhook identity, SMS behavior, call-evidence contract, or completed historical evidence.

## Owner-Approved Scope

- Generalize the existing signed inbound voice handler from Tucson-only to three explicit route definitions while preserving the existing canonical POST endpoints.
- Add separate protected, server-only Phoenix and IHC voice enable gates, protected forwarding destinations, and protected public carrier-source values. Keep all destinations and public-source values out of `NEXT_PUBLIC_`, source control, logs, ordinary database rows, client payloads, and unmasked readiness output.
- Support an independently configured protected terminal destination for each route. Tucson may use only the verified assistant line; Phoenix and IHC require independently owner-chosen protected terminals. No destination may equal any configured Twilio ingress, public carrier source, or a caller that could re-enter the graph. A shared Phoenix/IHC sink is allowed only when explicitly owner-chosen, independently verified, and graph-safe; it is never a readiness prerequisite.
- Keep Tucson's existing route-specific gate and destination configuration compatible. The assistant-line no-forwarding prerequisite applies only to Tucson; Phoenix and IHC remain blocked until their protected terminal destinations are independently chosen and every forwarding/ring path on each configured sink is verified disabled.
- Preserve `TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED` only as the legacy Tucson assistant attestation. Add `TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED` and `TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED` so each independently chosen Phoenix/IHC terminal remains blocked until the owner verifies unconditional, busy, no-answer, simultaneous-ring, hunt-group, and every other forwarding path on that exact route terminal is disabled.
- Resolve every voice request from Twilio's signed `To` number to exactly one configured account, active business-number row, connected same-company integration, routing key, company, location, queue, lead source, and `sms_voice` channel. Phoenix and IHC must never fall back to Tucson or to each other.
- Return SDK-generated `<Dial>` TwiML only for the exact enabled route and its protected terminal. Preserve `answerOnBridge`, bounded timeout, disabled recording/transcription, POST dial-result handling, and no Twilio REST call.
- Reject malformed or duplicate critical fields, invalid signatures, wrong accounts, wrong receiving numbers, disabled routes, missing/invalid destinations, cross-company rows, self-forwarding, any public-source or Twilio-ingress destination, and any configured cycle before TwiML or persistence.
- Persist bounded, idempotent, company/branch-scoped call and provider-event evidence using the existing schema. Status callbacks may update only an exact already-claimed parent/child call graph and remain rollback-safe after a route is returned from `sms_voice` to `sms`.
- Preserve the caller's identity on each terminal handset. WeatherTech OS must show the exact receiving company/branch route; no terminal identity may grant authority to another route.
- Make Unified Inbox call/SMS conversation grouping and receiving-route resolution company-safe so identical external phone numbers cannot merge WeatherTech and IHC histories.
- Extend owner-only readiness and Integration Center UI to show masked/boolean state for Tucson, Phoenix, and IHC separately, including gate, protected source/destination validity, loop state, exact `sms_voice` route state, shared webhook URL, and exact next action.
- Preserve existing inbound SMS behavior for all three Twilio numbers and keep outbound SMS disabled. Document truthfully that carrier voice forwarding does not forward SMS sent to the public Verizon/AT&T numbers.
- Add focused unit, static, route, identity, persistence, concurrency/replay, rollback, privacy, UI, hosted regression, and Browser validation without a real provider call or SMS.
- If all non-Production gates pass, create and push one focused implementation commit, merge through the established pull-request procedure, deploy the exact merge SHA disabled by default, and stop at owner-only carrier/Twilio/live-call actions.

## Explicit Exclusions

- No port, transfer, release, reassignment, cancellation, ownership change, carrier change, or purchase for any Verizon, AT&T, Twilio, or other number.
- No carrier forwarding change by Codex. The owner must authenticate to Verizon and AT&T and configure or remove forwarding only after each route's application readiness is independently green.
- No Twilio Console number mutation until the owner is signed in and the exact route is ready. Only the Phoenix and IHC **A call comes in** POST webhook may later be set to the existing canonical Production voice endpoint; Tucson's provider configuration remains unchanged.
- No real Tucson, Phoenix, or IHC test call without separate owner approval for that exact test after protected configuration, route state, deployment, carrier forwarding, and Twilio webhook checks pass.
- No public carrier-number SMS ingestion claim. Standard voice call forwarding does not deliver texts. Do not enable hosted messaging, carrier messaging APIs, SMS forwarding, number hosting, or porting in this sprint.
- No outbound SMS/MMS, automatic reply, campaign, reminder, bulk messaging, A2P registration submission, sender registration, or outbound messaging enablement. A2P remains a later prerequisite before application-originated US 10DLC messaging.
- No call recording, voicemail recording, transcription, speech recognition, IVR, queue, conference, simultaneous ring, automated customer message, or automatic lead/customer/job/estimate/task creation.
- No hard-coded public number or destination and no full number in governance, source, tests, logs, screenshots, support output, or browser-visible variables.
- No new phone number, schema migration, RLS change, table, destructive database operation, or historical migration change.
- No `.env.local`, package/lockfile, proposal/e-signature, GoHighLevel, Gmail, Calendar, Yelp, Stripe, QuickBooks, Customer Portal, or unrelated application/provider change.
- No change to the completed Tucson public number, SMS webhook, existing SMS evidence, completed call evidence, or provider Voice URL.
- No later sprint selection or implementation.

## Completion Criteria

- The configured graph is proven acyclic: Tucson terminates only at the verified assistant line, while Phoenix and IHC terminate at independently owner-chosen protected destinations. No destination equals a public source or Twilio ingress, any shared Phoenix/IHC sink is explicit rather than inferred, and every configured terminal has no forwarding or recursive ring path.
- Valid signed calls to the exact enabled Phoenix and IHC Twilio ingress numbers return safe SDK-generated route-specific `<Dial>` TwiML and cannot cross tenant or branch boundaries.
- Existing Tucson calls continue using the same signed ingress contract after its protected terminal destination is changed; Tucson SMS and historical call evidence remain unchanged.
- Wrong-route/account/company/channel, malformed, duplicate, disabled, missing-config, replay-conflict, forged-status, and loop attempts fail closed without false persistence or TwiML.
- Each route's call and status evidence is exact, idempotent, bounded, privacy-safe, and independently visible in WeatherTech OS; no raw destination is stored.
- Unified Inbox never groups WeatherTech and IHC communications solely because they share an external phone number or email.
- Owner-only readiness exposes only masked/boolean configuration evidence and reports each route independently.
- Phoenix/IHC public carrier voice can be forwarded to their hidden Twilio ingress numbers without changing public ownership. Customers keep calling the existing public lines.
- Public-line inbound SMS remains at the existing carriers unless a separate hosted-messaging/API/port decision is later approved; SMS sent directly to the existing Twilio numbers retains the established OS ingestion path.
- No migration is added; local, regression, and Production ledgers remain exact `51/51`.
- Focused tests, complete repository tests, type-check, lint, Production build, dependency audit, secret scan, migration integrity, protected hashes, `git diff --check`, hosted regression, targeted Browser validation, and the full established isolated Browser suite pass with zero residue and no provider call/message.
- The exact implementation SHA passes pull-request CI/preview, established merge procedure, main-push CI, and disabled-by-default Production health/readiness verification.
- Before carrier/provider activation, the owner securely supplies the independently selected Phoenix and IHC terminal destinations, verifies every forwarding/ring path on each configured terminal is disabled, records only the exact route's protected attestation, authenticates to Twilio/Verizon/AT&T, and separately approves each real validation call.

## Validation Plan

- Reverify exact Git refs, clean tree, governance, protected hashes, Production health, `51/51` migration parity, exact route metadata, Vercel variable-name inventory, provider number capabilities/configuration, and call/SMS baselines.
- Unit-test route-specific destinations and terminal attestations, canonical signed URL handling, duplicate/bounded form fields, exact account/To/company/branch identity, graph-wide loop detection, strict E.164 values, disabled/missing config, SDK TwiML, recording/transcription locks, and masked readiness.
- Runtime-test Phoenix and IHC exact ingress/status persistence, known/unknown/ambiguous callers, same external caller across two companies, partial-claim recovery, concurrency, replay, conflict, rollback-safe status, and zero forbidden side effects.
- Regression-test the existing Tucson/Phoenix/IHC SMS paths and company/route labels with outbound messaging disabled.
- Test company-safe Unified Inbox grouping by exact company plus route/contact identity rather than phone/email alone.
- Run all repository tests, type-check, lint, Production build, dependency audit, migration integrity, secret/protected-file/scope/whitespace checks, and a final independent security diff audit.
- Run write-capable tests only against the exact guarded regression project with captured-ID cleanup and zero residue. Run targeted and full Browser regression without provider calls or messages.
- Push exactly one focused implementation commit on a `codex/` branch, require exact-head CI and preview, merge through the established merge-commit procedure, require main-push CI and exact-SHA Production deployment, and verify health/readiness with Phoenix/IHC gates off.
- Stop before any carrier forwarding, Twilio number save, route channel activation, protected terminal replacement, or real call that requires owner/provider action. The assistant must never be entered as the Phoenix destination. Provide the exact ordered owner steps and rollback at that boundary.

## Release Commits

- Approval record: this governance-only commit; Git history is authoritative for its immutable hash.
- Initial implementation: `110a8521bf9fffb29bf88f6333a6a4fc6d87c3ee`.
- Initial merge and disabled-first Production deployment: `b5331540d3816476f83358f942fb3dfc6f5f82b8`.
- Corrective distinct-terminal implementation, merge, and Production deployment: pending.
- Documentation closeout: pending after owner-only activation and approved live validation.

## Final Status

Approved corrective topology rework in progress. Phoenix/IHC provider and carrier activation remains stopped.

## Notes

The corrected approved topology keeps all public carrier ownership unchanged, uses the already-owned Twilio numbers only as hidden voice ingresses, and assigns each route its own protected terminal authority. The verified assistant line is Tucson-only. Every configured terminal must remain a sink: any call-forwarding, hunt-group, simultaneous-ring, or recursive ring path fails the activation gate. A Twilio `<Dial>` child leg is part of an authenticated inbound-call lifecycle; it is not a standalone application-originated call.
