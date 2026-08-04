# Completed Sprints

This file records completed WeatherTech OS sprints after validation, commit, push, and remote synchronization.

## Recent Verified Sprints

### Core Office Operations Hardening

- Commit: `077b050088c150b80d89d244a7980613c65c1b61`
- Message: `fix: harden core office CRM workflows`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Hardened core office CRM workflows.
  - Preserved existing CRM, Supabase, and production workflows.

### Website & Marketing Integration Foundation

- Commit: `1785b73d67a129e8fd4a0e4991e7d31331411d04`
- Message: `feat: add website marketing integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Notes:
  - Added the read-only Website & Marketing integration foundation.
  - Added navigation and browser regression coverage.
  - Did not modify CRM persistence, Supabase schema, APIs, packages, migrations, RLS, or provider credentials.

### Lead Intake Foundation

- Commit: `3f03c7e82c6dcb3395851fabc03d28027f68310a`
- Message: `feat: add lead intake foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a CRM Lead Intake workspace using the existing lead model and persistence path.
  - Captured customer, property, source, company assignment, priority, and lead status/stage.
  - Added browser regression coverage for company-scoped lead intake creation.
  - Did not modify Supabase schema, RLS, auth, packages, migrations, provider integrations, or environment files.

### Sales Pipeline & Opportunity Management

- Commit: `4c8b2935f06e30dd6dba45619f777b84e4baa9f4`
- Message: `feat: add sales pipeline opportunity management`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the Sales Pipeline workspace and opportunity management workflow.
  - Reused existing WeatherTech OS CRM records, company scoping, estimates, jobs, and browser regression coverage.
  - Did not modify authentication, RLS, provider integrations, packages, or environment files.

### Twilio Phase 1 - Production Communications Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Twilio communications foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Twilio configuration readiness, signed inbound webhook handling, business-number routing, CRM matching, lead-intake fallback, and safe outbound-send gating.
  - Added setup documentation for WeatherTech Phoenix, WeatherTech Tucson, and IHC business-number mapping.
  - Did not add migrations, modify `.env.local`, expose secrets, or send real SMS/call traffic.

### Gmail / Google Workspace Phase 1 - Production Email Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Gmail workspace email foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Google OAuth readiness, company-aware Gmail mailbox records, encrypted token storage, manual sync/import, CRM matching, attachment metadata, and integration log coverage.
  - Added safe outbound send boundaries that require explicit server-side enablement before Gmail sends any customer email.
  - Added Google Workspace setup documentation and safe environment placeholders.
  - Did not modify `.env.local`, expose credentials, send real email, or activate live Google Workspace connectivity.

### Google Calendar Phase 1 - Production Scheduling Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Calendar scheduling foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added server-side Google Calendar configuration, OAuth scope-upgrade, calendar discovery, sync planning, inbound webhook intake, unmatched-event review, and conflict-detection foundations.
  - Added additive migration `0028_google_calendar_scheduling_foundation.sql` for company-aware connected calendars, Calendar credentials, event sync metadata, and unmatched provider events.
  - Added safe write gating through `GOOGLE_CALENDAR_WRITE_ENABLED=false`, sanitized Calendar payloads, and setup documentation.
  - Did not modify `.env.local`, expose credentials, create live Calendar events, or apply the migration remotely.

### Unified Lead Intake Hub - Production Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add unified lead intake hub`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added a canonical lead intake service for Website, Twilio, Gmail, manual CRM entry, and future provider adapters.
  - Added duplicate prevention through phone/email normalization, existing customer matching, existing lead matching, provider event IDs, and request fingerprints.
  - Existing customer matches now attach intake activity to Customer 360 without creating duplicate leads.
  - New unmatched accepted intake creates exactly one CRM lead and an actionable follow-up notification.
  - Gmail sync now routes unmatched inbound email into the same lead intake pipeline.
  - Preserved source attribution and sanitized integration sync logging.
  - Added service-level and browser regression coverage for duplicate detection, provider routing, lead creation, customer matching, malformed payloads, provider failures, logging, and UI surfacing.
  - Did not add migrations, modify `.env.local`, activate live Yelp/Google Business Profile/Facebook connectivity, send real customer communications, or weaken authentication/RLS.

### Website Integration Phase 1 - Multi-Brand Live Lead Capture Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add website integration lead capture foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Hardened the signed website lead endpoint for WeatherTech Roofing LLC, WeatherTech Phoenix/Tucson attribution, IHC Painting, and future approved landing pages.
  - Added form-type routing, origin allow-list support, production-disabled gating, attribution and consent preservation, rate-limit/spam controls, and safe integration logging.
  - Added safe environment placeholders and owner setup documentation for server-side HMAC configuration and production activation.
  - Did not modify `.env.local`, activate live public website forms, send customer communications, weaken authentication/RLS, or add destructive migrations.

### Yelp Integration Phase 1 - Multi-Account Lead Intake Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Yelp integration lead intake foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the three-account Yelp foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
  - Preserved the Unified Lead Intake Hub as the canonical pipeline for controlled Yelp intake payloads.
  - Documented official Yelp capability boundaries, including partner-required Leads API, OAuth, and webhook activation.
  - Kept live Yelp sync and outbound replies disabled by default and did not scrape Yelp, store Yelp passwords, send real Yelp messages, modify `.env.local`, or add migrations.

### Google Business Profile Phase 1 - Multi-Location Integration Foundation

- Commit: `<this sprint commit>`
- Message: `feat: add Google Business Profile integration foundation`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `pass`
  - Type-check: `pass`
  - Lint: `pass`
  - `git diff --check`: `pass`
  - Automated tests: `pass`
  - Browser validation: `pass`
- Notes:
  - Added the three-location Google Business Profile foundation for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
  - Preserved the Unified Lead Intake Hub as the canonical pipeline for controlled Google Business Profile dry-run payloads.
  - Documented official Google Business Profile capability boundaries, including account/location APIs, reviews, performance, OAuth, Pub/Sub notifications, discontinued Q&A, and unsupported chat/request-a-quote behavior.
  - Added additive provider constraint migration `0029_google_business_profile_foundation.sql`.
  - Kept live Google Business Profile sync, review replies, and customer messaging disabled by default and did not scrape Google, automate browser login, store Google passwords, send real review replies, modify `.env.local`, weaken authentication/RLS, or perform destructive migrations.

## Recording Template

### Sprint Name

- Commit: `<full commit hash>`
- Message: `<commit message>`
- Branch: `main`
- Remote: `origin/main`
- Result: Completed and pushed.
- Validation:
  - Build: `<pass/fail>`
  - Type-check: `<pass/fail>`
  - Lint: `<pass/fail>`
  - `git diff --check`: `<pass/fail>`
  - Automated tests: `<pass/fail/not applicable>`
  - Browser validation: `<pass/fail/not applicable>`
- Notes:
  - `<summary>`
