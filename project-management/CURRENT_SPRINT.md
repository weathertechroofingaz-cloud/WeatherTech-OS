# Current Sprint

This file is the source of truth for the active WeatherTech OS sprint. Codex must read [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) and this file before beginning development.

## Approval Status

Approved.

This sprint was explicitly owner-approved in the Codex task request and must use the mandatory lifecycle in [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md).

## Sprint Name

Estimate & Proposal Builder 2.0 - World-Class Multi-Brand Sales, Acceptance, Invoice, and Payment System

## Objective

Transform the existing estimate workspace into a production proposal system for WeatherTech Roofing LLC and IHC Painting that supports customer-safe proposal packets, company-specific proposal structure, optional upgrades, alternatives, deposit invoice drafts, signature readiness, payment readiness, job handoff readiness, and future QuickBooks export readiness without activating live providers.

## Owner

Joe Harris

## Owner Approval Date

2026-08-04.

## Owner-Approved Scope

- Reuse the existing Estimates, Documents, Invoices, Customer 360, Customer Portal, Integration Center, QuickBooks readiness, and Electronic Signatures readiness architecture.
- Add company-aware proposal templates for WeatherTech Roofing LLC and IHC Painting.
- Add proposal revisions, customer-facing proposal sections, upgrade and alternative options, acceptance records, payment schedules, and proposal audit events.
- Keep internal costs, margins, markup, commissions, and private notes out of customer-facing proposal packets.
- Preserve clear base proposal total, selected upgrades total, accepted total, and deposit draft amount.
- Support base proposal pricing, add-on upgrades, replacement alternatives, allowances, materials, warranties, exclusions, payment schedule language, and terms.
- Save customer-safe proposal packets into Documents.
- Create deposit invoice drafts from accepted proposal totals without activating payment collection.
- Surface proposal totals, payment schedule, and approval readiness in the Customer Portal.
- Keep signature provider, online payment collection, and QuickBooks sync readiness honest and disabled until future activation.
- Add proposal regression coverage, migration integrity coverage, and browser regression assertions.

## Explicit Exclusions

- Do not activate DocuSign, Dropbox Sign, QuickBooks Online, payment processors, SMS, email, or other live providers.
- Do not send real proposals, real signature requests, real invoices, real payment links, customer SMS, or customer email.
- Do not apply remote Supabase migrations from Codex during this sprint.
- Do not weaken authentication or RLS.
- Do not expose secrets, credentials, API keys, provider tokens, or `.env.local` values.
- Do not create destructive migrations.
- Do not redesign unrelated modules.
- Do not create a duplicate CRM, duplicate estimate system, or duplicate accounting workflow.
- Do not fake connected, signed, paid, synced, delivered, or accepted provider states.
- Do not begin another sprint after completion.

## Completion Criteria

- Estimate workspace includes Proposal Builder 2.0.
- Proposal pricing separates base total, selected upgrade total, accepted total, deposit draft, and remaining balance.
- Optional upgrades do not alter the base proposal until selected.
- Full replacement alternatives replace the base proposal total without double-counting add-ons.
- Customer-facing packets exclude internal cost, margin, markup, commission, and private note language.
- Company-specific WeatherTech Roofing LLC and IHC Painting templates are seeded by migration.
- Documents support proposal and signed proposal categories.
- Deposit invoice draft creation uses existing invoice architecture and does not activate online payments.
- Signature readiness, payment readiness, and QuickBooks readiness display disabled/foundation states honestly.
- Customer Portal surfaces the latest proposal and proposal payment schedule without activating customer payment.
- Migration `0032_estimate_proposal_builder_v2.sql` is additive, transactionally wrapped, non-destructive, and not remotely applied by Codex.
- Automated proposal tests pass.
- Migration integrity tests pass.
- Browser regression includes proposal-builder customer-safe assertions.
- `npm run type-check` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Final scope audit confirms no unrelated files or behavior changed.
- One focused conventional commit is created and pushed.
- Local `main` equals `origin/main`.
- Working tree is clean.

## Validation Plan

- Confirm [OWNER_APPROVAL.md](./OWNER_APPROVAL.md) has been read.
- Confirm explicit owner approval from the task request.
- Confirm the current local branch is `main`.
- Confirm local `HEAD` matches `origin/main` before development begins.
- Run proposal builder automated tests.
- Run migration integrity tests.
- Run security/company-access policy tests.
- Run provider-foundation tests where applicable.
- Run `npm run type-check`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `git diff --check`.
- Run targeted signed-in browser regression for Estimates, proposal builder, Documents, Invoices, Customer Portal, Customer 360, navigation, and related workflows.
- Run full signed-in browser regression where supported.
- Confirm no disposable proposal, estimate, invoice, or regression records remain.

## Planned Commit Message

`feat: add estimate proposal builder v2`

## Blockers

Live provider activation remains blocked until owner-controlled provider credentials, OAuth setup, payment processor setup, QuickBooks setup, signature provider setup, production migration application, and explicit activation approval are complete.

## Final Status

Completed and validated through the final repository workflow. The sprint commit and push are recorded in Git history and in [COMPLETED_SPRINTS.md](./COMPLETED_SPRINTS.md).

## Notes

Use [SPRINT_WORKFLOW.md](./SPRINT_WORKFLOW.md) as the mandatory lifecycle for this sprint. Do not promote [NEXT_SPRINT.md](./NEXT_SPRINT.md) or begin another sprint unless the owner explicitly approves that action.
