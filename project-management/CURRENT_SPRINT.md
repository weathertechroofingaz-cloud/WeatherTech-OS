# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

The owner explicitly approved this sprint in the Codex task and supplied the verified Mighty Apes webhook contract. That contract is authoritative; payload fields must not be guessed or replaced with a different Yelp API model.

## Sprint Name

Live Yelp Lead Intake via Mighty Apes

## Objective

Connect Mighty Apes' signed Yelp lead webhook to the existing WeatherTech OS Unified Lead Intake pipeline so one authenticated `lead.created` delivery creates or resolves exactly one WeatherTech Roofing LLC CRM lead, while authenticated `lead.test` deliveries exercise the receiver without entering the salesperson pipeline.

## Owner

Joe Harris

## Owner Approval Date

2026-08-14.

## Verified Starting State

- Repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`.
- Branch: `main`.
- Starting local `HEAD`, `origin/main`, live GitHub `main`, and production deployment: `dfece1c978afbbae06c05c91afb75c060ddd16a4`.
- The working tree and index were clean at the approval gate.
- Production and local Supabase migration ledgers matched all `43/43` committed migrations.
- The completed Customer & Property Reconciliation sprint remains closed and must not be rebuilt or altered by this sprint.
- The existing Yelp foundation already provides `/api/leads/yelp`, company-aware normalization, Unified Lead Intake, CRM/Inbox visibility, source mappings, duplicate review, and sanitized integration logging, but its legacy signing/header contract and disabled provider gates do not implement the verified Mighty Apes webhook contract.
- `supabase/migrations/0026_property_intelligence_foundation.sql` started at SHA-256 `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` and must remain unchanged.
- `.env.local` started at SHA-256 `03b206881812c36ddcfd25b6b78041443baf1d813d8adbba5d6dce0023c703a0` and must remain unchanged.

## Verified Provider Contract

- Request method and type: `POST`, `Content-Type: application/json`.
- User agent: `MightyApes-Webhook/1`.
- Signature: `X-MightyApes-Signature: sha256=<HMAC-SHA256 of the raw request body>`.
- Timestamp: `X-MightyApes-Timestamp: <Unix timestamp>`.
- Delivery identifier: `X-MightyApes-Delivery: <delivery id>`.
- Payload version: `1` only.
- Events: `lead.created` is a real lead; `lead.test` is diagnostic and must not enter the real lead pipeline.
- Stable deduplication identifier: `lead.id`; retries use the same identifier.
- Required preservation: campaign Yelp ID/name, provider lead ID, supplied display name, exact E.164 phone, ZIP, optional job category, complete multiline message, and provider `created_at`.
- Yelp supplies no email field. No email may be fabricated.

## Owner-Approved Scope

- Reuse the existing Unified Lead Intake, WeatherTech company-routing, CRM visibility, source mapping, integration logging, and regression-isolation architecture.
- Add the smallest public server-side Mighty Apes receiver appropriate to the existing application.
- Read and authenticate the raw body before JSON parsing.
- Validate the exact Mighty Apes signature, Unix timestamp freshness, delivery identifier, user agent/content type, payload shape, event, and version.
- Reject unsigned, malformed, invalid-signature, stale, unsupported, ambiguous, or unsafe requests without exposing secrets or sensitive payloads.
- Route every accepted payload only to WeatherTech Roofing LLC; refuse IHC or cross-company routing.
- Accept authenticated `lead.test`, preserve non-sensitive diagnostic evidence, and create no CRM lead, salesperson task, customer, or communication.
- Process authenticated `lead.created` through the existing intake model with durable delivery auditability and transaction-safe, concurrency-safe deduplication on `lead.id`.
- Preserve every provider field required by the verified contract without fabricating email.
- Add only a legitimate additive, non-destructive migration if required for atomic idempotency/auditability, and register it additively in migration integrity.
- Add deterministic unit, route-contract, hosted isolated database, concurrency, cleanup, CRM visibility, company-isolation, security, and browser regression coverage.
- If all validation passes, commit, push, deploy through the established workflow, apply any safe additive migration after exact target/ledger/data preflight, and verify the production endpoint without creating a synthetic production salesperson lead.

## Explicit Exclusions

- No scraping Yelp, browser automation of Yelp, private Yelp endpoints, Yelp username/password storage, or invented OAuth/API payloads.
- No outbound Yelp messaging, replies, campaigns, or customer communication.
- No automatic bulk import, backfill, merge, customer creation, or cross-company routing.
- No production `lead.created` simulation that creates synthetic CRM data.
- No modification of `.env.local`, Property Intelligence migration `0026`, historical migrations, or unrelated reconciliation work.
- No weakened migration-integrity, RLS, company-isolation, webhook-authentication, regression-target, cleanup, or provider-write controls.
- No Twilio, Gmail/Calendar, QuickBooks, AI, CompanyCam, Stripe, portal, OAuth, broad production-approval, or unrelated feature changes.

## Completion Criteria

- The receiver implements the exact Mighty Apes raw-body HMAC, Unix timestamp, delivery, event, and version contract.
- Authenticated `lead.test` returns success, records safe evidence, and leaves CRM lead/customer/task/communication counts unchanged.
- Authenticated `lead.created` creates or resolves exactly one WeatherTech Roofing LLC CRM lead and intake/audit result for one provider `lead.id`; exact retry and concurrent duplicate delivery converge without a second lead.
- Campaign, provider, lead, phone, ZIP, optional category, full multiline message, and provider timestamp are preserved; email remains null/absent.
- Invalid/missing signatures, stale timestamps, malformed JSON, unsupported versions/events, missing required fields, and cross-company input fail closed.
- Migration integrity, repository tests, type-check, lint, production build, dependency audit, secret scan, targeted hosted regression, and isolated browser regression pass with zero residue.
- Production remains healthy; unrelated provider gates remain unchanged; no synthetic production CRM data is created.
- The exact production URL and server-only secret variable are documented. The sprint must not claim a full connection until a real authenticated provider test succeeds, and must not claim live Yelp intake until a real `lead.created` persists exactly once.

## Validation Plan

- Verify Git/ref/deployment identity, clean tree, protected hashes, production/regression targets, migration parity, and current provider/env inventory.
- Run deterministic signer/parser/validator/normalizer tests for every required success and refusal case.
- Run a hosted isolated lifecycle that proves atomic persistence, exact retry, concurrent convergence, test-event isolation, role/ACL/RLS boundaries, no provider/financial side effects, and zero residue.
- Extend targeted and full isolated Browser coverage for normal Leads/Inbox visibility and company isolation without using Production Supabase as a write-capable test target.
- Run every top-level test, type-check, lint, build, dependency audit, whitespace/diff checks, link checks, and credential/PII scans.
- Audit and stage only the approved sprint files; preserve `0026` and `.env.local` hashes.
- Push and verify exact GitHub Actions/Vercel identity, production health/readiness, migration/data postconditions, and safe endpoint behavior.

## Planned Commit Messages

- Implementation: `feat: connect Mighty Apes Yelp lead intake`
- Documentation closeout, if required: `docs: close Mighty Apes Yelp intake sprint`

## Final Status

In progress.

## Notes

Mighty Apes' official test-delivery action and the first real Yelp lead are external evidence steps. If the signing secret is not already configured, the single owner action is to add the exact server-only production variable reported by this sprint and then run Mighty Apes' Send Test Delivery.
