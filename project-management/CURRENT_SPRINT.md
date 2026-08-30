# Current Sprint

This file records the most recently owner-approved WeatherTech OS sprint and its lifecycle status. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md), [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md), and this file before development.

## Approval Status

Completed

The owner made the final routing decision on 2026-08-29: WeatherTech Phoenix and IHC remain direct carrier voice lines and must not be routed through Twilio. Tucson remains the only WeatherTech OS voice route. This approval authorized the narrow repository, Vercel, Twilio inspection, validation, commit, pull-request, merge, deployment, and documentation work needed to reconcile the already implemented multi-route foundation with that final architecture. It did not authorize a real call, carrier forwarding, porting, number ownership changes, outbound messaging, recording, transcription, automatic replies, or automatic CRM creation.

## Sprint Name

WeatherTech Final Phone Routing Reconciliation — Tucson-Only Twilio Voice

## Objective

Preserve the completed WeatherTech Tucson signed inbound voice route to the verified assistant while removing Phoenix/IHC voice destinations, public sources, gates, attestations, readiness blockers, and activation guidance. Keep WeatherTech Phoenix public voice directly on Verizon and IHC public voice directly on AT&T. Keep their existing Twilio numbers as exact, company-separated SMS-only ingresses with blank Voice handling.

## Owner

Joe Harris

## Owner Approval Date

2026-08-29.

## Verified Starting State

- Canonical repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`; starting `main` SHA `e71642014634f3ab5020d1fa7cf7778d7666dc80`.
- The starting tree and index were clean, local `main` matched `origin/main`, and no merge, rebase, cherry-pick, or bisect was in progress.
- Production Supabase remains healthy with local and Production migration ledgers exact at `51/51`; no migration is required.
- Three exact active Twilio identities exist: `weathertech-tucson` is `sms_voice`; `weathertech-phoenix` and `ihc-primary` are `sms`.
- Tucson ending `3145` retains the signed Production Voice POST webhook and the established signed SMS path. Its protected destination is the owner-verified assistant line, which is Tucson-only and has no forwarding or ring group.
- Phoenix ending `1326` and IHC ending `6930` retain their established SMS configuration. Their Voice URL, backup URL, number-level status callback, and recording configuration are blank.
- WeatherTech Phoenix public voice remains with Verizon and IHC public voice remains with AT&T. The owner does not authorize carrier forwarding for either route.
- Historical Tucson evidence remains exactly two completed owner-confirmed calls of 15 and 18 seconds, two `voice_inbound` events, and two `voice_status` events with working two-way audio.
- SMS evidence remains Tucson two messages/two events, Phoenix one/one, and IHC zero/zero. No outbound SMS, automatic reply, recording, transcript, or automatic CRM side effect is authorized.
- Protected starting hashes:
  - `.env.local`: `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.
  - `supabase/migrations/0026_property_intelligence_foundation.sql`: `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e`.
  - `supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql`: `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`.

## Owner-Approved Scope

- Make Tucson the sole application voice route. Only its exact signed receiving number, `sms_voice` database identity, protected destination, gate, terminal attestation, and loop checks may produce SDK-generated `<Dial>` TwiML.
- Keep loop protection against all three configured Twilio ingress numbers and terminal-origin recursion. Preserve exact account, company, branch, persistence, replay, status, privacy, recording, transcription, and no-outbound-call boundaries.
- Remove Phoenix/IHC public-source, voice-destination, voice-gate, and terminal-attestation requirements from server configuration, readiness, Integration Center guidance, deployment safety inventories, examples, CI, tests, and runbooks.
- Ensure obsolete Phoenix/IHC voice environment values cannot activate a voice route. A signed Phoenix or IHC voice request must fail closed without TwiML or persistence.
- Preserve all three exact inbound SMS mappings and company/branch identities. Phoenix and IHC remain `communication_channel='sms'`; Tucson remains `sms_voice`.
- Reconcile Vercel Production by retaining only the required Tucson voice variables and removing obsolete Phoenix/IHC voice variables without exposing their values.
- Preserve the Tucson Twilio Voice webhook and keep the Phoenix/IHC Twilio Voice handling blank.
- Update owner-facing readiness so Tucson alone has voice readiness while Phoenix and IHC truthfully report direct-carrier voice and SMS-only Twilio ingress.
- Run focused, complete, hosted isolated, Browser, security, CI, deployment, and health validation without a real provider call or message.
- Commit, push, merge, and deploy the exact reviewed correction, then close the sprint only after exact-SHA Production health and configuration verification pass.

## Explicit Exclusions

- No port, transfer, release, reassignment, cancellation, ownership change, carrier change, or purchase for any Verizon, AT&T, Twilio, or other number.
- No Verizon or AT&T forwarding change. Phoenix and IHC continue ringing directly through their existing carriers.
- No Voice URL, TwiML App, Studio Flow, SIP trunk, callback, recording, or other voice configuration on the Phoenix or IHC Twilio numbers.
- No real Tucson, Phoenix, or IHC call and no inbound provider SMS test without a separate exact approval.
- No outbound SMS/MMS, standalone outbound calling, automatic reply, campaign, reminder, A2P submission, recording, transcription, speech recognition, IVR, queue, conference, or automatic CRM creation.
- No public carrier-number SMS ingestion claim. SMS sent to the public Verizon/AT&T numbers does not enter WeatherTech OS through the Twilio ingresses.
- No schema migration, RLS change, destructive database operation, historical migration change, `.env.local` change, package/lockfile change, or unrelated application/provider change.
- No rewriting or deleting the historical Tucson call/SMS evidence.
- No later sprint selection or implementation.

## Completion Criteria

- Tucson is the only application voice route and the only voice readiness card/action.
- Phoenix and IHC remain direct carrier voice lines; their Twilio identities remain exact SMS-only routes with blank Voice handling and no destination requirement.
- Obsolete Phoenix/IHC voice variables are absent from source examples, readiness requirements, CI, and final Vercel Production configuration.
- Signed Phoenix/IHC voice ingress and status attempts fail closed without `<Dial>`, call rows, or provider events, even if obsolete environment names are present.
- Tucson accepts only an exact valid signed request after its gate, terminal attestation, strict destination, `sms_voice` row, and complete ingress-loop checks pass.
- Tucson SMS, Phoenix SMS, IHC SMS, company isolation, bounded call evidence, replay behavior, recording/transcription locks, and outbound locks remain unchanged.
- No migration or Production database mutation occurs; ledgers remain exact `51/51` and protected hashes remain exact.
- Focused tests, every top-level test, type-check, lint, Production build, dependency audit, migration integrity, secret/protected-file/scope checks, hosted voice/SMS regression with zero residue, targeted Browser validation, and the complete established Browser suite pass.
- Exact-head pull-request CI, merge/main CI, exact-SHA Production deployment, canonical HTTP 200 health, and owner-only readiness/configuration verification pass.
- No real call, carrier change, number mutation, outbound message, recording, transcription, or automatic CRM side effect occurs.

## Validation Plan

- Reverify Git identity, clean tree, protected hashes, migration parity, Production health, route rows, environment-variable name inventory, provider Voice/SMS configuration, and historical evidence.
- Unit-test Tucson-only route selection, strict protected destination, all-ingress and terminal-origin loop refusal, signed account/To/company/branch identity, exact `sms_voice` capability, SDK no-recording TwiML, bounded persistence, replay/conflict/status handling, and masked readiness.
- Prove Phoenix and IHC remain SMS-only and cannot gain voice capability from a database row or stale environment variable.
- Run the guarded hosted Tucson voice lifecycle and existing SMS lifecycle only against the pinned regression project, followed by independent zero-residue verification.
- Run every repository test, type-check, lint, Production build, dependency audit, migration integrity, protected-file, secret, scope, and whitespace checks.
- Run targeted Integrations and Production Readiness Browser validation plus the complete isolated Browser suite with no provider call/message and zero residue.
- Perform a final independent security and scope audit.
- Push one focused implementation commit on a `codex/` branch, require exact-head CI/preview, merge through the established procedure, require main-push CI, deploy the exact merge SHA, and verify canonical health/readiness.
- After rollout evidence is complete, record the sprint in `COMPLETED_SPRINTS.md`, update this file to `Completed`, reconcile `NEXT_SPRINT.md`, `ROADMAP.md`, and `CHANGELOG.md`, and create at most one documentation-only closeout commit.

## Release Commits

- Original carrier-forwarding foundation implementation: `110a8521bf9fffb29bf88f6333a6a4fc6d87c3ee`.
- Original carrier-forwarding foundation merge: `b5331540d3816476f83358f942fb3dfc6f5f82b8`.
- Distinct-terminal corrective implementation: `f18f6cb20836060b00a0a58f1ec477a9e5209a0e`.
- Distinct-terminal corrective merge: `e71642014634f3ab5020d1fa7cf7778d7666dc80`.
- Final Tucson-only reconciliation implementation commits: `d72b1512f0195d3186dda91f04641c343855d407` and `8d22457362008492fab69e7ed6bee929f74103bc`.
- Pull request: `#18`.
- Final Tucson-only reconciliation merge: `690c22083165ebd55882b51172c9ac92e1f745f8`.

## Completion Evidence

- Main CI run `33284946637` completed successfully, including repository-validation job `99186398668` and isolated-Supabase job `99186677967`.
- The final environment-cleanup Production deployment is `dpl_ESK8ZVaXyRuqG3k2AHkfLdBuSCPi`. Canonical `/api/health` returns HTTP `200` and reports exact merge SHA `690c22083165ebd55882b51172c9ac92e1f745f8`; `/api/readiness` remains truthfully HTTP `503` under the existing broad production-approval controls.
- Production Supabase remains exact at `51/51` local/remote migrations with no mismatch and no sprint database write.
- Final routing is exact: `weathertech-phoenix` remains active `sms` with direct Verizon carrier voice; `weathertech-tucson` remains active `sms_voice` with the sole signed Twilio Voice route to its protected verified assistant destination; and `ihc-primary` remains active `sms` with direct AT&T carrier voice. Phoenix and IHC Twilio Voice handling remains blank.
- Historical evidence is unchanged: Tucson retains two completed call rows, two `voice_inbound` events, two `voice_status` events, two inbound SMS messages, and two inbound SMS events; Phoenix retains one inbound SMS message and one inbound SMS event; IHC remains at zero messages and zero events. There are zero active or outbound calls, outbound SMS, recording events or artifacts, transcript artifacts, automatic replies, automatic lead flags, or voice CRM links.
- The earlier full isolated Browser run `20260829235055033` recorded `29/31`; its two unrelated transient groups then passed the isolated `2/2` confirmation run `20260830001525831`. The later definitive frozen-tree full run `20260830015820614` satisfied the unchanged completion gate: all `24/24` groups and `31/31` assertions passed, console errors/warnings were `0/0`, harness cleanup reported `residueVerified: true`, and independent `verify-residue` passed with `0` residue on the approved regression target. Targeted Settings and Production Readiness Browser validation also passed without console errors or residue.
- Six obsolete Production Vercel variable names were removed: `TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER`, `TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED`, `TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED`, `TWILIO_IHC_PUBLIC_NUMBER`, `TWILIO_IHC_VOICE_FORWARDING_ENABLED`, and `TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED`.
- Exactly twelve required Production Twilio variable names remain: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_PUBLIC_BASE_URL`, `TWILIO_INBOUND_SMS_ENABLED`, `TWILIO_OUTBOUND_SMS_ENABLED`, `TWILIO_WEATHERTECH_PHOENIX_NUMBER`, `TWILIO_WEATHERTECH_TUCSON_NUMBER`, `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED`, `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO`, `TWILIO_IHC_NUMBER`, and `TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED`. No values are recorded here.
- No live call or message was placed, and no Twilio-provider, carrier, phone-number, or Production database mutation occurred. The Twilio number configuration remained exact: Tucson retained its working Voice webhook, while Phoenix and IHC retained blank Voice handling and their existing SMS configuration.

## Final Status

Completed. The owner-approved Tucson-only Twilio Voice architecture is deployed, healthy, database-verified, and closed. No owner-only Phoenix or IHC destination, carrier-forwarding, Twilio Voice, or live-call action remains, and no subsequent sprint is active.

## Notes

The final owner architecture is intentionally simple: Phoenix voice stays on Verizon, IHC voice stays on AT&T, Tucson alone uses Twilio voice forwarding to the verified assistant, and the existing Phoenix/IHC Twilio numbers remain useful only as distinct SMS ingresses. A future change to Phoenix or IHC voice would require a new explicit owner-approved rework sprint.
