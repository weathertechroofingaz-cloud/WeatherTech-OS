# WeatherTech OS Roadmap

WeatherTech OS is a production-focused roofing and painting operations platform for WeatherTech Roofing LLC and IHC Painting. The application now runs on a live Supabase-backed CRM foundation with authenticated Next.js, TypeScript, Tailwind CSS, and typed Supabase repositories.

## Current Baseline

- Live Supabase data powers dashboard metrics, leads, customers, estimates, scopes, jobs, scheduling, photos, invoices, material orders, portals, documents, notifications, and integrations.
- Authentication, dark mode, responsive layout, loading states, empty states, toasts, search, filtering, pagination, and commercial SaaS styling are in place.
- Google Calendar, Gmail, Google Maps routing, and Twilio SMS have local integration foundations with database records, UI controls, status tracking, and payload previews.
- Supabase migrations are versioned in `supabase/migrations`.
- Validation target remains `npm run type-check`, `npm run lint`, and `npm run build`.

## Completed Foundations

- CRM shell, navigation, dashboard analytics, and live Supabase snapshot loading.
- Lead intake, lead list/detail workflow, customer management, and conversion from lead to customer.
- Estimates with line items, labor, materials, tax, discounts, margin, totals, and PDF-style preview.
- Estimate-to-job production handoff for approved estimates.
- Scope of work generator using WeatherTech templates for roofing, exterior painting, interior painting, cabinet refinishing, roof repairs, tile underlayment, and custom scopes.
- Jobs, scheduling calendar, material orders, invoices, payments, photo records, customer portal, employee portal, change orders, signatures, document management, notifications, weather dashboard, and route planner.
- Document generation for estimate packets, invoice packets, scope packets, change orders, job production packets, and customer profile packets.
- Dashboard action center for overdue invoices, scheduling gaps, missing documents, blocked jobs, pending change orders, and queued communications.
- Native photo gallery with Supabase Storage uploads, upload previews, search, filtering, pagination, and photo URL actions.
- Integration foundations for Google Calendar, Gmail, Google Maps routing, and Twilio SMS.

## Phase 5 Integrations

1. Twilio SMS
   - Completed foundation: connection records, SMS outbox, customer/job/lead/invoice links, Twilio payload preview, and status tracking.
   - Next: server-side send worker, inbound webhook handling, delivery receipts, opt-out enforcement, and reminder automation.

2. Stripe Payments
   - Add Stripe customer mapping, checkout/payment-link records, webhook processing, portal payment handoff, and invoice balance reconciliation.

3. QuickBooks Online
   - Add OAuth connection records, customer sync, invoice sync, payment sync, product/service mapping, and sync conflict handling.

4. Document Signing
   - Keep native signatures as the default path.
   - Add DocuSign provider support only after native signature workflow is stable.

5. Photo Management
   - Completed foundation: native Supabase Storage upload workflow, bucket policies, upload preview, searchable job/customer/estimate galleries, pagination, and URL actions.
   - Next: signed upload URLs, thumbnail derivatives, bulk upload, and field-photo checklists.
   - Add CompanyCam sync later if field teams require it.

6. Weather Alerts
   - Tie forecast and severe-weather checks to job locations.
   - Generate schedule alerts, customer SMS/email drafts, and production risk indicators.

## Engineering Rules

- Preserve existing working flows before adding new ones.
- Add schema changes through versioned Supabase migrations.
- Keep integrations safe by storing connection metadata in the app while credentials live in a server-side vault or environment configuration.
- Verify major changes with type-check, lint, and build.
- Commit in small logical steps when Git metadata is available.
