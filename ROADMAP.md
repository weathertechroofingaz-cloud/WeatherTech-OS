# WeatherTech OS Roadmap

This roadmap records verified product boundaries and candidate future work. It does not approve a sprint. Only the owner may select work through [project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md).

## Latest Closed Owner-Approved Sprint

- **Live Yelp Lead Intake via Mighty Apes** — implementation, schema, push, and deployment are complete at commit `103eddab7f464ca9472e8fb8c2b6cc652e7fc89c`; the official provider test is externally blocked by missing signing-secret configuration. No production provider test, real Yelp lead, or Yelp intake record exists, so the integration is not described as connected, live, or fully production-validated.

## Established Capabilities — Do Not Rebuild As New Sprints

- AI Command Center 3.0 is implemented on the existing AI Tools 2.1 foundation with company-scoped, approval-gated behavior.
- WeatherTech Roofing's company-isolated Stripe Payment Element, webhook accounting, and full-refund foundation are implemented and production-validated. IHC remains blocked until it receives a separate authorized account/configuration.
- The inbound-only Twilio implementation is deployed. WeatherTech Tucson ending `3145` is live-validated; IHC ending `6930` and WeatherTech Phoenix ending `1326` are exactly mapped and active at `ready_for_live_test` but have no live validation evidence. Phoenix is assigned to the directly inspected shared Messaging Service; outbound SMS remains disabled and A2P Brand/Campaign registration is not complete.
- WeatherTech OS is deployed to Vercel with Production Supabase, document storage, Gmail, Google Calendar, and GoHighLevel production connection checkpoints completed.
- Customer 360 includes an owner/admin-only, evidence-based customer/property reconciliation queue with transactional idempotency, immutable audit history, and database-enforced same-company relationships. A production operation still requires one exact owner-selected graph.
- The Mighty Apes Yelp receiver, immutable delivery ledger, and atomic WeatherTech-only CRM intake are deployed. Authenticated `lead.test` is audit-only, and `lead.created` is idempotent on the stable provider lead ID. Official Production evidence remains external follow-up, not rebuild backlog.

These capabilities may be changed only through an owner-approved rework, hardening, or activation sprint. Their presence is not permission to enable automated AI actions, broad Stripe writes, IHC Stripe, or customer-facing provider automation.

## External Or Separately Approved Work

- Mighty Apes Production validation remains external: add the server-only signing secret, redeploy, and run the official Send Test Delivery. A first real `lead.created` must later persist exactly once before the integration may be described as live.
- WeatherTech Phoenix and IHC carrier-ingress validation, Twilio A2P registration, outbound messaging, voice, MMS, and automation; QuickBooks; CompanyCam; IHC Stripe; external electronic signatures; Google Business Profile activation; customer-portal launch; employee-portal launch; and live AI-provider activation remain external or separate owner decisions. No scheduled Twilio inventory automation remains.

## Next Sprint

No next sprint is selected, approved, or started. [project-management/NEXT_SPRINT.md](./project-management/NEXT_SPRINT.md) remains planning-only until the owner explicitly names and approves one exact sprint.
