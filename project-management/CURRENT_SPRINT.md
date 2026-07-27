# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

Codex may begin development only after completing the approval gate in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Sales Pipeline & Opportunity Management

## Objective

Build a production-ready Sales Pipeline & Opportunity Management workspace for WeatherTech Roofing LLC and IHC Painting using the existing CRM architecture.

## Owner

Joe Harris

## Owner Approval Date

2026-07-27.

## Owner-Approved Scope

- Sales Pipeline workspace.
- Opportunity management.
- Company-scoped opportunities.
- Opportunity stages.
- Opportunity details.
- Opportunity assignment.
- Expected revenue.
- Probability.
- Next action.
- Follow-up reminders.
- Opportunity -> Estimate linkage.
- Opportunity -> Job linkage.
- Customer timeline integration.
- Search and filtering.
- Browser regression coverage.

## Explicit Exclusions

- No provider integrations.
- No Twilio.
- No GoHighLevel.
- No schema redesign.
- No authentication changes.
- No RLS changes.
- No UI redesign outside the approved sprint.

## Completion Criteria

- The Sales Pipeline workspace is implemented using existing WeatherTech OS architecture.
- Opportunities reuse existing CRM data and persistence wherever practical.
- Company scoping works for WeatherTech Roofing LLC, IHC Painting, and all-company views.
- Search and filtering work for the approved opportunity fields.
- Opportunity details display stage, assignment, expected revenue, probability, next action, follow-up reminders, and related estimate/job context where supported by existing data.
- Existing Lead Intake, Customer 360, Estimates, Communications, Calendar, Operations, Jobs, and Inspections workflows remain intact.
- Browser regression coverage is added for the Sales Pipeline workflow.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Relevant browser regression passes.
- Final scope audit confirms no excluded work or unrelated files were changed.
- One focused conventional commit is created and pushed after implementation approval.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm approval status is exactly `Approved`.
- Confirm the working tree is clean before development begins.
- Confirm the current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before development begins.
- Inspect the existing CRM, Leads, Customer 360, Estimates, Jobs, Communications, Calendar, Operations, and Inspections implementation before editing.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Sales Pipeline and directly related CRM workflows.
- Run broader browser regression where the sprint changes shared navigation or CRM behavior.
- Clean all disposable regression records.

## Planned Commit Message

To be selected after implementation with an accurate conventional commit message.

## Blockers

- None recorded.

## Final Status

Approved for implementation.

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
