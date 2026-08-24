begin;

-- Proposal-to-Sold Job Operational Completion Phase 1
--
-- This migration is deliberately additive. It does not backfill or mutate any
-- existing proposal, document, payment, signature, or job row, and it does not
-- touch Storage objects. Native signing internals are reachable only through
-- the service-role RPCs defined below. The sold-job conversion RPC is the sole
-- authenticated entry point and performs its own exact owner check.

alter table public.estimate_proposal_revisions
add column if not exists finalization_operation_key uuid,
add column if not exists artifact_operation_key uuid,
add column if not exists customer_snapshot jsonb,
add column if not exists revision_sha256 text,
add column if not exists terms_sha256 text,
add column if not exists finalized_at timestamptz,
add column if not exists finalized_by uuid,
add column if not exists finalized_document_id uuid,
add column if not exists accepted_signature_id uuid,
add column if not exists accepted_acceptance_id uuid,
add column if not exists signed_document_id uuid;

alter table public.documents
add column if not exists proposal_revision_id uuid,
add column if not exists artifact_operation_key uuid,
add column if not exists content_sha256 text,
add column if not exists immutable_after_at timestamptz;

alter table public.signatures
add column if not exists proposal_revision_id uuid,
add column if not exists acceptance_id uuid,
add column if not exists signed_document_id uuid,
add column if not exists signature_method text,
add column if not exists evidence_sha256 text;

alter table public.estimate_proposal_acceptances
add column if not exists signing_request_id uuid,
add column if not exists signature_id uuid,
add column if not exists proposal_document_id uuid,
add column if not exists acceptance_operation_key uuid,
add column if not exists acceptance_request_sha256 text,
add column if not exists proposal_revision_sha256 text,
add column if not exists proposal_document_sha256 text,
add column if not exists terms_sha256 text,
add column if not exists consent_version text,
add column if not exists consent_sha256 text,
add column if not exists electronic_records_consented boolean,
add column if not exists signature_intent_acknowledged boolean,
add column if not exists signature_method text,
add column if not exists required_deposit_amount numeric(12, 2),
add column if not exists evidence_sha256 text;

alter table public.jobs
add column if not exists proposal_revision_id uuid,
add column if not exists proposal_acceptance_id uuid,
add column if not exists conversion_operation_key uuid;

alter table public.invoices
add column if not exists proposal_revision_id uuid,
add column if not exists proposal_acceptance_id uuid,
add column if not exists invoice_purpose text,
add column if not exists proposal_invoice_operation_key uuid;

alter table public.estimate_proposal_revisions
drop constraint if exists estimate_proposal_revisions_signature_status_check;

alter table public.estimate_proposal_revisions
add constraint estimate_proposal_revisions_signature_status_check
check (
  signature_status in (
    'not_configured',
    'sending_disabled',
    'ready_for_sandbox_testing',
    'ready_to_send',
    'prepared',
    'awaiting_signature',
    'signed',
    'declined',
    'expired',
    'failed'
  )
);

alter table public.signatures
drop constraint if exists signatures_status_check;

alter table public.signatures
add constraint signatures_status_check
check (
  status in (
    'pending',
    'sent',
    'viewed',
    'signed',
    'declined',
    'expired',
    'failed',
    'revoked',
    'superseded'
  )
);

alter table public.estimate_proposal_acceptances
drop constraint if exists estimate_proposal_acceptances_acceptance_method_check;

alter table public.estimate_proposal_acceptances
add constraint estimate_proposal_acceptances_acceptance_method_check
check (
  acceptance_method in (
    'internal_recorded',
    'customer_portal',
    'signature_provider',
    'native_electronic'
  )
);

alter table public.estimate_proposal_revisions
add constraint estimate_proposal_revisions_finalization_operation_key_key
unique (finalization_operation_key),
add constraint estimate_proposal_revisions_artifact_operation_key_key
unique (artifact_operation_key),
add constraint estimate_proposal_revisions_revision_sha256_check
check (revision_sha256 is null or revision_sha256 ~ '^[0-9a-f]{64}$'),
add constraint estimate_proposal_revisions_terms_sha256_check
check (terms_sha256 is null or terms_sha256 ~ '^[0-9a-f]{64}$'),
add constraint estimate_proposal_revisions_native_finalization_check
check (
  finalized_at is null
  or (
    finalization_operation_key is not null
    and customer_snapshot is not null
    and revision_sha256 is not null
    and terms_sha256 is not null
    and finalized_by is not null
    and immutable_after_at is not null
  )
);

alter table public.documents
add constraint documents_artifact_operation_key_key
unique (artifact_operation_key),
add constraint documents_content_sha256_check
check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
add constraint documents_native_proposal_artifact_check
check (
  proposal_revision_id is null
  or (
    category in ('proposal', 'signed_proposal')
    and file_url is null
    and storage_bucket = 'customer-documents'
    and nullif(btrim(storage_path), '') is not null
    and nullif(btrim(file_name), '') is not null
    and mime_type = 'application/pdf'
    and file_size_bytes > 0
    and content_sha256 is not null
    and immutable_after_at is not null
  )
);

alter table public.signatures
add constraint signatures_signature_method_check
check (signature_method is null or signature_method in ('typed_name')),
add constraint signatures_evidence_sha256_check
check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$');

alter table public.estimate_proposal_acceptances
add constraint estimate_proposal_acceptances_acceptance_operation_key_key
unique (acceptance_operation_key),
add constraint estimate_proposal_acceptances_signing_request_id_key
unique (signing_request_id),
add constraint estimate_proposal_acceptances_signature_id_key
unique (signature_id),
add constraint estimate_proposal_acceptances_acceptance_request_sha256_check
check (
  acceptance_request_sha256 is null
  or acceptance_request_sha256 ~ '^[0-9a-f]{64}$'
),
add constraint estimate_proposal_acceptances_revision_sha256_check
check (
  proposal_revision_sha256 is null
  or proposal_revision_sha256 ~ '^[0-9a-f]{64}$'
),
add constraint estimate_proposal_acceptances_document_sha256_check
check (
  proposal_document_sha256 is null
  or proposal_document_sha256 ~ '^[0-9a-f]{64}$'
),
add constraint estimate_proposal_acceptances_terms_sha256_check
check (terms_sha256 is null or terms_sha256 ~ '^[0-9a-f]{64}$'),
add constraint estimate_proposal_acceptances_consent_sha256_check
check (consent_sha256 is null or consent_sha256 ~ '^[0-9a-f]{64}$'),
add constraint estimate_proposal_acceptances_evidence_sha256_check
check (evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
add constraint estimate_proposal_acceptances_ip_hash_check
check (
  acceptance_method <> 'native_electronic'
  or ip_hash is null
  or ip_hash ~ '^[0-9a-f]{64}$'
),
add constraint estimate_proposal_acceptances_user_agent_length_check
check (
  acceptance_method <> 'native_electronic'
  or user_agent is null
  or length(user_agent) <= 500
),
add constraint estimate_proposal_acceptances_required_deposit_amount_check
check (required_deposit_amount is null or required_deposit_amount >= 0),
add constraint estimate_proposal_acceptances_native_electronic_check
check (
  acceptance_method <> 'native_electronic'
  or (
    signing_request_id is not null
    and signature_id is not null
    and proposal_document_id is not null
    and acceptance_operation_key is not null
    and acceptance_request_sha256 is not null
    and proposal_revision_sha256 is not null
    and proposal_document_sha256 is not null
    and terms_sha256 is not null
    and consent_version = 'wtos-native-esign-v1'
    and consent_sha256 is not null
    and electronic_records_consented
    and signature_intent_acknowledged
    and signature_method = 'typed_name'
    and required_deposit_amount is not null
    and evidence_sha256 is not null
    and signature_status = 'signed'
  )
);

alter table public.jobs
add constraint jobs_conversion_operation_key_key
unique (conversion_operation_key),
add constraint jobs_proposal_conversion_links_check
check (
  (proposal_revision_id is null and proposal_acceptance_id is null and conversion_operation_key is null)
  or (
    proposal_revision_id is not null
    and proposal_acceptance_id is not null
    and conversion_operation_key is not null
  )
);

alter table public.invoices
add constraint invoices_proposal_invoice_operation_key_key
unique (proposal_invoice_operation_key),
add constraint invoices_invoice_purpose_check
check (invoice_purpose is null or invoice_purpose = 'proposal_deposit'),
add constraint invoices_proposal_links_check
check (
  (
    proposal_revision_id is null
    and proposal_acceptance_id is null
    and invoice_purpose is null
    and proposal_invoice_operation_key is null
  )
  or (
    proposal_revision_id is not null
    and proposal_acceptance_id is not null
    and invoice_purpose = 'proposal_deposit'
    and proposal_invoice_operation_key is not null
  )
);

create table public.proposal_signing_requests (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete restrict,
  proposal_revision_id uuid not null references public.estimate_proposal_revisions(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  signature_id uuid not null references public.signatures(id) on delete restrict,
  proposal_document_id uuid not null references public.documents(id) on delete restrict,
  operation_key uuid not null unique,
  request_token_sha256 text not null unique,
  request_token_consumed_at timestamptz,
  request_token_consumed_session_id uuid,
  revision_sha256 text not null,
  document_sha256 text not null,
  terms_sha256 text not null,
  consent_version text not null,
  consent_text text not null,
  consent_sha256 text not null,
  intended_signer_name text not null,
  intended_signer_email text not null,
  status text not null default 'prepared',
  delivery_email_message_id uuid references public.email_messages(id) on delete restrict,
  delivery_provider_message_id text,
  failure_code text,
  revocation_reason text,
  expires_at timestamptz not null,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  failed_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,
  exchange_attempt_count integer not null default 0,
  exchange_window_started_at timestamptz,
  exchange_blocked_until timestamptz,
  session_read_attempt_count integer not null default 0,
  session_read_window_started_at timestamptz,
  session_read_blocked_until timestamptz,
  action_attempt_count integer not null default 0,
  action_window_started_at timestamptz,
  action_blocked_until timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_signing_requests_status_check check (
    status in (
      'prepared',
      'sent',
      'viewed',
      'signed',
      'declined',
      'failed',
      'revoked',
      'superseded',
      'expired'
    )
  ),
  constraint proposal_signing_requests_request_token_sha256_check
    check (request_token_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signing_requests_token_consumption_check check (
    (request_token_consumed_at is null and request_token_consumed_session_id is null)
    or (
      request_token_consumed_at is not null
      and request_token_consumed_session_id is not null
    )
  ),
  constraint proposal_signing_requests_revision_sha256_check
    check (revision_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signing_requests_document_sha256_check
    check (document_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signing_requests_terms_sha256_check
    check (terms_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signing_requests_consent_version_check
    check (consent_version = 'wtos-native-esign-v1'),
  constraint proposal_signing_requests_consent_text_check
    check (
      consent_text = 'Electronic records and signature consent for this proposal. This consent applies only to this exact finalized proposal, your acceptance, and the signed receipt. Before signing, you can open, download, print, and save the exact finalized proposal PDF. By selecting the electronic-records checkbox, you confirm that you can access and retain these electronic records. You may decline electronic signing or withdraw this consent before signing by replying to the proposal email or contacting the company; doing so will not affect electronic actions already completed. Keep your email address current by contacting the company. This process requires internet access, a current JavaScript- and cookie-enabled browser, a PDF viewer, and storage or printing capability to retain records. You may request a paper copy by contacting the company; contact the company about availability and any fees. The normal acceptance workflow remains electronic. By selecting all electronic-signature acknowledgements and submitting your typed legal name, you intend that name to be your electronic signature on this exact finalized proposal revision.'
    ),
  constraint proposal_signing_requests_consent_sha256_check
    check (consent_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signing_requests_signer_name_check
    check (nullif(btrim(intended_signer_name), '') is not null),
  constraint proposal_signing_requests_signer_email_check
    check (nullif(btrim(intended_signer_email), '') is not null),
  constraint proposal_signing_requests_rate_counter_check check (
    exchange_attempt_count >= 0
    and session_read_attempt_count >= 0
    and action_attempt_count >= 0
  ),
  constraint proposal_signing_requests_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '30 days'),
  constraint proposal_signing_requests_state_timestamp_check check (
    (status <> 'sent' or sent_at is not null)
    and (status <> 'viewed' or first_viewed_at is not null)
    and (status <> 'signed' or signed_at is not null)
    and (status <> 'declined' or declined_at is not null)
    and (status <> 'failed' or failed_at is not null)
    and (status <> 'revoked' or revoked_at is not null)
    and (status <> 'superseded' or superseded_at is not null)
  )
);

create table public.proposal_signing_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  signing_request_id uuid not null references public.proposal_signing_requests(id) on delete restrict,
  session_token_sha256 text not null unique,
  status text not null default 'active',
  initial_ip_hash text,
  initial_user_agent text,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  signed_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_signing_sessions_status_check
    check (status in ('active', 'signed', 'declined', 'revoked', 'expired')),
  constraint proposal_signing_sessions_token_sha256_check
    check (session_token_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signing_sessions_ip_hash_check
    check (initial_ip_hash is null or initial_ip_hash ~ '^[0-9a-f]{64}$'),
  constraint proposal_signing_sessions_expiry_check
    check (expires_at > opened_at and expires_at <= opened_at + interval '24 hours'),
  constraint proposal_signing_sessions_state_timestamp_check check (
    (status <> 'signed' or signed_at is not null)
    and (status <> 'declined' or declined_at is not null)
    and (status <> 'revoked' or revoked_at is not null)
  )
);

create table public.proposal_signature_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  signing_request_id uuid not null references public.proposal_signing_requests(id) on delete restrict,
  proposal_revision_id uuid not null references public.estimate_proposal_revisions(id) on delete restrict,
  acceptance_id uuid not null references public.estimate_proposal_acceptances(id) on delete restrict,
  signature_id uuid not null references public.signatures(id) on delete restrict,
  source_document_id uuid not null references public.documents(id) on delete restrict,
  signed_document_id uuid not null references public.documents(id) on delete restrict,
  operation_key uuid not null unique,
  revision_sha256 text not null,
  source_document_sha256 text not null,
  signed_document_sha256 text not null,
  evidence_sha256 text not null,
  registered_at timestamptz not null default now(),
  constraint proposal_signature_receipts_request_key unique (signing_request_id),
  constraint proposal_signature_receipts_revision_key unique (proposal_revision_id),
  constraint proposal_signature_receipts_acceptance_key unique (acceptance_id),
  constraint proposal_signature_receipts_signature_key unique (signature_id),
  constraint proposal_signature_receipts_signed_document_key unique (signed_document_id),
  constraint proposal_signature_receipts_revision_sha256_check
    check (revision_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signature_receipts_source_document_sha256_check
    check (source_document_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signature_receipts_signed_document_sha256_check
    check (signed_document_sha256 ~ '^[0-9a-f]{64}$'),
  constraint proposal_signature_receipts_evidence_sha256_check
    check (evidence_sha256 ~ '^[0-9a-f]{64}$')
);

create table public.proposal_synthetic_cleanup_guards (
  backend_pid integer not null,
  transaction_id bigint not null,
  operation_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (backend_pid, transaction_id)
);

create table public.proposal_native_rpc_guards (
  backend_pid integer not null,
  transaction_id bigint not null,
  operation_name text not null,
  operation_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (backend_pid, transaction_id)
);

alter table public.proposal_signing_requests
add constraint proposal_signing_requests_consumed_session_fkey
foreign key (request_token_consumed_session_id)
references public.proposal_signing_sessions(id) on delete restrict not valid;

alter table public.estimate_proposal_revisions
add constraint estimate_proposal_revisions_finalized_by_fkey
foreign key (finalized_by) references auth.users(id) on delete restrict not valid,
add constraint estimate_proposal_revisions_finalized_document_id_fkey
foreign key (finalized_document_id) references public.documents(id) on delete restrict not valid,
add constraint estimate_proposal_revisions_accepted_signature_id_fkey
foreign key (accepted_signature_id) references public.signatures(id) on delete restrict not valid,
add constraint estimate_proposal_revisions_accepted_acceptance_id_fkey
foreign key (accepted_acceptance_id) references public.estimate_proposal_acceptances(id) on delete restrict not valid,
add constraint estimate_proposal_revisions_signed_document_id_fkey
foreign key (signed_document_id) references public.documents(id) on delete restrict not valid;

alter table public.documents
add constraint documents_proposal_revision_id_fkey
foreign key (proposal_revision_id)
references public.estimate_proposal_revisions(id) on delete restrict not valid;

alter table public.signatures
add constraint signatures_proposal_revision_id_fkey
foreign key (proposal_revision_id)
references public.estimate_proposal_revisions(id) on delete restrict not valid,
add constraint signatures_acceptance_id_fkey
foreign key (acceptance_id)
references public.estimate_proposal_acceptances(id) on delete restrict not valid,
add constraint signatures_signed_document_id_fkey
foreign key (signed_document_id)
references public.documents(id) on delete restrict not valid;

alter table public.estimate_proposal_acceptances
add constraint estimate_proposal_acceptances_signing_request_id_fkey
foreign key (signing_request_id)
references public.proposal_signing_requests(id) on delete restrict not valid,
add constraint estimate_proposal_acceptances_signature_id_fkey
foreign key (signature_id)
references public.signatures(id) on delete restrict not valid,
add constraint estimate_proposal_acceptances_proposal_document_id_fkey
foreign key (proposal_document_id)
references public.documents(id) on delete restrict not valid;

alter table public.jobs
add constraint jobs_proposal_revision_id_fkey
foreign key (proposal_revision_id)
references public.estimate_proposal_revisions(id) on delete restrict not valid,
add constraint jobs_proposal_acceptance_id_fkey
foreign key (proposal_acceptance_id)
references public.estimate_proposal_acceptances(id) on delete restrict not valid;

alter table public.invoices
add constraint invoices_proposal_revision_id_fkey
foreign key (proposal_revision_id)
references public.estimate_proposal_revisions(id) on delete restrict not valid,
add constraint invoices_proposal_acceptance_id_fkey
foreign key (proposal_acceptance_id)
references public.estimate_proposal_acceptances(id) on delete restrict not valid;

alter table public.estimate_proposal_revisions
validate constraint estimate_proposal_revisions_finalized_by_fkey,
validate constraint estimate_proposal_revisions_finalized_document_id_fkey,
validate constraint estimate_proposal_revisions_accepted_signature_id_fkey,
validate constraint estimate_proposal_revisions_accepted_acceptance_id_fkey,
validate constraint estimate_proposal_revisions_signed_document_id_fkey;

alter table public.proposal_signing_requests
validate constraint proposal_signing_requests_consumed_session_fkey;

alter table public.documents validate constraint documents_proposal_revision_id_fkey;

alter table public.signatures
validate constraint signatures_proposal_revision_id_fkey,
validate constraint signatures_acceptance_id_fkey,
validate constraint signatures_signed_document_id_fkey;

alter table public.estimate_proposal_acceptances
validate constraint estimate_proposal_acceptances_signing_request_id_fkey,
validate constraint estimate_proposal_acceptances_signature_id_fkey,
validate constraint estimate_proposal_acceptances_proposal_document_id_fkey;

alter table public.jobs
validate constraint jobs_proposal_revision_id_fkey,
validate constraint jobs_proposal_acceptance_id_fkey;

alter table public.invoices
validate constraint invoices_proposal_revision_id_fkey,
validate constraint invoices_proposal_acceptance_id_fkey;

create unique index documents_proposal_revision_category_idx
on public.documents (proposal_revision_id, category)
where proposal_revision_id is not null;

create index estimate_proposal_revisions_finalized_by_idx
on public.estimate_proposal_revisions (finalized_by)
where finalized_by is not null;

create index estimate_proposal_revisions_finalized_document_id_idx
on public.estimate_proposal_revisions (finalized_document_id)
where finalized_document_id is not null;

create index estimate_proposal_revisions_accepted_signature_id_idx
on public.estimate_proposal_revisions (accepted_signature_id)
where accepted_signature_id is not null;

create index estimate_proposal_revisions_accepted_acceptance_id_idx
on public.estimate_proposal_revisions (accepted_acceptance_id)
where accepted_acceptance_id is not null;

create index estimate_proposal_revisions_signed_document_id_idx
on public.estimate_proposal_revisions (signed_document_id)
where signed_document_id is not null;

create index signatures_proposal_revision_id_idx
on public.signatures (proposal_revision_id)
where proposal_revision_id is not null;

create index signatures_acceptance_id_idx
on public.signatures (acceptance_id)
where acceptance_id is not null;

create index signatures_signed_document_id_idx
on public.signatures (signed_document_id)
where signed_document_id is not null;

create index estimate_proposal_acceptances_proposal_document_id_idx
on public.estimate_proposal_acceptances (proposal_document_id)
where proposal_document_id is not null;

create unique index jobs_proposal_revision_id_idx
on public.jobs (proposal_revision_id)
where proposal_revision_id is not null;

create unique index jobs_proposal_acceptance_id_idx
on public.jobs (proposal_acceptance_id)
where proposal_acceptance_id is not null;

create unique index invoices_proposal_revision_purpose_idx
on public.invoices (proposal_revision_id, invoice_purpose)
where proposal_revision_id is not null;

create unique index invoices_proposal_acceptance_purpose_idx
on public.invoices (proposal_acceptance_id, invoice_purpose)
where proposal_acceptance_id is not null;

create unique index email_messages_one_active_proposal_signature_draft_idx
on public.email_messages (
  company_id,
  document_id,
  ((metadata ->> 'proposalRevisionId'))
)
where status in ('draft', 'queued')
  and metadata ->> 'draftType' = 'proposal_signature_request';

create index proposal_signing_requests_revision_status_idx
on public.proposal_signing_requests (proposal_revision_id, status);

create index proposal_signing_requests_company_id_idx
on public.proposal_signing_requests (company_id);

create index proposal_signing_requests_estimate_id_idx
on public.proposal_signing_requests (estimate_id);

create index proposal_signing_requests_customer_id_idx
on public.proposal_signing_requests (customer_id);

create unique index proposal_signing_requests_signature_id_idx
on public.proposal_signing_requests (signature_id);

create index proposal_signing_requests_proposal_document_id_idx
on public.proposal_signing_requests (proposal_document_id);

create index proposal_signing_requests_delivery_email_message_id_idx
on public.proposal_signing_requests (delivery_email_message_id)
where delivery_email_message_id is not null;

create index proposal_signing_requests_consumed_session_id_idx
on public.proposal_signing_requests (request_token_consumed_session_id)
where request_token_consumed_session_id is not null;

create index proposal_signing_requests_created_by_idx
on public.proposal_signing_requests (created_by);

create index proposal_signing_requests_expiry_idx
on public.proposal_signing_requests (expires_at)
where status in ('prepared', 'sent', 'viewed');

create unique index proposal_signing_requests_one_active_revision_idx
on public.proposal_signing_requests (proposal_revision_id)
where status in ('prepared', 'sent', 'viewed');

create index proposal_signing_sessions_request_status_idx
on public.proposal_signing_sessions (signing_request_id, status);

create index proposal_signing_sessions_company_id_idx
on public.proposal_signing_sessions (company_id);

create index proposal_signature_receipts_company_id_idx
on public.proposal_signature_receipts (company_id);

create index proposal_signature_receipts_source_document_id_idx
on public.proposal_signature_receipts (source_document_id);

alter table public.proposal_signing_requests enable row level security;
alter table public.proposal_signing_requests force row level security;
alter table public.proposal_signing_sessions enable row level security;
alter table public.proposal_signing_sessions force row level security;
alter table public.proposal_signature_receipts enable row level security;
alter table public.proposal_signature_receipts force row level security;
alter table public.proposal_synthetic_cleanup_guards enable row level security;
alter table public.proposal_synthetic_cleanup_guards force row level security;
alter table public.proposal_native_rpc_guards enable row level security;
alter table public.proposal_native_rpc_guards force row level security;

revoke all on table public.proposal_signing_requests
from public, anon, authenticated, service_role;
revoke all on table public.proposal_signing_sessions
from public, anon, authenticated, service_role;
revoke all on table public.proposal_signature_receipts
from public, anon, authenticated, service_role;
revoke all on table public.proposal_synthetic_cleanup_guards
from public, anon, authenticated, service_role;
revoke all on table public.proposal_native_rpc_guards
from public, anon, authenticated, service_role;

grant select on table public.proposal_signing_requests to service_role;
grant select on table public.proposal_signing_sessions to service_role;
grant select on table public.proposal_signature_receipts to service_role;

drop policy if exists "WTOS sales insert proposal acceptances"
on public.estimate_proposal_acceptances;
drop policy if exists "WTOS users insert proposal audit events"
on public.proposal_audit_events;

revoke insert, update, delete on table public.estimate_proposal_acceptances
from anon, authenticated, service_role;
grant select on table public.estimate_proposal_acceptances to authenticated, service_role;
grant insert on table public.estimate_proposal_acceptances to service_role;

revoke insert, update, delete on table public.proposal_audit_events
from anon, authenticated, service_role;
grant select on table public.proposal_audit_events to authenticated, service_role;
grant insert on table public.proposal_audit_events to service_role;

drop policy if exists "WTOS users insert signatures" on public.signatures;
create policy "WTOS users insert non-proposal signatures"
on public.signatures for insert to authenticated
with check (
  proposal_revision_id is null
  and (
    public.wtos_can_manage_sales(company_id)
    or public.wtos_can_manage_financials(company_id)
  )
);

drop policy if exists "WTOS users update signatures" on public.signatures;
create policy "WTOS users update non-proposal signatures"
on public.signatures for update to authenticated
using (
  proposal_revision_id is null
  and (
    public.wtos_can_manage_sales(company_id)
    or public.wtos_can_manage_financials(company_id)
  )
)
with check (
  proposal_revision_id is null
  and (
    public.wtos_can_manage_sales(company_id)
    or public.wtos_can_manage_financials(company_id)
  )
);

create or replace function public.wtos_can_update_customer_document_object(
  object_bucket text,
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    object_bucket = 'customer-documents'
    and public.wtos_can_manage_documents(
      public.wtos_storage_company_id(object_name)
    )
    and not exists (
      select 1
      from public.documents as document
      where document.storage_bucket = object_bucket
        and document.storage_path = object_name
        and (
          document.proposal_revision_id is not null
          or document.immutable_after_at is not null
        )
    );
$$;

revoke all on function public.wtos_can_update_customer_document_object(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_can_update_customer_document_object(text, text)
to authenticated;

drop policy if exists "WTOS users update customer documents" on storage.objects;
create policy "WTOS users update customer documents"
on storage.objects for update to authenticated
using (
  public.wtos_can_update_customer_document_object(bucket_id, name)
)
with check (
  public.wtos_can_update_customer_document_object(bucket_id, name)
);

create or replace function public.wtos_assert_proposal_owner(
  target_company_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_company_id is null or target_user_id is null or not exists (
    select 1
    from public.company_memberships as membership
    where membership.company_id = target_company_id
      and membership.user_id = target_user_id
      and membership.role = 'owner'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Company owner authorization is required.';
  end if;
end;
$$;

revoke all on function public.wtos_assert_proposal_owner(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.wtos_begin_native_proposal_rpc_guard(
  target_operation_name text,
  target_operation_key uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(target_operation_name), '') is null
    or length(target_operation_name) > 80
    or target_operation_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'A bounded native proposal RPC guard identity is required.';
  end if;

  insert into public.proposal_native_rpc_guards (
    backend_pid,
    transaction_id,
    operation_name,
    operation_key
  )
  values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    target_operation_name,
    target_operation_key
  )
  on conflict (backend_pid, transaction_id) do update
  set
    operation_name = excluded.operation_name,
    operation_key = excluded.operation_key,
    created_at = clock_timestamp();

  perform pg_catalog.set_config(
    'wtos.native_proposal_rpc_operation',
    target_operation_key::text,
    true
  );
end;
$$;

revoke all on function public.wtos_begin_native_proposal_rpc_guard(text, uuid)
from public, anon, authenticated, service_role;

create or replace function public.wtos_end_native_proposal_rpc_guard(
  target_operation_key uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_operation_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'A native proposal RPC guard key is required.';
  end if;

  delete from public.proposal_native_rpc_guards
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.txid_current()
    and operation_key = target_operation_key;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal RPC guard cleanup could not verify its exact transaction.';
  end if;

  perform pg_catalog.set_config('wtos.native_proposal_rpc_operation', '', true);
end;
$$;

revoke all on function public.wtos_end_native_proposal_rpc_guard(uuid)
from public, anon, authenticated, service_role;

create or replace function public.wtos_is_native_proposal_rpc_authorized()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.proposal_native_rpc_guards as rpc_guard
    where rpc_guard.backend_pid = pg_catalog.pg_backend_pid()
      and rpc_guard.transaction_id = pg_catalog.txid_current()
      and rpc_guard.operation_key::text = pg_catalog.current_setting(
        'wtos.native_proposal_rpc_operation',
        true
      )
  );
$$;

revoke all on function public.wtos_is_native_proposal_rpc_authorized()
from public, anon, authenticated, service_role;

create or replace function public.wtos_native_proposal_rpc_operation_is(
  target_operation_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.proposal_native_rpc_guards as rpc_guard
    where rpc_guard.backend_pid = pg_catalog.pg_backend_pid()
      and rpc_guard.transaction_id = pg_catalog.txid_current()
      and rpc_guard.operation_name = target_operation_name
      and rpc_guard.operation_key::text = pg_catalog.current_setting(
        'wtos.native_proposal_rpc_operation',
        true
      )
  );
$$;

revoke all on function public.wtos_native_proposal_rpc_operation_is(text)
from public, anon, authenticated, service_role;

create or replace function public.wtos_is_synthetic_proposal_cleanup_authorized()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.proposal_synthetic_cleanup_guards as cleanup_guard
    where cleanup_guard.backend_pid = pg_catalog.pg_backend_pid()
      and cleanup_guard.transaction_id = pg_catalog.txid_current()
      and cleanup_guard.operation_key::text = pg_catalog.current_setting(
        'wtos.synthetic_proposal_cleanup_operation',
        true
      )
  );
$$;

revoke all on function public.wtos_is_synthetic_proposal_cleanup_authorized()
from public, anon, authenticated, service_role;

create or replace function public.wtos_prevent_proposal_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'Proposal acceptance, audit, and receipt evidence is append-only.';
end;
$$;

revoke all on function public.wtos_prevent_proposal_evidence_mutation()
from public, anon, authenticated, service_role;

drop trigger if exists estimate_proposal_acceptances_append_only
on public.estimate_proposal_acceptances;
create trigger estimate_proposal_acceptances_append_only
before update or delete on public.estimate_proposal_acceptances
for each row execute function public.wtos_prevent_proposal_evidence_mutation();

drop trigger if exists proposal_audit_events_append_only
on public.proposal_audit_events;
create trigger proposal_audit_events_append_only
before update or delete on public.proposal_audit_events
for each row execute function public.wtos_prevent_proposal_evidence_mutation();

drop trigger if exists proposal_signature_receipts_append_only
on public.proposal_signature_receipts;
create trigger proposal_signature_receipts_append_only
before update or delete on public.proposal_signature_receipts
for each row execute function public.wtos_prevent_proposal_evidence_mutation();

create or replace function public.wtos_enforce_finalized_proposal_revision_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  immutable_old jsonb;
  immutable_new jsonb;
  mutable_keys text[] := array[
    'artifact_operation_key',
    'finalized_document_id',
    'accepted_signature_id',
    'accepted_acceptance_id',
    'signed_document_id',
    'status',
    'signature_status',
    'payment_status',
    'quickbooks_sync_status',
    'deposit_paid',
    'remaining_balance',
    'sent_at',
    'viewed_at',
    'accepted_at',
    'declined_at',
    'expires_at',
    'superseded_at',
    'updated_by',
    'updated_at'
  ];
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if (
      new.finalization_operation_key is not null
      or new.artifact_operation_key is not null
      or new.customer_snapshot is not null
      or new.revision_sha256 is not null
      or new.terms_sha256 is not null
      or new.finalized_at is not null
      or new.finalized_by is not null
      or new.finalized_document_id is not null
      or new.accepted_signature_id is not null
      or new.accepted_acceptance_id is not null
      or new.signed_document_id is not null
    ) and not public.wtos_is_native_proposal_rpc_authorized() then
      raise exception using
        errcode = 'P0001',
        message = 'Native finalized proposal evidence may be created only inside an approved atomic proposal RPC.';
    end if;
    return new;
  end if;

  if old.finalized_at is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if (
      new.finalization_operation_key is distinct from old.finalization_operation_key
      or new.customer_snapshot is distinct from old.customer_snapshot
      or new.revision_sha256 is distinct from old.revision_sha256
      or new.terms_sha256 is distinct from old.terms_sha256
      or new.finalized_at is distinct from old.finalized_at
      or new.finalized_by is distinct from old.finalized_by
    ) and not public.wtos_is_native_proposal_rpc_authorized() then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal finalization may occur only inside the approved atomic finalization RPC.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'Finalized proposal revisions cannot be deleted.';
  end if;

  if (
    new.artifact_operation_key is distinct from old.artifact_operation_key
    or new.finalized_document_id is distinct from old.finalized_document_id
    or new.accepted_signature_id is distinct from old.accepted_signature_id
    or new.accepted_acceptance_id is distinct from old.accepted_acceptance_id
    or new.signed_document_id is distinct from old.signed_document_id
    or new.status is distinct from old.status
    or new.signature_status is distinct from old.signature_status
    or new.payment_status is distinct from old.payment_status
    or new.quickbooks_sync_status is distinct from old.quickbooks_sync_status
    or new.deposit_paid is distinct from old.deposit_paid
    or new.remaining_balance is distinct from old.remaining_balance
    or new.sent_at is distinct from old.sent_at
    or new.viewed_at is distinct from old.viewed_at
    or new.accepted_at is distinct from old.accepted_at
    or new.declined_at is distinct from old.declined_at
    or new.expires_at is distinct from old.expires_at
    or new.superseded_at is distinct from old.superseded_at
    or new.updated_by is distinct from old.updated_by
  ) and not public.wtos_is_native_proposal_rpc_authorized() then
    raise exception using
      errcode = 'P0001',
      message = 'Finalized proposal lifecycle and evidence bindings may change only inside an approved atomic proposal RPC.';
  end if;

  immutable_old := to_jsonb(old) - mutable_keys;
  immutable_new := to_jsonb(new) - mutable_keys;

  if immutable_new is distinct from immutable_old then
    raise exception using
      errcode = 'P0001',
      message = 'Finalized proposal content and evidence bindings are immutable.';
  end if;

  if old.finalized_document_id is not null
    and new.finalized_document_id is distinct from old.finalized_document_id then
    raise exception using
      errcode = 'P0001',
      message = 'The finalized proposal document binding is immutable.';
  end if;

  if old.accepted_signature_id is not null
    and new.accepted_signature_id is distinct from old.accepted_signature_id then
    raise exception using
      errcode = 'P0001',
      message = 'The accepted proposal signature binding is immutable.';
  end if;

  if old.accepted_acceptance_id is not null
    and new.accepted_acceptance_id is distinct from old.accepted_acceptance_id then
    raise exception using
      errcode = 'P0001',
      message = 'The accepted proposal evidence binding is immutable.';
  end if;

  if old.signed_document_id is not null
    and new.signed_document_id is distinct from old.signed_document_id then
    raise exception using
      errcode = 'P0001',
      message = 'The signed proposal receipt binding is immutable.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_finalized_proposal_revision_immutability()
from public, anon, authenticated, service_role;

drop trigger if exists estimate_proposal_revisions_enforce_native_immutability
on public.estimate_proposal_revisions;
create trigger estimate_proposal_revisions_enforce_native_immutability
before insert or update or delete on public.estimate_proposal_revisions
for each row execute function public.wtos_enforce_finalized_proposal_revision_immutability();

create or replace function public.wtos_enforce_finalized_proposal_child_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_revision_is_finalized boolean := false;
  new_revision_is_finalized boolean := false;
  immutable_old jsonb;
  immutable_new jsonb;
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    select revision.finalized_at is not null
    into old_revision_is_finalized
    from public.estimate_proposal_revisions as revision
    where revision.id = old.proposal_revision_id;
  end if;

  if tg_op <> 'DELETE' then
    select revision.finalized_at is not null
    into new_revision_is_finalized
    from public.estimate_proposal_revisions as revision
    where revision.id = new.proposal_revision_id;
  end if;

  if not coalesce(old_revision_is_finalized, false)
    and not coalesce(new_revision_is_finalized, false) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and coalesce(old_revision_is_finalized, false)
    and new.proposal_revision_id is distinct from old.proposal_revision_id then
    raise exception using
      errcode = 'P0001',
      message = 'A finalized proposal child cannot be reparented to another revision.';
  end if;

  if tg_table_name = 'proposal_payment_schedules' and tg_op = 'UPDATE' then
    immutable_old := to_jsonb(old) - array['invoice_id', 'status', 'updated_at'];
    immutable_new := to_jsonb(new) - array['invoice_id', 'status', 'updated_at'];

    if new.proposal_revision_id is not distinct from old.proposal_revision_id
      and coalesce(old_revision_is_finalized, false)
      and coalesce(new_revision_is_finalized, false)
      and immutable_new is not distinct from immutable_old
      and public.wtos_is_native_proposal_rpc_authorized() then
      return new;
    end if;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'Finalized proposal sections, options, and payment terms are immutable.';
end;
$$;

revoke all on function public.wtos_enforce_finalized_proposal_child_immutability()
from public, anon, authenticated, service_role;

drop trigger if exists estimate_proposal_sections_enforce_native_immutability
on public.estimate_proposal_sections;
create trigger estimate_proposal_sections_enforce_native_immutability
before insert or update or delete on public.estimate_proposal_sections
for each row execute function public.wtos_enforce_finalized_proposal_child_immutability();

drop trigger if exists estimate_proposal_options_enforce_native_immutability
on public.estimate_proposal_options;
create trigger estimate_proposal_options_enforce_native_immutability
before insert or update or delete on public.estimate_proposal_options
for each row execute function public.wtos_enforce_finalized_proposal_child_immutability();

drop trigger if exists proposal_payment_schedules_enforce_native_immutability
on public.proposal_payment_schedules;
create trigger proposal_payment_schedules_enforce_native_immutability
before insert or update or delete on public.proposal_payment_schedules
for each row execute function public.wtos_enforce_finalized_proposal_child_immutability();

create or replace function public.wtos_enforce_native_proposal_document_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if old.proposal_revision_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal artifacts cannot be deleted.';
  end if;

  if new.status is distinct from old.status
    and not public.wtos_is_native_proposal_rpc_authorized() then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal artifact lifecycle may change only inside an approved atomic proposal RPC.';
  end if;

  if (to_jsonb(new) - array['status', 'updated_at'])
    is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal artifact bytes, digest, path, and scope are immutable.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_native_proposal_document_immutability()
from public, anon, authenticated, service_role;

drop trigger if exists documents_enforce_native_proposal_immutability
on public.documents;
create trigger documents_enforce_native_proposal_immutability
before update or delete on public.documents
for each row execute function public.wtos_enforce_native_proposal_document_immutability();

create or replace function public.wtos_validate_native_proposal_document_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.proposal_revision_id is null then
    return new;
  end if;

  if not public.wtos_is_native_proposal_rpc_authorized() then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal artifact bindings may be created only inside an approved atomic proposal RPC.';
  end if;

  if not exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = new.proposal_revision_id
      and revision.company_id = new.company_id
      and revision.estimate_id = new.estimate_id
      and revision.customer_id is not distinct from new.customer_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal document company, estimate, customer, and revision must match exactly.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_validate_native_proposal_document_scope()
from public, anon, authenticated, service_role;

drop trigger if exists documents_validate_native_proposal_scope on public.documents;
drop trigger if exists documents_validate_native_proposal_scope_insert on public.documents;
drop trigger if exists documents_validate_native_proposal_scope_update on public.documents;
create trigger documents_validate_native_proposal_scope_insert
before insert on public.documents
for each row execute function public.wtos_validate_native_proposal_document_scope();

create trigger documents_validate_native_proposal_scope_update
before update of
  company_id,
  customer_id,
  estimate_id,
  proposal_revision_id,
  category,
  storage_bucket,
  storage_path,
  content_sha256
on public.documents
for each row execute function public.wtos_validate_native_proposal_document_scope();

create or replace function public.wtos_enforce_native_proposal_signature_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_document_revision_id uuid;
  new_document_revision_id uuid;
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    select document.proposal_revision_id
    into new_document_revision_id
    from public.documents as document
    where document.id = new.document_id
      and document.proposal_revision_id is not null
      and document.category in ('proposal', 'signed_proposal');

    if new.proposal_revision_id is null and new_document_revision_id is null then
      return new;
    end if;

    if new.proposal_revision_id is distinct from new_document_revision_id
      or not public.wtos_is_native_proposal_rpc_authorized()
      or new.provider is distinct from 'native'
      or new.signature_method is distinct from 'typed_name'
      or new.status is distinct from 'pending'
      or new.employee_id is not null
      or new.change_order_id is not null
      or new.acceptance_id is not null
      or new.signed_document_id is not null
      or new.signature_data is not null
      or new.signed_at is not null
      or new.evidence_sha256 is not null
      or not exists (
        select 1
        from public.estimate_proposal_revisions as revision
        join public.documents as document
          on document.id = new.document_id
         and document.proposal_revision_id = revision.id
         and document.company_id = revision.company_id
         and document.customer_id is not distinct from revision.customer_id
         and document.estimate_id = revision.estimate_id
         and document.category = 'proposal'
         and document.storage_bucket = 'customer-documents'
         and document.file_url is null
         and document.immutable_after_at is not null
        where revision.id = new.proposal_revision_id
          and revision.company_id = new.company_id
          and revision.customer_id is not distinct from new.customer_id
          and revision.finalized_document_id = document.id
          and revision.finalized_at is not null
          and revision.accepted_acceptance_id is null
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'Native proposal signatures may be created only by the approved atomic signing-request RPC for an exact immutable proposal artifact.';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    select document.proposal_revision_id
    into old_document_revision_id
    from public.documents as document
    where document.id = old.document_id
      and document.proposal_revision_id is not null
      and document.category in ('proposal', 'signed_proposal');

    if old.proposal_revision_id is null and old_document_revision_id is null then
      return old;
    end if;

    if old.proposal_revision_id is distinct from old_document_revision_id then
      raise exception using
        errcode = 'P0001',
        message = 'Every signature referencing a native proposal artifact must carry the exact proposal revision binding.';
    end if;

    raise exception using
      errcode = 'P0001',
      message = 'Native proposal signature evidence cannot be deleted.';
  end if;

  select document.proposal_revision_id
  into old_document_revision_id
  from public.documents as document
  where document.id = old.document_id
    and document.proposal_revision_id is not null
    and document.category in ('proposal', 'signed_proposal');

  select document.proposal_revision_id
  into new_document_revision_id
  from public.documents as document
  where document.id = new.document_id
    and document.proposal_revision_id is not null
    and document.category in ('proposal', 'signed_proposal');

  if old.proposal_revision_id is null
    and new.proposal_revision_id is null
    and old_document_revision_id is null
    and new_document_revision_id is null then
    return new;
  end if;

  if old.proposal_revision_id is distinct from old_document_revision_id
    or new.proposal_revision_id is distinct from new_document_revision_id then
    raise exception using
      errcode = 'P0001',
      message = 'Every signature referencing a native proposal artifact must carry the exact proposal revision binding.';
  end if;

  if old.proposal_revision_id is null
    or new.proposal_revision_id is distinct from old.proposal_revision_id
    or not public.wtos_is_native_proposal_rpc_authorized() then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal signature lifecycle may change only inside an approved atomic proposal RPC.';
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.customer_id is distinct from old.customer_id
    or new.employee_id is distinct from old.employee_id
    or new.document_id is distinct from old.document_id
    or new.change_order_id is distinct from old.change_order_id
    or new.provider is distinct from old.provider
    or new.provider_envelope_id is distinct from old.provider_envelope_id
    or new.signature_method is distinct from old.signature_method
    or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal signature identity, scope, provider, method, and source document are immutable.';
  end if;

  if old.status = 'signed'
    or old.acceptance_id is not null
    or old.evidence_sha256 is not null then
    if new.status <> 'signed'
      or (to_jsonb(new) - array['signed_document_id', 'updated_at'])
        is distinct from (to_jsonb(old) - array['signed_document_id', 'updated_at'])
      or (
        old.signed_document_id is not null
        and new.signed_document_id is distinct from old.signed_document_id
      )
      or (
        new.signed_document_id is not null
        and not exists (
          select 1
          from public.proposal_signature_receipts as receipt
          where receipt.signature_id = old.id
            and receipt.proposal_revision_id = old.proposal_revision_id
            and receipt.acceptance_id = old.acceptance_id
            and receipt.signed_document_id = new.signed_document_id
            and receipt.company_id = old.company_id
            and receipt.evidence_sha256 = old.evidence_sha256
        )
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'Signed native proposal signature identity and evidence are immutable.';
    end if;

    return new;
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('sent', 'failed', 'revoked', 'superseded', 'expired'))
    or (old.status = 'sent' and new.status in ('viewed', 'signed', 'declined', 'failed', 'revoked', 'superseded', 'expired'))
    or (old.status = 'viewed' and new.status in ('signed', 'declined', 'failed', 'revoked', 'superseded', 'expired'))
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Invalid native proposal signature lifecycle transition.';
  end if;

  if new.status = 'signed' then
    if new.acceptance_id is null
      or new.evidence_sha256 is null
      or new.signed_at is null
      or new.signature_data is distinct from '/s/ ' || new.signer_name
      or new.signed_document_id is not null
      or new.signer_name is distinct from old.signer_name
      or lower(btrim(new.signer_email)) is distinct from lower(btrim(old.signer_email))
      or not exists (
        select 1
        from public.estimate_proposal_acceptances as acceptance
        where acceptance.id = new.acceptance_id
          and acceptance.signature_id = new.id
          and acceptance.proposal_revision_id = new.proposal_revision_id
          and acceptance.company_id = new.company_id
          and acceptance.customer_id is not distinct from new.customer_id
          and acceptance.signer_name = new.signer_name
          and lower(acceptance.signer_email) = lower(new.signer_email)
          and acceptance.acceptance_method = 'native_electronic'
          and acceptance.signature_status = 'signed'
          and acceptance.evidence_sha256 = new.evidence_sha256
          and acceptance.accepted_at = new.signed_at
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'A signed native proposal signature must match the exact immutable acceptance evidence.';
    end if;
  elsif new.acceptance_id is not null
    or new.evidence_sha256 is not null
    or new.signed_document_id is not null
    or new.signature_data is not null
    or new.signed_at is not null
    or new.signer_name is distinct from old.signer_name
    or new.signer_email is distinct from old.signer_email then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal signature evidence may be attached only by the exact atomic acceptance RPC.';
  end if;

  if (new.status = 'sent' and new.sent_at is null)
    or (new.status = 'viewed' and new.viewed_at is null)
    or (new.status = 'declined' and new.declined_at is null) then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal signature lifecycle timestamps must match the exact state transition.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_native_proposal_signature_immutability()
from public, anon, authenticated, service_role;

drop trigger if exists signatures_enforce_native_proposal_immutability
on public.signatures;
create trigger signatures_enforce_native_proposal_immutability
before insert or update or delete on public.signatures
for each row execute function public.wtos_enforce_native_proposal_signature_immutability();

create or replace function public.wtos_validate_proposal_signing_request_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.estimate_proposal_revisions as revision
    join public.documents as document
      on document.id = new.proposal_document_id
     and document.proposal_revision_id = revision.id
     and document.company_id = revision.company_id
     and document.estimate_id = revision.estimate_id
     and document.customer_id is not distinct from revision.customer_id
    join public.signatures as signature
      on signature.id = new.signature_id
     and signature.proposal_revision_id = revision.id
     and signature.company_id = revision.company_id
     and signature.customer_id is not distinct from revision.customer_id
     and signature.document_id = document.id
    where revision.id = new.proposal_revision_id
      and revision.company_id = new.company_id
      and revision.estimate_id = new.estimate_id
      and revision.customer_id = new.customer_id
      and revision.finalized_document_id = document.id
      and revision.revision_sha256 = new.revision_sha256
      and revision.terms_sha256 = new.terms_sha256
      and document.content_sha256 = new.document_sha256
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Signing request company, customer, revision, signature, document, and digests must match exactly.';
  end if;

  if encode(extensions.digest(convert_to(new.consent_text, 'UTF8'), 'sha256'), 'hex')
    is distinct from new.consent_sha256 then
    raise exception using
      errcode = 'P0001',
      message = 'Electronic-record consent digest does not match the preserved disclosure.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_validate_proposal_signing_request_scope()
from public, anon, authenticated, service_role;

drop trigger if exists proposal_signing_requests_validate_scope
on public.proposal_signing_requests;
create trigger proposal_signing_requests_validate_scope
before insert or update on public.proposal_signing_requests
for each row execute function public.wtos_validate_proposal_signing_request_scope();

create or replace function public.wtos_enforce_proposal_signing_request_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized()
    and old.request_token_consumed_at is not null
    and old.request_token_consumed_session_id is not null
    and new.request_token_consumed_at is null
    and new.request_token_consumed_session_id is null
    and (to_jsonb(new) - array[
      'request_token_consumed_at',
      'request_token_consumed_session_id'
    ]) is not distinct from (to_jsonb(old) - array[
      'request_token_consumed_at',
      'request_token_consumed_session_id'
    ]) then
    return new;
  end if;

  if (to_jsonb(new) - array[
      'status',
      'request_token_consumed_at',
      'request_token_consumed_session_id',
      'delivery_email_message_id',
      'delivery_provider_message_id',
      'failure_code',
      'revocation_reason',
      'sent_at',
      'first_viewed_at',
      'signed_at',
      'declined_at',
      'failed_at',
      'revoked_at',
      'superseded_at',
      'exchange_attempt_count',
      'exchange_window_started_at',
      'exchange_blocked_until',
      'session_read_attempt_count',
      'session_read_window_started_at',
      'session_read_blocked_until',
      'action_attempt_count',
      'action_window_started_at',
      'action_blocked_until',
      'updated_at'
    ]) is distinct from (to_jsonb(old) - array[
      'status',
      'request_token_consumed_at',
      'request_token_consumed_session_id',
      'delivery_email_message_id',
      'delivery_provider_message_id',
      'failure_code',
      'revocation_reason',
      'sent_at',
      'first_viewed_at',
      'signed_at',
      'declined_at',
      'failed_at',
      'revoked_at',
      'superseded_at',
      'exchange_attempt_count',
      'exchange_window_started_at',
      'exchange_blocked_until',
      'session_read_attempt_count',
      'session_read_window_started_at',
      'session_read_blocked_until',
      'action_attempt_count',
      'action_window_started_at',
      'action_blocked_until',
      'updated_at'
    ]) then
    raise exception using
      errcode = 'P0001',
      message = 'Signing request scope, token digest, evidence digests, signer, consent, and expiry are immutable.';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'prepared' and new.status in ('sent', 'failed', 'revoked', 'superseded', 'expired'))
    or (old.status = 'sent' and new.status in ('viewed', 'signed', 'declined', 'failed', 'revoked', 'superseded', 'expired'))
    or (old.status = 'viewed' and new.status in ('signed', 'declined', 'failed', 'revoked', 'superseded', 'expired'))
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Invalid signing request lifecycle transition.';
  end if;

  if old.request_token_consumed_at is not null
    and (
      new.request_token_consumed_at is distinct from old.request_token_consumed_at
      or new.request_token_consumed_session_id is distinct from old.request_token_consumed_session_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Signing request token consumption evidence is immutable.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_proposal_signing_request_transition()
from public, anon, authenticated, service_role;

drop trigger if exists proposal_signing_requests_enforce_transition
on public.proposal_signing_requests;
create trigger proposal_signing_requests_enforce_transition
before update on public.proposal_signing_requests
for each row execute function public.wtos_enforce_proposal_signing_request_transition();

create or replace function public.wtos_validate_proposal_signing_session_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.proposal_signing_requests as signing_request
    where signing_request.id = new.signing_request_id
      and signing_request.company_id = new.company_id
      and new.expires_at <= signing_request.expires_at
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Signing session must remain inside its exact request and company scope.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_validate_proposal_signing_session_scope()
from public, anon, authenticated, service_role;

drop trigger if exists proposal_signing_sessions_validate_scope
on public.proposal_signing_sessions;
create trigger proposal_signing_sessions_validate_scope
before insert or update on public.proposal_signing_sessions
for each row execute function public.wtos_validate_proposal_signing_session_scope();

create or replace function public.wtos_enforce_proposal_signing_session_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array[
      'status',
      'last_seen_at',
      'signed_at',
      'declined_at',
      'revoked_at',
      'updated_at'
    ]) is distinct from (to_jsonb(old) - array[
      'status',
      'last_seen_at',
      'signed_at',
      'declined_at',
      'revoked_at',
      'updated_at'
    ]) then
    raise exception using
      errcode = 'P0001',
      message = 'Signing session request, company, token digest, and expiry are immutable.';
  end if;

  if new.status is distinct from old.status and not (
    old.status = 'active'
    and new.status in ('signed', 'declined', 'revoked', 'expired')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Invalid signing session lifecycle transition.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_proposal_signing_session_transition()
from public, anon, authenticated, service_role;

drop trigger if exists proposal_signing_sessions_enforce_transition
on public.proposal_signing_sessions;
create trigger proposal_signing_sessions_enforce_transition
before update on public.proposal_signing_sessions
for each row execute function public.wtos_enforce_proposal_signing_session_transition();

create or replace function public.wtos_scrub_proposal_customer_text(
  source_text text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    coalesce(
      string_agg(
        source_line.line_value,
        E'\n'
        order by source_line.line_number
      ) filter (
        where source_line.line_value !~* E'\\y(cost|margin|markup|commission|profit|private|internal|labor rate|supplier cost)\\y'
      ),
      ''
    ),
    E' \t\n\r\f\v'
  )
  from regexp_split_to_table(coalesce(source_text, ''), E'\r?\n')
    with ordinality as source_line(line_value, line_number);
$$;

revoke all on function public.wtos_scrub_proposal_customer_text(text)
from public, anon, authenticated, service_role;

create or replace function public.wtos_native_proposal_source_is_current(
  target_revision_id uuid,
  target_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_revision public.estimate_proposal_revisions%rowtype;
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_estimate public.estimates%rowtype;
  selected_company public.companies%rowtype;
  selected_customer public.customers%rowtype;
  selected_property public.properties%rowtype;
  current_customer_name text;
  current_property_address text;
  current_line_items jsonb;
begin
  select revision.* into initial_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = target_revision_id
    and revision.company_id = target_company_id;

  if initial_revision.id is null
    or initial_revision.finalization_operation_key is null
    or initial_revision.finalized_at is null
    or jsonb_typeof(initial_revision.source_snapshot) <> 'object' then
    return false;
  end if;

  -- Match finalization's estimate-first lock order. This parent-row lock also
  -- prevents a concurrent FK-linked line insert while the exact source graph
  -- and versions are revalidated for delivery.
  select estimate.* into selected_estimate
  from public.estimates as estimate
  where estimate.id = initial_revision.estimate_id
    and estimate.company_id = target_company_id
  for update;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = target_revision_id
    and revision.company_id = target_company_id
    and revision.estimate_id = selected_estimate.id
  for share;

  perform line_item.id
  from public.estimate_line_items as line_item
  where line_item.estimate_id = selected_estimate.id
  order by line_item.id
  for share;

  select company.* into selected_company
  from public.companies as company
  where company.id = target_company_id
  for share;

  select customer.* into selected_customer
  from public.customers as customer
  where customer.id = selected_revision.customer_id
    and customer.company_id = target_company_id
  for share;

  if selected_revision.property_id is not null then
    select property.* into selected_property
    from public.properties as property
    where property.id = selected_revision.property_id
      and property.company_id = target_company_id
      and property.customer_id is not distinct from selected_revision.customer_id
    for share;
  end if;

  current_customer_name := coalesce(
    nullif(btrim(selected_customer.display_name), ''),
    nullif(btrim(selected_customer.contact_name), '')
  );
  current_property_address := coalesce(
    nullif(btrim(selected_property.address), ''),
    nullif(btrim(selected_estimate.location), ''),
    nullif(btrim(selected_customer.property_address), '')
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', line_item.id,
        'name', public.wtos_scrub_proposal_customer_text(line_item.name),
        'description', nullif(
          public.wtos_scrub_proposal_customer_text(line_item.description),
          ''
        ),
        'quantity', line_item.quantity,
        'unit', public.wtos_scrub_proposal_customer_text(line_item.unit),
        'total', line_item.total,
        'sortOrder', line_item.sort_order,
        'updatedAt', line_item.updated_at
      )
      order by line_item.sort_order, line_item.id
    ),
    '[]'::jsonb
  )
  into current_line_items
  from public.estimate_line_items as line_item
  where line_item.estimate_id = selected_estimate.id;

  return selected_revision.id is not null
    and selected_estimate.id is not null
    and selected_company.id is not null
    and selected_customer.id is not null
    and selected_revision.status in (
      'approved_internally',
      'ready_to_send',
      'sent',
      'viewed'
    )
    and selected_revision.accepted_acceptance_id is null
    and selected_revision.customer_id is not distinct from selected_estimate.customer_id
    and selected_revision.lead_id is not distinct from selected_estimate.lead_id
    and selected_revision.property_id is not distinct from selected_estimate.property_id
    and selected_revision.source_snapshot ->> 'sourceFingerprint'
      is not distinct from selected_revision.finalization_operation_key::text
    and nullif(
      selected_revision.source_snapshot ->> 'sourceCompanyUpdatedAt',
      ''
    )::timestamptz is not distinct from selected_company.updated_at
    and nullif(
      selected_revision.source_snapshot ->> 'sourceEstimateUpdatedAt',
      ''
    )::timestamptz is not distinct from selected_estimate.updated_at
    and nullif(
      selected_revision.source_snapshot ->> 'sourceCustomerId',
      ''
    )::uuid is not distinct from selected_customer.id
    and nullif(
      selected_revision.source_snapshot ->> 'sourceCustomerUpdatedAt',
      ''
    )::timestamptz is not distinct from selected_customer.updated_at
    and selected_revision.source_snapshot ->> 'sourceCustomerName'
      is not distinct from current_customer_name
    and nullif(
      selected_revision.source_snapshot ->> 'sourcePropertyId',
      ''
    )::uuid is not distinct from selected_property.id
    and nullif(
      selected_revision.source_snapshot ->> 'sourcePropertyUpdatedAt',
      ''
    )::timestamptz is not distinct from selected_property.updated_at
    and selected_revision.source_snapshot ->> 'sourcePropertyAddress'
      is not distinct from current_property_address
    and selected_revision.source_snapshot -> 'sourceLineItems'
      is not distinct from current_line_items;
end;
$$;

revoke all on function public.wtos_native_proposal_source_is_current(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.wtos_enforce_finalized_proposal_estimate_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    return new;
  end if;

  if new.company_id is not distinct from old.company_id
    and new.customer_id is not distinct from old.customer_id
    and new.lead_id is not distinct from old.lead_id
    and new.property_id is not distinct from old.property_id then
    return new;
  end if;

  -- Never move a finalized proposal graph across companies. Unsigned customer,
  -- lead, and property corrections remain possible below; the old immutable
  -- revision then becomes source-stale and cannot be delivered.
  if new.company_id is distinct from old.company_id and exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.estimate_id = old.id
      and revision.company_id = old.company_id
      and revision.finalization_operation_key is not null
      and revision.finalized_at is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'An estimate with a finalized native proposal cannot be reassigned to another company.';
  end if;

  -- Customer/property corrections are allowed only before customer activity.
  -- Once signed evidence exists, or a request/session/email is active or has an
  -- unresolved provider outcome, the source identity is permanently bound.
  if exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.estimate_id = old.id
      and revision.company_id = old.company_id
      and revision.finalization_operation_key is not null
      and revision.finalized_at is not null
      and (
        revision.accepted_acceptance_id is not null
        or revision.accepted_signature_id is not null
        or revision.signature_status = 'signed'
        or revision.status in ('accepted', 'converted_to_job')
        or exists (
          select 1
          from public.proposal_signing_requests as signing_request
          where signing_request.proposal_revision_id = revision.id
            and signing_request.company_id = revision.company_id
            and (
              signing_request.status in ('prepared', 'sent', 'viewed')
              or exists (
                select 1
                from public.proposal_signing_sessions as session
                where session.signing_request_id = signing_request.id
                  and session.company_id = signing_request.company_id
                  and session.status = 'active'
              )
            )
        )
        or exists (
          select 1
          from public.email_messages as email
          where email.company_id = revision.company_id
            and email.metadata ->> 'draftType'
              = 'proposal_signature_request'
            and email.metadata ->> 'proposalRevisionId' = revision.id::text
            and (
              email.status in ('draft', 'queued')
              or email.sync_status in ('local', 'queued', 'syncing')
              or email.metadata ->> 'gmailDeliveryState'
                = 'provider_outcome_unknown'
            )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'A customer-active, provider-in-flight, signed, or converted native proposal estimate cannot be reassigned to another customer, lead, or property.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_finalized_proposal_estimate_identity()
from public, anon, authenticated, service_role;

drop trigger if exists estimates_enforce_finalized_proposal_identity
on public.estimates;
create trigger estimates_enforce_finalized_proposal_identity
before update of company_id, customer_id, lead_id, property_id
on public.estimates
for each row execute function public.wtos_enforce_finalized_proposal_estimate_identity();

create or replace function public.wtos_finalize_proposal_revision(
  finalization_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(finalization_request ->> 'operationKey', '')::uuid;
  request_actor_user_id uuid := nullif(finalization_request ->> 'actorUserId', '')::uuid;
  request_company_id uuid := nullif(finalization_request ->> 'companyId', '')::uuid;
  request_estimate_id uuid := nullif(finalization_request ->> 'estimateId', '')::uuid;
  request_source_company_updated_at timestamptz := nullif(
    finalization_request ->> 'sourceCompanyUpdatedAt',
    ''
  )::timestamptz;
  request_source_estimate_updated_at timestamptz := nullif(
    finalization_request ->> 'sourceEstimateUpdatedAt',
    ''
  )::timestamptz;
  request_source_customer_id uuid := nullif(
    finalization_request ->> 'sourceCustomerId',
    ''
  )::uuid;
  request_source_customer_updated_at timestamptz := nullif(
    finalization_request ->> 'sourceCustomerUpdatedAt',
    ''
  )::timestamptz;
  request_source_customer_name text := nullif(
    btrim(finalization_request ->> 'sourceCustomerName'),
    ''
  );
  request_source_property_id uuid := nullif(
    finalization_request ->> 'sourcePropertyId',
    ''
  )::uuid;
  request_source_property_updated_at timestamptz := nullif(
    finalization_request ->> 'sourcePropertyUpdatedAt',
    ''
  )::timestamptz;
  request_source_property_address text := nullif(
    btrim(finalization_request ->> 'sourcePropertyAddress'),
    ''
  );
  request_source_line_items jsonb := coalesce(
    finalization_request -> 'sourceLineItems',
    '[]'::jsonb
  );
  request_template_id uuid := nullif(finalization_request ->> 'templateId', '')::uuid;
  request_proposal_number text := nullif(btrim(finalization_request ->> 'proposalNumber'), '');
  request_title text := nullif(btrim(finalization_request ->> 'title'), '');
  request_brand_name text := nullif(btrim(finalization_request ->> 'brandName'), '');
  request_brand_primary_color text := nullif(btrim(finalization_request ->> 'brandPrimaryColor'), '');
  request_brand_accent_color text := nullif(btrim(finalization_request ->> 'brandAccentColor'), '');
  request_base_subtotal numeric := coalesce((finalization_request ->> 'baseSubtotal')::numeric, 0);
  request_discount_total numeric := coalesce((finalization_request ->> 'discountTotal')::numeric, 0);
  request_tax_total numeric := coalesce((finalization_request ->> 'taxTotal')::numeric, 0);
  request_fee_total numeric := coalesce((finalization_request ->> 'feeTotal')::numeric, 0);
  request_base_total numeric := coalesce((finalization_request ->> 'baseTotal')::numeric, 0);
  request_deposit_type text := coalesce(nullif(finalization_request ->> 'depositType', ''), 'none');
  request_deposit_value numeric := coalesce((finalization_request ->> 'depositValue')::numeric, 0);
  request_deposit_required boolean := coalesce((finalization_request ->> 'depositRequired')::boolean, false);
  request_deposit_before_job boolean := coalesce((finalization_request ->> 'requiresDepositBeforeJob')::boolean, false);
  request_customer_visible_notes text := nullif(finalization_request ->> 'customerVisibleNotes', '');
  request_terms text := coalesce(finalization_request ->> 'terms', '');
  request_sections jsonb := coalesce(finalization_request -> 'sections', '[]'::jsonb);
  request_options jsonb := coalesce(finalization_request -> 'options', '[]'::jsonb);
  request_selected_option_ids uuid[] := '{}';
  existing_revision public.estimate_proposal_revisions%rowtype;
  selected_estimate public.estimates%rowtype;
  selected_company public.companies%rowtype;
  selected_customer public.customers%rowtype;
  selected_property public.properties%rowtype;
  revision_id uuid := gen_random_uuid();
  revision_number integer;
  section_item jsonb;
  option_item jsonb;
  option_quantity numeric;
  option_price numeric;
  option_base_replacement_amount numeric;
  locked_line_item_count bigint := 0;
  source_line_item_count bigint := 0;
  stored_line_totals_match boolean := false;
  source_base_subtotal numeric := 0;
  source_labor_total numeric := 0;
  source_material_total numeric := 0;
  source_taxable_subtotal numeric := 0;
  source_discount_total numeric := 0;
  source_tax_total numeric := 0;
  source_profit_margin_total numeric := 0;
  source_base_total numeric := 0;
  selected_option_count integer;
  full_alternate_count integer;
  full_alternate_total numeric(12, 2);
  calculated_accepted_total numeric(12, 2);
  calculated_selected_upgrades_total numeric(12, 2) := 0;
  calculated_required_deposit_amount numeric(12, 2) := 0;
  canonical_customer_snapshot jsonb;
  locked_source_line_items jsonb;
  revision_digest text;
  terms_digest text;
  finalized_time timestamptz := clock_timestamp();
  property_address text;
begin
  if finalization_request is null or jsonb_typeof(finalization_request) <> 'object' then
    raise exception using errcode = 'P0001', message = 'Finalization request must be a JSON object.';
  end if;

  if request_operation_key is null
    or request_actor_user_id is null
    or request_company_id is null
    or request_estimate_id is null
    or request_source_company_updated_at is null
    or request_source_estimate_updated_at is null
    or request_source_customer_id is null
    or request_source_customer_updated_at is null
    or request_source_customer_name is null
    or request_source_property_address is null
    or not (finalization_request ? 'sourcePropertyId')
    or not (finalization_request ? 'sourcePropertyUpdatedAt')
    or jsonb_typeof(request_source_line_items) <> 'array'
    or request_proposal_number is null
    or request_title is null
    or request_brand_name is null then
    raise exception using errcode = 'P0001', message = 'Finalization identifiers and customer-facing proposal identity are required.';
  end if;

  if nullif(btrim(request_terms), '') is null then
    raise exception using
      errcode = 'P0001',
      message = 'Customer-visible proposal terms are required before immutable finalization.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);

  select revision.*
  into existing_revision
  from public.estimate_proposal_revisions as revision
  where revision.finalization_operation_key = request_operation_key;

  if existing_revision.id is not null then
    if existing_revision.company_id is distinct from request_company_id
      or existing_revision.estimate_id is distinct from request_estimate_id then
      raise exception using errcode = 'P0001', message = 'Finalization idempotency key conflicts with another proposal.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'finalized',
      'proposalStatus', existing_revision.status,
      'proposalRevisionId', existing_revision.id,
      'revisionNumber', existing_revision.revision_number,
      'revisionSha256', existing_revision.revision_sha256,
      'termsSha256', existing_revision.terms_sha256,
      'customerSnapshot', existing_revision.customer_snapshot,
      'documentId', existing_revision.finalized_document_id,
      'documentSha256', (
        select document.content_sha256
        from public.documents as document
        where document.id = existing_revision.finalized_document_id
      )
    );
  end if;

  select estimate.*
  into selected_estimate
  from public.estimates as estimate
  where estimate.id = request_estimate_id
    and estimate.company_id = request_company_id
  for update;

  if selected_estimate.id is null or selected_estimate.customer_id is null then
    raise exception using errcode = 'P0001', message = 'A company-scoped estimate with a customer is required for finalization.';
  end if;

  if selected_estimate.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'Only an owner-approved estimate can be finalized as an immutable proposal.';
  end if;

  -- A concurrent identical finalization waits on the estimate lock above.
  -- Re-read the operation key after that serialization point so response-loss
  -- and double-submit retries converge on the first immutable revision rather
  -- than surfacing the unique constraint as a false failure.
  select revision.*
  into existing_revision
  from public.estimate_proposal_revisions as revision
  where revision.finalization_operation_key = request_operation_key;

  if existing_revision.id is not null then
    if existing_revision.company_id is distinct from request_company_id
      or existing_revision.estimate_id is distinct from request_estimate_id then
      raise exception using errcode = 'P0001', message = 'Finalization idempotency key conflicts with another proposal.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'finalized',
      'proposalStatus', existing_revision.status,
      'proposalRevisionId', existing_revision.id,
      'revisionNumber', existing_revision.revision_number,
      'revisionSha256', existing_revision.revision_sha256,
      'termsSha256', existing_revision.terms_sha256,
      'customerSnapshot', existing_revision.customer_snapshot,
      'documentId', existing_revision.finalized_document_id,
      'documentSha256', (
        select document.content_sha256
        from public.documents as document
        where document.id = existing_revision.finalized_document_id
      )
    );
  end if;

  -- Every operation that can activate or replace a native proposal first
  -- serializes on the parent estimate. Lock request rows only after that
  -- common boundary so prepare/finalize races cannot create a request for a
  -- revision that this transaction is about to supersede.
  perform 1
  from public.proposal_signing_requests as signing_request
  join public.estimate_proposal_revisions as prior_revision
    on prior_revision.id = signing_request.proposal_revision_id
   and prior_revision.company_id = signing_request.company_id
  where prior_revision.estimate_id = request_estimate_id
    and prior_revision.company_id = request_company_id
    and signing_request.status in ('prepared', 'sent', 'viewed')
  order by signing_request.id
  for update of signing_request;

  -- A Gmail provider call can outlive its initiating HTTP request. Freeze all
  -- exact signature-email rows after the estimate/request locks, then refuse
  -- supersession whenever provider outcome is in-flight, unknown, or already
  -- confirmed but not fully reconciled. Plain token-free unsent drafts remain
  -- cancelable and cannot become deliverable after supersession.
  perform email.id
  from public.email_messages as email
  join public.estimate_proposal_revisions as prior_revision
    on email.metadata ->> 'proposalRevisionId' = prior_revision.id::text
   and email.company_id = prior_revision.company_id
  where prior_revision.estimate_id = request_estimate_id
    and prior_revision.company_id = request_company_id
    and email.metadata ->> 'draftType' = 'proposal_signature_request'
  order by email.id
  for update of email;

  if exists (
    select 1
    from public.email_messages as email
    join public.estimate_proposal_revisions as prior_revision
      on email.metadata ->> 'proposalRevisionId' = prior_revision.id::text
     and email.company_id = prior_revision.company_id
    where prior_revision.estimate_id = request_estimate_id
      and prior_revision.company_id = request_company_id
      and email.metadata ->> 'draftType' = 'proposal_signature_request'
      and (
        email.sync_status = 'syncing'
        or (
          (
            email.status = 'sent'
            or email.sync_status = 'sent'
            or nullif(email.gmail_message_id, '') is not null
            or nullif(email.gmail_thread_id, '') is not null
            or email.sent_at is not null
            or email.metadata ->> 'gmailDeliveryState' = 'provider_confirmed'
          )
          and not exists (
            select 1
            from public.proposal_signing_requests as terminal_request
            where terminal_request.id::text
                = email.metadata ->> 'proposalSigningRequestId'
              and terminal_request.company_id = email.company_id
              and terminal_request.proposal_revision_id = prior_revision.id
              and terminal_request.delivery_email_message_id = email.id
              and terminal_request.status in (
                'revoked',
                'declined',
                'failed',
                'expired',
                'superseded'
              )
              and not exists (
                select 1
                from public.proposal_signing_sessions as terminal_session
                where terminal_session.signing_request_id = terminal_request.id
                  and terminal_session.company_id = terminal_request.company_id
                  and terminal_session.status = 'active'
              )
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal delivery is in progress or provider-confirmed and must be reconciled before finalizing a replacement revision.';
  end if;

  -- The parent estimate FOR UPDATE blocks new FK-linked children while these
  -- ordered row locks freeze every existing source line through transaction end.
  perform line_item.id
  from public.estimate_line_items as line_item
  where line_item.estimate_id = request_estimate_id
  order by line_item.id
  for update;
  get diagnostics locked_line_item_count = row_count;

  if locked_line_item_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'At least one deterministically locked estimate line item is required before proposal finalization.';
  end if;

  select company.* into selected_company
  from public.companies as company
  where company.id = request_company_id
  for share;

  select customer.* into selected_customer
  from public.customers as customer
  where customer.id = selected_estimate.customer_id
    and customer.company_id = request_company_id
  for share;

  if selected_company.id is null or selected_customer.id is null then
    raise exception using errcode = 'P0001', message = 'Proposal company and customer scope could not be verified.';
  end if;

  if selected_estimate.property_id is not null then
    select property.* into selected_property
    from public.properties as property
    where property.id = selected_estimate.property_id
      and property.company_id = request_company_id
      and property.customer_id is not distinct from selected_estimate.customer_id
    for share;

    if selected_property.id is null then
      raise exception using errcode = 'P0001', message = 'Proposal property must belong to the exact company and customer.';
    end if;
  end if;

  property_address := coalesce(
    nullif(btrim(selected_property.address), ''),
    nullif(btrim(selected_estimate.location), ''),
    nullif(btrim(selected_customer.property_address), '')
  );

  if property_address is null then
    raise exception using errcode = 'P0001', message = 'A customer property address is required before proposal finalization.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', line_item.id,
        'name', public.wtos_scrub_proposal_customer_text(line_item.name),
        'description', nullif(
          public.wtos_scrub_proposal_customer_text(line_item.description),
          ''
        ),
        'quantity', line_item.quantity,
        'unit', public.wtos_scrub_proposal_customer_text(line_item.unit),
        'total', line_item.total,
        'sortOrder', line_item.sort_order,
        'updatedAt', line_item.updated_at
      )
      order by line_item.sort_order, line_item.id
    ),
    '[]'::jsonb
  )
  into locked_source_line_items
  from public.estimate_line_items as line_item
  where line_item.estimate_id = request_estimate_id;

  if selected_company.updated_at is distinct from request_source_company_updated_at
    or selected_estimate.updated_at is distinct from request_source_estimate_updated_at
    or selected_estimate.customer_id is distinct from request_source_customer_id
    or selected_customer.id is distinct from request_source_customer_id
    or selected_customer.updated_at is distinct from request_source_customer_updated_at
    or coalesce(
      nullif(btrim(selected_customer.display_name), ''),
      nullif(btrim(selected_customer.contact_name), '')
    ) is distinct from request_source_customer_name
    or selected_estimate.property_id is distinct from request_source_property_id
    or selected_property.updated_at is distinct from request_source_property_updated_at
    or property_address is distinct from request_source_property_address
    or locked_source_line_items is distinct from request_source_line_items then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal source identity or version changed before its deterministic finalization lock.';
  end if;

  if request_brand_name is distinct from selected_company.name
    or request_brand_primary_color is distinct from coalesce(
      selected_company.brand_color,
      case
        when selected_company.trade = 'painting'
          or selected_company.name ~* '(ihc|paint)' then '#f97316'
        else '#6d28d9'
      end
    )
    or request_brand_accent_color is distinct from (
      case
        when selected_company.trade = 'painting'
          or selected_company.name ~* '(ihc|paint)' then '#7c2d12'
        else '#f97316'
      end
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal branding must match the exact locked company source.';
  end if;

  if jsonb_typeof(request_sections) <> 'array'
    or jsonb_typeof(request_options) <> 'array'
    or jsonb_typeof(coalesce(finalization_request -> 'selectedOptionIds', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Proposal sections, options, and selected option IDs must be arrays.';
  end if;

  select coalesce(array_agg(option_id order by option_id), '{}')
  into request_selected_option_ids
  from (
    select value::uuid as option_id
    from jsonb_array_elements_text(
      coalesce(finalization_request -> 'selectedOptionIds', '[]'::jsonb)
    )
  ) as selected_ids;

  if cardinality(request_selected_option_ids) <> (
    select count(distinct selected_id)
    from unnest(request_selected_option_ids) as selected_id
  ) then
    raise exception using errcode = 'P0001', message = 'Selected proposal option IDs cannot contain duplicates.';
  end if;

  if request_base_subtotal < 0
    or request_discount_total < 0
    or request_tax_total < 0
    or request_fee_total < 0
    or request_base_total <= 0
    or request_deposit_value < 0 then
    raise exception using errcode = 'P0001', message = 'Proposal financial values must be finite non-negative amounts with a positive base total.';
  end if;

  if public.wtos_scrub_proposal_customer_text(request_title)
      is distinct from btrim(request_title)
    or public.wtos_scrub_proposal_customer_text(request_terms)
      is distinct from btrim(request_terms)
    or (
      request_customer_visible_notes is not null
      and public.wtos_scrub_proposal_customer_text(
        request_customer_visible_notes
      ) is distinct from btrim(request_customer_visible_notes)
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal title, terms, and customer-visible notes cannot contain internal financial or private text.';
  end if;

  if request_base_subtotal::text in ('NaN', 'Infinity', '-Infinity')
    or request_discount_total::text in ('NaN', 'Infinity', '-Infinity')
    or request_tax_total::text in ('NaN', 'Infinity', '-Infinity')
    or request_fee_total::text in ('NaN', 'Infinity', '-Infinity')
    or request_base_total::text in ('NaN', 'Infinity', '-Infinity')
    or request_deposit_value::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = 'P0001', message = 'Proposal financial values must be finite.';
  end if;

  if selected_estimate.subtotal::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.labor_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.material_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.tax_rate::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.tax_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.discount_value::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.discount_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.profit_margin_rate::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.profit_margin_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_estimate.total::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = 'P0001',
      message = 'The locked estimate financial source must contain only finite values.';
  end if;

  if exists (
    select 1
    from public.estimate_line_items as line_item
    where line_item.estimate_id = request_estimate_id
      and (
        line_item.quantity::text in ('NaN', 'Infinity', '-Infinity')
        or line_item.unit_cost::text in ('NaN', 'Infinity', '-Infinity')
        or line_item.unit_price::text in ('NaN', 'Infinity', '-Infinity')
        or line_item.markup_rate::text in ('NaN', 'Infinity', '-Infinity')
        or line_item.total::text in ('NaN', 'Infinity', '-Infinity')
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal line-item financial values must be finite before finalization.';
  end if;

  if exists (
    select 1
    from public.estimate_line_items as line_item
    where line_item.estimate_id = request_estimate_id
      and (
        nullif(public.wtos_scrub_proposal_customer_text(line_item.name), '') is null
        or nullif(public.wtos_scrub_proposal_customer_text(line_item.unit), '') is null
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Every locked estimate line item requires a customer-visible name and unit after internal-only text is removed.';
  end if;

  with calculated_line_items as (
    select
      line_item.category,
      line_item.taxable,
      line_item.total as stored_total,
      round(
        line_item.quantity
          * line_item.unit_price
          * (1 + line_item.markup_rate / 100),
        2
      ) as calculated_total
    from public.estimate_line_items as line_item
    where line_item.estimate_id = request_estimate_id
  )
  select
    count(*),
    coalesce(bool_and(stored_total = calculated_total), false),
    round(coalesce(sum(calculated_total), 0), 2),
    round(coalesce(sum(calculated_total) filter (where category = 'labor'), 0), 2),
    round(coalesce(sum(calculated_total) filter (where category = 'material'), 0), 2),
    round(coalesce(sum(calculated_total) filter (where taxable), 0), 2)
  into
    source_line_item_count,
    stored_line_totals_match,
    source_base_subtotal,
    source_labor_total,
    source_material_total,
    source_taxable_subtotal
  from calculated_line_items;

  source_discount_total := round(
    case
      when selected_estimate.discount_type = 'percent'
        then source_base_subtotal * selected_estimate.discount_value / 100
      else selected_estimate.discount_value
    end,
    2
  );
  source_tax_total := round(
    greatest(source_taxable_subtotal - source_discount_total, 0)
      * selected_estimate.tax_rate / 100,
    2
  );
  source_profit_margin_total := round(
    greatest(source_base_subtotal - source_discount_total + source_tax_total, 0)
      * selected_estimate.profit_margin_rate / 100,
    2
  );
  source_base_total := round(
    greatest(source_base_subtotal - source_discount_total + source_tax_total, 0)
      + source_profit_margin_total,
    2
  );

  if source_line_item_count is distinct from locked_line_item_count
    or not stored_line_totals_match
    or selected_estimate.subtotal is distinct from source_base_subtotal
    or selected_estimate.labor_total is distinct from source_labor_total
    or selected_estimate.material_total is distinct from source_material_total
    or selected_estimate.discount_total is distinct from source_discount_total
    or selected_estimate.tax_total is distinct from source_tax_total
    or selected_estimate.profit_margin_total is distinct from source_profit_margin_total
    or selected_estimate.total is distinct from source_base_total
    or request_base_subtotal is distinct from source_base_subtotal
    or request_discount_total is distinct from source_discount_total
    or request_tax_total is distinct from source_tax_total
    or request_fee_total is distinct from 0::numeric
    or request_base_total is distinct from source_base_total then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal totals must exactly match the deterministically locked estimate and line-item source.';
  end if;

  if request_deposit_type not in ('none', 'fixed', 'percent') then
    raise exception using errcode = 'P0001', message = 'Native proposal Phase 1 supports no deposit, fixed deposits, or percentage deposits only.';
  end if;

  if request_deposit_type = 'percent' and request_deposit_value > 100 then
    raise exception using
      errcode = 'P0001',
      message = 'A percentage proposal deposit cannot exceed 100 percent.';
  end if;

  if request_deposit_before_job is distinct from request_deposit_required then
    raise exception using errcode = 'P0001', message = 'Phase 1 required deposits must be paid before sold-job conversion.';
  end if;

  if request_template_id is not null and not exists (
    select 1
    from public.proposal_templates as template
    where template.id = request_template_id
      and (template.company_id is null or template.company_id = request_company_id)
  ) then
    raise exception using errcode = 'P0001', message = 'Proposal template is not available to the selected company.';
  end if;

  if exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.estimate_id = request_estimate_id
      and revision.accepted_acceptance_id is not null
  ) then
    raise exception using errcode = 'P0001', message = 'An accepted proposal cannot be superseded by a new revision.';
  end if;

  if exists (
    select 1
    from public.proposal_signing_requests as signing_request
    join public.estimate_proposal_revisions as prior_revision
      on prior_revision.id = signing_request.proposal_revision_id
     and prior_revision.company_id = signing_request.company_id
    where prior_revision.estimate_id = request_estimate_id
      and prior_revision.company_id = request_company_id
      and (
        signing_request.status in ('prepared', 'sent', 'viewed')
        or exists (
          select 1
          from public.proposal_signing_sessions as session
          where session.signing_request_id = signing_request.id
            and session.status = 'active'
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Every active signing request and session must be explicitly revoked before finalizing a replacement revision.';
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'finalize_supersede',
    request_operation_key
  );
  update public.estimate_proposal_revisions as prior_revision
  set
    status = 'superseded',
    superseded_at = finalized_time
  where prior_revision.estimate_id = request_estimate_id
    and prior_revision.company_id = request_company_id
    and prior_revision.finalized_at is not null
    and prior_revision.accepted_acceptance_id is null
    and prior_revision.status not in ('superseded', 'converted_to_job', 'canceled');
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  select coalesce(max(revision.revision_number), 0) + 1
  into revision_number
  from public.estimate_proposal_revisions as revision
  where revision.estimate_id = request_estimate_id;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'finalize_create',
    request_operation_key
  );
  insert into public.estimate_proposal_revisions (
    id,
    company_id,
    estimate_id,
    customer_id,
    lead_id,
    property_id,
    template_id,
    proposal_number,
    revision_number,
    title,
    status,
    brand_name,
    brand_primary_color,
    brand_accent_color,
    base_subtotal,
    discount_total,
    tax_total,
    fee_total,
    base_total,
    selected_upgrades_total,
    accepted_total,
    deposit_type,
    deposit_value,
    deposit_required,
    deposit_amount,
    deposit_paid,
    remaining_balance,
    requires_signature,
    requires_deposit_before_job,
    signature_status,
    payment_status,
    customer_visible_notes,
    internal_notes,
    terms,
    acceptance_required,
    immutable_after_at,
    created_by,
    updated_by,
    source_snapshot,
    finalization_operation_key
  )
  values (
    revision_id,
    request_company_id,
    request_estimate_id,
    selected_estimate.customer_id,
    selected_estimate.lead_id,
    selected_estimate.property_id,
    request_template_id,
    request_proposal_number,
    revision_number,
    request_title,
    'approved_internally',
    request_brand_name,
    request_brand_primary_color,
    request_brand_accent_color,
    source_base_subtotal,
    source_discount_total,
    source_tax_total,
    0,
    source_base_total,
    0,
    source_base_total,
    request_deposit_type,
    request_deposit_value,
    request_deposit_required,
    0,
    0,
    source_base_total,
    true,
    request_deposit_before_job,
    'not_configured',
    case when request_deposit_required then 'deposit_required' else 'online_payments_disabled' end,
    request_customer_visible_notes,
    null,
    request_terms,
    true,
    finalized_time,
    request_actor_user_id,
    request_actor_user_id,
    jsonb_build_object(
      'sourceFingerprint', request_operation_key,
      'sourceCompanyUpdatedAt', selected_company.updated_at,
      'sourceEstimateUpdatedAt', selected_estimate.updated_at,
      'sourceCustomerId', selected_customer.id,
      'sourceCustomerUpdatedAt', selected_customer.updated_at,
      'sourceCustomerName', request_source_customer_name,
      'sourcePropertyId', selected_property.id,
      'sourcePropertyUpdatedAt', selected_property.updated_at,
      'sourcePropertyAddress', property_address,
      'sourceLineItems', locked_source_line_items
    ),
    request_operation_key
  );

  for section_item in
    select value from jsonb_array_elements(request_sections)
  loop
    if nullif(section_item ->> 'id', '') is null
      or nullif(btrim(section_item ->> 'sectionKey'), '') is null
      or nullif(btrim(section_item ->> 'title'), '') is null
      or nullif(section_item ->> 'sectionType', '') is null then
      raise exception using errcode = 'P0001', message = 'Every finalized proposal section requires an ID, key, title, and type.';
    end if;

    if coalesce((section_item ->> 'customerVisible')::boolean, true)
        is distinct from true
      or public.wtos_scrub_proposal_customer_text(section_item ->> 'title')
        is distinct from btrim(section_item ->> 'title')
      or public.wtos_scrub_proposal_customer_text(
        coalesce(section_item ->> 'body', '')
      ) is distinct from btrim(coalesce(section_item ->> 'body', '')) then
      raise exception using
        errcode = 'P0001',
        message = 'Finalized customer proposal sections must be visible and free of internal financial or private text.';
    end if;

    insert into public.estimate_proposal_sections (
      id,
      company_id,
      proposal_revision_id,
      section_key,
      title,
      section_type,
      body,
      customer_visible,
      is_required,
      sort_order,
      source_type,
      source_record_id,
      created_by
    )
    values (
      (section_item ->> 'id')::uuid,
      request_company_id,
      revision_id,
      btrim(section_item ->> 'sectionKey'),
      btrim(section_item ->> 'title'),
      section_item ->> 'sectionType',
      coalesce(section_item ->> 'body', ''),
      coalesce((section_item ->> 'customerVisible')::boolean, true),
      coalesce((section_item ->> 'isRequired')::boolean, false),
      coalesce((section_item ->> 'sortOrder')::integer, 0),
      nullif(section_item ->> 'sourceType', ''),
      nullif(section_item ->> 'sourceRecordId', '')::uuid,
      request_actor_user_id
    );
  end loop;

  for option_item in
    select value from jsonb_array_elements(request_options)
  loop
    if nullif(option_item ->> 'id', '') is null
      or nullif(option_item ->> 'optionType', '') is null
      or nullif(btrim(option_item ->> 'name'), '') is null
      or not (option_item ? 'selected') then
      raise exception using errcode = 'P0001', message = 'Every finalized proposal option requires an ID, type, name, and explicit selected state.';
    end if;

    if coalesce((option_item ->> 'customerVisible')::boolean, true)
        is distinct from true
      or public.wtos_scrub_proposal_customer_text(option_item ->> 'name')
        is distinct from btrim(option_item ->> 'name')
      or public.wtos_scrub_proposal_customer_text(
        coalesce(option_item ->> 'description', '')
      ) is distinct from btrim(coalesce(option_item ->> 'description', ''))
      or public.wtos_scrub_proposal_customer_text(
        coalesce(option_item ->> 'unit', '')
      ) is distinct from btrim(coalesce(option_item ->> 'unit', ''))
      or public.wtos_scrub_proposal_customer_text(
        coalesce(option_item ->> 'warrantyEffect', '')
      ) is distinct from btrim(coalesce(option_item ->> 'warrantyEffect', ''))
      or public.wtos_scrub_proposal_customer_text(
        coalesce(option_item ->> 'scopeDetails', '')
      ) is distinct from btrim(coalesce(option_item ->> 'scopeDetails', ''))
      or public.wtos_scrub_proposal_customer_text(
        coalesce(option_item ->> 'customerNotes', '')
      ) is distinct from btrim(coalesce(option_item ->> 'customerNotes', '')) then
      raise exception using
        errcode = 'P0001',
        message = 'Finalized customer proposal options must be visible and free of internal financial or private text.';
    end if;

    option_quantity := coalesce((option_item ->> 'quantity')::numeric, 1);
    option_price := coalesce((option_item ->> 'price')::numeric, 0);
    option_base_replacement_amount := coalesce(
      (option_item ->> 'baseReplacementAmount')::numeric,
      0
    );

    if option_quantity::text in ('NaN', 'Infinity', '-Infinity')
      or option_price::text in ('NaN', 'Infinity', '-Infinity')
      or option_base_replacement_amount::text in ('NaN', 'Infinity', '-Infinity')
      or option_quantity < 0
      or option_price < 0
      or option_base_replacement_amount < 0 then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal option quantity, price, and base-replacement amount must be finite non-negative values.';
    end if;

    insert into public.estimate_proposal_options (
      id,
      company_id,
      proposal_revision_id,
      option_type,
      option_group_key,
      name,
      description,
      quantity,
      unit,
      price,
      price_effect_type,
      base_replacement_amount,
      customer_visible,
      selected,
      selected_by,
      selected_at,
      required,
      recommended,
      best_value,
      dependency_option_id,
      conflicting_option_id,
      warranty_effect,
      scope_details,
      customer_notes,
      internal_notes,
      source_line_item_id,
      source_finding_id,
      source_photo_id,
      sort_order,
      created_by
    )
    values (
      (option_item ->> 'id')::uuid,
      request_company_id,
      revision_id,
      option_item ->> 'optionType',
      nullif(option_item ->> 'optionGroupKey', ''),
      btrim(option_item ->> 'name'),
      nullif(option_item ->> 'description', ''),
      option_quantity,
      coalesce(nullif(option_item ->> 'unit', ''), 'each'),
      option_price,
      coalesce(nullif(option_item ->> 'priceEffectType', ''), 'additive'),
      option_base_replacement_amount,
      coalesce((option_item ->> 'customerVisible')::boolean, true),
      (option_item ->> 'selected')::boolean,
      case when (option_item ->> 'selected')::boolean then request_actor_user_id else null end,
      case when (option_item ->> 'selected')::boolean then finalized_time else null end,
      coalesce((option_item ->> 'required')::boolean, false),
      coalesce((option_item ->> 'recommended')::boolean, false),
      coalesce((option_item ->> 'bestValue')::boolean, false),
      null,
      null,
      nullif(option_item ->> 'warrantyEffect', ''),
      nullif(option_item ->> 'scopeDetails', ''),
      nullif(option_item ->> 'customerNotes', ''),
      null,
      nullif(option_item ->> 'sourceLineItemId', '')::uuid,
      nullif(option_item ->> 'sourceFindingId', ''),
      nullif(option_item ->> 'sourcePhotoId', '')::uuid,
      coalesce((option_item ->> 'sortOrder')::integer, 0),
      request_actor_user_id
    );
  end loop;

  for option_item in
    select value from jsonb_array_elements(request_options)
  loop
    update public.estimate_proposal_options
    set
      dependency_option_id = nullif(option_item ->> 'dependencyOptionId', '')::uuid,
      conflicting_option_id = nullif(option_item ->> 'conflictingOptionId', '')::uuid
    where id = (option_item ->> 'id')::uuid
      and proposal_revision_id = revision_id;
  end loop;

  if exists (
    select 1
    from public.estimate_proposal_options as option
    where option.proposal_revision_id = revision_id
      and (
        (
          option.dependency_option_id is not null
          and not exists (
            select 1
            from public.estimate_proposal_options as dependency
            where dependency.id = option.dependency_option_id
              and dependency.proposal_revision_id = revision_id
          )
        )
        or (
          option.conflicting_option_id is not null
          and not exists (
            select 1
            from public.estimate_proposal_options as conflicting
            where conflicting.id = option.conflicting_option_id
              and conflicting.proposal_revision_id = revision_id
          )
        )
        or (
          option.source_line_item_id is not null
          and not exists (
            select 1
            from public.estimate_line_items as line_item
            where line_item.id = option.source_line_item_id
              and line_item.estimate_id = request_estimate_id
          )
        )
        or (
          option.source_photo_id is not null
          and not exists (
            select 1
            from public.job_photos as photo
            where photo.id = option.source_photo_id
              and photo.company_id = request_company_id
              and photo.estimate_id = request_estimate_id
              and photo.is_customer_visible
          )
        )
      )
  ) then
    raise exception using errcode = 'P0001', message = 'Proposal option dependencies and source evidence must remain inside the exact finalized estimate and company.';
  end if;

  if exists (
    select 1
    from public.estimate_proposal_options as option
    where option.proposal_revision_id = revision_id
      and option.selected is distinct from (option.id = any(request_selected_option_ids))
  ) or exists (
    select 1
    from unnest(request_selected_option_ids) as selected_id
    where not exists (
      select 1
      from public.estimate_proposal_options as option
      where option.id = selected_id
        and option.proposal_revision_id = revision_id
        and option.customer_visible
    )
  ) then
    raise exception using errcode = 'P0001', message = 'Selected option IDs must match the exact customer-visible option selection.';
  end if;

  if exists (
    select 1
    from public.estimate_proposal_options as option
    where option.proposal_revision_id = revision_id
      and option.required
      and not option.selected
  ) then
    raise exception using errcode = 'P0001', message = 'Every required proposal option must be selected before finalization.';
  end if;

  if exists (
    select 1
    from public.estimate_proposal_options as option
    where option.proposal_revision_id = revision_id
      and option.selected
      and option.dependency_option_id is not null
      and not exists (
        select 1
        from public.estimate_proposal_options as dependency
        where dependency.id = option.dependency_option_id
          and dependency.proposal_revision_id = revision_id
          and dependency.selected
      )
  ) then
    raise exception using errcode = 'P0001', message = 'Selected proposal option dependencies must also be selected.';
  end if;

  if exists (
    select 1
    from public.estimate_proposal_options as option
    join public.estimate_proposal_options as conflicting
      on conflicting.id = option.conflicting_option_id
     and conflicting.proposal_revision_id = option.proposal_revision_id
    where option.proposal_revision_id = revision_id
      and option.selected
      and conflicting.selected
  ) then
    raise exception using errcode = 'P0001', message = 'Conflicting proposal options cannot both be selected.';
  end if;

  select count(*), max(round(option.price * option.quantity, 2))
  into full_alternate_count, full_alternate_total
  from public.estimate_proposal_options as option
  where option.proposal_revision_id = revision_id
    and option.customer_visible
    and option.selected
    and option.price_effect_type = 'full_alternate_total';

  if full_alternate_count > 1 then
    raise exception using errcode = 'P0001', message = 'Only one full-alternate proposal option can be selected.';
  end if;

  calculated_accepted_total := coalesce(full_alternate_total, source_base_total);

  for option_item in
    select to_jsonb(option)
    from public.estimate_proposal_options as option
    where option.proposal_revision_id = revision_id
      and option.customer_visible
      and option.selected
      and option.price_effect_type <> 'full_alternate_total'
    order by option.sort_order, option.id
  loop
    if full_alternate_count > 0 and option_item ->> 'price_effect_type' <> 'additive' then
      continue;
    end if;

    if option_item ->> 'price_effect_type' = 'replace_base_amount' then
      calculated_accepted_total := calculated_accepted_total
        + round((option_item ->> 'price')::numeric * (option_item ->> 'quantity')::numeric, 2)
        - (option_item ->> 'base_replacement_amount')::numeric;
    else
      calculated_accepted_total := calculated_accepted_total
        + round((option_item ->> 'price')::numeric * (option_item ->> 'quantity')::numeric, 2);
    end if;
  end loop;

  calculated_accepted_total := round(greatest(calculated_accepted_total, 0), 2);
  calculated_selected_upgrades_total := round(
    greatest(calculated_accepted_total - source_base_total, 0),
    2
  );

  calculated_required_deposit_amount := case request_deposit_type
    when 'fixed' then least(round(request_deposit_value, 2), calculated_accepted_total)
    when 'percent' then least(
      round(calculated_accepted_total * request_deposit_value / 100, 2),
      calculated_accepted_total
    )
    else 0
  end;

  if calculated_accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or calculated_selected_upgrades_total::text in ('NaN', 'Infinity', '-Infinity')
    or calculated_required_deposit_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using
      errcode = 'P0001',
      message = 'Calculated proposal totals and required deposit must remain finite.';
  end if;

  if request_deposit_required and calculated_required_deposit_amount <= 0 then
    raise exception using errcode = 'P0001', message = 'A required deposit must calculate to a positive amount.';
  end if;

  if not request_deposit_required and calculated_required_deposit_amount > 0 then
    raise exception using errcode = 'P0001', message = 'A configured deposit amount must be marked required.';
  end if;

  if request_deposit_required then
    insert into public.proposal_payment_schedules (
      company_id,
      proposal_revision_id,
      invoice_id,
      milestone_name,
      schedule_type,
      amount_type,
      amount_value,
      calculated_amount,
      due_trigger,
      status,
      sort_order,
      customer_visible,
      notes
    )
    values (
      request_company_id,
      revision_id,
      null,
      'Required deposit',
      'deposit',
      case when request_deposit_type = 'percent' then 'percent' else 'fixed' end,
      request_deposit_value,
      calculated_required_deposit_amount,
      'upon_acceptance',
      'pending',
      0,
      true,
      null
    );
  end if;

  canonical_customer_snapshot := jsonb_build_object(
    'schemaVersion', 'native-proposal-v1',
    'company', jsonb_build_object(
      'id', request_company_id,
      'name', selected_company.name,
      'brandName', request_brand_name,
      'primaryColor', request_brand_primary_color,
      'accentColor', request_brand_accent_color
    ),
    'proposal', jsonb_build_object(
      'id', revision_id,
      'number', request_proposal_number,
      'revisionNumber', revision_number,
      'title', request_title,
      'issueDate', selected_estimate.issue_date
    ),
    'customer', jsonb_build_object(
      'id', selected_customer.id,
      'name', request_source_customer_name
    ),
    'property', jsonb_build_object(
      'id', selected_estimate.property_id,
      'address', property_address
    ),
    'pricing', jsonb_build_object(
      'baseSubtotal', source_base_subtotal,
      'discountTotal', source_discount_total,
      'taxTotal', source_tax_total,
      'feeTotal', 0,
      'baseTotal', source_base_total,
      'selectedUpgradesTotal', calculated_selected_upgrades_total,
      'acceptedTotal', calculated_accepted_total,
      'remainingBalance', round(
        greatest(calculated_accepted_total - calculated_required_deposit_amount, 0),
        2
      )
    ),
    'deposit', jsonb_build_object(
      'type', request_deposit_type,
      'value', request_deposit_value,
      'required', request_deposit_required,
      'requiredBeforeJob', request_deposit_before_job,
      'requiredAmount', calculated_required_deposit_amount
    ),
    'selectedOptionIds', to_jsonb(request_selected_option_ids),
    'lineItems', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'name', public.wtos_scrub_proposal_customer_text(item.name),
          'description', nullif(
            public.wtos_scrub_proposal_customer_text(item.description),
            ''
          ),
          'quantity', item.quantity,
          'unit', public.wtos_scrub_proposal_customer_text(item.unit),
          'total', item.total,
          'sortOrder', item.sort_order
        ) order by item.sort_order, item.id
      )
      from public.estimate_line_items as item
      where item.estimate_id = request_estimate_id
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', section.id,
          'sectionKey', section.section_key,
          'title', section.title,
          'sectionType', section.section_type,
          'body', section.body,
          'isRequired', section.is_required,
          'sortOrder', section.sort_order
        ) order by section.sort_order, section.id
      )
      from public.estimate_proposal_sections as section
      where section.proposal_revision_id = revision_id
        and section.customer_visible
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', option.id,
          'optionType', option.option_type,
          'optionGroupKey', option.option_group_key,
          'name', option.name,
          'description', option.description,
          'quantity', option.quantity,
          'unit', option.unit,
          'price', option.price,
          'priceEffectType', option.price_effect_type,
          'baseReplacementAmount', option.base_replacement_amount,
          'selected', option.selected,
          'required', option.required,
          'recommended', option.recommended,
          'bestValue', option.best_value,
          'dependencyOptionId', option.dependency_option_id,
          'conflictingOptionId', option.conflicting_option_id,
          'warrantyEffect', option.warranty_effect,
          'scopeDetails', option.scope_details,
          'customerNotes', option.customer_notes,
          'sortOrder', option.sort_order
        ) order by option.sort_order, option.id
      )
      from public.estimate_proposal_options as option
      where option.proposal_revision_id = revision_id
        and option.customer_visible
    ), '[]'::jsonb),
    'terms', request_terms
  );

  revision_digest := encode(
    extensions.digest(convert_to(canonical_customer_snapshot::text, 'UTF8'), 'sha256'),
    'hex'
  );
  terms_digest := encode(
    extensions.digest(convert_to(request_terms, 'UTF8'), 'sha256'),
    'hex'
  );

  update public.estimate_proposal_revisions
  set
    selected_upgrades_total = calculated_selected_upgrades_total,
    accepted_total = calculated_accepted_total,
    deposit_amount = calculated_required_deposit_amount,
    remaining_balance = round(
      greatest(calculated_accepted_total - calculated_required_deposit_amount, 0),
      2
    ),
    customer_snapshot = canonical_customer_snapshot,
    revision_sha256 = revision_digest,
    terms_sha256 = terms_digest,
    finalized_at = finalized_time,
    finalized_by = request_actor_user_id,
    updated_by = request_actor_user_id
  where id = revision_id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    actor_id,
    summary,
    metadata,
    idempotency_key
  )
  values (
    request_company_id,
    revision_id,
    request_estimate_id,
    selected_estimate.customer_id,
    'native_proposal_finalized',
    'internal',
    request_actor_user_id,
    'Finalized immutable native proposal revision.',
    jsonb_build_object(
      'revisionSha256', revision_digest,
      'termsSha256', terms_digest,
      'selectedOptionIds', request_selected_option_ids,
      'acceptedTotal', calculated_accepted_total,
      'requiredDepositAmount', calculated_required_deposit_amount
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'finalized',
    'proposalStatus', 'approved_internally',
    'proposalRevisionId', revision_id,
    'revisionNumber', revision_number,
    'revisionSha256', revision_digest,
    'termsSha256', terms_digest,
    'customerSnapshot', canonical_customer_snapshot,
    'documentId', null,
    'documentSha256', null
  );
end;
$$;

revoke all on function public.wtos_finalize_proposal_revision(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_finalize_proposal_revision(jsonb)
to service_role;

create or replace function public.wtos_register_proposal_artifact(
  artifact_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(artifact_request ->> 'operationKey', '')::uuid;
  request_actor_user_id uuid := nullif(artifact_request ->> 'actorUserId', '')::uuid;
  request_company_id uuid := nullif(artifact_request ->> 'companyId', '')::uuid;
  request_revision_id uuid := nullif(artifact_request ->> 'proposalRevisionId', '')::uuid;
  request_document_id uuid := nullif(artifact_request ->> 'documentId', '')::uuid;
  request_file_name text := nullif(btrim(artifact_request ->> 'fileName'), '');
  request_file_size_bytes bigint := (artifact_request ->> 'fileSizeBytes')::bigint;
  request_mime_type text := nullif(btrim(artifact_request ->> 'mimeType'), '');
  request_storage_bucket text := nullif(btrim(artifact_request ->> 'storageBucket'), '');
  request_storage_path text := nullif(btrim(artifact_request ->> 'storagePath'), '');
  request_document_sha256 text := lower(nullif(artifact_request ->> 'documentSha256', ''));
  selected_revision public.estimate_proposal_revisions%rowtype;
  existing_document public.documents%rowtype;
  artifact_time timestamptz := clock_timestamp();
begin
  if request_operation_key is null
    or request_actor_user_id is null
    or request_company_id is null
    or request_revision_id is null
    or request_document_id is null
    or request_file_name is null
    or request_file_size_bytes is null
    or request_storage_path is null
    or request_document_sha256 is null then
    raise exception using errcode = 'P0001', message = 'Complete immutable proposal artifact metadata is required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);

  select document.* into existing_document
  from public.documents as document
  where document.artifact_operation_key = request_operation_key
     or document.id = request_document_id
  order by (document.artifact_operation_key = request_operation_key) desc
  limit 1;

  if existing_document.id is not null then
    if existing_document.id is distinct from request_document_id
      or existing_document.company_id is distinct from request_company_id
      or existing_document.proposal_revision_id is distinct from request_revision_id
      or existing_document.file_name is distinct from request_file_name
      or existing_document.file_size_bytes is distinct from request_file_size_bytes
      or existing_document.mime_type is distinct from request_mime_type
      or existing_document.storage_bucket is distinct from request_storage_bucket
      or existing_document.content_sha256 is distinct from request_document_sha256
      or existing_document.storage_path is distinct from request_storage_path then
      raise exception using errcode = 'P0001', message = 'Proposal artifact idempotency key or document ID conflicts with another artifact.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'ready_to_send',
      'proposalRevisionId', request_revision_id,
      'documentId', existing_document.id,
      'documentSha256', existing_document.content_sha256
    );
  end if;

  if not public.wtos_native_proposal_source_is_current(
    request_revision_id,
    request_company_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal source changed after finalization; finalize a new immutable revision before delivery.';
  end if;

  perform 1
  from public.proposal_signing_requests as active_request
  where active_request.proposal_revision_id = request_revision_id
    and active_request.company_id = request_company_id
    and active_request.status in ('prepared', 'sent', 'viewed')
  order by active_request.id
  for update;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for update;

  -- A simultaneous exact artifact registration waits on the estimate/revision
  -- serialization above. Re-read both operation and document identity after
  -- that lock so response-loss retries converge on the committed immutable
  -- metadata instead of racing cleanup against an in-flight transaction.
  select document.* into existing_document
  from public.documents as document
  where document.artifact_operation_key = request_operation_key
     or document.id = request_document_id
  order by (document.artifact_operation_key = request_operation_key) desc
  limit 1;

  if existing_document.id is not null then
    if existing_document.id is distinct from request_document_id
      or existing_document.company_id is distinct from request_company_id
      or existing_document.proposal_revision_id is distinct from request_revision_id
      or existing_document.file_name is distinct from request_file_name
      or existing_document.file_size_bytes is distinct from request_file_size_bytes
      or existing_document.mime_type is distinct from request_mime_type
      or existing_document.storage_bucket is distinct from request_storage_bucket
      or existing_document.content_sha256 is distinct from request_document_sha256
      or existing_document.storage_path is distinct from request_storage_path then
      raise exception using errcode = 'P0001', message = 'Proposal artifact idempotency key or document ID conflicts with another artifact.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'ready_to_send',
      'proposalRevisionId', request_revision_id,
      'documentId', existing_document.id,
      'documentSha256', existing_document.content_sha256
    );
  end if;

  if selected_revision.id is null
    or selected_revision.finalized_at is null
    or selected_revision.revision_sha256 is null
    or selected_revision.terms_sha256 is null
    or selected_revision.customer_snapshot is null
    or selected_revision.status not in ('approved_internally', 'ready_to_send') then
    raise exception using errcode = 'P0001', message = 'Only an exact finalized proposal without a prior artifact can register a PDF.';
  end if;

  if selected_revision.finalized_document_id is not null then
    raise exception using errcode = 'P0001', message = 'The finalized proposal already has an immutable document artifact.';
  end if;

  if request_storage_bucket <> 'customer-documents'
    or request_mime_type <> 'application/pdf'
    or request_file_size_bytes <= 0
    or request_document_sha256 !~ '^[0-9a-f]{64}$'
    or request_storage_path is distinct from (
      request_company_id::text || '/proposals/' || request_revision_id::text || '/' || request_document_id::text || '.pdf'
    ) then
    raise exception using errcode = 'P0001', message = 'Proposal artifact must be a positive-size private PDF with a SHA-256 digest.';
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'register_artifact',
    request_operation_key
  );
  insert into public.documents (
    id,
    company_id,
    customer_id,
    lead_id,
    job_id,
    estimate_id,
    invoice_id,
    change_order_id,
    property_id,
    title,
    category,
    status,
    template_key,
    file_url,
    body,
    file_name,
    file_size_bytes,
    mime_type,
    storage_bucket,
    storage_path,
    uploaded_by,
    uploaded_at,
    property_address,
    tags,
    requirement_level,
    required_for,
    proposal_revision_id,
    artifact_operation_key,
    content_sha256,
    immutable_after_at
  )
  values (
    request_document_id,
    selected_revision.company_id,
    selected_revision.customer_id,
    selected_revision.lead_id,
    null,
    selected_revision.estimate_id,
    null,
    null,
    selected_revision.property_id,
    selected_revision.title || ' - Finalized Proposal',
    'proposal',
    'ready',
    'native_proposal_v1',
    null,
    null,
    request_file_name,
    request_file_size_bytes,
    request_mime_type,
    request_storage_bucket,
    request_storage_path,
    request_actor_user_id,
    artifact_time,
    selected_revision.customer_snapshot #>> '{property,address}',
    array['proposal', 'customer-facing', 'immutable', 'native-esign'],
    'required',
    array['estimate_approval', 'customer_signature'],
    request_revision_id,
    request_operation_key,
    request_document_sha256,
    artifact_time
  );

  update public.estimate_proposal_revisions
  set
    artifact_operation_key = request_operation_key,
    finalized_document_id = request_document_id,
    status = 'ready_to_send',
    signature_status = 'ready_to_send',
    updated_by = request_actor_user_id
  where id = request_revision_id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    actor_id,
    summary,
    metadata,
    idempotency_key
  )
  values (
    request_company_id,
    request_revision_id,
    selected_revision.estimate_id,
    selected_revision.customer_id,
    'native_proposal_artifact_registered',
    'internal',
    request_actor_user_id,
    'Registered immutable private proposal PDF artifact.',
    jsonb_build_object(
      'documentId', request_document_id,
      'documentSha256', request_document_sha256,
      'storageBucket', request_storage_bucket,
      'storagePath', request_storage_path,
      'fileSizeBytes', request_file_size_bytes
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'ready_to_send',
    'proposalRevisionId', request_revision_id,
    'documentId', request_document_id,
    'documentSha256', request_document_sha256
  );
end;
$$;

revoke all on function public.wtos_register_proposal_artifact(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_register_proposal_artifact(jsonb)
to service_role;

create or replace function public.wtos_prepare_proposal_signing_request(
  signing_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(signing_request ->> 'operationKey', '')::uuid;
  request_id uuid := nullif(signing_request ->> 'requestId', '')::uuid;
  request_actor_user_id uuid := nullif(signing_request ->> 'actorUserId', '')::uuid;
  request_company_id uuid := nullif(signing_request ->> 'companyId', '')::uuid;
  request_revision_id uuid := nullif(signing_request ->> 'proposalRevisionId', '')::uuid;
  request_token_sha256 text := lower(nullif(signing_request ->> 'requestTokenHash', ''));
  request_signer_name text := nullif(
    regexp_replace(btrim(signing_request ->> 'signerName'), '\s+', ' ', 'g'),
    ''
  );
  request_signer_email text := lower(nullif(btrim(signing_request ->> 'signerEmail'), ''));
  request_expires_at timestamptz := nullif(signing_request ->> 'expiresAt', '')::timestamptz;
  request_consent_version text := nullif(signing_request ->> 'consentVersion', '');
  request_consent_text text := signing_request ->> 'consentText';
  request_consent_sha256 text := lower(nullif(signing_request ->> 'consentSha256', ''));
  expected_consent_text constant text := 'Electronic records and signature consent for this proposal. This consent applies only to this exact finalized proposal, your acceptance, and the signed receipt. Before signing, you can open, download, print, and save the exact finalized proposal PDF. By selecting the electronic-records checkbox, you confirm that you can access and retain these electronic records. You may decline electronic signing or withdraw this consent before signing by replying to the proposal email or contacting the company; doing so will not affect electronic actions already completed. Keep your email address current by contacting the company. This process requires internet access, a current JavaScript- and cookie-enabled browser, a PDF viewer, and storage or printing capability to retain records. You may request a paper copy by contacting the company; contact the company about availability and any fees. The normal acceptance workflow remains electronic. By selecting all electronic-signature acknowledgements and submitting your typed legal name, you intend that name to be your electronic signature on this exact finalized proposal revision.';
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_document public.documents%rowtype;
  selected_email public.email_messages%rowtype;
  existing_request public.proposal_signing_requests%rowtype;
  created_signature_id uuid := gen_random_uuid();
  prepared_time timestamptz := clock_timestamp();
begin
  if request_operation_key is null
    or request_id is null
    or request_actor_user_id is null
    or request_company_id is null
    or request_revision_id is null
    or request_token_sha256 is null
    or request_signer_name is null
    or request_signer_email is null
    or request_expires_at is null
    or request_consent_sha256 is null then
    raise exception using errcode = 'P0001', message = 'Complete signing request identity, token digest, signer, consent, and expiry are required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);

  select prepared_request.* into existing_request
  from public.proposal_signing_requests as prepared_request
  where prepared_request.operation_key = request_operation_key
     or prepared_request.id = request_id
  order by (prepared_request.operation_key = request_operation_key) desc
  limit 1;

  if existing_request.id is not null then
    if existing_request.id is distinct from request_id
      or existing_request.company_id is distinct from request_company_id
      or existing_request.proposal_revision_id is distinct from request_revision_id
      or existing_request.request_token_sha256 is distinct from request_token_sha256
      or existing_request.intended_signer_name is distinct from request_signer_name
      or existing_request.intended_signer_email is distinct from request_signer_email
      or existing_request.expires_at is distinct from request_expires_at
      or existing_request.consent_version is distinct from request_consent_version
      or existing_request.consent_text is distinct from request_consent_text
      or existing_request.consent_sha256 is distinct from request_consent_sha256 then
      raise exception using errcode = 'P0001', message = 'Signing request idempotency key or request ID conflicts with another request.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', existing_request.status,
      'requestId', existing_request.id,
      'signingRequestId', existing_request.id,
      'signatureId', existing_request.signature_id,
      'proposalRevisionId', existing_request.proposal_revision_id,
      'documentId', existing_request.proposal_document_id,
      'expiresAt', existing_request.expires_at
    );
  end if;

  if not public.wtos_native_proposal_source_is_current(
    request_revision_id,
    request_company_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal source changed after finalization; finalize a new immutable revision before delivery.';
  end if;

  perform 1
  from public.proposal_signing_requests as active_request
  where active_request.proposal_revision_id = request_revision_id
    and active_request.company_id = request_company_id
    and active_request.status in ('prepared', 'sent', 'viewed')
  order by active_request.id
  for update;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for update;

  -- A concurrent exact retry waits on the revision lock above. Re-read the
  -- request identity after that serialization point so only the exact first
  -- request converges; a distinct request never supersedes active delivery.
  select prepared_request.* into existing_request
  from public.proposal_signing_requests as prepared_request
  where prepared_request.operation_key = request_operation_key
     or prepared_request.id = request_id
  order by (prepared_request.operation_key = request_operation_key) desc
  limit 1;

  if existing_request.id is not null then
    if existing_request.id is distinct from request_id
      or existing_request.company_id is distinct from request_company_id
      or existing_request.proposal_revision_id is distinct from request_revision_id
      or existing_request.request_token_sha256 is distinct from request_token_sha256
      or existing_request.intended_signer_name is distinct from request_signer_name
      or existing_request.intended_signer_email is distinct from request_signer_email
      or existing_request.expires_at is distinct from request_expires_at
      or existing_request.consent_version is distinct from request_consent_version
      or existing_request.consent_text is distinct from request_consent_text
      or existing_request.consent_sha256 is distinct from request_consent_sha256 then
      raise exception using errcode = 'P0001', message = 'Signing request idempotency key or request ID conflicts with another request.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', existing_request.status,
      'requestId', existing_request.id,
      'signingRequestId', existing_request.id,
      'signatureId', existing_request.signature_id,
      'proposalRevisionId', existing_request.proposal_revision_id,
      'documentId', existing_request.proposal_document_id,
      'expiresAt', existing_request.expires_at
    );
  end if;

  if exists (
    select 1
    from public.proposal_signing_requests as active_request
    where active_request.proposal_revision_id = request_revision_id
      and active_request.company_id = request_company_id
      and active_request.status in ('prepared', 'sent', 'viewed')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'An active signing request must be explicitly revoked before preparing a replacement.';
  end if;

  if selected_revision.id is null
    or selected_revision.status not in ('ready_to_send', 'sent')
    or selected_revision.finalized_document_id is null
    or selected_revision.revision_sha256 is null
    or selected_revision.terms_sha256 is null
    or selected_revision.accepted_acceptance_id is not null then
    raise exception using errcode = 'P0001', message = 'Only an unsigned exact finalized proposal artifact can be prepared for delivery.';
  end if;

  select document.* into selected_document
  from public.documents as document
  where document.id = selected_revision.finalized_document_id
    and document.proposal_revision_id = selected_revision.id
    and document.company_id = selected_revision.company_id
    and document.customer_id is not distinct from selected_revision.customer_id
    and document.estimate_id = selected_revision.estimate_id
    and document.category = 'proposal'
    and document.storage_bucket = 'customer-documents'
    and document.content_sha256 is not null
  for share;

  if selected_document.id is null then
    raise exception using errcode = 'P0001', message = 'The exact private finalized proposal artifact could not be verified.';
  end if;

  select email.* into selected_email
  from public.email_messages as email
  where email.company_id = selected_revision.company_id
    and email.customer_id = selected_revision.customer_id
    and email.estimate_id = selected_revision.estimate_id
    and email.document_id = selected_document.id
    and (
      (
        email.status = 'queued'
        and email.sync_status = 'syncing'
      )
      or (
        email.status = 'sent'
        and email.sync_status = 'sent'
        and email.integration_connection_id is null
        and email.from_email = 'weathertech-os-regression@example.test'
        and email.metadata ->> 'generatedBy'
          = 'weathertech_proposal_signature_regression'
        and email.metadata ->> 'regressionSyntheticDelivery' = 'true'
        and email.metadata ->> 'regressionRunId' ~ '^[0-9]{17}$'
        and email.gmail_message_id = (
          'regression-' || (email.metadata ->> 'proposalSigningRequestId')
        )
        and email.gmail_thread_id = (
          'regression-thread-' || (email.metadata ->> 'proposalSigningRequestId')
        )
      )
    )
    and email.metadata ->> 'proposalSigningRequestId' = request_id::text
    and email.metadata ->> 'proposalRevisionId' = selected_revision.id::text
    and email.metadata ->> 'proposalDocumentId' = selected_document.id::text
    and lower(email.metadata ->> 'proposalRevisionSha256') = selected_revision.revision_sha256
    and lower(email.metadata ->> 'proposalTermsSha256') = selected_revision.terms_sha256
    and lower(email.metadata ->> 'proposalDocumentSha256') = selected_document.content_sha256
    and lower(email.to_email) = request_signer_email
  order by email.created_at desc
  limit 1
  for share;

  if selected_email.id is null then
    raise exception using errcode = 'P0001', message = 'A token-free owner-approved email draft with exact proposal evidence is required at send time.';
  end if;

  if request_token_sha256 !~ '^[0-9a-f]{64}$'
    or request_consent_version <> 'wtos-native-esign-v1'
    or request_consent_text is distinct from expected_consent_text
    or request_consent_sha256 is distinct from encode(
      extensions.digest(convert_to(expected_consent_text, 'UTF8'), 'sha256'),
      'hex'
    )
    or request_expires_at <= prepared_time
    or request_expires_at > prepared_time + interval '30 days' then
    raise exception using errcode = 'P0001', message = 'Signing token, consent disclosure, digest, or expiry is invalid.';
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'prepare_signing_request',
    request_operation_key
  );
  insert into public.signatures (
    id,
    company_id,
    customer_id,
    employee_id,
    document_id,
    change_order_id,
    signer_name,
    signer_email,
    status,
    provider,
    signature_method,
    proposal_revision_id,
    expires_at
  )
  values (
    created_signature_id,
    selected_revision.company_id,
    selected_revision.customer_id,
    null,
    selected_document.id,
    null,
    request_signer_name,
    request_signer_email,
    'pending',
    'native',
    'typed_name',
    selected_revision.id,
    request_expires_at
  );

  insert into public.proposal_signing_requests (
    id,
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    signature_id,
    proposal_document_id,
    operation_key,
    request_token_sha256,
    revision_sha256,
    document_sha256,
    terms_sha256,
    consent_version,
    consent_text,
    consent_sha256,
    intended_signer_name,
    intended_signer_email,
    status,
    delivery_email_message_id,
    expires_at,
    created_by,
    created_at,
    updated_at
  )
  values (
    request_id,
    selected_revision.company_id,
    selected_revision.id,
    selected_revision.estimate_id,
    selected_revision.customer_id,
    created_signature_id,
    selected_document.id,
    request_operation_key,
    request_token_sha256,
    selected_revision.revision_sha256,
    selected_document.content_sha256,
    selected_revision.terms_sha256,
    request_consent_version,
    request_consent_text,
    request_consent_sha256,
    request_signer_name,
    request_signer_email,
    'prepared',
    selected_email.id,
    request_expires_at,
    request_actor_user_id,
    prepared_time,
    prepared_time
  );

  update public.estimate_proposal_revisions
  set
    signature_status = 'prepared',
    expires_at = request_expires_at,
    updated_by = request_actor_user_id
  where id = request_revision_id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    actor_id,
    summary,
    metadata,
    idempotency_key
  )
  values (
    request_company_id,
    request_revision_id,
    selected_revision.estimate_id,
    selected_revision.customer_id,
    'native_signature_request_prepared',
    'internal',
    request_actor_user_id,
    'Prepared hashed native proposal signing request; no delivery is claimed.',
    jsonb_build_object(
      'requestId', request_id,
      'signatureId', created_signature_id,
      'documentId', selected_document.id,
      'expiresAt', request_expires_at
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'prepared',
    'requestId', request_id,
    'signingRequestId', request_id,
    'signatureId', created_signature_id,
    'proposalRevisionId', request_revision_id,
    'documentId', selected_document.id,
    'expiresAt', request_expires_at
  );
end;
$$;

revoke all on function public.wtos_prepare_proposal_signing_request(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_prepare_proposal_signing_request(jsonb)
to service_role;

create or replace function public.wtos_transition_proposal_signing_request(
  transition_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(transition_request ->> 'operationKey', '')::uuid;
  request_actor_user_id uuid := nullif(transition_request ->> 'actorUserId', '')::uuid;
  request_company_id uuid := nullif(transition_request ->> 'companyId', '')::uuid;
  request_id uuid := nullif(transition_request ->> 'requestId', '')::uuid;
  request_action text := nullif(transition_request ->> 'action', '');
  request_email_message_id uuid := nullif(transition_request ->> 'emailMessageId', '')::uuid;
  request_failure_code text := nullif(btrim(transition_request ->> 'failureCode'), '');
  request_reason text := nullif(btrim(transition_request ->> 'reason'), '');
  selected_request public.proposal_signing_requests%rowtype;
  selected_email public.email_messages%rowtype;
  existing_event public.proposal_audit_events%rowtype;
  target_status text;
  transition_time timestamptz := clock_timestamp();
begin
  if request_operation_key is null
    or request_actor_user_id is null
    or request_company_id is null
    or request_id is null
    or request_action not in ('mark_sent', 'mark_failed', 'revoke') then
    raise exception using errcode = 'P0001', message = 'A valid signing delivery transition is required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);

  select event.* into existing_event
  from public.proposal_audit_events as event
  where event.company_id = request_company_id
    and event.event_type = 'native_signature_request_' || request_action
    and event.idempotency_key = request_operation_key::text;

  if existing_event.id is not null then
    if existing_event.metadata ->> 'requestId' is distinct from request_id::text then
      raise exception using errcode = 'P0001', message = 'Signing transition idempotency key conflicts with another request.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', existing_event.metadata ->> 'status',
      'requestId', request_id,
      'transitionedAt', existing_event.created_at
    );
  end if;

  select signing_request.* into selected_request
  from public.proposal_signing_requests as signing_request
  where signing_request.id = request_id
    and signing_request.company_id = request_company_id
  for update;

  if selected_request.id is null then
    raise exception using errcode = 'P0001', message = 'Signing request was not found in the selected company.';
  end if;

  if request_action = 'mark_sent'
    and selected_request.expires_at <= transition_time then
    raise exception using
      errcode = 'P0001',
      message = 'Provider-confirmed delivery is preserved, but an expired signing request cannot be activated; revoke it and issue a new link.';
  end if;

  if request_action = 'mark_sent' and (
    selected_request.status not in ('prepared', 'sent')
    or not exists (
      select 1
      from public.estimate_proposal_revisions as revision
      where revision.id = selected_request.proposal_revision_id
        and revision.company_id = selected_request.company_id
        and revision.accepted_acceptance_id is null
        and revision.status in ('ready_to_send', 'sent')
    )
    or not exists (
      select 1
      from public.signatures as signature
      where signature.id = selected_request.signature_id
        and signature.proposal_revision_id = selected_request.proposal_revision_id
        and signature.status in ('pending', 'sent')
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'A delivered signing request cannot transition after terminal proposal evidence exists.';
  elsif request_action in ('mark_failed', 'revoke') and (
    selected_request.status not in ('prepared', 'sent', 'viewed')
    or not exists (
      select 1
      from public.estimate_proposal_revisions as revision
      where revision.id = selected_request.proposal_revision_id
        and revision.company_id = selected_request.company_id
        and revision.accepted_acceptance_id is null
        and revision.accepted_signature_id is null
        and revision.status in ('ready_to_send', 'sent', 'viewed')
    )
    or not exists (
      select 1
      from public.signatures as signature
      where signature.id = selected_request.signature_id
        and signature.proposal_revision_id = selected_request.proposal_revision_id
        and signature.acceptance_id is null
        and signature.status in ('pending', 'sent', 'viewed')
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Signed, declined, expired, failed, revoked, or superseded proposal evidence cannot be failed or revoked.';
  end if;

  if request_action = 'mark_sent' then
    if request_email_message_id is null then
      raise exception using errcode = 'P0001', message = 'Provider-confirmed Gmail delivery evidence is required before marking sent.';
    end if;

    select email.* into selected_email
    from public.email_messages as email
    where email.id = request_email_message_id
      and email.company_id = selected_request.company_id
      and email.customer_id = selected_request.customer_id
      and email.document_id = selected_request.proposal_document_id
      and email.status = 'sent'
      and email.sync_status = 'sent'
      and nullif(email.gmail_message_id, '') is not null
      and email.metadata ->> 'proposalSigningRequestId' = selected_request.id::text
      and email.metadata ->> 'proposalRevisionId' = selected_request.proposal_revision_id::text
      and email.metadata ->> 'proposalDocumentId' = selected_request.proposal_document_id::text
      and lower(email.metadata ->> 'proposalRevisionSha256') = selected_request.revision_sha256
      and lower(email.metadata ->> 'proposalTermsSha256') = selected_request.terms_sha256
      and lower(email.metadata ->> 'proposalDocumentSha256') = selected_request.document_sha256
    for share;

    if selected_email.id is null
      or selected_request.delivery_email_message_id is distinct from selected_email.id
      or lower(selected_email.to_email) is distinct from lower(selected_request.intended_signer_email) then
      raise exception using errcode = 'P0001', message = 'Signing request cannot claim delivery without exact sent Gmail evidence.';
    end if;

    update public.proposal_signing_requests
    set
      status = 'sent',
      delivery_email_message_id = selected_email.id,
      delivery_provider_message_id = selected_email.gmail_message_id,
      sent_at = coalesce(selected_email.sent_at, transition_time),
      updated_at = transition_time
    where id = selected_request.id;

    perform public.wtos_begin_native_proposal_rpc_guard(
      'mark_signing_request_sent',
      request_operation_key
    );
    update public.signatures
    set
      status = 'sent',
      sent_at = coalesce(selected_email.sent_at, transition_time)
    where id = selected_request.signature_id;

    update public.estimate_proposal_revisions
    set
      status = 'sent',
      signature_status = 'awaiting_signature',
      sent_at = coalesce(selected_email.sent_at, transition_time),
      updated_by = request_actor_user_id
    where id = selected_request.proposal_revision_id;

    update public.documents
    set status = 'sent'
    where id = selected_request.proposal_document_id;
    perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

    target_status := 'sent';
  elsif request_action = 'mark_failed' then
    if request_failure_code is null then
      raise exception using errcode = 'P0001', message = 'A non-sensitive delivery failure code is required.';
    end if;

    update public.proposal_signing_requests
    set
      status = 'failed',
      failure_code = request_failure_code,
      failed_at = transition_time,
      updated_at = transition_time
    where id = selected_request.id;

    perform public.wtos_begin_native_proposal_rpc_guard(
      'mark_signing_request_failed',
      request_operation_key
    );
    update public.signatures
    set status = 'failed'
    where id = selected_request.signature_id;

    update public.estimate_proposal_revisions
    set
      status = 'ready_to_send',
      signature_status = 'failed',
      updated_by = request_actor_user_id
    where id = selected_request.proposal_revision_id;
    perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

    target_status := 'failed';
  else
    if request_reason is null then
      raise exception using errcode = 'P0001', message = 'A signing request revocation reason is required.';
    end if;

    update public.proposal_signing_sessions
    set
      status = 'revoked',
      revoked_at = transition_time,
      updated_at = transition_time
    where signing_request_id = selected_request.id
      and status = 'active';

    update public.proposal_signing_requests
    set
      status = 'revoked',
      revocation_reason = request_reason,
      revoked_at = transition_time,
      updated_at = transition_time
    where id = selected_request.id;

    perform public.wtos_begin_native_proposal_rpc_guard(
      'revoke_signing_request',
      request_operation_key
    );
    update public.signatures
    set status = 'revoked'
    where id = selected_request.signature_id;

    update public.estimate_proposal_revisions
    set
      status = 'ready_to_send',
      signature_status = 'ready_to_send',
      updated_by = request_actor_user_id
    where id = selected_request.proposal_revision_id;
    perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

    target_status := 'revoked';
  end if;

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    actor_id,
    summary,
    metadata,
    idempotency_key
  )
  values (
    selected_request.company_id,
    selected_request.proposal_revision_id,
    selected_request.estimate_id,
    selected_request.customer_id,
    'native_signature_request_' || request_action,
    'internal',
    request_actor_user_id,
    case request_action
      when 'mark_sent' then 'Recorded provider-confirmed native proposal signature delivery.'
      when 'mark_failed' then 'Recorded truthful native proposal signature delivery failure.'
      else 'Revoked native proposal signing request.'
    end,
    jsonb_build_object(
      'requestId', selected_request.id,
      'status', target_status,
      'emailMessageId', request_email_message_id,
      'failureCode', request_failure_code,
      'reason', request_reason
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', target_status,
    'requestId', selected_request.id,
    'transitionedAt', transition_time
  );
end;
$$;

revoke all on function public.wtos_transition_proposal_signing_request(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_transition_proposal_signing_request(jsonb)
to service_role;

create or replace function public.wtos_exchange_proposal_signing_token(
  signing_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid := nullif(signing_request ->> 'requestId', '')::uuid;
  request_token_sha256 text := lower(nullif(signing_request ->> 'tokenHash', ''));
  request_session_sha256 text := lower(nullif(signing_request ->> 'sessionHash', ''));
  request_session_expires_at timestamptz := nullif(signing_request ->> 'sessionExpiresAt', '')::timestamptz;
  request_ip_hash text := lower(nullif(signing_request ->> 'ipHash', ''));
  request_user_agent text := nullif(signing_request ->> 'userAgent', '');
  selected_request public.proposal_signing_requests%rowtype;
  confirmed_email public.email_messages%rowtype;
  created_session public.proposal_signing_sessions%rowtype;
  attempt_time timestamptz := clock_timestamp();
  attempt_count integer;
  attempt_window timestamptz;
begin
  if request_id is null
    or request_token_sha256 !~ '^[0-9a-f]{64}$'
    or request_session_sha256 !~ '^[0-9a-f]{64}$'
    or request_session_expires_at is null
    or (request_ip_hash is not null and request_ip_hash !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing link is invalid, expired, or no longer active.'
    );
  end if;

  select signing_link.* into selected_request
  from public.proposal_signing_requests as signing_link
  where signing_link.id = request_id
  for update;

  if selected_request.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing link is invalid, expired, or no longer active.'
    );
  end if;

  if selected_request.exchange_blocked_until is not null
    and selected_request.exchange_blocked_until > attempt_time then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing attempts. Wait a few minutes and try again.'
    );
  end if;

  if selected_request.exchange_window_started_at is null
    or selected_request.exchange_window_started_at <= attempt_time - interval '15 minutes' then
    attempt_window := attempt_time;
    attempt_count := 1;
  else
    attempt_window := selected_request.exchange_window_started_at;
    attempt_count := selected_request.exchange_attempt_count + 1;
  end if;

  update public.proposal_signing_requests
  set
    exchange_attempt_count = attempt_count,
    exchange_window_started_at = attempt_window,
    exchange_blocked_until = case
      when attempt_count > 12 then attempt_time + interval '15 minutes'
      else null
    end,
    updated_at = attempt_time
  where id = selected_request.id;

  if attempt_count > 12 then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing attempts. Wait a few minutes and try again.'
    );
  end if;

  if selected_request.request_token_sha256 is distinct from request_token_sha256
    or selected_request.expires_at <= attempt_time then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing link is invalid, expired, or no longer active.'
    );
  end if;

  if selected_request.request_token_consumed_at is not null then
    select session.* into created_session
    from public.proposal_signing_sessions as session
    where session.id = selected_request.request_token_consumed_session_id
      and session.company_id = selected_request.company_id
      and session.signing_request_id = selected_request.id
      and session.session_token_sha256 = request_session_sha256
    for update;

    -- Preserve the original response-loss contract exactly: the first exchange
    -- may be replayed only with the same derived session credential while that
    -- active session remains valid.
    if created_session.id is null
      or created_session.status <> 'active'
      or created_session.expires_at <= attempt_time
      or selected_request.status <> 'viewed' then
      -- A consumed invitation never creates another signing-capable session.
      -- Only a fresh derived credential for an already-signed exact request may
      -- continue below to receive bounded read-only signed access.
      if selected_request.status <> 'signed'
        or created_session.id is not null then
        return jsonb_build_object(
          'ok', false,
          'status', 'invalid_or_expired',
          'message', 'This signing link is invalid, expired, or no longer active.'
        );
      end if;
    else
      update public.proposal_signing_sessions
      set
        last_seen_at = attempt_time,
        updated_at = attempt_time
      where id = created_session.id;

      return jsonb_build_object(
        'ok', true,
        'status', 'active',
        'requestId', selected_request.id,
        'sessionId', created_session.id,
        'sessionExpiresAt', created_session.expires_at
      );
    end if;
  end if;

  -- A still-valid link near its deadline remains usable. Cap the server-side
  -- session to the exact request deadline (and the ordinary 24-hour ceiling)
  -- rather than rejecting a client request for a longer cookie lifetime.
  request_session_expires_at := least(
    request_session_expires_at,
    selected_request.expires_at,
    attempt_time + interval '24 hours'
  );

  if request_session_expires_at <= attempt_time then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing link is invalid, expired, or no longer active.'
    );
  end if;

  if selected_request.request_token_consumed_at is not null then
    -- Signed-link renewal is deliberately read-only. It requires the exact
    -- original hashed invitation plus the complete company-scoped acceptance
    -- evidence, and it mints a terminal `signed` session rather than `active`.
    -- The accept/decline RPCs require an active session for new actions, while
    -- exact acceptance response-loss replay remains bound to the original
    -- session hash stored in acceptance_request_sha256.
    if not exists (
      select 1
      from public.proposal_signing_sessions as consumed_session
      join public.estimate_proposal_acceptances as acceptance
        on acceptance.signing_request_id = selected_request.id
       and acceptance.company_id = selected_request.company_id
       and acceptance.proposal_revision_id = selected_request.proposal_revision_id
      join public.estimate_proposal_revisions as revision
        on revision.id = acceptance.proposal_revision_id
       and revision.company_id = acceptance.company_id
      join public.signatures as signature
        on signature.id = acceptance.signature_id
       and signature.company_id = acceptance.company_id
       and signature.proposal_revision_id = acceptance.proposal_revision_id
      join public.documents as document
        on document.id = acceptance.proposal_document_id
       and document.company_id = acceptance.company_id
       and document.proposal_revision_id = acceptance.proposal_revision_id
      where consumed_session.id = selected_request.request_token_consumed_session_id
        and consumed_session.signing_request_id = selected_request.id
        and consumed_session.company_id = selected_request.company_id
        and consumed_session.status = 'signed'
        and consumed_session.signed_at = selected_request.signed_at
        and revision.status in ('accepted', 'converted_to_job')
        and revision.signature_status = 'signed'
        and revision.accepted_acceptance_id = acceptance.id
        and revision.accepted_signature_id = signature.id
        and acceptance.acceptance_method = 'native_electronic'
        and acceptance.signature_status = 'signed'
        and acceptance.accepted_at = selected_request.signed_at
        and signature.status = 'signed'
        and signature.acceptance_id = acceptance.id
        and signature.signed_at = selected_request.signed_at
        and selected_request.signature_id = signature.id
        and selected_request.proposal_document_id = document.id
        and revision.finalized_document_id = document.id
        and signature.document_id = document.id
        and document.category = 'proposal'
        and document.storage_bucket = 'customer-documents'
        and document.file_url is null
        and document.immutable_after_at is not null
        and selected_request.revision_sha256 = revision.revision_sha256
        and selected_request.document_sha256 = document.content_sha256
        and selected_request.terms_sha256 = revision.terms_sha256
        and acceptance.proposal_revision_sha256 = selected_request.revision_sha256
        and acceptance.proposal_document_sha256 = selected_request.document_sha256
        and acceptance.terms_sha256 = selected_request.terms_sha256
        and acceptance.consent_sha256 = selected_request.consent_sha256
        and acceptance.evidence_sha256 = signature.evidence_sha256
        and acceptance.accepted_total = revision.accepted_total
        and lower(acceptance.signer_email) = lower(selected_request.intended_signer_email)
        and acceptance.signer_name = selected_request.intended_signer_name
    ) then
      return jsonb_build_object(
        'ok', false,
        'status', 'invalid_or_expired',
        'message', 'This signing link is invalid, expired, or no longer active.'
      );
    end if;

    if exists (
      select 1
      from public.proposal_signing_sessions as conflicting_session
      where conflicting_session.session_token_sha256 = request_session_sha256
        and conflicting_session.signing_request_id <> selected_request.id
    ) then
      return jsonb_build_object(
        'ok', false,
        'status', 'conflict',
        'message', 'The secure signed-proposal session could not be created.'
      );
    end if;

    insert into public.proposal_signing_sessions (
      company_id,
      signing_request_id,
      session_token_sha256,
      status,
      initial_ip_hash,
      initial_user_agent,
      opened_at,
      last_seen_at,
      expires_at,
      signed_at,
      created_at,
      updated_at
    )
    values (
      selected_request.company_id,
      selected_request.id,
      request_session_sha256,
      'signed',
      request_ip_hash,
      left(request_user_agent, 500),
      attempt_time,
      attempt_time,
      request_session_expires_at,
      selected_request.signed_at,
      attempt_time,
      attempt_time
    )
    on conflict (session_token_sha256) do update
    set last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    where proposal_signing_sessions.signing_request_id = excluded.signing_request_id
      and proposal_signing_sessions.company_id = excluded.company_id
      and proposal_signing_sessions.status = 'signed'
      and proposal_signing_sessions.expires_at > attempt_time
    returning * into created_session;

    if created_session.id is null then
      return jsonb_build_object(
        'ok', false,
        'status', 'conflict',
        'message', 'The secure signed-proposal session could not be created.'
      );
    end if;

    insert into public.proposal_audit_events (
      company_id,
      proposal_revision_id,
      estimate_id,
      customer_id,
      event_type,
      actor_type,
      summary,
      metadata,
      idempotency_key
    )
    values (
      selected_request.company_id,
      selected_request.proposal_revision_id,
      selected_request.estimate_id,
      selected_request.customer_id,
      'native_signed_proposal_link_reopened',
      'customer',
      'Customer reopened an exact signed proposal through bounded read-only access.',
      jsonb_build_object(
        'requestId', selected_request.id,
        'sessionId', created_session.id,
        'sessionExpiresAt', created_session.expires_at,
        'accessMode', 'signed_read_only',
        'ipHash', request_ip_hash,
        'userAgent', left(request_user_agent, 500)
      ),
      created_session.id::text
    )
    on conflict (company_id, event_type, idempotency_key) do nothing;

    return jsonb_build_object(
      'ok', true,
      'status', 'signed',
      'requestId', selected_request.id,
      'sessionId', created_session.id,
      'sessionExpiresAt', created_session.expires_at
    );
  end if;

  if selected_request.status = 'prepared' then
    select email.* into confirmed_email
    from public.email_messages as email
    where email.id = selected_request.delivery_email_message_id
      and email.company_id = selected_request.company_id
      and email.customer_id = selected_request.customer_id
      and email.estimate_id = selected_request.estimate_id
      and email.document_id = selected_request.proposal_document_id
      and email.status = 'sent'
      and email.sync_status = 'sent'
      and nullif(email.gmail_message_id, '') is not null
      and email.metadata ->> 'proposalSigningRequestId' = selected_request.id::text
      and email.metadata ->> 'proposalRevisionId' = selected_request.proposal_revision_id::text
      and email.metadata ->> 'proposalDocumentId' = selected_request.proposal_document_id::text
      and lower(email.metadata ->> 'proposalRevisionSha256') = selected_request.revision_sha256
      and lower(email.metadata ->> 'proposalTermsSha256') = selected_request.terms_sha256
      and lower(email.metadata ->> 'proposalDocumentSha256') = selected_request.document_sha256
      and lower(email.to_email) = lower(selected_request.intended_signer_email)
    for share;

    if confirmed_email.id is not null then
      update public.proposal_signing_requests
      set
        status = 'sent',
        delivery_provider_message_id = confirmed_email.gmail_message_id,
        sent_at = coalesce(confirmed_email.sent_at, attempt_time),
        updated_at = attempt_time
      where id = selected_request.id;

      perform public.wtos_begin_native_proposal_rpc_guard(
        'reconcile_signing_delivery',
        selected_request.id
      );
      update public.signatures
      set
        status = 'sent',
        sent_at = coalesce(confirmed_email.sent_at, attempt_time)
      where id = selected_request.signature_id
        and status = 'pending';

      update public.estimate_proposal_revisions
      set
        status = 'sent',
        signature_status = 'awaiting_signature',
        sent_at = coalesce(confirmed_email.sent_at, attempt_time)
      where id = selected_request.proposal_revision_id
        and status = 'ready_to_send';

      update public.documents
      set status = 'sent'
      where id = selected_request.proposal_document_id;
      perform public.wtos_end_native_proposal_rpc_guard(selected_request.id);

      insert into public.proposal_audit_events (
        company_id,
        proposal_revision_id,
        estimate_id,
        customer_id,
        event_type,
        actor_type,
        summary,
        metadata,
        idempotency_key
      )
      values (
        selected_request.company_id,
        selected_request.proposal_revision_id,
        selected_request.estimate_id,
        selected_request.customer_id,
        'native_signature_request_delivery_reconciled',
        'system',
        'Activated an exact delivered signing request from durable Gmail provider evidence.',
        jsonb_build_object(
          'requestId', selected_request.id,
          'emailMessageId', confirmed_email.id,
          'providerMessageId', confirmed_email.gmail_message_id
        ),
        selected_request.id::text
      )
      on conflict (company_id, event_type, idempotency_key) do nothing;

      select signing_link.* into selected_request
      from public.proposal_signing_requests as signing_link
      where signing_link.id = request_id;
    end if;
  end if;

  if selected_request.status not in ('sent', 'viewed') then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing link is invalid, expired, or no longer active.'
    );
  end if;

  if exists (
    select 1
    from public.proposal_signing_sessions as conflicting_session
    where conflicting_session.session_token_sha256 = request_session_sha256
      and conflicting_session.signing_request_id <> selected_request.id
  ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'The secure signing session could not be created.'
    );
  end if;

  insert into public.proposal_signing_sessions (
    company_id,
    signing_request_id,
    session_token_sha256,
    status,
    initial_ip_hash,
    initial_user_agent,
    opened_at,
    last_seen_at,
    expires_at,
    created_at,
    updated_at
  )
  values (
    selected_request.company_id,
    selected_request.id,
    request_session_sha256,
    'active',
    request_ip_hash,
    left(request_user_agent, 500),
    attempt_time,
    attempt_time,
    request_session_expires_at,
    attempt_time,
    attempt_time
  )
  on conflict (session_token_sha256) do update
  set last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  where proposal_signing_sessions.signing_request_id = excluded.signing_request_id
    and proposal_signing_sessions.status = 'active'
  returning * into created_session;

  if created_session.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'The secure signing session could not be created.'
    );
  end if;

  update public.proposal_signing_requests
  set
    status = 'viewed',
    request_token_consumed_at = attempt_time,
    request_token_consumed_session_id = created_session.id,
    first_viewed_at = coalesce(first_viewed_at, attempt_time),
    updated_at = attempt_time
  where id = selected_request.id;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'open_signing_session',
    selected_request.id
  );
  update public.signatures
  set
    status = 'viewed',
    viewed_at = coalesce(viewed_at, attempt_time)
  where id = selected_request.signature_id
    and status in ('sent', 'viewed');

  update public.estimate_proposal_revisions
  set
    status = 'viewed',
    viewed_at = coalesce(viewed_at, attempt_time)
  where id = selected_request.proposal_revision_id
    and status in ('sent', 'viewed');
  perform public.wtos_end_native_proposal_rpc_guard(selected_request.id);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    summary,
    metadata,
    idempotency_key
  )
  values (
    selected_request.company_id,
    selected_request.proposal_revision_id,
    selected_request.estimate_id,
    selected_request.customer_id,
    'native_signature_link_opened',
    'customer',
    'Customer exchanged the hashed signing-link credential for a bounded session.',
    jsonb_build_object(
      'requestId', selected_request.id,
      'sessionId', created_session.id,
      'sessionExpiresAt', created_session.expires_at,
      'ipHash', request_ip_hash,
      'userAgent', left(request_user_agent, 500)
    ),
    created_session.id::text
  )
  on conflict (company_id, event_type, idempotency_key) do nothing;

  return jsonb_build_object(
    'ok', true,
    'status', 'active',
    'requestId', selected_request.id,
    'sessionId', created_session.id,
    'sessionExpiresAt', created_session.expires_at
  );
end;
$$;

revoke all on function public.wtos_exchange_proposal_signing_token(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_exchange_proposal_signing_token(jsonb)
to service_role;

create or replace function public.wtos_get_proposal_signing_session(
  signing_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid := nullif(signing_request ->> 'requestId', '')::uuid;
  request_session_sha256 text := lower(nullif(signing_request ->> 'sessionHash', ''));
  selected_request public.proposal_signing_requests%rowtype;
  selected_session public.proposal_signing_sessions%rowtype;
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_document public.documents%rowtype;
  selected_acceptance public.estimate_proposal_acceptances%rowtype;
  selected_receipt public.proposal_signature_receipts%rowtype;
  selected_receipt_document public.documents%rowtype;
  access_time timestamptz := clock_timestamp();
  attempt_count integer;
  attempt_window timestamptz;
  proposal_payload jsonb;
  acceptance_payload jsonb := null;
  receipt_payload jsonb := null;
begin
  if request_id is null or request_session_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing session is invalid or expired.'
    );
  end if;

  select signing_link.* into selected_request
  from public.proposal_signing_requests as signing_link
  where signing_link.id = request_id
  for update;

  if selected_request.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing session is invalid or expired.'
    );
  end if;

  if selected_request.session_read_blocked_until is not null
    and selected_request.session_read_blocked_until > access_time then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing requests. Wait a few minutes and try again.'
    );
  end if;

  if selected_request.session_read_window_started_at is null
    or selected_request.session_read_window_started_at <= access_time - interval '15 minutes' then
    attempt_window := access_time;
    attempt_count := 1;
  else
    attempt_window := selected_request.session_read_window_started_at;
    attempt_count := selected_request.session_read_attempt_count + 1;
  end if;

  update public.proposal_signing_requests
  set
    session_read_attempt_count = attempt_count,
    session_read_window_started_at = attempt_window,
    session_read_blocked_until = case
      when attempt_count > 180 then access_time + interval '15 minutes'
      else null
    end,
    updated_at = access_time
  where id = selected_request.id;

  if attempt_count > 180 then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing requests. Wait a few minutes and try again.'
    );
  end if;

  select session.* into selected_session
  from public.proposal_signing_sessions as session
  where session.signing_request_id = selected_request.id
    and session.session_token_sha256 = request_session_sha256
  for update;

  if selected_session.id is null
    or selected_session.status not in ('active', 'signed', 'declined')
    or selected_session.expires_at <= access_time
    or selected_request.expires_at <= access_time
    or (selected_session.status = 'active' and selected_request.status not in ('sent', 'viewed'))
    or (selected_session.status = 'signed' and selected_request.status <> 'signed')
    or (selected_session.status = 'declined' and selected_request.status <> 'declined') then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing session is invalid or expired.'
    );
  end if;

  update public.proposal_signing_sessions
  set
    last_seen_at = access_time,
    updated_at = access_time
  where id = selected_session.id;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = selected_request.proposal_revision_id
    and revision.company_id = selected_request.company_id;

  select document.* into selected_document
  from public.documents as document
  where document.id = selected_request.proposal_document_id
    and document.proposal_revision_id = selected_revision.id
    and document.company_id = selected_revision.company_id;

  if selected_revision.id is null
    or selected_document.id is null
    or selected_revision.customer_snapshot is null
    or selected_revision.revision_sha256 is distinct from selected_request.revision_sha256
    or selected_revision.terms_sha256 is distinct from selected_request.terms_sha256
    or selected_document.content_sha256 is distinct from selected_request.document_sha256 then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'The exact finalized proposal could not be verified.'
    );
  end if;

  proposal_payload := jsonb_build_object(
    'schemaVersion', 'native-proposal-v1',
    'companyId', selected_revision.company_id,
    'companyName', selected_revision.customer_snapshot #>> '{company,name}',
    'brandName', selected_revision.customer_snapshot #>> '{company,brandName}',
    'brandPrimaryColor', selected_revision.customer_snapshot #>> '{company,primaryColor}',
    'brandAccentColor', selected_revision.customer_snapshot #>> '{company,accentColor}',
    'proposalNumber', selected_revision.proposal_number,
    'revisionNumber', selected_revision.revision_number,
    'title', selected_revision.title,
    'issueDate', selected_revision.customer_snapshot #>> '{proposal,issueDate}',
    'customerName', selected_revision.customer_snapshot #>> '{customer,name}',
    'propertyAddress', selected_revision.customer_snapshot #>> '{property,address}',
    'baseSubtotal', selected_revision.base_subtotal,
    'discountTotal', selected_revision.discount_total,
    'taxTotal', selected_revision.tax_total,
    'feeTotal', selected_revision.fee_total,
    'baseTotal', selected_revision.base_total,
    'lineItems', coalesce(selected_revision.customer_snapshot -> 'lineItems', '[]'::jsonb),
    'selectedOptionIds', coalesce(selected_revision.customer_snapshot -> 'selectedOptionIds', '[]'::jsonb),
    'selectedUpgradesTotal', selected_revision.selected_upgrades_total,
    'acceptedTotal', selected_revision.accepted_total,
    'depositType', selected_revision.deposit_type,
    'depositValue', selected_revision.deposit_value,
    'depositRequired', selected_revision.deposit_required,
    'requiresDepositBeforeJob', selected_revision.requires_deposit_before_job,
    'requiredDepositAmount', selected_revision.deposit_amount,
    'remainingBalance', selected_revision.remaining_balance,
    'terms', coalesce(selected_revision.terms, ''),
    'electronicRecordsDisclosure', selected_request.consent_text,
    'revisionSha256', selected_revision.revision_sha256,
    'termsSha256', selected_revision.terms_sha256,
    'consentSha256', selected_request.consent_sha256,
    'sections', coalesce(selected_revision.customer_snapshot -> 'sections', '[]'::jsonb),
    'options', coalesce(selected_revision.customer_snapshot -> 'options', '[]'::jsonb)
  );

  if selected_request.status = 'signed' then
    select acceptance.* into selected_acceptance
    from public.estimate_proposal_acceptances as acceptance
    where acceptance.signing_request_id = selected_request.id;

    if selected_acceptance.id is null then
      return jsonb_build_object(
        'ok', false,
        'status', 'invalid_or_expired',
        'message', 'Signed proposal evidence could not be verified.'
      );
    end if;

    acceptance_payload := jsonb_build_object(
      'acceptanceId', selected_acceptance.id,
      'signatureId', selected_acceptance.signature_id,
      'signerName', selected_acceptance.signer_name,
      'signerEmail', selected_acceptance.signer_email,
      'selectedOptionIds', selected_acceptance.selected_option_ids,
      'acceptedTotal', selected_acceptance.accepted_total,
      'requiredDepositAmount', selected_acceptance.required_deposit_amount,
      'acceptedAt', selected_acceptance.accepted_at,
      'evidenceSha256', selected_acceptance.evidence_sha256,
      'termsSha256', selected_acceptance.terms_sha256,
      'consentSha256', selected_acceptance.consent_sha256
    );

    select receipt.* into selected_receipt
    from public.proposal_signature_receipts as receipt
    where receipt.signing_request_id = selected_request.id;

    if selected_receipt.id is not null then
      select document.* into selected_receipt_document
      from public.documents as document
      where document.id = selected_receipt.signed_document_id
        and document.company_id = selected_receipt.company_id;

      if selected_receipt_document.id is null
        or selected_receipt_document.content_sha256 is distinct from selected_receipt.signed_document_sha256 then
        return jsonb_build_object(
          'ok', false,
          'status', 'invalid_or_expired',
          'message', 'Signed receipt evidence could not be verified.'
        );
      end if;

      receipt_payload := jsonb_build_object(
        'documentId', selected_receipt_document.id,
        'bucket', selected_receipt_document.storage_bucket,
        'path', selected_receipt_document.storage_path,
        'fileName', selected_receipt_document.file_name,
        'mimeType', selected_receipt_document.mime_type,
        'sizeBytes', selected_receipt_document.file_size_bytes,
        'sha256', selected_receipt_document.content_sha256,
        'registeredAt', selected_receipt.registered_at
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', selected_session.status,
    'requestId', selected_request.id,
    'sessionId', selected_session.id,
    'sessionExpiresAt', selected_session.expires_at,
    'requestExpiresAt', selected_request.expires_at,
    'signer', jsonb_build_object(
      'name', selected_request.intended_signer_name,
      'email', selected_request.intended_signer_email
    ),
    'proposal', proposal_payload,
    'document', jsonb_build_object(
      'id', selected_document.id,
      'bucket', selected_document.storage_bucket,
      'path', selected_document.storage_path,
      'fileName', selected_document.file_name,
      'mimeType', selected_document.mime_type,
      'sizeBytes', selected_document.file_size_bytes,
      'sha256', selected_document.content_sha256
    ),
    'receipt', receipt_payload,
    'acceptance', acceptance_payload
  );
end;
$$;

revoke all on function public.wtos_get_proposal_signing_session(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_get_proposal_signing_session(jsonb)
to service_role;

create or replace function public.wtos_get_proposal_signing_receipt_recovery(
  recovery_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid := nullif(recovery_request ->> 'requestId', '')::uuid;
  request_company_id uuid := nullif(recovery_request ->> 'companyId', '')::uuid;
  request_revision_id uuid := nullif(recovery_request ->> 'proposalRevisionId', '')::uuid;
  request_acceptance_id uuid := nullif(recovery_request ->> 'acceptanceId', '')::uuid;
  selected_request public.proposal_signing_requests%rowtype;
  selected_session public.proposal_signing_sessions%rowtype;
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_acceptance public.estimate_proposal_acceptances%rowtype;
  selected_signature public.signatures%rowtype;
  selected_document public.documents%rowtype;
  selected_receipt public.proposal_signature_receipts%rowtype;
  selected_receipt_document public.documents%rowtype;
  expected_selected_option_ids uuid[];
  proposal_payload jsonb;
  acceptance_payload jsonb;
  receipt_payload jsonb := null;
begin
  if recovery_request is null
    or jsonb_typeof(recovery_request) <> 'object'
    or request_id is null
    or request_company_id is null
    or request_revision_id is null
    or request_acceptance_id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'Exact signed proposal receipt recovery identity is required.'
    );
  end if;

  select signing_request.* into selected_request
  from public.proposal_signing_requests as signing_request
  where signing_request.id = request_id
    and signing_request.company_id = request_company_id
    and signing_request.proposal_revision_id = request_revision_id
  for share;

  if selected_request.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'Exact signed proposal receipt recovery evidence was not found.'
    );
  end if;

  select session.* into selected_session
  from public.proposal_signing_sessions as session
  where session.id = selected_request.request_token_consumed_session_id
    and session.signing_request_id = selected_request.id
    and session.company_id = selected_request.company_id
  for share;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for share;

  select acceptance.* into selected_acceptance
  from public.estimate_proposal_acceptances as acceptance
  where acceptance.id = request_acceptance_id
    and acceptance.company_id = request_company_id
    and acceptance.proposal_revision_id = request_revision_id
    and acceptance.signing_request_id = request_id
  for share;

  select signature.* into selected_signature
  from public.signatures as signature
  where signature.id = selected_request.signature_id
    and signature.company_id = selected_request.company_id
    and signature.proposal_revision_id = selected_request.proposal_revision_id
  for share;

  select document.* into selected_document
  from public.documents as document
  where document.id = selected_request.proposal_document_id
    and document.company_id = selected_request.company_id
    and document.proposal_revision_id = selected_request.proposal_revision_id
  for share;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into expected_selected_option_ids
  from jsonb_array_elements_text(
    coalesce(selected_revision.customer_snapshot -> 'selectedOptionIds', '[]'::jsonb)
  );

  if selected_session.id is null
    or selected_revision.id is null
    or selected_acceptance.id is null
    or selected_signature.id is null
    or selected_document.id is null
    or selected_request.status <> 'signed'
    or selected_session.status <> 'signed'
    or selected_revision.status not in ('accepted', 'converted_to_job')
    or selected_revision.signature_status <> 'signed'
    or selected_acceptance.acceptance_method <> 'native_electronic'
    or selected_acceptance.signature_status <> 'signed'
    or selected_signature.status <> 'signed'
    or selected_revision.accepted_acceptance_id is distinct from selected_acceptance.id
    or selected_revision.accepted_signature_id is distinct from selected_signature.id
    or selected_request.signature_id is distinct from selected_signature.id
    or selected_acceptance.signature_id is distinct from selected_signature.id
    or selected_signature.acceptance_id is distinct from selected_acceptance.id
    or selected_revision.finalized_document_id is distinct from selected_document.id
    or selected_acceptance.proposal_document_id is distinct from selected_document.id
    or selected_signature.document_id is distinct from selected_document.id
    or selected_document.category <> 'proposal'
    or selected_document.storage_bucket <> 'customer-documents'
    or selected_document.file_url is not null
    or selected_document.immutable_after_at is null
    or selected_request.revision_sha256 is distinct from selected_revision.revision_sha256
    or selected_request.document_sha256 is distinct from selected_document.content_sha256
    or selected_request.terms_sha256 is distinct from selected_revision.terms_sha256
    or selected_acceptance.proposal_revision_sha256 is distinct from selected_request.revision_sha256
    or selected_acceptance.proposal_document_sha256 is distinct from selected_request.document_sha256
    or selected_acceptance.terms_sha256 is distinct from selected_request.terms_sha256
    or selected_acceptance.consent_sha256 is distinct from selected_request.consent_sha256
    or selected_acceptance.evidence_sha256 is distinct from selected_signature.evidence_sha256
    or selected_acceptance.selected_option_ids is distinct from expected_selected_option_ids
    or selected_acceptance.accepted_total is distinct from selected_revision.accepted_total
    or lower(selected_acceptance.signer_email) is distinct from lower(selected_request.intended_signer_email)
    or selected_acceptance.signer_name is distinct from selected_request.intended_signer_name then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'Signed proposal receipt recovery refused inconsistent immutable evidence.'
    );
  end if;

  select receipt.* into selected_receipt
  from public.proposal_signature_receipts as receipt
  where receipt.signing_request_id = selected_request.id
  for share;

  if selected_receipt.id is not null then
    select document.* into selected_receipt_document
    from public.documents as document
    where document.id = selected_receipt.signed_document_id
      and document.company_id = selected_receipt.company_id
      and document.proposal_revision_id = selected_receipt.proposal_revision_id
    for share;

    if selected_receipt.proposal_revision_id is distinct from selected_revision.id
      or selected_receipt.acceptance_id is distinct from selected_acceptance.id
      or selected_receipt.signature_id is distinct from selected_signature.id
      or selected_receipt.source_document_id is distinct from selected_document.id
      or selected_revision.signed_document_id is distinct from selected_receipt.signed_document_id
      or selected_signature.signed_document_id is distinct from selected_receipt.signed_document_id
      or selected_receipt.revision_sha256 is distinct from selected_revision.revision_sha256
      or selected_receipt.source_document_sha256 is distinct from selected_document.content_sha256
      or selected_receipt.evidence_sha256 is distinct from selected_acceptance.evidence_sha256
      or selected_receipt_document.id is null
      or selected_receipt_document.category <> 'signed_proposal'
      or selected_receipt_document.storage_bucket <> 'customer-documents'
      or selected_receipt_document.file_url is not null
      or selected_receipt_document.immutable_after_at is null
      or selected_receipt_document.content_sha256 is distinct from selected_receipt.signed_document_sha256 then
      return jsonb_build_object(
        'ok', false,
        'status', 'conflict',
        'message', 'Registered proposal receipt recovery evidence is inconsistent.'
      );
    end if;

    receipt_payload := jsonb_build_object(
      'documentId', selected_receipt_document.id,
      'bucket', selected_receipt_document.storage_bucket,
      'path', selected_receipt_document.storage_path,
      'fileName', selected_receipt_document.file_name,
      'mimeType', selected_receipt_document.mime_type,
      'sizeBytes', selected_receipt_document.file_size_bytes,
      'sha256', selected_receipt_document.content_sha256,
      'registeredAt', selected_receipt.registered_at
    );
  elsif selected_revision.signed_document_id is not null
    or selected_signature.signed_document_id is not null then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'Proposal receipt bindings exist without exact registered receipt evidence.'
    );
  end if;

  proposal_payload := jsonb_build_object(
    'schemaVersion', 'native-proposal-v1',
    'companyId', selected_revision.company_id,
    'companyName', selected_revision.customer_snapshot #>> '{company,name}',
    'brandName', selected_revision.customer_snapshot #>> '{company,brandName}',
    'brandPrimaryColor', selected_revision.customer_snapshot #>> '{company,primaryColor}',
    'brandAccentColor', selected_revision.customer_snapshot #>> '{company,accentColor}',
    'proposalNumber', selected_revision.proposal_number,
    'revisionNumber', selected_revision.revision_number,
    'title', selected_revision.title,
    'issueDate', selected_revision.customer_snapshot #>> '{proposal,issueDate}',
    'customerName', selected_revision.customer_snapshot #>> '{customer,name}',
    'propertyAddress', selected_revision.customer_snapshot #>> '{property,address}',
    'baseSubtotal', selected_revision.base_subtotal,
    'discountTotal', selected_revision.discount_total,
    'taxTotal', selected_revision.tax_total,
    'feeTotal', selected_revision.fee_total,
    'baseTotal', selected_revision.base_total,
    'lineItems', coalesce(selected_revision.customer_snapshot -> 'lineItems', '[]'::jsonb),
    'selectedOptionIds', coalesce(selected_revision.customer_snapshot -> 'selectedOptionIds', '[]'::jsonb),
    'selectedUpgradesTotal', selected_revision.selected_upgrades_total,
    'acceptedTotal', selected_revision.accepted_total,
    'depositType', selected_revision.deposit_type,
    'depositValue', selected_revision.deposit_value,
    'depositRequired', selected_revision.deposit_required,
    'requiresDepositBeforeJob', selected_revision.requires_deposit_before_job,
    'requiredDepositAmount', selected_revision.deposit_amount,
    'remainingBalance', selected_revision.remaining_balance,
    'terms', coalesce(selected_revision.terms, ''),
    'electronicRecordsDisclosure', selected_request.consent_text,
    'revisionSha256', selected_revision.revision_sha256,
    'termsSha256', selected_revision.terms_sha256,
    'consentSha256', selected_request.consent_sha256,
    'sections', coalesce(selected_revision.customer_snapshot -> 'sections', '[]'::jsonb),
    'options', coalesce(selected_revision.customer_snapshot -> 'options', '[]'::jsonb)
  );

  acceptance_payload := jsonb_build_object(
    'acceptanceId', selected_acceptance.id,
    'signatureId', selected_acceptance.signature_id,
    'signerName', selected_acceptance.signer_name,
    'signerEmail', selected_acceptance.signer_email,
    'selectedOptionIds', selected_acceptance.selected_option_ids,
    'acceptedTotal', selected_acceptance.accepted_total,
    'requiredDepositAmount', selected_acceptance.required_deposit_amount,
    'acceptedAt', selected_acceptance.accepted_at,
    'evidenceSha256', selected_acceptance.evidence_sha256,
    'termsSha256', selected_acceptance.terms_sha256,
    'consentSha256', selected_acceptance.consent_sha256
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'signed',
    'requestId', selected_request.id,
    'sessionId', selected_session.id,
    'sessionExpiresAt', selected_session.expires_at,
    'requestExpiresAt', selected_request.expires_at,
    'signer', jsonb_build_object(
      'name', selected_request.intended_signer_name,
      'email', selected_request.intended_signer_email
    ),
    'proposal', proposal_payload,
    'document', jsonb_build_object(
      'id', selected_document.id,
      'bucket', selected_document.storage_bucket,
      'path', selected_document.storage_path,
      'fileName', selected_document.file_name,
      'mimeType', selected_document.mime_type,
      'sizeBytes', selected_document.file_size_bytes,
      'sha256', selected_document.content_sha256
    ),
    'receipt', receipt_payload,
    'acceptance', acceptance_payload
  );
end;
$$;

revoke all on function public.wtos_get_proposal_signing_receipt_recovery(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_get_proposal_signing_receipt_recovery(jsonb)
to service_role;

create or replace function public.wtos_validate_native_proposal_acceptance_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_request public.proposal_signing_requests%rowtype;
  selected_revision public.estimate_proposal_revisions%rowtype;
  session_id uuid := nullif(new.audit_metadata ->> 'signingSessionId', '')::uuid;
  expected_selected_option_ids uuid[];
  expected_evidence jsonb;
  expected_evidence_sha256 text;
begin
  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = new.proposal_revision_id;

  if new.acceptance_method <> 'native_electronic' then
    if selected_revision.id is not null and (
      selected_revision.finalization_operation_key is not null
      or selected_revision.revision_sha256 is not null
      or selected_revision.finalized_at is not null
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'A native-finalized proposal revision may be accepted only through the exact guarded native electronic-signature workflow.';
    end if;

    return new;
  end if;

  select signing_request.* into selected_request
  from public.proposal_signing_requests as signing_request
  where signing_request.id = new.signing_request_id;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into expected_selected_option_ids
  from jsonb_array_elements_text(
    coalesce(selected_revision.customer_snapshot -> 'selectedOptionIds', '[]'::jsonb)
  );

  expected_evidence := jsonb_build_object(
    'schemaVersion', 'native-acceptance-v1',
    'requestId', new.signing_request_id,
    'sessionId', session_id,
    'proposalRevisionId', new.proposal_revision_id,
    'signatureId', new.signature_id,
    'documentId', new.proposal_document_id,
    'signerName', new.signer_name,
    'signerEmail', lower(new.signer_email),
    'acceptedTotal', new.accepted_total,
    'selectedOptionIds', new.selected_option_ids,
    'termsAccepted', new.terms_accepted,
    'electronicRecordsConsented', new.electronic_records_consented,
    'signatureIntentAcknowledged', new.signature_intent_acknowledged,
    'signatureMethod', new.signature_method,
    'proposalRevisionSha256', new.proposal_revision_sha256,
    'proposalDocumentSha256', new.proposal_document_sha256,
    'termsSha256', new.terms_sha256,
    'consentVersion', new.consent_version,
    'consentSha256', new.consent_sha256,
    'ipHash', new.ip_hash,
    'userAgent', new.user_agent,
    'acceptedAt', new.accepted_at
  );
  expected_evidence_sha256 := encode(
    extensions.digest(convert_to(expected_evidence::text, 'UTF8'), 'sha256'),
    'hex'
  );

  if selected_request.id is null
    or selected_revision.id is null
    or session_id is null
    or new.company_id is distinct from selected_request.company_id
    or new.proposal_revision_id is distinct from selected_request.proposal_revision_id
    or new.estimate_id is distinct from selected_request.estimate_id
    or new.customer_id is distinct from selected_request.customer_id
    or new.signature_id is distinct from selected_request.signature_id
    or new.proposal_document_id is distinct from selected_request.proposal_document_id
    or new.proposal_revision_sha256 is distinct from selected_request.revision_sha256
    or new.proposal_document_sha256 is distinct from selected_request.document_sha256
    or new.terms_sha256 is distinct from selected_request.terms_sha256
    or new.consent_version is distinct from selected_request.consent_version
    or new.consent_sha256 is distinct from selected_request.consent_sha256
    or lower(new.signer_email) is distinct from lower(selected_request.intended_signer_email)
    or new.signer_name is distinct from selected_request.intended_signer_name
    or new.accepted_total is distinct from selected_revision.accepted_total
    or new.required_deposit_amount is distinct from selected_revision.deposit_amount
    or new.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or new.required_deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or new.selected_option_ids is distinct from expected_selected_option_ids
    or not new.terms_accepted
    or not new.electronic_records_consented
    or not new.signature_intent_acknowledged
    or new.signature_method <> 'typed_name'
    or new.evidence_sha256 is distinct from expected_evidence_sha256
    or not exists (
      select 1
      from public.proposal_signing_sessions as session
      where session.id = session_id
        and session.signing_request_id = selected_request.id
        and session.company_id = selected_request.company_id
        and session.status = 'active'
        and session.expires_at > new.accepted_at
    )
    or selected_request.status not in ('sent', 'viewed')
    or selected_request.expires_at <= new.accepted_at
    or not public.wtos_is_native_proposal_rpc_authorized()
  then
    raise exception using
      errcode = 'P0001',
      message = 'Native proposal acceptance must match the exact request, session, revision, document, signer, options, totals, terms, consent, and evidence digest.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_validate_native_proposal_acceptance_scope()
from public, anon, authenticated, service_role;

drop trigger if exists estimate_proposal_acceptances_validate_native_scope
on public.estimate_proposal_acceptances;
create trigger estimate_proposal_acceptances_validate_native_scope
before insert on public.estimate_proposal_acceptances
for each row execute function public.wtos_validate_native_proposal_acceptance_scope();

create or replace function public.wtos_accept_proposal_signing(
  signing_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid := nullif(signing_request ->> 'requestId', '')::uuid;
  request_session_sha256 text := lower(nullif(signing_request ->> 'sessionHash', ''));
  request_operation_key uuid := nullif(signing_request ->> 'idempotencyKey', '')::uuid;
  request_signer_name text := nullif(
    regexp_replace(btrim(signing_request ->> 'signerName'), '\s+', ' ', 'g'),
    ''
  );
  request_signer_email text := lower(nullif(btrim(signing_request ->> 'signerEmail'), ''));
  request_selected_option_ids uuid[] := '{}';
  request_accepted_total numeric := (signing_request ->> 'acceptedTotal')::numeric;
  request_terms_accepted boolean := coalesce((signing_request ->> 'termsAccepted')::boolean, false);
  request_electronic_records_consented boolean := coalesce((signing_request ->> 'electronicRecordsConsented')::boolean, false);
  request_signature_intent_acknowledged boolean := coalesce((signing_request ->> 'signatureIntentAcknowledged')::boolean, false);
  request_revision_sha256 text := lower(nullif(signing_request ->> 'revisionSha256', ''));
  request_document_sha256 text := lower(nullif(signing_request ->> 'documentSha256', ''));
  request_terms_sha256 text := lower(nullif(signing_request ->> 'termsSha256', ''));
  request_consent_sha256 text := lower(nullif(signing_request ->> 'consentSha256', ''));
  request_ip_hash text := lower(nullif(signing_request ->> 'ipHash', ''));
  request_user_agent text := left(nullif(signing_request ->> 'userAgent', ''), 500);
  selected_request public.proposal_signing_requests%rowtype;
  selected_session public.proposal_signing_sessions%rowtype;
  selected_revision public.estimate_proposal_revisions%rowtype;
  existing_acceptance public.estimate_proposal_acceptances%rowtype;
  expected_selected_option_ids uuid[];
  request_fingerprint jsonb;
  request_fingerprint_sha256 text;
  created_acceptance_id uuid := gen_random_uuid();
  accepted_time timestamptz := clock_timestamp();
  evidence_payload jsonb;
  calculated_evidence_sha256 text;
  attempt_count integer;
  attempt_window timestamptz;
begin
  if request_id is null
    or request_operation_key is null
    or request_session_sha256 !~ '^[0-9a-f]{64}$'
    or request_signer_name is null
    or request_signer_email is null
    or jsonb_typeof(coalesce(signing_request -> 'selectedOptionIds', '[]'::jsonb)) <> 'array'
    or request_accepted_total is null
    or request_accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or request_accepted_total < 0
    or request_revision_sha256 !~ '^[0-9a-f]{64}$'
    or request_document_sha256 !~ '^[0-9a-f]{64}$'
    or request_terms_sha256 !~ '^[0-9a-f]{64}$'
    or request_consent_sha256 !~ '^[0-9a-f]{64}$'
    or (request_ip_hash is not null and request_ip_hash !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'The electronic acceptance request is invalid.'
    );
  end if;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_selected_option_ids
  from jsonb_array_elements_text(
    coalesce(signing_request -> 'selectedOptionIds', '[]'::jsonb)
  );

  if cardinality(request_selected_option_ids) <> (
    select count(distinct selected_id)
    from unnest(request_selected_option_ids) as selected_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'The electronic acceptance request is invalid.'
    );
  end if;

  request_fingerprint := jsonb_build_object(
    'schemaVersion', 'native-acceptance-request-v1',
    'requestId', request_id,
    'sessionHash', request_session_sha256,
    'signerName', request_signer_name,
    'signerEmail', request_signer_email,
    'selectedOptionIds', request_selected_option_ids,
    'acceptedTotal', request_accepted_total,
    'termsAccepted', request_terms_accepted,
    'electronicRecordsConsented', request_electronic_records_consented,
    'signatureIntentAcknowledged', request_signature_intent_acknowledged,
    'revisionSha256', request_revision_sha256,
    'documentSha256', request_document_sha256,
    'termsSha256', request_terms_sha256,
    'consentSha256', request_consent_sha256,
    'ipHash', request_ip_hash,
    'userAgent', request_user_agent
  );
  request_fingerprint_sha256 := encode(
    extensions.digest(convert_to(request_fingerprint::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select signing_link.* into selected_request
  from public.proposal_signing_requests as signing_link
  where signing_link.id = request_id
  for update;

  if selected_request.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing session is invalid or expired.'
    );
  end if;

  if selected_request.action_blocked_until is not null
    and selected_request.action_blocked_until > accepted_time then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing attempts. Wait a few minutes and try again.'
    );
  end if;

  if selected_request.action_window_started_at is null
    or selected_request.action_window_started_at <= accepted_time - interval '15 minutes' then
    attempt_window := accepted_time;
    attempt_count := 1;
  else
    attempt_window := selected_request.action_window_started_at;
    attempt_count := selected_request.action_attempt_count + 1;
  end if;

  update public.proposal_signing_requests
  set
    action_attempt_count = attempt_count,
    action_window_started_at = attempt_window,
    action_blocked_until = case
      when attempt_count > 12 then accepted_time + interval '15 minutes'
      else null
    end,
    updated_at = accepted_time
  where id = selected_request.id;

  if attempt_count > 12 then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing attempts. Wait a few minutes and try again.'
    );
  end if;

  select session.* into selected_session
  from public.proposal_signing_sessions as session
  where session.signing_request_id = selected_request.id
    and session.session_token_sha256 = request_session_sha256
  for update;

  if selected_session.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing session is invalid or expired.'
    );
  end if;

  select acceptance.* into existing_acceptance
  from public.estimate_proposal_acceptances as acceptance
  where acceptance.acceptance_operation_key = request_operation_key;

  if existing_acceptance.id is not null then
    if existing_acceptance.signing_request_id is distinct from selected_request.id
      or existing_acceptance.acceptance_request_sha256 is distinct from request_fingerprint_sha256
      or selected_session.status <> 'signed' then
      return jsonb_build_object(
        'ok', false,
        'status', 'conflict',
        'message', 'The acceptance idempotency key conflicts with another operation.'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'signed',
      'requestId', selected_request.id,
      'sessionId', selected_session.id,
      'proposalRevisionId', existing_acceptance.proposal_revision_id,
      'acceptanceId', existing_acceptance.id,
      'signatureId', existing_acceptance.signature_id,
      'acceptedTotal', existing_acceptance.accepted_total,
      'requiredDepositAmount', existing_acceptance.required_deposit_amount,
      'acceptedAt', existing_acceptance.accepted_at,
      'evidenceSha256', existing_acceptance.evidence_sha256,
      'receiptStatus', case when exists (
        select 1 from public.proposal_signature_receipts as receipt
        where receipt.acceptance_id = existing_acceptance.id
      ) then 'registered' else 'pending' end
    );
  end if;

  if not public.wtos_native_proposal_source_is_current(
    selected_request.proposal_revision_id,
    selected_request.company_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'Proposal source changed after delivery; the owner must issue a new immutable revision before acceptance.'
    );
  end if;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = selected_request.proposal_revision_id
    and revision.company_id = selected_request.company_id
  for update;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into expected_selected_option_ids
  from jsonb_array_elements_text(
    coalesce(selected_revision.customer_snapshot -> 'selectedOptionIds', '[]'::jsonb)
  );

  if selected_session.status <> 'active'
    or selected_session.expires_at <= accepted_time
    or selected_request.status not in ('sent', 'viewed')
    or selected_request.expires_at <= accepted_time
    or selected_revision.id is null
    or selected_revision.accepted_acceptance_id is not null
    or selected_revision.status not in ('sent', 'viewed')
    or lower(selected_request.intended_signer_email) is distinct from request_signer_email
    or selected_request.intended_signer_name is distinct from request_signer_name
    or request_selected_option_ids is distinct from expected_selected_option_ids
    or request_accepted_total is distinct from selected_revision.accepted_total
    or selected_revision.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_revision.deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or not request_terms_accepted
    or not request_electronic_records_consented
    or not request_signature_intent_acknowledged
    or request_revision_sha256 is distinct from selected_request.revision_sha256
    or request_document_sha256 is distinct from selected_request.document_sha256
    or request_terms_sha256 is distinct from selected_request.terms_sha256
    or request_consent_sha256 is distinct from selected_request.consent_sha256 then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'The proposal or signing evidence no longer matches this exact finalized revision.'
    );
  end if;

  evidence_payload := jsonb_build_object(
    'schemaVersion', 'native-acceptance-v1',
    'requestId', selected_request.id,
    'sessionId', selected_session.id,
    'proposalRevisionId', selected_revision.id,
    'signatureId', selected_request.signature_id,
    'documentId', selected_request.proposal_document_id,
    'signerName', selected_request.intended_signer_name,
    'signerEmail', request_signer_email,
    'acceptedTotal', selected_revision.accepted_total,
    'selectedOptionIds', request_selected_option_ids,
    'termsAccepted', request_terms_accepted,
    'electronicRecordsConsented', request_electronic_records_consented,
    'signatureIntentAcknowledged', request_signature_intent_acknowledged,
    'signatureMethod', 'typed_name',
    'proposalRevisionSha256', request_revision_sha256,
    'proposalDocumentSha256', request_document_sha256,
    'termsSha256', request_terms_sha256,
    'consentVersion', selected_request.consent_version,
    'consentSha256', request_consent_sha256,
    'ipHash', request_ip_hash,
    'userAgent', request_user_agent,
    'acceptedAt', accepted_time
  );
  calculated_evidence_sha256 := encode(
    extensions.digest(convert_to(evidence_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform public.wtos_begin_native_proposal_rpc_guard(
    'accept_proposal_signing',
    request_operation_key
  );
  insert into public.estimate_proposal_acceptances (
    id,
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    signer_name,
    signer_email,
    accepted_total,
    selected_option_ids,
    terms_accepted,
    acceptance_method,
    signature_status,
    ip_hash,
    user_agent,
    audit_metadata,
    accepted_at,
    created_at,
    signing_request_id,
    signature_id,
    proposal_document_id,
    acceptance_operation_key,
    acceptance_request_sha256,
    proposal_revision_sha256,
    proposal_document_sha256,
    terms_sha256,
    consent_version,
    consent_sha256,
    electronic_records_consented,
    signature_intent_acknowledged,
    signature_method,
    required_deposit_amount,
    evidence_sha256
  )
  values (
    created_acceptance_id,
    selected_request.company_id,
    selected_revision.id,
    selected_request.estimate_id,
    selected_request.customer_id,
    selected_request.intended_signer_name,
    request_signer_email,
    request_accepted_total,
    request_selected_option_ids,
    true,
    'native_electronic',
    'signed',
    request_ip_hash,
    request_user_agent,
    jsonb_build_object(
      'evidenceVersion', 'native-acceptance-v1',
      'signingSessionId', selected_session.id,
      'requestId', selected_request.id,
      'intendedSignerName', selected_request.intended_signer_name
    ),
    accepted_time,
    accepted_time,
    selected_request.id,
    selected_request.signature_id,
    selected_request.proposal_document_id,
    request_operation_key,
    request_fingerprint_sha256,
    request_revision_sha256,
    request_document_sha256,
    request_terms_sha256,
    selected_request.consent_version,
    request_consent_sha256,
    true,
    true,
    'typed_name',
    selected_revision.deposit_amount,
    calculated_evidence_sha256
  );

  update public.signatures
  set
    signer_name = selected_request.intended_signer_name,
    signer_email = request_signer_email,
    status = 'signed',
    signature_data = '/s/ ' || selected_request.intended_signer_name,
    signed_at = accepted_time,
    acceptance_id = created_acceptance_id,
    signature_method = 'typed_name',
    evidence_sha256 = calculated_evidence_sha256
  where id = selected_request.signature_id;

  update public.estimate_proposal_revisions
  set
    status = 'accepted',
    signature_status = 'signed',
    accepted_at = accepted_time,
    accepted_signature_id = selected_request.signature_id,
    accepted_acceptance_id = created_acceptance_id
  where id = selected_revision.id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  update public.proposal_signing_requests
  set
    status = 'signed',
    signed_at = accepted_time,
    updated_at = accepted_time
  where id = selected_request.id;

  update public.proposal_signing_sessions
  set
    status = case when id = selected_session.id then 'signed' else 'revoked' end,
    signed_at = case when id = selected_session.id then accepted_time else signed_at end,
    revoked_at = case when id <> selected_session.id then accepted_time else revoked_at end,
    updated_at = accepted_time
  where signing_request_id = selected_request.id
    and status = 'active';

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    summary,
    metadata,
    idempotency_key
  )
  values (
    selected_request.company_id,
    selected_revision.id,
    selected_request.estimate_id,
    selected_request.customer_id,
    'native_proposal_electronically_accepted',
    'customer',
    'Customer electronically signed the exact immutable proposal revision.',
    jsonb_build_object(
      'requestId', selected_request.id,
      'sessionId', selected_session.id,
      'acceptanceId', created_acceptance_id,
      'signatureId', selected_request.signature_id,
      'acceptedTotal', request_accepted_total,
      'requiredDepositAmount', selected_revision.deposit_amount,
      'selectedOptionIds', request_selected_option_ids,
      'evidenceSha256', calculated_evidence_sha256
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'signed',
    'requestId', selected_request.id,
    'sessionId', selected_session.id,
    'proposalRevisionId', selected_revision.id,
    'acceptanceId', created_acceptance_id,
    'signatureId', selected_request.signature_id,
    'acceptedTotal', request_accepted_total,
    'requiredDepositAmount', selected_revision.deposit_amount,
    'acceptedAt', accepted_time,
    'evidenceSha256', calculated_evidence_sha256,
    'receiptStatus', 'pending'
  );
end;
$$;

revoke all on function public.wtos_accept_proposal_signing(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_accept_proposal_signing(jsonb)
to service_role;

create or replace function public.wtos_decline_proposal_signing(
  signing_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid := nullif(signing_request ->> 'requestId', '')::uuid;
  request_session_sha256 text := lower(nullif(signing_request ->> 'sessionHash', ''));
  request_operation_key uuid := nullif(signing_request ->> 'idempotencyKey', '')::uuid;
  request_reason_code text := nullif(btrim(signing_request ->> 'reasonCode'), '');
  request_ip_hash text := lower(nullif(signing_request ->> 'ipHash', ''));
  request_user_agent text := left(nullif(signing_request ->> 'userAgent', ''), 500);
  selected_request public.proposal_signing_requests%rowtype;
  selected_session public.proposal_signing_sessions%rowtype;
  existing_event public.proposal_audit_events%rowtype;
  request_fingerprint jsonb;
  request_fingerprint_sha256 text;
  declined_time timestamptz := clock_timestamp();
  attempt_count integer;
  attempt_window timestamptz;
begin
  if request_id is null
    or request_operation_key is null
    or request_session_sha256 !~ '^[0-9a-f]{64}$'
    or request_reason_code is null
    or length(request_reason_code) > 80
    or (request_ip_hash is not null and request_ip_hash !~ '^[0-9a-f]{64}$') then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'The electronic decline request is invalid.'
    );
  end if;

  request_fingerprint := jsonb_build_object(
    'schemaVersion', 'native-decline-request-v1',
    'requestId', request_id,
    'sessionHash', request_session_sha256,
    'reasonCode', request_reason_code,
    'ipHash', request_ip_hash,
    'userAgent', request_user_agent
  );
  request_fingerprint_sha256 := encode(
    extensions.digest(convert_to(request_fingerprint::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select signing_link.* into selected_request
  from public.proposal_signing_requests as signing_link
  where signing_link.id = request_id
  for update;

  if selected_request.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing session is invalid or expired.'
    );
  end if;

  if selected_request.action_blocked_until is not null
    and selected_request.action_blocked_until > declined_time then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing attempts. Wait a few minutes and try again.'
    );
  end if;

  if selected_request.action_window_started_at is null
    or selected_request.action_window_started_at <= declined_time - interval '15 minutes' then
    attempt_window := declined_time;
    attempt_count := 1;
  else
    attempt_window := selected_request.action_window_started_at;
    attempt_count := selected_request.action_attempt_count + 1;
  end if;

  update public.proposal_signing_requests
  set
    action_attempt_count = attempt_count,
    action_window_started_at = attempt_window,
    action_blocked_until = case
      when attempt_count > 12 then declined_time + interval '15 minutes'
      else null
    end,
    updated_at = declined_time
  where id = selected_request.id;

  if attempt_count > 12 then
    return jsonb_build_object(
      'ok', false,
      'status', 'rate_limited',
      'message', 'Too many signing attempts. Wait a few minutes and try again.'
    );
  end if;

  select session.* into selected_session
  from public.proposal_signing_sessions as session
  where session.signing_request_id = selected_request.id
    and session.session_token_sha256 = request_session_sha256
  for update;

  if selected_session.id is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'This signing session is invalid or expired.'
    );
  end if;

  select event.* into existing_event
  from public.proposal_audit_events as event
  where event.company_id = selected_request.company_id
    and event.event_type = 'native_proposal_electronically_declined'
    and event.idempotency_key = request_operation_key::text;

  if existing_event.id is not null then
    if existing_event.metadata ->> 'requestId' is distinct from selected_request.id::text
      or existing_event.metadata ->> 'requestSha256' is distinct from request_fingerprint_sha256
      or selected_session.status <> 'declined' then
      return jsonb_build_object(
        'ok', false,
        'status', 'conflict',
        'message', 'The decline idempotency key conflicts with another operation.'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'declined',
      'requestId', selected_request.id,
      'sessionId', selected_session.id,
      'proposalRevisionId', selected_request.proposal_revision_id,
      'declinedAt', existing_event.created_at
    );
  end if;

  if selected_session.status <> 'active'
    or selected_session.expires_at <= declined_time
    or selected_request.status not in ('sent', 'viewed')
    or selected_request.expires_at <= declined_time then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'This proposal is no longer awaiting a response.'
    );
  end if;

  update public.proposal_signing_requests
  set
    status = 'declined',
    declined_at = declined_time,
    updated_at = declined_time
  where id = selected_request.id;

  update public.proposal_signing_sessions
  set
    status = case when id = selected_session.id then 'declined' else 'revoked' end,
    declined_at = case when id = selected_session.id then declined_time else declined_at end,
    revoked_at = case when id <> selected_session.id then declined_time else revoked_at end,
    updated_at = declined_time
  where signing_request_id = selected_request.id
    and status = 'active';

  perform public.wtos_begin_native_proposal_rpc_guard(
    'decline_proposal_signing',
    request_operation_key
  );
  update public.signatures
  set
    status = 'declined',
    declined_at = declined_time
  where id = selected_request.signature_id;

  update public.estimate_proposal_revisions
  set
    status = 'declined',
    signature_status = 'declined',
    declined_at = declined_time
  where id = selected_request.proposal_revision_id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    summary,
    metadata,
    idempotency_key
  )
  values (
    selected_request.company_id,
    selected_request.proposal_revision_id,
    selected_request.estimate_id,
    selected_request.customer_id,
    'native_proposal_electronically_declined',
    'customer',
    'Customer declined the exact immutable proposal revision.',
    jsonb_build_object(
      'requestId', selected_request.id,
      'sessionId', selected_session.id,
      'reasonCode', request_reason_code,
      'requestSha256', request_fingerprint_sha256,
      'ipHash', request_ip_hash,
      'userAgent', request_user_agent
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'declined',
    'requestId', selected_request.id,
    'sessionId', selected_session.id,
    'proposalRevisionId', selected_request.proposal_revision_id,
    'declinedAt', declined_time
  );
end;
$$;

revoke all on function public.wtos_decline_proposal_signing(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_decline_proposal_signing(jsonb)
to service_role;

create or replace function public.wtos_validate_proposal_signature_receipt_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.proposal_signing_requests as signing_request
    join public.estimate_proposal_revisions as revision
      on revision.id = signing_request.proposal_revision_id
     and revision.company_id = signing_request.company_id
    join public.estimate_proposal_acceptances as acceptance
      on acceptance.id = new.acceptance_id
     and acceptance.signing_request_id = signing_request.id
     and acceptance.proposal_revision_id = revision.id
     and acceptance.company_id = revision.company_id
    join public.signatures as signature
      on signature.id = new.signature_id
     and signature.id = signing_request.signature_id
     and signature.acceptance_id = acceptance.id
     and signature.proposal_revision_id = revision.id
    join public.documents as source_document
      on source_document.id = new.source_document_id
     and source_document.id = signing_request.proposal_document_id
     and source_document.proposal_revision_id = revision.id
    join public.documents as signed_document
      on signed_document.id = new.signed_document_id
     and signed_document.proposal_revision_id = revision.id
     and signed_document.company_id = revision.company_id
     and signed_document.category = 'signed_proposal'
    where signing_request.id = new.signing_request_id
      and signing_request.company_id = new.company_id
      and signing_request.status = 'signed'
      and revision.id = new.proposal_revision_id
      and revision.accepted_acceptance_id = acceptance.id
      and revision.accepted_signature_id = signature.id
      and revision.revision_sha256 = new.revision_sha256
      and source_document.content_sha256 = new.source_document_sha256
      and signed_document.content_sha256 = new.signed_document_sha256
      and acceptance.evidence_sha256 = new.evidence_sha256
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Signature receipt must match the exact signed request, revision, acceptance, signature, source document, signed document, and evidence digests.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_validate_proposal_signature_receipt_scope()
from public, anon, authenticated, service_role;

drop trigger if exists proposal_signature_receipts_validate_scope
on public.proposal_signature_receipts;
create trigger proposal_signature_receipts_validate_scope
before insert on public.proposal_signature_receipts
for each row execute function public.wtos_validate_proposal_signature_receipt_scope();

create or replace function public.wtos_register_proposal_signing_receipt(
  receipt_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(receipt_request ->> 'operationKey', '')::uuid;
  request_company_id uuid := nullif(receipt_request ->> 'companyId', '')::uuid;
  request_id uuid := nullif(receipt_request ->> 'requestId', '')::uuid;
  request_acceptance_id uuid := nullif(receipt_request ->> 'acceptanceId', '')::uuid;
  request_document_id uuid := nullif(receipt_request ->> 'documentId', '')::uuid;
  request_file_name text := nullif(btrim(receipt_request ->> 'fileName'), '');
  request_file_size_bytes bigint := (receipt_request ->> 'fileSizeBytes')::bigint;
  request_mime_type text := nullif(btrim(receipt_request ->> 'mimeType'), '');
  request_storage_bucket text := nullif(btrim(receipt_request ->> 'storageBucket'), '');
  request_storage_path text := nullif(btrim(receipt_request ->> 'storagePath'), '');
  request_signed_document_sha256 text := lower(nullif(receipt_request ->> 'signedDocumentSha256', ''));
  selected_request public.proposal_signing_requests%rowtype;
  selected_acceptance public.estimate_proposal_acceptances%rowtype;
  selected_revision public.estimate_proposal_revisions%rowtype;
  existing_receipt public.proposal_signature_receipts%rowtype;
  existing_receipt_document public.documents%rowtype;
  receipt_time timestamptz := clock_timestamp();
begin
  if request_operation_key is null
    or request_company_id is null
    or request_id is null
    or request_acceptance_id is null
    or request_document_id is null
    or request_file_name is null
    or request_file_size_bytes is null
    or request_file_size_bytes <= 0
    or request_file_size_bytes > 10485760
    or request_mime_type <> 'application/pdf'
    or request_storage_bucket <> 'customer-documents'
    or request_storage_path is null
    or request_signed_document_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'status', 'invalid_or_expired',
      'message', 'Complete private signed receipt evidence is required.'
    );
  end if;

  select receipt.* into existing_receipt
  from public.proposal_signature_receipts as receipt
  where receipt.operation_key = request_operation_key
     or receipt.signing_request_id = request_id
     or receipt.acceptance_id = request_acceptance_id
  order by (receipt.operation_key = request_operation_key) desc
  limit 1;

  if existing_receipt.id is not null then
    select document.* into existing_receipt_document
    from public.documents as document
    where document.id = existing_receipt.signed_document_id;

    if existing_receipt.company_id is distinct from request_company_id
      or existing_receipt.signing_request_id is distinct from request_id
      or existing_receipt.acceptance_id is distinct from request_acceptance_id
      or existing_receipt.signed_document_id is distinct from request_document_id
      or existing_receipt.signed_document_sha256 is distinct from request_signed_document_sha256
      or existing_receipt_document.id is null
      or existing_receipt_document.file_name is distinct from request_file_name
      or existing_receipt_document.file_size_bytes is distinct from request_file_size_bytes
      or existing_receipt_document.mime_type is distinct from request_mime_type
      or existing_receipt_document.storage_bucket is distinct from request_storage_bucket
      or existing_receipt_document.storage_path is distinct from request_storage_path
      or existing_receipt_document.content_sha256 is distinct from request_signed_document_sha256 then
      return jsonb_build_object(
        'ok', false,
        'status', 'conflict',
        'message', 'Signature receipt idempotency conflicts with existing evidence.'
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'registered',
      'requestId', existing_receipt.signing_request_id,
      'proposalRevisionId', existing_receipt.proposal_revision_id,
      'acceptanceId', existing_receipt.acceptance_id,
      'signatureId', existing_receipt.signature_id,
      'receiptId', existing_receipt.id,
      'documentId', existing_receipt.signed_document_id,
      'signedDocumentSha256', existing_receipt.signed_document_sha256,
      'registeredAt', existing_receipt.registered_at
    );
  end if;

  select signing_request.* into selected_request
  from public.proposal_signing_requests as signing_request
  where signing_request.id = request_id
    and signing_request.company_id = request_company_id
  for update;

  select acceptance.* into selected_acceptance
  from public.estimate_proposal_acceptances as acceptance
  where acceptance.id = request_acceptance_id
    and acceptance.company_id = request_company_id
    and acceptance.signing_request_id = request_id;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = selected_request.proposal_revision_id
    and revision.company_id = request_company_id
  for update;

  if selected_request.id is null
    or selected_request.status <> 'signed'
    or selected_acceptance.id is null
    or selected_revision.id is null
    or selected_revision.status <> 'accepted'
    or selected_revision.accepted_acceptance_id is distinct from selected_acceptance.id
    or selected_revision.accepted_signature_id is distinct from selected_request.signature_id
    or selected_acceptance.signature_id is distinct from selected_request.signature_id
    or selected_acceptance.proposal_document_id is distinct from selected_request.proposal_document_id
    or request_storage_path is distinct from (
      request_company_id::text || '/proposal-signing/' || request_id::text || '/' || request_acceptance_id::text || '.pdf'
    ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'The signed receipt does not match the exact accepted proposal evidence.'
    );
  end if;

  if exists (
    select 1
    from public.documents as document
    where document.id = request_document_id
       or (
         document.proposal_revision_id = selected_revision.id
         and document.category = 'signed_proposal'
       )
  ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'The signed receipt document identity conflicts with an existing artifact.'
    );
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'register_signing_receipt',
    request_operation_key
  );
  insert into public.documents (
    id,
    company_id,
    customer_id,
    lead_id,
    job_id,
    estimate_id,
    invoice_id,
    change_order_id,
    property_id,
    title,
    category,
    status,
    template_key,
    file_url,
    body,
    file_name,
    file_size_bytes,
    mime_type,
    storage_bucket,
    storage_path,
    uploaded_by,
    uploaded_at,
    property_address,
    tags,
    requirement_level,
    required_for,
    proposal_revision_id,
    artifact_operation_key,
    content_sha256,
    immutable_after_at
  )
  values (
    request_document_id,
    selected_revision.company_id,
    selected_revision.customer_id,
    selected_revision.lead_id,
    null,
    selected_revision.estimate_id,
    null,
    null,
    selected_revision.property_id,
    selected_revision.title || ' - Electronic Signature Receipt',
    'signed_proposal',
    'signed',
    'native_signature_receipt_v1',
    null,
    null,
    request_file_name,
    request_file_size_bytes,
    request_mime_type,
    request_storage_bucket,
    request_storage_path,
    null,
    receipt_time,
    selected_revision.customer_snapshot #>> '{property,address}',
    array['proposal', 'customer-facing', 'immutable', 'native-esign', 'signature-receipt'],
    'required',
    array['customer_signature', 'sold_job_conversion'],
    selected_revision.id,
    request_operation_key,
    request_signed_document_sha256,
    receipt_time
  );

  insert into public.proposal_signature_receipts (
    company_id,
    signing_request_id,
    proposal_revision_id,
    acceptance_id,
    signature_id,
    source_document_id,
    signed_document_id,
    operation_key,
    revision_sha256,
    source_document_sha256,
    signed_document_sha256,
    evidence_sha256,
    registered_at
  )
  values (
    selected_request.company_id,
    selected_request.id,
    selected_revision.id,
    selected_acceptance.id,
    selected_request.signature_id,
    selected_request.proposal_document_id,
    request_document_id,
    request_operation_key,
    selected_request.revision_sha256,
    selected_request.document_sha256,
    request_signed_document_sha256,
    selected_acceptance.evidence_sha256,
    receipt_time
  )
  returning * into existing_receipt;

  update public.signatures
  set signed_document_id = request_document_id
  where id = selected_request.signature_id;

  update public.estimate_proposal_revisions
  set signed_document_id = request_document_id
  where id = selected_revision.id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    summary,
    metadata,
    idempotency_key
  )
  values (
    selected_request.company_id,
    selected_revision.id,
    selected_request.estimate_id,
    selected_request.customer_id,
    'native_signature_receipt_registered',
    'system',
    'Registered the immutable private electronic signature receipt.',
    jsonb_build_object(
      'requestId', selected_request.id,
      'acceptanceId', selected_acceptance.id,
      'documentId', request_document_id,
      'signedDocumentSha256', request_signed_document_sha256
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'registered',
    'requestId', selected_request.id,
    'proposalRevisionId', selected_revision.id,
    'acceptanceId', selected_acceptance.id,
    'signatureId', selected_request.signature_id,
    'receiptId', existing_receipt.id,
    'documentId', request_document_id,
    'signedDocumentSha256', request_signed_document_sha256,
    'registeredAt', receipt_time
  );
end;
$$;

revoke all on function public.wtos_register_proposal_signing_receipt(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_register_proposal_signing_receipt(jsonb)
to service_role;

create or replace function public.wtos_validate_proposal_deposit_invoice_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.proposal_revision_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.wtos_is_native_proposal_rpc_authorized() then
      raise exception using
        errcode = 'P0001',
        message = 'Exact proposal deposit invoice linkage may be created only inside the authenticated owner RPC.';
    end if;
  elsif (
    old.proposal_revision_id is null
    or new.proposal_revision_id is distinct from old.proposal_revision_id
    or new.proposal_acceptance_id is distinct from old.proposal_acceptance_id
    or new.proposal_invoice_operation_key is distinct from old.proposal_invoice_operation_key
  ) and not public.wtos_is_native_proposal_rpc_authorized() then
    raise exception using
      errcode = 'P0001',
      message = 'Exact proposal deposit invoice linkage may be created only inside the authenticated owner RPC.';
  end if;

  if not exists (
    select 1
    from public.estimate_proposal_revisions as revision
    join public.estimate_proposal_acceptances as acceptance
      on acceptance.id = new.proposal_acceptance_id
     and acceptance.proposal_revision_id = revision.id
     and acceptance.company_id = revision.company_id
     and acceptance.estimate_id = revision.estimate_id
     and acceptance.customer_id is not distinct from revision.customer_id
     and acceptance.acceptance_method = 'native_electronic'
     and acceptance.signature_status = 'signed'
    join public.proposal_signature_receipts as receipt
      on receipt.acceptance_id = acceptance.id
     and receipt.proposal_revision_id = revision.id
     and receipt.company_id = revision.company_id
    where revision.id = new.proposal_revision_id
      and revision.company_id = new.company_id
      and revision.customer_id is not distinct from new.customer_id
      and revision.estimate_id is not distinct from new.estimate_id
      and revision.property_id is not distinct from new.property_id
      and revision.accepted_acceptance_id = acceptance.id
      and revision.signature_status = 'signed'
      and new.invoice_purpose = 'proposal_deposit'
      and new.subtotal = acceptance.required_deposit_amount
      and new.tax_total = 0
      and new.discount_total = 0
      and new.total = acceptance.required_deposit_amount
      and new.amount_paid >= 0
      and new.amount_paid <= new.total
      and new.balance_due = round(new.total - new.amount_paid, 2)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal deposit invoice must match the exact signed revision, acceptance, receipt, company, customer, estimate, property, and required deposit amount.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_validate_proposal_deposit_invoice_scope()
from public, anon, authenticated, service_role;

drop trigger if exists invoices_validate_proposal_deposit_scope on public.invoices;
drop trigger if exists invoices_validate_proposal_deposit_scope_insert on public.invoices;
drop trigger if exists invoices_validate_proposal_deposit_scope_update on public.invoices;
create trigger invoices_validate_proposal_deposit_scope_insert
before insert on public.invoices
for each row execute function public.wtos_validate_proposal_deposit_invoice_scope();

create trigger invoices_validate_proposal_deposit_scope_update
before update of
  company_id,
  customer_id,
  estimate_id,
  property_id,
  subtotal,
  tax_total,
  discount_total,
  total,
  amount_paid,
  balance_due,
  proposal_revision_id,
  proposal_acceptance_id,
  invoice_purpose,
  proposal_invoice_operation_key
on public.invoices
for each row execute function public.wtos_validate_proposal_deposit_invoice_scope();

create or replace function public.wtos_enforce_proposal_deposit_invoice_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if old.proposal_revision_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'Exact proposal deposit invoices cannot be deleted.';
  end if;

  if (to_jsonb(new) - array['status', 'amount_paid', 'balance_due', 'updated_at'])
    is distinct from (to_jsonb(old) - array['status', 'amount_paid', 'balance_due', 'updated_at']) then
    raise exception using
      errcode = 'P0001',
      message = 'Exact proposal deposit invoice identity, amount, and proposal bindings are immutable.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_proposal_deposit_invoice_immutability()
from public, anon, authenticated, service_role;

drop trigger if exists invoices_enforce_proposal_deposit_immutability
on public.invoices;
create trigger invoices_enforce_proposal_deposit_immutability
before update or delete on public.invoices
for each row execute function public.wtos_enforce_proposal_deposit_invoice_immutability();

create or replace function public.wtos_enforce_proposal_deposit_line_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_invoice public.invoices%rowtype;
  new_invoice public.invoices%rowtype;
  linked_invoice public.invoices%rowtype;
  linked_revision public.estimate_proposal_revisions%rowtype;
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    select invoice.* into old_invoice
    from public.invoices as invoice
    where invoice.id = old.invoice_id;
  end if;

  if tg_op <> 'DELETE' then
    select invoice.* into new_invoice
    from public.invoices as invoice
    where invoice.id = new.invoice_id;
  end if;

  if old_invoice.proposal_revision_id is null
    and new_invoice.proposal_revision_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    raise exception using
      errcode = 'P0001',
      message = 'Exact proposal deposit invoice lines are permanently immutable after creation.';
  end if;

  linked_invoice := new_invoice;
  if not public.wtos_native_proposal_rpc_operation_is(
    'create_proposal_deposit_invoice'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Exact proposal deposit invoice lines may be created only inside the authenticated owner deposit RPC.';
  end if;

  select revision.* into linked_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = linked_invoice.proposal_revision_id
    and revision.company_id = linked_invoice.company_id;

  if linked_invoice.invoice_purpose <> 'proposal_deposit'
    or linked_invoice.proposal_acceptance_id is null
    or linked_revision.id is null
    or exists (
      select 1
      from public.invoice_line_items as existing_line
      where existing_line.invoice_id = linked_invoice.id
    )
    or new.description is distinct from (
      'Required deposit for proposal '
      || linked_revision.proposal_number
      || ', revision '
      || linked_revision.revision_number::text
    )
    or new.quantity is distinct from 1::numeric
    or new.unit_cost is distinct from linked_invoice.total
    or new.taxable
    or new.sort_order is distinct from 0
    or new.total is distinct from linked_invoice.total then
    raise exception using
      errcode = 'P0001',
      message = 'The proposal deposit invoice line must exactly match its immutable linked invoice and revision.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_proposal_deposit_line_immutability()
from public, anon, authenticated, service_role;

drop trigger if exists invoice_line_items_enforce_proposal_deposit_immutability
on public.invoice_line_items;
create trigger invoice_line_items_enforce_proposal_deposit_immutability
before insert or update or delete on public.invoice_line_items
for each row execute function public.wtos_enforce_proposal_deposit_line_immutability();

create or replace function public.wtos_create_proposal_deposit_invoice(
  deposit_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(deposit_request ->> 'operationKey', '')::uuid;
  request_company_id uuid := nullif(deposit_request ->> 'companyId', '')::uuid;
  request_revision_id uuid := nullif(deposit_request ->> 'proposalRevisionId', '')::uuid;
  request_acceptance_id uuid := nullif(deposit_request ->> 'acceptanceId', '')::uuid;
  request_due_date date := nullif(deposit_request ->> 'dueDate', '')::date;
  request_actor_user_id uuid := auth.uid();
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_acceptance public.estimate_proposal_acceptances%rowtype;
  selected_schedule public.proposal_payment_schedules%rowtype;
  existing_invoice public.invoices%rowtype;
  created_invoice_id uuid := gen_random_uuid();
  created_time timestamptz := clock_timestamp();
  invoice_number text;
begin
  if request_operation_key is null
    or request_company_id is null
    or request_revision_id is null
    or request_acceptance_id is null
    or request_actor_user_id is null then
    raise exception using errcode = 'P0001', message = 'An authenticated exact proposal deposit request is required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for update;

  select acceptance.* into selected_acceptance
  from public.estimate_proposal_acceptances as acceptance
  where acceptance.id = request_acceptance_id
    and acceptance.proposal_revision_id = request_revision_id
    and acceptance.company_id = request_company_id;

  select schedule.* into selected_schedule
  from public.proposal_payment_schedules as schedule
  where schedule.proposal_revision_id = request_revision_id
    and schedule.company_id = request_company_id
    and schedule.schedule_type = 'deposit'
  for update;

  -- The revision/schedule locks serialize simultaneous invoice creation. An
  -- identical waiter must now observe and return the first immutable invoice.
  select invoice.* into existing_invoice
  from public.invoices as invoice
  where invoice.proposal_invoice_operation_key = request_operation_key;

  if existing_invoice.id is not null then
    if selected_revision.id is null
      or selected_acceptance.id is null
      or selected_schedule.id is null
      or existing_invoice.company_id is distinct from request_company_id
      or existing_invoice.proposal_revision_id is distinct from request_revision_id
      or existing_invoice.proposal_acceptance_id is distinct from request_acceptance_id
      or existing_invoice.invoice_purpose <> 'proposal_deposit'
      or existing_invoice.total is distinct from selected_acceptance.required_deposit_amount
      or existing_invoice.due_date is distinct from coalesce(
        request_due_date,
        existing_invoice.issue_date + 7
      )
      or selected_schedule.invoice_id is distinct from existing_invoice.id
      or selected_schedule.status <> 'invoice_created' then
      raise exception using errcode = 'P0001', message = 'Deposit invoice idempotency key conflicts with the exact acceptance, amount, due date, or payment schedule.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'invoice_created',
      'invoiceId', existing_invoice.id,
      'proposalRevisionId', existing_invoice.proposal_revision_id,
      'acceptanceId', existing_invoice.proposal_acceptance_id,
      'requiredDepositAmount', selected_acceptance.required_deposit_amount,
      'balanceDue', existing_invoice.balance_due,
      'created', false
    );
  end if;

  if selected_revision.id is null
    or selected_acceptance.id is null
    or selected_schedule.id is null
    or selected_revision.accepted_acceptance_id is distinct from selected_acceptance.id
    or selected_revision.status not in ('accepted', 'converted_to_job')
    or selected_revision.signature_status <> 'signed'
    or selected_acceptance.acceptance_method <> 'native_electronic'
    or selected_acceptance.signature_status <> 'signed'
    or not selected_revision.deposit_required
    or selected_revision.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_revision.deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or selected_acceptance.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_acceptance.required_deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or selected_revision.deposit_amount <= 0
    or selected_acceptance.required_deposit_amount is distinct from selected_revision.deposit_amount
    or selected_schedule.calculated_amount is distinct from selected_revision.deposit_amount
    or selected_schedule.invoice_id is not null
    or not exists (
      select 1
      from public.proposal_signature_receipts as receipt
      where receipt.proposal_revision_id = selected_revision.id
        and receipt.acceptance_id = selected_acceptance.id
        and receipt.company_id = selected_revision.company_id
    ) then
    raise exception using errcode = 'P0001', message = 'A signed exact proposal, registered receipt, and unbilled required deposit are required.';
  end if;

  if request_due_date is not null and request_due_date < current_date then
    raise exception using errcode = 'P0001', message = 'Proposal deposit invoice due date cannot be in the past.';
  end if;

  invoice_number := 'DEP-' || selected_revision.id::text;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'create_proposal_deposit_invoice',
    request_operation_key
  );
  insert into public.invoices (
    id,
    company_id,
    customer_id,
    job_id,
    estimate_id,
    property_id,
    invoice_number,
    title,
    status,
    issue_date,
    due_date,
    subtotal,
    tax_rate,
    tax_total,
    discount_total,
    total,
    amount_paid,
    balance_due,
    notes,
    proposal_revision_id,
    proposal_acceptance_id,
    invoice_purpose,
    proposal_invoice_operation_key,
    created_at,
    updated_at
  )
  values (
    created_invoice_id,
    selected_revision.company_id,
    selected_revision.customer_id,
    null,
    selected_revision.estimate_id,
    selected_revision.property_id,
    invoice_number,
    'Required deposit - ' || selected_revision.proposal_number,
    'draft',
    current_date,
    coalesce(request_due_date, current_date + 7),
    selected_revision.deposit_amount,
    0,
    0,
    0,
    selected_revision.deposit_amount,
    0,
    selected_revision.deposit_amount,
    'Exact required deposit for electronically accepted proposal revision ' || selected_revision.revision_number::text || '.',
    selected_revision.id,
    selected_acceptance.id,
    'proposal_deposit',
    request_operation_key,
    created_time,
    created_time
  );

  insert into public.invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_cost,
    taxable,
    sort_order,
    total,
    created_at,
    updated_at
  )
  values (
    created_invoice_id,
    'Required deposit for proposal ' || selected_revision.proposal_number || ', revision ' || selected_revision.revision_number::text,
    1,
    selected_revision.deposit_amount,
    false,
    0,
    selected_revision.deposit_amount,
    created_time,
    created_time
  );

  update public.proposal_payment_schedules
  set
    invoice_id = created_invoice_id,
    status = 'invoice_created'
  where id = selected_schedule.id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    actor_id,
    summary,
    metadata,
    idempotency_key
  )
  values (
    selected_revision.company_id,
    selected_revision.id,
    selected_revision.estimate_id,
    selected_revision.customer_id,
    'native_proposal_deposit_invoice_created',
    'internal',
    request_actor_user_id,
    'Created the exact linked required-deposit invoice.',
    jsonb_build_object(
      'invoiceId', created_invoice_id,
      'acceptanceId', selected_acceptance.id,
      'requiredDepositAmount', selected_revision.deposit_amount
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'invoice_created',
    'invoiceId', created_invoice_id,
    'proposalRevisionId', selected_revision.id,
    'acceptanceId', selected_acceptance.id,
    'requiredDepositAmount', selected_revision.deposit_amount,
    'balanceDue', selected_revision.deposit_amount,
    'created', true
  );
end;
$$;

revoke all on function public.wtos_create_proposal_deposit_invoice(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_create_proposal_deposit_invoice(jsonb)
to authenticated;

create or replace function public.wtos_enforce_native_proposal_job_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_revision public.estimate_proposal_revisions%rowtype;
  linked_acceptance public.estimate_proposal_acceptances%rowtype;
  posted_deposit numeric := 0;
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.proposal_revision_id is not null
    and (
      new.proposal_revision_id is distinct from old.proposal_revision_id
      or new.proposal_acceptance_id is distinct from old.proposal_acceptance_id
      or new.conversion_operation_key is distinct from old.conversion_operation_key
    ) then
    raise exception using errcode = 'P0001', message = 'Sold-job proposal evidence bindings are immutable.';
  end if;

  -- Once conversion has committed exact immutable evidence, ordinary job
  -- operations remain usable even if a later owner-approved refund changes
  -- current payment state. Identity or evidence-link changes still fall
  -- through to the full gate below and cannot reuse stale conversion proof.
  if tg_op = 'UPDATE'
    and old.proposal_revision_id is not null
    and new.company_id is not distinct from old.company_id
    and new.customer_id is not distinct from old.customer_id
    and new.lead_id is not distinct from old.lead_id
    and new.estimate_id is not distinct from old.estimate_id
    and new.property_id is not distinct from old.property_id
    and new.proposal_revision_id is not distinct from old.proposal_revision_id
    and new.proposal_acceptance_id is not distinct from old.proposal_acceptance_id
    and new.conversion_operation_key is not distinct from old.conversion_operation_key then
    select acceptance.* into linked_acceptance
    from public.estimate_proposal_acceptances as acceptance
    where acceptance.id = old.proposal_acceptance_id
      and acceptance.proposal_revision_id = old.proposal_revision_id
      and acceptance.company_id = old.company_id;

    if linked_acceptance.id is null
      or new.total::text in ('NaN', 'Infinity', '-Infinity')
      or new.total is distinct from linked_acceptance.accepted_total then
      raise exception using
        errcode = 'P0001',
        message = 'A proposal-linked sold job must preserve the exact finite signed accepted total.';
    end if;
    return new;
  end if;

  if new.proposal_revision_id is not null then
    if tg_op = 'INSERT' then
      if not public.wtos_is_native_proposal_rpc_authorized() then
        raise exception using
          errcode = 'P0001',
          message = 'Proposal-linked sold jobs may be created only inside the authenticated owner conversion RPC.';
      end if;
    elsif (
      old.proposal_revision_id is null
      or new.proposal_revision_id is distinct from old.proposal_revision_id
      or new.proposal_acceptance_id is distinct from old.proposal_acceptance_id
      or new.conversion_operation_key is distinct from old.conversion_operation_key
    ) and not public.wtos_is_native_proposal_rpc_authorized() then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal-linked sold jobs may be created only inside the authenticated owner conversion RPC.';
    end if;
  end if;

  -- An unlinked draft cannot escape a subsequently finalized estimate by
  -- clearing/repointing estimate_id in the same statement as an operational
  -- mutation. The only allowed exit is the exact guarded conversion that
  -- attaches immutable proposal evidence.
  if tg_op = 'UPDATE'
    and old.proposal_revision_id is null
    and old.estimate_id is not null
    and exists (
      select 1
      from public.estimate_proposal_revisions as revision
      where revision.estimate_id = old.estimate_id
        and revision.company_id = old.company_id
        and revision.finalized_at is not null
        and revision.status not in ('superseded', 'canceled')
    )
    and (
      new.proposal_revision_id is null
      or not public.wtos_is_native_proposal_rpc_authorized()
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'An unlinked job cannot detach from or advance beyond an estimate with a finalized native proposal.';
  end if;

  if new.estimate_id is not null
    and new.proposal_revision_id is null
    and exists (
      select 1
      from public.estimate_proposal_revisions as revision
      where revision.estimate_id = new.estimate_id
        and revision.company_id = new.company_id
        and revision.finalized_at is not null
        and revision.status not in ('superseded', 'canceled')
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'A job for an estimate with a finalized native proposal must use the exact signed proposal conversion gate.';
  end if;

  if new.proposal_revision_id is null then
    return new;
  end if;

  select revision.* into linked_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = new.proposal_revision_id;

  select acceptance.* into linked_acceptance
  from public.estimate_proposal_acceptances as acceptance
  where acceptance.id = new.proposal_acceptance_id;

  select coalesce(sum(payment.amount), 0)
  into posted_deposit
  from public.invoices as invoice
  join public.payments as payment
    on payment.invoice_id = invoice.id
   and payment.company_id = invoice.company_id
   and payment.customer_id is not distinct from invoice.customer_id
   and payment.status = 'posted'
  where invoice.proposal_revision_id = new.proposal_revision_id
    and invoice.proposal_acceptance_id = new.proposal_acceptance_id
    and invoice.invoice_purpose = 'proposal_deposit'
    and invoice.status <> 'void'
    and invoice.company_id = linked_revision.company_id
    and invoice.customer_id is not distinct from linked_revision.customer_id
    and invoice.estimate_id is not distinct from linked_revision.estimate_id
    and invoice.total = linked_acceptance.required_deposit_amount;

  if linked_revision.id is null
    or linked_acceptance.id is null
    or new.company_id is distinct from linked_revision.company_id
    or new.customer_id is distinct from linked_revision.customer_id
    or new.lead_id is distinct from linked_revision.lead_id
    or new.estimate_id is distinct from linked_revision.estimate_id
    or new.property_id is distinct from linked_revision.property_id
    or linked_revision.accepted_acceptance_id is distinct from linked_acceptance.id
    or linked_revision.accepted_signature_id is null
    or linked_revision.signed_document_id is null
    or linked_revision.signature_status <> 'signed'
    or linked_revision.status not in ('accepted', 'converted_to_job')
    or not exists (
      select 1
      from public.estimates as estimate
      where estimate.id = linked_revision.estimate_id
        and estimate.company_id = linked_revision.company_id
        and estimate.status = 'approved'
        and estimate.customer_id is not distinct from linked_revision.customer_id
        and estimate.lead_id is not distinct from linked_revision.lead_id
        and estimate.property_id is not distinct from linked_revision.property_id
    )
    or linked_acceptance.acceptance_method <> 'native_electronic'
    or linked_acceptance.signature_status <> 'signed'
    or new.total::text in ('NaN', 'Infinity', '-Infinity')
    or new.total is distinct from linked_acceptance.accepted_total
    or linked_revision.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or linked_revision.deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or linked_acceptance.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or linked_acceptance.required_deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or posted_deposit::text in ('NaN', 'Infinity', '-Infinity')
    or not exists (
      select 1
      from public.proposal_signature_receipts as receipt
      where receipt.proposal_revision_id = linked_revision.id
        and receipt.acceptance_id = linked_acceptance.id
        and receipt.signature_id = linked_revision.accepted_signature_id
        and receipt.signed_document_id = linked_revision.signed_document_id
        and receipt.company_id = linked_revision.company_id
    )
    or (
      linked_revision.deposit_required
      and posted_deposit < linked_acceptance.required_deposit_amount
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Sold-job conversion requires the exact signed proposal, registered receipt, and fully posted linked deposit when required.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_native_proposal_job_conversion()
from public, anon, authenticated, service_role;

drop trigger if exists jobs_enforce_native_proposal_conversion on public.jobs;
drop trigger if exists jobs_enforce_native_proposal_conversion_insert on public.jobs;
drop trigger if exists jobs_enforce_native_proposal_conversion_update on public.jobs;
create trigger jobs_enforce_native_proposal_conversion_insert
before insert on public.jobs
for each row execute function public.wtos_enforce_native_proposal_job_conversion();

create trigger jobs_enforce_native_proposal_conversion_update
before update on public.jobs
for each row execute function public.wtos_enforce_native_proposal_job_conversion();

create or replace function public.wtos_convert_proposal_to_sold_job(
  conversion_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(conversion_request ->> 'operationKey', '')::uuid;
  request_company_id uuid := nullif(conversion_request ->> 'companyId', '')::uuid;
  request_revision_id uuid := nullif(conversion_request ->> 'proposalRevisionId', '')::uuid;
  request_acceptance_id uuid := nullif(conversion_request ->> 'acceptanceId', '')::uuid;
  request_existing_job_id uuid := nullif(conversion_request ->> 'existingJobId', '')::uuid;
  request_actor_user_id uuid := auth.uid();
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_acceptance public.estimate_proposal_acceptances%rowtype;
  selected_estimate public.estimates%rowtype;
  selected_company public.companies%rowtype;
  selected_deposit_invoice public.invoices%rowtype;
  existing_job public.jobs%rowtype;
  created_job_id uuid := gen_random_uuid();
  posted_deposit numeric := 0;
  revalidated_posted_deposit numeric := 0;
  proposal_property_address text;
  project_identity_address text;
  scope_text text;
  conversion_time timestamptz := clock_timestamp();
  job_created boolean := false;
  estimate_job_reference_count integer := 0;
  exact_estimate_job_count integer := 0;
  eligible_existing_job_count integer := 0;
begin
  if request_operation_key is null
    or request_company_id is null
    or request_revision_id is null
    or request_acceptance_id is null
    or request_actor_user_id is null then
    raise exception using errcode = 'P0001', message = 'An authenticated exact sold-job conversion request is required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for update;

  select acceptance.* into selected_acceptance
  from public.estimate_proposal_acceptances as acceptance
  where acceptance.id = request_acceptance_id
    and acceptance.proposal_revision_id = request_revision_id
    and acceptance.company_id = request_company_id;

  -- The revision lock serializes simultaneous conversion attempts. Re-read the
  -- exact job only after that lock so identical requests converge on the first
  -- committed conversion instead of failing the accepted -> converted state
  -- transition or the unique proposal-job binding.
  select job.* into existing_job
  from public.jobs as job
  where job.conversion_operation_key = request_operation_key
     or job.proposal_revision_id = request_revision_id
  order by (job.conversion_operation_key = request_operation_key) desc
  limit 1;

  if existing_job.id is not null then
    if selected_acceptance.id is null
      or existing_job.company_id is distinct from request_company_id
      or existing_job.proposal_revision_id is distinct from request_revision_id
      or existing_job.proposal_acceptance_id is distinct from request_acceptance_id
      or selected_acceptance.proposal_revision_id is distinct from request_revision_id
      or selected_acceptance.company_id is distinct from request_company_id
      or (
        request_existing_job_id is not null
        and existing_job.id is distinct from request_existing_job_id
      ) then
      raise exception using errcode = 'P0001', message = 'Sold-job conversion idempotency or proposal binding conflicts with another job.';
    end if;

    select coalesce(sum(payment.amount), 0)
    into posted_deposit
    from public.invoices as invoice
    join public.payments as payment
      on payment.invoice_id = invoice.id
     and payment.company_id = invoice.company_id
     and payment.customer_id is not distinct from invoice.customer_id
     and payment.status = 'posted'
    where invoice.proposal_revision_id = request_revision_id
      and invoice.proposal_acceptance_id = request_acceptance_id
      and invoice.invoice_purpose = 'proposal_deposit'
      and invoice.status <> 'void'
      and invoice.company_id = existing_job.company_id
      and invoice.customer_id is not distinct from selected_acceptance.customer_id
      and invoice.estimate_id is not distinct from selected_acceptance.estimate_id
      and invoice.total = selected_acceptance.required_deposit_amount;

    if posted_deposit::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception using
        errcode = 'P0001',
        message = 'Posted proposal deposit evidence must contain only finite amounts.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'sold_job',
      'jobId', existing_job.id,
      'proposalRevisionId', existing_job.proposal_revision_id,
      'acceptanceId', existing_job.proposal_acceptance_id,
      'acceptedTotal', selected_acceptance.accepted_total,
      'requiredDepositAmount', selected_acceptance.required_deposit_amount,
      'postedDepositAmount', posted_deposit,
      'convertedAt', existing_job.created_at,
      'created', false
    );
  end if;

  select estimate.* into selected_estimate
  from public.estimates as estimate
  where estimate.id = selected_revision.estimate_id
    and estimate.company_id = request_company_id
  for update;

  select company.* into selected_company
  from public.companies as company
  where company.id = request_company_id;

  select invoice.*
  into selected_deposit_invoice
  from public.invoices as invoice
  where invoice.proposal_revision_id = request_revision_id
    and invoice.invoice_purpose = 'proposal_deposit'
  order by invoice.id
  limit 1;

  if selected_deposit_invoice.id is not null then
    -- Match Stripe refund reconciliation's payment -> invoice lock order. Lock
    -- every payment, not only currently posted rows, so a concurrent refund or
    -- status reversal cannot disappear from the evidence set while converting.
    perform payment.id
    from public.payments as payment
    where payment.invoice_id = selected_deposit_invoice.id
    order by payment.id
    for update;

    select invoice.*
    into selected_deposit_invoice
    from public.invoices as invoice
    where invoice.id = selected_deposit_invoice.id
    for update;

    -- The invoice lock blocks new FK-linked payments. Repeat the ordered
    -- payment lock to include any insert that committed before that lock won.
    perform payment.id
    from public.payments as payment
    where payment.invoice_id = selected_deposit_invoice.id
    order by payment.id
    for update;
  end if;

  select coalesce(sum(payment.amount), 0)
  into posted_deposit
  from public.invoices as invoice
  join public.payments as payment
    on payment.invoice_id = invoice.id
   and payment.company_id = invoice.company_id
   and payment.customer_id is not distinct from invoice.customer_id
   and payment.status = 'posted'
  where invoice.id = selected_deposit_invoice.id
    and invoice.proposal_revision_id = request_revision_id
    and invoice.proposal_acceptance_id = request_acceptance_id
    and invoice.invoice_purpose = 'proposal_deposit'
    and invoice.status <> 'void'
    and invoice.company_id = selected_revision.company_id
    and invoice.customer_id is not distinct from selected_revision.customer_id
    and invoice.estimate_id is not distinct from selected_revision.estimate_id
    and invoice.total = selected_acceptance.required_deposit_amount;

  if selected_revision.id is null
    or selected_acceptance.id is null
    or selected_estimate.id is null
    or selected_company.id is null
    or selected_estimate.status <> 'approved'
    or selected_estimate.customer_id is distinct from selected_revision.customer_id
    or selected_estimate.lead_id is distinct from selected_revision.lead_id
    or selected_estimate.property_id is distinct from selected_revision.property_id
    or selected_revision.status <> 'accepted'
    or selected_revision.signature_status <> 'signed'
    or selected_revision.accepted_acceptance_id is distinct from selected_acceptance.id
    or selected_revision.accepted_signature_id is distinct from selected_acceptance.signature_id
    or selected_revision.signed_document_id is null
    or selected_acceptance.acceptance_method <> 'native_electronic'
    or selected_acceptance.signature_status <> 'signed'
    or selected_revision.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_revision.deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or selected_acceptance.accepted_total::text in ('NaN', 'Infinity', '-Infinity')
    or selected_acceptance.required_deposit_amount::text in ('NaN', 'Infinity', '-Infinity')
    or posted_deposit::text in ('NaN', 'Infinity', '-Infinity')
    or not exists (
      select 1
      from public.proposal_signature_receipts as receipt
      where receipt.proposal_revision_id = selected_revision.id
        and receipt.acceptance_id = selected_acceptance.id
        and receipt.signature_id = selected_acceptance.signature_id
        and receipt.signed_document_id = selected_revision.signed_document_id
        and receipt.company_id = selected_revision.company_id
    )
    or (
      selected_revision.deposit_required
      and (
        selected_deposit_invoice.id is null
        or selected_deposit_invoice.proposal_revision_id is distinct from selected_revision.id
        or selected_deposit_invoice.proposal_acceptance_id is distinct from selected_acceptance.id
        or selected_deposit_invoice.invoice_purpose <> 'proposal_deposit'
        or selected_deposit_invoice.status = 'void'
        or selected_deposit_invoice.company_id is distinct from selected_revision.company_id
        or selected_deposit_invoice.customer_id is distinct from selected_revision.customer_id
        or selected_deposit_invoice.estimate_id is distinct from selected_revision.estimate_id
        or selected_deposit_invoice.total is distinct from selected_acceptance.required_deposit_amount
        or posted_deposit < selected_acceptance.required_deposit_amount
      )
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Sold-job conversion requires an approved estimate, exact signed proposal receipt, and fully posted linked deposit when required.';
  end if;

  proposal_property_address := nullif(
    selected_revision.customer_snapshot #>> '{property,address}',
    ''
  );
  if proposal_property_address is null then
    raise exception using errcode = 'P0001', message = 'The exact finalized proposal is missing its customer property address.';
  end if;

  -- Mirror the owner UI's deterministic handoff address exactly. This value
  -- is used only to identify an unbound draft; the resulting sold job is
  -- normalized to the immutable finalized proposal address below.
  project_identity_address := coalesce(
    nullif(btrim(selected_estimate.location), ''),
    (
      select nullif(btrim(customer.property_address), '')
      from public.customers as customer
      where customer.id = selected_estimate.customer_id
        and customer.company_id = selected_estimate.company_id
    ),
    (
      select nullif(btrim(lead.property_address), '')
      from public.leads as lead
      where lead.id = selected_estimate.lead_id
        and lead.company_id = selected_estimate.company_id
    )
  );

  select nullif(string_agg(section.value ->> 'body', E'\n\n' order by coalesce((section.value ->> 'sortOrder')::integer, 0)), '')
  into scope_text
  from jsonb_array_elements(
    coalesce(selected_revision.customer_snapshot -> 'sections', '[]'::jsonb)
  ) as section(value)
  where section.value ->> 'sectionType' in (
    'recommended_solution',
    'scope',
    'base_proposal',
    'materials'
  )
    and nullif(btrim(section.value ->> 'body'), '') is not null;

  -- Re-read the exact evidence beneath the held payment and invoice locks
  -- immediately before the guarded job mutation. Locks release at transaction
  -- end, so a later owner-approved refund remains a normal auditable event.
  select coalesce(sum(payment.amount), 0)
  into revalidated_posted_deposit
  from public.invoices as invoice
  join public.payments as payment
    on payment.invoice_id = invoice.id
   and payment.company_id = invoice.company_id
   and payment.customer_id is not distinct from invoice.customer_id
   and payment.status = 'posted'
  where invoice.id = selected_deposit_invoice.id
    and invoice.proposal_revision_id = request_revision_id
    and invoice.proposal_acceptance_id = request_acceptance_id
    and invoice.invoice_purpose = 'proposal_deposit'
    and invoice.status <> 'void'
    and invoice.company_id = selected_revision.company_id
    and invoice.customer_id is not distinct from selected_revision.customer_id
    and invoice.estimate_id is not distinct from selected_revision.estimate_id
    and invoice.total = selected_acceptance.required_deposit_amount;

  if revalidated_posted_deposit::text in ('NaN', 'Infinity', '-Infinity')
    or revalidated_posted_deposit is distinct from posted_deposit
    or (
      selected_revision.deposit_required
      and (
        selected_deposit_invoice.id is null
        or selected_deposit_invoice.status = 'void'
        or selected_deposit_invoice.company_id is distinct from selected_revision.company_id
        or selected_deposit_invoice.customer_id is distinct from selected_revision.customer_id
        or selected_deposit_invoice.estimate_id is distinct from selected_revision.estimate_id
        or selected_deposit_invoice.proposal_revision_id is distinct from selected_revision.id
        or selected_deposit_invoice.proposal_acceptance_id is distinct from selected_acceptance.id
        or selected_deposit_invoice.invoice_purpose <> 'proposal_deposit'
        or selected_deposit_invoice.total is distinct from selected_acceptance.required_deposit_amount
        or revalidated_posted_deposit < selected_acceptance.required_deposit_amount
      )
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Linked deposit evidence changed before the sold-job conversion could commit.';
  end if;
  posted_deposit := revalidated_posted_deposit;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'convert_proposal_to_sold_job',
    request_operation_key
  );
  if request_existing_job_id is not null then
    -- Lock and count every candidate under the same exact rule used by the UI.
    -- A company with multiple plausible unlinked drafts is intentionally not
    -- auto-adopted; the caller must create a fresh exactly linked sold job.
    perform candidate.id
    from public.jobs as candidate
    where candidate.company_id = selected_revision.company_id
      and candidate.status = 'draft'
      and (
        candidate.estimate_id = selected_revision.estimate_id
        or candidate.estimate_id is null
      )
      and candidate.proposal_revision_id is null
      and candidate.proposal_acceptance_id is null
      and candidate.conversion_operation_key is null
      and (
        candidate.customer_id is null
        or candidate.customer_id = selected_revision.customer_id
      )
      and (
        candidate.lead_id is null
        or candidate.lead_id = selected_revision.lead_id
      )
      and (
        candidate.property_id is null
        or candidate.property_id = selected_revision.property_id
      )
      and (
        candidate.estimate_id = selected_revision.estimate_id
        or (
          candidate.estimate_id is null
          and candidate.customer_id is not distinct from selected_revision.customer_id
          and candidate.lead_id is not distinct from selected_revision.lead_id
          and candidate.property_id is not distinct from selected_revision.property_id
          and candidate.service_type is not distinct from selected_estimate.service_type
          and (
            lower(btrim(candidate.title)) = lower(btrim(selected_estimate.title))
            or (
              project_identity_address is not null
              and lower(project_identity_address) in (
                lower(btrim(candidate.address)),
                lower(btrim(candidate.property_address)),
                lower(btrim(candidate.location))
              )
            )
          )
        )
      )
    order by candidate.id
    for update;

    select job.* into existing_job
    from public.jobs as job
    where job.id = request_existing_job_id
      and job.company_id = selected_revision.company_id
    for update;

    select count(*) into exact_estimate_job_count
    from public.jobs as candidate
    where candidate.company_id = selected_revision.company_id
      and candidate.status = 'draft'
      and candidate.estimate_id = selected_revision.estimate_id
      and candidate.proposal_revision_id is null
      and candidate.proposal_acceptance_id is null
      and candidate.conversion_operation_key is null
      and (
        candidate.customer_id is null
        or candidate.customer_id = selected_revision.customer_id
      )
      and (
        candidate.lead_id is null
        or candidate.lead_id = selected_revision.lead_id
      )
      and (
        candidate.property_id is null
        or candidate.property_id = selected_revision.property_id
      );

    if exact_estimate_job_count > 0 then
      eligible_existing_job_count := exact_estimate_job_count;
    else
      select count(*) into eligible_existing_job_count
      from public.jobs as candidate
      where candidate.company_id = selected_revision.company_id
        and candidate.status = 'draft'
        and candidate.estimate_id is null
        and candidate.proposal_revision_id is null
        and candidate.proposal_acceptance_id is null
        and candidate.conversion_operation_key is null
        and candidate.customer_id is not distinct from selected_revision.customer_id
        and candidate.lead_id is not distinct from selected_revision.lead_id
        and candidate.property_id is not distinct from selected_revision.property_id
        and candidate.service_type is not distinct from selected_estimate.service_type
        and (
          lower(btrim(candidate.title)) = lower(btrim(selected_estimate.title))
          or (
            project_identity_address is not null
            and lower(project_identity_address) in (
              lower(btrim(candidate.address)),
              lower(btrim(candidate.property_address)),
              lower(btrim(candidate.location))
            )
          )
        );
    end if;

    if existing_job.id is null
      or existing_job.status <> 'draft'
      or existing_job.proposal_revision_id is not null
      or existing_job.proposal_acceptance_id is not null
      or existing_job.conversion_operation_key is not null
      or (
        exact_estimate_job_count > 0
        and existing_job.estimate_id is distinct from selected_revision.estimate_id
      )
      or (
        exact_estimate_job_count = 0
        and existing_job.estimate_id is not null
      )
      or eligible_existing_job_count <> 1
      or (
        existing_job.customer_id is not null
        and existing_job.customer_id is distinct from selected_revision.customer_id
      )
      or (
        existing_job.lead_id is not null
        and existing_job.lead_id is distinct from selected_revision.lead_id
      )
      or (
        existing_job.property_id is not null
        and existing_job.property_id is distinct from selected_revision.property_id
      )
      or (
        existing_job.estimate_id is null
        and (
          existing_job.customer_id is distinct from selected_revision.customer_id
          or existing_job.lead_id is distinct from selected_revision.lead_id
          or existing_job.property_id is distinct from selected_revision.property_id
          or existing_job.service_type is distinct from selected_estimate.service_type
          or not coalesce((
            lower(btrim(existing_job.title)) = lower(btrim(selected_estimate.title))
            or (
              project_identity_address is not null
              and lower(project_identity_address) in (
                lower(btrim(existing_job.address)),
                lower(btrim(existing_job.property_address)),
                lower(btrim(existing_job.location))
              )
            )
          ), false)
        )
      ) then
      raise exception using errcode = 'P0001', message = 'Only an exact unlinked draft job matching the proposal company, customer, lead, estimate, and property can be converted.';
    end if;

    update public.jobs
    set
      customer_id = coalesce(existing_job.customer_id, selected_revision.customer_id),
      lead_id = coalesce(existing_job.lead_id, selected_revision.lead_id),
      estimate_id = selected_revision.estimate_id,
      property_id = coalesce(existing_job.property_id, selected_revision.property_id),
      title = selected_revision.title,
      service_type = selected_estimate.service_type,
      business = selected_company.name,
      location = proposal_property_address,
      address = proposal_property_address,
      property_address = proposal_property_address,
      scope_of_work = scope_text,
      proposal_revision_id = selected_revision.id,
      proposal_acceptance_id = selected_acceptance.id,
      conversion_operation_key = request_operation_key,
      total = selected_acceptance.accepted_total,
      updated_at = conversion_time
    where id = existing_job.id
    returning * into existing_job;

    created_job_id := existing_job.id;
  else
    -- A caller that omits existingJobId may create a fresh job only when no
    -- job already references this estimate and no unique eligible unbound
    -- draft exists. The held revision lock plus these ordered row locks
    -- serialize null-create attempts and force explicit adoption when safe.
    perform candidate.id
    from public.jobs as candidate
    where candidate.company_id = selected_revision.company_id
      and (
        candidate.estimate_id = selected_revision.estimate_id
        or (
          candidate.status = 'draft'
          and candidate.estimate_id is null
          and candidate.proposal_revision_id is null
          and candidate.proposal_acceptance_id is null
          and candidate.conversion_operation_key is null
          and candidate.customer_id is not distinct from selected_revision.customer_id
          and candidate.lead_id is not distinct from selected_revision.lead_id
          and candidate.property_id is not distinct from selected_revision.property_id
          and candidate.service_type is not distinct from selected_estimate.service_type
          and (
            lower(btrim(candidate.title)) = lower(btrim(selected_estimate.title))
            or (
              project_identity_address is not null
              and lower(project_identity_address) in (
                lower(btrim(candidate.address)),
                lower(btrim(candidate.property_address)),
                lower(btrim(candidate.location))
              )
            )
          )
        )
      )
    order by candidate.id
    for update;

    select count(*) into estimate_job_reference_count
    from public.jobs as candidate
    where candidate.company_id = selected_revision.company_id
      and candidate.estimate_id = selected_revision.estimate_id;

    select count(*) into eligible_existing_job_count
    from public.jobs as candidate
    where candidate.company_id = selected_revision.company_id
      and candidate.status = 'draft'
      and candidate.estimate_id is null
      and candidate.proposal_revision_id is null
      and candidate.proposal_acceptance_id is null
      and candidate.conversion_operation_key is null
      and candidate.customer_id is not distinct from selected_revision.customer_id
      and candidate.lead_id is not distinct from selected_revision.lead_id
      and candidate.property_id is not distinct from selected_revision.property_id
      and candidate.service_type is not distinct from selected_estimate.service_type
      and (
        lower(btrim(candidate.title)) = lower(btrim(selected_estimate.title))
        or (
          project_identity_address is not null
          and lower(project_identity_address) in (
            lower(btrim(candidate.address)),
            lower(btrim(candidate.property_address)),
            lower(btrim(candidate.location))
          )
        )
      );

    if estimate_job_reference_count > 0
      or eligible_existing_job_count = 1 then
      raise exception using
        errcode = 'P0001',
        message = 'An existing exact draft job must be explicitly selected for signed proposal conversion.';
    end if;

    insert into public.jobs (
      id,
      company_id,
      customer_id,
      lead_id,
      estimate_id,
      scope_id,
      property_id,
      title,
      service_type,
      status,
      business,
      location,
      address,
      property_address,
      scope_of_work,
      total,
      proposal_revision_id,
      proposal_acceptance_id,
      conversion_operation_key,
      created_at,
      updated_at
    )
    values (
      created_job_id,
      selected_revision.company_id,
      selected_revision.customer_id,
      selected_revision.lead_id,
      selected_revision.estimate_id,
      null,
      selected_revision.property_id,
      selected_revision.title,
      selected_estimate.service_type,
      'draft',
      selected_company.name,
      proposal_property_address,
      proposal_property_address,
      proposal_property_address,
      scope_text,
      selected_acceptance.accepted_total,
      selected_revision.id,
      selected_acceptance.id,
      request_operation_key,
      conversion_time,
      conversion_time
    )
    returning * into existing_job;

    job_created := true;
  end if;

  update public.estimate_proposal_revisions
  set
    status = 'converted_to_job',
    deposit_paid = least(posted_deposit, accepted_total),
    remaining_balance = round(greatest(accepted_total - posted_deposit, 0), 2),
    payment_status = case
      when deposit_required then 'received'
      else payment_status
    end,
    updated_by = request_actor_user_id
  where id = selected_revision.id;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  insert into public.proposal_audit_events (
    company_id,
    proposal_revision_id,
    estimate_id,
    customer_id,
    event_type,
    actor_type,
    actor_id,
    summary,
    metadata,
    idempotency_key
  )
  values (
    selected_revision.company_id,
    selected_revision.id,
    selected_revision.estimate_id,
    selected_revision.customer_id,
    'native_proposal_converted_to_sold_job',
    'internal',
    request_actor_user_id,
    'Converted the signed proposal into an exactly linked sold job.',
    jsonb_build_object(
      'jobId', created_job_id,
      'acceptanceId', selected_acceptance.id,
      'acceptedTotal', selected_acceptance.accepted_total,
      'requiredDepositAmount', selected_acceptance.required_deposit_amount,
      'postedDepositAmount', posted_deposit,
      'created', job_created
    ),
    request_operation_key::text
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'sold_job',
    'jobId', created_job_id,
    'proposalRevisionId', selected_revision.id,
    'acceptanceId', selected_acceptance.id,
    'acceptedTotal', selected_acceptance.accepted_total,
    'requiredDepositAmount', selected_acceptance.required_deposit_amount,
    'postedDepositAmount', posted_deposit,
    'convertedAt', conversion_time,
    'created', job_created
  );
end;
$$;

revoke all on function public.wtos_convert_proposal_to_sold_job(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_convert_proposal_to_sold_job(jsonb)
to authenticated;

create or replace function public.wtos_enforce_proposal_signature_email_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_operation_name text;
  target_revision public.estimate_proposal_revisions%rowtype;
  target_document public.documents%rowtype;
  target_customer public.customers%rowtype;
  target_connection public.integration_connections%rowtype;
  target_signing_request public.proposal_signing_requests%rowtype;
  prior_signing_request public.proposal_signing_requests%rowtype;
  immutable_old jsonb;
  immutable_new jsonb;
  immutable_metadata_old jsonb;
  immutable_metadata_new jsonb;
  link_placeholder constant text := '[[WTOS_PROPOSAL_SIGNING_LINK]]';
begin
  if public.wtos_is_synthetic_proposal_cleanup_authorized() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if coalesce(
    case when tg_op = 'INSERT' then null else old.metadata ->> 'draftType' end,
    ''
  ) <> 'proposal_signature_request'
    and coalesce(
      case when tg_op = 'DELETE' then null else new.metadata ->> 'draftType' end,
      ''
    ) <> 'proposal_signature_request' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select rpc_guard.operation_name
  into active_operation_name
  from public.proposal_native_rpc_guards as rpc_guard
  where rpc_guard.backend_pid = pg_catalog.pg_backend_pid()
    and rpc_guard.transaction_id = pg_catalog.txid_current()
    and rpc_guard.operation_key::text = pg_catalog.current_setting(
      'wtos.native_proposal_rpc_operation',
      true
    );

  if active_operation_name is null then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal signature email drafts and provider delivery evidence may change only inside an approved private RPC.';
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal signature email delivery evidence cannot be deleted.';
  end if;

  if tg_op = 'INSERT' then
    if active_operation_name not in (
      'create_proposal_signature_email_draft',
      'activate_synthetic_proposal_signing_fixture'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'A proposal signature email may be created only by the approved service or isolated regression RPC.';
    end if;
  else
    if active_operation_name not in (
      'queue_proposal_signature_email',
      'proposal_signature_email_delivery_recover_pre_send',
      'proposal_signature_email_delivery_claim_send',
      'proposal_signature_email_delivery_mark_prepare_failed',
      'proposal_signature_email_delivery_mark_provider_attempt',
      'proposal_signature_email_delivery_checkpoint_provider',
      'proposal_signature_email_delivery_mark_sent',
      'proposal_signature_email_delivery_mark_provider_unknown',
      'proposal_signature_email_delivery_mark_provider_failed',
      'proposal_signature_email_delivery_mark_pre_send_interrupted',
      'proposal_signature_email_delivery_cancel_unsent',
      'proposal_signature_email_delivery_abandon_unknown',
      'proposal_signature_email_delivery_finalize_delivery',
      'proposal_signature_email_delivery_reconcile_delivery'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal signature email updates may run only inside the exact queue or provider-delivery RPC.';
    end if;

    if new.metadata ->> 'draftType' <> 'proposal_signature_request'
      or old.metadata ->> 'draftType' <> 'proposal_signature_request' then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal signature email identity cannot be attached, detached, or relabeled.';
    end if;

    immutable_old := to_jsonb(old) - array[
      'status',
      'sync_status',
      'gmail_message_id',
      'gmail_thread_id',
      'provider_account_id',
      'provider_payload_hash',
      'queued_at',
      'sent_at',
      'last_error',
      'metadata',
      'updated_at'
    ];
    immutable_new := to_jsonb(new) - array[
      'status',
      'sync_status',
      'gmail_message_id',
      'gmail_thread_id',
      'provider_account_id',
      'provider_payload_hash',
      'queued_at',
      'sent_at',
      'last_error',
      'metadata',
      'updated_at'
    ];
    if immutable_new is distinct from immutable_old then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal signature email recipient, content, mailbox, artifact, and company identity are immutable.';
    end if;

    immutable_metadata_old := jsonb_build_object(
      'draftType', old.metadata -> 'draftType',
      'generatedBy', old.metadata -> 'generatedBy',
      'attachmentPolicy', old.metadata -> 'attachmentPolicy',
      'signingLinkPlaceholder', old.metadata -> 'signingLinkPlaceholder',
      'proposalRevisionId', old.metadata -> 'proposalRevisionId',
      'proposalNumber', old.metadata -> 'proposalNumber',
      'proposalRevisionNumber', old.metadata -> 'proposalRevisionNumber',
      'proposalAcceptedTotal', old.metadata -> 'proposalAcceptedTotal',
      'proposalRevisionSha256', old.metadata -> 'proposalRevisionSha256',
      'proposalTermsSha256', old.metadata -> 'proposalTermsSha256',
      'proposalDocumentId', old.metadata -> 'proposalDocumentId',
      'proposalDocumentSha256', old.metadata -> 'proposalDocumentSha256',
      'immutableCustomerArtifact', old.metadata -> 'immutableCustomerArtifact',
      'regressionSyntheticDelivery', old.metadata -> 'regressionSyntheticDelivery',
      'regressionRunId', old.metadata -> 'regressionRunId',
      'regressionActivationOperationKey', old.metadata -> 'regressionActivationOperationKey'
    );
    immutable_metadata_new := jsonb_build_object(
      'draftType', new.metadata -> 'draftType',
      'generatedBy', new.metadata -> 'generatedBy',
      'attachmentPolicy', new.metadata -> 'attachmentPolicy',
      'signingLinkPlaceholder', new.metadata -> 'signingLinkPlaceholder',
      'proposalRevisionId', new.metadata -> 'proposalRevisionId',
      'proposalNumber', new.metadata -> 'proposalNumber',
      'proposalRevisionNumber', new.metadata -> 'proposalRevisionNumber',
      'proposalAcceptedTotal', new.metadata -> 'proposalAcceptedTotal',
      'proposalRevisionSha256', new.metadata -> 'proposalRevisionSha256',
      'proposalTermsSha256', new.metadata -> 'proposalTermsSha256',
      'proposalDocumentId', new.metadata -> 'proposalDocumentId',
      'proposalDocumentSha256', new.metadata -> 'proposalDocumentSha256',
      'immutableCustomerArtifact', new.metadata -> 'immutableCustomerArtifact',
      'regressionSyntheticDelivery', new.metadata -> 'regressionSyntheticDelivery',
      'regressionRunId', new.metadata -> 'regressionRunId',
      'regressionActivationOperationKey', new.metadata -> 'regressionActivationOperationKey'
    );
    if immutable_metadata_new is distinct from immutable_metadata_old then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal signature email immutable revision, document, and digest metadata cannot change.';
    end if;

    if new.metadata ->> 'proposalSigningRequestId'
      is distinct from old.metadata ->> 'proposalSigningRequestId'
      and active_operation_name <>
        'proposal_signature_email_delivery_recover_pre_send' then
      raise exception using
        errcode = 'P0001',
        message = 'Proposal signing request identity can rotate only during an exact pre-provider recovery.';
    end if;

    if old.gmail_message_id is not null
      and new.gmail_message_id is distinct from old.gmail_message_id then
      raise exception using
        errcode = 'P0001',
        message = 'Provider-confirmed Gmail message identity is immutable.';
    end if;
    if old.provider_payload_hash is not null
      and new.provider_payload_hash is distinct from old.provider_payload_hash
      and not (
        active_operation_name =
          'proposal_signature_email_delivery_recover_pre_send'
        and new.provider_payload_hash is null
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'The owner-approved provider payload digest is immutable.';
    end if;
    if old.provider_account_id is not null
      and new.provider_account_id is distinct from old.provider_account_id
      and not (
        active_operation_name =
          'proposal_signature_email_delivery_recover_pre_send'
        and new.provider_account_id is null
      ) then
      raise exception using
        errcode = 'P0001',
        message = 'The selected Gmail provider account identity is immutable after claim.';
    end if;
    if old.gmail_thread_id is not null
      and new.gmail_thread_id is distinct from old.gmail_thread_id then
      raise exception using
        errcode = 'P0001',
        message = 'Provider-confirmed Gmail thread identity is immutable.';
    end if;
    if old.queued_at is not null and new.queued_at is distinct from old.queued_at then
      raise exception using
        errcode = 'P0001',
        message = 'The owner-approved proposal signature queue time is immutable.';
    end if;
    if old.sent_at is not null and new.sent_at is distinct from old.sent_at then
      raise exception using
        errcode = 'P0001',
        message = 'Provider-confirmed proposal delivery time is immutable.';
    end if;
    if old.status in ('sent', 'failed')
      and (new.status is distinct from old.status
        or new.sync_status is distinct from old.sync_status) then
      raise exception using
        errcode = 'P0001',
        message = 'Terminal proposal signature email delivery state cannot be rewritten.';
    end if;
  end if;

  if new.status = 'draft' and new.sync_status <> 'local'
    or new.status = 'queued' and new.sync_status not in ('queued', 'syncing')
    or new.status = 'sent' and new.sync_status <> 'sent'
    or new.status = 'failed' and new.sync_status <> 'failed' then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal signature email status and sync lifecycle must move together.';
  end if;

  if new.status = 'sent'
    and (
      nullif(new.gmail_message_id, '') is null
      or new.sent_at is null
      or new.metadata ->> 'gmailDeliveryState' <> 'provider_confirmed'
      or new.metadata ->> 'gmailConfirmedMessageId' is distinct from new.gmail_message_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Sent proposal signature email state requires exact durable Gmail provider evidence.';
  end if;

  if new.gmail_message_id is not null
    and (
      new.metadata ->> 'gmailDeliveryState' <> 'provider_confirmed'
      or new.metadata ->> 'gmailConfirmedMessageId' is distinct from new.gmail_message_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'A Gmail message ID may be stored only with matching provider-confirmed metadata.';
  end if;

  if new.metadata ->> 'proposalSigningRequestId'
      !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or new.metadata ->> 'signingLinkPlaceholder' <> link_placeholder
    or (
      length(new.body) - length(replace(new.body, link_placeholder, ''))
    ) / length(link_placeholder) <> 1
    or new.body like '%#token=%'
    or new.metadata::text ~* '"(?:rawToken|requestToken|sessionToken|signingUrl)"' then
    raise exception using
      errcode = 'P0001',
      message = 'Stored proposal signature email drafts must remain token-free with one exact signing-link placeholder.';
  end if;

  select revision.* into target_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = (new.metadata ->> 'proposalRevisionId')::uuid
    and revision.company_id = new.company_id;
  select document.* into target_document
  from public.documents as document
  where document.id = new.document_id
    and document.company_id = new.company_id;
  select customer.* into target_customer
  from public.customers as customer
  where customer.id = new.customer_id
    and customer.company_id = new.company_id;
  select connection.* into target_connection
  from public.integration_connections as connection
  where connection.id = new.integration_connection_id
    and connection.company_id = new.company_id
    and connection.provider = 'gmail';

  if active_operation_name in (
    'proposal_signature_email_delivery_mark_provider_attempt',
    'proposal_signature_email_delivery_checkpoint_provider',
    'proposal_signature_email_delivery_mark_sent',
    'proposal_signature_email_delivery_mark_provider_unknown',
    'proposal_signature_email_delivery_mark_provider_failed',
    'proposal_signature_email_delivery_mark_pre_send_interrupted',
    'proposal_signature_email_delivery_abandon_unknown',
    'proposal_signature_email_delivery_finalize_delivery',
    'proposal_signature_email_delivery_reconcile_delivery'
  ) then
    select signing_request.* into target_signing_request
    from public.proposal_signing_requests as signing_request
    where signing_request.id = (
        new.metadata ->> 'proposalSigningRequestId'
      )::uuid
      and signing_request.company_id = new.company_id;
  elsif active_operation_name =
      'proposal_signature_email_delivery_recover_pre_send' then
    select signing_request.* into prior_signing_request
    from public.proposal_signing_requests as signing_request
    where signing_request.id = (
        old.metadata ->> 'proposalSigningRequestId'
      )::uuid
      and signing_request.company_id = new.company_id;
  end if;

  if target_revision.id is null
    or target_document.id is null
    or target_customer.id is null
    or (
      active_operation_name <> 'activate_synthetic_proposal_signing_fixture'
      and target_connection.id is null
    )
    or target_revision.finalized_document_id is distinct from target_document.id
    or target_document.proposal_revision_id is distinct from target_revision.id
    or target_revision.customer_id is distinct from target_customer.id
    or target_revision.estimate_id is distinct from new.estimate_id
    or target_revision.lead_id is distinct from new.lead_id
    or target_revision.property_id is distinct from new.property_id
    or target_revision.revision_sha256 is distinct from lower(
      new.metadata ->> 'proposalRevisionSha256'
    )
    or target_revision.terms_sha256 is distinct from lower(
      new.metadata ->> 'proposalTermsSha256'
    )
    or target_document.content_sha256 is distinct from lower(
      new.metadata ->> 'proposalDocumentSha256'
    )
    or new.metadata ->> 'proposalDocumentId' is distinct from target_document.id::text
    or new.metadata ->> 'proposalNumber' is distinct from target_revision.proposal_number
    or (new.metadata ->> 'proposalRevisionNumber')::integer
      is distinct from target_revision.revision_number
    or (new.metadata ->> 'proposalAcceptedTotal')::numeric
      is distinct from target_revision.accepted_total
    or new.provider <> 'gmail'
    or new.category <> 'estimate'
    or new.direction <> 'outbound'
    or new.to_emails is distinct from array[lower(new.to_email)]
    or new.cc_email is not null
    or cardinality(new.cc_emails) <> 0
    or cardinality(new.bcc_emails) <> 0
    or new.has_attachments is distinct from true
    or new.attachment_count is distinct from 1
    or new.metadata ->> 'attachmentPolicy' <> 'exact_proposal_pdf'
    or new.metadata ->> 'immutableCustomerArtifact' <> 'true'
    or (
      active_operation_name = 'activate_synthetic_proposal_signing_fixture'
      and (
        new.integration_connection_id is not null
        or new.from_email <> 'weathertech-os-regression@example.test'
        or new.provider_account_id is not null
        or new.provider_payload_hash is not null
        or new.status <> 'sent'
        or new.sync_status <> 'sent'
        or new.sent_at is null
        or new.metadata ->> 'generatedBy'
          <> 'weathertech_proposal_signature_regression'
        or new.metadata ->> 'regressionSyntheticDelivery' <> 'true'
        or new.metadata ->> 'regressionRunId' !~ '^[0-9]{17}$'
        or new.gmail_message_id is distinct from (
          'regression-' || (new.metadata ->> 'proposalSigningRequestId')
        )
        or new.gmail_thread_id is distinct from (
          'regression-thread-' || (new.metadata ->> 'proposalSigningRequestId')
        )
      )
    )
    or (
      (
        tg_op = 'INSERT'
        or active_operation_name = 'queue_proposal_signature_email'
      )
      and lower(new.to_email) is distinct from lower(target_customer.email)
    )
    or (
      active_operation_name in (
        'proposal_signature_email_delivery_mark_provider_attempt',
        'proposal_signature_email_delivery_checkpoint_provider',
        'proposal_signature_email_delivery_mark_sent',
        'proposal_signature_email_delivery_mark_provider_unknown',
        'proposal_signature_email_delivery_mark_provider_failed',
        'proposal_signature_email_delivery_mark_pre_send_interrupted',
        'proposal_signature_email_delivery_abandon_unknown',
        'proposal_signature_email_delivery_finalize_delivery',
        'proposal_signature_email_delivery_reconcile_delivery'
      )
      and (
        target_signing_request.id is null
        or target_signing_request.delivery_email_message_id is distinct from new.id
        or target_signing_request.proposal_revision_id is distinct from target_revision.id
        or target_signing_request.proposal_document_id is distinct from target_document.id
        or lower(target_signing_request.intended_signer_email)
          is distinct from lower(new.to_email)
      )
    )
    or (
      active_operation_name =
        'proposal_signature_email_delivery_recover_pre_send'
      and (
        (
          prior_signing_request.id is not null
          and (
            prior_signing_request.status not in (
              'failed',
              'revoked',
              'superseded',
              'expired'
            )
            or lower(prior_signing_request.intended_signer_email)
              is distinct from lower(new.to_email)
            or prior_signing_request.delivery_email_message_id
              is distinct from new.id
          )
        )
        or exists (
          select 1
          from public.proposal_signing_requests as replacement_request
          where replacement_request.id = (
              new.metadata ->> 'proposalSigningRequestId'
            )::uuid
        )
      )
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal signature email must remain bound to the exact company, customer, mailbox, revision, artifact, recipient, and digest evidence.';
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_enforce_proposal_signature_email_security()
from public, anon, authenticated, service_role;

drop trigger if exists email_messages_enforce_proposal_signature_security
on public.email_messages;
create trigger email_messages_enforce_proposal_signature_security
before insert or update or delete on public.email_messages
for each row execute function public.wtos_enforce_proposal_signature_email_security();

create or replace function public.wtos_create_proposal_signature_email_draft(
  draft_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(draft_request ->> 'operationKey', '')::uuid;
  request_actor_user_id uuid := nullif(draft_request ->> 'actorUserId', '')::uuid;
  request_email_message_id uuid := nullif(draft_request ->> 'emailMessageId', '')::uuid;
  request_company_id uuid := nullif(draft_request ->> 'companyId', '')::uuid;
  request_customer_id uuid := nullif(draft_request ->> 'customerId', '')::uuid;
  request_lead_id uuid := nullif(draft_request ->> 'leadId', '')::uuid;
  request_property_id uuid := nullif(draft_request ->> 'propertyId', '')::uuid;
  request_estimate_id uuid := nullif(draft_request ->> 'estimateId', '')::uuid;
  request_revision_id uuid := nullif(draft_request ->> 'proposalRevisionId', '')::uuid;
  request_document_id uuid := nullif(draft_request ->> 'documentId', '')::uuid;
  request_connection_id uuid := nullif(draft_request ->> 'integrationConnectionId', '')::uuid;
  request_signing_request_id uuid := nullif(draft_request ->> 'signingRequestId', '')::uuid;
  request_from_email text := lower(nullif(btrim(draft_request ->> 'fromEmail'), ''));
  request_to_email text := lower(nullif(btrim(draft_request ->> 'toEmail'), ''));
  request_subject text := nullif(draft_request ->> 'subject', '');
  request_body text := nullif(draft_request ->> 'body', '');
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_document public.documents%rowtype;
  selected_customer public.customers%rowtype;
  selected_connection public.integration_connections%rowtype;
  created_email public.email_messages%rowtype;
  operation_time timestamptz := clock_timestamp();
  link_placeholder constant text := '[[WTOS_PROPOSAL_SIGNING_LINK]]';
begin
  if draft_request is null or jsonb_typeof(draft_request) <> 'object'
    or request_operation_key is null
    or request_actor_user_id is null
    or request_email_message_id is null
    or request_company_id is null
    or request_customer_id is null
    or request_estimate_id is null
    or request_revision_id is null
    or request_document_id is null
    or request_connection_id is null
    or request_signing_request_id is null
    or request_from_email is null
    or request_to_email is null
    or request_subject is null
    or request_body is null then
    raise exception using errcode = 'P0001', message = 'An exact token-free proposal signature email draft request is required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);

  if not public.wtos_native_proposal_source_is_current(
    request_revision_id,
    request_company_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal source changed after finalization; finalize a new immutable revision before delivery.';
  end if;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for share;
  select document.* into selected_document
  from public.documents as document
  where document.id = request_document_id
    and document.company_id = request_company_id
  for share;
  select customer.* into selected_customer
  from public.customers as customer
  where customer.id = request_customer_id
    and customer.company_id = request_company_id
  for share;
  select connection.* into selected_connection
  from public.integration_connections as connection
  where connection.id = request_connection_id
    and connection.company_id = request_company_id
    and connection.provider = 'gmail'
    and connection.status = 'connected'
  for share;

  if selected_revision.id is null
    or selected_document.id is null
    or selected_customer.id is null
    or selected_connection.id is null
    or selected_revision.status not in ('ready_to_send', 'sent')
    or selected_revision.signature_status in ('signed', 'declined')
    or selected_revision.customer_id is distinct from selected_customer.id
    or selected_revision.estimate_id is distinct from request_estimate_id
    or selected_revision.lead_id is distinct from request_lead_id
    or selected_revision.property_id is distinct from request_property_id
    or selected_revision.finalized_document_id is distinct from selected_document.id
    or selected_document.proposal_revision_id is distinct from selected_revision.id
    or lower(selected_customer.email) is distinct from request_to_email
    or lower(selected_connection.account_email) is distinct from request_from_email
    or (
      length(request_body) - length(replace(request_body, link_placeholder, ''))
    ) / length(link_placeholder) <> 1
    or request_body like '%#token=%' then
    raise exception using
      errcode = 'P0001',
      message = 'Proposal signature draft does not match the exact unsigned revision, customer, private artifact, connected mailbox, and token-free placeholder.';
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'create_proposal_signature_email_draft',
    request_operation_key
  );
  insert into public.email_messages (
    id,
    company_id,
    customer_id,
    lead_id,
    property_id,
    estimate_id,
    document_id,
    integration_connection_id,
    provider,
    category,
    status,
    direction,
    from_email,
    to_email,
    to_emails,
    cc_emails,
    bcc_emails,
    reply_to_emails,
    subject,
    body,
    message_preview,
    has_attachments,
    attachment_count,
    sync_status,
    metadata,
    created_at,
    updated_at
  )
  values (
    request_email_message_id,
    request_company_id,
    request_customer_id,
    request_lead_id,
    request_property_id,
    request_estimate_id,
    request_document_id,
    request_connection_id,
    'gmail',
    'estimate',
    'draft',
    'outbound',
    request_from_email,
    request_to_email,
    array[request_to_email],
    '{}',
    '{}',
    '{}',
    request_subject,
    request_body,
    left(regexp_replace(request_body, '\\s+', ' ', 'g'), 500),
    true,
    1,
    'local',
    jsonb_build_object(
      'draftType', 'proposal_signature_request',
      'approvalState', 'draft',
      'requiresOwnerApproval', true,
      'generatedBy', 'weathertech_proposal_signature',
      'attachmentPolicy', 'exact_proposal_pdf',
      'signingLinkPlaceholder', link_placeholder,
      'proposalSigningRequestId', request_signing_request_id,
      'proposalRevisionId', selected_revision.id,
      'proposalNumber', selected_revision.proposal_number,
      'proposalRevisionNumber', selected_revision.revision_number,
      'proposalAcceptedTotal', selected_revision.accepted_total,
      'proposalRevisionSha256', selected_revision.revision_sha256,
      'proposalTermsSha256', selected_revision.terms_sha256,
      'proposalDocumentId', selected_document.id,
      'proposalDocumentSha256', selected_document.content_sha256,
      'immutableCustomerArtifact', true
    ),
    operation_time,
    operation_time
  )
  returning * into created_email;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  return jsonb_build_object(
    'ok', true,
    'status', 'draft',
    'emailMessageId', created_email.id,
    'signingRequestId', request_signing_request_id,
    'proposalRevisionId', selected_revision.id,
    'emailMessage', to_jsonb(created_email)
  );
end;
$$;

revoke all on function public.wtos_create_proposal_signature_email_draft(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_create_proposal_signature_email_draft(jsonb)
to service_role;

create or replace function public.wtos_activate_synthetic_proposal_signing_fixture(
  activation_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(
    activation_request ->> 'operationKey',
    ''
  )::uuid;
  request_regression_owner_user_id uuid := nullif(
    activation_request ->> 'regressionOwnerUserId',
    ''
  )::uuid;
  request_company_id uuid := nullif(
    activation_request ->> 'companyId',
    ''
  )::uuid;
  request_revision_id uuid := nullif(
    activation_request ->> 'proposalRevisionId',
    ''
  )::uuid;
  request_email_message_id uuid := nullif(
    activation_request ->> 'emailMessageId',
    ''
  )::uuid;
  request_signing_request_id uuid := nullif(
    activation_request ->> 'signingRequestId',
    ''
  )::uuid;
  request_run_id text := nullif(activation_request ->> 'runId', '');
  request_marker text;
  selected_owner record;
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_document public.documents%rowtype;
  selected_customer public.customers%rowtype;
  existing_email public.email_messages%rowtype;
  created_email public.email_messages%rowtype;
  operation_time timestamptz := clock_timestamp();
  request_subject text;
  request_body text;
  request_recipient text;
  provider_message_id text;
  provider_thread_id text;
  link_placeholder constant text := '[[WTOS_PROPOSAL_SIGNING_LINK]]';
begin
  if activation_request is null
    or jsonb_typeof(activation_request) <> 'object'
    or request_operation_key is null
    or request_regression_owner_user_id is null
    or request_company_id is null
    or request_revision_id is null
    or request_email_message_id is null
    or request_signing_request_id is null
    or request_run_id !~ '^[0-9]{17}$' then
    raise exception using
      errcode = 'P0001',
      message = 'Exact isolated proposal-signing regression identity is required.';
  end if;

  request_marker := 'TEST WTOS PROPOSAL SIGNING ' || request_run_id;
  provider_message_id := 'regression-' || request_signing_request_id::text;
  provider_thread_id := 'regression-thread-' || request_signing_request_id::text;

  select
    user_record.id,
    user_record.email,
    user_record.raw_app_meta_data
  into selected_owner
  from auth.users as user_record
  where user_record.id = request_regression_owner_user_id;

  if selected_owner.id is null
    or lower(selected_owner.email)
      !~ '^weathertech-os-regression[^@]*@example[.]test$'
    or selected_owner.raw_app_meta_data ->> 'wt_os_regression_marker'
      <> 'weathertech-os-regression-owner-v1'
    or selected_owner.raw_app_meta_data ->> 'wt_os_regression_project_ref'
      <> 'hygtnhmmaoboduqghhwg'
    or not exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = selected_owner.id
        and membership.company_id = request_company_id
        and membership.role = 'owner'
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Only the exact approved isolated regression owner can activate a synthetic signing fixture.';
  end if;

  if not public.wtos_native_proposal_source_is_current(
    request_revision_id,
    request_company_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Synthetic signing activation refused a proposal whose finalized source changed.';
  end if;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for share;

  if selected_revision.id is not null then
    select document.* into selected_document
    from public.documents as document
    where document.id = selected_revision.finalized_document_id
      and document.company_id = selected_revision.company_id
      and document.proposal_revision_id = selected_revision.id
    for share;

    select customer.* into selected_customer
    from public.customers as customer
    where customer.id = selected_revision.customer_id
      and customer.company_id = selected_revision.company_id
    for share;
  end if;

  request_recipient := lower(nullif(btrim(selected_customer.email), ''));
  request_subject := request_marker || ' electronic signature request';
  request_body := request_marker
    || E'\nSynthetic delivery fixture for '
    || coalesce(selected_revision.proposal_number, '')
    || E'.\n'
    || link_placeholder;

  if selected_revision.id is null
    or selected_document.id is null
    or selected_customer.id is null
    or selected_revision.status not in ('ready_to_send', 'sent')
    or selected_revision.signature_status in ('signed', 'declined')
    or selected_revision.finalized_at is null
    or selected_revision.revision_sha256 is null
    or selected_revision.terms_sha256 is null
    or selected_revision.title not like request_marker || '%'
    or selected_revision.customer_snapshot #>> '{customer,name}'
      not like request_marker || '%'
    or selected_document.category <> 'proposal'
    or selected_document.status not in ('ready', 'sent')
    or selected_document.storage_bucket <> 'customer-documents'
    or selected_document.storage_path is null
    or selected_document.mime_type <> 'application/pdf'
    or selected_document.file_url is not null
    or selected_document.content_sha256 is null
    or request_recipient
      !~ '^proposal-signing-[0-9]{17}-(weathertech|ihc)-[a-z0-9-]+@example[.]test$'
    or request_recipient not like 'proposal-signing-' || request_run_id || '-%'
    or exists (
      select 1
      from public.proposal_signing_requests as signing_request
      where signing_request.id = request_signing_request_id
        and not exists (
          select 1
          from public.email_messages as email
          where email.id = request_email_message_id
            and email.metadata ->> 'proposalSigningRequestId'
              = request_signing_request_id::text
        )
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'Synthetic activation requires one exact marked unsigned proposal, private artifact, and example.test customer.';
  end if;

  select email.* into existing_email
  from public.email_messages as email
  where email.id = request_email_message_id
     or email.metadata ->> 'regressionActivationOperationKey'
       = request_operation_key::text
  order by (
    email.metadata ->> 'regressionActivationOperationKey'
      = request_operation_key::text
  ) desc
  limit 1;

  if existing_email.id is not null then
    if existing_email.id is distinct from request_email_message_id
      or existing_email.company_id is distinct from request_company_id
      or existing_email.customer_id is distinct from selected_customer.id
      or existing_email.document_id is distinct from selected_document.id
      or existing_email.status <> 'sent'
      or existing_email.sync_status <> 'sent'
      or existing_email.to_email is distinct from request_recipient
      or existing_email.gmail_message_id is distinct from provider_message_id
      or existing_email.gmail_thread_id is distinct from provider_thread_id
      or existing_email.metadata ->> 'proposalSigningRequestId'
        is distinct from request_signing_request_id::text
      or existing_email.metadata ->> 'proposalRevisionId'
        is distinct from selected_revision.id::text
      or existing_email.metadata ->> 'proposalDocumentId'
        is distinct from selected_document.id::text then
      raise exception using
        errcode = 'P0001',
        message = 'Synthetic activation idempotency identity conflicts with another email fixture.';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'sent',
      'emailMessageId', existing_email.id,
      'signingRequestId', request_signing_request_id,
      'proposalRevisionId', selected_revision.id,
      'sentAt', existing_email.sent_at,
      'emailMessage', to_jsonb(existing_email)
    );
  end if;

  if exists (
    select 1
    from public.email_messages as email
    where email.metadata ->> 'proposalSigningRequestId'
      = request_signing_request_id::text
  ) or exists (
    select 1
    from public.proposal_signing_requests as signing_request
    where signing_request.id = request_signing_request_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Synthetic signing request identity is already bound to another fixture.';
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'activate_synthetic_proposal_signing_fixture',
    request_operation_key
  );
  insert into public.email_messages (
    id,
    company_id,
    customer_id,
    lead_id,
    property_id,
    estimate_id,
    document_id,
    integration_connection_id,
    provider,
    category,
    status,
    direction,
    from_email,
    to_email,
    to_emails,
    cc_emails,
    bcc_emails,
    reply_to_emails,
    subject,
    body,
    message_preview,
    has_attachments,
    attachment_count,
    gmail_message_id,
    gmail_thread_id,
    sent_at,
    sync_status,
    metadata,
    created_at,
    updated_at
  )
  values (
    request_email_message_id,
    selected_revision.company_id,
    selected_revision.customer_id,
    selected_revision.lead_id,
    selected_revision.property_id,
    selected_revision.estimate_id,
    selected_document.id,
    null,
    'gmail',
    'estimate',
    'sent',
    'outbound',
    'weathertech-os-regression@example.test',
    request_recipient,
    array[request_recipient],
    '{}',
    '{}',
    '{}',
    request_subject,
    request_body,
    left(regexp_replace(request_body, '\s+', ' ', 'g'), 500),
    true,
    1,
    provider_message_id,
    provider_thread_id,
    operation_time,
    'sent',
    jsonb_build_object(
      'draftType', 'proposal_signature_request',
      'approvalState', 'sent_regression_fixture',
      'requiresOwnerApproval', true,
      'generatedBy', 'weathertech_proposal_signature_regression',
      'attachmentPolicy', 'exact_proposal_pdf',
      'signingLinkPlaceholder', link_placeholder,
      'proposalSigningRequestId', request_signing_request_id,
      'proposalRevisionId', selected_revision.id,
      'proposalNumber', selected_revision.proposal_number,
      'proposalRevisionNumber', selected_revision.revision_number,
      'proposalAcceptedTotal', selected_revision.accepted_total,
      'proposalRevisionSha256', selected_revision.revision_sha256,
      'proposalTermsSha256', selected_revision.terms_sha256,
      'proposalDocumentId', selected_document.id,
      'proposalDocumentSha256', selected_document.content_sha256,
      'immutableCustomerArtifact', true,
      'regressionSyntheticDelivery', true,
      'regressionRunId', request_run_id,
      'regressionActivationOperationKey', request_operation_key,
      'gmailDeliveryState', 'provider_confirmed',
      'gmailProviderConfirmedAt', operation_time,
      'gmailConfirmedMessageId', provider_message_id,
      'gmailConfirmedThreadId', provider_thread_id,
      'proposalSigningDeliveryStatus', 'provider_confirmed_pending_activation'
    ),
    operation_time,
    operation_time
  )
  returning * into created_email;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  return jsonb_build_object(
    'ok', true,
    'status', 'sent',
    'emailMessageId', created_email.id,
    'signingRequestId', request_signing_request_id,
    'proposalRevisionId', selected_revision.id,
    'sentAt', created_email.sent_at,
    'emailMessage', to_jsonb(created_email)
  );
end;
$$;

revoke all on function public.wtos_activate_synthetic_proposal_signing_fixture(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_activate_synthetic_proposal_signing_fixture(jsonb)
to service_role;

create or replace function public.wtos_queue_proposal_signature_email(
  queue_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(queue_request ->> 'operationKey', '')::uuid;
  request_company_id uuid := nullif(queue_request ->> 'companyId', '')::uuid;
  request_email_message_id uuid := nullif(queue_request ->> 'emailMessageId', '')::uuid;
  request_payload_fingerprint text := lower(nullif(
    queue_request ->> 'pendingPayloadHash',
    ''
  ));
  request_actor_user_id uuid := auth.uid();
  selected_email public.email_messages%rowtype;
  queued_email public.email_messages%rowtype;
  queued_time timestamptz := clock_timestamp();
begin
  if queue_request is null or jsonb_typeof(queue_request) <> 'object'
    or request_operation_key is null
    or request_company_id is null
    or request_email_message_id is null
    or request_actor_user_id is null
    or request_payload_fingerprint !~ '^gmail-v1-[0-9a-f]{8}$' then
    raise exception using errcode = 'P0001', message = 'An authenticated exact proposal signature queue request is required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);
  select email.* into selected_email
  from public.email_messages as email
  where email.id = request_email_message_id
    and email.company_id = request_company_id
  for update;

  if selected_email.id is null
    or selected_email.metadata ->> 'draftType' <> 'proposal_signature_request' then
    raise exception using errcode = 'P0001', message = 'The exact company proposal signature email draft was not found.';
  end if;

  if selected_email.status = 'queued'
    and selected_email.sync_status = 'queued'
    and selected_email.metadata ->> 'pendingPayloadHash'
      = request_payload_fingerprint then
    return jsonb_build_object(
      'ok', true,
      'status', 'queued',
      'emailMessageId', selected_email.id,
      'emailMessage', to_jsonb(selected_email)
    );
  end if;

  if selected_email.status <> 'draft' or selected_email.sync_status <> 'local' then
    raise exception using errcode = 'P0001', message = 'Only an unchanged proposal signature draft can enter the owner-approved Gmail queue.';
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'queue_proposal_signature_email',
    request_operation_key
  );
  update public.email_messages
  set
    status = 'queued',
    sync_status = 'queued',
    queued_at = queued_time,
    last_error = null,
    metadata = selected_email.metadata || jsonb_build_object(
      'approvalState', 'pending_owner_approval',
      'submittedForApprovalAt', queued_time,
      'requiresOwnerApproval', true,
      'pendingPayloadHash', request_payload_fingerprint
    )
  where id = selected_email.id
  returning * into queued_email;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  return jsonb_build_object(
    'ok', true,
    'status', 'queued',
    'emailMessageId', queued_email.id,
    'emailMessage', to_jsonb(queued_email)
  );
end;
$$;

revoke all on function public.wtos_queue_proposal_signature_email(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_queue_proposal_signature_email(jsonb)
to authenticated;

create or replace function public.wtos_transition_proposal_signature_email(
  delivery_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(delivery_request ->> 'operationKey', '')::uuid;
  request_actor_user_id uuid := nullif(delivery_request ->> 'actorUserId', '')::uuid;
  request_company_id uuid := nullif(delivery_request ->> 'companyId', '')::uuid;
  request_email_message_id uuid := nullif(delivery_request ->> 'emailMessageId', '')::uuid;
  request_action text := nullif(delivery_request ->> 'action', '');
  request_expected_send_attempt_id text := nullif(
    delivery_request ->> 'expectedSendAttemptId',
    ''
  );
  request_expected_gmail_message_id text := nullif(
    delivery_request ->> 'expectedGmailMessageId',
    ''
  );
  request_metadata jsonb := delivery_request -> 'metadata';
  selected_email public.email_messages%rowtype;
  selected_signing_request public.proposal_signing_requests%rowtype;
  selected_revision public.estimate_proposal_revisions%rowtype;
  updated_email public.email_messages%rowtype;
begin
  if delivery_request is null or jsonb_typeof(delivery_request) <> 'object'
    or request_operation_key is null
    or request_actor_user_id is null
    or request_company_id is null
    or request_email_message_id is null
    or request_action not in (
      'recover_pre_send',
      'claim_send',
      'mark_prepare_failed',
      'mark_provider_attempt',
      'checkpoint_provider',
      'mark_sent',
      'mark_provider_unknown',
      'mark_provider_failed',
      'mark_pre_send_interrupted',
      'cancel_unsent',
      'abandon_unknown',
      'finalize_delivery',
      'reconcile_delivery'
    )
    or request_metadata is null
    or jsonb_typeof(request_metadata) <> 'object' then
    raise exception using errcode = 'P0001', message = 'An exact bounded proposal signature email delivery transition is required.';
  end if;

  perform public.wtos_assert_proposal_owner(request_company_id, request_actor_user_id);
  select email.* into selected_email
  from public.email_messages as email
  where email.id = request_email_message_id
    and email.company_id = request_company_id;

  if selected_email.id is null
    or selected_email.metadata ->> 'draftType' <> 'proposal_signature_request' then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'Proposal signature email delivery state changed before the exact transition.'
    );
  end if;

  if request_action in ('claim_send', 'mark_provider_attempt')
    and not public.wtos_native_proposal_source_is_current(
      (selected_email.metadata ->> 'proposalRevisionId')::uuid,
      selected_email.company_id
    ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'source_changed',
      'message', 'Proposal source changed after finalization; no provider call is authorized until a new immutable revision is finalized.'
    );
  end if;

  -- Preserve the estimate -> active request/revision -> email lock order used
  -- by finalization and signing preparation. The provider attempt is allowed
  -- only while the exact request and immutable revision remain active.
  if request_action = 'mark_provider_attempt' then
    select signing_request.* into selected_signing_request
    from public.proposal_signing_requests as signing_request
    where signing_request.id = (
        selected_email.metadata ->> 'proposalSigningRequestId'
      )::uuid
      and signing_request.company_id = selected_email.company_id
      and signing_request.delivery_email_message_id = selected_email.id
    for share;

    select revision.* into selected_revision
    from public.estimate_proposal_revisions as revision
    where revision.id = (
        selected_email.metadata ->> 'proposalRevisionId'
      )::uuid
      and revision.company_id = selected_email.company_id
    for share;

    if selected_signing_request.id is null
      or selected_signing_request.status <> 'prepared'
      or selected_signing_request.expires_at <= clock_timestamp()
      or selected_revision.id is null
      or selected_revision.status <> 'ready_to_send'
      or selected_revision.signature_status <> 'prepared'
      or selected_revision.accepted_acceptance_id is not null then
      return jsonb_build_object(
        'ok', false,
        'status', 'conflict',
        'message', 'The exact active prepared signing request is no longer eligible for a Gmail provider call.'
      );
    end if;
  end if;

  select email.* into selected_email
  from public.email_messages as email
  where email.id = request_email_message_id
    and email.company_id = request_company_id
  for update;

  if selected_email.id is null
    or selected_email.metadata ->> 'draftType' <> 'proposal_signature_request'
    or (
      request_expected_send_attempt_id is not null
      and selected_email.metadata ->> 'sendAttemptId'
        is distinct from request_expected_send_attempt_id
    )
    or (
      request_expected_gmail_message_id is not null
      and selected_email.gmail_message_id
        is distinct from request_expected_gmail_message_id
    ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'conflict',
      'message', 'Proposal signature email delivery state changed before the exact transition.'
    );
  end if;

  if request_action = 'recover_pre_send' and not (
      selected_email.status = 'queued'
      and selected_email.sync_status = 'syncing'
      and selected_email.gmail_message_id is null
      and selected_email.metadata ->> 'gmailDeliveryState' = 'claimed_pre_send'
      and request_expected_send_attempt_id is not null
      and request_metadata ->> 'proposalSigningRequestId'
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action = 'claim_send' and not (
      selected_email.status = 'queued'
      and selected_email.sync_status = 'queued'
      and request_metadata ->> 'approvalState' = 'owner_approved'
      and request_metadata ->> 'approvedBy' = request_actor_user_id::text
      and request_metadata ->> 'gmailDeliveryState' = 'claimed_pre_send'
      and nullif(request_metadata ->> 'sendAttemptId', '') is not null
      and lower(nullif(delivery_request ->> 'fromEmail', '')) is not null
      and lower(nullif(delivery_request ->> 'providerPayloadHash', ''))
        ~ '^gmail-v1-[0-9a-f]{8}$'
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action in ('mark_prepare_failed', 'mark_provider_failed') and not (
      selected_email.status = 'queued'
      and selected_email.sync_status = 'syncing'
      and nullif(delivery_request ->> 'lastError', '') is not null
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action in (
      'mark_provider_attempt',
      'mark_provider_unknown',
      'mark_pre_send_interrupted'
    ) and not (
      selected_email.status = 'queued'
      and selected_email.sync_status = 'syncing'
      and request_expected_send_attempt_id is not null
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action = 'cancel_unsent' and not (
      (
        selected_email.status = 'draft'
        and selected_email.sync_status = 'local'
        or selected_email.status = 'queued'
        and selected_email.sync_status = 'queued'
      )
      and selected_email.gmail_message_id is null
      and selected_email.gmail_thread_id is null
      and selected_email.provider_account_id is null
      and selected_email.provider_payload_hash is null
      and selected_email.sent_at is null
      and nullif(delivery_request ->> 'lastError', '') is not null
      and request_metadata ->> 'approvalState' in (
        'canceled_unsent',
        'superseded_unsent'
      )
      and not exists (
        select 1
        from public.proposal_signing_requests as signing_request
        where signing_request.delivery_email_message_id = selected_email.id
      )
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action = 'abandon_unknown' and not (
      selected_email.status = 'queued'
      and selected_email.sync_status = 'syncing'
      and selected_email.gmail_message_id is null
      and selected_email.gmail_thread_id is null
      and selected_email.sent_at is null
      and selected_email.metadata ->> 'gmailDeliveryState'
        = 'provider_outcome_unknown'
      and request_expected_send_attempt_id is not null
      and nullif(delivery_request ->> 'lastError', '') is not null
      and request_metadata ->> 'gmailDeliveryState'
        = 'provider_outcome_abandoned'
      and request_metadata ->> 'approvalState'
        = 'provider_outcome_abandoned'
      and exists (
        select 1
        from public.proposal_signing_requests as signing_request
        join public.signatures as signature
          on signature.id = signing_request.signature_id
         and signature.proposal_revision_id
           = signing_request.proposal_revision_id
        join public.estimate_proposal_revisions as revision
          on revision.id = signing_request.proposal_revision_id
         and revision.company_id = signing_request.company_id
        where signing_request.id = (
            selected_email.metadata ->> 'proposalSigningRequestId'
          )::uuid
          and signing_request.company_id = selected_email.company_id
          and signing_request.delivery_email_message_id = selected_email.id
          and signing_request.status = 'revoked'
          and signing_request.revoked_at is not null
          and signature.status = 'revoked'
          and signature.acceptance_id is null
          and revision.status = 'ready_to_send'
          and revision.signature_status = 'ready_to_send'
          and revision.accepted_acceptance_id is null
          and revision.accepted_signature_id is null
          and not exists (
            select 1
            from public.proposal_signing_sessions as session
            where session.signing_request_id = signing_request.id
              and session.status = 'active'
          )
      )
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action = 'checkpoint_provider' and not (
      selected_email.status = 'queued'
      and selected_email.sync_status = 'syncing'
      and request_expected_send_attempt_id is not null
      and nullif(delivery_request ->> 'gmailMessageId', '') is not null
      and request_metadata ->> 'gmailDeliveryState' = 'provider_confirmed'
      and request_metadata ->> 'gmailConfirmedMessageId'
        = delivery_request ->> 'gmailMessageId'
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action = 'mark_sent' and not (
      selected_email.status = 'queued'
      and selected_email.sync_status = 'syncing'
      and selected_email.gmail_message_id is not null
      and request_expected_gmail_message_id = selected_email.gmail_message_id
      and request_metadata ->> 'gmailDeliveryState' = 'provider_confirmed'
      and request_metadata ->> 'gmailConfirmedMessageId'
        = selected_email.gmail_message_id
      and nullif(delivery_request ->> 'sentAt', '') is not null
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action = 'finalize_delivery' and not (
      selected_email.status in ('queued', 'sent')
      and selected_email.gmail_message_id is not null
      and request_expected_gmail_message_id = selected_email.gmail_message_id
      and request_metadata ->> 'gmailDeliveryState' = 'provider_confirmed'
      and request_metadata ->> 'gmailConfirmedMessageId'
        = selected_email.gmail_message_id
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  elsif request_action = 'reconcile_delivery' and not (
      selected_email.status = 'sent'
      and selected_email.sync_status = 'sent'
      and selected_email.gmail_message_id is not null
      and request_expected_gmail_message_id = selected_email.gmail_message_id
    ) then
    return jsonb_build_object('ok', false, 'status', 'conflict');
  end if;

  perform public.wtos_begin_native_proposal_rpc_guard(
    'proposal_signature_email_delivery_' || request_action,
    request_operation_key
  );
  update public.email_messages
  set
    status = case
      when request_action in (
        'mark_prepare_failed',
        'mark_provider_failed',
        'cancel_unsent',
        'abandon_unknown'
      ) then 'failed'
      when request_action = 'mark_sent' then 'sent'
      when request_action = 'recover_pre_send' then 'queued'
      else status
    end,
    sync_status = case
      when request_action in (
        'mark_prepare_failed',
        'mark_provider_failed',
        'cancel_unsent',
        'abandon_unknown'
      ) then 'failed'
      when request_action = 'mark_sent' then 'sent'
      when request_action = 'recover_pre_send' then 'queued'
      when request_action = 'claim_send' then 'syncing'
      else sync_status
    end,
    from_email = case
      when request_action = 'claim_send'
        then lower(delivery_request ->> 'fromEmail')
      else from_email
    end,
    provider_account_id = case
      when request_action = 'claim_send'
        then nullif(delivery_request ->> 'providerAccountId', '')
      when request_action = 'recover_pre_send' then null
      else provider_account_id
    end,
    provider_payload_hash = case
      when request_action = 'claim_send'
        then lower(delivery_request ->> 'providerPayloadHash')
      when request_action = 'recover_pre_send' then null
      else provider_payload_hash
    end,
    gmail_message_id = case
      when request_action = 'checkpoint_provider'
        then delivery_request ->> 'gmailMessageId'
      else gmail_message_id
    end,
    gmail_thread_id = case
      when request_action = 'checkpoint_provider'
        then nullif(delivery_request ->> 'gmailThreadId', '')
      else gmail_thread_id
    end,
    sent_at = case
      when request_action = 'mark_sent'
        then (delivery_request ->> 'sentAt')::timestamptz
      else sent_at
    end,
    last_error = case
      when delivery_request ? 'lastError'
        then nullif(delivery_request ->> 'lastError', '')
      else last_error
    end,
    metadata = request_metadata
  where id = selected_email.id
  returning * into updated_email;
  perform public.wtos_end_native_proposal_rpc_guard(request_operation_key);

  return jsonb_build_object(
    'ok', true,
    'status', request_action,
    'emailMessageId', updated_email.id,
    'emailStatus', updated_email.status,
    'syncStatus', updated_email.sync_status,
    'emailMessage', to_jsonb(updated_email)
  );
end;
$$;

revoke all on function public.wtos_transition_proposal_signature_email(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_transition_proposal_signature_email(jsonb)
to service_role;

create or replace function public.wtos_cleanup_synthetic_proposal_fixture(
  cleanup_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key uuid := nullif(cleanup_request ->> 'operationKey', '')::uuid;
  request_regression_owner_user_id uuid := nullif(cleanup_request ->> 'regressionOwnerUserId', '')::uuid;
  request_company_id uuid := nullif(cleanup_request ->> 'companyId', '')::uuid;
  request_marker text := nullif(cleanup_request ->> 'marker', '');
  request_revision_id uuid := nullif(cleanup_request ->> 'proposalRevisionId', '')::uuid;
  request_acceptance_ids uuid[] := '{}';
  request_signing_request_ids uuid[] := '{}';
  request_signature_ids uuid[] := '{}';
  request_document_ids uuid[] := '{}';
  request_email_message_ids uuid[] := '{}';
  request_invoice_ids uuid[] := '{}';
  request_job_ids uuid[] := '{}';
  actual_acceptance_ids uuid[] := '{}';
  actual_signing_request_ids uuid[] := '{}';
  actual_signature_ids uuid[] := '{}';
  actual_document_ids uuid[] := '{}';
  actual_email_message_ids uuid[] := '{}';
  actual_invoice_ids uuid[] := '{}';
  actual_job_ids uuid[] := '{}';
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_owner record;
  storage_residue_count integer := 0;
  final_residue_count integer := 0;
  deleted_jobs integer := 0;
  deleted_payments integer := 0;
  deleted_invoice_line_items integer := 0;
  deleted_invoices integer := 0;
  deleted_receipts integer := 0;
  deleted_audit_events integer := 0;
  cleared_consumed_request_bindings integer := 0;
  deleted_acceptances integer := 0;
  deleted_sessions integer := 0;
  deleted_requests integer := 0;
  deleted_signatures integer := 0;
  deleted_emails integer := 0;
  deleted_documents integer := 0;
  deleted_schedules integer := 0;
  deleted_sections integer := 0;
  deleted_options integer := 0;
  deleted_revisions integer := 0;
begin
  if cleanup_request is null or jsonb_typeof(cleanup_request) <> 'object'
    or request_operation_key is null
    or request_regression_owner_user_id is null
    or request_company_id is null
    or request_marker is null
    or request_revision_id is null
    or jsonb_typeof(coalesce(cleanup_request -> 'acceptanceIds', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(cleanup_request -> 'signingRequestIds', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(cleanup_request -> 'signatureIds', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(cleanup_request -> 'documentIds', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(cleanup_request -> 'emailMessageIds', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(cleanup_request -> 'invoiceIds', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(cleanup_request -> 'jobIds', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Exact synthetic proposal cleanup identity and graph arrays are required.';
  end if;

  if request_marker !~ '^TEST WTOS LEAD ACCOUNTABILITY REGRESSION:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and request_marker !~ '^TEST WTOS PROPOSAL SIGNING ([0-9]{17}|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$' then
    raise exception using errcode = 'P0001', message = 'Synthetic proposal cleanup marker is not an approved exact regression marker.';
  end if;

  select
    user_record.id,
    user_record.email,
    user_record.raw_app_meta_data
  into selected_owner
  from auth.users as user_record
  where user_record.id = request_regression_owner_user_id;

  if selected_owner.id is null
    or lower(selected_owner.email) !~ '^weathertech-os-regression[^@]*@example[.]test$'
    or selected_owner.raw_app_meta_data ->> 'wt_os_regression_marker' <> 'weathertech-os-regression-owner-v1'
    or selected_owner.raw_app_meta_data ->> 'wt_os_regression_project_ref' <> 'hygtnhmmaoboduqghhwg'
    or not exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = selected_owner.id
        and membership.company_id = request_company_id
        and membership.role = 'owner'
    ) then
    raise exception using errcode = 'P0001', message = 'Only the exact approved isolated regression owner can clean a synthetic proposal fixture.';
  end if;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_acceptance_ids
  from jsonb_array_elements_text(coalesce(cleanup_request -> 'acceptanceIds', '[]'::jsonb));
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_signing_request_ids
  from jsonb_array_elements_text(coalesce(cleanup_request -> 'signingRequestIds', '[]'::jsonb));
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_signature_ids
  from jsonb_array_elements_text(coalesce(cleanup_request -> 'signatureIds', '[]'::jsonb));
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_document_ids
  from jsonb_array_elements_text(coalesce(cleanup_request -> 'documentIds', '[]'::jsonb));
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_email_message_ids
  from jsonb_array_elements_text(coalesce(cleanup_request -> 'emailMessageIds', '[]'::jsonb));
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_invoice_ids
  from jsonb_array_elements_text(coalesce(cleanup_request -> 'invoiceIds', '[]'::jsonb));
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_job_ids
  from jsonb_array_elements_text(coalesce(cleanup_request -> 'jobIds', '[]'::jsonb));

  if cardinality(request_acceptance_ids) <> (select count(distinct ids.id) from unnest(request_acceptance_ids) as ids(id))
    or cardinality(request_signing_request_ids) <> (select count(distinct ids.id) from unnest(request_signing_request_ids) as ids(id))
    or cardinality(request_signature_ids) <> (select count(distinct ids.id) from unnest(request_signature_ids) as ids(id))
    or cardinality(request_document_ids) <> (select count(distinct ids.id) from unnest(request_document_ids) as ids(id))
    or cardinality(request_email_message_ids) <> (select count(distinct ids.id) from unnest(request_email_message_ids) as ids(id))
    or cardinality(request_invoice_ids) <> (select count(distinct ids.id) from unnest(request_invoice_ids) as ids(id))
    or cardinality(request_job_ids) <> (select count(distinct ids.id) from unnest(request_job_ids) as ids(id)) then
    raise exception using errcode = 'P0001', message = 'Synthetic proposal cleanup graph IDs cannot contain duplicates.';
  end if;

  select revision.* into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = request_revision_id
    and revision.company_id = request_company_id
  for update;

  if selected_revision.id is null
    or not (
      (
        selected_revision.source_snapshot ->> 'test_marker' = request_marker
        and selected_revision.title like request_marker || '%'
      )
      or (
        selected_revision.finalization_operation_key is not null
        and selected_revision.title like request_marker || '%'
        and selected_revision.customer_snapshot #>> '{customer,name}' like request_marker || '%'
      )
    ) then
    raise exception using errcode = 'P0001', message = 'Proposal revision is not the exact marked synthetic regression fixture.';
  end if;

  select coalesce(array_agg(acceptance.id order by acceptance.id), '{}')
  into actual_acceptance_ids
  from public.estimate_proposal_acceptances as acceptance
  where acceptance.proposal_revision_id = selected_revision.id;

  select coalesce(array_agg(signing_request.id order by signing_request.id), '{}')
  into actual_signing_request_ids
  from public.proposal_signing_requests as signing_request
  where signing_request.proposal_revision_id = selected_revision.id;

  select coalesce(array_agg(signature.id order by signature.id), '{}')
  into actual_signature_ids
  from public.signatures as signature
  where signature.proposal_revision_id = selected_revision.id;

  select coalesce(array_agg(document.id order by document.id), '{}')
  into actual_document_ids
  from public.documents as document
  where document.proposal_revision_id = selected_revision.id;

  select coalesce(array_agg(email.id order by email.id), '{}')
  into actual_email_message_ids
  from public.email_messages as email
  where email.id in (
      select signing_request.delivery_email_message_id
      from public.proposal_signing_requests as signing_request
      where signing_request.proposal_revision_id = selected_revision.id
        and signing_request.delivery_email_message_id is not null
    )
     or (
       email.metadata ->> 'proposalRevisionId' = selected_revision.id::text
       and email.metadata ->> 'draftType' = 'proposal_signature_request'
     );

  select coalesce(array_agg(invoice.id order by invoice.id), '{}')
  into actual_invoice_ids
  from public.invoices as invoice
  where invoice.proposal_revision_id = selected_revision.id;

  select coalesce(array_agg(job.id order by job.id), '{}')
  into actual_job_ids
  from public.jobs as job
  where job.proposal_revision_id = selected_revision.id;

  if actual_acceptance_ids is distinct from request_acceptance_ids
    or actual_signing_request_ids is distinct from request_signing_request_ids
    or actual_signature_ids is distinct from request_signature_ids
    or actual_document_ids is distinct from request_document_ids
    or actual_email_message_ids is distinct from request_email_message_ids
    or actual_invoice_ids is distinct from request_invoice_ids
    or actual_job_ids is distinct from request_job_ids then
    raise exception using errcode = 'P0001', message = 'Synthetic proposal cleanup refused an incomplete or overbroad exact graph.';
  end if;

  if exists (
    select 1
    from public.estimate_proposal_acceptances as acceptance
    where acceptance.id = any(request_acceptance_ids)
      and not (
        (
          acceptance.acceptance_method = 'internal_recorded'
          and acceptance.audit_metadata ->> 'test_marker' = request_marker
        )
        or (
          acceptance.acceptance_method = 'native_electronic'
          and acceptance.signing_request_id = any(request_signing_request_ids)
        )
      )
  )
    or exists (
      select 1
      from public.signatures as signature
      where signature.id = any(request_signature_ids)
        and (
          signature.proposal_revision_id <> selected_revision.id
          or lower(coalesce(signature.signer_email, '')) not like '%@example.test'
        )
    )
    or exists (
      select 1
      from public.email_messages as email
      where email.id = any(request_email_message_ids)
        and (
          email.company_id <> request_company_id
          or lower(email.to_email) not like '%@example.test'
          or email.metadata ->> 'proposalRevisionId' <> selected_revision.id::text
        )
    ) then
    raise exception using errcode = 'P0001', message = 'Synthetic proposal cleanup graph contains unmarked acceptance, signature, or email evidence.';
  end if;

  select count(*) into storage_residue_count
  from storage.objects as object
  join public.documents as document
    on document.storage_bucket = object.bucket_id
   and document.storage_path = object.name
  where document.id = any(request_document_ids);

  if storage_residue_count <> 0 then
    raise exception using errcode = 'P0001', message = 'Synthetic proposal Storage bytes must be removed and verified absent before metadata cleanup.';
  end if;

  insert into public.proposal_synthetic_cleanup_guards (
    backend_pid,
    transaction_id,
    operation_key
  )
  values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    request_operation_key
  );
  perform pg_catalog.set_config(
    'wtos.synthetic_proposal_cleanup_operation',
    request_operation_key::text,
    true
  );

  -- Break only the synthetic request/session cycle while the finalized
  -- document and signature graph still satisfies request scope validation.
  update public.proposal_signing_requests
  set
    request_token_consumed_at = null,
    request_token_consumed_session_id = null
  where id = any(request_signing_request_ids)
    and request_token_consumed_at is not null
    and request_token_consumed_session_id is not null;
  get diagnostics cleared_consumed_request_bindings = row_count;

  delete from public.jobs where id = any(request_job_ids);
  get diagnostics deleted_jobs = row_count;

  delete from public.payments where invoice_id = any(request_invoice_ids);
  get diagnostics deleted_payments = row_count;
  delete from public.invoice_line_items where invoice_id = any(request_invoice_ids);
  get diagnostics deleted_invoice_line_items = row_count;
  update public.proposal_payment_schedules
  set invoice_id = null, status = 'pending', due_date = null
  where proposal_revision_id = selected_revision.id
    and invoice_id = any(request_invoice_ids);
  delete from public.invoices where id = any(request_invoice_ids);
  get diagnostics deleted_invoices = row_count;

  delete from public.proposal_signature_receipts
  where proposal_revision_id = selected_revision.id;
  get diagnostics deleted_receipts = row_count;
  delete from public.proposal_audit_events
  where proposal_revision_id = selected_revision.id;
  get diagnostics deleted_audit_events = row_count;

  update public.estimate_proposal_revisions
  set
    finalized_document_id = null,
    accepted_signature_id = null,
    accepted_acceptance_id = null,
    signed_document_id = null
  where id = selected_revision.id;
  update public.signatures
  set acceptance_id = null, signed_document_id = null
  where id = any(request_signature_ids);

  delete from public.estimate_proposal_acceptances
  where id = any(request_acceptance_ids);
  get diagnostics deleted_acceptances = row_count;
  delete from public.proposal_signing_sessions
  where signing_request_id = any(request_signing_request_ids);
  get diagnostics deleted_sessions = row_count;
  delete from public.proposal_signing_requests
  where id = any(request_signing_request_ids);
  get diagnostics deleted_requests = row_count;
  delete from public.signatures where id = any(request_signature_ids);
  get diagnostics deleted_signatures = row_count;
  delete from public.email_messages where id = any(request_email_message_ids);
  get diagnostics deleted_emails = row_count;
  delete from public.documents where id = any(request_document_ids);
  get diagnostics deleted_documents = row_count;
  delete from public.proposal_payment_schedules
  where proposal_revision_id = selected_revision.id;
  get diagnostics deleted_schedules = row_count;
  delete from public.estimate_proposal_sections
  where proposal_revision_id = selected_revision.id;
  get diagnostics deleted_sections = row_count;
  delete from public.estimate_proposal_options
  where proposal_revision_id = selected_revision.id;
  get diagnostics deleted_options = row_count;
  delete from public.estimate_proposal_revisions
  where id = selected_revision.id;
  get diagnostics deleted_revisions = row_count;

  select
    (select count(*) from public.estimate_proposal_revisions where id = request_revision_id)
    + (select count(*) from public.estimate_proposal_acceptances where id = any(request_acceptance_ids))
    + (select count(*) from public.proposal_signing_requests where id = any(request_signing_request_ids))
    + (select count(*) from public.proposal_signing_sessions where signing_request_id = any(request_signing_request_ids))
    + (select count(*) from public.signatures where id = any(request_signature_ids))
    + (select count(*) from public.documents where id = any(request_document_ids))
    + (select count(*) from public.email_messages where id = any(request_email_message_ids))
    + (select count(*) from public.proposal_signature_receipts where proposal_revision_id = request_revision_id)
    + (select count(*) from public.proposal_audit_events where proposal_revision_id = request_revision_id)
    + (select count(*) from public.payments where invoice_id = any(request_invoice_ids))
    + (select count(*) from public.invoice_line_items where invoice_id = any(request_invoice_ids))
    + (select count(*) from public.invoices where id = any(request_invoice_ids))
    + (select count(*) from public.jobs where id = any(request_job_ids))
    + (select count(*) from public.proposal_payment_schedules where proposal_revision_id = request_revision_id)
    + (select count(*) from public.estimate_proposal_sections where proposal_revision_id = request_revision_id)
    + (select count(*) from public.estimate_proposal_options where proposal_revision_id = request_revision_id)
  into final_residue_count;

  if final_residue_count <> 0 then
    raise exception using errcode = 'P0001', message = 'Synthetic proposal cleanup did not reach zero exact database residue.';
  end if;

  delete from public.proposal_synthetic_cleanup_guards
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.txid_current()
    and operation_key = request_operation_key;
  perform pg_catalog.set_config('wtos.synthetic_proposal_cleanup_operation', '', true);

  return jsonb_build_object(
    'ok', true,
    'status', 'cleaned',
    'marker', request_marker,
    'proposalRevisionId', request_revision_id,
    'counts', jsonb_build_object(
      'jobs', deleted_jobs,
      'payments', deleted_payments,
      'invoiceLineItems', deleted_invoice_line_items,
      'invoices', deleted_invoices,
      'receipts', deleted_receipts,
      'auditEvents', deleted_audit_events,
      'consumedRequestBindingsCleared', cleared_consumed_request_bindings,
      'acceptances', deleted_acceptances,
      'sessions', deleted_sessions,
      'requests', deleted_requests,
      'signatures', deleted_signatures,
      'emailMessages', deleted_emails,
      'documents', deleted_documents,
      'paymentSchedules', deleted_schedules,
      'sections', deleted_sections,
      'options', deleted_options,
      'revisions', deleted_revisions
    ),
    'storageResidueCount', storage_residue_count,
    'databaseResidueCount', final_residue_count
  );
end;
$$;

revoke all on function public.wtos_cleanup_synthetic_proposal_fixture(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_cleanup_synthetic_proposal_fixture(jsonb)
to service_role;

commit;
