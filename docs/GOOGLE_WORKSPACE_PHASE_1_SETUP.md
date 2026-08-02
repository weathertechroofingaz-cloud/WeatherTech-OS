# Google Workspace Phase 1 Setup

WeatherTech OS supports a server-side Gmail / Google Workspace email foundation for WeatherTech Roofing LLC and IHC Painting. This phase prepares OAuth, mailbox sync, CRM matching, attachment metadata, integration logging, and safe outbound boundaries. It does not enable live customer email sending by default.

Do not commit Google client secrets, OAuth codes, access tokens, refresh tokens, mailbox exports, or private customer email content. Production values belong only in the hosting provider's server-side environment configuration and protected Supabase tables.

## Server Environment Variables

Required before connecting a mailbox:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional or deployment-specific:

- `GOOGLE_PUBLIC_BASE_URL`
- `GOOGLE_WORKSPACE_DOMAIN`
- `GOOGLE_GMAIL_SEND_ENABLED`

`GOOGLE_GMAIL_SEND_ENABLED` must remain `false` or unset until the owner separately approves controlled live email sending. Automated tests must not send real email.

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
2. Enable the Gmail API.
3. Configure the OAuth consent screen for the WeatherTech OS application.
4. Add authorized redirect URIs for each deployed WeatherTech OS environment.
5. Create or rotate OAuth web application credentials.
6. Store the client id and client secret in the hosting provider's server-side environment variables.
7. Set `GOOGLE_TOKEN_ENCRYPTION_KEY` to a long random server-side secret.
8. Keep `GOOGLE_GMAIL_SEND_ENABLED=false` until live sending is separately approved.

## OAuth Scopes

Phase 1 uses these Google scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.compose`

The read scope supports inbound mailbox sync. The send and compose scopes prepare the approved future outbound path, but WeatherTech OS still blocks live sending unless `GOOGLE_GMAIL_SEND_ENABLED` is explicitly enabled.

## WeatherTech OS Endpoints

- `POST /api/integrations/google-workspace/oauth/start`
- `GET /api/integrations/google-workspace/oauth/callback`
- `GET /api/integrations/google-workspace/readiness`
- `POST /api/integrations/google-workspace/sync`
- `POST /api/integrations/google-workspace/send`

The readiness endpoint reports configuration and schema readiness without exposing secret values.

## Mailbox Model

WeatherTech OS supports company-aware mailbox records for:

- WeatherTech Roofing LLC
- IHC Painting
- Future authorized user mailboxes

Mailbox credentials are stored server-side in `gmail_mailbox_credentials`. Authenticated browser users do not receive direct access to OAuth state records, access tokens, or refresh tokens.

## CRM Matching

Imported Gmail messages are matched by normalized email address against existing CRM data:

- Customers
- Leads
- Jobs and estimates related to matched customers

Unmatched inbound messages are preserved as communication records requiring review. They do not automatically create customers, leads, or duplicate CRM records.

## Safe Validation

Use test mailboxes only during setup. Do not connect a production mailbox until the owner approves the controlled live validation window.

Recommended validation:

1. Confirm the Gmail Workspace foundation migration has been applied.
2. Run the Integration Center readiness check.
3. Connect one approved test mailbox through OAuth.
4. Run manual sync.
5. Verify imported messages appear in Communications and Customer 360 when matched.
6. Verify unmatched messages remain reviewable without creating duplicate customers.
7. Verify integration logs do not store OAuth tokens or full private message bodies.
8. Confirm live sending remains disabled unless separately approved.

## Rollback Notes

If mailbox setup is paused, disconnect or revoke the Google OAuth client in Google Cloud and pause the WeatherTech OS integration connection. Do not manually delete production email records without owner approval.
