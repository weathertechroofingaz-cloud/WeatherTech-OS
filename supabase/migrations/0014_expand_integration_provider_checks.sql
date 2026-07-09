alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (
  provider in (
    'google_calendar',
    'gmail',
    'google_maps',
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
    'gohighlevel',
    'twilio',
    'twilio_sms',
    'website',
    'yelp'
  )
);
