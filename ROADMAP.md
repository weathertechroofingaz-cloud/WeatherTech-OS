# WeatherTech OS Roadmap

This roadmap records verified product boundaries and candidate future work. It does not approve a sprint. Only the owner may select work through [project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md).

## Latest Closed Owner-Approved Sprint

- **Proposal-to-Sold Job Operational Completion Phase 1** — completed at implementation commit `b694ad844af48fb23d1849f3180382a016056441` and merge commit `7186001eec28177a32b454168e5fd05b43af9937`. GitHub Actions push run `32790490435` passed both jobs `97630910053` and `97631410575`; Vercel Production deployment `6073515066`, status `17277113969`, succeeded at the exact merge SHA. The exact additive migration `20260824044610_native_proposal_esign_sold_job_gate.sql` at SHA-256 `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7` advanced the historical `50/50` starting ledger to a verified final `51/51`. Targeted Browser run `20260824223608414`, full `24/24`-group and `31/31`-assertion Browser run `20260824231426642`, Production database/HTTP verification, and authenticated read-only Production Browser smoke all passed without a real customer send, acceptance, deposit, payment, sold job, or other Production business-data write.

## Established Capabilities — Do Not Rebuild As New Sprints

- AI Command Center 3.0 is implemented on the existing AI Tools 2.1 foundation with company-scoped, approval-gated behavior.
- WeatherTech Roofing's company-isolated Stripe Payment Element, webhook accounting, and full-refund foundation are implemented and production-validated. IHC remains blocked until it receives a separate authorized account/configuration.
- The inbound-only Twilio implementation is deployed. WeatherTech Tucson ending `3145` and WeatherTech Phoenix ending `1326` are exactly mapped and live-validated; IHC ending `6930` remains exactly mapped and active at `ready_for_live_test`. Phoenix is assigned to the directly inspected shared Messaging Service; outbound SMS remains disabled and A2P Brand/Campaign registration is not complete.
- WeatherTech OS is deployed to Vercel with Production Supabase, document storage, Gmail, Google Calendar, and GoHighLevel production connection checkpoints completed.
- Customer 360 includes an owner/admin-only, evidence-based customer/property reconciliation queue with transactional idempotency, immutable audit history, and database-enforced same-company relationships. A production operation still requires one exact owner-selected graph.
- Lead intake now creates company-scoped first-touch accountability from deterministic evidence or explicit unknown/review state. Assigned owner, human first response, appointment, inspection, estimate, won/lost outcome, contract value, manual spend, repeat opportunity, and Marketing Accountability reporting are implemented with immutable events, retry convergence, Phoenix month boundaries, and visible data-quality gaps.
- The Mighty Apes Yelp receiver, immutable delivery ledger, and atomic WeatherTech-only CRM intake are deployed. Authenticated `lead.test` is audit-only, and `lead.created` is idempotent on the stable provider lead ID. Official Production evidence remains external follow-up, not rebuild backlog.
- The native proposal-to-sold-job lifecycle now persists immutable customer-safe proposal revisions and documents, gates truthful owner-approved Gmail delivery, provides a narrow hashed-token customer signature flow and completed receipt, enforces same-company posted-payment deposit evidence when required, and creates exactly one linked sold job through a server-controlled idempotent conversion boundary.

These capabilities may be changed only through an owner-approved rework, hardening, or activation sprint. Their presence is not permission to enable automated AI actions, broad Stripe writes, IHC Stripe, or customer-facing provider automation.

## External Or Separately Approved Work

- Mighty Apes Production validation remains external: its current server-side configuration must be reverified at the separately authorized provider-test step, then the official Send Test Delivery must run. A first real `lead.created` must later persist exactly once before the integration may be described as live.
- IHC carrier-ingress validation, company/service-separated Twilio A2P registration, outbound messaging, voice, MMS, and automation; QuickBooks; CompanyCam; IHC Stripe; third-party electronic-signature providers; Google Business Profile activation; customer-portal launch; employee-portal launch; and live AI-provider activation remain external or separate owner decisions. No scheduled Twilio inventory automation remains.
- Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This is an operational go-live gate; it does not authorize Codex to invent, rewrite, approve, or represent the legal sufficiency of that language.

## Next Sprint

No next sprint is selected, approved, or started. [project-management/NEXT_SPRINT.md](./project-management/NEXT_SPRINT.md) remains planning-only until the owner explicitly names and approves one exact sprint.
