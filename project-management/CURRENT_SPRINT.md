# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

Codex may begin development only after completing the approval gate in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Document Center

## Objective

Build a production-ready, company-aware Document Center for WeatherTech Roofing LLC and IHC Painting using the existing WeatherTech OS CRM architecture and document relationships.

## Owner

Joe Harris

## Owner Approval Date

2026-07-28.

## Owner-Approved Scope

- Build the company-aware Document Center.
- Reuse existing CRM architecture.
- Reuse existing document relationships.
- Support WeatherTech Roofing LLC and IHC Painting.
- Preserve existing navigation and design language.
- Include browser regression coverage where document workflows are affected.

## Explicit Exclusions

- Do not redesign the application.
- No schema changes unless absolutely required and separately explained.
- No RLS changes unless absolutely required and separately explained.
- No fake integrations.
- No provider activation.
- No authentication changes.
- No package or lockfile changes unless absolutely required.
- No `.env.local` changes.

## Completion Criteria

- The Document Center workspace is implemented using existing WeatherTech OS architecture.
- Document relationships reuse existing CRM, customer, lead, opportunity, estimate, job, and inspection context wherever practical.
- Company scoping works for WeatherTech Roofing LLC, IHC Painting, and all-company views.
- Search, filtering, categories, tags, upload status, preview/download, rename, archive, recent documents, and activity history work where supported by existing data.
- Existing Customer 360, Leads, Opportunities, Estimates, Jobs, Inspections, Communications, Calendar, Dashboard, and navigation workflows remain intact.
- Browser regression coverage is added for Document Center workflows.
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
- Inspect the existing CRM, Document Center, Customers, Leads, Opportunities, Estimates, Jobs, Inspections, Communications, Calendar, Dashboard, and navigation implementation before editing.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Document Center and directly related CRM workflows.
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
