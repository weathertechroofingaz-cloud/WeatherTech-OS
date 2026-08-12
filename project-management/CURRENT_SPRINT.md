# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Production Connections Phase 1: Twilio/SMS

## Objective

Connect and validate the production Twilio inbound-SMS workflow for WeatherTech Roofing LLC and, only when an independently verified company-controlled number exists, IHC Painting. Signed inbound messages must be routed by an exact account-and-number mapping, persisted once in the existing communications model, matched to CRM context without ambiguity, visible in the Unified Inbox, and auditable. General outbound customer SMS remains disabled.

## Owner

Joe Harris

## Owner Approval Date

2026-08-12.

## Verified Starting State

- Repository: `/Users/spotty/Documents/GitHub/WeatherTech-OS`.
- Branch: `main`.
- Starting local `HEAD`, `origin/main`, and live GitHub `main`: `cb4b45473b25b5a0927e1b7c3b5350a9b092669f`.
- Canonical production URL: `https://weathertech-os.vercel.app`.
- Production Supabase reference: `gahfcgyjtfwwmsterhzu`.
- Isolated regression Supabase reference: `hygtnhmmaoboduqghhwg`.
- Production `/api/health`: HTTP 200 and healthy at the starting commit.
- Production `/api/readiness`: HTTP 503 because Gmail send and Google Calendar write are enabled while broad production-provider approval remains false; this is the expected truthful safety state and must not be weakened.
- Production clean baseline: Customers 0, Employees 0, Leads 10, Properties 8, Jobs 6, Invoices 0, Invoice line items 0, Outstanding `$0`, Overdue 0, only two preserved refunded Stripe audit payments, and zero proven regression residue.
- Stripe payment, refund, and webhook-processing gates are false. IHC Stripe connections, accounts, mappings, events, and payments are zero.
- The existing Twilio schema/routes/tests are present, but production has zero Twilio connections, business-number mappings, SMS messages, provider events, call records, or Twilio sync logs at sprint start.

## Explicitly Preserved Working-Tree Changes

The owner explicitly designated these two pre-existing unstaged files as preserved exceptions to the normal clean-tree gate:

| File | Starting SHA-256 |
| --- | --- |
| `supabase/migrations/0026_property_intelligence_foundation.sql` | `caf57aa490f540adb6b11d249d08d68079bce5822b5cd6046cf80636b390bc8e` |
| `tests/supabase-migration-integrity.test.mjs` | `0b3e9801402ee7014556cfee750ee0d5f26a002922551ead602ddae4c3184ad4` |

They must remain byte-for-byte unchanged, unstaged, and uncommitted throughout this sprint. `.env.local` must also remain unchanged. Any additional unexplained starting change is a blocker.

## Owner-Approved Scope

- Audit the existing Twilio foundation, production configuration, Unified Inbox, role/company authorization, provider readiness, webhook security, persistence, retry behavior, and isolated-test architecture before implementation.
- Reuse the existing Twilio and communications architecture; implement only the smallest robust inbound-SMS completion required for production.
- Authenticate Twilio requests with the supported signature model and server-only credentials; reject unsigned, invalid, malformed, unsupported, or wrong-account requests without exposing secrets.
- Route an inbound message only through an exact active company-controlled Twilio account-and-number mapping. Never infer company from message content and never map IHC unless its own number is verified.
- Normalize sender/recipient numbers; match an exact unambiguous customer or lead within the routed company; preserve unknown or ambiguous senders as unmatched communications without silently creating duplicate CRM records.
- Make inbound message persistence exactly-once, provider-event accounting retry-convergent, duplicate handling durable, and every write company scoped; reject conflicting reuse of a provider identifier.
- Keep the existing Unified Inbox/communications model authoritative instead of creating a parallel inbox.
- Keep every outbound SMS path disabled or explicitly approval-gated. Do not send any outbound SMS during ordinary tests or this inbound validation.
- Use only the isolated non-production Supabase target for write-capable automated/browser regression and leave all provider side effects disabled there.
- Configure production secrets/mapping/webhook through authorized connected tooling when possible. If an owner-only Twilio login, number selection/purchase, billing acceptance, credential entry, or manual inbound send is unavoidable, complete all other work first and request one exact owner action.
- After deployment and configuration, perform one narrowly controlled real inbound SMS validation, verify exact-once persistence/UI/company/contact behavior, prove duplicate replay idempotency without sending a second SMS when safely possible, and confirm no outbound or unrelated data mutation.
- Update minimum necessary setup, security, troubleshooting, readiness, module, and sprint-governance documentation based only on verified state.
- Run the complete repository, Twilio, communications, company-isolation, security, migration, type, lint, build, dependency, isolated browser, console, and production read-only verification gates before closeout.
- Commit, push, verify the exact production deployment, and close the sprint only after the approved implementation and live validation are complete.

## Explicit Exclusions

- Do not enable general outbound SMS, marketing, bulk messages, auto-replies, reminders, or campaigns.
- Do not send any real outbound SMS or use production as the routine browser-regression target.
- Do not infer company from message text, silently choose among ambiguous CRM matches, or create customers/leads merely because an SMS arrived unless an existing explicitly supported path is proven safe and retained by design.
- Do not configure IHC with a WeatherTech number/account or guess any company mapping.
- Do not weaken Twilio signature verification, RLS, company isolation, regression target guards, `/api/readiness`, or broader provider-approval controls.
- Do not alter Stripe gates, activate IHC Stripe, start Yelp/Mighty Apes, CompanyCam, QuickBooks, OpenAI/Anthropic, or perform broad UI redesign.
- Do not pollute production with synthetic browser fixtures or modify the deliberately preserved mixed-provenance IHC graph.
- Do not expose or commit Twilio credentials, phone numbers when they are not intended public configuration, service-role keys, or other secrets.
- Do not modify `.env.local` or touch the two preserved Property Intelligence files.
- Do not select, approve, promote, or begin another sprint.

## Mandatory Stop Conditions

Stop only when:

- the owner must complete Twilio login/authentication, accept terms or billing, purchase/select a number, or enter a credential unavailable through authorized tooling;
- a real charge or destructive/irreversible production action requires separate owner action;
- the production Twilio account/number cannot be positively identified before mapping or validation;
- a controlled live action could send or route anything beyond the single approved inbound validation;
- required credentials cannot be securely provisioned through existing authorized tooling; or
- a genuine unresolved business/security decision cannot be determined from the repository and verified architecture.

Routine implementation, isolated testing, safe migrations, CI changes, commits, pushes, deployments, configuration updates through authorized tooling, and read-only verification are approved and are not stop conditions.

## Completion Criteria

- Production has an exact, verified Twilio account-and-number-to-company mapping for each company actually connected; unconfigured companies remain explicitly unconfigured.
- The inbound SMS endpoint is HTTPS, authenticates the exact Twilio request, validates content/account/payload, and fails closed before persistence on invalid input.
- One signed inbound MessageSid creates exactly one company-scoped `sms_messages` record and converges to one auditable provider event; duplicates are no-ops and conflicting identifiers fail closed.
- Exact, unambiguous company-scoped CRM phone matches are linked; unknown/ambiguous senders remain safely visible without guessed association or duplicate record creation.
- The communication appears in the correct Unified Inbox/company context with no cross-company exposure.
- General outbound SMS remains false/disabled in production and tests, and no outbound SMS is sent during validation.
- The complete isolated browser suite and all applicable repository/security/company-isolation/Twilio tests pass with zero unexplained browser console errors or warnings and zero regression residue.
- One controlled real inbound SMS is received, signature-verified, persisted once, visible in the correct UI, and duplicate replay is proven idempotent without an additional SMS when possible.
- Production baseline remains clean except the single deliberate inbound audit record and any exact contact/context association it legitimately uses; no unrelated CRM or provider data changes.
- Documentation and readiness accurately distinguish configured, authenticated, mapped, reachable, inbound validated, and outbound disabled states.
- `.env.local` and both protected Property Intelligence files retain their starting hashes and remain unstaged/uncommitted.
- A focused implementation commit and, when required, one documentation-only closeout commit are pushed; local `HEAD`, `origin/main`, live GitHub main, and Vercel production are verified.

## Validation Plan

- Verify Git/deployment identity, production and regression Supabase identity/ledger/schema/RLS, baseline counts, current Twilio config, env-name inventory, and all preserved hashes before mutation.
- Exercise unit/route/database cases for valid, missing, invalid, tampered, malformed, wrong-account, wrong-number, disabled/missing mapping, known customer, known lead, unknown, ambiguous, duplicate, conflicting duplicate, retry, and cross-company requests.
- Apply any additive migration first to the isolated regression project, verify schema/function/ACL/RLS, run transaction rollback tests, then apply only the exact validated migration to production when authorized by this sprint and safe.
- Run every `tests/*.test.mjs` file, type-check, lint, production build, `git diff --check`, credential/secret scan, and dependency/security audit.
- Run the full 24-group isolated browser regression plus targeted communications/Twilio validation, and prove cleanup/residue zero.
- Commit/push/deploy exact scope, verify production SHA/health/truthful readiness, then configure only inbound Twilio secrets/mapping/webhook with outbound false.
- Perform one controlled signed inbound validation and exact duplicate replay; verify provider delivery, database ledger, Unified Inbox, company isolation, no outbound request, and non-target production fingerprints.
- Recheck production baseline, Stripe gates, IHC isolation, `.env.local`, protected hashes, staging scope, and final Git/deployment identity before closeout.

## Planned Commit Messages

- Implementation: `feat: validate production Twilio inbound SMS`
- Documentation-only closeout, if required: `docs: close Twilio inbound sprint`

## Final Status

Approved and in progress.

## Notes

The owner chooses the next sprint. Completion of this sprint does not authorize outbound SMS or another provider/product sprint.
