# WeatherTech OS Architecture

This document records the current WeatherTech OS architecture and the standards future work should follow. It describes the repository as it exists today and labels future guidance separately.

## Application Philosophy

WeatherTech OS is a single operating workspace for WeatherTech Roofing LLC and IHC Painting. The product should centralize daily office operations, customer work, estimating, inspections, production, communications, documents, and integration readiness without duplicating modules for each company.

Current implementation priorities:

- Use Supabase as the CRM data source of truth.
- Keep WeatherTech Roofing LLC and IHC Painting in one shared platform with company-aware filtering and branding.
- Prefer typed CRM helpers in `lib/crm` over duplicating business rules in UI handlers.
- Keep provider integrations honest: show readiness, configuration state, and dry-run capability without pretending live provider connectivity exists.
- Keep local demo fallback available for development while preserving strict live behavior when fallback is disabled.

## Current Application Shape

WeatherTech OS is a Next.js App Router application.

- `app/layout.tsx` defines the root metadata, viewport theme color, and global CSS import.
- `app/page.tsx` dynamically loads `components/CrmApp.tsx` and shows a skeleton while the client workspace loads.
- `components/CrmApp.tsx` currently contains the primary application shell, authentication flow, workspace navigation, views, and many module-level UI panels.
- `lib/crm` contains typed CRM models, repository functions, company scoping, metrics, communications, integrations, operations helpers, templates, routing, and provider-readiness logic.
- `lib/crm/aiTools.ts` contains the AI Tools operating-brain helpers for company-scoped, role-aware, read-only intelligence and draft recommendations.
- `lib/crm/aiProvider.ts` contains the server-side AI Tools 2.1 live-provider pilot abstraction, readiness checks, authorized context retrieval, cost controls, prompt-safety screening, structured-output parsing, and approval-gated action previews.
- `lib/supabase` contains Supabase browser/server client setup.
- `app/api` contains server routes for lead intake and integration readiness/test endpoints.
- `supabase/migrations` contains the database migration history.
- `tests` contains lead-intake and Codex browser regression tests.

## Module Organization

The current workspace is view-based rather than route-per-module. `WorkspaceView` in `components/CrmApp.tsx` defines the major screens:

- `dashboard`
- `operations`
- `inbox`
- `leads`
- `customers`
- `estimates`
- `scopes`
- `jobs`
- `inspections`
- `calendar`
- `photos`
- `invoices`
- `orders`
- `ai`
- `weather`
- `marketing`
- `customerPortal`
- `employeePortal`
- `routes`
- `changeOrders`
- `documents`
- `analytics`
- `notifications`
- `integrations`
- `settings`

Future guidance:

- New modules should be added as explicit workspace views only when they represent a distinct daily workflow.
- Small capabilities should extend the existing module that owns the workflow.
- New helper logic should live under `lib/crm` or a provider-specific `lib/<provider>` folder when it is reusable or business-critical.

## Shared Layout

The active application shell lives in `CrmApp`.

Current layout elements:

- Dark grouped sidebar navigation.
- Workspace header with company context, theme toggle, refresh, and sign-out.
- Company scope switcher for non-dashboard views.
- Toast viewport for success/error feedback.
- Main workspace area that renders one active view at a time.

Future guidance:

- Preserve the shell and navigation hierarchy unless a sprint explicitly approves navigation changes.
- Reuse the shared feedback/toast behavior instead of creating a second notification system.
- Keep mobile layouts scrollable vertically without horizontal overflow.

## Navigation Hierarchy

The grouped navigation in `components/CrmApp.tsx` is organized as:

- Overview: Dashboard, Operations.
- CRM: Inbox, Leads, Customers, Estimates, Scopes.
- Operations: Jobs, Inspections, Calendar, Photos, Materials, Routes.
- Financial: Invoices, Change Orders, Analytics.
- Portals: Customer Portal, Employee Portal.
- Intelligence: AI Tools, Weather, Website & Marketing, Notifications.
- Administration: Documents, Integrations, Settings.

Future guidance:

- Place new navigation items in the smallest accurate group.
- Avoid creating new top-level groups unless the existing structure cannot describe the workflow.
- Prefer direct navigation into existing modules for quick actions.

## Multi-Company Support

WeatherTech OS supports both WeatherTech Roofing LLC and IHC Painting through company-scoped CRM records.

Current implementation:

- `CrmSnapshot` includes `companies`, `companyMemberships`, and `companyWorkflowSettings`.
- `scopeCrmSnapshotByCompany` filters snapshot records by selected company.
- AI Tools uses the scoped snapshot before deriving command answers, provider context, priority items, drafts, and context counts.
- WeatherTech Roofing LLC uses purple as the primary brand accent with orange support.
- IHC Painting uses orange-focused accents through the `wt-company-painting` class.
- Scope templates are filtered by company and trade to avoid mixing roofing and painting defaults.

Future guidance:

- Every new record type should include company ownership or a clear company relationship.
- Do not let WeatherTech Roofing defaults leak into IHC Painting workflows, or painting defaults leak into roofing workflows.
- Shared customers may exist, but workflow actions must respect company context.

## Routing Philosophy

Current user-facing modules are rendered inside the root page as workspace state, not separate URL routes. Current server routes are reserved for API behavior such as:

- Website lead intake.
- Yelp lead intake.
- Lead intake retry.
- AI Tools command execution for authenticated, approval-gated internal pilot requests.
- Twilio status, test, webhook, voice, and recording.
- GoHighLevel readiness, test, and dry-run lead contact.

Future guidance:

- Keep business workflows in the existing workspace unless a route is needed for an external callback, webhook, portal boundary, or public endpoint.
- API routes must sanitize logs and avoid exposing secret values.

## Shared Components

Current reusable components include:

- `components/SummaryCard.tsx`
- `components/Sidebar.tsx`
- `components/LeadsPanel.tsx`
- `components/NewLeadPanel.tsx`
- `components/EstimatesPanel.tsx`
- `components/ScopesPanel.tsx`
- `components/FollowUpsPanel.tsx`
- `lib/crm/proposals.ts`

The primary application also contains many local reusable UI helpers inside `components/CrmApp.tsx`.

Future guidance:

- Extract repeated UI from `CrmApp` only when it reduces complexity and does not destabilize workflows.
- Keep extracted components typed and domain-specific.
- Do not create duplicate panels for workflows that already exist.

## State Management

Current implementation:

- React state and memoized derived data drive the client workspace.
- `fetchCrmSnapshot` loads a broad CRM snapshot from Supabase.
- `scopeCrmSnapshotByCompany` derives the selected company view.
- `calculateDashboardMetrics`, communications builders, integration readiness builders, and operations helpers derive UI-ready summaries.
- Local demo state is created by `createDemoCrmSnapshot` when live Supabase is unavailable and demo fallback is enabled.
- Browser local storage stores the theme and selected company scope.

Future guidance:

- Prefer derived memoized data over duplicate persisted state.
- Avoid duplicate Supabase queries when existing snapshot data is sufficient.
- Keep demo-mode writes explicitly separate from Supabase writes.

## Database Philosophy

Current implementation:

- Supabase tables are defined through migration files in `supabase/migrations`.
- TypeScript table and record types are maintained in `lib/crm/types.ts`.
- `lib/crm/repository.ts` owns most CRM read/write functions.
- `fetchCrmSnapshot` reads core records first, then loads extended tables when core CRM records exist.
- Storage for job photos uses the `job-photos` bucket through Supabase storage helpers.

Future guidance:

- New schema changes require explicit owner approval.
- Migrations must be additive and non-destructive unless a destructive change is explicitly approved.
- TypeScript types must match the migration result.
- Row-level security and company isolation must be reviewed before live use.

## Authentication Philosophy

Current implementation:

- Supabase Auth is the live authentication provider.
- Browser and server Supabase clients use public URL and anon key configuration.
- Server-only service-role usage is limited to server routes that require privileged operations.
- Demo fallback can load local demo data for development when live auth or CRM data is unavailable, unless disabled.

Future guidance:

- Never expose service-role keys or provider secrets to browser code.
- Do not silently mask live authenticated data failures with demo data.
- Customer or employee portal boundaries must stay isolated from internal staff workflows.

## UI Consistency Rules

- Use the existing grouped sidebar and workspace header.
- Use existing button, card, badge, and status patterns before introducing new visual treatments.
- Keep WeatherTech Roofing LLC purple and orange recognizable.
- Keep IHC Painting orange-focused without turning every surface orange.
- Use truthful empty states when records do not exist.
- Use success/error notifications through the existing toast pattern.

## Dark Mode Standards

Current implementation:

- Theme is controlled with `document.documentElement.dataset.theme`.
- Core tokens live in `app/globals.css` using `--wt-*` CSS variables.
- `wt-company-painting` changes the company primary accent for IHC Painting.

Future guidance:

- Preserve separate surface levels in dark mode.
- Do not use pale light-mode fills in dark mode.
- Keep section headings, values, labels, badges, and focus rings readable.
- Verify dashboard and operational screens in both light and dark mode when presentation changes.

## Naming Conventions

- Use `WeatherTech OS` for the platform.
- Use `WeatherTech Roofing LLC` for the roofing company.
- Use `IHC Painting` for the painting company.
- Use domain terms already present in the app: Leads, Customers, Estimates, Scopes, Jobs, Inspections, Dispatch, Production, Documents, Communications, Materials, Routes, Integrations.
- Use `Record` types for persisted rows and `Input` types for mutation payloads when following existing `lib/crm/types.ts` patterns.

## Feature Placement Guidelines

- Customer-specific work belongs in Customer 360 or a related existing customer panel.
- Lead intake routing and deduplication belongs in `lib/crm/leadIntake.ts`, `lib/crm/leadRouting.ts`, and the related API routes.
- Provider readiness belongs in `lib/crm/integrationCenter.ts` or provider-specific `lib/<provider>` modules.
- Job production, scheduling, and field work belong in Jobs, Dispatch, Production, Calendar, or Inspections.
- Documents that relate to customers, estimates, proposals, jobs, and inspections belong in Documents and the related module panels.
- Proposal logic belongs in `lib/crm/proposals.ts` and should preserve the internal/customer-facing boundary before any content reaches Documents, Customer Portal, signatures, payments, or QuickBooks export readiness.

## Dependency Boundaries

- UI may import typed helpers from `lib/crm`.
- Server routes may use service-role clients only when required and must keep secrets server-side.
- `lib/crm` should not depend on React components.
- Provider-specific server clients belong under provider folders such as `lib/twilio` and `lib/gohighlevel`.
- Shared domain types belong in `lib/crm/types.ts`.
- Tests should use existing public scripts and documented cleanup behavior.
