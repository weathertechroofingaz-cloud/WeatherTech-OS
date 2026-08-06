# Google Calendar Phase 1 Setup

WeatherTech OS supports approval-gated Google Calendar event creation, update, and cancellation for WeatherTech Roofing LLC and IHC Painting. OAuth, calendar discovery, company-aware calendar selection, conflict detection, token refresh, bounded provider retries, and sanitized sync logs remain server-side.

WeatherTech OS remains the source of truth for inspections, appointments, jobs, dispatch, production schedules, and crew assignments. Google Calendar is a synchronized field-visibility provider, not a replacement scheduling system.

Do not commit Google client secrets, OAuth codes, access tokens, refresh tokens, production calendar IDs, private event descriptions, or customer-sensitive calendar exports. Production values belong only in server-side hosting environment variables and protected Supabase tables.

## Server Environment Variables

Required before connecting Google Calendar:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional or deployment-specific:

- `GOOGLE_PUBLIC_BASE_URL`
- `GOOGLE_WORKSPACE_DOMAIN`
- `GOOGLE_CALENDAR_WRITE_ENABLED`

`GOOGLE_CALENDAR_WRITE_ENABLED` is the deployment-level live-write gate. Keep it `false` or unset until the owner approves activation. When it is `true`, every individual create, update, and cancellation still requires an authenticated company owner to review and confirm that exact change. Automated regression tests use mocked provider calls and must not create, update, cancel, or delete real Google Calendar events.

## Redirect URI

Use the production WeatherTech OS base URL with:

```text
/api/integrations/google-workspace/oauth/callback
```

For local development, the safe placeholder is:

```text
http://localhost:3000/api/integrations/google-workspace/oauth/callback
```

## Google Cloud Setup

Owner access is required for these steps:

1. Open the correct Google Cloud project for WeatherTech OS.
2. Enable the Google Calendar API.
3. Confirm the OAuth consent screen covers WeatherTech OS.
4. Add authorized redirect URIs for each WeatherTech OS environment.
5. Store OAuth client credentials in server-side hosting environment variables.
6. Set `GOOGLE_TOKEN_ENCRYPTION_KEY` to a long random server-side secret.
7. Keep `GOOGLE_CALENDAR_WRITE_ENABLED=false` until live writes are approved.
8. Authorize a test Google account through Integration Center.
9. Discover calendars and select the correct company calendar mappings.

## OAuth Scopes

Phase 1 uses existing Google Workspace identity scopes plus Calendar scopes for:

- reading the user's calendar list
- reading calendar events
- creating calendar events
- updating calendar events
- cancelling mapped calendar events after the WeatherTech OS source event is cancelled and the owner separately approves the provider cancellation

The Integration Center surfaces whether the connected account has the required Calendar scopes. If an existing Gmail connection lacks Calendar scopes, reconnect through the Google Calendar action rather than silently invalidating Gmail.

## WeatherTech OS Endpoints

- `POST /api/integrations/google-workspace/oauth/start`
- `GET /api/integrations/google-workspace/oauth/callback`
- `GET /api/integrations/google-workspace/readiness`
- `POST /api/integrations/google-workspace/calendar/discover`
- `POST /api/integrations/google-workspace/calendar/sync`
- `POST /api/integrations/google-workspace/calendar/webhook`

All Google credentials and token refreshes happen server-side. Browser responses never include Google access tokens, refresh tokens, client secrets, or full provider event payloads.

## Scheduling Rules

- WeatherTech OS remains the operational source of truth.
- Google Calendar event IDs are deterministic per integration connection, calendar, and schedule event to prevent duplicate provider events.
- Live writes are skipped unless `GOOGLE_CALENDAR_WRITE_ENABLED=true`.
- Each event version must first be queued and then explicitly confirmed by an authenticated owner of the matching company.
- A schedule event changed after queue submission must be queued again before approval.
- Writes require an active, selected, read-write calendar mapping for the same company.
- Transient Google API failures use bounded retries. A deterministic-ID conflict is reconciled only when the existing provider event belongs to the same company and WeatherTech OS schedule event.
- Cancellation is allowed only after the source schedule event is marked cancelled and receives a separate owner confirmation.
- Calendar payloads use customer-safe summaries, references, location, and timing.
- Internal notes and private customer details stay inside WeatherTech OS.
- Unmatched inbound provider events are preserved for review instead of automatically creating low-quality CRM records.
- Conflict detection flags overlapping scheduled work, employee double-booking, and duplicate provider mappings.

## Multiple Calendar Model

The foundation supports multiple connected calendars for:

- WeatherTech Roofing LLC inspections
- WeatherTech Roofing LLC production
- WeatherTech Roofing LLC branch calendars
- IHC Painting estimates or inspections
- IHC Painting production
- authorized individual users
- future sales, inspector, project manager, crew, dispatch, or materials calendars

Each connected calendar stores company ownership, Google calendar ID, display name, access role, purpose, read-only or read-write mode, selected-for-sync state, last sync metadata, webhook metadata, and last error.

## Migration

This sprint adds:

```text
supabase/migrations/0028_google_calendar_scheduling_foundation.sql
```

The migration is additive, transactional, and non-destructive. It prepares Google Calendar credentials, connected calendars, unmatched inbound events, additional calendar-event sync metadata, and provider-aware OAuth state.

Do not apply the migration to a production Supabase project until the owner has positively verified the project reference and deployment command.

## Safe Validation

Recommended validation:

1. Confirm migration `0028_google_calendar_scheduling_foundation.sql` is applied to the intended Supabase project.
2. Run the Integration Center readiness check.
3. Connect one approved test Google account through OAuth.
4. Run calendar discovery and verify calendars are company-scoped correctly.
5. Queue one clearly labeled test schedule event.
6. With `GOOGLE_CALENDAR_WRITE_ENABLED=false`, approve the queued test and verify no Google Calendar event is created or changed.
7. During an approved live-write window, set `GOOGLE_CALENDAR_WRITE_ENABLED=true`, restart the server, and confirm the UI shows live writes enabled plus the owner-approval policy.
8. Approve creation of one uniquely labeled disposable event and verify its time, timezone, company mapping, and deterministic provider ID.
9. Change the source schedule event, queue the new version, approve the update, and verify the existing Google event changed without creating a duplicate.
10. Mark the source schedule event cancelled, approve the separate cancellation, and verify the mapped Google event is removed or cancelled.
11. Verify integration logs do not contain OAuth tokens, client secrets, full private provider payloads, or customer-sensitive notes.
12. Verify unmatched inbound Google events remain reviewable and do not create duplicate customers, jobs, or inspections.

## Rollback Notes

If Calendar setup is paused, revoke the Google OAuth grant in Google Cloud and pause the WeatherTech OS integration connection. Do not manually delete production schedule, calendar mapping, or sync-log records without owner approval.
