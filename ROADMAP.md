# WeatherTech OS Roadmap

WeatherTech OS is being built as a professional roofing and painting CRM for WeatherTech Roofing LLC and IHC Painting. The development approach is to stabilize the core app first, then connect durable Supabase-backed workflows one module at a time.

## Current Baseline

- Next.js App Router project with TypeScript and Tailwind CSS.
- Single local app shell with dashboard navigation and mock CRM data.
- No Supabase client, schema migrations, auth flow, or environment contract exists in the repository yet.
- The first engineering priority is a clean build, predictable linting, and a clear CRM module structure.

## Phase 1: Foundation

- Keep the app buildable with `npm run type-check`, `npm run lint`, and `npm run build`.
- Define shared CRM domain types for companies, leads, customers, estimates, scopes, jobs, schedules, material orders, photos, invoices, and assistant activity.
- Add Supabase client setup for browser and server usage.
- Document required environment variables in an example env file.
- Add initial database migrations with row-level security policies.

## Phase 2: Lead And Customer CRM

- Replace mock leads with Supabase-backed lead records.
- Add lead intake, lead list, lead detail, status updates, and source tracking.
- Create customer profiles and link converted leads to customers.
- Add notes, contact methods, property addresses, and company ownership.

## Phase 3: Estimates And Scope Of Work

- Build estimate records with line items, totals, statuses, and customer/job links.
- Build a scope of work generator for roofing and painting templates.
- Support draft, sent, approved, and rejected workflows.
- Prepare printable/exportable estimate and scope views.

## Phase 4: Jobs, Scheduling, And Materials

- Convert approved estimates into jobs.
- Track job phases, production status, crew assignments, and inspection dates.
- Add calendar and scheduling views.
- Add material order records tied to jobs and suppliers.

## Phase 5: Photos, Invoices, And Payments

- Add Supabase Storage buckets for job photos.
- Tie photo metadata to leads, customers, and jobs.
- Generate invoices from approved estimates or completed jobs.
- Track invoice status and payment milestones.

## Phase 6: AI Assistant

- Add an assistant panel with scoped actions against CRM records.
- Generate scope drafts, estimate notes, follow-up messages, and job summaries.
- Keep AI actions reviewable before they update customer-facing records.

## Engineering Rules

- Preserve existing working flows before adding new ones.
- Make small, logical commits.
- Prefer typed data models and reusable module boundaries over one-off page code.
- Keep Supabase schema changes in versioned migrations.
- Verify each change with type-check, lint, and build before commit.
