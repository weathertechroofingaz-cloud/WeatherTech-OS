# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Completed.

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
- Blocked handoff: `docs: record Twilio owner handoff`
- Number-acquisition handoff: `docs: record Twilio number blocker`
- Owner-accepted documentation closeout: `docs: close Twilio sprint with accepted blockers`

## Implementation And Partial Production Evidence

- The production implementation shipped in `e7a5a57f42f3d9dfc482d6b412af9768cf31af94`. Local `HEAD`, `origin/main`, live GitHub `main`, and the canonical Vercel deployment matched `ecaf3f77337160ba165bb1e330271c0fa145110f` before this documentation update.
- GitHub Actions run `31664353558` passed every top-level repository test, type-check, lint, production build, dependency audit, patch validation, and the isolated Supabase lifecycle at that exact checkpoint. The CI workflow explicitly does not claim the proprietary Codex Browser run.
- Production has one exact active WeatherTech Tucson mapping, recorded only by masked ending `3145`. One owner-authorized live SMS reached the canonical HTTPS webhook, passed official signature verification, and produced exactly one received message and one completed provider event.
- Production also has one exact active IHC mapping, recorded only by masked ending `6930`. It is `ready_for_live_test` with zero inbound messages, zero outbound messages, and zero validation events; no IHC live-ingress claim has been made.
- WeatherTech Phoenix remains unconfigured because no owner-approved eligible number is available. The latest 480 inventory check found no purchasable option and made no number purchase, number assignment, provider configuration, database mapping, or environment change.
- The server-only credential was provisioned without entering it in the repository or `.env.local` and was securely rotated before the live SMS validation. No credential, full number, provider identifier, or message body is recorded in repository documentation.
- The Tucson validation sender had no unique company-scoped CRM match. The message was retained visibly as unmatched, and no customer or lead was created or modified.
- Official signed simulations and isolated regression prove application behavior but cannot prove carrier ingress, number ownership, sender-pool attachment, or public webhook delivery for an unowned WeatherTech Phoenix number. There is no legitimate numberless live-validation substitute.
- The Twilio security/foundation suite passed 114 assertions. Previously executed isolated live-route regression passed 54 assertions with zero provider requests and zero residue; the current documentation audit separately passed the 35-assertion runner contract and did not rerun hosted writes. The recorded complete isolated browser regression passed 24/24 groups and 28/28 assertions with zero console errors, zero console warnings, and zero residue.
- Application outbound SMS remains hard-locked, the production outbound gate remains false, and production contains zero outbound SMS messages.
- Production `/api/health` returned HTTP 200. Global `/api/readiness` truthfully remained HTTP 503 because Gmail send, Google Calendar write, and Twilio inbound are enabled while broad `WTOS_PRODUCTION_APPROVED` remains false; this is an intentional safety-control result, not a runtime-health failure.
- Production retained the clean business baseline apart from the single deliberate inbound SMS audit record and provider event. Stripe gates remained false, IHC Stripe remained isolated, and no unrelated CRM/business data changed.
- `.env.local` and both protected Property Intelligence files retained their starting hashes and remained unstaged and uncommitted.
- No scheduled Twilio inventory search or monitoring automation remains.

### Owner-Accepted Closeout Exception

On 2026-08-13, the owner explicitly accepted administrative closure of this sprint at its verified partial-production state. This owner direction overrides the default completion gate for this sprint only; it does not convert deferred provider-validation criteria into passes. WeatherTech Phoenix remains externally blocked on eligible number availability, and IHC remains mapped and active at `ready_for_live_test` with zero messages and zero validation events.

### External Follow-Up Boundary

Future work may resume only under separate owner direction when Twilio inventory exposes an owner-approved eligible 480 Voice-and-SMS number for WeatherTech Phoenix. Then purchase only that selected number, configure its exact fail-closed route, perform the controlled owner-sent live inbound validation, and validate IHC ingress independently. Do not substitute another area code or infer carrier success from simulations. This is not an active sprint, and no scheduled inventory automation remains.

## Final Status

Completed by explicit owner acceptance with documented external follow-up. WeatherTech Tucson ending `3145` is live-validated with one received message and one completed provider event. IHC ending `6930` is mapped and active at `ready_for_live_test` with zero messages and zero validation events. WeatherTech Phoenix remains unconfigured because no owner-approved eligible number is available. Outbound SMS remains disabled with zero sends.

## Notes

The owner chooses and approves the next sprint. No subsequent product sprint was started during this closeout. This sprint does not authorize outbound SMS, A2P outbound registration, voice, MMS, auto-replies, reminders, campaigns, or any other provider activation.
