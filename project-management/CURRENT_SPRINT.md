# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved

The owner explicitly approved this exact sprint in the Codex task on 2026-08-17 and, on 2026-08-21, approved the second narrowly scoped additive correction migration required by the unchanged hosted lifecycle. These approvals authorize the two immutable additive job-photo migrations, application hardening, isolated validation, direct `main` release, Production migration application, read-only Production verification, and governance closeout described below. They do not authorize another sprint, a third migration, or any excluded provider, environment, integration, or Production-data change.

## Sprint Name

Secure Company-Scoped Job Photos & Field Upload Reliability Phase 1

## Objective

Make the existing WeatherTech OS job-photo workflow safe for controlled real-world use by moving the `job-photos` bucket from public to private, enforcing WeatherTech Roofing LLC / IHC Painting isolation at both Storage and database boundaries, using short-lived authorized signed URLs, and making uploads retry-safe without creating new orphan objects.

## Owner

Joe Harris

## Owner Approval Date

2026-08-17.

## Verified Starting State

- Canonical repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`; branch `main`.
- Starting local `HEAD`, `origin/main`, live remote `main`, and canonical Production deployment: `4dfa8a28365e06e3fb66b8615a8bcdaef7572743`.
- Starting working tree and index: clean.
- GitHub Actions run `32074979140`: completed successfully for the exact starting SHA.
- Production Supabase project: `gahfcgyjtfwwmsterhzu` / WeatherTech OS / `ACTIVE_HEALTHY` / Postgres 17; local and Production migration ledgers match `48/48` committed migrations.
- Canonical `/api/health`: HTTP 200 at the exact starting SHA. `/api/readiness`: truthfully HTTP 503 under unchanged live-provider/owner-approval gates.
- Production `job-photos` bucket: public, with one object and zero `job_photos` metadata rows. The object is an orphan and is neither company-prefixed nor linked to a supported Production relation.
- Production `customer-documents` bucket: private and outside this sprint except for regression proof that its behavior remains unchanged.
- Existing broad `job-photos` Storage policies authorize authenticated bucket-wide read, upload, and update without a company predicate.
- Existing ten Production leads and ten intake records are development test data, not real business history or KPI evidence. This sprint must not alter them.
- `supabase/migrations/0026_property_intelligence_foundation.sql` starts at SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` and must remain unchanged.
- `.env.local` starts at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0` and must remain unchanged.

## Owner-Approved Scope

- Add exactly two registered additive migrations without rewriting or squashing existing migration history: the approved job-photo hardening migration and the approved rollback/delete-visibility and semantic-retry correction.
- Make the `job-photos` bucket private and replace its broad Storage policies with company-scoped, role-authorized `SELECT`, reservation-gated `INSERT`, and original-uploader-only rollback `DELETE`; authenticated `UPDATE` remains explicitly denied so registered and pending object bytes cannot be replaced.
- Use a deterministic path contract equivalent to `<company-id>/<relation-type>/<relation-id>/<opaque-upload-id>-<safe-name>` for every new object.
- Enforce that the path company prefix equals the authenticated user's authorized company.
- Enforce company consistency between `job_photos` and every supported customer, property, job, estimate, and inspection reference.
- Stop generating, persisting, or rendering durable public job-photo URLs. Hydrate short-lived signed URLs only for authorized reads.
- Preserve current inspection, Field Operations, Photos, Customer 360, preview, refresh/reload, and customer-visibility behavior.
- Make upload attempts deterministic and idempotent. Exact retries must converge without duplicate Storage objects or metadata rows.
- If an upload succeeds but metadata creation fails, delete only the exact object created by that attempt.
- Preserve the existing orphan object byte-for-byte and make it inaccessible to ordinary clients. Do not delete, move, rename, reclassify, or attach it.
- Add focused repository, migration, Storage security, hosted isolated lifecycle, application, targeted Browser, and complete isolated Browser regression coverage with exact cleanup and zero residue.
- If every non-Production gate passes, create and push one focused implementation commit, verify exact-SHA CI/deployment, apply the two approved migrations through the established linked Supabase workflow, perform read-only Production verification, then create at most one documentation-only closeout commit.

## Explicit Exclusions

- No Yelp/Mighty Apes, Twilio, Gmail, Google Calendar, A2P, voice, outbound messaging, QuickBooks, Stripe, e-signature, or unrelated provider change or activation.
- No staff invitation, employee onboarding, customer portal activation, employee portal activation, AI/photo analysis, photo annotation, or broad UI redesign.
- No image-compression change unless strictly required to preserve existing supported upload behavior.
- No test-lead cleanup, marketing-attribution data mutation, synthetic Production business data, real Production photo upload, or unrelated readiness-gate change.
- No deletion, move, reclassification, metadata attachment, or other mutation of the existing Production orphan object.
- No `.env.local`, secret, environment-variable, provider-configuration, package/lockfile, protected migration `0026`, or historical migration modification.
- No weakening of RLS, role authorization, company isolation, regression-target protections, cleanup guards, security tests, or Production safety controls.
- No third migration and no next-sprint selection or implementation.

## Completion Criteria

- `job-photos` is private and ordinary public/durable URL access is denied.
- Storage RLS and `job_photos` database constraints/triggers independently enforce company isolation and supported relation scope.
- Every supported upload path uses the company/relation-prefixed contract and persists only the stable private object path, never a public or signed URL.
- Authorized reads use short-lived signed URLs; unauthorized and cross-company signing/list/read/upload/update/delete attempts are denied.
- Same relation IDs and filenames cannot collide across companies.
- Exact retries converge without duplicate objects or metadata; metadata failure leaves no newly orphaned object.
- Inspection, Field Operations, Photos, Customer 360, previews, and refresh/reload behavior remain functional and company-isolated.
- The existing Production orphan remains present and unchanged but inaccessible to ordinary clients; Production `job_photos` remains zero unless independently proven otherwise immediately before apply.
- Customer-document behavior and unrelated CRM/storage/provider behavior remain unchanged.
- All required repository, hosted, security, browser, build, dependency, secret, whitespace, migration-integrity, protected-file, residue, and scope gates pass.
- The exact two approved migrations are applied in order through the safe linked workflow; Production deployment/health, migration ledger, protected hashes, and unrelated baselines pass read-only verification.
- Implementation and documentation closeout commits are pushed; local `main`, `origin/main`, live remote `main`, and final canonical deployment SHA match as appropriate; tree and index are clean.

## Validation Plan

- Reverify Git/ref/deployment identity, clean tree, governance, protected hashes, Production/regression target identity, ledger parity, bucket/policy/object baseline, `job_photos` count, and unrelated provider/readiness state before release.
- Test anonymous/public denial; WeatherTech-to-IHC and IHC-to-WeatherTech denial for list/read/upload/update/delete/signing; authorized same-company upload and signed reads; and path/relation/company mismatch refusal.
- Test identical filenames and relation IDs across companies, deterministic operation-key retries, concurrent/ambiguous retries, rollback cleanup after metadata failure, signed-URL expiry/nonpersistence, and immutable preservation of the pre-existing orphan.
- Test all supported photo surfaces: inspection upload, Field Operations, Photos workspace, Customer 360, preview, reload/refresh, and company switching/isolation.
- Prove `customer-documents` unchanged and run existing CRM/storage/company-isolation compatibility suites.
- Run every top-level repository test, focused migration/storage tests, hosted isolated lifecycle with zero residue, migration integrity, type-check, lint, Production build, dependency audit, secret scan, `git diff --check`, targeted Browser regression, and the complete isolated Browser suite with zero unexpected console errors or warnings.
- Audit the complete diff and stage only approved sprint files; verify `.env.local` and protected migration `0026` before staging and at completion.
- Push the implementation commit; require exact-SHA GitHub Actions and Vercel success before the Production migration apply.
- Dry-run the linked migration chain and require exactly the two expected migrations in order with no seeds, roles, vault work, or unrelated pending entry; apply them once, then perform read-only catalog/data/storage/provider/health verification.
- Record the immutable implementation commit in completed governance with at most one documentation-only closeout commit. Do not begin another sprint.

## Planned Commit Messages

- Implementation: `fix: secure company-scoped job photos`
- Documentation closeout, if required: `docs: close secure job photos sprint`

## Final Status

Implementation and validation in progress. Both approved migrations have been applied only to the isolated regression project for hosted validation; Production remains unapplied. No deployment, provider/environment change, Production business-data mutation, or Production orphan-object mutation has occurred for this sprint yet.

## Notes

The owner resolved all routine architecture and validation decisions within the exact scope above. Stop only for a genuine credential/account action, destructive operation outside this approval, unresolved business decision, material scope change, or prerequisite drift.
