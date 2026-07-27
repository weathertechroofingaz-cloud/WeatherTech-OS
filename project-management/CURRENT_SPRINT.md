# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

Codex may begin development only after completing the approval gate in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md). This sprint record is being updated through a documentation-only approval sprint; product development must not begin from this update alone.

## Sprint Name

Lead Intake Foundation

## Objective

Build the first production-ready Lead Intake workflow for WeatherTech Roofing LLC and IHC Painting.

## Owner-Approved Scope

- Create a Lead Intake workspace.
- Create new leads.
- Capture customer information.
- Capture property information.
- Capture lead source.
- Assign company (WeatherTech Roofing LLC or IHC Painting).
- Track lead status.
- Save leads to the existing CRM.
- Reuse existing design system and architecture.

## Explicit Exclusions

- No automations.
- No email.
- No SMS.
- No scheduling.
- No estimates.
- No marketing features.
- No accounting.
- No GoHighLevel synchronization.
- No QuickBooks integration.
- No schema, RLS, authentication, or infrastructure changes unless absolutely required and separately approved.

## Completion Criteria

- CURRENT_SPRINT.md reflects the approved sprint.
- README links remain valid.
- Markdown validation passes.
- `git diff --check` passes.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- Commit and push documentation only.
- Verify local `main` equals `origin/main`.
- Verify a clean working tree.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm approval status is exactly `Approved`.
- Confirm the working tree is clean before future product development begins.
- Confirm the current local branch is identified.
- Confirm local `HEAD` matches the intended remote branch before future product development begins.
- Confirm sprint scope does not conflict with [NEXT_SPRINT.md](./NEXT_SPRINT.md), [ROADMAP.md](../ROADMAP.md), or [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).
- For this documentation-only update, validate markdown links, `git diff --check`, `npm run type-check`, `npm run lint`, and `npm run build`.

## Planned Commit Message

To be selected after implementation with an accurate conventional commit message.

## Owner Approval Date

2026-07-27.

## Owner Approval Note

Approved by Joe Harris.

## Blockers

- Product development for this sprint has not started yet.
- Future implementation must complete the approval gate before modifying product files.

## Final Status

Approved for future implementation.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for every sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) into this file unless the owner explicitly approves that action.
