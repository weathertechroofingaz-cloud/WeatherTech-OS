# Next Sprint

This file is planning-only. It cannot authorize development, cannot approve a sprint, and cannot be automatically promoted into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

## Approval Status

No subsequent sprint selected; awaiting owner direction.

Lead Attribution & Marketing Accountability Phase 1 is completed and recorded in [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) and [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md). This file does not approve any later work.

## Sprint Name

No subsequent sprint selected.

## Objective

No later sprint has been selected. This planning file preserves completed-work and external-dependency boundaries for the post-closeout waiting state.

## Owner-Approved Scope

- Not approved. Exact scope must be proposed and explicitly approved by the owner before promotion or implementation.

## Explicit Exclusions

- No new product, provider, schema, routing, production-data, or environment change before explicit owner approval.
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
- Live Yelp Lead Intake via Mighty Apes is implemented, schema-applied, pushed, and deployed at commit `103eddab7f464ca9472e8fb8c2b6cc652e7fc89c`; do not rebuild it as a new sprint.
- The official Mighty Apes test remains a separate external operational action without provider-test evidence. Its server-side credential and deployment must be reverified under separate authorization before that action; it does not authorize new implementation or a different provider integration.
- CRM Identity Integrity Phase 1 is complete. Its deployed reconciliation capability must not be treated as permission for automatic backfill or an unreviewed production-record operation.
- Lead Attribution & Marketing Accountability Phase 1 is implemented, schema-applied, pushed, deployed, and read-only Production validated at implementation commit `ba816c2bad315f7ef85051bb3e247f2f965f50b6`. Do not rebuild it or treat the ten preserved Production test leads as real historical marketing KPIs; no provider activation or automatic attribution backfill is authorized.
- The inbound-only Twilio implementation is complete and must not be rebuilt. WeatherTech Tucson and WeatherTech Phoenix ending `1326` are live-validated; IHC remains an exact active route at `ready_for_live_test`. Only IHC live validation and separately approved A2P/outbound work remain external follow-up, and neither authorizes outbound SMS.
- These guardrails do not select or recommend a next sprint.

## Last Review

Lead Attribution & Marketing Accountability Phase 1 is completed. Live Yelp Lead Intake via Mighty Apes remains without official provider-test evidence, CRM Identity Integrity Phase 1 remains complete without a production graph change, and the inbound-only Twilio sprint remains closed. No subsequent sprint is selected, approved, promoted, or started.
