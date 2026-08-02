begin;

alter table public.integration_connections
add column if not exists provider_account_id text,
add column if not exists token_expires_at timestamptz,
add column if not exists last_successful_sync_at timestamptz,
add column if not exists last_failure_at timestamptz,
add column if not exists disabled_at timestamptz;

update public.integration_connections
set provider_account_id = coalesce(provider_account_id, external_account_id)
where provider = 'gmail'
  and provider_account_id is null
  and external_account_id is not null;

alter table public.email_messages
add column if not exists lead_id uuid,
add column if not exists job_id uuid,
add column if not exists property_id uuid,
add column if not exists direction text,
add column if not exists from_email text,
add column if not exists to_emails text[],
add column if not exists cc_emails text[],
add column if not exists bcc_emails text[],
add column if not exists reply_to_emails text[],
add column if not exists gmail_thread_id text,
add column if not exists provider_account_id text,
add column if not exists received_at timestamptz,
add column if not exists message_preview text,
add column if not exists has_attachments boolean,
add column if not exists attachment_count integer,
add column if not exists sync_status text,
add column if not exists imported_at timestamptz,
add column if not exists provider_payload_hash text,
add column if not exists metadata jsonb;

update public.email_messages
set
  direction = coalesce(nullif(direction, ''), 'outbound'),
  from_email = coalesce(nullif(from_email, ''), null),
  to_emails = coalesce(to_emails, array_remove(array[to_email], null)),
  cc_emails = coalesce(cc_emails, array_remove(array[cc_email], null)),
  bcc_emails = coalesce(bcc_emails, '{}'),
  reply_to_emails = coalesce(reply_to_emails, '{}'),
  has_attachments = coalesce(has_attachments, false),
  attachment_count = coalesce(attachment_count, 0),
  sync_status = coalesce(
    nullif(sync_status, ''),
    case
      when gmail_message_id is not null then 'synced'
      when status = 'queued' then 'queued'
      when status = 'sent' then 'sent'
      when status = 'failed' then 'failed'
      else 'local'
    end
  ),
  message_preview = coalesce(nullif(message_preview, ''), left(regexp_replace(body, '\s+', ' ', 'g'), 500)),
  metadata = coalesce(metadata, '{}'::jsonb)
where direction is null
  or direction = ''
  or to_emails is null
  or cc_emails is null
  or bcc_emails is null
  or reply_to_emails is null
  or has_attachments is null
  or attachment_count is null
  or sync_status is null
  or sync_status = ''
  or message_preview is null
  or message_preview = ''
  or metadata is null;

alter table public.email_messages
alter column direction set default 'outbound',
alter column direction set not null,
alter column to_emails set default '{}',
alter column to_emails set not null,
alter column cc_emails set default '{}',
alter column cc_emails set not null,
alter column bcc_emails set default '{}',
alter column bcc_emails set not null,
alter column reply_to_emails set default '{}',
alter column reply_to_emails set not null,
alter column has_attachments set default false,
alter column has_attachments set not null,
alter column attachment_count set default 0,
alter column attachment_count set not null,
alter column sync_status set default 'local',
alter column sync_status set not null,
alter column metadata set default '{}'::jsonb,
alter column metadata set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.email_messages'::regclass
      and conname = 'email_messages_lead_id_fkey'
  ) then
    alter table public.email_messages
    add constraint email_messages_lead_id_fkey
    foreign key (lead_id) references public.leads(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.email_messages'::regclass
      and conname = 'email_messages_job_id_fkey'
  ) then
    alter table public.email_messages
    add constraint email_messages_job_id_fkey
    foreign key (job_id) references public.jobs(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.email_messages'::regclass
      and conname = 'email_messages_property_id_fkey'
  ) then
    alter table public.email_messages
    add constraint email_messages_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete set null
    not valid;
  end if;
end $$;

alter table public.email_messages validate constraint email_messages_lead_id_fkey;
alter table public.email_messages validate constraint email_messages_job_id_fkey;
alter table public.email_messages validate constraint email_messages_property_id_fkey;

alter table public.email_messages
drop constraint if exists email_messages_direction_check;

alter table public.email_messages
add constraint email_messages_direction_check
check (direction in ('inbound', 'outbound')) not valid;

alter table public.email_messages validate constraint email_messages_direction_check;

alter table public.email_messages
drop constraint if exists email_messages_sync_status_check;

alter table public.email_messages
add constraint email_messages_sync_status_check
check (sync_status in ('local', 'queued', 'syncing', 'synced', 'imported', 'sent', 'failed', 'skipped')) not valid;

alter table public.email_messages validate constraint email_messages_sync_status_check;

alter table public.email_messages
drop constraint if exists email_messages_attachment_count_check;

alter table public.email_messages
add constraint email_messages_attachment_count_check
check (attachment_count >= 0) not valid;

alter table public.email_messages validate constraint email_messages_attachment_count_check;

create table if not exists public.gmail_oauth_states (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  initiated_by uuid references auth.users(id) on delete set null,
  state_hash text not null unique,
  code_verifier text not null,
  redirect_path text not null default '/?view=integrations',
  requested_scopes text[] not null default '{}',
  mailbox_label text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gmail_mailbox_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  account_email text not null,
  provider_account_id text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_type text,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id)
);

create table if not exists public.gmail_email_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  gmail_thread_id text not null,
  subject text not null,
  last_message_at timestamptz,
  message_count integer not null default 0,
  last_direction text not null default 'inbound',
  match_status text not null default 'unmatched',
  sync_status text not null default 'imported',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, gmail_thread_id)
);

create table if not exists public.gmail_email_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  gmail_attachment_id text,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  content_disposition text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gmail_email_threads
drop constraint if exists gmail_email_threads_last_direction_check;

alter table public.gmail_email_threads
add constraint gmail_email_threads_last_direction_check
check (last_direction in ('inbound', 'outbound')) not valid;

alter table public.gmail_email_threads validate constraint gmail_email_threads_last_direction_check;

alter table public.gmail_email_threads
drop constraint if exists gmail_email_threads_match_status_check;

alter table public.gmail_email_threads
add constraint gmail_email_threads_match_status_check
check (match_status in ('matched_customer', 'matched_lead', 'matched_job', 'matched_estimate', 'unmatched', 'manual_review')) not valid;

alter table public.gmail_email_threads validate constraint gmail_email_threads_match_status_check;

alter table public.gmail_email_threads
drop constraint if exists gmail_email_threads_sync_status_check;

alter table public.gmail_email_threads
add constraint gmail_email_threads_sync_status_check
check (sync_status in ('imported', 'syncing', 'synced', 'failed', 'skipped')) not valid;

alter table public.gmail_email_threads validate constraint gmail_email_threads_sync_status_check;

alter table public.gmail_email_threads
drop constraint if exists gmail_email_threads_message_count_check;

alter table public.gmail_email_threads
add constraint gmail_email_threads_message_count_check
check (message_count >= 0) not valid;

alter table public.gmail_email_threads validate constraint gmail_email_threads_message_count_check;

alter table public.gmail_email_attachments
drop constraint if exists gmail_email_attachments_size_check;

alter table public.gmail_email_attachments
add constraint gmail_email_attachments_size_check
check (size_bytes is null or size_bytes >= 0) not valid;

alter table public.gmail_email_attachments validate constraint gmail_email_attachments_size_check;

create index if not exists integration_connections_gmail_account_idx
on public.integration_connections(provider, provider_account_id)
where provider = 'gmail';

create index if not exists email_messages_lead_idx on public.email_messages(lead_id);
create index if not exists email_messages_job_idx on public.email_messages(job_id);
create index if not exists email_messages_property_idx on public.email_messages(property_id);
create index if not exists email_messages_direction_idx on public.email_messages(direction);
create index if not exists email_messages_gmail_thread_idx on public.email_messages(gmail_thread_id);
create index if not exists email_messages_received_at_idx on public.email_messages(received_at);
create index if not exists email_messages_sync_status_idx on public.email_messages(sync_status);
create unique index if not exists email_messages_gmail_message_unique_idx
on public.email_messages(integration_connection_id, gmail_message_id)
where gmail_message_id is not null;

create index if not exists gmail_oauth_states_company_idx on public.gmail_oauth_states(company_id);
create index if not exists gmail_oauth_states_expiry_idx on public.gmail_oauth_states(expires_at);
create index if not exists gmail_mailbox_credentials_company_idx on public.gmail_mailbox_credentials(company_id);
create index if not exists gmail_mailbox_credentials_connection_idx on public.gmail_mailbox_credentials(integration_connection_id);
create index if not exists gmail_email_threads_company_idx on public.gmail_email_threads(company_id);
create index if not exists gmail_email_threads_customer_idx on public.gmail_email_threads(customer_id);
create index if not exists gmail_email_threads_lead_idx on public.gmail_email_threads(lead_id);
create index if not exists gmail_email_threads_connection_idx on public.gmail_email_threads(integration_connection_id);
create index if not exists gmail_email_threads_last_message_idx on public.gmail_email_threads(last_message_at);
create index if not exists gmail_email_attachments_company_idx on public.gmail_email_attachments(company_id);
create index if not exists gmail_email_attachments_email_idx on public.gmail_email_attachments(email_message_id);
create index if not exists gmail_email_attachments_connection_idx on public.gmail_email_attachments(integration_connection_id);

drop trigger if exists set_gmail_oauth_states_updated_at on public.gmail_oauth_states;
create trigger set_gmail_oauth_states_updated_at
before update on public.gmail_oauth_states
for each row execute function public.set_updated_at();

drop trigger if exists set_gmail_mailbox_credentials_updated_at on public.gmail_mailbox_credentials;
create trigger set_gmail_mailbox_credentials_updated_at
before update on public.gmail_mailbox_credentials
for each row execute function public.set_updated_at();

drop trigger if exists set_gmail_email_threads_updated_at on public.gmail_email_threads;
create trigger set_gmail_email_threads_updated_at
before update on public.gmail_email_threads
for each row execute function public.set_updated_at();

drop trigger if exists set_gmail_email_attachments_updated_at on public.gmail_email_attachments;
create trigger set_gmail_email_attachments_updated_at
before update on public.gmail_email_attachments
for each row execute function public.set_updated_at();

alter table public.gmail_oauth_states enable row level security;
alter table public.gmail_mailbox_credentials enable row level security;
alter table public.gmail_email_threads enable row level security;
alter table public.gmail_email_attachments enable row level security;

revoke all on table public.gmail_oauth_states from anon;
revoke all on table public.gmail_oauth_states from public;
revoke all on table public.gmail_oauth_states from authenticated;
grant select, insert, update, delete on table public.gmail_oauth_states to service_role;

revoke all on table public.gmail_mailbox_credentials from anon;
revoke all on table public.gmail_mailbox_credentials from public;
revoke all on table public.gmail_mailbox_credentials from authenticated;
grant select, insert, update, delete on table public.gmail_mailbox_credentials to service_role;

revoke all on table public.gmail_email_threads from anon;
revoke all on table public.gmail_email_threads from public;
revoke delete on table public.gmail_email_threads from authenticated;
grant select, insert, update on table public.gmail_email_threads to authenticated;
grant select, insert, update, delete on table public.gmail_email_threads to service_role;

revoke all on table public.gmail_email_attachments from anon;
revoke all on table public.gmail_email_attachments from public;
revoke delete on table public.gmail_email_attachments from authenticated;
grant select, insert, update on table public.gmail_email_attachments to authenticated;
grant select, insert, update, delete on table public.gmail_email_attachments to service_role;

drop policy if exists "WTOS users read Gmail email threads" on public.gmail_email_threads;
create policy "WTOS users read Gmail email threads"
on public.gmail_email_threads for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS sales insert Gmail email threads" on public.gmail_email_threads;
create policy "WTOS sales insert Gmail email threads"
on public.gmail_email_threads for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_settings(company_id)
);

drop policy if exists "WTOS sales update Gmail email threads" on public.gmail_email_threads;
create policy "WTOS sales update Gmail email threads"
on public.gmail_email_threads for update to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_settings(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_settings(company_id)
);

drop policy if exists "WTOS users read Gmail email attachments" on public.gmail_email_attachments;
create policy "WTOS users read Gmail email attachments"
on public.gmail_email_attachments for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS sales insert Gmail email attachments" on public.gmail_email_attachments;
create policy "WTOS sales insert Gmail email attachments"
on public.gmail_email_attachments for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_settings(company_id)
);

drop policy if exists "WTOS sales update Gmail email attachments" on public.gmail_email_attachments;
create policy "WTOS sales update Gmail email attachments"
on public.gmail_email_attachments for update to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_settings(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_settings(company_id)
);

commit;
