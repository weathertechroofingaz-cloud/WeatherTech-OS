# Next Sprint

This file is planning-only. It cannot authorize development, cannot approve a sprint, and cannot be automatically promoted into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

## Approval Status

Awaiting owner direction.

Owner approval is required before any contents of this file may be copied into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) or used to begin implementation.

## Sprint Name

Yelp Lead Intake — candidate pending owner approval.

## Objective

Prepare an exact, reviewable Yelp Lead Intake sprint from the received Mighty Apes/Yelp webhook specification. This planning note does not authorize implementation, provider configuration, activation, or production data changes.

## Owner-Approved Scope

- Not approved. Exact scope must be proposed and explicitly approved by the owner before promotion or implementation.

## Explicit Exclusions

- No Yelp code, schema, provider, OAuth, webhook, routing, production data, or environment change before explicit owner approval.
- Default exclusions remain in force unless explicitly approved:
  - No destructive database changes.
  - No RLS changes.
  - No production deployment.
  - No live customer messaging.
  - No provider activation.
  - No `.env.local` changes.
  - No completed module rebuilds without an approved rework sprint.

## Completion Criteria

- To be provided by owner.

## Validation Plan

- Build.
- Type-check.
- Lint.
- `git diff --check`.
- Relevant automated tests.
- Targeted browser regression.
- Direct browser validation of the changed workflow.

## Planned Commit Message

To be provided or selected after implementation with an accurate conventional commit message.

## Owner Approval Checklist

- [ ] Sprint name approved.
- [ ] Objective approved.
- [ ] Scope approved.
- [ ] Exclusions approved.
- [ ] Completion criteria approved.
- [ ] Validation plan approved.
- [ ] Planned commit message approved or conventional message delegated.
- [ ] Owner explicitly approved copying this sprint into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

## Promotion Rule

Codex must never automatically promote this file. Promotion requires an explicit owner instruction naming the sprint and approving the transfer into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

## Completed-Work And External-Dependency Guardrails

- AI Command Center 3.0 is implemented and must not be proposed as a rebuild without an owner-approved rework sprint.
- The WeatherTech Roofing Stripe payment/webhook/refund foundation is implemented and production-validated; only separately approved activation or hardening work may extend it.
- IHC Stripe requires its own separately authorized account/configuration.
- The Mighty Apes/Yelp webhook specification has been received. Yelp Lead Intake is the owner's intended next sprint, but it is not actionable until the owner explicitly approves its exact scope and promotion.
- CRM Identity Integrity Phase 1 is complete. Its deployed reconciliation capability must not be treated as permission for automatic backfill or an unreviewed production-record operation.
- The inbound-only Twilio implementation is complete and must not be rebuilt. WeatherTech Tucson is live-validated; IHC live validation and WeatherTech Phoenix number acquisition remain external follow-up and do not authorize outbound SMS.
- These guardrails do not select or recommend a next sprint.

## Last Review

CRM Identity Integrity Phase 1 — Customer & Property Reconciliation is complete, deployed, and production-schema validated without changing a production business graph. Yelp Lead Intake is recorded only as the owner's intended next sprint candidate now that the Mighty Apes/Yelp webhook specification is available. Status remains `Awaiting owner direction`; Yelp has not been approved, promoted, or started.
