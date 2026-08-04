# Google Business Profile Phase 1 Setup

This document records the verified Google Business Profile capability boundary and the WeatherTech OS application-side foundation for future Google Business Profile activity.

## Status

- Sprint: Google Business Profile Phase 1 - Multi-Location Integration Foundation
- Application functionality: implemented for provider registry routing, controlled dry-run payloads, duplicate checks, Customer 360 intake activity, follow-up creation, and sanitized integration logging.
- Live Google Business Profile sync: disabled by default.
- Review replies: disabled by default.
- Production activation: requires Google Business Profile API project approval, server-side OAuth, mapped account/location IDs, Pub/Sub notification setup, and signed-off owner activation.

## Verified Official Google Capabilities

Official Google documentation supports these foundation capabilities:

- Business Profile APIs can manage and read multiple locations for approved projects.
- Account Management APIs can list accounts accessible to the authenticated user.
- Business Information APIs can list accessible account locations using `business.manage` OAuth scope.
- Reviews APIs can list reviews for verified locations using OAuth.
- Performance APIs expose profile interaction metrics such as impressions, clicks, calls, directions, and keyword impressions.
- Notifications APIs use Google Cloud Pub/Sub for new reviews and location updates after OAuth setup and topic authorization.
- Business Profile APIs require project approval and OAuth for private profile data.
- There is no sandbox environment for Business Profile APIs; some calls support `validateOnly`.

Primary references:

- [Business Profile APIs overview](https://developers.google.com/my-business)
- [Business Profile API basic setup](https://developers.google.com/my-business/content/basic-setup)
- [Account Management accounts.list](https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list)
- [Business Information accounts.locations.list](https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list)
- [Reviews API accounts.locations.reviews.list](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list)
- [Performance API reference](https://developers.google.com/my-business/reference/performance/rpc/google.mybusiness.performance.v1)
- [Notifications setup](https://developers.google.com/my-business/content/notification-setup)
- [NotificationSetting reference](https://developers.google.com/my-business/reference/notifications/rest/v1/NotificationSetting)

## Unsupported Or Discontinued Capabilities

WeatherTech OS must not present these as live Google Business Profile lead channels:

- Google Business Profile chat and call history are no longer available.
- Customers can no longer request quotes through Google Business Profile chat.
- Business Profile Q&A API support has been discontinued.
- Browser-login automation, scraping, or Google password storage is not permitted.
- Review replies are not enabled in this phase.

References:

- [Changes to Google Business Profile chat and call history](https://support.google.com/business/answer/14919056)
- [Q&A API change log](https://developers.google.com/my-business/content/qanda/change-log)

## Location Mapping

WeatherTech OS supports three Google Business Profile location slots through the provider registry:

| Registry key | Company | Branch | Purpose |
| --- | --- | --- | --- |
| `weathertech-phoenix` | WeatherTech Roofing LLC | Phoenix | Phoenix roofing reviews, local profile activity, performance, and controlled lead tests |
| `weathertech-tucson` | WeatherTech Roofing LLC | Tucson | Tucson roofing reviews, local profile activity, performance, and controlled lead tests |
| `ihc` | IHC Painting | IHC | IHC painting reviews, local profile activity, performance, and controlled lead tests |

Routing must use trusted Google account or location identifiers. Customer-entered text alone must not silently assign a lead to a company.

## Server-Side Environment Placeholders

Placeholders are documented in `.env.example`. They must be configured only in server-side hosting settings or a secure secrets manager.

- `GOOGLE_BUSINESS_PROFILE_CLIENT_ID`
- `GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET`
- `GOOGLE_BUSINESS_PROFILE_REDIRECT_URI`
- `GOOGLE_BUSINESS_PROFILE_PUBSUB_TOPIC`
- `GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED=false`
- `GOOGLE_BUSINESS_PROFILE_REVIEW_REPLY_ENABLED=false`
- `GOOGLE_BUSINESS_PROFILE_PRODUCTION_LOCATION_KEYS`
- `GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID_WEATHERTECH`
- `GOOGLE_BUSINESS_PROFILE_LOCATION_ID_WEATHERTECH_PHOENIX`
- `GOOGLE_BUSINESS_PROFILE_LOCATION_ID_WEATHERTECH_TUCSON`
- `GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID_IHC`
- `GOOGLE_BUSINESS_PROFILE_LOCATION_ID_IHC`

Do not add Google account passwords. Do not expose these values with `NEXT_PUBLIC_`.

## Implemented Application Foundation

The foundation intentionally uses the existing Unified Lead Intake Hub:

- Google Business Profile location registry and account-to-company routing.
- Controlled payload normalization into the canonical lead intake format.
- Phone and email normalization through existing duplicate-detection logic.
- Existing customer matching without creating duplicate leads.
- Provider event ID and request-fingerprint duplicate detection.
- New unmatched intake path that creates one lead and one follow-up only when production intake is explicitly enabled later.
- Safe route-level audit logging for rejected or skipped submissions.
- Sanitized integration log summaries that avoid raw credentials, raw tokens, raw emails, raw phone numbers, and unnecessary full-message storage.
- Integration Center provider readiness copy that does not claim live connectivity.
- Website & Marketing/Lead Intake surfaces that describe Google Business Profile as OAuth-required and production-disabled.

## Disabled Live Boundary

The `/api/leads/google-business-profile` route supports dry-run previews, but non-dry-run production posts are rejected with `production_disabled` unless all live gates are enabled in a future owner-approved activation:

- Google Business Profile API project approval.
- Server-side OAuth client and consent with `https://www.googleapis.com/auth/business.manage`.
- account and location IDs mapped to WeatherTech Phoenix, WeatherTech Tucson, or IHC.
- Pub/Sub notification topic configured and authorized.
- location key included in `GOOGLE_BUSINESS_PROFILE_PRODUCTION_LOCATION_KEYS`.
- `GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED=true`.

This keeps the app-side architecture testable without pretending that live Google Business Profile access exists.

## Customer 360 Activity Model

Future Google Business Profile events should appear in Customer 360 as:

- Google lead received.
- Google review received.
- Google review response required.
- Google customer matched.
- Google duplicate ignored.
- Google sync failed.
- Google configuration required.

Uncertain or unmapped activity must stay in review and must not create duplicate customers.

## Production Activation Checklist

Before live Google Business Profile activity can be enabled:

- Confirm the correct Google Cloud project for WeatherTech OS.
- Request and receive Business Profile API access approval.
- Enable the required Business Profile APIs in Google Cloud.
- Create the server-side OAuth client and redirect URI.
- Configure server-side environment variables in hosting.
- Authorize an approved owner/admin Google account with Business Profile access.
- List accounts and locations and record only the approved account/location IDs.
- Configure Google Cloud Pub/Sub and grant the Business Profile service account publisher access.
- Run dry-run previews for Phoenix, Tucson, and IHC.
- Confirm dedupe, Customer 360 activity, follow-up creation, and integration logs.
- Enable live flags only after owner approval.
- Monitor integration logs after activation.

## Security Rules

- Do not scrape Google.
- Do not automate Google browser login.
- Do not store Google passwords.
- Do not commit Google secrets.
- Keep OAuth credentials and tokens server-side.
- Do not weaken Supabase RLS or authentication.
- Do not log raw tokens, passwords, or unnecessary full provider payloads.
- Do not send real review replies or customer messages from tests.

## Validation

Run the standard project validation plus Google Business Profile-specific tests:

```bash
npm run type-check
npm run lint
npm run build
git diff --check
node tests/google-business-profile-foundation.test.mjs
node tests/lead-intake-routing.test.mjs
node tests/unified-lead-intake-service.test.mjs
```

Browser validation should cover:

- Google Business Profile Integration Center status.
- three-location display.
- OAuth-required and production-disabled states.
- controlled Google Business Profile dry-run behavior.
- duplicate Google Business Profile lead handling.
- Customer 360 intake visibility.
- existing Website, Yelp, Twilio, Gmail, Google Calendar, CRM, and Lead Intake workflows.

## Intentionally Deferred

- Live Google Business Profile OAuth connection.
- Live Pub/Sub subscription deployment.
- Polling live Google reviews, performance, or location updates.
- Outbound review replies.
- Live Google credential storage.
- Production activation of any Google Business Profile location.
