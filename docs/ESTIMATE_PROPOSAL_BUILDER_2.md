# Estimate & Proposal Builder 2.0

This document records the WeatherTech OS Estimate & Proposal Builder 2.0 foundation for WeatherTech Roofing LLC and IHC Painting.

The sprint upgrades the existing estimate workflow into a customer-safe proposal workflow. It does not activate live signature providers, payment processors, QuickBooks Online writes, outbound communications, or customer delivery.

## Supported Foundation

- Multi-brand proposal structure for WeatherTech Roofing LLC and IHC Painting.
- Company-aware proposal templates with active/default/archive status.
- Proposal revisions with lifecycle status, accepted totals, signature readiness, payment readiness, and QuickBooks readiness fields.
- Customer-facing proposal sections for overview, customer/property, inspection summary, findings, solution, scope, line items, base proposal, optional upgrades, alternatives, allowances, materials, photos, warranty, exclusions, payment schedule, financing, terms, acceptance, and attachments.
- Customer-visible add-on upgrades, replacement alternatives, discounts, allowances, and required/recommended/best-value flags.
- Customer acceptance records prepared for typed, drawn, uploaded, in-person, and provider-backed future acceptance methods.
- Payment schedules prepared for deposit, progress, final, retainage, and on-approval/on-start/on-completion/on-invoice/on-date due triggers.
- Proposal audit events for lifecycle tracking without live provider writes.
- Customer-safe proposal document drafts saved through the existing Documents workflow.
- Deposit invoice drafts created through the existing Invoices workflow.
- Customer Portal proposal and payment summary visibility.

## Customer-Safe Boundary

Customer-facing proposal packets must not expose:

- internal cost
- margin
- markup
- commission
- private notes
- profit language
- internal-only planning language

The proposal helper scrubs sensitive phrases from customer-visible sections and the document draft uses customer-safe proposal packet generation instead of raw internal estimate notes.

## Pricing Rules

- Base proposal total is calculated from the existing estimate line items and remains stable.
- Unselected optional upgrades do not change the customer-facing base proposal.
- Selected additive upgrades increase the accepted total and selected upgrades total.
- Selected replacement alternatives can replace the base proposal total.
- Selected add-ons can be combined with a replacement alternative without double-counting.
- Deposit amount is calculated from the accepted proposal total.
- Deposit invoices are created as drafts only; online payment collection remains disabled.

## Provider Readiness

The proposal workflow is prepared for future providers but does not activate them:

- Electronic signatures: DocuSign / Dropbox Sign readiness only.
- Payments: deposit/payment schedule readiness only.
- QuickBooks Online: export mapping readiness only.
- Communications: no live proposal email, SMS, or customer delivery.

## Database Change

`supabase/migrations/0032_estimate_proposal_builder_v2.sql` is additive and transactionally wrapped.

It adds:

- `proposal_templates`
- `estimate_proposal_revisions`
- `estimate_proposal_sections`
- `estimate_proposal_options`
- `estimate_proposal_acceptances`
- `proposal_payment_schedules`
- `proposal_audit_events`

It extends document categories to support:

- `proposal`
- `signed_proposal`

It does not delete production data, remove policies, weaken RLS, grant authenticated delete access, activate providers, or apply remote database changes by itself.

## Owner Setup Still Required

1. Apply migration `0032_estimate_proposal_builder_v2.sql` through the approved Supabase migration path after deployment review.
2. Review and approve the seeded WeatherTech Roofing LLC proposal templates.
3. Review and approve the seeded IHC Painting proposal templates.
4. Approve any live signature provider activation in a future sprint.
5. Approve any online payment processor activation in a future sprint.
6. Approve QuickBooks Online export and accounting writes in a future sprint.
7. Approve any real proposal delivery by email, SMS, customer portal, or provider workflow in a future sprint.

## Explicitly Not Implemented

- No live DocuSign envelope creation.
- No live Dropbox Sign signature requests.
- No live payment processing.
- No customer payment links.
- No live QuickBooks Online export.
- No automatic customer email.
- No automatic SMS.
- No provider webhooks.
- No PDF rendering service activation.
- No customer-facing portal authentication activation.
