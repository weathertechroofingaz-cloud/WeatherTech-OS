# WeatherTech OS Roadmap

This roadmap records verified product boundaries and candidate future work. It does not approve a sprint. Only the owner may select work through [project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md).

## Latest Completed Owner-Approved Sprint

- **Non-Production Regression Environment & CI Test-Data Lifecycle** — completed. WeatherTech OS has a dedicated hosted regression target, fail-closed environment identity, deterministic synthetic-data ownership and cleanup, protected CI lifecycle verification, and a full recorded browser pass. Production remains prohibited as an ordinary write-capable regression target. See [Non-Production Regression Environment](./docs/NON_PRODUCTION_REGRESSION_ENVIRONMENT.md).

## Established Capabilities — Do Not Rebuild As New Sprints

- AI Command Center 3.0 is implemented on the existing AI Tools 2.1 foundation with company-scoped, approval-gated behavior.
- WeatherTech Roofing's company-isolated Stripe Payment Element, webhook accounting, and full-refund foundation are implemented and production-validated. IHC remains blocked until it receives a separate authorized account/configuration.
- The inbound-only Twilio implementation is deployed. WeatherTech Tucson ending `3145` is live-validated; IHC ending `6930` is exactly mapped and active at `ready_for_live_test` but has no live validation evidence; WeatherTech Phoenix remains unconfigured because no owner-approved eligible number is available. Outbound SMS remains disabled.
- WeatherTech OS is deployed to Vercel with Production Supabase, document storage, Gmail, Google Calendar, and GoHighLevel production connection checkpoints completed.

These capabilities may be changed only through an owner-approved rework, hardening, or activation sprint. Their presence is not permission to enable automated AI actions, broad Stripe writes, IHC Stripe, or customer-facing provider automation.

## External Or Separately Approved Work

- Yelp remains an external dependency awaiting the Mighty Apes/Yelp webhook handoff. Do not build or activate it without that handoff and a separate owner approval.
- WeatherTech Phoenix number acquisition and carrier-ingress validation, IHC live inbound validation, Twilio outbound messaging, voice, MMS, and automation; QuickBooks; CompanyCam; IHC Stripe; external electronic signatures; Google Business Profile activation; customer-portal launch; employee-portal launch; and live AI-provider activation remain external or separate owner decisions. No scheduled Twilio inventory automation remains.

## Next Sprint

No next sprint is selected or approved. Recommendations may be reported, but [project-management/NEXT_SPRINT.md](./project-management/NEXT_SPRINT.md) must remain unapproved until the owner chooses one.
