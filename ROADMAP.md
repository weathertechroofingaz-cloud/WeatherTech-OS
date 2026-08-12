# WeatherTech OS Roadmap

This roadmap records verified product boundaries and candidate future work. It does not approve a sprint. Only the owner may select work through [project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md).

## Latest Completed Owner-Approved Sprint

- **Production Data Isolation & Clean Baseline** — completed. Ordinary regression tooling now fails closed before Production Supabase access, evidence-proven contamination was removed, and the clean baseline is recorded in [Production Data Isolation And Clean Baseline](./docs/PRODUCTION_DATA_ISOLATION_AND_BASELINE.md).

## Established Capabilities — Do Not Rebuild As New Sprints

- AI Command Center 3.0 is implemented on the existing AI Tools 2.1 foundation with company-scoped, approval-gated behavior.
- WeatherTech Roofing's company-isolated Stripe Payment Element, webhook accounting, and full-refund foundation are implemented and production-validated. IHC remains blocked until it receives a separate authorized account/configuration.
- WeatherTech OS is deployed to Vercel with Production Supabase, document storage, Gmail, Google Calendar, and GoHighLevel production connection checkpoints completed.

These capabilities may be changed only through an owner-approved rework, hardening, or activation sprint. Their presence is not permission to enable automated AI actions, broad Stripe writes, IHC Stripe, or customer-facing provider automation.

## External Or Separately Approved Work

- Yelp remains an external dependency awaiting the Mighty Apes/Yelp webhook handoff. Do not build or activate it without that handoff and a separate owner approval.
- Twilio/SMS, QuickBooks, CompanyCam, IHC Stripe, external electronic signatures, Google Business Profile activation, customer-portal launch, employee-portal launch, and live AI-provider activation remain separate owner decisions.

## Next Sprint

No next sprint is selected or approved. Recommendations may be reported, but [project-management/NEXT_SPRINT.md](./project-management/NEXT_SPRINT.md) must remain unapproved until the owner chooses one.
