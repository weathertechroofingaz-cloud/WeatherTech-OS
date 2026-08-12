# Next Sprint

This file is planning-only. It cannot authorize development, cannot approve a sprint, and cannot be automatically promoted into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md).

## Approval Status

Awaiting owner direction.

Owner approval is required before any contents of this file may be copied into [CURRENT_SPRINT.md](./CURRENT_SPRINT.md) or used to begin implementation.

## Sprint Name

To be provided by owner.

## Objective

To be provided by owner.

## Owner-Approved Scope

- To be provided by owner.

## Explicit Exclusions

- To be provided by owner.
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
- Yelp remains an external dependency awaiting the Mighty Apes/Yelp webhook handoff and is not an actionable sprint until the owner approves work after that handoff.
- These guardrails do not select or recommend a next sprint.

## Last Review

At completion of the owner-approved Non-Production Regression Environment & CI Test-Data Lifecycle sprint, no subsequent product-development sprint has been selected or approved. Status remains `Awaiting owner direction`.
