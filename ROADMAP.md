# WeatherTech OS Roadmap

This roadmap records verified product boundaries and candidate future work. It does not approve a sprint. Only the owner may select work through [project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md).

## Latest Closed Owner-Approved Sprint

- **WeatherTech Tucson Inbound Voice Forwarding Phase 1** — completed at implementation commit `0ed7b07c3ee45d77508890dfda8d5f45b1cc1ef0` and PR #14 merge commit `2ace30ba04edfb0743b63ee050c7f3845540fe54`. Exact-SHA PR and main CI passed; gate-on Vercel Production deployment `dpl_BzukHpKwCH1HTWqNMHyxJsNLrAx6` is healthy at the merge SHA; local and Production migration ledgers remain exact at `51/51` because no migration was required. The protected, configurable Tucson destination and Tucson-only signed voice route produced two intentional completed calls of 15 and 18 seconds with owner-confirmed two-way audio and four exact provider events. Recording, transcription, outbound SMS, outbound calls independent of the active inbound caller, Twilio REST calls, outbound call records, automatic replies, and automatic CRM side effects remained zero; Tucson/Phoenix/IHC inbound SMS evidence was unchanged. Phoenix and IHC remain SMS-only, and no number was ported, reassigned, released, or replaced.

## Established Capabilities — Do Not Rebuild As New Sprints

- AI Command Center 3.0 is implemented on the existing AI Tools 2.1 foundation with company-scoped, approval-gated behavior.
- WeatherTech Roofing's company-isolated Stripe Payment Element, webhook accounting, and full-refund foundation are implemented and production-validated. IHC remains blocked until it receives a separate authorized account/configuration.
- The inbound Twilio implementation is deployed. WeatherTech Tucson ending `3145` and WeatherTech Phoenix ending `1326` remain exactly mapped and live-validated for SMS; Tucson alone is also operational for signed inbound voice forwarding to an owner-configurable protected destination. IHC ending `6930` remains exactly mapped and active at `ready_for_live_test` for inbound SMS. Phoenix and IHC remain SMS-only, outbound SMS remains disabled, and A2P Brand/Campaign registration is not complete.
- WeatherTech OS is deployed to Vercel with Production Supabase, document storage, Gmail, Google Calendar, and GoHighLevel production connection checkpoints completed.
- Customer 360 includes an owner/admin-only, evidence-based customer/property reconciliation queue with transactional idempotency, immutable audit history, and database-enforced same-company relationships. A production operation still requires one exact owner-selected graph.
- Lead intake now creates company-scoped first-touch accountability from deterministic evidence or explicit unknown/review state. Assigned owner, human first response, appointment, inspection, estimate, won/lost outcome, contract value, manual spend, repeat opportunity, and Marketing Accountability reporting are implemented with immutable events, retry convergence, Phoenix month boundaries, and visible data-quality gaps.
- The Mighty Apes Yelp receiver, immutable delivery ledger, and atomic WeatherTech-only CRM intake are deployed. Authenticated `lead.test` is audit-only, and `lead.created` is idempotent on the stable provider lead ID. Official Production evidence remains external follow-up, not rebuild backlog.
- The native proposal-to-sold-job lifecycle now persists immutable customer-safe proposal revisions and documents, gates truthful owner-approved Gmail delivery, provides a narrow hashed-token customer signature flow and completed receipt, enforces same-company posted-payment deposit evidence when required, and creates exactly one linked sold job through a server-controlled idempotent conversion boundary.

These capabilities may be changed only through an owner-approved rework, hardening, or activation sprint. Their presence is not permission to enable automated AI actions, broad Stripe writes, IHC Stripe, or customer-facing provider automation.

## External Or Separately Approved Work

- Mighty Apes Production validation remains external: its current server-side configuration must be reverified at the separately authorized provider-test step, then the official Send Test Delivery must run. A first real `lead.created` must later persist exactly once before the integration may be described as live.
- IHC carrier-ingress validation, company/service-separated Twilio A2P registration, outbound messaging, Phoenix/IHC or broader voice routing, MMS, and automation; QuickBooks; CompanyCam; IHC Stripe; third-party electronic-signature providers; Google Business Profile activation; customer-portal launch; employee-portal launch; and live AI-provider activation remain external or separate owner decisions. No scheduled Twilio inventory automation remains.
- Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This is an operational go-live gate; it does not authorize Codex to invent, rewrite, approve, or represent the legal sufficiency of that language.

## Next Sprint

No next sprint is selected, approved, or started. [project-management/NEXT_SPRINT.md](./project-management/NEXT_SPRINT.md) remains planning-only until the owner explicitly names and approves one exact sprint.
