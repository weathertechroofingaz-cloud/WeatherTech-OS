# Estimate & Proposal Builder 2.0

This document records the WeatherTech OS Estimate & Proposal Builder 2.0 foundation and Proposal-to-Sold Job Operational Completion Phase 1 for WeatherTech Roofing LLC and IHC Painting.

The completed workflow upgrades an approved estimate into an immutable customer-safe proposal, an owner-controlled native electronic-signature request, a signed receipt, a deposit gate, and a company-scoped sold job. It does not activate DocuSign, Dropbox Sign, a payment processor, QuickBooks Online writes, automatic outbound communications, or customer-facing portal authentication.

## Verified Production Release

- Implementation commit: `b694ad844af48fb23d1849f3180382a016056441`
- Merge and Production implementation deployment commit: `7186001eec28177a32b454168e5fd05b43af9937`
- Approved additive migration: `20260824044610_native_proposal_esign_sold_job_gate.sql`
- Migration SHA-256: `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`
- Final local, regression, and Production migration state: `51/51`
- Targeted native-signing Browser run `20260824223608414`: passed the deposit and no-deposit paths, signed-session renewal, and exact receipt recovery.
- Complete isolated Browser run `20260824231426642`: `24/24` groups and `31/31` assertions passed with zero console errors, zero console warnings, bounded cleanup, and zero residue.
- Release safety: no proposal/signature request was sent to a real customer, and no real acceptance, deposit, payment, invoice, or sold job was created for validation.

Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This is an operational go-live gate; it does not authorize Codex to invent, rewrite, approve, or represent the legal sufficiency of that language.

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
- Owner-side Customer Portal workspace proposal and payment-summary visibility only; no customer-facing portal authentication or activation.

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

## Signing, Payment, And Provider Boundaries

The proposal workflow now supports the native path while external providers and automated financial writes remain separately gated:

- Native electronic signatures: owner-controlled delivery of the exact finalized revision, scoped one-time-link exchange, acceptance or decline, immutable signed evidence, and terminal receipt recovery.
- External electronic signatures: DocuSign / Dropbox Sign readiness only; neither provider is connected or activated by this release.
- Payments: deposit invoice and recorded-payment gates only; online collection remains disabled.
- QuickBooks Online: export mapping readiness only.
- Communications: no automatic proposal email or SMS, and no real customer delivery occurred during release validation.
- Portal: no customer-facing authentication or customer portal activation.

## Database Changes

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

The approved additive migration `supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql` operationalizes native signing and the sold-job gate. It adds private signing-request, session, receipt, synthetic-cleanup-guard, and native-RPC-guard tables; exact immutable evidence links; guarded finalization, signing, receipt, deposit-invoice, and sold-job operations; and additive proposal/document/signature/acceptance/job/invoice columns. It does not backfill or mutate existing business records or Storage objects. Its SHA-256 is `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`, and the verified final migration state is `51/51` in local, regression, and Production.

## Operational Activation Still Required

1. Complete the legal-review gate above before the first real customer native electronic-signature delivery.
2. Review and approve the WeatherTech Roofing LLC and IHC Painting customer-facing proposal templates, terms, and operational delivery procedure before real use.
3. Keep every real proposal delivery owner-controlled and within the exact finalized-revision workflow.
4. Approve any DocuSign or Dropbox Sign activation separately in a future provider-activation sprint.
5. Approve any online payment processor activation separately; the current sold-job gate trusts only an exact posted deposit record when a deposit is required.
6. Approve QuickBooks Online export and accounting writes separately.
7. Approve customer-facing portal authentication separately; this release does not activate it.

## Explicitly Not Implemented

- No live DocuSign envelope creation.
- No live Dropbox Sign signature requests.
- No live payment processing.
- No customer payment links.
- No live QuickBooks Online export.
- No automatic customer email.
- No automatic SMS.
- No real customer electronic-signature delivery was used for release validation.
- No provider webhooks.
- No external PDF rendering service activation; deterministic server-rendered proposal and receipt PDFs are implemented.
- No customer-facing portal authentication activation.
