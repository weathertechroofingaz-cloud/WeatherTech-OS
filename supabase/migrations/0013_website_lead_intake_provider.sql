alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (
  provider in (
    'google_calendar',
    'gmail',
    'google_maps',
    'twilio_sms',
    'gohighlevel',
    'website'
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
    'twilio_sms',
    'gohighlevel',
    'website'
  )
);
