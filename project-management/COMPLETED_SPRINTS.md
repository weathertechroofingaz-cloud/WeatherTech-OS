# Completed Sprints

This file records completed WeatherTech OS sprints after validation, commit, push, and remote synchronization.

## Recent Verified Sprints

### WeatherTech OS — AI 3.0 Production Automation & OS Launch

- Feature release: PR #20 merged as `aba92efeb78459fabfe00862467d9bc1b22128c6`.
- Migration recovery: PR #21 merged as `76eba068d1c08a87f09899f84f4931cd1fc07d35` from commits `53708d420bcd2f810c1c263045b1bfbbc95cc451` and `5eb89752c10c938f0998f378807cb371bd0a6c2b`.
- Closeout: this documentation-only change; use Git history for its immutable commit and pull request.
- Result: Completed, reviewed, merged, exact-SHA deployed, and Production-verified with the company-scoped Automation Engine and owner Automation Control Center active behind preserved approval/provider boundaries.
- Validation:
  - All 64 top-level tests, type-check, lint, Production build, high-severity dependency audit, migration integrity, whitespace, hosted regression, complete Browser, and security gates passed.
  - Production Supabase applied the exact ordered fifteen-migration suffix and now matches repository/regression at `66/66`; repeat dry-run is empty, catalog/RLS/ACL contracts passed, and ERROR-level lint is clean.
  - Exact Production redeploy `dpl_CKoXgxtMpDcRC1ekTZ3YSAxaKC5t` is `READY` at main SHA `76eba068d1c08a87f09899f84f4931cd1fc07d35`; canonical `/api/health` returned HTTP 200 with that SHA.
  - Production retained two disabled company AI policies with zero monthly budget and zero AI request, audit, token, cost, saved-work, or action activity.
  - A natural scheduler tick recorded exactly 14 existing due-task events and matching audits; repeated ticks were idempotent. Automation executions, attempts, and newly created tasks remained zero.
  - Independent before/after checks found no unexpected business, provider, communications, Stripe, or financial count/fingerprint change and no real provider/customer action.
- Remaining owner decisions: positive AI budget and per-company enablement; official Mighty Apes test and authoritative Tucson/IHC campaign IDs; IHC inbound SMS validation; electronic-signature legal review; and Production backup/PITR policy. This closeout authorizes none of them.

### WeatherTech Final Phone Routing Reconciliation — Tucson-Only Twilio Voice

- Implementation commit: `d72b1512f0195d3186dda91f04641c343855d407` (`fix: keep Phoenix and IHC voice carrier-direct`)
- Review follow-up commit: `8d22457362008492fab69e7ed6bee929f74103bc` (`fix: surface SMS-only route drift`)
- Merge commit: `690c22083165ebd55882b51172c9ac92e1f745f8`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Pull request: #18
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, reviewed, merged, exact-SHA deployed, and reconciled to the owner's final carrier-direct Phoenix/IHC and Tucson-only Twilio Voice architecture without changing any carrier-number ownership or placing another live call.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `46/46 pass`; type-check, lint, Production build, dependency audit with zero vulnerabilities, migration integrity, protected-file, secret, focused diff, and `git diff --check` gates: `pass`
  - Hosted isolated Tucson Voice and three-identity inbound SMS regressions: `123` and `71` assertions passed respectively, with no Twilio/carrier network request and independently verified zero residue
  - Targeted Settings and Production Readiness Browser run `20260829234956799`: `2/2 pass`. The earlier diagnostic full run `20260829235055033` recorded `29/31 pass`, with only two unrelated transient Marketing/Inspections timeouts; isolated confirmation run `20260830001525831` reran those exact two groups at `2/2 pass`. The definitive frozen-tree full run `20260830015820614` then satisfied the unchanged completion gate: all `24/24` groups and `31/31` assertions passed, console errors/warnings were `0/0`, harness cleanup reported `residueVerified: true`, and independent `verify-residue` passed with `0` residue on the approved regression target.
  - PR-head GitHub Actions run `33284789723`: repository-only job `99185988434` succeeded for reviewed head SHA `8d22457362008492fab69e7ed6bee929f74103bc`; isolated-Supabase job `99186263373` was correctly skipped for the pull request
  - Main-push GitHub Actions run `33284946637`: repository-only job `99186398668` and protected isolated-Supabase lifecycle job `99186677967` both succeeded for exact merge SHA `690c22083165ebd55882b51172c9ac92e1f745f8`; every substantive repository and zero-residue lifecycle step passed
  - Post-cleanup Vercel Production deployment `dpl_ESK8ZVaXyRuqG3k2AHkfLdBuSCPi` reached `READY`, owned the canonical Production alias, and served exact merge SHA `690c22083165ebd55882b51172c9ac92e1f745f8`. Canonical `/api/health` returned HTTP 200 and `healthy`; `/api/readiness` truthfully returned HTTP 503 under the broad provider-safety policy while exposing only the enabled inbound-SMS, global terminal-attestation, and Tucson Voice gates, with runtime, environment, staging, auth, Supabase, and activation checks passing and zero Vercel error-level runtime logs since the redeploy.
- Database, routing, and provider state:
  - No migration or Production data change was required. Local, regression, and Production migration ledgers were exact at `51/51` at that sprint checkpoint.
  - WeatherTech Phoenix public voice remains direct with Verizon, while its distinct Twilio ingress remains SMS-only with Voice handling blank. IHC public voice remains direct with AT&T, while its distinct Twilio ingress remains SMS-only with Voice handling blank. Tucson remains the sole Twilio Voice route, using its protected destination and canonical signed WeatherTech OS Voice POST route; all three SMS identities remain company/branch distinct.
  - Runtime authorization rejects Phoenix/IHC Voice ingress and status requests even if stale environment or database drift reappears; Tucson alone may return SDK-generated `<Dial>` TwiML after exact account, receiving-number, signature, destination, route, gate, and loop validation. Recording, transcription, outbound messaging/calling, automatic replies, and automatic lead creation remain unavailable.
  - Existing Production communications evidence is unchanged: Tucson retains the two previously owner-verified completed call records and four matching voice events; inbound SMS remains Tucson two received/two completed events, Phoenix one/one, and IHC zero/zero. This sprint placed no live call and created no Production call, SMS, lead, customer, job, estimate, task, or provider-event record.
  - Production now retains exactly `12` required Twilio configuration keys across account/service credentials, canonical base URL, inbound/outbound safety gates, three ingress identities, global terminal attestation, and the Tucson-only destination/gate. Exactly `6` obsolete Phoenix/IHC public-source, Voice-gate, and terminal-attestation graph keys were removed categorically; automation did not print a protected value or add one to source, governance, or logs.
  - Twilio provider configuration was re-verified in its final state: Phoenix and IHC incoming Voice handling are blank, Tucson alone uses the canonical Voice webhook, and existing inbound SMS handling remains intact. No Twilio number or carrier number was purchased, ported, released, reassigned, transferred, or otherwise modified; no Verizon/AT&T forwarding, recording, transcription, outbound communication, auto-response, or other prohibited provider action occurred.
- Notes:
  - The automated PR review's single SMS-only drift finding was corrected in the follow-up commit: Phoenix/IHC channel drift now makes readiness non-exact and signed routing fail closed, while Tucson preserves exact rollback-safe SMS/Voice compatibility. The review thread was resolved, and focused post-review security validation remained clear with no reportable P0-P2 finding.
  - The protected Tucson destination remains server-only and may be changed later through Production configuration without an application-code rewrite. This closeout grants no authority for a new real test call or broader provider activation.
  - No next sprint was selected, approved, promoted, or started.

### WeatherTech Tucson Inbound Voice Forwarding Phase 1

- Implementation commit: `0ed7b07c3ee45d77508890dfda8d5f45b1cc1ef0`
- Merge commit: `2ace30ba04edfb0743b63ee050c7f3845540fe54`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Pull request: #14
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, merged, exact-SHA deployed, configured only for WeatherTech Tucson, and live-validated through two intentional owner-controlled inbound calls without activating Phoenix/IHC voice or any excluded automation.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `45/45 pass`; type-check, lint, Production build, dependency audit with zero vulnerabilities, migration integrity, protected-file, secret, scope, and `git diff --check` gates: `pass`
  - Focused Tucson voice security, route/inbox identity, inbound SMS, and hosted voice/SMS lifecycle suites: `pass`, with no Twilio provider request from automated validation and zero isolated-target residue
  - Targeted Browser run `20260825022712513`: `4/4 pass`; complete isolated Browser run `20260825022840810`: all `24/24` groups and `31/31` assertions passed with zero console errors, zero console warnings, bounded cleanup, and independently verified zero residue
  - PR-head GitHub Actions run `32802756048`: repository-only job `97666732131` succeeded for implementation SHA `0ed7b07c3ee45d77508890dfda8d5f45b1cc1ef0`; isolated-Supabase job `97667112021` was correctly skipped for the pull request
  - Main push GitHub Actions run `32802962484`: repository-only job `97667369745` and protected isolated-Supabase lifecycle job `97667830543` both succeeded for exact merge SHA `2ace30ba04edfb0743b63ee050c7f3845540fe54`
  - Gate-on Vercel Production deployment `dpl_BzukHpKwCH1HTWqNMHyxJsNLrAx6` completed `READY` for exact merge SHA `2ace30ba04edfb0743b63ee050c7f3845540fe54`; canonical `/api/health` returned HTTP 200 with that SHA, while `/api/readiness` truthfully remained HTTP 503 under the broad owner/provider safety gate
- Database and provider state:
  - No migration was added or applied. Local, regression, and Production ledgers were exact at `51/51` at that sprint checkpoint.
  - The owner configured the destination only in protected Vercel Production configuration. At that closeout checkpoint, the value had not been recorded in chat, Git, logs, screenshots, governance, browser-visible variables, or ordinary database output.
  - Only `weathertech-tucson` changed from `communication_channel='sms'` to `communication_channel='sms_voice'`. `weathertech-phoenix` and `ihc-primary` remain SMS-only and company/branch distinct.
  - Only the Tucson Twilio number's incoming Voice webhook was set to the canonical WeatherTech OS Tucson Voice POST endpoint. The existing inbound SMS webhook and evidence remained intact; Phoenix and IHC voice settings remained untouched.
  - Production contains exactly two completed Tucson call records, bounded to `15` and `18` seconds, and exactly four matching voice provider events. Both owner-controlled calls had confirmed two-way audio. No active call or forbidden side effect remains.
  - Existing SMS evidence is unchanged: Tucson remains at two received messages/two completed SMS events, Phoenix remains at one/one, and IHC remains at zero/zero pending its separately gated carrier-ingress validation.
- Notes:
  - The owner initially approved one controlled live call. Monitoring stopped when a second call appeared; the owner then confirmed both calls were intentionally placed by the owner and both had two-way audio. This factual closeout does not retroactively describe the second call as preauthorized and grants no authority for another validation call.
  - Recording and transcription remain `not_requested`. Outbound SMS, automatic replies, automatic lead/customer/job/estimate/follow-up/task creation, Phoenix/IHC voice, MMS, campaigns, reminders, and broad provider activation remain disabled or separately gated.
  - No Verizon, AT&T, or Twilio number was purchased, ported, released, reassigned, transferred, or otherwise modified beyond Tucson's exact approved Voice webhook setting.
  - The forwarding destination, full phone numbers, credentials, and provider call identifiers remain excluded from governance. The owner may later change the protected destination without an application-code rewrite, but this completed sprint grants no continuing configuration authority.
  - Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This voice sprint neither changes that gate nor authorizes legal-language changes.
  - No next sprint was selected, approved, promoted, or started.

### Proposal-to-Sold Job Operational Completion Phase 1

- Implementation commit: `b694ad844af48fb23d1849f3180382a016056441`
- Merge commit: `7186001eec28177a32b454168e5fd05b43af9937`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, merged, pushed, deployed, migrated, and validated in Production without sending a real proposal/signature request or creating a real customer acceptance, deposit, payment, proposal artifact, or sold job.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `42/42 pass`; migration integrity, type-check, lint, Production build, dependency audit with zero vulnerabilities, protected-file checks, and `git diff --check`: `pass`
  - Targeted proposal/signature Browser run `20260824223608414`: `pass`, covering both deposit and no-deposit lifecycle paths, signed-session renewal, exact completed-receipt access, zero residue, and zero console errors or warnings
  - Complete isolated Browser run `20260824231426642`: all `24/24` groups and `31/31` assertions passed with bounded cleanup, independently verified zero residue, and zero console errors or warnings
  - GitHub Actions push run `32790490435`: repository-only job `97630910053` and protected isolated-Supabase lifecycle job `97631410575` both `success` for exact merge SHA `7186001eec28177a32b454168e5fd05b43af9937`
  - GitHub/Vercel Production deployment `6073515066`, status `17277113969`, completed successfully for exact merge SHA `7186001eec28177a32b454168e5fd05b43af9937`
  - Production database catalog, privilege, isolation, private-Storage, and unchanged-data checks passed. Canonical `/api/health` returned HTTP 200 at the exact merge SHA; security-route checks and authenticated read-only Browser smoke passed with zero console errors or warnings. `/api/readiness` truthfully remained HTTP 503 under the unchanged provider/owner activation gate.
- Database:
  - Historical starting state: local and Production migration ledgers matched all `50/50` committed migrations before this sprint's additive migration.
  - `20260824044610_native_proposal_esign_sold_job_gate.sql` — SHA-256 `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`
  - Exactly that one approved additive migration was applied through the established explicit Production workflow. Local, regression, and Production ledgers matched all `51/51` committed migrations at that sprint checkpoint, with no pending, remote-only, or mismatched migration.
  - Post-apply verification confirmed the expected additive schema, fixed function search paths, restricted execution/table privileges, company-scoped policies, private `customer-documents` Storage, zero new proposal-lifecycle table rows, and unchanged pre-existing business/provider baselines.
- Notes:
  - Added exact immutable proposal revisions and customer-safe artifacts, truthful owner-approved Gmail delivery, a narrow hashed-token native customer signing lifecycle, auditable signed receipts/certificates, same-company posted-payment deposit enforcement, and atomic idempotent sold-job conversion for both WeatherTech Roofing LLC and IHC Painting.
  - Validation used isolated synthetic lifecycle data only. No real customer delivery, signature request, acceptance, charge, deposit collection, payment record, proposal artifact, sold job, provider activation, or other Production business-data write occurred.
  - Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This is an operational go-live gate; it does not authorize Codex to invent, rewrite, approve, or represent the legal sufficiency of that language.
  - No next sprint was selected, approved, promoted, or started.

### Secure Company-Scoped Job Photos & Field Upload Reliability Phase 1

- Implementation commit: `b4f5519afc1dd3d5d688f90167a994a8de447c0d`
- CI lifecycle correction: `34b9c6b12c17fafea97eda0d5fd9680fb2d7e450`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, pushed, deployed, both approved Production migrations applied, and read-only Production validated without creating a Production photo or business record.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `36/36 pass`; focused job-photo security: `227 assertions pass`
  - Storage hardening, upload readiness/retry, migration integrity for 50 migrations, regression bootstrap, browser isolation/runtime, type-check, lint, Production build, dependency audit with zero vulnerabilities, secret scan, protected-file checks, and `git diff --check`: `pass`
  - Hosted isolated lifecycle: `pass`, including exact-path delete response and object-absence proof, prompt nonretryable semantic errors, preserved genuine serialization handling, concurrency/recovery boundaries, and zero residue
  - Affected current-byte Browser shard: `4/4 pass`; definitive run `20260822093206385`: all `24/24` groups and `31/31` assertions passed with zero console errors, zero console warnings, bounded cleanup, and independently verified zero residue
  - GitHub Actions run `32566363585`: repository-only job `97015445738` and protected isolated-Supabase lifecycle job `97015702640` both `success`. The preceding run failed before lifecycle bootstrap because that job lacked dependency installation; the narrow correction added locked `npm ci` plus a regression guard, after which the exact-SHA run passed.
  - GitHub Production deployment record `6035568791`, created by `vercel[bot]`, completed successfully for exact SHA `34b9c6b12c17fafea97eda0d5fd9680fb2d7e450`; canonical `/api/health` returned HTTP 200 with that SHA.
- Database:
  - `20260818030913_secure_company_scoped_job_photos.sql` — SHA-256 `eb886e55277c87893d9aaed6affc54f43680235dd6f35e3230d84b47150ed0e3`
  - `20260822054433_job_photo_storage_rollback_retry_correction.sql` — SHA-256 `74a3a130c17e0e8a84f9a1b5dcc544b0c8ea348a98b0f287cc10ca6e7aeeafdb`
  - The exact additive chain was applied through the normal linked workflow. Local, regression, and Production ledgers matched all `50/50` committed migrations at that sprint checkpoint.
  - Production `job-photos` is private with a 25 MiB limit and `image/*` allowlist. Registered reads require company-scoped metadata; uploads require an exact live reservation; rollback deletion is restricted to the immutable original uploader and exact canceling operation; authenticated object update remains denied.
  - Production retained zero `job_photos` metadata rows and zero `job_photo_upload_operations` rows. All job-photo functions retain fixed empty search paths, private base functions remain unexposed, and the correction admits delete preselection only for `storage.object.delete` and `storage.object.delete_many` while preserving genuine serialization failures.
- Notes:
  - App metadata stores only the private object path and never a durable public or signed URL. Authorized short-lived signed preview/copy/open behavior was proven in the isolated hosted and Browser suites at the released code/schema contract; Production had no registered photo on which to create a read-only positive signed-link proof.
  - The original Production orphan remains the only object, with canonical row fingerprint SHA-256 `2e28713e7265081888c5796f7a9372c41c1135da1eed41827c9035b731db8060` unchanged. Public and anonymous HEAD requests were denied; a service-role HEAD positive control succeeded without downloading bytes or exposing the path.
  - `customer-documents` remained private with zero objects. The ten development test leads/intakes, provider rows and activation flags, and unrelated business data remained unchanged. No synthetic Production upload, provider write, customer message, or next-sprint work occurred.
  - `/api/readiness` remains truthfully HTTP 503 because the pre-existing provider/owner safety gate is unchanged; this sprint does not claim broad Production activation.
  - Preserved `supabase/migrations/0026_property_intelligence_foundation.sql` at SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` and `.env.local` at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.

### Lead Attribution & Marketing Accountability Phase 1 — Verified Origin, Funnel & Manual Spend

- Implementation commit: `ba816c2bad315f7ef85051bb3e247f2f965f50b6`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, pushed, deployed, Production migrations applied, and read-only Production validated without creating or backfilling a Production business record.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `33/33 pass`
  - Phase 1 foundation: `307/307 assertions pass`; hosted isolated lifecycle: `183/183 assertions pass`, with zero residue
  - Existing CRM compatibility: `98/98`; Mighty Apes regression: `80/80`; Twilio regression: `57/57`
  - Targeted Browser run `20260816165039517`: `3/3`; post-hardening Sales run `20260816171149423`: `1/1`; complete isolated Browser run `20260816171236859`: `24/24 groups`, `30/30 assertions`, zero console errors, zero console warnings, and zero residue
  - Type-check, lint, production build, dependency audit with zero vulnerabilities, migration integrity, secret scan, `git diff --check`, protected-file checks, and final scope audit: `pass`
  - GitHub Actions run `32073345029`: repository-only job `95521143325` and protected isolated-Supabase lifecycle job `95521700791` both `success`
  - Vercel deployment completed for the exact implementation commit; canonical `/api/health` returned HTTP 200 with that SHA, while `/api/readiness` truthfully remained HTTP 503 under unchanged broad owner/provider approval controls
- Database:
  - `20260816122114_lead_attribution_marketing_accountability_phase_1.sql` — SHA-256 `1cd4051f320fdb82253a92d3b440dbc307a72b8dba78d170f6592ca4545b8622`
  - `20260816143152_lead_accountability_nonretryable_stale_errors.sql` — SHA-256 `618cf2b2d7976758edd24a07f531221ea56686fb3d53dbd6c2598851ed02af6a`
  - `20260816164202_lead_accountability_idempotency_integrity_hardening.sql` — SHA-256 `8c976c8cd21f123e5abca4e5987e4a67301091a108044698ed610e99faea2250`
  - The exact additive chain was applied through the normal linked workflow. Regression and Production ledgers matched all `48/48` committed migrations at that sprint checkpoint.
  - Added company-scoped `marketing_campaigns`, `lead_accountability`, immutable non-PII `lead_accountability_events`, `marketing_spend_months`, and the internal non-PII operation-receipt table. All five contain zero Production rows.
- Notes:
  - Implemented locked first-touch acquisition evidence, source/provider separation, explicit creator versus assigned owner, transactional funnel actions, structured won/lost requirements, same-company repeat opportunities, owner/admin monthly spend, and Phoenix-month accountability formulas with unavailable zero denominators and visible data-quality gaps.
  - Production's ten owner-identified test leads and ten intake records remain unchanged, received no automatic accountability backfill, and are excluded from truthful historical KPI claims. The original 72-table, 277-row baseline fingerprint remains `9750d6d890554fb766f3e5379d6ca49f`.
  - Production contains no real Phase 1 attribution, spend, funnel, or won-value evidence yet. The owner must enter real spend and real operations must create/review accountability records before the dashboard can report defensible business performance.
  - Estimates without an explicit follow-up date remain visible as a data-quality gap; no follow-up SLA was invented. Provider campaigns are not auto-registered, and campaign/spend deletion is not part of Phase 1.
  - Provider mappings, event data, and activation gates remain unchanged. No synthetic Production business data, provider activation, outbound message, environment change, broad production approval, protected migration change, or `.env.local` change occurred.
  - Preserved `supabase/migrations/0026_property_intelligence_foundation.sql` at SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` and `.env.local` at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.

### Live Yelp Lead Intake via Mighty Apes — External-Test-Blocked Closeout

- Implementation commit: `103eddab7f464ca9472e8fb8c2b6cc652e7fc89c`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result at that sprint checkpoint: IMPLEMENTATION/SCHEMA/DEPLOYMENT COMPLETE — OFFICIAL PROVIDER TEST WAS BLOCKED BY SIGNING-SECRET CONFIGURATION.
- Validation:
  - GitHub Actions run `31865652902`: repository validation and protected isolated-Supabase lifecycle jobs both `success`
  - Hosted isolated Mighty Apes lifecycle and complete isolated browser regression: `pass`, with bounded cleanup and zero residue
  - Production migration ledger: `45/45` committed migrations
  - Production schema: exact 18-column audit table, 17 constraints, 8 indexes, one company-scoped RLS policy, immutable trigger, and service-role-only `SECURITY INVOKER` transaction RPC
  - Production deployment: READY at the exact implementation commit; `/api/health` HTTP 200 with the exact SHA
  - Production webhook safe check: `GET` HTTP 405 with `Allow: POST` and `Cache-Control: no-store`; no production `POST` was attempted
- Notes:
  - The deployed endpoint is `https://weathertech-os.vercel.app/api/integrations/mighty-apes/yelp/webhook` and implements the verified Mighty Apes raw-body HMAC, timestamp, delivery, version, event, and payload contract.
  - Authenticated `lead.test` is audit-only. Valid `lead.created` processing is atomic, concurrency-safe, idempotent on Yelp `lead.id`, WeatherTech-only, visible through the existing CRM workflow, and creates no fabricated email.
  - Production did not yet contain the signing secret, a provider test delivery, a real Yelp lead delivery, or any Mighty Apes/Yelp webhook audit, intake, sync-log, or CRM lead row at that checkpoint. This closeout did not claim the integration was connected, live, or fully production-validated.
  - Production Yelp connection rows also remained zero; captured business/provider fingerprints were unchanged. Supabase advisors found no new Yelp security issue, only expected unused-index notices on the empty audit table.
  - The Sensitive server-side credential is now present and preserved. The current owner action is to reverify its metadata and the exact deployed revision under separate authorization, then run Mighty Apes' Send Test Delivery. The first real `lead.created` remains a separate future evidence step; do not add, replace, or expose the credential merely because this historical checkpoint recorded it as absent.
  - `/api/readiness` remains truthfully blocked with HTTP 503. No outbound Yelp messaging, unrelated provider activation, broad production approval, synthetic production CRM data, or `.env.local` change occurred.
  - Preserved `supabase/migrations/0026_property_intelligence_foundation.sql` at SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` and `.env.local` at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.

### CRM Identity Integrity Phase 1 — Customer & Property Reconciliation

- Implementation commit: `8ab9f55af5e15ba1706ab71f06ade8312c0f6639`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, pushed, deployed, and production-schema validated without reconciling a production business record.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `28/28 pass`
  - Isolated hosted database lifecycle: `80/80 assertions pass`, with zero residue
  - Targeted reconciliation, Sales, and Estimates browser checks: `pass`
  - Complete isolated Codex Browser suite: `24/24 groups`, `29/29 assertions`, zero console errors, zero console warnings, and zero residue
  - Authenticated read-only production UI check: schema-ready, WeatherTech/IHC company-isolated, unsafe IHC approval disabled, zero mutations, and zero console errors or warnings
  - Type-check, lint, production build, dependency audit, `git diff --check`, migration-integrity checks, and GitHub Actions run `31779710356`: `pass`
- Notes:
  - Added a company-partitioned Customer 360 review queue, conservative exact-evidence candidate selection, explicit reviewed graph selection, and one owner/admin-only transactional reconciliation boundary.
  - Added an immutable audit ledger, stable operation keys, optimistic row versions, deterministic locking, retry/idempotency behavior, and database enforcement that rejects stale, ambiguous, insufficient, or cross-company reconciliation.
  - Applied the exact five-migration chain through the normal linked Supabase path. The isolated regression and Production migration ledgers each matched all `43/43` committed migrations afterward.
  - Production validation found all `41` company-link/reverse-property checks at zero and the exact audit table, `12/12` functions, and `39/39` triggers present. No destructive migration, bulk reconciliation, automatic backfill, merge, customer deletion, provider write, or production business-record reconciliation occurred.
  - Production remained at zero customers and zero reconciliation audit entries, with all `70/70` pre-existing public-table row counts and canonical full-row SHA-256 fingerprints unchanged.
  - A future production reconciliation requires the owner to identify one exact company-scoped graph for explicit review; that is an operational action, not unfinished sprint implementation.
  - Preserved `supabase/migrations/0026_property_intelligence_foundation.sql` at SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` and `.env.local` at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0`.

### Production Connections Phase 1: Twilio/SMS — Owner-Accepted Closeout

- Implementation commit: `e7a5a57f42f3d9dfc482d6b412af9768cf31af94`
- Inventory-blocker checkpoint: `5c1bb7538a023b11606532a1b555b91905b6df42`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed by explicit owner acceptance with known external follow-up; implementation is pushed and deployed, while provider activation remains partial.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `26/26 pass`
  - Twilio security/foundation suite: `114/114 assertions pass`
  - Twilio isolated runner contract: `35/35 assertions pass`; the previously executed hosted route regression passed `54 assertions` with zero provider requests and zero residue
  - Complete non-production Codex Browser suite: `24/24 groups`, `28/28 assertions`, zero console errors, zero console warnings, and zero residue
  - Type-check, lint, production build, dependency audit, `git diff --check`, credential scan, and protected CI lifecycle: `pass`
- Notes:
  - WeatherTech Tucson ending `3145` is the only live-validated route, with exactly one received SMS record and one completed provider event.
  - IHC ending `6930` is exactly mapped and active at `ready_for_live_test` with zero messages and zero validation events; no IHC live-ingress claim is made.
  - At the owner-accepted closeout checkpoint, WeatherTech Phoenix remained unconfigured because no owner-approved eligible number was available. Signed simulations did not prove carrier ingress for an unowned route; the later owner-authorized activation follow-up below supersedes this operational state.
  - Outbound SMS remains hard-locked and disabled with zero outbound messages. Voice, MMS, campaigns, reminders, auto-replies, and broader provider activation remain outside this closeout.
  - No scheduled Twilio inventory automation remains. `.env.local` and both owner-designated Property Intelligence changes remained byte-for-byte unchanged, unstaged, and uncommitted.

#### Owner-Authorized Phoenix Inbound Activation And Live Validation Follow-Up — 2026-08-15

- WeatherTech Phoenix, documented only by masked ending `1326`, is owner-controlled, assigned to the same directly inspected shared Messaging Service as Tucson and IHC, configured in Vercel Production, mapped as an exact active WeatherTech route, and live-validated through one received inbound message and one completed provider event.
- Tucson remains live-validated with two received messages and two completed inbound events. IHC remains unvalidated at `ready_for_live_test` with zero messages/events; no IHC live-ingress claim is made. Aggregate Twilio readiness therefore remains `ready_for_live_test`.
- Twilio shows no A2P Brand or Campaign, so the US long-code senders are not registered for outbound A2P traffic. Outbound SMS remains hard-locked and disabled, and voice/status/recording configuration remains unset.
- This completed operational activation and live-validation follow-up belongs to the closed inbound-only sprint; it required no application code, schema migration, environment, or provider configuration change during verification and did not start another sprint.

### Non-Production Regression Environment & CI Test-Data Lifecycle

- Implementation commit: `6354429976fb7a549bbc738fc0b76b3c5ea2022b`
- Message: `test: add isolated regression environment lifecycle`
- Closeout: this documentation-only commit; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, pushed, deployed, and production-verified.
- Validation:
  - Every top-level `tests/*.test.mjs` file: `25/25 pass`
  - Complete non-production Codex Browser suite: `24/24 groups`, `28/28 assertions`, zero console errors, zero console warnings
  - Test-data cleanup and independent residue verification: `pass`, zero current-run residue
  - Type-check, lint, production build, dependency audit, `git diff --check`, workflow checks, and credential scan: `pass`
  - GitHub Actions run `31570826433`: repository validation and isolated Supabase lifecycle jobs both `success`
- Notes:
  - Provisioned the dedicated free hosted Supabase project `WeatherTech OS Regression` (`hygtnhmmaoboduqghhwg`) without copying production data or provider credentials.
  - Reproduced all 38 committed migrations and verified parity with production across 70 RLS-enabled public tables, 185 policies, and 915 Data API grants.
  - Added permanent production-target rejection, positive browser/server/service-role target agreement, aggregate provider-side-effect markers, exact synthetic-owner authentication, unique run ownership, collision refusal, captured-ID cleanup, Stripe-linked cleanup refusal, and zero-residue proof.
  - Added protected CI lifecycle verification without falsely representing GitHub-hosted CI as capable of running the proprietary Codex Browser suite.
  - Kept production data unchanged, all Stripe write gates false, and IHC at zero Stripe connections, accounts, mappings, events, and payments.
  - Preserved `.env.local` and the two owner-designated Property Intelligence working changes byte-for-byte and excluded them from both sprint commits.

### Production Data Isolation & Clean Baseline

- Implementation commit: `c57698786e83732e49b8cb4ace83e3128539b28f`
- Message: `fix: isolate regression data from production`
- Closeout: documentation-only commit containing this record; use Git history for its immutable hash.
- Branch: `main`
- Remote: `origin/main`
- Result: Completed, pushed, deployed, and production-verified.
- Validation:
  - Every `tests/*.test.mjs` file: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - Production build: `pass`
  - `git diff --check` and secret scan: `pass`
  - Signed-in read-only production smoke: `pass`, zero warning/error entries
- Notes:
  - Added a permanent fail-closed Production Supabase guard, exact hosted-nonproduction authorization, local-app and public-resource-origin verification, exact-run cleanup, collision/residue detection, and Stripe-linked cleanup refusal to the write-capable browser regression harness.
  - Removed only evidence-proven regression and sample records in two guarded production transactions; uncertain mixed-origin records remained untouched.
  - Restored the production financial baseline to zero invoices, zero outstanding balance, and zero overdue invoices while preserving two refunded Stripe payments, four mappings, eight processed webhook events, and two payment-intent sync logs.
  - Kept all Stripe write gates false and IHC at zero Stripe connections, mappings, events, and payments.
  - Preserved the owner-designated Property Intelligence working changes byte-for-byte and excluded them from both sprint commits.
  - Full write-capable browser regression was not run because no safe non-production Supabase project, branch, or local container runtime was available; direct fail-closed production targeting and all safe repository tests passed.

### Production Connections Phase 1 - Verified Production Foundation

- Release checkpoint: `68943206451322de3ae6bdbcbe497f8117290e19`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed through the verified production checkpoint preceding the Production Data Isolation & Clean Baseline sprint.
- Notable focused commits:
  - `9dc94ba6ae044deab42d406dd92f87e8f94b3a0f` — Next.js 16.3.0 security upgrade.
  - `bc23ce7c12c30e6bf4fafaafa2b93203f73547a3` — company-isolated Stripe payment foundation.
  - `95903d2c05b8ea63e0c55914490fdd788e292d7e` — Stripe Payment Element workflow.
  - `86c447b3e8d912ce28b8dbcfcdfaf7f5c932c419` — atomic Stripe refund reconciliation.
  - `0dc98f9` through `6894320` — owner refund surface, active-PaymentIntent recovery, and payment-confirmation hardening.
- Notes:
  - Production Supabase, document storage, Gmail, Google Calendar, both GoHighLevel company connections, Vercel deployment, and WeatherTech-only Stripe passed their approved connection checkpoints.
  - WeatherTech Stripe payment, authenticated webhook, database reconciliation, and full-refund behavior were validated under narrow owner authorization.
  - IHC remained unmapped from the WeatherTech Stripe account. Twilio/SMS, QuickBooks, IHC Stripe, and unrelated providers were not activated.
  - Production health and provider activation readiness remain separate controls; ordinary live-write gates must stay fail-closed except during exact owner-approved operations.

### AI Command Center 3.0 - Operating Brain

- Commit: `8f6fda8f12ce7808bb9b3c4669cc8f0d120656b6`
- Message: `feat: add ai command center operating brain`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Added AI Command Center 3.0 to the existing AI Tools workspace with executive recommendations, advisor modes, company-scoped operating context, grounded responses, and approval-gated behavior.
  - Preserved the AI Tools 2.1 provider safety and non-executing action boundary.
  - This is an established capability and must not be scheduled as a rebuild without an owner-approved rework sprint.

> Older entries containing `<this sprint commit>` predate the immutable-hash closeout rule and are retained as historical records, not current release provenance. New sprint records must use observed commit hashes.

### AI Tools 2.1 - Live Provider Connection, Command Execution, and Controlled AI Pilot

- Commit: `<this sprint commit>`
- Message: `feat: add ai tools live provider pilot`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Extended the existing AI Tools workspace into a controlled live-provider pilot without creating a second AI page or navigation item.
  - Added authenticated server-side AI command handling, provider-neutral OpenAI/Anthropic readiness, structured-output parsing, authorized context retrieval, prompt-safety blocking, usage/cost controls, safe cancellation, provider health, and follow-up command state.
  - Added approval-gated action previews that can be reviewed in the UI but cannot execute customer communications, schedules, invoices, payments, migrations, deployments, or provider writes.
  - Added Production Readiness Center AI activation guidance, `.env.example` placeholders, permanent provider-pilot documentation, and mocked-provider automated regression coverage.
  - Did not enter credentials, activate live AI providers, apply migration `0033_ai_tools_operating_brain.sql` remotely, modify `.env.local`, send communications, change schedules, create financial records, weaken RLS, or fake connected provider state.

### AI Tools 2.0 - WeatherTech OS Operating System Brain

- Commit: `<this sprint commit>`
- Message: `feat: add ai tools operating brain`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Extended the existing AI Tools workspace into a provider-disabled operating brain with a read-only command bar, daily intelligence summary, priority recommendations, assistant panels, approval gates, saved-analysis readiness, and generated drafts awaiting review.
  - Added company-aware, role-aware rule-based intelligence that cites internal records and clearly labels missing information, completeness, approval requirements, provider-disabled behavior, and production-disabled state.
  - Preserved and hardened the AI Scope Writer and AI Estimate Assistant so they use approved templates and existing estimate line items only.
  - Added additive migration `0033_ai_tools_operating_brain.sql` for company-owned saved analyses, AI audit events, and AI usage limits, but did not apply it remotely from Codex.
  - Did not activate paid AI providers, send communications, expose secrets, enable production automation, weaken RLS, or fake AI/provider output.

### Estimate & Proposal Builder 2.0 - World-Class Multi-Brand Sales, Acceptance, Invoice, and Payment System

- Commit: `<this sprint commit>`
- Message: `feat: add estimate proposal builder v2`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added company-aware proposal templates, proposal revisions, customer-facing sections, proposal options, acceptance records, payment schedules, and audit events.
  - Preserved strict internal/customer-facing separation so internal costs, margin, markup, commissions, and private notes stay out of proposal packets.
  - Added base-total, optional-upgrade, replacement-alternative, deposit invoice draft, Customer Portal proposal summary, signature readiness, payment readiness, and QuickBooks readiness behavior.
  - Added additive migration `0032_estimate_proposal_builder_v2.sql` but did not apply it remotely from Codex.
  - Did not activate live DocuSign, Dropbox Sign, payments, QuickBooks Online, outbound proposal delivery, provider webhooks, or customer messaging.

### Production Deployment Phase 1 - Private Staging Deployment

- Commit: `<this sprint commit>`
- Message: `feat: prepare private staging deployment`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added private staging health and readiness endpoints with safe deployment metadata, dependency readiness, Supabase reachability classification, and disabled-provider safety gates.
  - Added private staging environment inventory, Supabase Auth redirect guidance, monitoring and rollback documentation, controlled staging validation steps, and Production Readiness Center metadata.
  - Did not deploy, apply remote migrations, activate providers, change `.env.local`, alter DNS, commit credentials, weaken authentication/RLS, or fake staging readiness.

### Production Activation Phase 1 - Guided Owner Setup and Launch Control

- Commit: `<this sprint commit>`
- Message: `feat: add guided production launch control`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Extended the existing Production Readiness Center with guided launch-control sequencing, launch gates, provider activation cards, pending migration inventory, redacted environment readiness, three-company mapping guidance, controlled-test plans, and production evidence fields.
  - Kept all provider states conservative until owner setup, OAuth/provider approval, migration verification, controlled tests, and final launch approval are complete.
  - Did not deploy, run remote Supabase migration commands, activate live integrations, enable credentials, inspect `.env.local`, weaken authentication/RLS, or fake production readiness.

### Production Activation & Deployment Readiness

- Commit: `<this sprint commit>`
- Message: `feat: add production readiness center`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a read-only Production Readiness Center for environment status, required migrations, provider blockers, pending owner setup, last validation/regression/migration evidence, and a unified deployment checklist.
  - Added production activation guides for Twilio, Gmail, Google Calendar, Google Business Profile, Yelp, Website, QuickBooks Online, and Electronic Signatures.
  - Did not deploy, activate live integrations, enable credentials, inspect secrets in browser code, modify `.env.local`, weaken authentication/RLS, or fake readiness.

### Electronic Signatures Phase 1 - DocuSign / Dropbox Sign Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add electronic signatures provider foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the disabled-by-default DocuSign and Dropbox Sign electronic signature provider foundation.
  - Added provider abstraction helpers, OAuth/account readiness, signature request draft mapping, status event labels, retry planning, Integration Center readiness, Communications visibility, and audit-log provider support.
  - Added additive provider constraint migration `0031_electronic_signatures_foundation.sql`.
  - Kept live signature requests, document uploads, provider writes, OAuth token exchange, webhook ingestion, fake connection status, and credentials out of this sprint.

### Core Office Operations Hardening

- Commit: `077b050088c150b80d89d244a7980613c65c1b61`
- Message: `fix: harden core office CRM workflows`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Hardened core office CRM workflows.
  - Preserved existing CRM, Supabase, and production workflows.

### Website & Marketing Integration Foundation

- Commit: `1785b73d67a129e8fd4a0e4991e7d31331411d04`
- Message: `feat: add website marketing integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Added the read-only Website & Marketing integration foundation.
  - Added navigation and browser regression coverage.
  - Did not modify CRM persistence, Supabase schema, APIs, packages, migrations, RLS, or provider credentials.

### Lead Intake Foundation

- Commit: `3f03c7e82c6dcb3395851fabc03d28027f68310a`
- Message: `feat: add lead intake foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a CRM Lead Intake workspace using the existing lead model and persistence path.
  - Captured customer, property, source, company assignment, priority, and lead status/stage.
  - Added browser regression coverage for company-scoped lead intake creation.
  - Did not modify Supabase schema, RLS, auth, packages, migrations, provider integrations, or environment files.

### Sales Pipeline & Opportunity Management

- Commit: `4c8b2935f06e30dd6dba45619f777b84e4baa9f4`
- Message: `feat: add sales pipeline opportunity management`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the Sales Pipeline workspace and opportunity management workflow.
  - Reused existing WeatherTech OS CRM records, company scoping, estimates, jobs, and browser regression coverage.
  - Did not modify authentication, RLS, provider integrations, packages, or environment files.

### Twilio Phase 1 - Production Communications Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Twilio communications foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Twilio configuration readiness, signed inbound webhook handling, business-number routing, CRM matching, lead-intake fallback, and safe outbound-send gating.
  - Added setup documentation for WeatherTech Phoenix, WeatherTech Tucson, and IHC business-number mapping.
  - Did not add migrations, modify `.env.local`, expose secrets, or send real SMS/call traffic.

### Gmail / Google Workspace Phase 1 - Production Email Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Gmail workspace email foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Google OAuth readiness, company-aware Gmail mailbox records, encrypted token storage, manual sync/import, CRM matching, attachment metadata, and integration log coverage.
  - Added safe outbound send boundaries that require explicit server-side enablement before Gmail sends any customer email.
  - Added Google Workspace setup documentation and safe environment placeholders.
  - Did not modify `.env.local`, expose credentials, send real email, or activate live Google Workspace connectivity.

### Google Calendar Phase 1 - Production Scheduling Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Calendar scheduling foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Google Calendar configuration, OAuth scope-upgrade, calendar discovery, sync planning, inbound webhook intake, unmatched-event review, and conflict-detection foundations.
  - Added additive migration `0028_google_calendar_scheduling_foundation.sql` for company-aware connected calendars, Calendar credentials, event sync metadata, and unmatched provider events.
  - Added safe write gating through `GOOGLE_CALENDAR_WRITE_ENABLED=false`, sanitized Calendar payloads, and setup documentation.
  - Did not modify `.env.local`, expose credentials, create live Calendar events, or apply the migration remotely.

### Unified Lead Intake Hub - Production Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add unified lead intake hub`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a canonical lead intake service for Website, Twilio, Gmail, manual CRM entry, and future provider adapters.
  - Added duplicate prevention through phone/email normalization, existing customer matching, existing lead matching, provider event IDs, and request fingerprints.
  - Existing customer matches now attach intake activity to Customer 360 without creating duplicate leads.
  - New unmatched accepted intake creates exactly one CRM lead and an actionable follow-up notification.
  - Gmail sync now routes unmatched inbound email into the same lead intake pipeline.
  - Preserved source attribution and sanitized integration sync logging.
  - Added service-level and browser regression coverage for duplicate detection, provider routing, lead creation, customer matching, malformed payloads, provider failures, logging, and UI surfacing.
  - Did not add migrations, modify `.env.local`, activate live Yelp/Google Business Profile/Facebook connectivity, send real customer communications, or weaken authentication/RLS.

### Website Integration Phase 1 - Multi-Brand Live Lead Capture Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add website integration lead capture foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Hardened the signed website lead endpoint for WeatherTech Roofing LLC, WeatherTech Phoenix/Tucson attribution, IHC Painting, and future approved landing pages.
  - Added form-type routing, origin allow-list support, production-disabled gating, attribution and consent preservation, rate-limit/spam controls, and safe integration logging.
  - Added safe environment placeholders and owner setup documentation for server-side HMAC configuration and production activation.
  - Did not modify `.env.local`, activate live public website forms, send customer communications, weaken authentication/RLS, or add destructive migrations.

### Yelp Integration Phase 1 - Multi-Account Lead Intake Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Yelp integration lead intake foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the three-account Yelp foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
  - Preserved the Unified Lead Intake Hub as the canonical pipeline for controlled Yelp intake payloads.
  - Documented official Yelp capability boundaries, including partner-required Leads API, OAuth, and webhook activation.
  - Kept live Yelp sync and outbound replies disabled by default and did not scrape Yelp, store Yelp passwords, send real Yelp messages, modify `.env.local`, or add migrations.

### Google Business Profile Phase 1 - Multi-Location Integration Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Business Profile integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the three-location Google Business Profile foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
  - Preserved the Unified Lead Intake Hub as the canonical pipeline for controlled Google Business Profile dry-run payloads.
  - Documented official Google Business Profile capability boundaries, including account/location APIs, reviews, performance, OAuth, Pub/Sub notifications, discontinued Q&A, and unsupported chat/request-a-quote behavior.
  - Added additive provider constraint migration `0029_google_business_profile_foundation.sql`.
  - Kept live Google Business Profile sync, review replies, and customer messaging disabled by default and did not scrape Google, automate browser login, store Google passwords, send real review replies, modify `.env.local`, weaken authentication/RLS, or perform destructive migrations.

### QuickBooks Online Phase 1 - Accounting Integration Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add QuickBooks Online integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the QuickBooks Online accounting integration foundation for WeatherTech Roofing LLC and IHC.
  - Added official capability documentation, server-only environment placeholders, Integration Center readiness, communications activity language, and duplicate-safe customer, estimate, invoice, and payment export-draft helpers.
  - Added additive provider constraint migration `0030_quickbooks_online_foundation.sql` so integration connections and sync logs can reference `quickbooks_online`.
  - Kept live QuickBooks sync, accounting writes, invoice creation, customer creation, payment processing, and webhook ingestion disabled by default and did not modify `.env.local`, expose credentials, weaken authentication/RLS, or perform destructive migrations.

## Recording Template

### Sprint Name

- Commit: `<full commit hash>`
- Message: `<commit message>`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `<pass/fail>`
  - Type-check: `<pass/fail>`
  - Lint: `<pass/fail>`
  - `git diff --check`: `<pass/fail>`
  - Automated tests: `<pass/fail/not applicable>`
  - Browser validation: `<pass/fail/not applicable>`
- Notes:
  - `<summary>`
