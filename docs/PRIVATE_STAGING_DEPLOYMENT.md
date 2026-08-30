# Private Staging Deployment

This runbook covers WeatherTech OS private staging deployment for WeatherTech Roofing LLC and IHC Painting. It is a controlled internal testing deployment, not final public production launch.

## Current Status

- Preferred deployment provider: Vercel or another owner-approved Next.js hosting provider.
- Repository branch: `main`.
- Build command: `npm run build`.
- Runtime command: provider-managed Next.js runtime, or `npm run start` after a successful build.
- Health endpoint: `/api/health`.
- Readiness endpoint: `/api/readiness`.
- Live provider writes: disabled.
- Public lead intake: disabled unless separately approved for signed test submissions.
- Customer portal access: disabled unless separately approved.
- Production approval: not granted.

The repository can be prepared and validated without deploying. A real HTTPS staging URL requires owner-controlled provider authorization and environment-variable entry outside the repository.

## Environment Model

WeatherTech OS separates environments as:

- Local development: developer machine, local browser validation, demo fallback allowed when Supabase is unavailable.
- Preview deployment: provider-created preview URL for branch or pull request checks.
- Private staging: owner-approved HTTPS URL for controlled employee testing.
- Final production: separately approved daily-use environment.

Private staging must be clearly labeled staging and must never be treated as final production.

## Required Staging Variables

Configure these in the hosting provider, not in source code:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_ENV=staging`
- `WTOS_DEPLOYMENT_ENV=staging`
- `WTOS_DEPLOYMENT_PROVIDER=vercel` or the approved provider name
- `WTOS_STAGING_URL`
- `WTOS_AUTH_REDIRECTS_VERIFIED=false` until Supabase Auth redirects are configured and checked
- `WTOS_SUPABASE_MIGRATIONS_VERIFIED=false` until the linked Supabase migration history is verified
- `WTOS_STAGING_REGRESSION_VERIFIED=false` until staging browser regression passes
- `WTOS_PRODUCTION_APPROVED=false`

Do not commit real values for secrets, tokens, service-role keys, OAuth client secrets, webhook secrets, signing keys, or provider credentials.

## Disabled Safety Flags

These flags must remain `false` or unset for private staging unless a later sprint explicitly approves a controlled live test:

- `TWILIO_OUTBOUND_SMS_ENABLED`
- `TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED`
- `TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED`
- `GOOGLE_GMAIL_SEND_ENABLED`
- `GOOGLE_CALENDAR_WRITE_ENABLED`
- `WEBSITE_INTAKE_ENABLED`
- `WEATHERTECH_WEBSITE_INTAKE_ENABLED`
- `WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED`
- `IHC_WEBSITE_INTAKE_ENABLED`
- `YELP_LIVE_SYNC_ENABLED`
- `YELP_OUTBOUND_MESSAGING_ENABLED`
- `GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED`
- `GOOGLE_BUSINESS_PROFILE_REVIEW_REPLY_ENABLED`
- `QUICKBOOKS_SYNC_ENABLED`
- `QUICKBOOKS_ACCOUNTING_WRITES_ENABLED`
- `QUICKBOOKS_PAYMENT_PROCESSING_ENABLED`
- `DOCUSIGN_SIGNATURE_REQUESTS_ENABLED`
- `DOCUSIGN_PROVIDER_WRITES_ENABLED`
- `DROPBOX_SIGN_SIGNATURE_REQUESTS_ENABLED`
- `DROPBOX_SIGN_PROVIDER_WRITES_ENABLED`
- `WTOS_CUSTOMER_PORTAL_ENABLED`
- `WTOS_AUTOMATED_CUSTOMER_NOTIFICATIONS_ENABLED`
- `WTOS_PUBLIC_REGISTRATION_ENABLED`

If any of these are set to `true`, `/api/readiness` must report staging as blocked.

Do not copy the real Tucson terminal into private staging. Ordinary staging keeps the Tucson terminal attestation and Tucson voice gate false. Tucson-only voice behavior is exercised by the guarded synthetic runner against the pinned regression project; that runner cannot contact Twilio, a carrier, or the terminal. Phoenix and IHC have no application voice configuration because their public calls remain direct with their existing carriers.

## Supabase Configuration

Before staging tests:

1. Verify the linked WeatherTech OS Supabase project reference.
2. Verify remote migration history through the established Supabase CLI path.
3. Confirm required migrations are applied and recorded.
4. Confirm RLS remains enabled for CRM data.
5. Confirm anonymous access cannot read CRM records.
6. Confirm authenticated internal users can access only their permitted company records.
7. Confirm server-only credentials are not exposed to browser code.

Do not run remote migration commands unless the owner explicitly approves the exact project, deployment window, backup expectation, and command.

If `npx supabase migration list --linked` reports `LegacyProjectNotLinkedError`,
verify the ignored local `supabase/.temp/linked-project.json` record and relink
the checkout only to the approved WeatherTech OS project before running any
remote migration inventory:

```bash
npx supabase link --project-ref gahfcgyjtfwwmsterhzu
npx supabase migration list --linked
```

Relinking is a local CLI configuration step; it is not permission to run
`supabase db push`, `supabase migration repair`, or SQL against the remote
database.

## Authentication Redirects

After the staging URL exists, configure Supabase Auth with:

- Site URL: the private staging URL.
- Redirect URL: staging root URL.
- Redirect URL: `/auth/callback` if used by the auth flow.
- Google Workspace OAuth callback: `/api/integrations/google-workspace/oauth/callback`.
- QuickBooks Online OAuth callback: `/api/integrations/quickbooks-online/oauth/callback`.
- DocuSign OAuth callback: `/api/integrations/docusign/oauth/callback`.
- Dropbox Sign OAuth callback: `/api/integrations/dropbox-sign/oauth/callback`.

Set `WTOS_AUTH_REDIRECTS_VERIFIED=true` only after these values are checked in the correct Supabase project and provider consoles where applicable.

## Health Endpoint

`GET /api/health` reports only whether the WeatherTech OS runtime can respond. A healthy response does not mean dependencies are ready, migrations are verified, or production activation is approved.

The response includes safe metadata only:

- Environment name.
- Deployment provider.
- Deployment URL status.
- Git commit hash when provided by hosting.
- Health endpoint path.
- Readiness endpoint path.
- Provider write status.
- Production activation status.

It must not include secret values, customer records, database credentials, tokens, or stack traces.

## Readiness Endpoint

`GET /api/readiness` evaluates private staging readiness and may return `503` while blockers remain.

It checks:

- Required staging environment variables.
- HTTPS staging URL presence.
- Supabase URL/key format.
- Supabase Data API reachability without returning CRM records.
- Authentication redirect evidence.
- Migration verification evidence.
- Staging browser regression evidence.
- Disabled provider, portal, public registration, and customer notification gates.
- Production activation remains not granted.

Readiness is blocked until every required owner-controlled staging gate has evidence.

## Vercel Owner Setup

If Vercel is the approved provider:

1. Open the Vercel dashboard.
2. Select the owner-approved account or organization.
3. Import the WeatherTech OS GitHub repository.
4. Use repository root as the project root.
5. Use `npm run build` as the build command.
6. Leave output settings as Next.js defaults.
7. Configure only private staging environment variables.
8. Keep every provider write flag disabled.
9. Deploy from the approved `main` commit.
10. Copy the provider-generated HTTPS staging URL.

Do not connect a custom domain in this sprint.

## Monitoring

Minimum staging monitoring should include:

- Deployment build logs.
- Runtime API route errors.
- Failed health checks.
- Failed readiness checks.
- Supabase request failures.
- Provider webhook failures when webhooks are later activated.

Do not log credentials, tokens, customer message bodies, or unnecessary personal data.

## Rollback

If staging fails:

1. Revert to the last known-good Git commit or redeploy the previous hosting deployment.
2. Keep all provider write flags disabled.
3. Pause any OAuth/provider connection records if a later activation step created them.
4. Do not delete production CRM records.
5. Do not apply ad hoc database changes.
6. Identify disposable staging test records by test label before cleanup.
7. Clean only disposable test records after confirming they are not legitimate customer data.

Rollback owner: owner action required.

## Controlled Staging Validation

After deployment:

1. Confirm the staging URL loads over HTTPS.
2. Confirm `/api/health` returns `200`.
3. Confirm `/api/readiness` reports truthful blockers or ready status.
4. Confirm sign-in works for approved internal users.
5. Confirm session persistence and logout.
6. Confirm Dashboard, Customer 360, Leads, Estimates, Jobs, Inspections, Dispatch, Documents, Communications, Integration Center, Production Readiness Center, Website & Marketing, and Financial workspace load.
7. Confirm customer portal public access remains disabled unless separately approved.
8. Confirm provider-disabled states remain visible.
9. Confirm no real SMS, calls, emails, calendar writes, accounting writes, review replies, website leads, or signature requests are sent.
10. Confirm no browser console-breaking errors appear.
11. Confirm mobile-width smoke tests have no horizontal overflow.

## Resume Prompt After Owner Setup

After the owner configures the staging provider and environment variables, resume Codex with:

```text
Continue WeatherTech OS Private Staging Deployment validation.
The staging URL is [paste URL].
The provider project is [paste provider/project name].
Do not activate live providers.
Do not run migrations unless separately approved.
Verify /api/health, /api/readiness, authentication, signed-in browser regression, provider-disabled states, and final Git sync.
```
