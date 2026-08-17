# WeatherTech OS Roadmap

This roadmap records verified product boundaries and candidate future work. It does not approve a sprint. Only the owner may select work through [project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md).

## Latest Closed Owner-Approved Sprint

- **Lead Attribution & Marketing Accountability Phase 1 — Verified Origin, Funnel & Manual Spend** — implementation, exact three-migration additive release, push, deployment, and read-only Production validation are complete at implementation commit `ba816c2bad315f7ef85051bb3e247f2f965f50b6`. Production matches all `48/48` committed migrations; all five new tables are empty, and the ten preserved test leads received no backfill and are not historical KPI truth.

## Established Capabilities — Do Not Rebuild As New Sprints

- AI Command Center 3.0 is implemented on the existing AI Tools 2.1 foundation with company-scoped, approval-gated behavior.
- WeatherTech Roofing's company-isolated Stripe Payment Element, webhook accounting, and full-refund foundation are implemented and production-validated. IHC remains blocked until it receives a separate authorized account/configuration.
- The inbound-only Twilio implementation is deployed. WeatherTech Tucson ending `3145` and WeatherTech Phoenix ending `1326` are exactly mapped and live-validated; IHC ending `6930` remains exactly mapped and active at `ready_for_live_test`. Phoenix is assigned to the directly inspected shared Messaging Service; outbound SMS remains disabled and A2P Brand/Campaign registration is not complete.
- WeatherTech OS is deployed to Vercel with Production Supabase, document storage, Gmail, Google Calendar, and GoHighLevel production connection checkpoints completed.
- Customer 360 includes an owner/admin-only, evidence-based customer/property reconciliation queue with transactional idempotency, immutable audit history, and database-enforced same-company relationships. A production operation still requires one exact owner-selected graph.
- Lead intake now creates company-scoped first-touch accountability from deterministic evidence or explicit unknown/review state. Assigned owner, human first response, appointment, inspection, estimate, won/lost outcome, contract value, manual spend, repeat opportunity, and Marketing Accountability reporting are implemented with immutable events, retry convergence, Phoenix month boundaries, and visible data-quality gaps.
- The Mighty Apes Yelp receiver, immutable delivery ledger, and atomic WeatherTech-only CRM intake are deployed. Authenticated `lead.test` is audit-only, and `lead.created` is idempotent on the stable provider lead ID. Official Production evidence remains external follow-up, not rebuild backlog.

These capabilities may be changed only through an owner-approved rework, hardening, or activation sprint. Their presence is not permission to enable automated AI actions, broad Stripe writes, IHC Stripe, or customer-facing provider automation.

## External Or Separately Approved Work

- Mighty Apes Production validation remains external: its current server-side configuration must be reverified at the separately authorized provider-test step, then the official Send Test Delivery must run. A first real `lead.created` must later persist exactly once before the integration may be described as live.
- IHC carrier-ingress validation, company/service-separated Twilio A2P registration, outbound messaging, voice, MMS, and automation; QuickBooks; CompanyCam; IHC Stripe; external electronic signatures; Google Business Profile activation; customer-portal launch; employee-portal launch; and live AI-provider activation remain external or separate owner decisions. No scheduled Twilio inventory automation remains.

## Next Sprint

No next sprint is selected, approved, or started. [project-management/NEXT_SPRINT.md](./project-management/NEXT_SPRINT.md) remains planning-only until the owner explicitly names and approves one exact sprint.
