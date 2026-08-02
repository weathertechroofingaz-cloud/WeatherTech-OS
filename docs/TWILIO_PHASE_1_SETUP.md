# Twilio Phase 1 Setup

This document records the production communications foundation for WeatherTech OS. It prepares WeatherTech Roofing LLC and IHC Painting for live Twilio SMS and call routing without enabling real outbound messaging by default.

## Supported Business Lines

WeatherTech OS is prepared to route one or more Twilio numbers to these business lines:

- WeatherTech Roofing LLC Phoenix
- WeatherTech Roofing LLC Tucson
- IHC Painting

Do not commit real phone numbers, tokens, or account identifiers. Store production values only in the hosting provider's server-side environment configuration and in the live database records protected by RLS.

## Server Environment Variables

Required for signed webhooks and safe configuration checks:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_PUBLIC_BASE_URL`

Optional or controlled-rollout variables:

- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `TWILIO_FROM_NUMBER`
- `TWILIO_WEATHERTECH_PHOENIX_NUMBER`
- `TWILIO_WEATHERTECH_TUCSON_NUMBER`
- `TWILIO_IHC_NUMBER`
- `TWILIO_OUTBOUND_SMS_ENABLED`

`TWILIO_OUTBOUND_SMS_ENABLED` must remain `false` or unset until the owner approves controlled live sending. Automated tests must not send real SMS messages.

## Webhook URLs

Use the production value of `TWILIO_PUBLIC_BASE_URL` as the base URL.

- Inbound SMS: `POST /api/integrations/twilio/webhook`
- SMS status callback: `POST /api/integrations/twilio/status`
- Voice webhook: `POST /api/integrations/twilio/voice`
- Recording callback: `POST /api/integrations/twilio/recording`

Every webhook validates `X-Twilio-Signature` using the server-side `TWILIO_AUTH_TOKEN`. Invalid signatures are rejected and are not stored as trusted CRM activity.

## Business Number Mapping

Migration `0021_twilio_live_integration_foundation.sql` provides the `business_phone_numbers`, `communication_provider_events`, and `call_records` foundation.

For each live Twilio number, create or verify one active `business_phone_numbers` row with:

- `company_id`
- `integration_connection_id`, when available
- `provider`
- `provider_account_sid`
- `messaging_service_sid`
- `phone_number_e164`
- `display_name`
- `routing_key`
- `business_location`
- `team_queue`
- `lead_source`
- `routing_status`

The receiving Twilio number is used to determine the company and business line before matching or creating CRM records.

## Runtime Behavior

Inbound SMS and voice webhooks:

- normalize sender and recipient phone numbers
- match existing customers by company and phone
- match existing leads by company and phone
- create or queue a lead through the existing lead-intake workflow when no CRM match exists
- record safe provider activity for Customer 360 and communications timelines
- use Twilio Message SIDs and Call SIDs for idempotency
- store masked/sanitized summaries in integration logs and provider-event metadata

Voice final states such as no-answer, busy, failed, and canceled are marked as follow-up eligible. Automatic missed-call text-back remains disabled until an owner-approved outbound messaging sprint.

## Safe Testing

Use Twilio test credentials or controlled internal test numbers only.

Before controlled live testing:

1. Configure server-side environment variables in the hosting platform.
2. Apply and verify migration `0021_twilio_live_integration_foundation.sql` if it is not already applied.
3. Add the three business-number mappings for WeatherTech Phoenix, WeatherTech Tucson, and IHC.
4. Configure the Twilio Console webhook URLs.
5. Send one controlled inbound SMS and one controlled inbound call per business line.
6. Verify the CRM timeline, lead-intake fallback, integration logs, and duplicate retry behavior.
7. Keep `TWILIO_OUTBOUND_SMS_ENABLED=false` until outbound sending is separately approved.

## Still Requires Owner Access

- Twilio account ownership and billing access
- Twilio phone number purchase or porting
- Twilio Messaging Service configuration
- Production hosting environment-variable access
- Live Supabase business-number mapping records
- Controlled live phone/SMS validation
