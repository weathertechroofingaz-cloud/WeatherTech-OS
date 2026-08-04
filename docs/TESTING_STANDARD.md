# WeatherTech OS Testing Standard

This document defines the required validation process for WeatherTech OS changes. It complements the sprint Definition of Done in [SPRINT_WORKFLOW.md](../project-management/SPRINT_WORKFLOW.md).

## Standard Validation Commands

Run these commands for every application sprint and for documentation sprints when requested:

```bash
npm run type-check
npm run lint
npm run build
git diff --check
```

## Unit And Integration Tests

Current repository tests include:

- `tests/lead-intake-routing.test.mjs` for lead intake routing, source matching, signature helpers, and duplicate policy behavior.
- `tests/unified-lead-intake-service.test.mjs` for canonical intake deduplication, existing customer/lead matching, provider logging, and follow-up behavior.
- `tests/website-integration-foundation.test.mjs` for Website source routing, form support, signatures, production gates, attribution, consent preservation, and safe lead intake normalization.
- `tests/yelp-integration-foundation.test.mjs` for Yelp account routing, official capability flags, disabled live boundaries, signature helpers, safe logging, and three-account readiness.
- `tests/google-business-profile-foundation.test.mjs` for Google Business Profile location routing, official capability flags, OAuth/PubSub readiness, disabled live boundaries, safe logging, and three-location readiness.
- `tests/quickbooks-online-foundation.test.mjs` for QuickBooks Online official capability flags, OAuth/company readiness, duplicate-safe customer/estimate/invoice/payment mappings, production write gates, and Integration Center provider registration.
- `tests/electronic-signatures-foundation.test.mjs` for DocuSign and Dropbox Sign official capability flags, OAuth/account readiness, duplicate-safe signature request drafts, disabled live request gates, Customer 360 event labels, provider retry planning, Communications readiness, and Integration Center provider registration.
- Additional validation may be embedded in browser regression flows.

When a sprint changes routing, provider readiness, lead intake, deduplication, or pure helper logic, add or update targeted automated tests where practical.

## Browser Regression Testing

The signed-in Codex browser regression entrypoint is:

```bash
npm run test:browser:codex
```

Current browser regression coverage includes high-value workflows across dashboard, office operations, settings integrations, Website & Marketing, calendar, leads, estimates, customers, inbox, lead intake, themes, inspections, dispatch, jobs, and job production flows.

Rules:

- Do not count a command that only prints runner instructions as a browser pass.
- Use safe `TEST WTOS REGRESSION` records where browser validation requires writes.
- Clean up disposable test records after test runs.
- Report infrastructure failures separately from product failures.

## Targeted Workflow Validation

Use targeted validation when a sprint changes a specific workflow:

- Leads: create/update, source badges, pipeline state, duplicate behavior.
- Customers: create/update, Customer 360, search, timeline, related panels.
- Estimates: draft, edit, approve, signature request, job handoff.
- Jobs: create/update, schedule, checklist, notes, materials, production, dispatch.
- Inspections: create/edit, findings, measurements, estimate-only, optional report.
- Communications: inbox filters, provider badges, detail panels, safe logging.
- Integrations: readiness cards, connection architecture, no fake connectivity.
- Website & Marketing: source routing, provider honesty, existing-workspace navigation.
- Yelp: three-account routing, partner-required state, dry-run/manual intake, disabled live sync, duplicate handling, and no outbound messaging.
- Google Business Profile: three-location routing, OAuth-required state, dry-run/manual intake, disabled live sync, duplicate handling, review/reply honesty, and no live messaging.
- QuickBooks Online: OAuth-required state, company realmId readiness, duplicate-safe mapping drafts, disabled live accounting sync, disabled accounting writes, disabled payment processing, and provider audit-log support.
- Electronic Signatures: DocuSign and Dropbox Sign OAuth-required state, company account readiness, duplicate-safe signature request drafts, disabled live request/send gates, provider status labels, Customer 360 signature events, and provider audit-log support.

## Manual QA Checklist

Manual QA is required when browser automation cannot prove a visual or account-bound behavior.

Check:

- App loads without staying on the preparing screen.
- Supabase live mode or demo fallback behavior matches the test scenario.
- Navigation works on desktop and mobile.
- No horizontal overflow appears in changed screens.
- Light and dark mode remain readable.
- Success/error notifications are dismissible and do not block navigation.
- No browser console-breaking errors appear.
- No real customer records were modified unless explicitly approved.

## Security Checks

Before committing:

- Confirm `.env.local` is untouched.
- Confirm no secrets, tokens, API keys, credentials, or private payloads were added.
- Confirm no package or lockfile changes unless explicitly approved.
- Confirm no migrations, schema changes, RLS changes, or destructive database changes unless explicitly approved.
- Confirm no live provider activation or customer messaging was introduced without owner approval.

## Final Scope Audit

Before committing:

```bash
git status --short
git diff --stat
git diff --check
git diff
```

Confirm the diff contains only the approved sprint scope and no unrelated product, UI, test, provider, schema, or package changes.

## Commit Verification

After committing:

```bash
git status --short
git log --oneline -3
git show --stat --oneline HEAD
```

Confirm the commit contains only approved files and uses a focused conventional commit message.

## Push Verification

After pushing:

```bash
git status --short
git status -sb
git rev-parse HEAD
git rev-parse origin/main
```

Local `HEAD` must equal the intended remote branch, and the working tree must be clean.

## Definition Of Done

A sprint is done only when the applicable items in [SPRINT_WORKFLOW.md](../project-management/SPRINT_WORKFLOW.md#definition-of-done) are satisfied.
