# Website Integration Phase 1 Setup

WeatherTech OS accepts approved website lead submissions through the existing Unified Lead Intake Hub. This foundation is built for WeatherTech Roofing LLC, WeatherTech Phoenix/Tucson attribution, IHC Painting, and future approved landing pages.

Live website forms are intentionally disabled by default. Do not enable production intake until the owner has configured server-side website submission, signed test payloads have passed, and the allowed origin list has been verified.

## Endpoint

- `POST /api/leads/website`
- `POST /api/leads/website?dryRun=1` for safe previews
- `GET /api/leads/website` for endpoint readiness metadata

The endpoint requires JSON payloads, enforces a maximum payload size, validates source and form type, checks spam signals, verifies HMAC signatures for non-dry-run requests, and routes accepted records through the Unified Lead Intake Hub.

## Supported Website Sources

| Source | Company | Branch/Market | Default Queue | Production Default |
| --- | --- | --- | --- | --- |
| `weathertech-phoenix` | WeatherTech Roofing LLC | Phoenix | `weathertech-roofing-phoenix` | Disabled |
| `weathertech-tucson` | WeatherTech Roofing LLC | Tucson | `weathertech-roofing-tucson` | Disabled |
| `ihc` | IHC Painting | IHC | `ihc-painting` | Disabled |

The IHC website domain is owner-controlled and must be added before live testing.

## Supported Form Types

- `contact_request`
- `roofing_estimate_request`
- `roof_inspection_request`
- `roof_repair_request`
- `painting_estimate_request`
- `interior_painting_request`
- `exterior_painting_request`
- `general_service_inquiry`
- `commercial_inquiry`
- `referral_submission`
- `property_manager_referral`
- `emergency_service_request`
- `landing_page_lead`

WeatherTech Roofing LLC sources accept roofing, inspection, repair, emergency, commercial, referral, and landing-page forms. IHC accepts painting, commercial, referral, and landing-page forms. Unsupported source/form combinations fail safely and do not create CRM records.

## Server Environment Variables

Use server-side hosting configuration only. Do not expose signing secrets to browser JavaScript.

```text
WEBSITE_INTAKE_ENABLED=false
WEBSITE_INTAKE_SIGNING_SECRET=
WEBSITE_LEAD_CAPTURE_SECRET=
WEBSITE_ALLOWED_ORIGINS=
WEBSITE_RATE_LIMIT_ENABLED=true
WEBSITE_SPAM_PROTECTION_ENABLED=true
WEBSITE_PRODUCTION_ENABLED_SOURCE_IDS=
WEATHERTECH_WEBSITE_SOURCE_ID=weathertech-phoenix
WEATHERTECH_TUCSON_WEBSITE_SOURCE_ID=weathertech-tucson
IHC_WEBSITE_SOURCE_ID=ihc
WEBSITE_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX=
WEBSITE_LEAD_CAPTURE_SECRET_WEATHERTECH_TUCSON=
WEBSITE_LEAD_CAPTURE_SECRET_IHC=
WEATHERTECH_WEBSITE_ALLOWED_ORIGINS=https://weathertechroofingaz.com,https://www.weathertechroofingaz.com
WEATHERTECH_TUCSON_WEBSITE_ALLOWED_ORIGINS=https://weathertechroofingaz.com,https://www.weathertechroofingaz.com
IHC_WEBSITE_ALLOWED_ORIGINS=
WEATHERTECH_WEBSITE_INTAKE_ENABLED=false
WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED=false
IHC_WEBSITE_INTAKE_ENABLED=false
```

`WEBSITE_INTAKE_ENABLED` and the source-specific production flag must both be enabled before a signed non-dry-run request can create CRM records.

## Payload

Canonical website submissions should send:

- `sourceId`
- `formType`
- `name`, or `firstName` and `lastName`
- `phone` or `email`
- `serviceAddress`, `city`, `state`, `zip`
- `requestedService` or `serviceType`
- `message` or `projectDescription`
- `websiteUrl`, `landingPage`, `referrer`
- `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`
- `gclid` or `googleClickId`
- `campaignId`
- `submittedAt`
- consent fields such as `smsConsent`, `textConsent`, `callConsent`, `emailConsent`, `privacyPolicyAccepted`, `consentSource`, and `consentCapturedAt`

The endpoint normalizes phone numbers and email addresses, preserves attribution metadata, and records sanitized integration logs without raw secrets or raw sensitive payloads.

## HMAC Signing

For non-dry-run requests, the website backend should sign the raw request body:

```text
signature = hex(hmac_sha256(secret, `${timestamp}.${rawBody}`))
```

Required headers:

- `x-weathertech-timestamp`
- `x-weathertech-signature`
- `x-weathertech-source`

The timestamp must be within the accepted replay window. Origin validation is a secondary control only and must not be the sole authentication mechanism.

## Safe Test Sequence

1. Keep `WEBSITE_INTAKE_ENABLED=false`.
2. Send dry-run submissions for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
3. Verify routing, duplicate preview, warnings, form type, and attribution in the response.
4. Configure server-side signing secrets in hosting.
5. Send signed non-dry-run tests while production remains disabled and verify `production_disabled` is returned.
6. Enable only the approved source-specific production flag after owner approval.
7. Send one clearly marked signed test lead from each approved website source.
8. Confirm each test lead appears in CRM, Customer 360 activity, follow-up queues, and integration logs.
9. Remove disposable test records using the established regression cleanup workflow.

## Owner-Controlled Steps

- Add source IDs and form types to the live public websites or website backend.
- Configure website backend HMAC signing without exposing secrets in public JavaScript.
- Add the IHC production domain and allowed origins.
- Set hosting environment variables.
- Run owner-approved live test submissions.
- Turn on production intake only after testing confirms routing, duplicate suppression, and logs.

## Deferred Work

- Public website redesign
- Live Yelp or Google Business Profile activation
- Marketing automation
- Email/SMS follow-up automation
- File attachments beyond existing documented document/photo workflows
- Lead scoring or AI recommendations
