# WeatherTech OS Roadmap

This roadmap records verified product boundaries and candidate future work. It does not approve a sprint. Only the owner may select work through [project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md).

## Latest Completed Owner-Approved Sprint

- **CRM Identity Integrity Phase 1 — Customer & Property Reconciliation** — completed, pushed, deployed, and production-schema validated at implementation commit `8ab9f55af5e15ba1706ab71f06ade8312c0f6639`. The company-partitioned reviewed reconciliation capability is available, but no production business graph was reconciled and no automatic backfill is authorized.

## Established Capabilities — Do Not Rebuild As New Sprints

- AI Command Center 3.0 is implemented on the existing AI Tools 2.1 foundation with company-scoped, approval-gated behavior.
- WeatherTech Roofing's company-isolated Stripe Payment Element, webhook accounting, and full-refund foundation are implemented and production-validated. IHC remains blocked until it receives a separate authorized account/configuration.
- The inbound-only Twilio implementation is deployed. WeatherTech Tucson ending `3145` is live-validated; IHC ending `6930` is exactly mapped and active at `ready_for_live_test` but has no live validation evidence; WeatherTech Phoenix remains unconfigured because no owner-approved eligible number is available. Outbound SMS remains disabled.
- WeatherTech OS is deployed to Vercel with Production Supabase, document storage, Gmail, Google Calendar, and GoHighLevel production connection checkpoints completed.
- Customer 360 includes an owner/admin-only, evidence-based customer/property reconciliation queue with transactional idempotency, immutable audit history, and database-enforced same-company relationships. A production operation still requires one exact owner-selected graph.

These capabilities may be changed only through an owner-approved rework, hardening, or activation sprint. Their presence is not permission to enable automated AI actions, broad Stripe writes, IHC Stripe, or customer-facing provider automation.

## External Or Separately Approved Work

- The Mighty Apes/Yelp webhook specification has been received, and Yelp Lead Intake is the owner's intended next sprint candidate. Do not build or activate it without explicit approval of the exact sprint.
- WeatherTech Phoenix number acquisition and carrier-ingress validation, IHC live inbound validation, Twilio outbound messaging, voice, MMS, and automation; QuickBooks; CompanyCam; IHC Stripe; external electronic signatures; Google Business Profile activation; customer-portal launch; employee-portal launch; and live AI-provider activation remain external or separate owner decisions. No scheduled Twilio inventory automation remains.

## Next Sprint

Yelp Lead Intake is the intended candidate, but no next sprint is approved or started. [project-management/NEXT_SPRINT.md](./project-management/NEXT_SPRINT.md) must remain unapproved until the owner explicitly approves its exact scope and promotion.
