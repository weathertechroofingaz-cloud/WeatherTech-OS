begin;

alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (
  provider in (
    'google_calendar',
    'gmail',
    'google_maps',
    'google_business_profile',
    'gohighlevel',
    'twilio',
    'twilio_sms',
    'website',
    'yelp'
  )
);

alter table public.integration_sync_logs
drop constraint if exists integration_sync_logs_provider_check;

alter table public.integration_sync_logs
add constraint integration_sync_logs_provider_check
check (
  provider in (
    'google_calendar',
    'gmail',
    'google_maps',
    'google_business_profile',
    'gohighlevel',
    'twilio',
    'twilio_sms',
    'website',
    'yelp'
  )
);

alter table public.lead_source_mappings
drop constraint if exists lead_source_mappings_provider_check;

alter table public.lead_source_mappings
add constraint lead_source_mappings_provider_check
check (
  provider in (
    'google_business_profile',
    'gohighlevel',
    'twilio',
    'twilio_sms',
    'website',
    'yelp'
  )
);

alter table public.lead_intake_records
drop constraint if exists lead_intake_records_provider_check;

alter table public.lead_intake_records
add constraint lead_intake_records_provider_check
check (
  provider in (
    'manual',
    'website',
    'yelp',
    'google_business_profile',
    'twilio',
    'twilio_sms',
    'gohighlevel',
    'gmail',
    'referral',
    'email'
  )
);

commit;
