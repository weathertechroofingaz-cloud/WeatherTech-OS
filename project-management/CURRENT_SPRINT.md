# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved

The owner explicitly approved Proposal-to-Sold Job Operational Completion Phase 1 in the Codex task on 2026-08-23 and then corrected the approved scope to require a real native customer electronic-signature workflow. The approved operational sequence is `Finalized Proposal -> Customer Electronic Signature -> Required Deposit (when applicable) -> Sold Job`. This approval authorizes only the narrow implementation, isolated validation, release, optional single additive migration, read-only Production validation, and governance closeout described below. It does not authorize any excluded provider, public portal, customer send, payment-provider activation, Production business-data write, or later sprint.

## Sprint Name

Proposal-to-Sold Job Operational Completion Phase 1

## Objective

Complete the first dependable revenue handoff for WeatherTech Roofing LLC and IHC Painting by turning an estimate into an exact immutable customer-safe proposal, delivering that exact artifact truthfully through the existing owner-approved Gmail path, allowing the intended customer to electronically sign it through a narrow native sign-only workflow, enforcing any required recorded deposit, and creating exactly one linked sold job only after those server-validated requirements are satisfied.

## Owner

Joe Harris

## Owner Approval Date

2026-08-23.

## Verified Starting State

- Canonical repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`; branch `main`.
- Starting local `HEAD`, cached `origin/main`, live remote `main`, and canonical Production deployment: `2cb3fd9f45fb82515763f467e9df0e3ad25b6569`.
- Starting working tree and index: clean.
- Canonical `/api/health`: HTTP 200 at the exact starting SHA. `/api/readiness`: truthfully HTTP 503 under the pre-existing live-provider/owner-approval safety gate.
- Production Supabase project: `gahfcgyjtfwwmsterhzu` / WeatherTech OS / `ACTIVE_HEALTHY` / Postgres 17; local and Production migration ledgers match all `50/50` committed migrations.
- Secure Company-Scoped Job Photos & Field Upload Reliability Phase 1 is released, closed, and preserved in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md). It must not be rebuilt or disturbed.
- Core lead/customer, inspection, estimate, scheduling, job, production, secure photo, invoice/manual-payment, documents, and owner command-center foundations already exist and must be reused.
- Proposal revision, section, option, acceptance, payment-schedule, and audit-event tables exist, but Production has no proposal revision or proposal acceptance history proving a real end-to-end customer workflow.
- Existing `signatures` and proposal-acceptance foundations anticipate native and provider-backed signatures, but the active native UI is an internal authenticated status/signature form rather than a customer signing surface.
- Existing `Request signature` behavior creates a local pending signature and reports success without delivering a usable customer signing request. That behavior is not truthful and is a proven defect within this sprint.
- Existing DocuSign and Dropbox Sign work is readiness-only. Production has no connected electronic-signature provider record or provider envelope, and this sprint does not require or authorize provider activation.
- The existing private `customer-documents` bucket, server-only Supabase access patterns, proposal audit events, and explicitly owner-approved Gmail delivery path provide the approved infrastructure for a narrow native sign-only workflow.
- The ten existing Production leads and intake records remain development test data, not real business or marketing history, and must not be altered.
- Protected migration `supabase/migrations/0026_property_intelligence_foundation.sql`, `.env.local`, completed photo migrations, provider configuration, and unrelated Production state must remain unchanged.

## Owner-Approved Scope

- Persist a complete company-scoped proposal revision from the selected estimate, including the exact customer-visible sections, selected options, totals, deposit terms, payment schedule, customer terms, source snapshot, and audit evidence.
- Finalize the exact proposal revision and customer-safe PDF artifact immutably. Draft changes remain editable; any change after finalization must create a new revision and supersede rather than overwrite the prior revision or artifact.
- Bind the finalized artifact to the exact proposal revision and a deterministic content digest, store it only in the existing private `customer-documents` bucket, and never persist a public or signed URL.
- Generate proposal PDFs only from persisted customer-safe proposal data. Internal cost, margin, markup, commission, profit, private notes, and internal planning content must never enter the customer artifact.
- Deliver only the exact finalized artifact through the existing Gmail workflow after an authenticated company owner explicitly approves the send. Provider success must be confirmed before local delivery state advances; failures, disabled configuration, stale approval, and duplicate/retry states must be reported truthfully.
- Remove the unsafe raw-estimate PDF fallback from proposal delivery. Never claim that a signature was requested merely because a local pending row was created.
- Add a narrow native customer sign-only flow for the intended proposal recipient. It may expose only the exact finalized customer-safe proposal associated with a high-entropy, hashed, expiring, revocable signing request and must not activate the broader Customer Portal or public registration.
- Allow the customer to view and retain the exact proposal, affirm electronic-record and terms consent, confirm the accepted options and total, and provide a typed electronic signature suitable for desktop and mobile use.
- Persist auditable signature evidence tied to the exact immutable revision, including signer name and delivery email, accepted option IDs, accepted total, terms acknowledgement, signed timestamp, proposal/document digest, signature evidence, request/view/acceptance audit events, privacy-preserving network evidence, sanitized user-agent evidence, and idempotency/replay evidence.
- Make the native signing lifecycle server-controlled, company-scoped, tamper-evident, retry-safe, revocable, expiration-aware, and single-acceptance. Direct anonymous table access or mutation remains denied.
- Record the completed signed artifact and audit certificate privately and make the exact completed customer copy available through authorized short-lived access without persisting a durable public URL.
- Enforce the approved lifecycle on the server: an unsigned, declined, expired, superseded, stale, mismatched, or tampered revision cannot become a sold job.
- When the finalized revision requires a deposit before job creation, require sufficient same-company, same-customer, same-proposal/invoice, posted payment evidence already recorded through the existing manual payment workflow. Do not activate a new payment provider.
- When no deposit is required, the exact valid electronic signature is sufficient for the deposit gate. When a deposit is required, signature alone is insufficient.
- Convert a qualifying signed-and-funded proposal into exactly one correctly linked draft job through an atomic, idempotent server operation. Retries and concurrent attempts must return the same job rather than create duplicates.
- Make the owner proposal/follow-up/conversion actions open the exact record and preserve context through refresh/back navigation. Validate the owner workflow and customer signing flow on desktop and at 390x844 mobile width.
- Add focused proposal, document, delivery, signature, deposit, job-conversion, company-isolation, security, hosted lifecycle, application, targeted Browser, and complete isolated Browser regression coverage with exact cleanup and zero residue. No test may send to a real customer.
- Add at most one new immutable additive migration if the required token, digest, linkage, immutability, audit, deposit, or atomic-conversion invariants cannot be enforced safely by the current schema. Do not rewrite, squash, or renumber any existing migration.
- If every non-Production gate passes, create and push one focused implementation commit, verify exact-SHA CI and deployment, apply only the approved additive migration if one exists through the established safe process, perform the approved read-only Production validation, and create at most one documentation-only closeout commit.

## Explicit Exclusions

- No DocuSign, Dropbox Sign, or other third-party electronic-signature selection, purchase, credential setup, OAuth, webhook, provider write, sandbox activation, or Production activation.
- No owner-recorded paper, uploaded-paper, or in-person acceptance as the normal proposal acceptance workflow.
- No broad Customer Portal activation, public registration, employee portal, staff provisioning, employee onboarding, or role redesign.
- No Yelp/Mighty Apes, Twilio, SMS, voice, Google Calendar, QuickBooks, Stripe, IHC payment, accounting sync, payment-link automation, refund, or other unrelated provider change.
- No automatic customer messaging, bulk delivery, reminder automation, real customer email, real customer signature request, or live customer test during implementation or validation.
- No new payment provider or payment-processing workflow. Existing posted manual payment records are the only authorized deposit evidence for this phase.
- No Production proposal, customer, signature, acceptance, payment, invoice, job, document, email, or other business-record creation or mutation during validation.
- No cleanup or reinterpretation of existing Production test/legacy records, including the ten preserved development lead/intake records and the existing pending native signature.
- No broad estimate, invoice, scheduling, job, photo, warranty, maintenance, mobile-navigation, UI, or visual redesign beyond the exact proposal-to-sold-job handoff.
- No unrelated provider, integration, readiness-gate, environment-variable, `.env.local`, secret, package/lockfile, protected migration `0026`, completed migration, or Production-configuration change.
- No weakening of RLS, company isolation, private Storage, authorization, owner send approval, regression-target safeguards, security tests, or cleanup/residue guards.
- No later sprint selection or implementation.

## Completion Criteria

- A WeatherTech or IHC owner can persist and reload the exact proposal revision, selected options, terms, total, deposit rule, payment schedule, source snapshot, and customer-safe artifact.
- Finalization makes the revision, its customer-visible children, and its artifact immutable. A later change creates a new superseding revision without altering the earlier customer record.
- The stored and downloaded PDF matches the exact finalized revision digest and contains no internal-only financial or operational content.
- Gmail sends only the exact stored finalized artifact after explicit authenticated owner approval. Disabled, failed, stale, duplicate, or unconfirmed delivery never produces a false success or advances the proposal/signature state.
- The intended synthetic test customer can open the narrow sign-only link in an unauthenticated clean browser, review and retain the exact proposal, accept the exact options/total/terms, type an electronic signature, and receive a truthful completion result on desktop and 390x844 mobile.
- Signing tokens are high entropy, stored only as hashes, expire, can be revoked, do not leak through durable URLs or repository/browser logs, and cannot expose another revision, customer, or company.
- Signature evidence is complete, immutable, company-scoped, digest-bound, idempotent, and auditable. Replay, concurrent submission, stale/superseded revision, altered total/options, missing consent, expired/revoked token, and cross-company attempts fail safely.
- Anonymous users cannot query or mutate proposal, customer, signature, acceptance, document, payment, or job tables directly. Only the narrow server-validated signing operation can create the exact authorized customer acceptance.
- Required-deposit proposals cannot convert until sufficient posted payment evidence is linked to the same company/customer/proposal or its exact deposit invoice. Pending, failed, refunded, unrelated, cross-company, or insufficient payments do not satisfy the gate.
- A valid signed proposal with its applicable deposit gate satisfied creates exactly one linked draft job. Direct client writes, retries, concurrency, or repeated clicks cannot bypass the gate or create duplicate jobs.
- Existing lead/customer, inspection, estimate, scheduling, production, secure photo, invoice/manual-payment, document, provider, and company-isolation behavior remains unchanged outside the exact handoff.
- All focused unit, migration, security, hosted lifecycle, application, desktop/mobile Browser, build, type-check, lint, dependency, secret, whitespace, migration-integrity, protected-file, residue, and scope gates pass.
- The complete established 24-group isolated Browser regression passes with zero unexpected console errors or warnings and zero residue.
- The exact implementation and any one approved additive migration are released through the established safe process; CI, exact deployment SHA, `/api/health = 200`, migration ledger, private Storage, protected hashes, and unrelated provider/data baselines pass read-only Production verification.
- No real customer send, signature request, acceptance, payment, job, proposal artifact, or other Production business write occurs during release validation.
- Implementation and documentation closeout commits are pushed; local `main`, `origin/main`, live remote `main`, and the final canonical deployment SHA match as appropriate; tree and index are clean.

## Validation Plan

- Reverify Git/ref/deployment identity, clean tree, governance, protected files, Production/regression target identity, migration parity, private document Storage, provider state, and relevant zero/legacy data baselines before implementation and release.
- Test proposal calculations, selected-option persistence, company/trade separation, customer-safe content scrubbing, deterministic PDF generation, digest stability, revision supersession, and immutable finalized children/artifacts.
- Test Gmail owner authorization, exact artifact attachment, recipient/company matching, stale approval, disabled send, provider failure, timeout, duplicate/retry behavior, and truthful local status transitions without contacting a real customer.
- Test signing-token entropy, hash-only persistence, expiry, revocation, replay, concurrency, rate limiting, no-cache/no-referrer behavior, privacy-preserving request evidence, malformed input, and zero token/secret leakage.
- Test anonymous direct-access denial and WeatherTech-to-IHC/IHC-to-WeatherTech denial across proposals, documents, signing requests, signatures, acceptances, payments, and job conversion.
- Test exact revision/document digest binding; altered content, options, totals, terms, signer, customer, company, or superseded revision must fail before acceptance.
- Test electronic-record consent, typed-signature evidence, view/accept/decline/expire events, signed artifact and audit-certificate persistence, short-lived authorized retrieval, refresh/reload, and idempotent completion.
- Test deposit not required, deposit required and sufficient, insufficient, pending, failed, refunded, unrelated invoice, unrelated customer, cross-company, duplicated, and concurrent payment/job-conversion cases.
- Run the unchanged synthetic end-to-end hosted lifecycle from finalized proposal through customer electronic signature, applicable recorded deposit, and exactly one sold-job handoff with complete cleanup and zero residue. Do not send email externally; use the established isolated test capture/injection boundary.
- Run targeted desktop and 390x844 Browser validation for both companies, then the complete established 24-group isolated Browser suite with zero unexpected console errors or warnings.
- Run every top-level repository test, focused migration/security suites, migration integrity, type-check, lint, Production build, dependency audit, secret scan, `git diff --check`, protected-file checks, residue checks, and final scope/diff/security audit.
- If a migration is necessary, require exactly one expected additive entry, dry-run the linked chain, apply it through the established safe process only after exact-SHA CI/deployment succeeds, and perform read-only Production catalog/security verification without synthetic business writes.
- Record the immutable implementation commit and final evidence in completed governance with at most one documentation-only closeout commit. Do not begin another sprint.

## Release Commits

- Implementation: pending.
- Documentation closeout: pending.

## Final Status

Approved and active. Implementation and validation are authorized only within the exact scope above. No customer-facing electronic-signature request may be sent to a real customer during testing, no excluded provider or Production business record may be changed, and no later sprint may begin.

## Notes

The owner resolved the electronic-signature architecture decision by requiring a real customer electronic signature and rejecting paper/in-person acceptance as the normal workflow. Repository and Production evidence show that the approved native sign-only path can be implemented with existing Next.js, Supabase, private document Storage, proposal audit, and owner-approved Gmail infrastructure; a third-party provider credential is not a prerequisite for this sprint. Stop only for a genuine new owner-only business decision, credential/account action outside existing infrastructure, destructive operation outside this approval, material scope change, or prerequisite drift.
