
# WeatherTech OS

WeatherTech OS is a custom operating system designed to streamline operations for WeatherTech Roofing LLC and IHC Painting.

## Overview

This project is focused on centralizing sales, estimating, and customer follow-up workflows for roofing and painting services. It aims to connect with GoHighLevel, automate administrative tasks with AI, and deliver a more efficient experience for both teams and customers.

## Goals

- Manage roofing and painting leads
- Connect to GoHighLevel for CRM and automation
- Generate scopes of work quickly and accurately
- Create estimates for customers
- Follow up with customers and prospects
- Book inspections and coordinate field work
- Use AI to assist with admin work and operational efficiency

## Companies

- WeatherTech Roofing LLC
- IHC Painting

## Project Scope

WeatherTech OS is intended to support:

- Lead intake and qualification
- Scope and estimate generation
- Customer communication and follow-up
- Inspection scheduling and tracking
- AI-enabled workflow assistance for office staff

## Status

WeatherTech OS is an actively implemented Next.js/Supabase application deployed to Vercel for WeatherTech Roofing LLC and IHC Painting. Production health, dependency readiness, provider write gates, company isolation, and activation approval remain separate controls; a healthy deployment must not be described as full production activation when `/api/readiness` is blocked.

The completed Production Data Isolation & Clean Baseline sprint established fail-closed automated-test isolation and removed only evidence-proven synthetic production contamination. The completed Non-Production Regression Environment & CI Test-Data Lifecycle sprint added a dedicated hosted test target, deterministic synthetic-data cleanup, and protected CI lifecycle verification; production remains prohibited as an ordinary write-capable test target. Lead Attribution & Marketing Accountability Phase 1 now provides company-isolated first-touch attribution, auditable funnel milestones, explicit lead ownership, same-company repeat opportunities, manual monthly spend, and a focused accountability dashboard. Its exact additive schema is applied in Production, but all five new tables are empty: the ten preserved Production leads are owner-identified test data, received no backfill, and are not real historical KPIs. CRM Identity Integrity Phase 1 remains complete without a Production business-graph reconciliation or automatic backfill. Live Yelp Lead Intake via Mighty Apes is implemented, schema-applied, and deployed, but no official Production provider test or real Yelp lead has occurred, so Yelp is not described as connected or live. Production Connections Phase 1: Twilio/SMS remains closed: WeatherTech Tucson ending `3145` and WeatherTech Phoenix ending `1326` are mapped and live-validated for inbound SMS; IHC ending `6930` remains mapped and active at `ready_for_live_test`. Phoenix is assigned to the directly inspected shared Messaging Service. Outbound SMS remains disabled with zero sends, and Twilio has no completed A2P Brand or Campaign registration. AI Command Center 3.0 and the WeatherTech-only Stripe payment/refund foundation already exist and are not rebuild backlog items. IHC Stripe and other external provider capabilities remain separately gated.

Proposal-to-Sold Job Operational Completion Phase 1 is merged and deployed from implementation commit `b694ad844af48fb23d1849f3180382a016056441` through exact merge and Production implementation deployment SHA `7186001eec28177a32b454168e5fd05b43af9937`. The approved additive migration `20260824044610_native_proposal_esign_sold_job_gate.sql` (SHA-256 `703ce436ee616b5181cc189c5ea5287c64dde3f2bfaf0c57e1cc903a414e89d7`) brought local, regression, and Production ledgers to `51/51`. The release provides immutable proposal finalization, owner-controlled native signing delivery, signed receipt recovery, required-deposit enforcement, and company-scoped sold-job conversion. Release validation created no real customer delivery, acceptance, deposit, payment, invoice, or sold job. External signature providers, payment processors, automatic communications, and customer-facing portal authentication remain disabled or separately gated; no customer portal was activated.

Before the first real customer electronic-signature delivery, the electronic-record/customer disclosure must receive legal review. This is an operational go-live gate; it does not authorize Codex to invent, rewrite, approve, or represent the legal sufficiency of that language.

## Sprint Management

WeatherTech OS sprint execution is controlled by the repository workflow in
[project-management/OWNER_APPROVAL.md](./project-management/OWNER_APPROVAL.md),
[project-management/CURRENT_SPRINT.md](./project-management/CURRENT_SPRINT.md),
and [project-management/SPRINT_WORKFLOW.md](./project-management/SPRINT_WORKFLOW.md).
Codex must verify owner approval before starting product development and must
not begin work when the current sprint is awaiting owner approval.

## Architecture & Engineering Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Module Registry](./docs/MODULE_REGISTRY.md)
- [Design System](./docs/DESIGN_SYSTEM.md)
- [Testing Standard](./docs/TESTING_STANDARD.md)
- [Browser Regression Safety](./docs/codex-browser-regression.md)
- [Non-Production Regression Environment](./docs/NON_PRODUCTION_REGRESSION_ENVIRONMENT.md)
- [Production Data Isolation and Clean Baseline](./docs/PRODUCTION_DATA_ISOLATION_AND_BASELINE.md)
- [Twilio Phase 1 Setup](./docs/TWILIO_PHASE_1_SETUP.md)
- [Google Workspace / Gmail Production Activation](./docs/GOOGLE_WORKSPACE_PHASE_1_SETUP.md)
- [Google Calendar Phase 1 Setup](./docs/GOOGLE_CALENDAR_PHASE_1_SETUP.md)
- [Google Business Profile Phase 1 Setup](./docs/GOOGLE_BUSINESS_PROFILE_PHASE_1_SETUP.md)
- [QuickBooks Online Phase 1 Setup](./docs/QUICKBOOKS_ONLINE_PHASE_1_SETUP.md)
- [Electronic Signatures Phase 1 Setup](./docs/ELECTRONIC_SIGNATURES_PHASE_1_SETUP.md)
- [Estimate & Proposal Builder 2.0](./docs/ESTIMATE_PROPOSAL_BUILDER_2.md)
- [AI Tools 2.0 Operating Brain](./docs/AI_TOOLS_2_OPERATING_BRAIN.md)
- [AI Tools 2.1 Live Provider Pilot](./docs/AI_TOOLS_2_LIVE_PROVIDER_PILOT.md)
- [Production Activation Readiness](./docs/PRODUCTION_ACTIVATION_READINESS.md)
- [Private Staging Deployment](./docs/PRIVATE_STAGING_DEPLOYMENT.md)
- [Website Integration Phase 1 Setup](./docs/WEBSITE_INTEGRATION_PHASE_1_SETUP.md)
- [Yelp Integration Phase 1 Setup](./docs/YELP_INTEGRATION_PHASE_1_SETUP.md)
- [Changelog](./CHANGELOG.md)
